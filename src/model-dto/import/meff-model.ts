import { SaxesParser, type SaxesTagNS } from 'saxes';

const ARCHIMATE_NS = 'http://www.opengroup.org/xsd/archimate/3.0/';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
type DataRecord = Record<string, unknown>;
type RecordMap = Record<string, DataRecord>;

export interface ModdleFactory {
  create(type: string, attributes: Record<string, unknown>): DataRecord;
}

export interface MeffModelResult {
  rootElement: DataRecord;
  references: unknown[];
  warnings: unknown[];
  elementsById: RecordMap;
  diagnostics: ModelDiagnostic[];
}

interface ModelDiagnostic {
  code: string;
  severity: 'warning';
  stage: 'parse';
  message: string;
}

interface Frame {
  local: string;
  record: DataRecord | null;
  field: string | null;
  value: string;
  language?: string | null;
}

/** Parse supported MEFF 3.1 model records into internal moddle-shaped objects. */
export function parseMeffModel(xml: string, moddle: ModdleFactory): MeffModelResult | null {
  return new ModelParser(moddle).parse(xml);
}

class ModelParser {
  private readonly stack: Frame[] = [];
  private readonly elements: DataRecord[] = [];
  private readonly relationships: DataRecord[] = [];
  private readonly propertyDefinitions: DataRecord[] = [];
  private readonly properties: DataRecord[] = [];
  private readonly organizationItems: DataRecord[] = [];
  private readonly organizations: DataRecord[] = [];
  private readonly elementsById: RecordMap = Object.create(null) as RecordMap;
  private readonly relationshipsById: RecordMap = Object.create(null) as RecordMap;
  private readonly propertyDefinitionsById: RecordMap = Object.create(null) as RecordMap;
  private model: DataRecord | null = null;
  private currentRecord: DataRecord | null = null;
  private textField: Frame | null = null;
  private unsupportedFields = false;
  private unsupportedModelRecords = false;

  constructor(private readonly moddle: ModdleFactory) {}

  parse(xml: string): MeffModelResult | null {
    const parser = new SaxesParser({ xmlns: true, fragment: false });
    parser.on('opentag', (tag) => this.open(tag));
    parser.on('text', (text) => this.appendText(text));
    parser.on('cdata', (text) => this.appendText(text));
    parser.on('closetag', () => this.close());
    parser.on('error', (error) => { throw error; });
    parser.write(xml).close();
    return this.finish();
  }

  private open(tag: SaxesTagNS): void {
    const local = tag.local || tag.name.split(':').pop() || tag.name;
    const parentFrame = this.stack.at(-1);
    const frame: Frame = { local, record: null, field: null, value: '' };
    if (!this.model && local === 'model' && tag.uri === ARCHIMATE_NS) {
      this.openModel(tag);
    } else if (this.model && tag.uri === ARCHIMATE_NS) {
      this.openSupported(frame, tag, parentFrame, parentFrame?.local);
    }
    this.stack.push(frame);
  }

  private openModel(tag: SaxesTagNS): void {
    const id = getAttribute(tag.attributes, 'identifier');
    if (id === undefined) return;
    this.model = this.moddle.create('archimate:Model', { id });
    this.currentRecord = this.model;
    this.model.localizedNames = [];
    this.model.version = getAttribute(tag.attributes, 'version');
  }

  private openSupported(frame: Frame, tag: SaxesTagNS, parentFrame: Frame | undefined,
    parent: string | undefined): void {
    if (parentFrame && this.openConcept(frame, tag, parent)) return;
    if (this.openMetadata(frame, tag, parentFrame, parent)) return;
    if (this.openOrganization(frame, tag, parentFrame, parent)) return;
    if (this.openProperties(frame, tag, parentFrame, parent)) return;
    if (this.openTextField(frame, tag, parentFrame, parent)) return;
    this.markUnsupported(parent, frame.local, parentFrame);
  }

