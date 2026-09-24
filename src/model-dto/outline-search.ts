import type { AccessibleOutlineNode, AccessibleOutlineRelationship } from './accessible-outline.js';

export interface AccessibleOutlineSearchResult {
  category: 'node' | 'relationship';
  kind: AccessibleOutlineNode['kind'] | AccessibleOutlineRelationship['kind'];
  id: string;
  name: string;
  type: string;
  /** Node IDs from the outermost container through this node; empty for relationships. */
  pathIds: string[];
}

function invalid(): never {
  throw Object.assign(new TypeError('The accessible outline search input is invalid.'),
    { code: 'ACCESSIBLE_OUTLINE_SEARCH_INVALID' });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalid();
  return value;
}

function childrenOf(value: unknown): unknown[] {
  const children = record(value).children;
  if (!Array.isArray(children)) invalid();
  return children;
}

function matches(name: string, type: string, needle: string): boolean {
  return name.toLowerCase().includes(needle) || type.toLowerCase().includes(needle);
}

/** Search one selected-view outline in deterministic node preorder, then connection order. */
export function searchAccessibleOutline(outline: unknown, query: unknown): AccessibleOutlineSearchResult[] {
  if (typeof query !== 'string' || !query.trim()) invalid();
  const needle = query.trim().toLowerCase();
  const source = record(outline);
  if (!Array.isArray(source.nodes) || !Array.isArray(source.relationships)) invalid();
  const found: AccessibleOutlineSearchResult[] = [];
  const seen = new Set<string>();
  const stack = source.nodes.map((value: unknown) => ({ value, pathIds: [] as string[] })).reverse();
  while (stack.length) {
    const current = stack.pop()!;
    const node = record(current.value);
    const id = text(node.id);
    const name = text(node.name);
    const type = text(node.type);
    if (node.kind !== 'element' && node.kind !== 'container' && node.kind !== 'label' ||
        seen.has(id)) invalid();
    seen.add(id);
    const pathIds = [...current.pathIds, id];
    if (matches(name, type, needle)) {
      found.push({ category: 'node', kind: node.kind as AccessibleOutlineNode['kind'],
        id, name, type, pathIds });
    }
    const children = childrenOf(node);
    for (let index = children.length - 1; index >= 0; index--) {
      stack.push({ value: children[index], pathIds });
    }
  }
  for (const value of source.relationships) {
    const relationship = record(value);
    const id = text(relationship.id);
    const name = text(relationship.name);
    const type = text(relationship.type);
    if (relationship.kind !== 'relationship' && relationship.kind !== 'line' ||
        seen.has(id)) invalid();
    seen.add(id);
    if (matches(name, type, needle)) {
      found.push({ category: 'relationship', kind: relationship.kind as AccessibleOutlineRelationship['kind'],
        id, name, type, pathIds: [] });
    }
  }
  return found;
}
