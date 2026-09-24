import { SaxesParser } from 'saxes';

const MEFF_NAMESPACE = 'http://www.opengroup.org/xsd/archimate/3.0/';
const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';

function localName(tag) {
  if (typeof tag === 'string') {
    return tag.split(':').pop();
  }
  return tag && (tag.local || tag.name && tag.name.split(':').pop());
}

function attribute(tag, name, namespace) {
  const attributes = tag && tag.attributes || {};
  const direct = attributes[name];
  if (direct) {
    return typeof direct === 'string' ? direct : direct.value;
  }
  for (const item of Object.values(attributes)) {
    if (item && item.local === name && (!namespace || item.uri === namespace)) {
      return item.value;
    }
  }
  return undefined;
}

function indexed(index, id) {
  if (!index || id === undefined) {
    return undefined;
  }
  return index instanceof Map ? index.get(id) : index[id];
}

function addDiagnostic(diagnostics, code) {
  if (diagnostics.some((diagnostic) => diagnostic.code === code)) {
    return;
  }
  diagnostics.push({
    code,
    severity: 'warning',
    stage: 'parse',
    message: code === 'IMPORT_REFERENCE_UNRESOLVED'
      ? 'A MEFF view reference could not be resolved and the record was skipped.'
      : code === 'MEFF_DIAGRAM_NODE_TYPE_UNSUPPORTED'
        ? 'A MEFF diagram node type is outside the supported presentation subset.'
        : code === 'MEFF_DIAGRAM_CONNECTION_TYPE_UNSUPPORTED'
          ? 'A MEFF diagram connection type is outside the supported presentation subset.'
          : 'MEFF view or diagram data outside the supported subset was skipped.'
  });
}

/**
 * Convert the supported MEFF 3.1 View and Diagram records to the view tree
 * consumed by the existing renderer. Model identifiers have already been
 * normalized to internal ids by parseMeffModel.
 *
 * Supported view records are Diagram, Element nodes (including nested
 * Element nodes), and Relationship connections whose endpoints are nodes.
 * Diagram coordinates are retained in diagram space. Connection attachments
 * and bendpoints remain distinct in meffGeometry and are also projected, in
 * schema order, to the renderer waypoint list. Supported line, fill, and font
 * style fields are retained as numeric MEFF values. Local Diagram labels,
 * documentation, and drill-down references remain separate from semantics.
 *
 * @param {string} xmlStr
 * @param {Object} rootElement parsed MEFF Model
 * @returns {{ views: Object|undefined, diagnostics: Array<Object> }}
 */
