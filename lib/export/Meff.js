/**
 * Deterministic serializer for the declared MEFF 3.1 Model/Diagram subset.
 * This is an exchange projection; the editor's native saveXML remains separate.
 * No Open Group schema files or examples are bundled.
 */

const NS = 'http://www.opengroup.org/xsd/archimate/3.0/';
const XML_ID = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const QNAME = /^(?:archimate:)?[A-Za-z][A-Za-z0-9]*$/;
// Bounded concrete vocabulary present in the repository's public metamodel.
// Unknown native editor types cannot be emitted as unverified XSD xsi:types.
const ELEMENT_TYPES = new Set([
  'Assessment', 'Constraint', 'Driver', 'Goal', 'Meaning', 'Outcome', 'Principle',
  'Requirement', 'Stakeholder', 'Value', 'Capability', 'ValueStream',
  'CourseOfAction', 'Resource', 'BusinessActor', 'BusinessCollaboration',
  'BusinessEvent', 'BusinessFunction', 'BusinessInteraction', 'BusinessInterface',
  'BusinessObject', 'BusinessProcess', 'BusinessRole', 'BusinessService',
  'Contract', 'Product', 'Representation', 'ApplicationCollaboration',
  'ApplicationComponent', 'ApplicationEvent', 'ApplicationFunction',
  'ApplicationInteraction', 'ApplicationInterface', 'ApplicationProcess',
  'ApplicationService', 'DataObject', 'Artifact', 'CommunicationNetwork',
  'Device', 'Node', 'Path', 'SystemSoftware', 'TechnologyCollaboration',
  'TechnologyEvent', 'TechnologyFunction', 'TechnologyInteraction',
  'TechnologyInterface', 'TechnologyProcess', 'TechnologyService',
  'DistributionNetwork', 'Equipment', 'Facility', 'Material', 'Deliverable',
  'ImplementationEvent', 'WorkPackage', 'Gap', 'Plateau', 'Location', 'Grouping'
]);
const RELATIONSHIP_TYPES = new Set([
  'Composition', 'Aggregation', 'Assignment', 'Realization', 'Association',
  'Influence', 'Access', 'Serving', 'Triggering', 'Flow', 'Specialization'
]);

function failure() {
  const error = new Error('The model cannot be serialized as the supported MEFF subset.');
  error.code = 'MEFF_EXPORT_INVALID';
  return error;
}

function escape(value) {
  if (typeof value !== 'string') throw failure();
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13 ||
        code >= 0xD800 && code <= 0xDFFF ||
        code === 0xFFFE || code === 0xFFFF) throw failure();
  }
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function id(value, ids) {
  if (typeof value !== 'string' || !XML_ID.test(value) || ids.has(value)) throw failure();
  ids.add(value);
  return escape(value);
}

function type(value, vocabulary) {
  if (typeof value !== 'string' || !QNAME.test(value)) throw failure();
  const local = value.split(':').pop();
  if (!vocabulary.has(local)) throw failure();
  return 'archimate:' + local;
}

function diagnostic(code) {
  const descriptions = {
    MEFF_EXPORT_MODEL_OMITTED: 'Model metadata, properties, organizations, or property definitions were omitted.',
    MEFF_EXPORT_VIEW_OMITTED: 'Unsupported view or viewpoint data was omitted.',
    MEFF_EXPORT_DIAGRAM_OMITTED: 'Unsupported diagram presentation data was omitted.',
    MEFF_EXPORT_ELEMENT_OMITTED: 'An unsupported model element or field was omitted.',
    MEFF_EXPORT_RELATIONSHIP_OMITTED: 'An unsupported relationship or field was omitted.'
  };
  return { code, severity: 'warning', stage: 'export', message: descriptions[code] };
}

function hasContent(value, seen = new WeakSet()) {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value !== 'object') return true;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((item) => hasContent(item, seen));
}

function attrs(record, names) {
  return names.some((name) => hasContent(record?.[name]));
}

function names(record, required) {
  const records = Array.isArray(record.localizedNames) && record.localizedNames.length
    ? record.localizedNames : record.name ? [{ value: record.name }] : [];
  if (required && !records.length) throw failure();
  return records.map(({ language, value }) => {
    if (typeof value !== 'string' || !value.length) throw failure();
    const lang = language ? ' xml:lang="' + escape(language) + '"' : '';
    return '<name' + lang + '>' + escape(value) + '</name>';
  }).join('');
}

function documentation(record) {
  return record.documentation ? '<documentation>' + escape(record.documentation) + '</documentation>' : '';
}

function number(value, positive = false, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < (positive ? 1 : 0) ||
      integer && !Number.isInteger(value)) throw failure();
  return String(value);
}

