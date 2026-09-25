type Data = Record<string, unknown>;

function failure(): never {
  const error = new Error('The model cannot be serialized as the supported MEFF subset.') as
    Error & { code: string };
  error.code = 'MEFF_EXPORT_INVALID';
  throw error;
}

function data(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return failure();
  return value as Data;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) return failure();
  return value;
}

function text(value: unknown, escape: (value: unknown) => string): string {
  if (typeof value !== 'string') return failure();
  return escape(value);
}

export function serializePropertyDefinitions(value: unknown, id: (value: unknown) => string,
  escape: (value: unknown) => string): string {
  if (value === undefined) return '';
  const definitions = list(value);
  if (!definitions.length) return failure();
  return '<propertyDefinitions>' + definitions.map((raw) => {
    const definition = data(raw);
    const kind = definition.type;
    if (!['string', 'boolean', 'integer', 'real'].includes(String(kind))) return failure();
    const type = text(kind, escape);
    const name = definition.name === undefined ? '' :
      '<name>' + text(definition.name, escape) + '</name>';
    const documentation = definition.documentation === undefined ? '' :
      '<documentation>' + text(definition.documentation, escape) + '</documentation>';
    return '<propertyDefinition identifier="' + id(definition.id) + '" type="' + type + '">' +
      name + documentation + '</propertyDefinition>';
  }).join('') + '</propertyDefinitions>';
}

export function serializeConceptProperties(value: unknown, definitions: Set<string>,
  escape: (value: unknown) => string): string {
  if (value === undefined) return '';
  const properties = list(value);
  if (!properties.length) return '';
  return '<properties>' + properties.map((raw) => {
    const property = data(raw);
    const reference = property.propertyDefinitionRef;
    if (typeof reference !== 'string' || !definitions.has(reference)) return failure();
    const values = list(property.values);
    if (!values.length) return failure();
    const serialized = values.map((rawValue) => {
      const item = data(rawValue);
      if (typeof item.value !== 'string' || item.language !== undefined &&
          typeof item.language !== 'string') return failure();
      const language = item.language ? ' xml:lang="' + escape(item.language) + '"' : '';
      return '<value' + language + '>' + escape(item.value) + '</value>';
    }).join('');
    return '<property propertyDefinitionRef="' + escape(reference) + '">' +
      serialized + '</property>';
  }).join('') + '</properties>';
}