export function parseMeffViews(xmlStr, rootElement) {
  const diagnostics = [];
  const views = [];
  const viewpoints = [];
  const nodeFrames = [];
  const tagStack = [];
  let currentView;
  let currentViewpoint;
  let activeViewName;
  let activeText = '';
  let activeAnnotation;
  let activeScalar;
  let activeProperty;
  let activeConnection;
  let styleTarget;
  let activeFont;
  let inStyle = false;
  let inDiagrams = false;
  let meffModel = false;

  const parser = new SaxesParser({ xmlns: true });

  parser.on('opentag', (tag) => {
    const local = localName(tag);
    const uri = tag.uri;
    tagStack.push(local);

    if (local === 'model' && uri === MEFF_NAMESPACE) {
      meffModel = true;
    }

    if (!meffModel || uri !== MEFF_NAMESPACE) {
      if (meffModel && currentView) {
        addDiagnostic(diagnostics, 'MEFF_EXTENSIONS_UNSUPPORTED');
      }
      return;
    }

    if (local === 'diagrams' && tagStack.includes('views')) {
      inDiagrams = true;
      return;
    }

    if (local === 'view' && inDiagrams) {
      const viewType = (attribute(tag, 'type', XSI_NAMESPACE) || '').split(':').pop();
      if (viewType !== 'Diagram') {
        addDiagnostic(diagnostics, 'MEFF_VIEWS_UNSUPPORTED');
      }
      const id = attribute(tag, 'identifier');
      const viewpoint = attribute(tag, 'viewpoint');
      const viewpointRef = attribute(tag, 'viewpointRef');
      currentView = {
        $type: 'archimate:View',
        id,
        type: 'archimate:Diagram',
        meffType: 'Diagram',
        viewpoint,
        viewpointRef,
        localizedNames: [],
        meffDocumentation: [],
        meffProperties: [],
        viewElements: [],
        pendingConnections: []
      };
      views.push(currentView);
      nodeFrames.length = 0;
      return;
    }

    const parent = tagStack[tagStack.length - 2];
    if (local === 'viewpoint' && parent === 'viewpoints') {
      currentViewpoint = {
        id: attribute(tag, 'identifier'),
        localizedNames: [],
        meffDocumentation: [],
        meffProperties: [],
        allowedElementTypes: [],
        allowedRelationshipTypes: []
      };
      viewpoints.push(currentViewpoint);
      return;
    }
    if (currentViewpoint && !currentView) {
      if (local === 'name' && parent === 'viewpoint') {
        activeViewName = { language: attribute(tag, 'lang', 'http://www.w3.org/XML/1998/namespace') || '', value: '' };
        activeText = '';
      } else if (local === 'documentation' && parent === 'viewpoint') {
        activeAnnotation = { target: currentViewpoint, field: 'meffDocumentation', language: attribute(tag, 'lang', 'http://www.w3.org/XML/1998/namespace') || '' };
        activeText = '';
      } else if (local === 'allowedElementType' && parent === 'viewpoint') {
        currentViewpoint.allowedElementTypes.push(attribute(tag, 'type'));
      } else if (local === 'allowedRelationshipType' && parent === 'viewpoint') {
        currentViewpoint.allowedRelationshipTypes.push(attribute(tag, 'type'));
      } else if (['viewpointPurpose', 'viewpointContent'].includes(local) && parent === 'viewpoint') {
        activeScalar = { target: currentViewpoint, field: local };
        activeText = '';
      } else if (local === 'property' && parent === 'properties' && tagStack[tagStack.length - 3] === 'viewpoint') {
        activeProperty = { propertyDefinitionRef: attribute(tag, 'propertyDefinitionRef'), values: [] };
        currentViewpoint.meffProperties.push(activeProperty);
      } else if (local === 'value' && activeProperty && parent === 'property') {
        activeAnnotation = { target: activeProperty, field: 'values', language: attribute(tag, 'lang', 'http://www.w3.org/XML/1998/namespace') || '' };
        activeText = '';
      } else if (['concern', 'modelingNote'].includes(local) && parent === 'viewpoint') {
        addDiagnostic(diagnostics, 'MEFF_VIEWPOINT_FIELD_UNSUPPORTED');
      }
      return;
    }

    if (!currentView) {
      return;
    }

    if (local === 'name' && tagStack[tagStack.length - 2] === 'view') {
      activeViewName = {
        language: attribute(tag, 'lang', 'http://www.w3.org/XML/1998/namespace') || '',
        value: ''
      };
      activeText = '';
      return;
    }

    if (local === 'node') {
      const xsiType = attribute(tag, 'type', XSI_NAMESPACE) || '';
      const concreteType = xsiType.split(':').pop();
      const semanticId = attribute(tag, 'elementRef');
      const semantic = indexed(rootElement && rootElement.elementsById, semanticId);
      const parentFrame = nodeFrames[nodeFrames.length - 1];
      let node;

      if (['Element', 'Container', 'Label'].includes(concreteType) &&
          (concreteType !== 'Element' || semantic)) {
        node = {
          $type: 'archimate:Node',
          id: attribute(tag, 'identifier'),
          type: concreteType === 'Element' ? (semantic.type || semantic.$type) : `archimate:${concreteType}`,
          meffType: concreteType,
          conceptType: concreteType === 'Element' ? (semantic.conceptType || semantic.type || semantic.$type) : undefined,
          elementRef: concreteType === 'Element' ? semantic : undefined,
          conceptRef: concreteType === 'Label' ? attribute(tag, 'conceptRef') : undefined,
          xpathPart: concreteType === 'Label' ? attribute(tag, 'xpathPart') : undefined,
          x: Number(attribute(tag, 'x')),
          y: Number(attribute(tag, 'y')),
          w: Number(attribute(tag, 'w')),
          h: Number(attribute(tag, 'h')),
          meffGeometry: {
            x: Number(attribute(tag, 'x')),
            y: Number(attribute(tag, 'y')),
            w: Number(attribute(tag, 'w')),
            h: Number(attribute(tag, 'h')),
            coordinateSpace: 'diagram'
          },
          nodes: []
        };
        node.localizedLabels = [];
        node.meffDocumentation = [];
        node.viewRefs = [];
        if (parentFrame && parentFrame.node) {
          parentFrame.node.nodes.push(node);
        } else {
          currentView.viewElements.push(node);
        }
      } else {
        addDiagnostic(diagnostics, semanticId && !semantic
          ? 'IMPORT_REFERENCE_UNRESOLVED'
          : 'MEFF_DIAGRAM_NODE_TYPE_UNSUPPORTED');
      }

      nodeFrames.push({ node: node || null });
      return;
    }

    if (local === 'connection') {
      activeConnection = {
        id: attribute(tag, 'identifier'),
        concreteType: (attribute(tag, 'type', XSI_NAMESPACE) || '').split(':').pop(),
        relationshipId: attribute(tag, 'relationshipRef'),
        sourceId: attribute(tag, 'source'),
        targetId: attribute(tag, 'target'),
        style: undefined,
        meffGeometry: {
          sourceAttachment: undefined,
          bendpoints: [],
          targetAttachment: undefined,
          coordinateSpace: 'diagram'
        },
        waypoints: []
      };
      activeConnection.localizedLabels = [];
      activeConnection.meffDocumentation = [];
      activeConnection.viewRefs = [];
      currentView.pendingConnections.push(activeConnection);
      return;
    }

    if (local === 'style') {
      styleTarget = activeConnection || (nodeFrames[nodeFrames.length - 1] || {}).node;
      if (styleTarget) {
        styleTarget.style = {};
        styleTarget.meffStylePresent = true;
        const width = attribute(tag, 'lineWidth');
        if (width !== undefined) styleTarget.style.lineWidth = Number(width);
      }
      inStyle = true;
      return;
    }

    if (inStyle && styleTarget && ['lineColor', 'fillColor'].includes(local)) {
      styleTarget.style[local] = readColor(tag);
      return;
    }

    if (inStyle && styleTarget && local === 'font') {
      activeFont = {};
      for (const name of ['name', 'style']) {
        const value = attribute(tag, name);
        if (value !== undefined) activeFont[name] = value;
      }
      const size = attribute(tag, 'size');
      if (size !== undefined) activeFont.size = Number(size);
      styleTarget.style.font = activeFont;
      return;
    }

    if (inStyle && activeFont && local === 'color') {
      activeFont.color = readColor(tag);
      return;
    }

    if (activeConnection &&
        ['sourceAttachment', 'bendpoint', 'targetAttachment'].includes(local)) {
      const point = {
        x: Number(attribute(tag, 'x')),
        y: Number(attribute(tag, 'y')),
        kind: local,
        coordinateSpace: 'diagram'
      };
      if (local === 'sourceAttachment') {
        activeConnection.meffGeometry.sourceAttachment = point;
      } else if (local === 'targetAttachment') {
        activeConnection.meffGeometry.targetAttachment = point;
      } else {
        activeConnection.meffGeometry.bendpoints.push(point);
      }
      activeConnection.waypoints.push(point);
      return;
    }

    const target = activeConnection || (nodeFrames[nodeFrames.length - 1] || {}).node || currentView;
    if (local === 'label' && ['node', 'connection'].includes(parent) && target) {
      activeAnnotation = { target, field: 'localizedLabels', language: attribute(tag, 'lang', 'http://www.w3.org/XML/1998/namespace') || '', value: '' };
      activeText = '';
      return;
    }
    if (local === 'documentation' && ['view', 'node', 'connection'].includes(parent) && target) {
      activeAnnotation = { target, field: 'meffDocumentation', language: attribute(tag, 'lang', 'http://www.w3.org/XML/1998/namespace') || '', value: '' };
      activeText = '';
      return;
    }
    if (local === 'viewRef' && ['node', 'connection'].includes(parent) && target) {
      target.viewRefs.push(attribute(tag, 'ref'));
      return;
    }
    if (local === 'property' && parent === 'properties' && tagStack[tagStack.length - 3] === 'view') {
      activeProperty = { propertyDefinitionRef: attribute(tag, 'propertyDefinitionRef'), values: [] };
      currentView.meffProperties.push(activeProperty);
      return;
    }
    if (local === 'value' && activeProperty && parent === 'property') {
      activeAnnotation = { target: activeProperty, field: 'values', language: attribute(tag, 'lang', 'http://www.w3.org/XML/1998/namespace') || '', value: '' };
      activeText = '';
      return;
    }
    if (local === 'properties' && parent !== 'view') {
      addDiagnostic(diagnostics, 'MEFF_DIAGRAMS_UNSUPPORTED');
    }
  });

  parser.on('text', (text) => {
    if (activeViewName || activeAnnotation || activeScalar) {
      activeText += text;
    }
  });

  parser.on('closetag', (tag) => {
    const local = localName(tag);
    if (tag && typeof tag === 'object' && tag.uri !== MEFF_NAMESPACE) {
      tagStack.pop();
      return;
    }
    if (local === 'name' && activeViewName) {
      activeViewName.value = activeText.trim();
      const named = currentView || currentViewpoint;
      if (named) {
        named.localizedNames.push(activeViewName);
        if (!named.name) {
          named.name = activeViewName.value;
        }
      }
      activeViewName = undefined;
      activeText = '';
    }
    if (activeScalar && local === activeScalar.field) {
      activeScalar.target[activeScalar.field] = activeText.trim();
      activeScalar = undefined;
      activeText = '';
    }
    if (activeAnnotation && ((local === 'value' && activeAnnotation.field === 'values') ||
        (local === 'label' && activeAnnotation.field === 'localizedLabels') ||
        (local === 'documentation' && activeAnnotation.field === 'meffDocumentation'))) {
      const { target, field, language } = activeAnnotation;
      const value = activeText;
      target[field].push({ language, value });
      if (field === 'localizedLabels' && target.label === undefined) target.label = value;
      activeAnnotation = undefined;
      activeText = '';
    }
    if (local === 'property') activeProperty = undefined;
    if (local === 'viewpoint' && currentViewpoint) currentViewpoint = undefined;
    if (local === 'node') {
      nodeFrames.pop();
    }
    if (local === 'font') {
      activeFont = undefined;
    }
    if (local === 'style') {
      styleTarget = undefined;
      activeFont = undefined;
      inStyle = false;
    }
    if (local === 'connection') {
      activeConnection = undefined;
    }
    if (local === 'view' && currentView && inDiagrams) {
      currentView = undefined;
      nodeFrames.length = 0;
    }
    if (local === 'diagrams') {
      inDiagrams = false;
    }
    tagStack.pop();
  });

  try {
    parser.write(xmlStr).close();
  } catch {
    return {
      views: undefined,
      diagnostics: [{
        code: 'MEFF_VIEWS_UNSUPPORTED',
        severity: 'warning',
        stage: 'parse',
        message: 'MEFF view data could not be parsed and was skipped.'
      }]
    };
  }

  for (const view of views) {
    const nodeById = new Map();
    const visit = (node) => {
      nodeById.set(node.id, node);
      for (const child of node.nodes || []) {
        visit(child);
      }
    };
    for (const element of view.viewElements) {
      visit(element);
    }

    for (const record of view.pendingConnections) {
      const relationship = indexed(rootElement && rootElement.relationshipsById, record.relationshipId);
      const source = nodeById.get(record.sourceId);
      const target = nodeById.get(record.targetId);
      if (!['Relationship', 'Line'].includes(record.concreteType)) {
        addDiagnostic(diagnostics, 'MEFF_DIAGRAM_CONNECTION_TYPE_UNSUPPORTED');
        continue;
      }
      if (record.concreteType === 'Relationship' && (!relationship || !source || !target) ||
          record.concreteType === 'Line' && ((record.sourceId && !source) || (record.targetId && !target))) {
        addDiagnostic(diagnostics,
          record.relationshipId && !relationship || !source || !target
            ? 'IMPORT_REFERENCE_UNRESOLVED'
            : 'MEFF_DIAGRAMS_UNSUPPORTED');
        continue;
      }
      view.viewElements.push({
        $type: 'archimate:Connection',
        id: record.id,
        type: relationship ? (relationship.type || relationship.$type) : 'archimate:Line',
        meffType: record.concreteType,
        conceptType: relationship ? (relationship.conceptType || relationship.type || relationship.$type) : undefined,
        relationshipRef: record.concreteType === 'Relationship' ? relationship : undefined,
        source,
        target,
        style: record.style,
        meffGeometry: record.meffGeometry,
        waypointsNode: { waypoints: record.waypoints },
        label: record.label,
        localizedLabels: record.localizedLabels,
        meffDocumentation: record.meffDocumentation,
        viewRefs: record.viewRefs
      });
    }
    view.pendingConnections.length = 0;
  }

  const viewsById = new Map(views.map((view) => [view.id, view]));
  const resolveRefs = (record) => {
    if (record.viewRefs) {
      record.resolvedViewRefs = record.viewRefs.filter((id) => viewsById.has(id));
      if (record.resolvedViewRefs.length !== record.viewRefs.length) {
        addDiagnostic(diagnostics, 'IMPORT_REFERENCE_UNRESOLVED');
      }
    }
    for (const child of record.nodes || []) resolveRefs(child);
  };
  for (const view of views) {
    for (const record of view.viewElements) resolveRefs(record);
  }

  const viewpointsById = new Map(viewpoints.map((viewpoint) => [viewpoint.id, viewpoint]));
  for (const view of views) {
    if (view.viewpointRef) {
      if (viewpointsById.has(view.viewpointRef)) {
        view.resolvedViewpointRef = view.viewpointRef;
      } else {
        addDiagnostic(diagnostics, 'IMPORT_VIEWPOINT_REFERENCE_UNRESOLVED');
      }
    }
  }

  diagnostics.sort((left, right) => left.code.localeCompare(right.code));

  return {
    views: views.length || viewpoints.length ? {
      $type: 'archimate:Views',
      viewpoints: { viewpointsList: viewpoints },
      diagrams: { $type: 'archimate:Diagrams', viewsList: views }
    } : undefined,
    diagnostics
  };
}

function readColor(tag) {
  const color = {
    r: Number(attribute(tag, 'r')),
    g: Number(attribute(tag, 'g')),
    b: Number(attribute(tag, 'b'))
  };
  const alpha = attribute(tag, 'a');
  if (alpha !== undefined) color.a = Number(alpha);
  return color;
}