function color(value, tag) {
  if (!value) return '';
  const fields = ['r', 'g', 'b', 'a'].filter((field) => value[field] !== undefined);
  if (!['r', 'g', 'b'].every((field) => fields.includes(field))) throw failure();
  return '<' + tag + fields.map((field) => {
    if (value[field] > (field === 'a' ? 100 : 255)) throw failure();
    return ' ' + field + '="' + number(value[field], false, true) + '"';
  }).join('') + '/>';
}

function style(record) {
  if (record.style === undefined) return '';
  const value = record.style || {};
  const width = value.lineWidth === undefined ? '' : ' lineWidth="' + number(value.lineWidth) + '"';
  let children = color(value.lineColor, 'lineColor') + color(value.fillColor, 'fillColor');
  if (value.font) {
    const font = value.font;
    let attributes = '';
    if (font.name !== undefined) attributes += ' name="' + escape(font.name) + '"';
    if (font.size !== undefined) attributes += ' size="' + number(font.size, true) + '"';
    if (font.style !== undefined) attributes += ' style="' + escape(font.style) + '"';
    children += '<font' + attributes + '>' + color(font.color, 'color') + '</font>';
  }
  return '<style' + width + '>' + children + '</style>';
}

function geometry(record) {
  // The editor may update current diagram-space bounds after import. The
  // original meffGeometry is a provenance snapshot, not the current layout.
  const g = ['x', 'y', 'w', 'h'].every((field) => record[field] !== undefined)
    ? record : record.meffGeometry || record;
  if (g.coordinateSpace && g.coordinateSpace !== 'diagram') throw failure();
  return ['x', 'y', 'w', 'h'].map((field) =>
    ' ' + field + '="' + number(g[field], field === 'w' || field === 'h', true) + '"').join('');
}

function point(record, tag) {
  if (!record) return '';
  if (record.coordinateSpace && record.coordinateSpace !== 'diagram') throw failure();
  return '<' + tag + ' x="' + number(record.x, false, true) +
    '" y="' + number(record.y, false, true) + '"/>';
}

function currentPathMatchesGeometry(connection) {
  const current = connection.waypointsNode && connection.waypointsNode.waypoints;
  if (!current) return true;
  const geometry = connection.meffGeometry;
  if (!geometry) return current.length === 0;
  const original = [geometry.sourceAttachment, ...(geometry.bendpoints || []),
    geometry.targetAttachment].filter(Boolean);
  return original.length === current.length && original.every((point, index) =>
    point.x === current[index].x && point.y === current[index].y &&
    point.kind === current[index].kind);
}

function connectionPath(connection, warn) {
  if (currentPathMatchesGeometry(connection)) return connection.meffGeometry || {};
  const current = connection.waypointsNode && connection.waypointsNode.waypoints || [];
  if (current.length >= 2 && current.every((point) =>
    point && Number.isInteger(point.x) && point.x >= 0 &&
    Number.isInteger(point.y) && point.y >= 0)) {
    return {
      sourceAttachment: current[0],
      bendpoints: current.slice(1, -1),
      targetAttachment: current[current.length - 1]
    };
  }
  // No implicit rounding or conversion of an editor-native route.
  warn('MEFF_EXPORT_DIAGRAM_OMITTED');
  return {};
}

/**
 * Serialize imported MEFF records or equivalent model objects.
 * IDs must already exist and be unique XML IDs; missing/invalid mandatory
 * references fail closed, while unsupported optional records are diagnosed.
 * @param {Object} model model returned by ArchimateModdle.fromXML
 * @returns {{xml: string, diagnostics: Array<Object>}}
 */
