// SYNTHETIC: Generated DTO records with invented IDs and labels only.
import { createHash } from 'node:crypto';
import type { ModelDto } from '../../src/model-dto/types.js';
import {
  DTO_DIFF_FIXTURE_VERSION,
  type DtoDiffTier
} from './dto-diff-contract.mts';

export interface DtoDiffFixture {
  fixtureVersion: number;
  provenance: 'SYNTHETIC';
  tier: DtoDiffTier;
  before: ModelDto;
  unchangedAfter: ModelDto;
  representativeAfter: ModelDto;
  fixtureFingerprint: string;
}

function identifier(kind: string, index: number): string {
  return `${kind}-${String(index).padStart(5, '0')}`;
}

function makeModel(size: number): ModelDto {
  const elements = Array.from({ length: size }, (_, index) => ({
    id: identifier('element', index),
    type: 'archimate:ApplicationProcess',
    name: `Synthetic process ${index}`
  }));
  const relationships = Array.from({ length: size - 1 }, (_, index) => ({
    id: identifier('relationship', index),
    type: 'archimate:Triggering',
    sourceId: elements[index].id,
    targetId: elements[index + 1].id
  }));
  const nodes = elements.map((element, index) => ({
    id: identifier('node', index),
    kind: 'element' as const,
    elementId: element.id,
    x: index % 100 * 140,
    y: Math.floor(index / 100) * 80,
    width: 120,
    height: 60,
    nodes: []
  }));
  const connections = relationships.map((relationship, index) => ({
    id: identifier('connection', index),
    kind: 'relationship' as const,
    relationshipId: relationship.id,
    sourceId: nodes[index].id,
    targetId: nodes[index + 1].id,
    waypoints: [
      { x: nodes[index].x + nodes[index].width, y: nodes[index].y + 30 },
      { x: nodes[index + 1].x, y: nodes[index + 1].y + 30 }
    ]
  }));
  return {
    schemaVersion: 1,
    id: 'synthetic-model',
    name: 'Synthetic diff fixture',
    elements,
    relationships,
    views: [{ id: 'synthetic-view', name: 'Synthetic view', nodes, connections }],
    diagnostics: []
  };
}

function fingerprint(before: ModelDto, after: ModelDto): string {
  return createHash('sha256').update(JSON.stringify({
    fixtureVersion: DTO_DIFF_FIXTURE_VERSION,
    before,
    after
  })).digest('hex');
}

/** Create deterministic fixture pairs without reading model files or network data. */
export function createDtoDiffFixture(tier: DtoDiffTier): DtoDiffFixture {
  if (!Number.isInteger(tier.size) || tier.size < 2) {
    throw new TypeError('DTO diff tiers require at least two elements.');
  }
  const before = makeModel(tier.size);
  const unchangedAfter = structuredClone(before);
  const representativeAfter = structuredClone(before);
  const changedIndex = Math.min(Math.floor(tier.size / 2), tier.size - 2);
  representativeAfter.elements[changedIndex].name = 'Synthetic changed process';
  representativeAfter.relationships[changedIndex].type = 'archimate:Flow';
  representativeAfter.views[0].nodes[changedIndex].x += 10;
  representativeAfter.views[0].connections[changedIndex].waypoints[0].x += 10;
  return {
    fixtureVersion: DTO_DIFF_FIXTURE_VERSION,
    provenance: 'SYNTHETIC',
    tier,
    before,
    unchangedAfter,
    representativeAfter,
    fixtureFingerprint: fingerprint(before, representativeAfter)
  };
}
