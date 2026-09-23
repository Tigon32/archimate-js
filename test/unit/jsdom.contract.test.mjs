/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

describe('DOM contract environment', () => {
  it('creates and serializes a namespaced SVG element', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Synthetic diagram');
    document.body.append(svg);

    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(document.body.innerHTML).toContain('aria-label="Synthetic diagram"');
  });
});
