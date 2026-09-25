import { SaxesParser } from 'saxes';
import {
  arrayField, asRecord, attribute, indexed, localName, MEFF_NAMESPACE, readColor, recordArrayField,
  type Annotation, type DataRecord, type Diagnostic, type NodeFrame, type ParseResult,
  type XmlTag, XML_NAMESPACE, XSI_NAMESPACE
} from './meff-view-types.js';

const DIAGNOSTIC_MESSAGES: Record<string, string> = {
  IMPORT_REFERENCE_UNRESOLVED: 'A MEFF view reference could not be resolved and the record was skipped.',
  MEFF_DIAGRAM_NODE_TYPE_UNSUPPORTED: 'A MEFF diagram node type is outside the supported presentation subset.',
  MEFF_DIAGRAM_CONNECTION_TYPE_UNSUPPORTED: 'A MEFF diagram connection type is outside the supported presentation subset.'
};

class MeffViewParser {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly views: DataRecord[] = [];
  private readonly viewpoints: DataRecord[] = [];
  private readonly nodeFrames: NodeFrame[] = [];
  private readonly tagStack: string[] = [];
  private currentView?: DataRecord;
  private currentViewpoint?: DataRecord;
  private activeViewName?: DataRecord;
  private activeText = '';
  private activeAnnotation?: Annotation;
  private activeScalar?: { target: DataRecord; field: string };
  private activeProperty?: DataRecord;
  private activeConnection?: DataRecord;
  private styleTarget?: DataRecord;
  private activeFont?: DataRecord;
  private inStyle = false;
  private inDiagrams = false;
  private meffModel = false;

  constructor(private readonly rootElement: unknown) {}

  parse(xml: string): ParseResult {
    const parser = new SaxesParser({ xmlns: true });
    parser.on('opentag', (tag) => this.openTag(tag));
    parser.on('text', (text) => this.readText(text));
    parser.on('closetag', (tag) => this.closeTag(tag));
    try {
      parser.write(xml).close();
    } catch {
      return { views: undefined, diagnostics: [this.parseFailure()] };
    }
    this.resolveConnections();
    this.resolveViewRefs();
    this.resolveViewpoints();
    this.diagnostics.sort((left, right) => left.code.localeCompare(right.code));
    return { views: this.viewTree(), diagnostics: this.diagnostics };
  }

  private openTag(tag: XmlTag): void {
    const local = localName(tag);
    this.tagStack.push(local);
    if (local === 'model' && tag.uri === MEFF_NAMESPACE) this.meffModel = true;
    if (!this.meffModel || tag.uri !== MEFF_NAMESPACE) {
      if (this.meffModel && this.currentView) this.addDiagnostic('MEFF_EXTENSIONS_UNSUPPORTED');
      return;
    }
    if (this.openViewBoundary(tag, local)) return;
    if (this.openViewpointData(tag, local)) return;
    if (!this.currentView) return;
    this.openDiagramData(tag, local);
  }

  private openViewBoundary(tag: XmlTag, local: string): boolean {
    if (local === 'diagrams' && this.tagStack.includes('views')) {
      this.inDiagrams = true;
      return true;
    }
    if (local === 'view' && this.inDiagrams) {
      const viewType = (attribute(tag, 'type', XSI_NAMESPACE) || '').split(':').pop();
      if (viewType !== 'Diagram') this.addDiagnostic('MEFF_VIEWS_UNSUPPORTED');
      this.currentView = this.newView(tag);
      this.views.push(this.currentView);
      this.nodeFrames.length = 0;
      return true;
    }
    return false;
  }

  private newView(tag: XmlTag): DataRecord {
    return {
      $type: 'archimate:View', id: attribute(tag, 'identifier'), type: 'archimate:Diagram',
      meffType: 'Diagram', viewpoint: attribute(tag, 'viewpoint'),
      viewpointRef: attribute(tag, 'viewpointRef'), localizedNames: [], meffDocumentation: [],
      meffProperties: [], viewElements: [], pendingConnections: []
    };
  }

  private openViewpointData(tag: XmlTag, local: string): boolean {
    const parent = this.tagStack[this.tagStack.length - 2];
    if (local === 'viewpoint' && parent === 'viewpoints') {
      this.currentViewpoint = this.newViewpoint(tag);
      this.viewpoints.push(this.currentViewpoint);
      return true;
    }
    if (!this.currentViewpoint || this.currentView) return false;
    this.readViewpointField(tag, local, parent);
    return true;
  }

