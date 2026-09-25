import { isIdentifier } from './validate.js';

const MAX_DIAGNOSTIC_IDENTIFIER_LENGTH = 128;

export type RelationshipEditOperation = 'connect' | 'reconnect';

export type RelationshipEditDiagnosticCode =
  | 'DTO_RELATIONSHIP_MALFORMED_ID'
  | 'DTO_RELATIONSHIP_DUPLICATE_CONNECTION'
  | 'DTO_RELATIONSHIP_ID_CONFLICT'
  | 'DTO_RELATIONSHIP_ID_MISMATCH'
  | 'DTO_RELATIONSHIP_RETARGET_CONFLICT'
  | 'DTO_RELATIONSHIP_ENDPOINT_MISMATCH'
  | 'DTO_RELATIONSHIP_ENDPOINT_INVALID'
  | 'DTO_RELATIONSHIP_VIEW_NOT_FOUND'
  | 'DTO_RELATIONSHIP_CONNECTION_NOT_FOUND'
  | 'DTO_RELATIONSHIP_NOT_FOUND'
  | 'DTO_RELATIONSHIP_DISALLOWED'
  | 'DTO_RELATIONSHIP_UNSUPPORTED';

export type RelationshipEditDiagnosticCategory =
  | 'malformed-id'
  | 'duplicate-conflict'
  | 'identifier-mismatch'
  | 'retarget-conflict'
  | 'invalid-endpoint'
  | 'missing-reference'
  | 'missing-relationship'
  | 'invalid-semantics'
  | 'unsupported-profile';

export interface RelationshipEditDiagnostic {
  code: RelationshipEditDiagnosticCode;
  category: RelationshipEditDiagnosticCategory;
  severity: 'error';
  operation: RelationshipEditOperation;
  message: string;
  viewId?: string;
  connectionId?: string;
  relationshipId?: string;
  sourceId?: string;
  targetId?: string;
  sourceElementId?: string;
  targetElementId?: string;
}

type RelationshipEditContext = Omit<RelationshipEditDiagnostic,
  'code' | 'category' | 'severity' | 'operation' | 'message'>;

const DIAGNOSTICS: Record<RelationshipEditDiagnosticCode, {
  category: RelationshipEditDiagnosticCategory;
  message: string;
}> = {
  DTO_RELATIONSHIP_MALFORMED_ID: {
    category: 'malformed-id',
    message: 'Use identifiers beginning with a letter or underscore and containing only letters, digits, dots, underscores, or hyphens.'
  },
  DTO_RELATIONSHIP_DUPLICATE_CONNECTION: {
    category: 'duplicate-conflict',
    message: 'Choose a connection identifier that is not already used in this view.'
  },
  DTO_RELATIONSHIP_ID_CONFLICT: {
    category: 'duplicate-conflict',
    message: 'Choose a relationship identifier that is not already used by a model concept.'
  },
  DTO_RELATIONSHIP_ID_MISMATCH: {
    category: 'identifier-mismatch',
    message: 'Use the same identifier for the new relationship and the connection that references it.'
  },
  DTO_RELATIONSHIP_RETARGET_CONFLICT: {
    category: 'retarget-conflict',
    message: 'This relationship is referenced by another connection; change all references together or use a separate relationship.'
  },
  DTO_RELATIONSHIP_ENDPOINT_MISMATCH: {
    category: 'invalid-endpoint',
    message: 'The selected view nodes do not match this relationship; choose its existing endpoints or create a separate relationship.'
  },
  DTO_RELATIONSHIP_ENDPOINT_INVALID: {
    category: 'invalid-endpoint',
    message: 'Choose existing element nodes as both relationship endpoints.'
  },
  DTO_RELATIONSHIP_VIEW_NOT_FOUND: {
    category: 'missing-reference',
    message: 'Choose a view that exists in the current model.'
  },
  DTO_RELATIONSHIP_CONNECTION_NOT_FOUND: {
    category: 'missing-reference',
    message: 'Choose a connection that exists in the selected view.'
  },
  DTO_RELATIONSHIP_NOT_FOUND: {
    category: 'missing-relationship',
    message: 'The relationship identifier does not resolve to an existing relationship.'
  },
  DTO_RELATIONSHIP_DISALLOWED: {
    category: 'invalid-semantics',
    message: 'The endpoint and relationship types are disallowed by the reviewed ArchiMate 3.2 profile; choose a permitted combination.'
  },
  DTO_RELATIONSHIP_UNSUPPORTED: {
    category: 'unsupported-profile',
    message: 'The combination is not covered by the reviewed ArchiMate 3.2 profile; use a reviewed combination or leave the imported relationship unchanged.'
  }
};

function safeIdentifier(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return isIdentifier(value) && value.length <= MAX_DIAGNOSTIC_IDENTIFIER_LENGTH ?
    value : '[REDACTED]';
}

export class RelationshipEditError extends TypeError {
  readonly code: RelationshipEditDiagnosticCode;
  readonly diagnostic: RelationshipEditDiagnostic;

  constructor(code: RelationshipEditDiagnosticCode, operation: RelationshipEditOperation,
    context: RelationshipEditContext = {}) {
    const definition = DIAGNOSTICS[code];
    super(definition.message);
    this.name = 'RelationshipEditError';
    this.code = code;
    this.diagnostic = {
      code, category: definition.category, severity: 'error', operation,
      message: definition.message,
      ...(safeIdentifier(context.viewId) ? { viewId: safeIdentifier(context.viewId) } : {}),
      ...(safeIdentifier(context.connectionId) ? { connectionId: safeIdentifier(context.connectionId) } : {}),
      ...(safeIdentifier(context.relationshipId) ? { relationshipId: safeIdentifier(context.relationshipId) } : {}),
      ...(safeIdentifier(context.sourceId) ? { sourceId: safeIdentifier(context.sourceId) } : {}),
      ...(safeIdentifier(context.targetId) ? { targetId: safeIdentifier(context.targetId) } : {}),
      ...(safeIdentifier(context.sourceElementId) ?
        { sourceElementId: safeIdentifier(context.sourceElementId) } : {}),
      ...(safeIdentifier(context.targetElementId) ?
        { targetElementId: safeIdentifier(context.targetElementId) } : {})
    };
  }
}

export function rejectRelationshipEdit(code: RelationshipEditDiagnosticCode,
  operation: RelationshipEditOperation, context: RelationshipEditContext = {}): never {
  throw new RelationshipEditError(code, operation, context);
}