  private openConcept(frame: Frame, tag: SaxesTagNS, parent: string | undefined): boolean {
    if (parent === 'elements' && frame.local === 'element') {
      this.openElement(frame, tag);
      return true;
    }
    if (parent === 'relationships' && frame.local === 'relationship') {
      this.openRelationship(frame, tag);
      return true;
    }
    return false;
  }

  private openElement(frame: Frame, tag: SaxesTagNS): void {
    const semanticType = getXsiType(tag.attributes);
    const element = this.moddle.create('archimate:Group', {
      id: getAttribute(tag.attributes, 'identifier')
    });
    element.type = semanticType;
    element.conceptType = semanticType;
    element.localizedNames = [];
    this.elements.push(element);
    indexById(this.elementsById, element);
    this.currentRecord = element;
    frame.record = element;
  }

  private openRelationship(frame: Frame, tag: SaxesTagNS): void {
    const semanticType = getXsiType(tag.attributes);
    const relationship = this.moddle.create('archimate:Relationship', {
      id: getAttribute(tag.attributes, 'identifier')
    });
    relationship.type = semanticType;
    relationship.conceptType = semanticType;
    relationship.localizedNames = [];
    relationship.sourceRefId = getAttribute(tag.attributes, 'source');
    relationship.targetRefId = getAttribute(tag.attributes, 'target');
    this.relationships.push(relationship);
    indexById(this.relationshipsById, relationship);
    this.currentRecord = relationship;
    frame.record = relationship;
  }

  private openMetadata(frame: Frame, tag: SaxesTagNS, parentFrame: Frame | undefined,
    parent: string | undefined): boolean {
    if (parent === 'model' && frame.local === 'metadata') {
      this.model!.metadata = {};
      frame.record = asRecord(this.model!.metadata);
      return true;
    }
    if (parent === 'metadata' && frame.local === 'schemaInfo' && parentFrame) {
      const metadata = parentFrame.record;
      if (!metadata) return true;
      const entries = ensureArray(metadata, 'schemaInfo');
      frame.record = {};
      entries.push(frame.record);
      return true;
    }
    if (['metadata', 'schemaInfo'].includes(parent || '') &&
        ['schema', 'schemaversion'].includes(frame.local) && parentFrame?.record) {
      frame.record = parentFrame.record;
      frame.field = frame.local;
      this.textField = frame;
      return true;
    }
    return false;
  }

  private openOrganization(frame: Frame, tag: SaxesTagNS, parentFrame: Frame | undefined,
    parent: string | undefined): boolean {
    if (parent === 'model' && frame.local === 'organizations') {
      frame.record = { items: [] };
      this.organizations.push(frame.record);
      return true;
    }
    if (['organizations', 'item'].includes(parent || '') && frame.local === 'item' && parentFrame?.record) {
      frame.record = {
        id: getAttribute(tag.attributes, 'identifier'),
        identifierRef: getAttribute(tag.attributes, 'identifierRef'),
        localizedLabels: [], items: []
      };
      ensureArray(parentFrame.record, 'items').push(frame.record);
      this.organizationItems.push(frame.record);
      return true;
    }
    return false;
  }

  private openProperties(frame: Frame, tag: SaxesTagNS, parentFrame: Frame | undefined,
    parent: string | undefined): boolean {
    if (parent === 'propertyDefinitions' && frame.local === 'propertyDefinition') {
      this.openPropertyDefinition(frame, tag);
      return true;
    }
    if (['model', 'element', 'relationship'].includes(parent || '') && frame.local === 'properties') {
      frame.record = parent === 'model' ? this.model : this.currentRecord;
      if (frame.record) frame.record.properties = [];
      return true;
    }
    if (parent === 'properties' && frame.local === 'property' && parentFrame?.record) {
      this.openProperty(frame, tag, parentFrame.record);
      return true;
    }
    if (parent === 'property' && frame.local === 'value' && parentFrame?.record) {
      frame.record = parentFrame.record;
      frame.field = 'value';
      frame.language = getLanguage(tag.attributes);
      this.textField = frame;
      return true;
    }
    return false;
  }