  private newViewpoint(tag: XmlTag): DataRecord {
    return {
      id: attribute(tag, 'identifier'), localizedNames: [], meffDocumentation: [],
      meffProperties: [], allowedElementTypes: [], allowedRelationshipTypes: []
    };
  }

  private readViewpointField(tag: XmlTag, local: string, parent: string | undefined): void {
    const viewpoint = this.currentViewpoint;
    if (!viewpoint) return;
    if (local === 'name' && parent === 'viewpoint') this.beginViewName(tag);
    else if (local === 'documentation' && parent === 'viewpoint') this.beginAnnotation(viewpoint, 'meffDocumentation', tag);
    else if (local === 'allowedElementType' && parent === 'viewpoint') arrayField(viewpoint, 'allowedElementTypes').push(attribute(tag, 'type'));
    else if (local === 'allowedRelationshipType' && parent === 'viewpoint') arrayField(viewpoint, 'allowedRelationshipTypes').push(attribute(tag, 'type'));
    else if (['viewpointPurpose', 'viewpointContent'].includes(local) && parent === 'viewpoint') {
      this.activeScalar = { target: viewpoint, field: local };
      this.activeText = '';
    } else if (local === 'property' && parent === 'properties' && this.tagStack[this.tagStack.length - 3] === 'viewpoint') {
      this.activeProperty = this.newProperty(tag);
      arrayField(viewpoint, 'meffProperties').push(this.activeProperty);
    } else if (local === 'value' && this.activeProperty && parent === 'property') {
      this.beginAnnotation(this.activeProperty, 'values', tag);
    } else if (['concern', 'modelingNote'].includes(local) && parent === 'viewpoint') {
      this.addDiagnostic('MEFF_VIEWPOINT_FIELD_UNSUPPORTED');
    }
  }

  private openDiagramData(tag: XmlTag, local: string): void {
    const parent = this.tagStack[this.tagStack.length - 2];
    if (local === 'name' && parent === 'view') return this.beginViewName(tag);
    if (local === 'node') return this.openNode(tag);
    if (local === 'connection') return this.openConnection(tag);
    if (local === 'style') return this.openStyle(tag);
    if (this.readStyleChild(tag, local)) return;
    if (this.readConnectionPoint(tag, local)) return;
    this.readDiagramAnnotation(tag, local, parent);
  }

  private openNode(tag: XmlTag): void {
    const concreteType = (attribute(tag, 'type', XSI_NAMESPACE) || '').split(':').pop();
    const semanticId = attribute(tag, 'elementRef');
    const semantic = this.rootIndex('elementsById', semanticId);
    const parentFrame = this.nodeFrames[this.nodeFrames.length - 1];
    const node = this.makeNode(tag, concreteType, semanticId, semantic);
    if (node) {
      if (parentFrame?.node) arrayField(parentFrame.node, 'nodes').push(node);
      else if (this.currentView) arrayField(this.currentView, 'viewElements').push(node);
    } else {
      this.addDiagnostic(semanticId && !semantic ? 'IMPORT_REFERENCE_UNRESOLVED' : 'MEFF_DIAGRAM_NODE_TYPE_UNSUPPORTED');
    }
    this.nodeFrames.push({ node: node || null });
  }

  private makeNode(tag: XmlTag, concreteType: string | undefined, semanticId: string | undefined,
    semantic: DataRecord | undefined): DataRecord | undefined {
    if (!['Element', 'Container', 'Label'].includes(concreteType || '') || (concreteType === 'Element' && !semantic)) return undefined;
    const type = concreteType === 'Element' ? semantic?.type || semantic?.$type : `archimate:${concreteType}`;
    const conceptType = concreteType === 'Element' ? semantic?.conceptType || semantic?.type || semantic?.$type : undefined;
    const geometry = this.geometry(tag);
    const node: DataRecord = {
      $type: 'archimate:Node', id: attribute(tag, 'identifier'), type,
      meffType: concreteType, conceptType, elementRef: concreteType === 'Element' ? semantic : undefined,
      conceptRef: concreteType === 'Label' ? attribute(tag, 'conceptRef') : undefined,
      xpathPart: concreteType === 'Label' ? attribute(tag, 'xpathPart') : undefined,
      ...geometry, meffGeometry: { ...geometry, coordinateSpace: 'diagram' }, nodes: []
    };
    node.localizedLabels = [];
    node.meffDocumentation = [];
    node.viewRefs = [];
    return node;
  }

