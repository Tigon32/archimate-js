import { SaxesParser, type SaxesTagNS } from 'saxes';

const ARCHIMATE_NS = 'http://www.opengroup.org/xsd/archimate/3.0/';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';

export const IMPORT_XML_LIMITS = Object.freeze({
  maxBytes: 1_048_576,
  maxDepth: 64,
  maxNodes: 25_000,
  maxAttributes: 64
});

export interface XmlDiagnostic {
  code: string;
  severity: 'warning' | 'error';
  stage: 'parse';
  message: string;
}

export interface XmlPreflightResult {
  diagnostics: XmlDiagnostic[];
  warnings?: XmlDiagnostic[];
}

const UNSUPPORTED_MESSAGES: Record<string, string> = {
  MEFF_DIAGRAMS_UNSUPPORTED: 'One or more Model Exchange diagram records are not reconstructed by this importer.',
  MEFF_DIAGRAM_NODE_TYPE_UNSUPPORTED: 'A Model Exchange diagram node type is outside the supported presentation subset.',
  MEFF_DIAGRAM_CONNECTION_TYPE_UNSUPPORTED: 'A Model Exchange diagram connection type is outside the supported presentation subset.',
  MEFF_ELEMENTS_UNSUPPORTED: 'One or more Model Exchange element records are not reconstructed by this importer.',
  MEFF_EXTENSIONS_UNSUPPORTED: 'One or more Model Exchange extension records are not reconstructed by this importer.',
  MEFF_MODEL_METADATA_UNSUPPORTED: 'One or more Model Exchange model metadata or organization records are not reconstructed by this importer.',
  MEFF_RELATIONSHIPS_UNSUPPORTED: 'One or more Model Exchange relationship records are not fully reconstructed by this importer.',
  MEFF_VIEWPOINT_FIELD_UNSUPPORTED: 'A Model Exchange viewpoint field is outside the supported metadata subset.',
  MEFF_VIEWS_UNSUPPORTED: 'One or more Model Exchange view records are not reconstructed by this importer.'
};

const PARSE_WARNING_MESSAGES: Record<string, string> = {
  IMPORT_PARSE_WARNING: 'The parser reported a model issue that requires review.',
  IMPORT_REFERENCE_UNRESOLVED: 'One or more model references could not be resolved.',
  IMPORT_TYPE_UNSUPPORTED: 'One or more model types are not supported by this importer.'
};

const MODEL_CHILDREN: Record<string, string[]> = {
  metadata: ['schema', 'schemaversion', 'schemaInfo'],
  schemaInfo: ['schema', 'schemaversion'],
  organizations: ['item'],
  item: ['item', 'label', 'documentation'],
  properties: ['property'],
  propertyDefinitions: ['propertyDefinition'],
  propertyDefinition: ['name', 'documentation'],
  property: ['value']
};

/** Inspect XML before moddle parsing and return fixed, content-free diagnostics. */
export function preflightImportXml(xml: unknown): XmlPreflightResult {
  if (typeof xml !== 'string') return rejected('IMPORT_XML_INPUT_INVALID', 'XML input must be a string.');
  if (xml.length > IMPORT_XML_LIMITS.maxBytes ||
      new TextEncoder().encode(xml).byteLength > IMPORT_XML_LIMITS.maxBytes) {
    return rejected('XML_SIZE_LIMIT', 'XML size limit exceeded.');
  }
  return new XmlInspector().inspect(xml);
}

/** Map parser warnings to fixed diagnostics without returning parser text. */
export function summarizeParseWarnings(parseWarnings: unknown): XmlDiagnostic[] {
  const found = new Set<string>();
  if (Array.isArray(parseWarnings)) parseWarnings.forEach((warning: unknown) => {
    found.add(classifyParseWarning(warning));
  });
  return Array.from(found).sort().map((code) => warningDiagnostic(code));
}

class XmlInspector {
  private readonly stack: string[] = [];
  private readonly unsupported = new Set<string>();
  private depth = 0;
  private nodes = 0;
  private result: XmlDiagnostic | undefined;
  private blocked = false;

  inspect(xml: string): XmlPreflightResult {
    const parser = new SaxesParser({ xmlns: true, fragment: false });
    parser.on('doctype', () => this.block('XML_DTD_FORBIDDEN', 'DOCTYPE declarations are not accepted.'));
    parser.on('opentag', (tag) => this.open(tag));
    parser.on('closetag', () => this.close());
    parser.on('error', () => this.malformed());
    try {
      parser.write(xml).close();
    } catch {
      this.malformed();
    }
    return this.result ? { diagnostics: [this.result], warnings: [] } : {
      diagnostics: [], warnings: Array.from(this.unsupported).sort().map(exchangeWarning)
    };
  }

  private open(tag: SaxesTagNS): void {
    if (this.blocked) return;
    const name = tag.name.split(':').pop() || tag.name;
    const parent = this.stack.at(-1);
    this.nodes += 1;
    this.depth += 1;
    this.inspectRecordKinds(tag, name, parent);
    this.inspectNamespaces(tag);
    this.stack.push(name);
    this.checkLimits(tag);
  }

