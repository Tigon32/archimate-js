import { describe, expect, it } from 'vitest';

import {
  RELATIONSHIP_AGGREGATION,
  RELATIONSHIP_ASSOCIATION,
  RELATIONSHIP_FLOW,
  RELATIONSHIP_REALIZATION,
  RELATIONSHIP_SERVING,
  RELATIONSHIP_TRIGGERING
} from '../../lib/metamodel/Concept';
import {
  getRelationshipsAllowed,
  isRelationshipAllowed
} from '../../lib/util/RelationshipUtil';

describe('relationship rule utility', () => {
  it('returns allowed relationship kinds for an application component and service', () => {
    expect(getRelationshipsAllowed('ApplicationComponent', 'ApplicationService')).toEqual([
      RELATIONSHIP_AGGREGATION,
      RELATIONSHIP_REALIZATION,
      RELATIONSHIP_SERVING,
      RELATIONSHIP_TRIGGERING,
      RELATIONSHIP_FLOW,
      RELATIONSHIP_ASSOCIATION
    ]);
  });

  it('excludes the current relationship kind when requested', () => {
    expect(
      getRelationshipsAllowed('ApplicationComponent', 'ApplicationService', RELATIONSHIP_SERVING)
    ).not.toContain(RELATIONSHIP_SERVING);
  });

  it('checks whether an individual relationship kind is allowed', () => {
    expect(isRelationshipAllowed(
      'ApplicationComponent',
      'ApplicationService',
      RELATIONSHIP_SERVING
    )).toBe(true);
    expect(isRelationshipAllowed(
      'ApplicationComponent',
      'ApplicationService',
      'Composition'
    )).toBe(false);
  });
});
