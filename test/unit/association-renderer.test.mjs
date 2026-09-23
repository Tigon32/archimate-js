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

function directedAssociation({ typeOption, isDirected }) {
  return {
    type: 'Association',
    typeOption,
    businessObject: { relationshipRef: { isDirected } },
    style: { lineColor: '#000000' },
    waypoints: [ { x: 0, y: 0 }, { x: 120, y: 0 } ]
  };
}