  private inspectRecordKinds(tag: SaxesTagNS, name: string, parent: string | undefined): void {
    if (parent === 'elements' && name === 'element' && !tag.attributes.identifier) {
      this.unsupported.add('MEFF_ELEMENTS_UNSUPPORTED');
    }
    if (parent === 'relationships' && name === 'relationship' && !tag.attributes.identifier) {
      this.unsupported.add('MEFF_RELATIONSHIPS_UNSUPPORTED');
    }
    this.inspectModelRecords(name, parent);
    this.inspectViewRecords(tag, name, parent);
  }

  private inspectModelRecords(name: string, parent: string | undefined): void {
    const allowed = MODEL_CHILDREN[parent || ''];
    if (allowed && !allowed.includes(name) && !this.stack.includes('views')) {
      this.unsupported.add('MEFF_MODEL_METADATA_UNSUPPORTED');
    }
  }

  private inspectViewRecords(tag: SaxesTagNS, name: string, parent: string | undefined): void {
    const inViews = this.stack.includes('views');
    if (inViews && name === 'view' && (parent !== 'diagrams' || getXsiType(tag) !== 'Diagram')) {
      this.unsupported.add('MEFF_VIEWS_UNSUPPORTED');
    }
    if (inViews && ['concern', 'modelingNote'].includes(name) && parent === 'viewpoint') {
      this.unsupported.add('MEFF_VIEWPOINT_FIELD_UNSUPPORTED');
    }
    if (inViews && name === 'node' && !['Element', 'Container', 'Label'].includes(getXsiType(tag) || '')) {
      this.unsupported.add('MEFF_DIAGRAM_NODE_TYPE_UNSUPPORTED');
    }
    if (inViews && name === 'connection' && !['Relationship', 'Line'].includes(getXsiType(tag) || '')) {
      this.unsupported.add('MEFF_DIAGRAM_CONNECTION_TYPE_UNSUPPORTED');
    }
    if (inViews && name === 'properties' && !['view', 'viewpoint'].includes(parent || '')) {
      this.unsupported.add('MEFF_DIAGRAMS_UNSUPPORTED');
    }
  }

  private inspectNamespaces(tag: SaxesTagNS): void {
    if (tag.uri && tag.uri !== ARCHIMATE_NS) this.unsupported.add('MEFF_EXTENSIONS_UNSUPPORTED');
    const foreignAttribute = Object.values(tag.attributes).some((attribute) =>
      attribute.uri && ![XMLNS_NS, XML_NS, XSI_NS].includes(attribute.uri));
    if (foreignAttribute) this.unsupported.add('MEFF_EXTENSIONS_UNSUPPORTED');
  }

  private checkLimits(tag: SaxesTagNS): void {
    if (this.nodes > IMPORT_XML_LIMITS.maxNodes) {
      this.block('XML_NODE_LIMIT', 'XML node limit exceeded.');
    }
    if (this.depth > IMPORT_XML_LIMITS.maxDepth) {
      this.block('XML_DEPTH_LIMIT', 'XML nesting limit exceeded.');
    }
    if (Object.keys(tag.attributes).length > IMPORT_XML_LIMITS.maxAttributes) {
      this.block('XML_ATTRIBUTE_LIMIT', 'XML attribute limit exceeded.');
    }
  }

  private close(): void {
    this.depth = Math.max(0, this.depth - 1);
    this.stack.pop();
  }

  private block(code: string, message: string): never {
    if (!this.result) this.result = diagnostic(code, message);
    this.blocked = true;
    throw new Error(code);
  }

  private malformed(): void {
    if (!this.result) {
      this.result = diagnostic('IMPORT_XML_MALFORMED', 'XML is malformed or contains unsupported syntax.');
    }
  }
}

function rejected(code: string, message: string): XmlPreflightResult {
  return { diagnostics: [diagnostic(code, message)] };
}

function classifyParseWarning(warning: unknown): string {
  const message = readMessage(warning).toLowerCase();
  if (/unresolved|not found|cannot resolve/.test(message)) return 'IMPORT_REFERENCE_UNRESOLVED';
  if (/unknown|unsupported|unrecognized/.test(message)) return 'IMPORT_TYPE_UNSUPPORTED';
  return 'IMPORT_PARSE_WARNING';
}

function readMessage(warning: unknown): string {
  if (!warning || typeof warning !== 'object') return '';
  const message = (warning as Record<string, unknown>).message;
  return typeof message === 'string' ? message : '';
}

function warningDiagnostic(code: string): XmlDiagnostic {
  return { code, severity: 'warning', stage: 'parse', message: PARSE_WARNING_MESSAGES[code] };
}

function diagnostic(code: string, message: string): XmlDiagnostic {
  return { code, severity: 'error', stage: 'parse', message };
}

function exchangeWarning(code: string): XmlDiagnostic {
  return { code, severity: 'warning', stage: 'parse', message: UNSUPPORTED_MESSAGES[code] };
}

function getXsiType(tag: SaxesTagNS): string | undefined {
  const type = getAttribute(tag, `{${XSI_NS}}type`) || getAttribute(tag, 'xsi:type');
  return type?.split(':').pop();
}

function getAttribute(tag: SaxesTagNS, name: string): string | undefined {
  return tag.attributes[name]?.value;
}
