import { SaxesParser } from 'saxes';

const ARCHIMATE_NS = 'http://www.opengroup.org/xsd/archimate/3.0/';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';

/**
 * Parse the supported MEFF 3.1 Model core into this package's internal moddle
 * objects. This deliberately does not validate XSD constraints or ArchiMate
 * relationship semantics; the separate CI schema gate checks the former.
 */
export function parseMeffModel(xml, moddle) {
  const parser = new SaxesParser({ xmlns: true, fragment: false });
  const stack = [];
  let model;
  let currentRecord = null;
  let textField = null;
  let unsupportedFields = false;
  const elements = [];
  const relationships = [];
  const byId = Object.create(null);

  parser.on('opentag', (tag) => {
    const local = tag.local || tag.name.split(':').pop();
    const parent = stack[stack.length - 1];
    const frame = { local, record: null, field: null, value: '' };

    if (!model && local === 'model' && tag.uri === ARCHIMATE_NS) {
      const id = tag.attributes.identifier;
      if (id !== undefined) {
        model = moddle.create('archimate:Model', { id });
        currentRecord = model;
        model.localizedNames = [];
      }
    } else if (model && parent === 'elements' && local === 'element') {
      const semanticType = getXsiType(tag.attributes);
      const element = moddle.create('archimate:Group', {
        id: tag.attributes.identifier
      });
      element.type = semanticType;
      element.conceptType = semanticType;
      element.localizedNames = [];
      elements.push(element);
      if (element.id) byId[element.id] = element;
      currentRecord = element;
      frame.record = element;
    } else if (model && parent === 'relationships' && local === 'relationship') {
      const semanticType = getXsiType(tag.attributes);
      const relationship = moddle.create('archimate:Relationship', {
        id: tag.attributes.identifier
      });
      relationship.type = semanticType;
      relationship.conceptType = semanticType;
      relationship.localizedNames = [];
      relationship.sourceRefId = tag.attributes.source;
      relationship.targetRefId = tag.attributes.target;
      relationships.push(relationship);
      if (relationship.id) byId[relationship.id] = relationship;
      currentRecord = relationship;
      frame.record = relationship;
    } else if (model && currentRecord && (local === 'name' || local === 'documentation')) {
      frame.record = currentRecord;
      frame.field = local;
      frame.language = tag.attributes['{http://www.w3.org/XML/1998/namespace}lang'] ||
        tag.attributes['xml:lang'] || null;
      textField = frame;
    } else if (model && currentRecord && currentRecord !== model &&
        stack.length > 0 && (parent === 'element' || parent === 'relationship')) {
      if (local !== 'name' && local !== 'documentation') unsupportedFields = true;
    }

    stack.push(frame);
  });

  parser.on('text', (text) => {
    if (!textField) return;
    textField.value = (textField.value || '') + text;
  });
  parser.on('closetag', () => {
    const frame = stack.pop();
    if (!frame) return;
    if (frame.field && frame.record) {
      const value = (frame.value || '').trim();
      if (value) {
        if (frame.field === 'name') {
          const localized = { language: frame.language, value };
          frame.record.localizedNames.push(localized);
          if (!frame.record.name || frame.language === 'en' || frame.language === 'en-US') {
            frame.record.name = value;
          }
        } else {
          frame.record.documentation = frame.record.documentation ?
            frame.record.documentation + '\n' + value : value;
        }
      }
      textField = null;
    }
    if (frame.local === 'element' || frame.local === 'relationship') currentRecord = model;
  });
  parser.on('error', (error) => { throw error; });
  parser.write(xml).close();

  if (!model) return null;

  const elementsNode = moddle.create('archimate:Elements');
  elementsNode.baseElements = elements;
  model.elementsNode = elementsNode;

  const relationshipsNode = moddle.create('archimate:Relationships');
  relationships.forEach((relationship) => {
    relationship.source = byId[relationship.sourceRefId];
    relationship.target = byId[relationship.targetRefId];
  });
  relationshipsNode.relationships = relationships;
  model.relationshipsNode = relationshipsNode;
  const relationshipById = Object.create(null);
  relationships.forEach((relationship) => {
    if (relationship.id) relationshipById[relationship.id] = relationship;
  });
  model.elementsById = byId;
  model.relationshipsById = relationshipById;

  const diagnostics = [];
  if (relationships.some((relationship) => !relationship.source || !relationship.target)) {
    diagnostics.push({
      code: 'IMPORT_REFERENCE_UNRESOLVED',
      severity: 'warning',
      stage: 'parse',
      message: 'One or more model references could not be resolved.'
    });
  }
  if (unsupportedFields) diagnostics.push({
    code: 'MEFF_MODEL_FIELDS_UNSUPPORTED',
    severity: 'warning',
    stage: 'parse',
    message: 'One or more Model element or relationship fields are not reconstructed by this importer.'
  });

  return {
    rootElement: model,
    references: [],
    warnings: [],
    elementsById: byId,
    diagnostics
  };
}

function getXsiType(attributes) {
  return attributes['{' + XSI_NS + '}type'] || attributes['xsi:type'] || null;
}
