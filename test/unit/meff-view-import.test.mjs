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

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(here, '../fixtures/meff-schema/valid-view-diagram.xml');

describe('MEFF View and Diagram import', () => {
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
    const changed = xml.replace('xsi:type="archimate:Element"', 'xsi:type="archimate:Container"');
    const parsed = parseMeffViews(changed, {
      elementsById: new Map([
        ['component-one', { id: 'component-one', type: 'archimate:ApplicationComponent' }],
        ['service-two', { id: 'service-two', type: 'archimate:ApplicationService' }]
      ]),
      relationshipsById: new Map([['serving-one-two', { id: 'serving-one-two', type: 'archimate:Serving' }]])
    });

    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'IMPORT_REFERENCE_UNRESOLVED',
      'MEFF_DIAGRAMS_UNSUPPORTED'
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
    const [componentNode] = parsed.views.diagrams.viewsList[0].viewElements;
    const nestedNode = componentNode.nodes[0];
    const factory = new ElementFactory({ create: () => ({}) }, {}, (message) => message);
    factory.baseCreate = (type, attrs) => ({ ...attrs, factoryType: type });
    const importer = new ArchimateImporter(
      { fire() {} },
      { addShape(shape, parent) { shape.parent = parent; return shape; } },
      factory,
      { get() {} },
      (message) => message,
      {}
    );
    const root = { type: 'root', x: 0, y: 0 };
    const parentShape = importer.addElement(componentNode, root);
    const nestedShape = importer.addElement(nestedNode, parentShape);

    expect(parentShape.x).toBe(20);
    expect(parentShape.y).toBe(40);
    expect(nestedShape.x).toBe(-10);
    expect(nestedShape.y).toBe(80);
    expect(nestedShape.x + parentShape.x).toBe(nestedNode.meffGeometry.x);
    expect(nestedShape.y + parentShape.y).toBe(nestedNode.meffGeometry.y);
    expect(nestedNode.style).toBeUndefined();
    expect(nestedShape.style.fillColor).toBe('#B5FFFF');

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
      lineColor: '#14283C80',
      fillColor: '#B4D2F000',
      fontName: 'Synthetic Sans',
      fontSize: 10.5,
      fontStyle: 'bold italic',
      fontColor: '#0B1621BF'
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
