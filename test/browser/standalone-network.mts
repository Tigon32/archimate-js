// SYNTHETIC: Offline gate for the packaged standalone read-only artifact.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  EXTERNAL_PROBE_URL, MISSING_PROBE_PATH, MODEL_PATH, PACKAGE_PREFIX, REDIRECT_PROBE_PATH,
  REQUIRED_PACKAGE_RESOURCES, createArtifactServer, packDistribution, readModelFixture
} from './standalone-artifact.mts';

interface Findings {
  requested: string[];
  offOrigin: string[];
  disallowed: string[];
  missing: string[];
  redirected: string[];
  failed: string[];
  runtimeErrors: string[];
}

interface RenderReport {
  nodeIds: string[];
  connectionIds: string[];
  notationSymbols: number;
  externalReferences: string[];
  fontsReady: boolean;
}

const findings: Findings = { requested: [], offOrigin: [], disallowed: [], missing: [],
  redirected: [], failed: [], runtimeErrors: [] };

/** Documented local paths the artifact may request; everything else is a failure. */
function isAllowedPath(pathname: string): boolean {
  return pathname === '/' || pathname === MODEL_PATH || pathname === REDIRECT_PROBE_PATH ||
    pathname.startsWith(PACKAGE_PREFIX);
}

function snapshot(): Record<keyof Findings, number> {
  return { requested: findings.requested.length, offOrigin: findings.offOrigin.length,
    disallowed: findings.disallowed.length, missing: findings.missing.length,
    redirected: findings.redirected.length, failed: findings.failed.length,
    runtimeErrors: findings.runtimeErrors.length };
}

function localPath(url: string, origin: string): string {
  return url.startsWith(origin) ? new URL(url).pathname : '<off-origin>';
}

const temp = await mkdtemp(path.join(os.tmpdir(), 'archimate-standalone-network-'));
const files = packDistribution(temp);
const server = createArtifactServer(files, readModelFixture());
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Standalone gate server did not bind a port.');
const origin = `http://127.0.0.1:${address.port}`;

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (!url.startsWith(`${origin}/`)) {
      findings.offOrigin.push(new URL(url).origin);
      await route.abort();
      return;
    }
    const pathname = new URL(url).pathname;
    if (!isAllowedPath(pathname)) {
      findings.disallowed.push(pathname);
      await route.abort();
      return;
    }
    findings.requested.push(pathname);
    await route.continue();
  });
  page.on('response', (response) => {
    const status = response.status();
    const pathname = localPath(response.url(), origin);
    if (status >= 300 && status < 400) findings.redirected.push(pathname);
    else if (status >= 400) findings.missing.push(pathname);
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.startsWith(`${origin}/`) && isAllowedPath(new URL(url).pathname)) {
      findings.failed.push(new URL(url).pathname);
    }
  });
  page.on('pageerror', () => findings.runtimeErrors.push('pageerror'));
  page.on('console', (message) => {
    if (message.type() === 'error') findings.runtimeErrors.push('console-error');
  });

  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  await page.locator('#status[data-state="success"]').waitFor();

  const report = await page.evaluate((): RenderReport => {
    const svg = document.querySelector('#diagram svg');
    const shapes = Array.from(document.querySelectorAll('#diagram .djs-shape[data-element-id]'));
    const connections = Array.from(document.querySelectorAll('#diagram .djs-connection[data-element-id]'));
    const attribute = (element: Element): string =>
      element.getAttribute('href') ?? element.getAttribute('xlink:href') ?? '';
    const references = Array.from(svg?.querySelectorAll('use, image') ?? [])
      .map(attribute).filter((value) => value !== '' && !value.startsWith('#'));
    return {
      nodeIds: shapes.map((shape) => shape.getAttribute('data-element-id') ?? '').sort(),
      connectionIds: connections.map((edge) => edge.getAttribute('data-element-id') ?? '').sort(),
      notationSymbols: svg?.querySelectorAll('defs[data-archimate-notation] symbol[id^="am-icon-"]').length ?? 0,
      externalReferences: references,
      fontsReady: document.fonts.check('400 16px "IBM Plex"') &&
        document.fonts.check('normal 16px "archimate-font"')
    };
  });

  const missingResources = REQUIRED_PACKAGE_RESOURCES
    .filter((name) => !findings.requested.includes(`${PACKAGE_PREFIX}${name}`));
  assert.deepEqual(missingResources, [],
    'the artifact must request every required packaged CSS, font, and script resource');
  assert.ok(findings.requested.includes(MODEL_PATH),
    'the artifact must load its local model/view resource');
  assert.deepEqual(findings.offOrigin, [], 'the artifact must not request any external origin');
  assert.deepEqual(findings.disallowed, [], 'the artifact must only request documented local paths');
  assert.deepEqual(findings.missing, [], 'every requested local asset must resolve');
  assert.deepEqual(findings.redirected, [], 'the artifact must not follow redirects while loading');
  assert.deepEqual(findings.failed, [], 'no allowed local request may fail');
  assert.deepEqual(findings.runtimeErrors, [], 'the artifact must load without runtime asset errors');

  assert.deepEqual(report.nodeIds,
    ['node-application-component-1', 'node-application-service-1', 'node-application-service-nested'],
    'the packaged bundle must render the synthetic view nodes');
  assert.deepEqual(report.connectionIds, ['connection-serving-relationship-1']);
  assert.ok(report.notationSymbols > 0, 'notation symbols must resolve from the packaged bundle');
  assert.deepEqual(report.externalReferences, [],
    'rendered symbols must not reference resources outside the document');
  assert.equal(report.fontsReady, true, 'packaged fonts must be available to the artifact');

  const before = snapshot();
  const probes = await page.evaluate(async (probe: { external: string; missing: string;
    redirect: string }) => {
    const attempt = async (url: string): Promise<string> => {
      try {
        const response = await fetch(url);
        return String(response.status);
      } catch {
        return 'blocked';
      }
    };
    return { external: await attempt(probe.external), missing: await attempt(probe.missing),
      redirect: await attempt(probe.redirect) };
  }, { external: EXTERNAL_PROBE_URL, missing: MISSING_PROBE_PATH, redirect: REDIRECT_PROBE_PATH });

  assert.equal(probes.external, 'blocked', 'external requests must be blocked, not silently allowed');
  assert.equal(probes.missing, '404', 'a missing packaged asset must not resolve');
  assert.equal(probes.redirect, 'blocked', 'a redirect to an unapproved origin must be blocked');
  assert.ok(findings.offOrigin.length > before.offOrigin,
    'the gate must record attempted external requests');
  assert.ok(findings.missing.length > before.missing, 'the gate must record missing packaged assets');
  assert.ok(findings.redirected.length > before.redirected,
    'the gate must record redirects to unapproved origins');
  assert.ok(findings.failed.length > before.failed,
    'a blocked redirect must surface as a failed local request');
  console.log('Packaged standalone artifact offline checks passed.');
} finally {
  await browser?.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(temp, { recursive: true, force: true });
}
