// SYNTHETIC: Contrast ratios for app-owned semantic color pairs; rendered browser review remains necessary.
import { describe, expect, it } from 'vitest';
import app from '../../assets/design-tokens/app.tokens.json' with { type: 'json' };
// @ts-expect-error Node types are not a dependency of this browser package.
import { readFileSync } from 'node:fs';

type ColorToken = { $value: { hex: string } };
type Mode = Record<string, ColorToken>;
const modes = app.theme as Record<string, Mode>;

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: ColorToken, b: ColorToken) {
  const [dark, light] = [luminance(a.$value.hex), luminance(b.$value.hex)].sort((x, y) => x - y);
  return (light + 0.05) / (dark + 0.05);
}

const textPairs = [
  ['text', 'surface'], ['text', 'surfaceRaised'], ['textMuted', 'surfaceRaised'],
  ['actionText', 'action'], ['actionText', 'actionHover'], ['selectedText', 'selectedSurface'],
  ['text', 'hoverSurface'], ['text', 'pressedSurface'], ['text', 'invalidSurface'],
  ['overlayText', 'overlaySurface'], ['link', 'surface'], ['error', 'surfaceRaised'],
  ['success', 'surfaceRaised'], ['warning', 'surfaceRaised']
];
const objectPairs = [
  ['icon', 'surfaceRaised'], ['border', 'surfaceRaised'], ['border', 'surface'],
  ['focus', 'surfaceRaised'], ['focus', 'surface']
];

describe('app theme color pair contrast', () => {
  it('provides AA text/object contrast in all modes and AAA normal text targets in high contrast modes', () => {
    expect(Object.keys(modes)).toEqual(['light', 'dark', 'highContrastLight', 'highContrastDark']);
    for (const [name, mode] of Object.entries(modes)) {
      const minimumText = name.startsWith('highContrast') ? 7 : 4.5;
      for (const [foreground, background] of textPairs) {
        expect(contrast(mode[foreground], mode[background]), `${name}: ${foreground}/${background}`)
          .toBeGreaterThanOrEqual(minimumText);
      }
      for (const [foreground, background] of objectPairs) {
        expect(contrast(mode[foreground], mode[background]), `${name}: ${foreground}/${background}`)
          .toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('generates scoped color schemes and explicit high contrast selectors without recoloring notation', () => {
    const css = readFileSync('assets/design-tokens/app.generated.css', 'utf8');
    for (const [selector, scheme] of [
      ['.am-app, .am-app[data-theme="light"]', 'light'],
      ['.am-app[data-theme="dark"]', 'dark'],
      ['.am-app[data-theme="high-contrast-light"]', 'light'],
      ['.am-app[data-theme="high-contrast-dark"]', 'dark']
    ]) {
      expect(css).toContain(`${selector} {\n  color-scheme: ${scheme};`);
    }
    expect(css).not.toContain(':root');
    expect(css).not.toContain('--am-application');
    const shell = readFileSync('assets/design-tokens/app-shell.css', 'utf8');
    expect(shell).toContain('@media (forced-colors: active)');
    expect(shell).toContain('@media (prefers-reduced-motion: reduce)');
    expect(shell).not.toContain('forced-color-adjust: none');
  });
});