  private geometry(tag: XmlTag): DataRecord {
    return {
      x: Number(attribute(tag, 'x')), y: Number(attribute(tag, 'y')),
      w: Number(attribute(tag, 'w')), h: Number(attribute(tag, 'h'))
    };
  }

  private openConnection(tag: XmlTag): void {
    const connection: DataRecord = {
      id: attribute(tag, 'identifier'),
      concreteType: (attribute(tag, 'type', XSI_NAMESPACE) || '').split(':').pop(),
      relationshipId: attribute(tag, 'relationshipRef'), sourceId: attribute(tag, 'source'),
      targetId: attribute(tag, 'target'), style: undefined,
      meffGeometry: { sourceAttachment: undefined, bendpoints: [], targetAttachment: undefined, coordinateSpace: 'diagram' },
      waypoints: [], localizedLabels: [], meffDocumentation: [], viewRefs: []
    };
    this.activeConnection = connection;
    if (this.currentView) arrayField(this.currentView, 'pendingConnections').push(connection);
  }

  private openStyle(tag: XmlTag): void {
    this.styleTarget = this.activeConnection || this.nodeFrames[this.nodeFrames.length - 1]?.node || undefined;
    if (this.styleTarget) {
      this.styleTarget.style = {};
      this.styleTarget.meffStylePresent = true;
      const width = attribute(tag, 'lineWidth');
      if (width !== undefined) asRecord(this.styleTarget.style)!.lineWidth = Number(width);
    }
    this.inStyle = true;
  }

  private readStyleChild(tag: XmlTag, local: string): boolean {
    if (!this.inStyle || !this.styleTarget) return false;
    const style = asRecord(this.styleTarget.style);
    if (!style) return false;
    if (local === 'lineColor' || local === 'fillColor') style[local] = readColor(tag);
    else if (local === 'font') this.openFont(tag, style);
    else if (local === 'color' && this.activeFont) this.activeFont.color = readColor(tag);
    else return false;
    return true;
  }

  private openFont(tag: XmlTag, style: DataRecord): void {
    const font: DataRecord = {};
    for (const name of ['name', 'style']) {
      const value = attribute(tag, name);
      if (value !== undefined) font[name] = value;
    }
    const size = attribute(tag, 'size');
    if (size !== undefined) font.size = Number(size);
    this.activeFont = font;
    style.font = font;
  }

  private readConnectionPoint(tag: XmlTag, local: string): boolean {
    const connection = this.activeConnection;
    if (!connection || !['sourceAttachment', 'bendpoint', 'targetAttachment'].includes(local)) return false;
    const point: DataRecord = {
      x: Number(attribute(tag, 'x')), y: Number(attribute(tag, 'y')),
      kind: local, coordinateSpace: 'diagram'
    };
    const geometry = asRecord(connection.meffGeometry);
    if (geometry && local === 'sourceAttachment') geometry.sourceAttachment = point;
    else if (geometry && local === 'targetAttachment') geometry.targetAttachment = point;
    else if (geometry) arrayField(geometry, 'bendpoints').push(point);
    arrayField(connection, 'waypoints').push(point);
    return true;
  }

  private readDiagramAnnotation(tag: XmlTag, local: string, parent: string | undefined): void {
    const target = this.activeConnection || this.nodeFrames[this.nodeFrames.length - 1]?.node || this.currentView;
    if (!target) return;
    if (local === 'label' && (parent === 'node' || parent === 'connection')) this.beginAnnotation(target, 'localizedLabels', tag, true);
    else if (local === 'documentation' && ['view', 'node', 'connection'].includes(parent || '')) this.beginAnnotation(target, 'meffDocumentation', tag, true);
    else if (local === 'viewRef' && (parent === 'node' || parent === 'connection')) arrayField(target, 'viewRefs').push(attribute(tag, 'ref'));
    else if (local === 'property' && parent === 'properties' && this.tagStack[this.tagStack.length - 3] === 'view') {
      this.activeProperty = this.newProperty(tag);
      if (this.currentView) arrayField(this.currentView, 'meffProperties').push(this.activeProperty);
    } else if (local === 'value' && this.activeProperty && parent === 'property') this.beginAnnotation(this.activeProperty, 'values', tag, true);
    else if (local === 'properties' && parent !== 'view') this.addDiagnostic('MEFF_DIAGRAMS_UNSUPPORTED');
  }

