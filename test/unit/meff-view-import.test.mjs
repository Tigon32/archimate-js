import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseMeffViews } from '../../lib/import/MeffView.js';
import ArchimateModdle from '../../lib/moddle/Moddle';
import ArchimateDescriptors from '../../lib/moddle/resources/archimate.json';
import { preflightImportXml } from '../../lib/import/XmlPreflight.js';
import ArchimateImporter from '../../lib/import/ArchimateImporter';
import ElementFactory from '../../lib/features/modeling/ElementFactory';
import { getLabel } from '../../lib/features/label-editing/LabelUtil';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(here, '../fixtures/meff-schema/valid-view-diagram.xml');

describe('MEFF View and Diagram import', () => {
  it('preserves viewpoint definitions, allowed types, and resolved view references', async () => {
    const xml = await readFile(path.resolve(here, '../fixtures/meff-schema/valid-view-viewpoint.xml'), 'utf8');
    const model = {
      elementsById: new Map([
        ['component-one', { id: 'component-one', type: 'archimate:ApplicationComponent' }],
        ['service-two', { id: 'service-two', type: 'archimate:ApplicationService' }]
      ]),
      relationshipsById: new Map([['serving-one-two', { id: 'serving-one-two', type: 'archimate:Serving' }]])
    };
    const parsed = parseMeffViews(xml, model);
    expect(parsed.diagnostics).toEqual([]);
    expect(preflightImportXml(xml).warnings).toEqual([]);
    const viewpoint = parsed.views.viewpoints.viewpointsList[0];
    expect(viewpoint).toEqual({
      id: 'viewpoint-synthetic-one', name: 'Synthetic application viewpoint',
      localizedNames: [{ language: 'en', value: 'Synthetic application viewpoint' }],
      meffDocumentation: [{ language: 'en', value: 'Viewpoint documentation' }],
      meffProperties: [],
      viewpointPurpose: 'Designing Informing', viewpointContent: 'Details',
      allowedElementTypes: ['ApplicationComponent', 'ApplicationService'],
      allowedRelationshipTypes: ['Serving']
    });
    const view = parsed.views.diagrams.viewsList[0];
    expect(view).toMatchObject({
      viewpoint: 'Application Structure',
      viewpointRef: 'viewpoint-synthetic-one',
      resolvedViewpointRef: viewpoint.id
    });
    const unresolved = parseMeffViews(xml.replace('viewpointRef="viewpoint-synthetic-one"',
      'viewpointRef="unresolved-synthetic-viewpoint"'), model);
    expect(unresolved.views.diagrams.viewsList[0].viewpointRef).toBe('unresolved-synthetic-viewpoint');
    expect(unresolved.views.diagrams.viewsList[0].resolvedViewpointRef).toBeUndefined();
    expect(unresolved.diagnostics.map(({ code }) => code)).toEqual(['IMPORT_VIEWPOINT_REFERENCE_UNRESOLVED']);
    expect(JSON.stringify(unresolved.diagnostics)).not.toContain('unresolved-synthetic-viewpoint');
    const withConcern = xml.replace('<viewpointPurpose>',
      '<concern><label>ConfidentialFixtureMarker</label></concern><viewpointPurpose>');
    const unsupported = parseMeffViews(withConcern, model);
    expect(unsupported.diagnostics.map(({ code }) => code)).toEqual(['MEFF_VIEWPOINT_FIELD_UNSUPPORTED']);
    expect(preflightImportXml(withConcern).warnings.map(({ code }) => code)).toEqual([
      'MEFF_VIEWPOINT_FIELD_UNSUPPORTED'
    ]);
    expect(JSON.stringify(unsupported.diagnostics)).not.toContain('ConfidentialFixtureMarker');
    const fromModdle = await new ArchimateModdle({ archimate: ArchimateDescriptors }).fromXML(xml);
    expect(fromModdle.rootElement.views.viewpoints.viewpointsList).toHaveLength(1);
    expect(fromModdle.diagnostics).toEqual([]);
  });

  it('imports Container, Label, and semantic-free Line presentation records', async () => {
    const xml = await readFile(path.resolve(here, '../fixtures/meff-schema/valid-view-presentation.xml'), 'utf8');
    const component = { id: 'component-one', type: 'archimate:ApplicationComponent' };
    const service = { id: 'service-two', type: 'archimate:ApplicationService' };
    const relationship = { id: 'serving-one-two', type: 'archimate:Serving' };
    const parsed = parseMeffViews(xml, {
      elementsById: new Map([[component.id, component], [service.id, service]]),
      relationshipsById: new Map([[relationship.id, relationship]])
    });
    expect(parsed.diagnostics).toEqual([]);
    expect(preflightImportXml(xml).warnings).toEqual([]);
    const [ , , container, , line, freeLine] = parsed.views.diagrams.viewsList[0].viewElements;
    expect(container).toMatchObject({
      id: 'container-one', meffType: 'Container', elementRef: undefined,
      meffGeometry: { x: 470, y: 20, w: 180, h: 160 }, label: 'Presentation group'
    });
    expect(container.nodes).toHaveLength(1);
    expect(container.nodes[0]).toMatchObject({
      id: 'label-one', meffType: 'Label', elementRef: undefined,
      label: 'Presentation-only note', x: 490, y: 50, w: 130, h: 40
    });
    expect(line).toMatchObject({
      id: 'line-one', meffType: 'Line', relationshipRef: undefined,
      source: container, target: container.nodes[0],
      style: { lineWidth: 3, lineColor: { r: 10, g: 30, b: 50 } }
    });
    expect(line.waypointsNode.waypoints.map(({ kind }) => kind)).toEqual([
      'sourceAttachment', 'bendpoint', 'targetAttachment'
    ]);
    expect(freeLine).toMatchObject({ id: 'line-free', meffType: 'Line', relationshipRef: undefined });
    expect(freeLine.source).toBeUndefined();
    expect(freeLine.meffGeometry.bendpoints).toHaveLength(2);
    const factory = new ElementFactory({ create: () => ({}) }, {}, (message) => message);
    factory.baseCreate = (type, attrs) => ({ ...attrs, factoryType: type });
    const shapes = new Map();
    const importer = new ArchimateImporter(
      { fire() {} },
      {
        addShape(shape, parent) { shape.parent = parent; shapes.set(shape.id, shape); return shape; },
        addConnection(connection) { return connection; }
      },
      factory,
      { get(id) { return shapes.get(id); } },
      (message) => message,
      { getExternalLabelBounds(bounds) { return bounds; } }
    );
    const groupShape = importer.addElement(container, { type: 'root', x: 0, y: 0 });
    const noteShape = importer.addElement(container.nodes[0], groupShape);
    const drawnLine = importer.addConnection(line);
    expect(groupShape).toMatchObject({ type: 'Container', x: 470, y: 20, width: 180, height: 160 });
    expect(noteShape).toMatchObject({ type: 'Label', text: 'Presentation-only note', x: 20, y: 30 });
    expect(drawnLine).toMatchObject({ type: 'Line', source: groupShape, target: noteShape });
    expect(drawnLine.businessObject.relationshipRef).toBeUndefined();
    const fromModdle = await new ArchimateModdle({ archimate: ArchimateDescriptors }).fromXML(xml);
    expect(fromModdle.diagnostics).toEqual([]);
  });

  it('preserves schema-valid local annotations and view properties separately from semantic names', async () => {
    const xml = await readFile(path.resolve(here, '../fixtures/meff-schema/valid-view-annotations.xml'), 'utf8');
    const component = { id: 'component-one', type: 'archimate:ApplicationComponent', name: 'Semantic component' };
    const service = { id: 'service-two', type: 'archimate:ApplicationService', name: 'Semantic service' };
    const relationship = { id: 'serving-one-two', type: 'archimate:Serving', name: 'Semantic serving' };
    const parsed = parseMeffViews(xml, {
      elementsById: new Map([[component.id, component], [service.id, service]]),
      relationshipsById: new Map([[relationship.id, relationship]])
    });
    expect(parsed.diagnostics).toEqual([]);
    expect(preflightImportXml(xml).warnings.map(({ code }) => code)).toEqual([]);
    const [view, drilldown] = parsed.views.diagrams.viewsList;
    const [node, , connection] = view.viewElements;
    expect(view.meffDocumentation).toEqual([{ language: 'en', value: 'View-specific documentation' }]);
    expect(view.meffProperties).toEqual([{
      propertyDefinitionRef: 'annotation-property',
      values: [{ language: 'en', value: 'Synthetic category' }]
    }]);
    expect(node.localizedLabels).toEqual([{ language: 'en', value: 'Local component label' }]);
    expect(node.label).toBe('Local component label');
    expect(getLabel({ businessObject: node })).toBe('Local component label');
    expect(node.elementRef.name).toBe('Semantic component');
    expect(node.meffDocumentation).toEqual([{ language: 'en', value: 'Node-specific note' }]);
    expect(node.viewRefs).toEqual(['view-synthetic-two']);
    expect(node.resolvedViewRefs).toEqual([drilldown.id]);
    expect(connection.label).toBe('Local serving label');
    expect(getLabel({ businessObject: connection })).toBe('Local serving label');
    expect(connection.relationshipRef.name).toBe('Semantic serving');
    expect(getLabel({ businessObject: { ...node, label: '', localizedLabels: [{ language: 'en', value: '' }] } })).toBe('');
    expect(connection.meffDocumentation).toEqual([{ language: 'en', value: 'Connection-specific note' }]);
    expect(connection.viewRefs).toEqual(['view-synthetic-two']);
    expect(connection.resolvedViewRefs).toEqual([drilldown.id]);
    const fromModdle = await new ArchimateModdle({ archimate: ArchimateDescriptors }).fromXML(xml);
    expect(fromModdle.diagnostics).toEqual([]);
  });

  it('preserves view identity, nested Element membership, and semantic references', async () => {
    const xml = await readFile(fixturePath, 'utf8');
    const component = {
      id: 'component-one',
      type: 'archimate:ApplicationComponent',
      conceptType: 'archimate:ApplicationComponent'
    };
    const service = {
      id: 'service-two',
      type: 'archimate:ApplicationService',
      conceptType: 'archimate:ApplicationService'
    };
    const relationship = {
      id: 'serving-one-two',
      type: 'archimate:Serving',
      conceptType: 'archimate:Serving',
      source: component,
      target: service
    };

    const parsed = parseMeffViews(xml, {
      elementsById: new Map([
        [component.id, component],
        [service.id, service]
      ]),
      relationshipsById: new Map([[relationship.id, relationship]])
    });

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.views.diagrams.viewsList).toHaveLength(1);

    const view = parsed.views.diagrams.viewsList[0];
    expect(view.id).toBe('view-synthetic-one');
    expect(view.name).toBe('Synthetic Application View');
    expect(view.localizedNames).toEqual([
      { language: 'en', value: 'Synthetic Application View' }
    ]);

    const [componentNode, serviceNode, connection] = view.viewElements;
    expect(componentNode.id).toBe('node-component-one');
    expect(componentNode.elementRef).toBe(component);
    expect(componentNode.nodes).toHaveLength(1);
    expect(componentNode.nodes[0].id).toBe('node-service-nested');
    expect(componentNode.nodes[0].elementRef).toBe(service);

    expect(serviceNode.id).toBe('node-service-two');
    expect(serviceNode.elementRef).toBe(service);
    expect(connection.id).toBe('connection-serving-one-two');
    expect(connection.relationshipRef).toBe(relationship);
    expect(connection.source).toBe(componentNode);
    expect(connection.target).toBe(serviceNode);

    expect(componentNode.meffGeometry).toEqual({
      x: 20, y: 40, w: 140, h: 70, coordinateSpace: 'diagram'
    });
    expect(componentNode.style).toEqual({
      lineWidth: 7,
      lineColor: { r: 20, g: 40, b: 60, a: 50 },
      fillColor: { r: 180, g: 210, b: 240, a: 0 },
      font: {
        name: 'Synthetic Sans', size: 10.5, style: 'bold italic',
        color: { r: 11, g: 22, b: 33, a: 75 }
      }
    });
    expect(componentNode.nodes[0].meffGeometry).toEqual({
      x: 10, y: 120, w: 130, h: 70, coordinateSpace: 'diagram'
    });
    expect(connection.style).toEqual({
      lineWidth: 9,
      lineColor: { r: 1, g: 2, b: 3, a: 0 }
    });
    expect(connection.meffGeometry).toEqual({
      sourceAttachment: {
        x: 160, y: 75, kind: 'sourceAttachment', coordinateSpace: 'diagram'
      },
      bendpoints: [
        { x: 220, y: 80, kind: 'bendpoint', coordinateSpace: 'diagram' },
        { x: 260, y: 100, kind: 'bendpoint', coordinateSpace: 'diagram' }
      ],
      targetAttachment: {
        x: 300, y: 75, kind: 'targetAttachment', coordinateSpace: 'diagram'
      },
      coordinateSpace: 'diagram'
    });
    expect(connection.waypointsNode.waypoints.map(({ x, y, kind }) => ({ x, y, kind }))).toEqual([
      { x: 160, y: 75, kind: 'sourceAttachment' },
      { x: 220, y: 80, kind: 'bendpoint' },
      { x: 260, y: 100, kind: 'bendpoint' },
      { x: 300, y: 75, kind: 'targetAttachment' }
    ]);
  });


  it('imports the schema-valid fixture through ArchimateModdle without blanket warnings', async () => {
    const xml = await readFile(fixturePath, 'utf8');
    const parsed = await new ArchimateModdle({ archimate: ArchimateDescriptors }).fromXML(xml);
    const model = parsed.rootElement;
    const view = model.views.diagrams.viewsList[0];
    const component = model.elementsById['component-one'];
    const relationship = model.relationshipsById['serving-one-two'];

    expect(parsed.diagnostics).toEqual([]);
    expect(preflightImportXml(xml).warnings.map(({ code }) => code)).not.toContain('MEFF_DIAGRAMS_UNSUPPORTED');
    expect(view.id).toBe('view-synthetic-one');
    expect(view.viewElements[0].elementRef).toBe(component);
    expect(view.viewElements[2].relationshipRef).toBe(relationship);
    expect(view.viewElements[0].style.font.size).toBe(10.5);
    expect(view.viewElements[0].style.fillColor.a).toBe(0);
    expect(view.viewElements[0].style.font.color.a).toBe(75);
  });

  it('returns no views for a schema Model without a views section', () => {
    const parsed = parseMeffViews(
      '<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" identifier="model-only"><name>Model only</name></model>',
      { elementsById: new Map(), relationshipsById: new Map() }
    );

    expect(parsed.views).toBeUndefined();
    expect(parsed.diagnostics).toEqual([]);
  });

  it('reports unresolved semantic or endpoint references without including IDs', async () => {
    const xml = await readFile(fixturePath, 'utf8');
    const parsed = parseMeffViews(
      xml.replace('elementRef="component-one"', 'elementRef="missing-component"'),
      {
        elementsById: new Map([['service-two', { id: 'service-two', type: 'archimate:ApplicationService' }]]),
        relationshipsById: new Map()
      }
    );

    expect(parsed.diagnostics).toEqual([
      {
        code: 'IMPORT_REFERENCE_UNRESOLVED',
        severity: 'warning',
        stage: 'parse',
        message: 'A MEFF view reference could not be resolved and the record was skipped.'
      }
    ]);
    expect(JSON.stringify(parsed.diagnostics)).not.toContain('missing-component');
  });

  it('emits stable diagnostics for unsupported diagram node types', async () => {
    const xml = await readFile(fixturePath, 'utf8');
    const changed = xml.replace('xsi:type="archimate:Element"', 'xsi:type="archimate:UnknownNode"');
    const parsed = parseMeffViews(changed, {
      elementsById: new Map([
        ['component-one', { id: 'component-one', type: 'archimate:ApplicationComponent' }],
        ['service-two', { id: 'service-two', type: 'archimate:ApplicationService' }]
      ]),
      relationshipsById: new Map([['serving-one-two', { id: 'serving-one-two', type: 'archimate:Serving' }]])
    });

    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'IMPORT_REFERENCE_UNRESOLVED',
      'MEFF_DIAGRAM_NODE_TYPE_UNSUPPORTED'
    ]);
    expect(JSON.stringify(parsed.diagnostics)).not.toContain('node-component-one');
  });


  it('keeps diagram coordinates reversible and applies supported styles without inventing source styles', async () => {
    const xml = await readFile(fixturePath, 'utf8');
    const component = {
      id: 'component-one',
      type: 'archimate:ApplicationComponent',
      conceptType: 'archimate:ApplicationComponent'
    };
    const service = {
      id: 'service-two',
      type: 'archimate:ApplicationService',
      conceptType: 'archimate:ApplicationService'
    };
    const relationship = {
      id: 'serving-one-two',
      type: 'archimate:Serving',
      conceptType: 'archimate:Serving'
    };
    const parsed = parseMeffViews(xml, {
      elementsById: new Map([[component.id, component], [service.id, service]]),
      relationshipsById: new Map([[relationship.id, relationship]])
    });
    const [componentNode, serviceNode, importedConnection] = parsed.views.diagrams.viewsList[0].viewElements;
    const nestedNode = componentNode.nodes[0];
    const factory = new ElementFactory({ create: () => ({}) }, {}, (message) => message);
    factory.baseCreate = (type, attrs) => ({ ...attrs, factoryType: type });
    const shapesById = new Map();
    const canvas = {
      addShape(shape, parent) {
        shape.parent = parent;
        shapesById.set(shape.id, shape);
        return shape;
      },
      addConnection(connection) { return connection; }
    };
    const importer = new ArchimateImporter(
      { fire() {} },
      canvas,
      factory,
      { get(id) { return shapesById.get(id); } },
      (message) => message,
      {}
    );
    const root = { type: 'root', x: 0, y: 0 };
    const parentShape = importer.addElement(componentNode, root);
    const nestedShape = importer.addElement(nestedNode, parentShape);
    const serviceShape = importer.addElement(serviceNode, root);
    factory.createConnection = (attrs) => attrs;
    const drawnConnection = importer.addConnection(importedConnection);

    expect(drawnConnection.source).toBe(parentShape);
    expect(drawnConnection.target).toBe(serviceShape);
    expect(drawnConnection.waypoints.map(({ x, y, kind }) => ({ x, y, kind }))).toEqual([
      { x: 160, y: 75, kind: 'sourceAttachment' },
      { x: 220, y: 80, kind: 'bendpoint' },
      { x: 260, y: 100, kind: 'bendpoint' },
      { x: 300, y: 75, kind: 'targetAttachment' }
    ]);

    expect(parentShape.x).toBe(20);
    expect(parentShape.y).toBe(40);
    expect(nestedShape.x).toBe(-10);
    expect(nestedShape.y).toBe(80);
    expect(nestedShape.x + parentShape.x).toBe(nestedNode.meffGeometry.x);
    expect(nestedShape.y + parentShape.y).toBe(nestedNode.meffGeometry.y);
    expect(nestedNode.style).toBeUndefined();
    expect(nestedShape.style.fillColor).toBe('#B0D0D9');

    const styledShape = factory.createShape({
      type: componentNode.type,
      businessObject: componentNode,
      x: componentNode.x,
      y: componentNode.y,
      width: componentNode.w,
      height: componentNode.h
    });
    expect(styledShape.style).toMatchObject({
      lineWidth: 7,
      lineColor: '#14283c7f',
      fillColor: '#b4d2f000',
      fontName: 'Synthetic Sans',
      fontSize: 10.5,
      fontStyle: 'bold italic',
      fontColor: '#0b1621bf'
    });
    expect(componentNode.meffGeometry.coordinateSpace).toBe('diagram');
  });

  it('produces the same geometry and diagnostics on repeated imports', async () => {
    const xml = await readFile(fixturePath, 'utf8');
    const component = { id: 'component-one', type: 'archimate:ApplicationComponent' };
    const service = { id: 'service-two', type: 'archimate:ApplicationService' };
    const relationship = { id: 'serving-one-two', type: 'archimate:Serving' };
    const rootElement = {
      elementsById: new Map([[component.id, component], [service.id, service]]),
      relationshipsById: new Map([[relationship.id, relationship]])
    };
    const first = parseMeffViews(xml, rootElement);
    const second = parseMeffViews(xml, rootElement);
    const projectGeometry = (result) => result.views.diagrams.viewsList[0].viewElements.map((item) => ({
      id: item.id,
      geometry: item.meffGeometry,
      style: item.style,
      waypoints: item.waypointsNode && item.waypointsNode.waypoints
    }));

    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(projectGeometry(first)).toEqual(projectGeometry(second));
    expect(first.diagnostics).toEqual([]);
  });
});
