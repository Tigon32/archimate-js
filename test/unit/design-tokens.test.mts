// SYNTHETIC: Validates app-owned token structure and generated outputs only.
import { describe, expect, it } from 'vitest';
import notation from '../../assets/design-tokens/notation.tokens.json' with { type: 'json' };
import app from '../../assets/design-tokens/app.tokens.json' with { type: 'json' };
// @ts-expect-error The runtime bundle consumes a generated JavaScript module.
import { notationTokens } from '../../lib/draw/notation.generated.js';
// @ts-expect-error The runtime adapter is the documented legacy module exception.
import { notationFill, cornerRadius } from '../../lib/draw/NotationAdapter.mjs';
// @ts-expect-error Node types are not a dependency of this browser package.
import { readFileSync } from 'node:fs';

type Token =
  | { $type: 'color'; $value: { colorSpace: string; components: number[]; hex: string } }
  | { $type: 'dimension'; $value: { value: number; unit: string } }
  | { $type: 'number'; $value: number }
  | { $type: 'fontFamily'; $value: string[] };

function visit(group: Record<string, unknown>, result: Token[] = []) {
  for (const [name, value] of Object.entries(group)) {
    if (name.startsWith('$')) continue;
    expect(value).toBeTypeOf('object');
    const record = value as Record<string, unknown>;
    if ('$value' in record) result.push(record as Token);
    else visit(record, result);
  }
  return result;
}

describe('DTCG 2025.10 subset', () => {
  it('types every token and validates the declared standard value shapes', () => {
    for (const token of [...visit(notation), ...visit(app)]) {
      expect(token).toHaveProperty('$value');
      expect(['color', 'dimension', 'number', 'fontFamily']).toContain(token.$type);
      if (token.$type === 'color') {
        const { colorSpace, components, hex } = token.$value;
        expect(colorSpace).toBe('srgb');
        expect(components).toHaveLength(3);
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
        components.forEach((value: number, index: number) => {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
          expect(value).toBe(parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255);
        });
      }
      if (token.$type === 'dimension') {
        expect(Number.isFinite(token.$value.value)).toBe(true);
        expect(['px', 'rem']).toContain(token.$value.unit);
      }
      if (token.$type === 'number') expect(Number.isFinite(token.$value)).toBe(true);
      if (token.$type === 'fontFamily') {
        expect(token.$value).toEqual(['Arial', 'Helvetica', 'Liberation Sans', 'sans-serif']);
      }
    }
  });

  it('preserves exact notation mappings and non-token rules without recoloring the app UI', () => {
    expect(notationTokens).toEqual(notation);
    expect(notation.color.domain.application.fill.$value.hex).toBe('#b0d0d9');
    expect(notation.box.width.$value).toEqual({ value: 120, unit: 'px' });
    expect(notation.box.rounded_radius_ratio_of_height.$value).toBe(0.1094);
    expect(notationFill('Application')).toBe('#B0D0D9');
    expect(cornerRadius('BusinessProcess', 55)).toBeCloseTo(55 * 0.1094);
    expect(notation.$extensions['org.archimatejs.notation'].rules.relationship.flow.target).toBe('triangle-filled');
    const css = readFileSync('assets/design-tokens/app.generated.css', 'utf8');
    expect(css).toContain('.am-app[data-theme="dark"]');
    expect(css).toContain('--am-ui-focus: #80b4ff');
    expect(css).not.toContain(':root');
    expect(css).not.toContain('--am-application');
  });
});
