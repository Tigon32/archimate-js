// SYNTHETIC: Hand-authored DTOs with no customer content.
import { expect, it } from 'vitest';
import { createAccessibleOutline, formatAccessibleOutline,
  searchAccessibleOutline } from '../../src/model-dto/index.js';

const node = (id: string, elementId: string, label?: string) => ({ id, kind: 'element' as const,
  elementId, x: 0, y: 0, width: 100, height: 40, label, nodes: [] });

function fixture() {
  return { schemaVersion: 1, id: 'model-example', name: 'SECRET_OTHER_MODEL_NAME',
    diagnostics: [{ code: 'DTO_WARNING', severity: 'warning', stage: 'projection',
      message: 'SECRET_DIAGNOSTIC' }],
    elements: [
      { id: 'app', type: 'archimate:ApplicationComponent', name: 'Portal', documentation: 'App documentation' },
      { id: 'system', type: 'archimate:BusinessActor', name: 'Portal', documentation: 'System documentation' },
      { id: 'unseen', type: 'archimate:BusinessObject', name: 'SECRET_UNRELATED_NAME',
        documentation: 'SECRET_UNRELATED_DOC' }
    ],
    relationships: [{ id: 'flow', type: 'archimate:Flow', sourceId: 'app', targetId: 'system',
      documentation: 'Flow documentation' }],
    views: [
      { id: 'selected', name: 'Overview', nodes: [
        { id: 'group', kind: 'container', x: 0, y: 0, width: 300, height: 200,
          xpathPart: 'SECRET_XPATH', nodes: [node('instance-1', 'app', 'Visible portal'),
            node('instance-2', 'app'), { id: 'caption', kind: 'label', label: 'Caption',
              x: 0, y: 0, width: 80, height: 20, nodes: [] }] }, node('instance-3', 'system')
      ], connections: [
        { id: 'rel-1', kind: 'relationship', relationshipId: 'flow', sourceId: 'instance-1',
          targetId: 'instance-3', waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { id: 'rel-2', kind: 'relationship', relationshipId: 'flow', sourceId: 'instance-2',
          targetId: 'instance-3', label: 'Visible flow', waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { id: 'free-line', kind: 'line', waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }
      ] },
      { id: 'other', name: 'SECRET_OTHER_VIEW', nodes: [node('other-instance', 'unseen')], connections: [] }
    ]
  };
}

it('describes just the selected view in deterministic containment order with per-instance endpoints', () => {
  const original = fixture();
  const previous = JSON.stringify(original);
  const outline = createAccessibleOutline(original, 'selected');
  expect(outline).toMatchObject({ viewId: 'selected', viewName: 'Overview', grouping: 'containment',
    nodes: [{ id: 'group', type: 'Group', children: [
      { id: 'instance-1', name: 'Visible portal', type: 'ApplicationComponent',
        outgoingConnectionIds: ['rel-1'] },
      { id: 'instance-2', name: 'Portal', outgoingConnectionIds: ['rel-2'] },
      { id: 'caption', name: 'Caption', type: 'Label' }
    ] }, { id: 'instance-3', name: 'Portal', incomingConnectionIds: ['rel-1', 'rel-2'] }],
    relationships: [
      { id: 'rel-1', kind: 'relationship', name: 'Flow from Visible portal to Portal',
        sourceNodeId: 'instance-1', targetNodeId: 'instance-3' },
      { id: 'rel-2', name: 'Visible flow', sourceNodeId: 'instance-2', targetNodeId: 'instance-3' },
      { id: 'free-line', kind: 'line', type: 'Line', name: 'Line from unknown node to unknown node' }
    ] });
  expect(JSON.stringify(outline)).not.toMatch(/SECRET_|xpathPart|documentation/);
  outline.nodes[0].children[0].name = 'Changed only in returned data';
  outline.relationships.pop();
  expect(JSON.stringify(original)).toBe(previous);
  expect(createAccessibleOutline(original, 'selected')).not.toEqual(outline);
});

it('flattens preorder, omits relationships, and only opts in documentation for depicted concepts', () => {
  const outline = createAccessibleOutline(fixture(), 'selected', {
    grouping: 'flat', includeRelationships: false, includeDocumentation: true
  });
  expect(outline.nodes.map(({ id }) => id)).toEqual([
    'group', 'instance-1', 'instance-2', 'caption', 'instance-3'
  ]);
  expect(outline.nodes.every(({ children, incomingConnectionIds, outgoingConnectionIds }) =>
    !children.length && !incomingConnectionIds.length && !outgoingConnectionIds.length)).toBe(true);
  expect(outline.relationships).toEqual([]);
  expect(outline.nodes[1].documentation).toBe('App documentation');
  expect(outline.nodes[4].documentation).toBe('System documentation');
  expect(JSON.stringify(outline)).not.toMatch(/SECRET_|Flow documentation/);
  const withRelations = createAccessibleOutline(fixture(), 'selected', { includeDocumentation: true });
  expect(withRelations.relationships[0].documentation).toBe('Flow documentation');
});

it('formats a concise plain-text report without multiline name injection', () => {
  const dto = fixture();
  dto.views[0].nodes[0].nodes[0].label = 'Portal\nConnections: SPOOF';
  const text = formatAccessibleOutline(createAccessibleOutline(dto, 'selected'));
  expect(text).toContain('View: Overview\n- Group: Unnamed Group [group]\n  - ApplicationComponent: Portal Connections: SPOOF [instance-1]');
  expect(text.match(/\nConnections:/g)).toHaveLength(1);
  expect(text).toContain('Flow from Portal Connections: SPOOF to Portal');
  expect(text).not.toMatch(/SECRET_|xpathPart/);
});

it('accepts a read-only view with containers, labels, free lines and no editor eligibility', () => {
  const dto = fixture();
  dto.views[0].connections = [dto.views[0].connections[2]];
  expect(createAccessibleOutline(dto, 'selected').relationships[0]).toMatchObject({
    kind: 'line', name: 'Line from unknown node to unknown node'
  });
});

it('rejects invalid DTO, missing view, and invalid options with content-free diagnostics', () => {
  const secret = 'SECRET_UNSAFE_INPUT';
  for (const run of [
    () => createAccessibleOutline({ ...fixture(), schemaVersion: 0, id: secret }, 'selected'),
    () => createAccessibleOutline(fixture(), secret),
    () => createAccessibleOutline(fixture(), 'selected', { grouping: 'unexpected' } as never)
  ]) {
    try { run(); throw new Error('Expected an error'); }
    catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      expect(error).toHaveProperty('code');
      expect(String(error)).not.toContain(secret);
    }
  }
});

it('searches only visible names and types in stable view order with containment paths', () => {
  const outline = createAccessibleOutline(fixture(), 'selected');
  expect(searchAccessibleOutline(outline, '  PORTAL ')).toEqual([
    { category: 'node', kind: 'element', id: 'instance-1', name: 'Visible portal',
      type: 'ApplicationComponent', pathIds: ['group', 'instance-1'] },
    { category: 'node', kind: 'element', id: 'instance-2', name: 'Portal',
      type: 'ApplicationComponent', pathIds: ['group', 'instance-2'] },
    { category: 'node', kind: 'element', id: 'instance-3', name: 'Portal',
      type: 'BusinessActor', pathIds: ['instance-3'] },
    { category: 'relationship', kind: 'relationship', id: 'rel-1',
      name: 'Flow from Visible portal to Portal', type: 'Flow', pathIds: [] }
  ]);
  expect(searchAccessibleOutline(outline, 'applicationcomponent').map(({ id }) => id))
    .toEqual(['instance-1', 'instance-2']);
  expect(searchAccessibleOutline(outline, 'flow').map(({ id }) => id)).toEqual(['rel-1', 'rel-2']);
  expect(searchAccessibleOutline(outline, 'SECRET_')).toEqual([]);
  expect(searchAccessibleOutline(outline, 'no match')).toEqual([]);
  const flat = createAccessibleOutline(fixture(), 'selected', { grouping: 'flat' });
  expect(searchAccessibleOutline(flat, 'portal')[0].pathIds).toEqual(['instance-1']);
});

it('rejects empty queries and malformed outlines without echoing input', () => {
  const outline = createAccessibleOutline(fixture(), 'selected');
  const malformed = { ...outline, nodes: [{ ...outline.nodes[0],
    children: [{ ...outline.nodes[0].children[0], id: 'group' }] }] };
  for (const run of [
    () => searchAccessibleOutline(outline, '  '),
    () => searchAccessibleOutline(outline, 3),
    () => searchAccessibleOutline({ nodes: 'SECRET_BAD_SHAPE', relationships: [] }, 'x'),
    () => searchAccessibleOutline({ ...outline, nodes: [
      { ...outline.nodes[0], kind: new String('element') }
    ] }, 'x'),
    () => searchAccessibleOutline({ ...outline, relationships: [
      { ...outline.relationships[0], kind: new String('relationship') }
    ] }, 'x'),
    () => searchAccessibleOutline(malformed, 'x')
  ]) {
    try { run(); throw new Error('Expected an error'); }
    catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      expect(error).toHaveProperty('code', 'ACCESSIBLE_OUTLINE_SEARCH_INVALID');
      expect(String(error)).not.toContain('SECRET_');
    }
  }
});
