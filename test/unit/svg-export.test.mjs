import { describe, expect, it } from 'vitest';

import { createSvg, sanitizeSvgTree } from '../../lib/util/SvgExportUtil.mjs';

describe('SVG export serialization', () => {
  const bbox = { x: 0, y: 2, width: 640, height: 480 };

  it('serializes the same rendered view deterministically', () => {
    const input = {
      bbox,
      contents: '<g id="view"><rect width="10" height="10"/></g>',
      defs: '<defs><marker id="arrow"/></defs>',
      title: 'Sample view',
      description: 'Synthetic architecture view'
    };

    const snapshot = [
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ',
      'role="img" aria-labelledby="archimate-svg-title archimate-svg-description" ',
      'width="640" height="480" viewBox="0 2 640 480">',
      '<title id="archimate-svg-title">Sample view</title>',
      '<desc id="archimate-svg-description">Synthetic architecture view</desc>',
      '<defs><marker id="arrow"/></defs><g id="view"><rect width="10" height="10"/></g></svg>'
    ].join('');

    expect(createSvg(input)).toBe(snapshot);
    expect(createSvg(input)).toBe(createSvg(input));
    expect(createSvg(input)).toContain('viewBox="0 2 640 480"');
    expect(createSvg(input)).toContain('aria-labelledby="archimate-svg-title archimate-svg-description"');
  });

  it('escapes accessible text and uses safe defaults', () => {
    const svg = createSvg({
      bbox,
      contents: '',
      title: '<img src=x onerror=alert(1)>&"\'',
      description: 'A & B'
    });

    expect(svg).toContain('&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&apos;');
    expect(svg).toContain('A &amp; B');
    expect(svg).not.toContain('<!DOCTYPE');
    expect(svg).not.toContain('http://www.w3.org/Graphics/SVG/1.1/DTD');
    expect(createSvg({ bbox, contents: '' })).toContain('<title id="archimate-svg-title">ArchiMate diagram</title>');
  });

  it('rejects non-finite bounds instead of emitting unstable SVG', () => {
    expect(() => createSvg({
      bbox: { x: 0, y: 0, width: Infinity, height: 10 },
      contents: ''
    })).toThrow('SVG bounds must contain finite numbers');
  });

  it('removes active markup and non-local resource references from the export clone', () => {
    const script = makeNode('script');
    const image = makeNode('image', [
      { name: 'xlink:href', value: 'https://example.invalid/tracker.svg' },
      { name: 'onload', value: 'alert(1)' },
      { name: 'style', value: 'fill: url(https://example.invalid/paint)' }
    ]);
    const root = makeNode('g', [
      { name: 'onclick', value: 'alert(1)' },
      { name: 'fill', value: 'url(#local-marker)' }
    ], [ script, image ]);

    sanitizeSvgTree(root);

    expect(root.attributes.map(({ name }) => name)).toEqual([ 'fill' ]);
    expect(root.attributes[0].value).toBe('url(#local-marker)');
    expect(root.children).toEqual([ image ]);
    expect(image.attributes).toEqual([]);
  });
});

function makeNode(localName, attributes = [], children = []) {
  const node = {
    localName,
    parentNode: null,
    textContent: '',
    attributes: attributes.map((attribute) => ({ ...attribute })),
    children,
    querySelectorAll() {
      return this.children.flatMap((child) => [ child, ...child.querySelectorAll('*') ]);
    },
    removeAttribute(name) {
      this.attributes = this.attributes.filter((attribute) => attribute.name !== name);
    }
  };

  children.forEach((child) => {
    child.parentNode = {
      removeChild(removed) {
        node.children = node.children.filter((candidate) => candidate !== removed);
        removed.parentNode = null;
      }
    };
  });

  return node;
}