export function exportMeff(model) {
  if (!model || !model.id) throw failure();
  const ids = new Set();
  const omitted = new Set();
  const warn = (code) => omitted.add(code);
  const modelId = id(model.id, ids);
  if (attrs(model, ['metadata', 'organizations', 'organizationsNode', 'properties',
    'propertiesNode', 'propertyDefinitions', 'propertyDefinitionsNode', 'version'])) {
    warn('MEFF_EXPORT_MODEL_OMITTED');
  }
  let body = names(model, true) + documentation(model);

  const elements = model.elementsNode && model.elementsNode.baseElements || [];
  const elementIds = new Set();
  if (elements.length) {
    body += '<elements>' + elements.map((element) => {
      if (!element || !element.id || !element.type && !element.conceptType) {
        warn('MEFF_EXPORT_ELEMENT_OMITTED');
        return '';
      }
      const elementId = id(element.id, ids);
      elementIds.add(element.id);
      if (attrs(element, ['properties', 'propertiesNode', 'propertyDefinitions', 'specialization', 'children'])) {
        warn('MEFF_EXPORT_ELEMENT_OMITTED');
      }
      return '<element identifier="' + elementId + '" xsi:type="' +
        type(element.conceptType || element.type, ELEMENT_TYPES) + '">' +
        names(element) + documentation(element) + '</element>';
    }).join('') + '</elements>';
  }

  const relationships = model.relationshipsNode && model.relationshipsNode.relationships || [];
  const relationshipIds = new Set();
  if (relationships.length) {
    body += '<relationships>' + relationships.map((relation) => {
      if (!relation || !relation.id || !relation.type && !relation.conceptType) {
        warn('MEFF_EXPORT_RELATIONSHIP_OMITTED');
        return '';
      }
      const source = relation.sourceRefId || relation.source && relation.source.id;
      const target = relation.targetRefId || relation.target && relation.target.id;
      if (!elementIds.has(source) || !elementIds.has(target)) throw failure();
      const relationId = id(relation.id, ids);
      relationshipIds.add(relation.id);
      if (attrs(relation, ['properties', 'propertiesNode', 'accessType', 'influenceStrength', 'isDirected', 'modifier'])) {
        warn('MEFF_EXPORT_RELATIONSHIP_OMITTED');
      }
      return '<relationship identifier="' + relationId + '" xsi:type="' +
        type(relation.conceptType || relation.type, RELATIONSHIP_TYPES) + '" source="' + escape(source) +
        '" target="' + escape(target) + '">' + names(relation) +
        documentation(relation) + '</relationship>';
    }).join('') + '</relationships>';
  }

  const views = model.views && model.views.diagrams && model.views.diagrams.viewsList || [];
  if (attrs(model.views, ['viewpoints', 'viewpointDefinitions'])) warn('MEFF_EXPORT_VIEW_OMITTED');
  if (views.length) {
    body += '<views><diagrams>' + views.map((view) => {
      if (!view || !view.id || view.meffType && view.meffType !== 'Diagram') {
        warn('MEFF_EXPORT_VIEW_OMITTED');
        return '';
      }
      const viewId = id(view.id, ids);
      if (attrs(view, ['viewpoint', 'viewpointRef', 'resolvedViewpointRef',
        'documentation', 'properties',
        'meffDocumentation', 'meffProperties'])) {
        warn('MEFF_EXPORT_VIEW_OMITTED');
      }
      const nodeIds = new Set();
      const nodes = [];
      const connections = [];
      for (const item of view.viewElements || []) {
        if (item.relationshipRef || item.$type === 'archimate:Connection') connections.push(item);
        else nodes.push(item);
      }
      const node = (item) => {
        if (!item || item.meffType && item.meffType !== 'Element' || !item.elementRef ||
            !elementIds.has(item.elementRef.id)) {
          warn('MEFF_EXPORT_DIAGRAM_OMITTED');
          return '';
        }
        const nodeId = id(item.id, ids);
        nodeIds.add(item.id);
        if (attrs(item, ['meffLabel', 'localizedLabels', 'meffDocumentation', 'meffProperties',
          'viewRef', 'viewRefs', 'label', 'documentation'])) {
          warn('MEFF_EXPORT_DIAGRAM_OMITTED');
        }
        return '<node identifier="' + nodeId + '" xsi:type="archimate:Element" elementRef="' +
          escape(item.elementRef.id) + '"' + geometry(item) + '>' + style(item) +
          (item.nodes || []).map(node).join('') + '</node>';
      };
      let viewBody = names(view) + nodes.map(node).join('');
      for (const connection of connections) {
        if (!connection || connection.meffType && connection.meffType !== 'Relationship' ||
            !connection.relationshipRef || !relationshipIds.has(connection.relationshipRef.id) ||
            !connection.source || !nodeIds.has(connection.source.id) ||
            !connection.target || !nodeIds.has(connection.target.id)) {
          warn('MEFF_EXPORT_DIAGRAM_OMITTED');
          continue;
        }
        if (attrs(connection, ['meffLabel', 'localizedLabels', 'meffDocumentation',
          'meffProperties', 'viewRef', 'viewRefs', 'resolvedViewRefs',
          'label', 'documentation'])) {
          warn('MEFF_EXPORT_DIAGRAM_OMITTED');
        }
        // The current editor route supersedes the imported provenance snapshot.
        const g = connectionPath(connection, warn);
        viewBody += '<connection identifier="' + id(connection.id, ids) +
          '" xsi:type="archimate:Relationship" relationshipRef="' +
          escape(connection.relationshipRef.id) + '" source="' + escape(connection.source.id) +
          '" target="' + escape(connection.target.id) + '">' + style(connection) +
          point(g.sourceAttachment, 'sourceAttachment') +
          (g.bendpoints || []).map((p) => point(p, 'bendpoint')).join('') +
          point(g.targetAttachment, 'targetAttachment') + '</connection>';
      }
      return '<view identifier="' + viewId + '" xsi:type="archimate:Diagram">' + viewBody + '</view>';
    }).join('') + '</diagrams></views>';
  }

  return {
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<model xmlns="' + NS + '" xmlns:archimate="' + NS +
      '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="' +
      modelId + '">' + body + '</model>\n',
    diagnostics: Array.from(omitted).sort().map(diagnostic)
  };
}
