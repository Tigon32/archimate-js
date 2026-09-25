// SYNTHETIC provenance: hand-authored DTOs use only public reviewed relationship rows.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are excluded from the browser source project.
import { readFileSync } from 'node:fs';
import { RELATIONSHIP_SEMANTIC_ROWS } from '../../src/language/relationship-decisions.mjs';
import { validateRelationshipSemantics } from '../../src/language/relationship-semantics.mjs';
import { DiagramAdapter, importMeffToModelDto } from '../../src/model-dto/index.js';
import type {
  ModelDto, RelationshipDto, RelationshipEditDiagnostic, ViewConnectionDto
} from '../../src/model-dto/index.js';

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

function diagnosticOf(action: () => void): RelationshipEditDiagnostic | undefined {
  try { action(); }
  catch (error) {
    return (error as { diagnostic?: RelationshipEditDiagnostic }).diagnostic;
  }
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
    const diagnostic = diagnosticOf(() => editor.execute({ type: 'reconnect', viewId,
      connectionId: 'connection-one', sourceId: 'node-service', targetId: 'node-component',
      waypoints: [{ x: 300, y: 75 }, { x: 160, y: 75 }] }));
    expect(diagnostic).toMatchObject({
      code: expected,
      category: expected === 'DTO_RELATIONSHIP_DISALLOWED' ? 'invalid-semantics' : 'unsupported-profile',
      operation: 'reconnect', viewId, connectionId: 'connection-one',
      relationshipId: 'relation-one', sourceId: 'node-service', targetId: 'node-component',
      sourceElementId: 'service-two', targetElementId: 'component-one'
    });
    expect(editor.serialize()).toBe(before);
    expect(editor.undo()).toBe(false);
  }
});

it('returns fixed actionable diagnostics for invalid semantics and unsupported profile rows', () => {
  const disallowed = RELATIONSHIP_SEMANTIC_ROWS.find((row) => row.decision === 'disallowed')!;
  const cases = [
    { sourceType: disallowed.sourceType, targetType: disallowed.targetType,
      relationshipType: disallowed.relationshipType, category: 'invalid-semantics',
      code: 'DTO_RELATIONSHIP_DISALLOWED' },
    { sourceType: 'Node', targetType: 'ApplicationComponent',
      relationshipType: 'AssignmentRelationship', category: 'unsupported-profile',
      code: 'DTO_RELATIONSHIP_UNSUPPORTED' }
  ] as const;
  for (const item of cases) {
    const editor = new DiagramAdapter(model(item.sourceType, item.targetType));
    const diagnostic = diagnosticOf(() => editor.execute({ type: 'connect', viewId,
      relationship: relationship(item.relationshipType), connection: connection() }));
    expect(diagnostic).toMatchObject({
      code: item.code, category: item.category, severity: 'error',
      operation: 'connect', viewId,
      connectionId: 'connection-one', relationshipId: 'relation-one',
      sourceId: 'node-component', targetId: 'node-service'
    });
    expect(diagnostic?.message).not.toContain('ApplicationFunction');
    expect(editor.undo()).toBe(false);
  }
});

