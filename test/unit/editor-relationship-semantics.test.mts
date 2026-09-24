// SYNTHETIC provenance: hand-authored DTOs use only public reviewed relationship rows.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are excluded from the browser source project.
import { readFileSync } from 'node:fs';
import { RELATIONSHIP_SEMANTIC_ROWS } from '../../src/language/relationship-decisions.mjs';
import { validateRelationshipSemantics } from '../../src/language/relationship-semantics.mjs';
import { DiagramAdapter, importMeffToModelDto } from '../../src/model-dto/index.js';
import type { ModelDto, RelationshipDto, ViewConnectionDto } from '../../src/model-dto/index.js';

const viewId = 'view-dto-export';
const fixtureXml = readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8');

function relationship(type: string, sourceId = 'component-one', targetId = 'service-two'): RelationshipDto {
  return { id: 'relation-one', type: `archimate:${type.replace(/Relationship$/, '')}`,
    sourceId, targetId };
}

function connection(sourceId = 'node-component', targetId = 'node-service'): ViewConnectionDto {
  return { id: 'connection-one', kind: 'relationship', relationshipId: 'relation-one',
    sourceId, targetId, waypoints: [{ x: 120, y: 35 }, { x: 200, y: 35 }] };
}

function model(sourceType: string, targetType: string, existing?: RelationshipDto): ModelDto {
  const dto = importMeffToModelDto(fixtureXml);
  dto.elements.find((item) => item.id === 'component-one')!.type = `archimate:${sourceType}`;
  dto.elements.find((item) => item.id === 'service-two')!.type = `archimate:${targetType}`;
  const originalConnection = dto.views[0].connections[0];
  dto.relationships = existing ? [existing] : [];
  dto.views[0].connections = existing ? [{ ...originalConnection, id: 'connection-one',
    relationshipId: existing.id }] : [];
  return dto;
}

function codeOf(action: () => void): string | undefined {
  try { action(); } catch (error) { return (error as { code?: string }).code; }
  return undefined;
}

it('agrees with the validator service on every reviewed row for new DTO connections', () => {
  for (const row of RELATIONSHIP_SEMANTIC_ROWS) {
    const editor = new DiagramAdapter(model(row.sourceType, row.targetType));
    const before = editor.serialize();
    const relation = relationship(row.relationshipType);
    const decision = validateRelationshipSemantics({ sourceType: row.sourceType,
      relationshipType: relation.type, targetType: row.targetType });
    expect(decision.decision).toBe(row.decision);
    const result = codeOf(() => editor.execute({ type: 'connect', viewId,
      relationship: relation, connection: connection() }));
    if (row.decision === 'allowed') {
      expect(result).toBeUndefined();
      expect(editor.getModel().relationships).toHaveLength(1);
      expect(editor.undo()).toBe(true);
    } else {
      expect(result).toBe('DTO_RELATIONSHIP_DISALLOWED');
      expect(editor.undo()).toBe(false);
    }
    expect(editor.serialize()).toBe(before);
  }
});

it('rejects absent tuples distinctly and preserves failed-command history', () => {
  const editor = new DiagramAdapter(model('Node', 'ApplicationComponent'));
  const before = editor.serialize();
  expect(codeOf(() => editor.execute({ type: 'connect', viewId,
    relationship: relationship('AssignmentRelationship'), connection: connection() })))
    .toBe('DTO_RELATIONSHIP_UNSUPPORTED');
  expect(editor.serialize()).toBe(before);
  expect(editor.undo()).toBe(false);
});

it('checks changed reconnect endpoints but permits unchanged imported unsupported edges', () => {
  const imported = importMeffToModelDto(fixtureXml);
  const editor = new DiagramAdapter(imported);
  const original = editor.serialize();
  editor.execute({ type: 'reconnect', viewId: 'view-dto-export', connectionId: 'serving-connection',
    sourceId: 'node-component', targetId: 'node-service',
    waypoints: [{ x: 120, y: 35 }, { x: 210, y: 35 }] });
  expect(editor.getModel().relationships[0].type).toBe('archimate:Serving');
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(original);
  editor.execute({ type: 'reconnect', viewId, connectionId: 'serving-connection',
    sourceId: 'node-service', targetId: 'node-component',
    waypoints: [{ x: 300, y: 75 }, { x: 160, y: 75 }] });
  expect(editor.getModel().relationships[0]).toMatchObject({
    sourceId: 'service-two', targetId: 'component-one' });
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(original);
});

it('keeps disallowed and unsupported reconnect attempts atomic and distinct', () => {
  for (const [sourceType, targetType, relationType, expected] of [
    ['ApplicationFunction', 'DataObject', 'AccessRelationship', 'DTO_RELATIONSHIP_DISALLOWED'],
    ['ApplicationService', 'ApplicationComponent', 'ServingRelationship', 'DTO_RELATIONSHIP_UNSUPPORTED']
  ]) {
    const editor = new DiagramAdapter(model(sourceType, targetType, relationship(relationType)));
    const before = editor.serialize();
    const code = codeOf(() => editor.execute({ type: 'reconnect', viewId, connectionId: 'connection-one',
      sourceId: 'node-service', targetId: 'node-component',
      waypoints: [{ x: 300, y: 75 }, { x: 160, y: 75 }] }));
    expect(code).toBe(expected);
    expect(editor.serialize()).toBe(before);
    expect(editor.undo()).toBe(false);
  }
});