  private openPropertyDefinition(frame: Frame, tag: SaxesTagNS): void {
    frame.record = {
      id: getAttribute(tag.attributes, 'identifier'),
      type: getAttribute(tag.attributes, 'type'), localizedNames: []
    };
    this.propertyDefinitions.push(frame.record);
    indexById(this.propertyDefinitionsById, frame.record);
  }

  private openProperty(frame: Frame, tag: SaxesTagNS, parent: DataRecord): void {
    frame.record = {
      propertyDefinitionRef: getAttribute(tag.attributes, 'propertyDefinitionRef'), values: []
    };
    ensureArray(parent, 'properties').push(frame.record);
    this.properties.push(frame.record);
  }

  private openTextField(frame: Frame, tag: SaxesTagNS, parentFrame: Frame | undefined,
    parent: string | undefined): boolean {
    const conceptText = ['model', 'element', 'relationship', 'propertyDefinition'].includes(parent || '') &&
      ['name', 'documentation'].includes(frame.local);
    const itemText = parent === 'item' && ['label', 'documentation'].includes(frame.local);
    if (!conceptText && !itemText) return false;
    frame.record = parent === 'model' ? this.model : parentFrame?.record || this.currentRecord;
    frame.field = frame.local;
    frame.language = getLanguage(tag.attributes);
    this.textField = frame;
    return true;
  }

  private markUnsupported(parent: string | undefined, local: string, parentFrame: Frame | undefined): void {
    if (['element', 'relationship'].includes(parent || '')) this.unsupportedFields = true;
    const modelParents = ['model', 'metadata', 'schemaInfo', 'organizations', 'item',
      'propertyDefinitions', 'propertyDefinition', 'properties', 'property'];
    const allowedContainers = ['elements', 'relationships', 'views', 'propertyDefinitions'];
    const missingContainer = ['properties', 'property'].includes(parent || '') && !parentFrame?.record;
    if (modelParents.includes(parent || '') && !allowedContainers.includes(local) && !missingContainer) {
      this.unsupportedModelRecords = true;
    }
  }

  private appendText(text: string): void {
    if (this.textField) this.textField.value += text;
  }

  private close(): void {
    const frame = this.stack.pop();
    if (!frame) return;
    if (frame.field && frame.record) this.finishTextField(frame);
    if (frame.local === 'element' || frame.local === 'relationship') this.currentRecord = this.model;
  }

  private finishTextField(frame: Frame): void {
    const value = frame.value || '';
    if (frame.field === 'schema' || frame.field === 'schemaversion') {
      frame.record![frame.field] = value;
    } else if (frame.field === 'value') {
      ensureArray(frame.record!, 'values').push({ language: frame.language, value });
    } else if (value.trim()) {
      this.finishLocalizedField(frame, value.trim());
    }
    this.textField = null;
  }

  private finishLocalizedField(frame: Frame, value: string): void {
    if (frame.field === 'name') {
      ensureArray(frame.record!, 'localizedNames').push({ language: frame.language, value });
      if (preferLanguage(frame.record!, 'name', frame.language)) frame.record!.name = value;
    } else if (frame.field === 'label') {
      ensureArray(frame.record!, 'localizedLabels').push({ language: frame.language, value });
      if (preferLanguage(frame.record!, 'label', frame.language)) frame.record!.label = value;
    } else {
      const prior = frame.record!.documentation;
      frame.record!.documentation = prior ? `${String(prior)}\n${value}` : value;
    }
  }

  private finish(): MeffModelResult | null {
    if (!this.model) return null;
    this.attachModelCollections();
    this.resolveReferences();
    return {
      rootElement: this.model, references: [], warnings: [], elementsById: this.elementsById,
      diagnostics: this.diagnostics()
    };
  }