it('distinguishes malformed identifiers, duplicate connections, and conflicting relationship ids', () => {
  const malformed = new DiagramAdapter(model('ApplicationComponent', 'ApplicationService'));
  const original = malformed.serialize();
  expect(diagnosticOf(() => malformed.execute({ type: 'connect', viewId,
    relationship: relationship('ServingRelationship'),
    connection: { ...connection(), sourceId: 'invalid node id' } }))).toMatchObject({
    code: 'DTO_RELATIONSHIP_MALFORMED_ID', category: 'malformed-id',
    sourceId: '[REDACTED]', operation: 'connect'
  });
  expect(malformed.serialize()).toBe(original);
  expect(malformed.undo()).toBe(false);

  const malformedRelationship = { ...relationship('ServingRelationship'), sourceId: 'bad concept id' };
  const malformedConcept = new DiagramAdapter(model('ApplicationComponent', 'ApplicationService'));
  expect(diagnosticOf(() => malformedConcept.execute({ type: 'connect', viewId,
    relationship: malformedRelationship,
    connection: { ...connection(), relationshipId: malformedRelationship.id } }))).toMatchObject({
    code: 'DTO_RELATIONSHIP_MALFORMED_ID',
    sourceElementId: '[REDACTED]' });
  expect(malformedConcept.undo()).toBe(false);

  const existing = relationship('ServingRelationship');
  const duplicate = new DiagramAdapter(model('ApplicationComponent', 'ApplicationService', existing));
  const duplicateBefore = duplicate.serialize();
  expect(diagnosticOf(() => duplicate.execute({ type: 'connect', viewId,
    relationship: relationship('ServingRelationship'), connection: connection() }))).toMatchObject({
    code: 'DTO_RELATIONSHIP_DUPLICATE_CONNECTION',
    category: 'duplicate-conflict', connectionId: 'connection-one' });
  expect(duplicate.serialize()).toBe(duplicateBefore);
  expect(duplicate.undo()).toBe(false);

  const collision = new DiagramAdapter(model('ApplicationComponent', 'ApplicationService'));
  const conflictingRelationship = { ...relationship('ServingRelationship'), id: 'component-one' };
  expect(diagnosticOf(() => collision.execute({ type: 'connect', viewId,
    relationship: conflictingRelationship,
    connection: { ...connection(), relationshipId: conflictingRelationship.id } }))).toMatchObject({
    code: 'DTO_RELATIONSHIP_ID_CONFLICT',
    category: 'duplicate-conflict', relationshipId: 'component-one' });
  expect(collision.undo()).toBe(false);
});

it('redacts arbitrary malformed IDs while retaining valid relationship context', () => {
  const malformedId = 'bad node id\n{"private":"synthetic-secret"}';
  const editor = new DiagramAdapter(model('ApplicationComponent', 'ApplicationService'));
  let output = '';
  try {
    editor.execute({ type: 'connect', viewId, relationship: relationship('ServingRelationship'),
      connection: { ...connection(), sourceId: malformedId } });
  } catch (error) {
    const relationshipError = error as Error & { diagnostic?: RelationshipEditDiagnostic };
    output = `${relationshipError.message}\n${JSON.stringify(relationshipError.diagnostic)}`;
  }
  expect(output).not.toContain(malformedId);
  expect(output).toContain('[REDACTED]');
  expect(JSON.parse(output.slice(output.indexOf('\n') + 1))).toMatchObject({
    code: 'DTO_RELATIONSHIP_MALFORMED_ID',
    viewId,
    connectionId: 'connection-one',
    relationshipId: 'relation-one',
    sourceId: '[REDACTED]',
    targetId: 'node-service'
  });

  const malformedElementId = 'private concept identifier; synthetic';
  const malformedRelationship = {
    ...relationship('ServingRelationship'), sourceId: malformedElementId
  };
  const relationshipEditor = new DiagramAdapter(model('ApplicationComponent', 'ApplicationService'));
  const diagnostic = diagnosticOf(() => relationshipEditor.execute({
    type: 'connect', viewId, relationship: malformedRelationship,
    connection: { ...connection(), relationshipId: malformedRelationship.id }
  }));
  expect(JSON.stringify(diagnostic)).not.toContain(malformedElementId);
  expect(diagnostic).toMatchObject({
    code: 'DTO_RELATIONSHIP_MALFORMED_ID',
    sourceElementId: '[REDACTED]',
    targetElementId: 'service-two'
  });
});

