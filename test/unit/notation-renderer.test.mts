/** @vitest-environment jsdom */
// SYNTHETIC: Minimal generated shapes and relationships; no external models.
import { describe, expect, it } from 'vitest';
// @ts-expect-error Legacy renderer is migrated with the typed diagram boundary in #94.
import ArchimateRenderer from '../../lib/draw/ArchimateRenderer.js';
// @ts-expect-error Runtime adapter is an explicitly documented #93 exception.
import { notationFill, cornerRadius, chamferSize } from '../../lib/draw/NotationAdapter.mjs';
// @ts-expect-error Generated source is checked against the supplied kit below.
import { tokens, css, symbols } from '../../lib/draw/notation.generated.js';
import source from '../../assets/archimate-4-kit/tokens/tokens.json' with { type: 'json' };
// @ts-expect-error Legacy SVG serializer migration is tracked by #92.
import { createSvg } from '../../lib/util/SvgExportUtil.mjs';
// @ts-expect-error This package does not yet include Node types for source asset tests.
import { readFileSync } from 'node:fs';

describe('supplied ArchiMate notation', () => {
  it('keeps generated tokens synchronized with the original kit', () => {
    expect(tokens).toEqual(source);
    expect(css).toBe(readFileSync('assets/archimate-4-kit/css/archimate.css', 'utf8'));
    expect(symbols).toBe(readFileSync('assets/archimate-4-kit/svg/archimate-symbols.svg', 'utf8'));
    expect(notationFill('Application')).toBe(source.color.domain.application.fill);
    expect(cornerRadius('BusinessProcess', 55)).toBeGreaterThan(0);
    expect(chamferSize('Goal', 55)).toBeGreaterThan(0);
  });

  it('renders domain shapes, embedded symbols and authored overrides in exported SVG content', () => {
    const { renderer, svg, graphics } = createRenderer();
    renderer.drawShape(graphics, shape('ApplicationComponent', 'Application'));
    renderer.drawShape(graphics, shape('BusinessProcess', 'Business', '#123456', '#654321'));
    renderer.drawShape(graphics, shape('Grouping', 'Other'));

    const figures = graphics.querySelectorAll<SVGElement>('.am-shape');
    expect(figures[0]?.style.fill).toBe('rgb(176, 208, 217)');
    expect(figures[1]?.style.fill).toBe('rgb(18, 52, 86)');
    expect(figures[1]?.style.stroke).toBe('rgb(101, 67, 33)');
    expect(figures[1]?.getAttribute('rx')).not.toBe('0');
    expect(figures[2]?.style.stroke).toBe('rgb(88, 88, 88)');
    expect(graphics.querySelector('.am-icon rect')).not.toBeNull();
    expect(svg.querySelector('defs symbol#am-icon-ApplicationComponent')).not.toBeNull();
    expect(svg.querySelector('defs style')?.textContent).toContain('.am-diagram .am-shape');
    expect(svg.querySelector('defs style')?.textContent).not.toContain(':root');
    const scopedCss = svg.querySelector('defs style')?.textContent || '';
    expect(scopedCss).not.toMatch(/(?<!\.am-diagram )\.am-icon/);
    expect(scopedCss).not.toMatch(/(?<!\.am-diagram )\.am-rel/);
    expect(scopedCss).not.toMatch(/(?<!\.am-diagram )\.am-swatch/);
    expect(new DOMParser().parseFromString(svg.outerHTML, 'image/svg+xml').querySelector('parsererror')).toBeNull();
    const exported = createSvg({ bbox: { x: 0, y: 0, width: 120, height: 55 },
      contents: graphics.innerHTML, defs: `<defs>${svg.querySelector('defs')?.innerHTML}</defs>` });
    expect(exported).toContain('class="am-diagram"');
    expect(exported).toContain('<style>');
    expect(exported).toContain('.am-diagram .am-icon');
    expect(exported).toContain('am-icon-ApplicationComponent');
  });

  it('scales relationship patterns by authored width and includes local symbols once', () => {
    const { renderer, graphics, svg } = createRenderer();
    renderer.drawConnection(graphics, connection('Realization', 2));
    renderer.drawConnection(graphics, connection('Flow', 3));
    const paths = graphics.querySelectorAll('path');
    expect(paths[0]?.style.strokeDasharray).toBe('2 2');
    expect(paths[1]?.style.strokeDasharray).toBe('12 3');
    expect(svg.querySelectorAll('defs[data-archimate-notation]')).toHaveLength(1);
    expect(paths[0]?.style.strokeWidth).toBe('2');
  });
});

function createRenderer() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.append(svg);
  const graphics = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.append(graphics);
  const renderer = new ArchimateRenderer({}, { on() {} },
    { computeStyle: (attrs: object, _options: unknown, defaults: object) => ({ ...defaults, ...attrs }) },
    { getScaledPath: () => '' }, { _svg: svg },
    { createText: () => document.createElementNS('http://www.w3.org/2000/svg', 'text'), getExternalStyle: () => ({}) });
  return { renderer, svg, graphics };
}

function shape(type: string, layer: string, fill?: string, stroke?: string) {
  return { type, layer, width: 120, height: 55, x: 0, y: 0,
    businessObject: { $type: 'archimate:Node', style: fill ? { fillColor: fill, lineColor: stroke } : undefined },
    style: { fillColor: fill || notationFill(layer, type), lineColor: stroke || '#000000',
      textAlignment: 'center', textPosition: 'middle' } };
}

function connection(type: string, lineWidth: number) {
  return { type, style: { lineColor: '#123456', lineWidth },
    waypoints: [ { x: 0, y: 0 }, { x: 120, y: 0 } ] };
}
