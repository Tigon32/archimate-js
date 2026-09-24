/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import ArchimateRenderer from '../../lib/draw/ArchimateRenderer.js';

describe('Association direction rendering', () => {
  it('uses the imported relationship direction when the renderer option is absent', () => {
    const { renderer, graphics } = createRenderer();

    renderer.drawConnection(graphics, directedAssociation({ typeOption: undefined, isDirected: true }));
    expect(graphics.querySelector('path')?.getAttribute('style')).toMatch(/marker-end: url\(['"]?#half-opened-end-000000-/);
    expect(document.querySelector('defs marker path')?.getAttribute('d')).toBe('M 1 5 L 11 10');
  });

  it.each([
    { typeOption: false, isDirected: false },
    { typeOption: undefined, isDirected: undefined }
  ])('keeps a false or omitted direction undirected', ({ typeOption, isDirected }) => {
    const { renderer, graphics } = createRenderer();

    renderer.drawConnection(graphics, directedAssociation({ typeOption, isDirected }));

    expect(graphics.querySelector('path')?.hasAttribute('marker-end')).toBe(false);
  });

  it('renders an imported positive line width and keeps the default for missing or invalid widths', () => {
    const explicit = createRenderer();
    explicit.renderer.drawConnection(explicit.graphics, directedAssociation({
      typeOption: false,
      isDirected: false,
      lineWidth: 3
    }));
    expect(explicit.graphics.querySelector('path')?.getAttribute('stroke-width')).toBe('3');

    const defaultWidth = createRenderer();
    defaultWidth.renderer.drawConnection(defaultWidth.graphics, directedAssociation({
      typeOption: false,
      isDirected: false
    }));
    expect(defaultWidth.graphics.querySelector('path')?.getAttribute('stroke-width')).toBe('1');

    const invalidWidth = createRenderer();
    invalidWidth.renderer.drawConnection(invalidWidth.graphics, directedAssociation({
      typeOption: false,
      isDirected: false,
      lineWidth: 0
    }));
    expect(invalidWidth.graphics.querySelector('path')?.getAttribute('stroke-width')).toBe('1');
  });
});

function createRenderer() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.append(svg);
  const graphics = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.append(graphics);
  const renderer = new ArchimateRenderer(
    {},
    { on() {} },
    { computeStyle: (attrs, _additionalAttrs, defaults) => ({ ...defaults, ...attrs }) },
    { getScaledPath: () => '' },
    { _svg: svg },
    { getExternalStyle: () => ({}) }
  );
  return { renderer, graphics };
}

function directedAssociation({ typeOption, isDirected, lineWidth = 1 }) {
  return {
    type: 'Association',
    typeOption,
    businessObject: { relationshipRef: { isDirected } },
    style: { lineColor: '#000000', lineWidth },
    waypoints: [ { x: 0, y: 0 }, { x: 120, y: 0 } ]
  };
}