it('validates new view references against the reviewed profile', () => {
  const importedRelationship = relationship('AssignmentRelationship');
  const editor = new DiagramAdapter(model('Node', 'ApplicationComponent', importedRelationship));
  const before = editor.serialize();
  const diagnostic = diagnosticOf(() => editor.execute({ type: 'connect', viewId,
    connection: { ...connection(), id: 'second-connection' } }));
  expect(diagnostic).toMatchObject({
    code: 'DTO_RELATIONSHIP_UNSUPPORTED', category: 'unsupported-profile',
    relationshipId: importedRelationship.id
  });
  expect(editor.serialize()).toBe(before);
  expect(editor.undo()).toBe(false);
});

it('distinguishes a mismatched relationship reference from a shared retarget', () => {
  const editor = new DiagramAdapter(importMeffToModelDto(fixtureXml));
  const before = editor.serialize();
  const diagnostic = diagnosticOf(() => editor.execute({ type: 'connect', viewId,
    connection: { ...connection('node-service', 'node-component'),
      id: 'reversed-reference', relationshipId: 'serving-one-two' } }));
  expect(diagnostic).toMatchObject({
    code: 'DTO_RELATIONSHIP_ENDPOINT_MISMATCH', category: 'invalid-endpoint',
    operation: 'connect', relationshipId: 'serving-one-two',
    sourceElementId: 'service-two', targetElementId: 'component-one'
  });
  expect(editor.serialize()).toBe(before);
  expect(editor.undo()).toBe(false);
});

it('reports retarget conflicts and rejected commands preserve redo history', () => {
  const shared = importMeffToModelDto(fixtureXml);
  const originalConnection = shared.views[0].connections[0];
  shared.views[0].connections.push({ ...originalConnection, id: 'second-serving-connection' });
  const editor = new DiagramAdapter(shared);
  const before = editor.serialize();
  expect(diagnosticOf(() => editor.execute({ type: 'reconnect', viewId,
    connectionId: originalConnection.id, sourceId: 'node-service', targetId: 'node-component',
    waypoints: [{ x: 300, y: 75 }, { x: 160, y: 75 }] }))).toMatchObject({
    code: 'DTO_RELATIONSHIP_RETARGET_CONFLICT',
    category: 'retarget-conflict', operation: 'reconnect',
    connectionId: originalConnection.id, relationshipId: 'serving-one-two' });
  expect(editor.serialize()).toBe(before);
  expect(editor.undo()).toBe(false);

  const allowedRow = RELATIONSHIP_SEMANTIC_ROWS.find((row) => row.decision === 'allowed')!;
  const accepted = new DiagramAdapter(model(allowedRow.sourceType, allowedRow.targetType));
  const initial = accepted.serialize();
  accepted.execute({ type: 'connect', viewId, relationship: relationship(allowedRow.relationshipType),
    connection: connection() });
  const committed = accepted.serialize();
  expect(accepted.undo()).toBe(true);
  expect(accepted.serialize()).toBe(initial);
  expect(diagnosticOf(() => accepted.execute({ type: 'connect', viewId,
    relationship: relationship(allowedRow.relationshipType),
    connection: { ...connection(), targetId: 'bad target' } }))).toMatchObject({
    code: 'DTO_RELATIONSHIP_MALFORMED_ID'
  });
  expect(accepted.serialize()).toBe(initial);
  expect(accepted.redo()).toBe(true);
  expect(accepted.serialize()).toBe(committed);
});