  private attachModelCollections(): void {
    const elementsNode = this.moddle.create('archimate:Elements', {});
    elementsNode.baseElements = this.elements;
    this.model!.elementsNode = elementsNode;
    const relationshipsNode = this.moddle.create('archimate:Relationships', {});
    relationshipsNode.relationships = this.relationships;
    this.model!.relationshipsNode = relationshipsNode;
    this.model!.elementsById = this.elementsById;
    this.model!.relationshipsById = this.relationshipsById;
    this.model!.propertyDefinitions = this.propertyDefinitions;
    this.model!.propertyDefinitionsById = this.propertyDefinitionsById;
    this.model!.organizations = this.organizations;
  }

  private resolveReferences(): void {
    this.relationships.forEach((relationship) => {
      relationship.source = this.elementsById[String(relationship.sourceRefId)];
      relationship.target = this.elementsById[String(relationship.targetRefId)];
    });
    this.properties.forEach((property) => {
      property.propertyDefinition = this.propertyDefinitionsById[String(property.propertyDefinitionRef)];
    });
    this.organizationItems.forEach((item) => {
      item.referencedConcept = this.elementsById[String(item.identifierRef)] ||
        this.relationshipsById[String(item.identifierRef)];
    });
  }

  private diagnostics(): ModelDiagnostic[] {
    const messages: ModelDiagnostic[] = [];
    if (this.hasUnresolvedReferences()) messages.push(diagnostic(
      'IMPORT_REFERENCE_UNRESOLVED', 'One or more model references could not be resolved.'
    ));
    if (this.unsupportedFields) messages.push(diagnostic(
      'MEFF_MODEL_FIELDS_UNSUPPORTED',
      'One or more Model element or relationship fields are not reconstructed by this importer.'
    ));
    if (this.unsupportedModelRecords) messages.push(diagnostic(
      'MEFF_MODEL_METADATA_UNSUPPORTED',
      'One or more Model Exchange model metadata or organization records are not reconstructed by this importer.'
    ));
    return messages;
  }

  private hasUnresolvedReferences(): boolean {
    const missingRelationship = this.relationships.some((entry) => !entry.source || !entry.target);
    const missingProperty = this.properties.some((entry) => !entry.propertyDefinition);
    const missingOrganization = this.organizationItems.some((item) =>
      item.identifierRef && !item.referencedConcept);
    return missingRelationship || missingProperty || Boolean(missingOrganization);
  }
}

function ensureArray(record: DataRecord, key: string): DataRecord[] {
  const value = record[key];
  if (Array.isArray(value)) return value as DataRecord[];
  const entries: DataRecord[] = [];
  record[key] = entries;
  return entries;
}

function asRecord(value: unknown): DataRecord {
  return value && typeof value === 'object' ? value as DataRecord : {};
}

function indexById(index: RecordMap, record: DataRecord): void {
  const id = record.id;
  if (typeof id === 'string' && id) index[id] = record;
}

function preferLanguage(record: DataRecord, field: string, language: string | null | undefined): boolean {
  return !record[field] || language === 'en' || language === 'en-US';
}

function getAttribute(attributes: SaxesTagNS['attributes'], name: string): string | undefined {
  const attribute = attributes[name];
  return attribute && typeof attribute === 'object' ? attribute.value : undefined;
}

function getXsiType(attributes: SaxesTagNS['attributes']): string | null {
  return getAttribute(attributes, `{${XSI_NS}}type`) || getAttribute(attributes, 'xsi:type') || null;
}

function getLanguage(attributes: SaxesTagNS['attributes']): string | null {
  return getAttribute(attributes, '{http://www.w3.org/XML/1998/namespace}lang') ||
    getAttribute(attributes, 'xml:lang') || null;
}

function diagnostic(code: string, message: string): ModelDiagnostic {
  return { code, severity: 'warning', stage: 'parse', message };
}