  private beginViewName(tag: XmlTag): void {
    this.activeViewName = { language: attribute(tag, 'lang', XML_NAMESPACE) || '', value: '' };
    this.activeText = '';
  }

  private beginAnnotation(target: DataRecord, field: string, tag: XmlTag, includeValue = false): void {
    this.activeAnnotation = {
      target, field, language: attribute(tag, 'lang', XML_NAMESPACE) || '',
      ...(includeValue ? { value: '' } : {})
    };
    this.activeText = '';
  }

  private newProperty(tag: XmlTag): DataRecord {
    return { propertyDefinitionRef: attribute(tag, 'propertyDefinitionRef'), values: [] };
  }

  private readText(text: string): void {
    if (this.activeViewName || this.activeAnnotation || this.activeScalar) this.activeText += text;
  }

  private closeTag(tag: XmlTag): void {
    const local = localName(tag);
    if (tag.uri !== MEFF_NAMESPACE) {
      this.tagStack.pop();
      return;
    }
    this.closeTextFields(local);
    this.closeStructure(local);
    this.tagStack.pop();
  }

  private closeTextFields(local: string): void {
    if (local === 'name' && this.activeViewName) this.finishName();
    if (this.activeScalar && local === this.activeScalar.field) {
      this.activeScalar.target[this.activeScalar.field] = this.activeText.trim();
      this.activeScalar = undefined;
      this.activeText = '';
    }
    if (this.activeAnnotation && this.annotationEnds(local)) this.finishAnnotation();
    if (local === 'property') this.activeProperty = undefined;
  }

  private finishName(): void {
    const name = this.activeViewName;
    if (!name) return;
    name.value = this.activeText.trim();
    const named = this.currentView || this.currentViewpoint;
    if (named) {
      arrayField(named, 'localizedNames').push(name);
      if (!named.name) named.name = name.value;
    }
    this.activeViewName = undefined;
    this.activeText = '';
  }

  private annotationEnds(local: string): boolean {
    const field = this.activeAnnotation?.field;
    return (local === 'value' && field === 'values') ||
      (local === 'label' && field === 'localizedLabels') ||
      (local === 'documentation' && field === 'meffDocumentation');
  }

  private finishAnnotation(): void {
    const annotation = this.activeAnnotation;
    if (!annotation) return;
    const value = this.activeText;
    arrayField(annotation.target, annotation.field).push({ language: annotation.language, value });
    if (annotation.field === 'localizedLabels' && annotation.target.label === undefined) annotation.target.label = value;
    this.activeAnnotation = undefined;
    this.activeText = '';
  }

  private closeStructure(local: string): void {
    if (local === 'viewpoint' && this.currentViewpoint) this.currentViewpoint = undefined;
    if (local === 'node') this.nodeFrames.pop();
    if (local === 'font') this.activeFont = undefined;
    if (local === 'style') this.closeStyle();
    if (local === 'connection') this.activeConnection = undefined;
    if (local === 'view' && this.currentView && this.inDiagrams) this.closeView();
    if (local === 'diagrams') this.inDiagrams = false;
  }

  private closeStyle(): void {
    this.styleTarget = undefined;
    this.activeFont = undefined;
    this.inStyle = false;
  }

  private closeView(): void {
    this.currentView = undefined;
    this.nodeFrames.length = 0;
  }

  private resolveConnections(): void {
    for (const view of this.views) this.resolveViewConnections(view);
  }

  private resolveViewConnections(view: DataRecord): void {
    const nodes = this.nodesById(view);
    for (const record of recordArrayField(view, 'pendingConnections')) this.resolveConnection(view, record, nodes);
    arrayField(view, 'pendingConnections').length = 0;
  }

  private nodesById(view: DataRecord): Map<string, DataRecord> {
    const result = new Map<string, DataRecord>();
    const visit = (node: DataRecord): void => {
      const id = node.id;
      if (typeof id === 'string') result.set(id, node);
      for (const child of recordArrayField(node, 'nodes')) visit(child);
    };
    for (const node of recordArrayField(view, 'viewElements')) visit(node);
    return result;
  }