it('reports mismatched command relationship IDs separately from real collisions', () => {
  // SYNTHETIC: the submitted relationship ID is unique; only the connection reference differs.
  const mismatch = new DiagramAdapter(model('ApplicationComponent', 'ApplicationService'));
  const mismatchBefore = mismatch.serialize();
  const mismatchDiagnostic = diagnosticOf(() => mismatch.execute({ type: 'connect', viewId,
    relationship: { ...relationship('ServingRelationship'), id: 'relation-submitted' },
    connection: { ...connection(), relationshipId: 'relation-referenced' } }));
  expect(mismatchDiagnostic).toMatchObject({
    code: 'DTO_RELATIONSHIP_ID_MISMATCH', category: 'identifier-mismatch',
    operation: 'connect', connectionId: 'connection-one', relationshipId: 'relation-submitted'
  });
  expect(JSON.stringify(mismatchDiagnostic)).not.toContain('relation-referenced');
  expect(mismatch.serialize()).toBe(mismatchBefore);
  expect(mismatch.undo()).toBe(false);

  const existing = relationship('ServingRelationship');
  const collision = new DiagramAdapter(model('ApplicationComponent', 'ApplicationService', existing));
  const collisionBefore = collision.serialize();
  expect(diagnosticOf(() => collision.execute({ type: 'connect', viewId,
    relationship: relationship('ServingRelationship'),
    connection: { ...connection(), id: 'second-connection' } }))).toMatchObject({
    code: 'DTO_RELATIONSHIP_ID_CONFLICT', category: 'duplicate-conflict',
    connectionId: 'second-connection', relationshipId: existing.id
  });
  expect(collision.serialize()).toBe(collisionBefore);
  expect(collision.undo()).toBe(false);
});

it('redacts malformed command relationship IDs and keeps mismatch rejections atomic', () => {
  for (const [submittedId, referencedId] of [
    ['bad submitted id', 'relation-one'], ['relation-one', 'bad referenced id']
  ]) {
    const malformed = new DiagramAdapter(model('ApplicationComponent', 'ApplicationService'));
    const malformedBefore = malformed.serialize();
    const diagnostic = diagnosticOf(() => malformed.execute({ type: 'connect', viewId,
      relationship: { ...relationship('ServingRelationship'), id: submittedId },
      connection: { ...connection(), relationshipId: referencedId } }));
    expect(diagnostic).toMatchObject({
      code: 'DTO_RELATIONSHIP_MALFORMED_ID', relationshipId: '[REDACTED]',
      connectionId: 'connection-one'
    });
    expect(JSON.stringify(diagnostic)).not.toContain(submittedId.startsWith('bad') ? submittedId : referencedId);
    expect(malformed.serialize()).toBe(malformedBefore);
    expect(malformed.undo()).toBe(false);
  }

  const allowedRow = RELATIONSHIP_SEMANTIC_ROWS.find((row) => row.decision === 'allowed')!;
  const history = new DiagramAdapter(model(allowedRow.sourceType, allowedRow.targetType));
  const initial = history.serialize();
  history.execute({ type: 'connect', viewId, relationship: relationship(allowedRow.relationshipType),
    connection: connection() });
  const committed = history.serialize();
  expect(history.undo()).toBe(true);
  expect(codeOf(() => history.execute({ type: 'connect', viewId,
    relationship: { ...relationship(allowedRow.relationshipType), id: 'relation-submitted' },
    connection: connection() }))).toBe('DTO_RELATIONSHIP_ID_MISMATCH');
  expect(history.serialize()).toBe(initial);
  expect(history.redo()).toBe(true);
  expect(history.serialize()).toBe(committed);
});

it('redacts syntactically valid identifiers longer than the diagnostic short-ID bound', () => {
  // SYNTHETIC: exercise diagnostic redaction with generated IDs only.
  const existing = relationship('ServingRelationship');
  const longId = 's'.repeat(129);
  const cases = [
    { sourceId: longId, expected: '[REDACTED]' },
    { sourceId: 'synthetic-source-short', expected: 'synthetic-source-short' }
  ];
  for (const item of cases) {
    const editor = new DiagramAdapter(model('ApplicationComponent', 'ApplicationService', existing));
    const diagnostic = diagnosticOf(() => editor.execute({ type: 'connect', viewId,
      connection: { ...connection(item.sourceId, 'node-service'), id: 'new-connection' } }));
    expect(diagnostic).toMatchObject({
      code: 'DTO_RELATIONSHIP_ENDPOINT_INVALID',
      sourceId: item.expected,
      targetId: 'node-service'
    });
    expect(JSON.stringify(diagnostic)).not.toContain(longId);
    expect(editor.undo()).toBe(false);
  }
});
