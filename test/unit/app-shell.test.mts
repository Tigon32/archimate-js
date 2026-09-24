/** @vitest-environment jsdom */
// SYNTHETIC: Checks public app-owned tokens and the repository read-only example.
import { expect, it } from 'vitest';
import app from '../../assets/design-tokens/app.tokens.json' with { type: 'json' };
// @ts-expect-error Node types are not a dependency of this browser package.
import { readFileSync } from 'node:fs';

const css = readFileSync('assets/design-tokens/app.generated.css', 'utf8');
const controls = readFileSync('assets/design-tokens/app-shell.css', 'utf8');
const legacy = readFileSync('assets/archimate-js.css', 'utf8');
const paletteIcons = readFileSync('assets/palette-icons.css', 'utf8');
const hex = (theme: 'light' | 'dark', name: keyof typeof app.theme.light) =>
  app.theme[theme][name].$value.hex;

function contrast(first: string, second: string): number {
  const lightness = (color: string) => {
    const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const values = [lightness(first), lightness(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

it('generates only scoped app tokens and component selectors with packaged fonts', () => {
  expect(css).toContain('--am-ui-font-family: "IBM Plex", Arial, sans-serif;');
  expect(css).toContain('.am-app[data-theme="dark"]');
  expect(controls).toContain('@import url("./app.generated.css")');
  expect(controls).toContain('.am-app .am-ui-button:focus-visible');
  expect(controls).toContain('.am-app .am-ui-button:disabled');
  expect(controls).toContain('.am-app .am-ui-field[aria-invalid="true"]');
  expect(controls).toContain('.am-app .am-ui-status[data-state="error"]');
  expect(controls).toContain('../ibm-plex-font/IBMPlexSans-Regular.ttf');
  expect(readFileSync('assets/ibm-plex-font/IBMPlexSans-Regular.ttf').byteLength).toBeGreaterThan(1000);
  expect(css + controls).not.toMatch(/:root|\.am-diagram|\.am-shape|--am-(?!ui-)/);
  expect(controls).not.toMatch(/https?:\/\/|(^|\})\s*(?:button|input|ul|a)\s*[{,:]/m);
  const example = readFileSync('examples/read-only/index.html', 'utf8');
  const script = readFileSync('examples/read-only/viewer.js', 'utf8');
  expect(example).toContain('assets/design-tokens/app-shell.css');
  expect(example).toContain('class="am-app"');
  expect(example).toContain('class="am-ui-status"');
  expect(script).toContain("status.dataset.state = 'success'");
  expect(script).toContain("status.dataset.state = 'error'");
});

it('keeps light and dark variables inside the app root, separate from SVG notation', () => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  const appRoot = document.createElement('main');
  appRoot.className = 'am-app';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('am-diagram');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  shape.setAttribute('fill', '#B0D0D9');
  svg.append(shape);
  appRoot.append(svg);
  document.body.append(appRoot);
  expect(getComputedStyle(document.body).getPropertyValue('--am-ui-surface')).toBe('');
  expect(getComputedStyle(appRoot).getPropertyValue('--am-ui-surface').trim()).toBe('#ffffff');
  appRoot.dataset.theme = 'dark';
  expect(getComputedStyle(appRoot).getPropertyValue('--am-ui-surface').trim()).toBe('#1e1f22');
  expect(shape.getAttribute('fill')).toBe('#B0D0D9');
  appRoot.remove();
  style.remove();
});

it('keeps the legacy palette and dialog styles local and scoped', () => {
  expect(legacy).toContain('@import url("./design-tokens/app-shell.css")');
  expect(legacy + paletteIcons).not.toMatch(/https?:\/\/|Quicksand/);
  expect(legacy).toContain('.am-app .djs-palette');
  expect(controls).toContain('.am-app .djs-palette .entry:focus-visible');
  expect(controls).toContain('.am-app .am-ui-dialog');
  expect(controls).toContain('.am-app .am-ui-inspector');
  for (const stylesheet of [legacy, paletteIcons]) {
    const withoutComments = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = withoutComments.split('}').slice(0, -1);
    for (const rule of rules) {
      const selector = rule.split('{')[0].trim();
      if (selector.startsWith('@import') || selector.startsWith('@font-face')) continue;
      expect(selector.split(',').every((part: string) => part.trim().startsWith('.am-app '))).toBe(true);
    }
  }
  expect(readFileSync('assets/font-awesome-5/29f589f173dcc69ef6c805b711894998.woff2').byteLength)
    .toBeGreaterThan(1000);
});

it('meets text and interactive contrast targets for both themes', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const [foreground, background] of [
      ['text', 'surface'], ['textMuted', 'surface'], ['actionText', 'action'],
      ['actionText', 'actionHover'], ['disabledText', 'disabledSurface']
    ] as const) expect(contrast(hex(theme, foreground), hex(theme, background))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(theme, 'focus'), hex(theme, 'surface'))).toBeGreaterThanOrEqual(3);
    expect(contrast(hex(theme, 'border'), hex(theme, 'surface'))).toBeGreaterThanOrEqual(3);
  }
});
