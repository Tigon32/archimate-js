import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { exportView } from '../dist/export/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = 'test/fixtures/synthetic/read-only-showcase.xml';
const viewId = 'view-synthetic-showcase';
const outputDirectory = 'docs/assets/readme';
const checkMode = process.argv.includes('--check');

type Asset = {
  readonly path: string;
  readonly content: string;
};

type Bounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

function svgBounds(svg: string): Bounds {
  const rootAttributes = svg.match(/^<svg\b([^>]*)>/)?.[1] ?? '';
  const values = rootAttributes.match(/\bviewBox="([^"]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('README screenshot SVG is missing a valid viewBox');
  }
  return { x: values[0], y: values[1], width: values[2], height: values[3] };
}

function requireToken(css: string, theme: string, token: string): string {
  const block = css.match(new RegExp(`\\.am-app\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  const value = block?.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1]?.trim();
  if (!value) throw new Error(`Missing ${token} for ${theme}`);
  return value;
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function themedShell(svg: string, css: string): string {
  const bounds = svgBounds(svg);
  const theme = 'high-contrast-dark';
  const surface = requireToken(css, theme, '--am-ui-surface');
  const raised = requireToken(css, theme, '--am-ui-surface-raised');
  const text = requireToken(css, theme, '--am-ui-text');
  const border = requireToken(css, theme, '--am-ui-border');
  const action = requireToken(css, theme, '--am-ui-action');
  const title = 'Synthetic service delivery - high contrast dark theme';
  const width = bounds.width + 48;
  const height = bounds.height + 112;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="readme-theme-title readme-theme-desc">`,
    `<title id="readme-theme-title">${escapeText(title)}</title>`,
    '<desc id="readme-theme-desc">Synthetic ArchiMate service-delivery fixture rendered inside a high contrast dark app shell frame.</desc>',
    `<rect width="100%" height="100%" fill="${surface}"/>`,
    `<rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="8" fill="${raised}" stroke="${border}"/>`,
    `<text x="32" y="48" fill="${text}" font-family="Arial, sans-serif" font-size="18" font-weight="700">${escapeText(title)}</text>`,
    `<rect x="32" y="62" width="128" height="28" rx="4" fill="${action}"/>`,
    `<text x="48" y="82" fill="${surface}" font-family="Arial, sans-serif" font-size="13" font-weight="700">Theme preview</text>`,
    `<g transform="translate(24 88)">${svg}</g>`,
    '</svg>',
    ''
  ].join('\n');
}

async function generatedAssets(): Promise<readonly Asset[]> {
  const xml = await readFile(path.join(root, fixturePath), 'utf8');
  const result = await exportView({ xml, viewId, formats: ['svg'], background: 'white', padding: 16 });
  const svgArtifact = result.artifacts.find((artifact) => artifact.format === 'svg');
  if (!svgArtifact) throw new Error('README screenshot export did not return an SVG artifact');
  const viewerSvg = String(svgArtifact.bytes);
  const css = await readFile(path.join(root, 'assets/design-tokens/app.generated.css'), 'utf8');
  return [
    { path: path.join(outputDirectory, 'viewer.svg'), content: viewerSvg },
    { path: path.join(outputDirectory, 'viewer-high-contrast-dark.svg'), content: themedShell(viewerSvg, css) }
  ];
}

async function checkAsset(asset: Asset): Promise<boolean> {
  try {
    const current = await readFile(path.join(root, asset.path), 'utf8');
    return current === asset.content;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const assets = await generatedAssets();
  if (checkMode) {
    const drifted = [];
    for (const asset of assets) if (!await checkAsset(asset)) drifted.push(asset.path);
    if (drifted.length) {
      throw new Error(`README screenshots are stale: ${drifted.join(', ')}`);
    }
    console.log('README screenshots are up to date.');
    return;
  }
  await mkdir(path.join(root, outputDirectory), { recursive: true });
  for (const asset of assets) await writeFile(path.join(root, asset.path), asset.content);
  console.log(`Generated ${assets.length} README SVG screenshot asset(s).`);
}

await main();