  private resolveConnection(view: DataRecord, record: DataRecord, nodes: Map<string, DataRecord>): void {
    const relationship = this.rootIndex('relationshipsById', stringValue(record.relationshipId));
    const source = nodes.get(stringValue(record.sourceId) || '');
    const target = nodes.get(stringValue(record.targetId) || '');
    const concreteType = record.concreteType;
    if (!['Relationship', 'Line'].includes(stringValue(concreteType) || '')) {
      this.addDiagnostic('MEFF_DIAGRAM_CONNECTION_TYPE_UNSUPPORTED');
      return;
    }
    if (!this.connectionRefsResolve(record, concreteType, relationship, source, target)) return;
    arrayField(view, 'viewElements').push(this.connectionRecord(record, concreteType, relationship, source, target));
  }

  private connectionRefsResolve(record: DataRecord, concreteType: unknown, relationship: DataRecord | undefined,
    source: DataRecord | undefined, target: DataRecord | undefined): boolean {
    const relationMissing = concreteType === 'Relationship' && (!relationship || !source || !target);
    const lineMissing = concreteType === 'Line' &&
      ((record.sourceId && !source) || (record.targetId && !target));
    if (!relationMissing && !lineMissing) return true;
    this.addDiagnostic(record.relationshipId && !relationship || !source || !target
      ? 'IMPORT_REFERENCE_UNRESOLVED' : 'MEFF_DIAGRAMS_UNSUPPORTED');
    return false;
  }

  private connectionRecord(record: DataRecord, concreteType: unknown, relationship: DataRecord | undefined,
    source: DataRecord | undefined, target: DataRecord | undefined): DataRecord {
    return {
      $type: 'archimate:Connection', id: record.id,
      type: relationship ? relationship.type || relationship.$type : 'archimate:Line',
      meffType: concreteType,
      conceptType: relationship ? relationship.conceptType || relationship.type || relationship.$type : undefined,
      relationshipRef: concreteType === 'Relationship' ? relationship : undefined,
      source, target, style: record.style, meffGeometry: record.meffGeometry,
      waypointsNode: { waypoints: record.waypoints }, label: record.label,
      localizedLabels: record.localizedLabels, meffDocumentation: record.meffDocumentation,
      viewRefs: record.viewRefs
    };
  }

  private resolveViewRefs(): void {
    const viewsById = new Map(this.views.map((view) => [view.id, view]));
    const resolve = (record: DataRecord): void => {
      if (Array.isArray(record.viewRefs)) {
        const refs: unknown[] = record.viewRefs;
        record.resolvedViewRefs = refs.filter((id) => viewsById.has(id));
        if (arrayField(record, 'resolvedViewRefs').length !== refs.length) this.addDiagnostic('IMPORT_REFERENCE_UNRESOLVED');
      }
      for (const child of recordArrayField(record, 'nodes')) resolve(child);
    };
    for (const view of this.views) for (const record of recordArrayField(view, 'viewElements')) resolve(record);
  }

  private resolveViewpoints(): void {
    const ids = new Set(this.viewpoints.map((viewpoint) => stringValue(viewpoint.id) || ''));
    for (const view of this.views) {
      const ref = stringValue(view.viewpointRef);
      if (!ref) continue;
      if (ids.has(ref)) view.resolvedViewpointRef = ref;
      else this.addDiagnostic('IMPORT_VIEWPOINT_REFERENCE_UNRESOLVED');
    }
  }

  private rootIndex(name: string, id: string | undefined): DataRecord | undefined {
    return indexed(asRecord(this.rootElement)?.[name], id);
  }

  private viewTree(): DataRecord | undefined {
    if (!this.views.length && !this.viewpoints.length) return undefined;
    return {
      $type: 'archimate:Views', viewpoints: { viewpointsList: this.viewpoints },
      diagrams: { $type: 'archimate:Diagrams', viewsList: this.views }
    };
  }

  private addDiagnostic(code: string): void {
    if (this.diagnostics.some((diagnostic) => diagnostic.code === code)) return;
    this.diagnostics.push({
      code, severity: 'warning', stage: 'parse',
      message: DIAGNOSTIC_MESSAGES[code] || 'MEFF view or diagram data outside the supported subset was skipped.'
    });
  }

  private parseFailure(): Diagnostic {
    return {
      code: 'MEFF_VIEWS_UNSUPPORTED', severity: 'warning', stage: 'parse',
      message: 'MEFF view data could not be parsed and was skipped.'
    };
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Parse the supported MEFF 3.1 view and diagram records. */
export function parseMeffViews(xml: string, rootElement: unknown): ParseResult {
  return new MeffViewParser(rootElement).parse(xml);
}
