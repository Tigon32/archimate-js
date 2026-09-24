import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const kit = new URL('../assets/archimate-4-kit/', import.meta.url);
const appRoot = new URL('../assets/design-tokens/', import.meta.url);
const hashes = {
  'tokens/tokens.json': 'e46901ad4ad1fe0aa28f47d385c68cb5beb4483cede3fee1feb3dec314bd67f2',
  'css/archimate.css': '7fe68f6ebfada19fb3409d1c73e2a4270973e9465e75f622fc9aa2c3e74e5a84',
  'svg/archimate-symbols.svg': '215d00454e0b32475ce889c47cbeb3fff947d1766de152e9a97a5a5664ab5dab'
};
const sources = {};
for (const [path, expected] of Object.entries(hashes)) {
  const content = await readFile(new URL(path, kit), 'utf8');
  if (createHash('sha256').update(content).digest('hex') !== expected) {
    throw new Error(`Supplied ArchiMate kit changed: ${path}`);
  }
  sources[path] = content;
}

const source = JSON.parse(sources['tokens/tokens.json']);
const app = JSON.parse(await readFile(new URL('app.tokens.json', appRoot), 'utf8'));
const color = (hex) => ({ $type: 'color', $value: {
  colorSpace: 'srgb', components: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
  hex: hex.toLowerCase()
} });
const dimension = (value) => ({ $type: 'dimension', $value: { value, unit: 'px' } });
const number = (value) => ({ $type: 'number', $value: value });
const notation = {
  $description: 'ArchiMate notation decisions derived from the unchanged supplied kit.',
  $extensions: { 'org.archimatejs.notation': {
    source: 'assets/archimate-4-kit/tokens/tokens.json', sourceSha256: hashes['tokens/tokens.json'],
    rules: { corner: source.corner, linePatterns: { dotted: source.line.dotted, dashed: source.line.dashed },
      relationship: source.relationship, labelAlign: source.typography.labelAlign,
      measurements: source.measurements }
  } },
  color: {
    domain: Object.fromEntries(Object.entries(source.color.domain).map(([name, record]) =>
      [name, { fill: color(record.fill) }])),
    stroke: color(source.color.stroke),
    grouping: { fill: color(source.color.grouping.fill), stroke: color(source.color.grouping.stroke) },
    label: color(source.color.label), canvas: color(source.color.canvas)
  },
  box: Object.fromEntries(Object.entries(source.box).map(([name, value]) =>
    [name, name === 'width' || name === 'height' ? dimension(value) : number(value)])),
  line: { strokeWidth: dimension(source.line.strokeWidth) },
  typography: {
    family: { $type: 'fontFamily', $value: source.typography.family.split(',')
      .map((name) => name.trim().replace(/^['"]|['"]$/g, '')) },
    labelSizeRatioOfBoxHeight: number(source.typography.labelSizeRatioOfBoxHeight),
    maxLines: number(source.typography.maxLines)
  }
};

function validate(node, path = 'root') {
  for (const [name, value] of Object.entries(node)) {
    if (name.startsWith('$')) continue;
    const label = `${path}.${name}`;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid group: ${label}`);
    if (!('$value' in value)) { validate(value, label); continue; }
    if (!['color', 'dimension', 'number', 'fontFamily'].includes(value.$type)) throw new Error(`Invalid type: ${label}`);
    const data = value.$value;
    if (value.$type === 'color' && (data.colorSpace !== 'srgb' || data.components.length !== 3 ||
      data.components.some((component) => !Number.isFinite(component) || component < 0 || component > 1) ||
      !/^#[0-9a-f]{6}$/.test(data.hex) || data.components.some((component, index) =>
        component !== parseInt(data.hex.slice(1 + 2 * index, 3 + 2 * index), 16) / 255)))
      throw new Error(`Invalid color: ${label}`);
    if (value.$type === 'dimension' && (!Number.isFinite(data.value) || !['px', 'rem'].includes(data.unit)))
      throw new Error(`Invalid dimension: ${label}`);
    if (value.$type === 'number' && !Number.isFinite(data)) throw new Error(`Invalid number: ${label}`);
    if (value.$type === 'fontFamily' && (!Array.isArray(data) || !data.length ||
      data.some((family) => typeof family !== 'string' || !family || family.includes(','))))
      throw new Error(`Invalid font family: ${label}`);
  }
}
validate(notation);
validate(app);

const appCss = [
  '/* Generated from app.tokens.json; scoped to the application shell. */',
  ...['light', 'dark'].map((mode) => {
    const selector = mode === 'light' ? '.am-app, .am-app[data-theme="light"]' : '.am-app[data-theme="dark"]';
    return `${selector} {\n` + Object.entries(app.theme[mode]).map(([name, token]) =>
      `  --am-ui-${name}: ${token.$value.hex};`).join('\n') + '\n}';
  }),
  '.am-app {\n' + Object.entries(app.spacing).map(([name, token]) =>
    `  --am-ui-space-${name}: ${token.$value.value}${token.$value.unit};`).join('\n') + '\n}'
].join('\n') + '\n';
const js = '// Generated from assets/archimate-4-kit by scripts/build-notation-assets.mjs.\n' +
  `export const tokens = ${JSON.stringify(source)};\n` +
  `export const notationTokens = ${JSON.stringify(notation)};\n` +
  `export const css = ${JSON.stringify(sources['css/archimate.css'])};\n` +
  `export const symbols = ${JSON.stringify(sources['svg/archimate-symbols.svg'])};\n`;
const outputs = [
  [new URL('../lib/draw/notation.generated.js', import.meta.url), js],
  [new URL('notation.tokens.json', appRoot), JSON.stringify(notation, null, 2) + '\n'],
  [new URL('app.generated.css', appRoot), appCss]
];
for (const [url, content] of outputs) {
  if (process.argv.includes('--check')) {
    if (await readFile(url, 'utf8') !== content) throw new Error(`Generated token output drifted: ${fileURLToPath(url)}`);
  } else {
    await writeFile(url, content);
  }
}
console.log(process.argv.includes('--check') ? 'Design token assets verified.' : 'Design token assets generated.');
