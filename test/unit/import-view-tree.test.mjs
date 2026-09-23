import { describe, expect, it } from 'vitest';

import {
  MAX_VIEW_ELEMENT_DEPTH,
  walkViewElementTree
} from '../../lib/import/ViewTree.js';

describe('view tree import safety', () => {
  it('bounds deeply nested synthetic view elements and reports truncation', () => {
    const root = { id: 'synthetic-root', nodes: [] };
    let current = root;

    for (let index = 0; index < 6; index++) {
      const child = { id: 'synthetic-' + index, nodes: [] };
      current.nodes.push(child);
      current = child;
    }

    const visitedIds = [];
    const result = walkViewElementTree(root, {}, element => {
      visitedIds.push(element.id);
      return {};
    }, 4);

    expect(visitedIds).toHaveLength(4);
    expect(result).toEqual({ depthLimitReached: true, cycleDetected: false });
  });

  it('skips cyclic object graphs without recursing indefinitely', () => {
    const root = { id: 'synthetic-cycle-root', nodes: [] };
    const child = { id: 'synthetic-cycle-child', nodes: [root] };
    root.nodes.push(child);

    const visitedIds = [];
    const result = walkViewElementTree(root, {}, element => {
      visitedIds.push(element.id);
      return {};
    });

    expect(visitedIds).toEqual(['synthetic-cycle-root', 'synthetic-cycle-child']);
    expect(result).toEqual({ depthLimitReached: false, cycleDetected: true });
    expect(MAX_VIEW_ELEMENT_DEPTH).toBe(128);
  });
});
