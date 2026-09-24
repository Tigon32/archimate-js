import { SaxesParser } from 'saxes';

const ARCHIMATE_NS = 'http://www.opengroup.org/xsd/archimate/3.0/';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';

/**
 * Parse the supported MEFF 3.1 Model records into this package's internal moddle
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
  let unsupportedModelRecords = false;
  const elements = [];
  const relationships = [];
  const propertyDefinitions = [];
  const propertyDefinitionsById = Object.create(null);
  const properties = [];
  const organizationItems = [];
  const organizations = [];
  const elementsById = Object.create(null);
  const relationshipsById = Object.create(null);

  parser.on('opentag', (tag) => {
    const local = tag.local || tag.name.split(':').pop();
    const parentFrame = stack[stack.length - 1];
    const parent = parentFrame?.local;
    const frame = { local, record: null, field: null, value: '' };
    const supported = tag.uri === ARCHIMATE_NS;

    if (!model && local === 'model' && tag.uri === ARCHIMATE_NS) {
      const id = getAttribute(tag.attributes, 'identifier');
      if (id !== undefined) {
        model = moddle.create('archimate:Model', { id });
        currentRecord = model;
        model.localizedNames = [];
        model.version = getAttribute(tag.attributes, 'version');
      }
    } else if (model && supported && parent === 'elements' && local === 'element') {
      const semanticType = getXsiType(tag.attributes);
      const element = moddle.create('archimate:Group', {
        id: getAttribute(tag.attributes, 'identifier')
      });
      element.type = semanticType;
      element.conceptType = semanticType;
      element.localizedNames = [];
      elements.push(element);
      if (element.id) elementsById[element.id] = element;
      currentRecord = element;
      frame.record = element;
    } else if (model && supported && parent === 'relationships' && local === 'relationship') {
      const semanticType = getXsiType(tag.attributes);
      const relationship = moddle.create('archimate:Relationship', {
        id: getAttribute(tag.attributes, 'identifier')
      });
      relationship.type = semanticType;
      relationship.conceptType = semanticType;
      relationship.localizedNames = [];
      relationship.sourceRefId = getAttribute(tag.attributes, 'source');
      relationship.targetRefId = getAttribute(tag.attributes, 'target');
      relationships.push(relationship);
      if (relationship.id) relationshipsById[relationship.id] = relationship;
      currentRecord = relationship;
      frame.record = relationship;
    } else if (model && supported && parent === 'model' && local === 'metadata') {
      frame.record = model.metadata = {};
    } else if (model && supported && parent === 'metadata' && local === 'schemaInfo') {
      const metadata = parentFrame.record;
      metadata.schemaInfo ||= [];
      frame.record = {};
      metadata.schemaInfo.push(frame.record);
    } else if (model && supported && ['metadata', 'schemaInfo'].includes(parent) &&
        ['schema', 'schemaversion'].includes(local)) {
      frame.record = parentFrame.record;
      frame.field = local;
      textField = frame;
    } else if (model && supported && parent === 'model' && local === 'organizations') {
      frame.record = { items: [] };
      organizations.push(frame.record);
    } else if (model && supported && ['organizations', 'item'].includes(parent) && local === 'item') {
      frame.record = {
        id: getAttribute(tag.attributes, 'identifier'),
        identifierRef: getAttribute(tag.attributes, 'identifierRef'),
        localizedLabels: [], items: []
      };
      parentFrame.record.items.push(frame.record);
      organizationItems.push(frame.record);
    } else if (model && supported && parent === 'propertyDefinitions' && local === 'propertyDefinition') {
      frame.record = {
        id: getAttribute(tag.attributes, 'identifier'),
        type: getAttribute(tag.attributes, 'type'), localizedNames: []
      };
      propertyDefinitions.push(frame.record);
      if (frame.record.id) propertyDefinitionsById[frame.record.id] = frame.record;
    } else if (model && supported && ['model', 'element', 'relationship'].includes(parent) && local === 'properties') {
      frame.record = parent === 'model' ? model : currentRecord;
      frame.record.properties = [];
    } else if (model && supported && parent === 'properties' && local === 'property' &&
        parentFrame.record?.properties) {
      frame.record = { propertyDefinitionRef: getAttribute(tag.attributes, 'propertyDefinitionRef'), values: [] };
      parentFrame.record.properties.push(frame.record);
      properties.push(frame.record);
    } else if (model && supported && parent === 'property' && local === 'value') {
      frame.record = parentFrame.record;
      frame.field = 'value';
      frame.language = getLanguage(tag.attributes);
      textField = frame;
    } else if (model && supported && (
      (['model', 'element', 'relationship', 'propertyDefinition'].includes(parent) &&
        ['name', 'documentation'].includes(local)) ||
      (parent === 'item' && ['label', 'documentation'].includes(local))
    )) {
      frame.record = parent === 'model' ? model : parentFrame.record || currentRecord;
      frame.field = local;
      frame.language = getLanguage(tag.attributes);
      textField = frame;
    } else if (model && supported && ['element', 'relationship'].includes(parent)) {
      unsupportedFields = true;
    } else if (model && supported && ['model', 'metadata', 'schemaInfo', 'organizations', 'item',
      'propertyDefinitions', 'propertyDefinition', 'properties', 'property'
    ].includes(parent) && !['elements', 'relationships', 'views', 'propertyDefinitions'].includes(local) &&
        !(['properties', 'property'].includes(parent) && !parentFrame.record)) {
      unsupportedModelRecords = true;
    }

    stack.push(frame);
  });

  parser.on('text', (text) => {
    if (!textField) return;
    textField.value = (textField.value || '') + text;
  });
  parser.on('cdata', (text) => {
    if (textField) textField.value += text;
  });
  parser.on('closetag', () => {
    const frame = stack.pop();
    if (!frame) return;
    if (frame.field && frame.record) {
      const value = frame.value || '';
      if (frame.field === 'schema' || frame.field === 'schemaversion') {
        frame.record[frame.field] = value;
      } else if (frame.field === 'value') {
        frame.record.values.push({ language: frame.language, value });
      } else if (value.trim()) {
        if (frame.field === 'name') {
          const localized = { language: frame.language, value: value.trim() };
          frame.record.localizedNames.push(localized);
          if (!frame.record.name || frame.language === 'en' || frame.language === 'en-US') {
            frame.record.name = value.trim();
          }
        } else if (frame.field === 'label') {
          frame.record.localizedLabels.push({ language: frame.language, value: value.trim() });
          if (!frame.record.label || frame.language === 'en' || frame.language === 'en-US') {
            frame.record.label = value.trim();
          }
        } else {
          frame.record.documentation = frame.record.documentation ? frame.record.documentation + '\n' + value.trim() : value.trim();
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
    relationship.source = elementsById[relationship.sourceRefId];
    relationship.target = elementsById[relationship.targetRefId];
  });
  relationshipsNode.relationships = relationships;
  model.relationshipsNode = relationshipsNode;
  model.elementsById = elementsById;
  model.relationshipsById = relationshipsById;
  model.propertyDefinitions = propertyDefinitions;
  model.propertyDefinitionsById = propertyDefinitionsById;
  model.organizations = organizations;
  properties.forEach((property) => {
    property.propertyDefinition = propertyDefinitionsById[property.propertyDefinitionRef];
  });
  organizationItems.forEach((item) => {
    item.referencedConcept = elementsById[item.identifierRef] || relationshipsById[item.identifierRef];
  });

  const diagnostics = [];
  if (relationships.some((relationship) => !relationship.source || !relationship.target) ||
      properties.some((property) => !property.propertyDefinition) ||
      organizationItems.some((item) => item.identifierRef && !item.referencedConcept)) {
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
  if (unsupportedModelRecords) diagnostics.push({
    code: 'MEFF_MODEL_METADATA_UNSUPPORTED',
    severity: 'warning', stage: 'parse',
    message: 'One or more Model Exchange model metadata or organization records are not reconstructed by this importer.'
  });

  return {
    rootElement: model,
    references: [],
    warnings: [],
    elementsById,
    diagnostics
  };
}

function getXsiType(attributes) {
  return getAttribute(attributes, '{' + XSI_NS + '}type') || getAttribute(attributes, 'xsi:type') || null;
}

function getLanguage(attributes) {
  return getAttribute(attributes, '{http://www.w3.org/XML/1998/namespace}lang') ||
    getAttribute(attributes, 'xml:lang') || null;
}

function getAttribute(attributes, name) {
  const attribute = attributes[name];
  return attribute && typeof attribute === 'object' && 'value' in attribute ?
    attribute.value : attribute;
}
