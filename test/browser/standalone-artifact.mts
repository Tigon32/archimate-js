// SYNTHETIC: Builds and serves the packaged standalone read-only artifact for offline checks.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPackedFiles } from '../../scripts/check-packed-assets.mts';

export const PACKAGE_PREFIX = '/package/';
export const MODEL_PATH = '/model/standalone-view.xml';
export const REDIRECT_PROBE_PATH = '/probe/redirect';
export const MISSING_PROBE_PATH = '/package/assets/design-tokens/missing-standalone-probe.css';
export const EXTERNAL_PROBE_URL = 'https://standalone-offline-probe.invalid/probe.css';

/** Packaged resources the standalone artifact must resolve from the package itself. */
export const REQUIRED_PACKAGE_RESOURCES = [
  'dist/browser/archimate-js.js',
  'assets/design-tokens/app-shell.css',
  'assets/design-tokens/app.generated.css',
  'assets/ibm-plex-font/IBMPlexSans-Regular.ttf',
  'assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf',
  'archimate-font/lib/css/archimate-font.css',
  'archimate-font/lib/font/archimate-font.woff2'
] as const;

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MODEL_FIXTURE = 'test/fixtures/synthetic/minimal-application-view.xml';
export const MODEL_VIEW_ID = 'view-synthetic-minimal';

const CONTENT_TYPES = new Map<string, string>([
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.eot', 'application/vnd.ms-fontobject'],
  ['.xml', 'application/xml; charset=utf-8']
]);

/**
 * Packs the repository through the published distribution path and returns the
 * packed files. Only the packed archive is used, so the gate cannot pass by
 * reading an unpublished development file.
 */
export function packDistribution(destination: string): Map<string, Buffer> {
  const result = spawnSync('npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', destination],
    { cwd: ROOT, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error('Standalone artifact gate could not pack the distribution.');
  }
  const parsed = JSON.parse(result.stdout) as Array<{ filename: string }>;
  const archive = path.join(destination, parsed[0].filename);
  const files = readPackedFiles(readFileSync(archive));
  const missing = REQUIRED_PACKAGE_RESOURCES.filter((name) => !files.has(name));
  if (missing.length) {
    throw new Error(`Packed distribution is missing required resources: ${missing.join(', ')}. ` +
      'Run the compile steps before this gate.');
  }
  return files;
}

/** Inline bootstrap that loads the local model and mounts the packaged viewer. */
function bootScript(): string {
  return `
const status = document.querySelector('#status');
try {
  const response = await fetch('${MODEL_PATH}');
  if (!response.ok) throw new Error('model-unavailable');
  await window.ArchimateJS.mountViewer({
    xml: await response.text(),
    viewId: '${MODEL_VIEW_ID}',
    container: document.querySelector('#diagram'),
    width: '900px',
    height: '420px'
  });
  await Promise.all([
    document.fonts.load('400 16px "IBM Plex"'),
    document.fonts.load('600 16px "IBM Plex"'),
    document.fonts.load('normal 16px "archimate-font"')
  ]);
  status.dataset.state = 'success';
  status.textContent = 'Rendered the packaged standalone view.';
} catch {
  status.dataset.state = 'error';
  status.textContent = 'Could not render the packaged standalone view.';
}
`;
}

/**
 * Renders the standalone artifact page. Every stylesheet, font, script, and
 * model URL is a documented local path; no remote origin is referenced.
 */
export function standalonePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>archimate-js packaged standalone read-only artifact</title>
<link rel="stylesheet" href="${PACKAGE_PREFIX}assets/design-tokens/app-shell.css">
<link rel="stylesheet" href="${PACKAGE_PREFIX}archimate-font/lib/css/archimate-font.css">
<style>
body { margin: 0; font-family: "IBM Plex", system-ui, sans-serif; }
#diagram { width: 900px; height: 420px; pointer-events: none; }
</style>
</head>
<body>
<main class="am-app">
<h1>Packaged standalone read-only artifact</h1>
<p id="status" class="am-ui-status" role="status" aria-live="polite" data-state="loading">Loading…</p>
<div id="diagram" aria-label="Synthetic minimal ArchiMate view"></div>
</main>
<script src="${PACKAGE_PREFIX}dist/browser/archimate-js.js"></script>
<script type="module">${bootScript()}</script>
</body>
</html>
`;
}

function send(response: {
  setHeader(name: string, value: string): void;
  writeHead(status: number, headers?: Record<string, string>): { end(body?: string | Uint8Array): void };
}, status: number, type: string, body: string | Uint8Array): void {
  response.writeHead(status, { 'content-type': type }).end(body);
}

/**
 * Serves only the packed package files, the synthetic model, and two probe
 * routes used to prove that the gate detects missing assets and redirects.
 */
export function createArtifactServer(files: Map<string, Buffer>, model: string): Server {
  return createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/') return send(response, 200, 'text/html; charset=utf-8', standalonePage());
    if (url.pathname === MODEL_PATH) return send(response, 200, CONTENT_TYPES.get('.xml') ?? '', model);
    if (url.pathname === REDIRECT_PROBE_PATH) {
      return void response.writeHead(302, { location: EXTERNAL_PROBE_URL }).end();
    }
    if (!url.pathname.startsWith(PACKAGE_PREFIX)) return void response.writeHead(404).end();
    const name = decodeURIComponent(url.pathname.slice(PACKAGE_PREFIX.length));
    const content = files.get(name);
    if (!content) return void response.writeHead(404).end();
    send(response, 200, CONTENT_TYPES.get(path.extname(name)) ?? 'application/octet-stream', content);
  });
}

export function readModelFixture(): string {
  return readFileSync(path.join(ROOT, MODEL_FIXTURE), 'utf8');
}
