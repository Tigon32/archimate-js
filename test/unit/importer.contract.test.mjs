import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import ArchimateModdle from '../../lib/moddle/Moddle';
import ArchimateDescriptors from '../../lib/moddle/resources/archimate.json';
import { getLabel } from '../../lib/features/label-editing/LabelUtil';
import ElementFactory from '../../lib/features/modeling/ElementFactory';

describe('synthetic ArchiMate XML import contract', () => {
  it('maps qualified element and relationship types to renderer keys with visible defaults', async () => {
    const xml = await readFile(
      new URL('../fixtures/synthetic/read-only-showcase.xml', import.meta.url),
      'utf8'
    );
    const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
    const { rootElement: model } = await moddle.fromXML(xml);
    const view = model.views.diagrams.viewsList[0];
    const semanticNode = view.viewElements[0];
    const semanticConnection = view.viewElements.find((element) => element.$type === 'archimate:Connection');
    const factory = new ElementFactory({ create: () => ({}) }, moddle, (message) => message);
    factory.baseCreate = (type, attrs) => ({ factoryType: type, ...attrs });

    const shape = factory.createShape({
      type: semanticNode.elementRef.type,
      businessObject: semanticNode,
      x: semanticNode.x,
      y: semanticNode.y,
      width: semanticNode.w,
      height: semanticNode.h
    });
    const connection = factory.createConnection({
      type: semanticConnection.relationshipRef.type,
      businessObject: semanticConnection,
      source: {},
      target: {},
      waypoints: []
    });

    expect(semanticNode.elementRef.type).toBe('archimate:BusinessActor');
    expect(shape).toMatchObject({
      type: 'BusinessActor',
      layer: 'Business',
      aspect: 'Active structure',
      name: 'Customer',
      style: {
        fillColor: '#FFFFB5',
        lineColor: '#00000066',
        textAlignment: 'center',
        textPosition: 'middle'
      }
    });
    expect(connection).toMatchObject({
      type: 'Assignment',
      style: { lineColor: '#000000', lineWidth: 1 }
    });
  });

  it('parses the public synthetic fixture into an ArchiMate model root', async () => {
    const xml = await readFile(
      new URL('../fixtures/synthetic/minimal-application-view.xml', import.meta.url),
      'utf8'
    );
    const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
    const { rootElement: model } = await moddle.fromXML(xml);

    expect(model).toBeDefined();
    expect(model.$type).toBe('archimate:Model');
    expect(model.id).toBe('model-synthetic-minimal');
    expect(model.elementsNode.baseElements).toHaveLength(2);
    expect(model.views.diagrams.viewsList.map((view) => view.id)).toEqual(['view-synthetic-minimal']);
    expect(model.views.diagrams.viewsList[0].viewElements).toHaveLength(3);
    const componentViewNode = model.views.diagrams.viewsList[0].viewElements[0];
    expect(componentViewNode.label).toContain('Component label');
    expect(getLabel({ businessObject: componentViewNode, name: 'Semantic element name' }))
      .toContain('Component label');
  });

  it('preserves the directed Association reference when creating an imported diagram connection', async () => {
    const xml = await readFile(
      new URL('../fixtures/synthetic/directed-association.xml', import.meta.url),
      'utf8'
    );
    const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
    const { rootElement: model } = await moddle.fromXML(xml);
    const view = model.views.diagrams.viewsList[0];
    const semanticConnection = view.viewElements.find((element) => element.$type === 'archimate:Connection');
    const factory = new ElementFactory({ create: () => ({}) }, moddle, (message) => message);
    factory.baseCreate = (type, attrs) => ({ factoryType: type, ...attrs });

    const connection = factory.createConnection({
      type: semanticConnection.relationshipRef.type,
      businessObject: semanticConnection,
      source: {},
      target: {},
      waypoints: []
    });

    expect(semanticConnection.relationshipRef.isDirected).toBe(true);
    expect(connection).toMatchObject({
      type: 'Association',
      typeOption: true,
      businessObject: { relationshipRef: { isDirected: true } }
    });
  });

  it('records parser-level identity and name round-trip while exposing content loss', async () => {
    const xml = await readFile(
      new URL('../fixtures/synthetic/meff-core-candidate.xml', import.meta.url),
      'utf8'
    );
    const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
    const { rootElement: model } = await moddle.fromXML(xml);

    expect(model.$type).toBe('archimate:Model');
    expect(model.id).toBe('model-synthetic-exchange');
    expect(model.name).toBe('Synthetic Exchange Candidate');
    // The current moddle descriptors do not map the candidate's element
    // entries. They ingest the relationship only as a generic object, without
    // resolving its endpoints. Keep this visible as a gap instead of claiming
    // end-to-end exchange support.
    expect(model.elementsNode.baseElements ?? []).toEqual([]);
    expect(model.relationshipsNode.relationships).toHaveLength(1);
    expect(model.relationshipsNode.relationships[0]).toMatchObject({
      id: 'exchange-serving-relationship',
      $type: 'archimate:Relationship',
      type: 'archimate:ServingRelationship'
    });
    expect(model.relationshipsNode.relationships[0].source).toBeUndefined();
    expect(model.relationshipsNode.relationships[0].target).toBeUndefined();

    const { xml: serialized } = await moddle.toXML(model);
    const { rootElement: reparsed, warnings: roundTripWarnings } = await moddle.fromXML(serialized);

    expect(reparsed.id).toBe(model.id);
    expect(reparsed.name).toBe(model.name);
    expect(reparsed.elementsNode.baseElements ?? []).toEqual([]);
    expect(reparsed.relationshipsNode.relationships).toHaveLength(1);
    expect(reparsed.relationshipsNode.relationships[0]).toMatchObject({
      id: 'exchange-serving-relationship',
      $type: 'archimate:Relationship',
      type: 'archimate:ServingRelationship'
    });
    expect(roundTripWarnings).toEqual([]);
  });

  it('imports schema-valid MEFF Model identifiers, types, localized names, and endpoints deterministically', async () => {
    const xml = await readFile(
      new URL('../fixtures/meff-schema/valid-model.xml', import.meta.url),
      'utf8'
    );
    const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
    const first = await moddle.fromXML(xml);
    const second = await moddle.fromXML(xml);
    const model = first.rootElement;
    const [source, target] = model.elementsNode.baseElements;
    const [relationship] = model.relationshipsNode.relationships;

    expect(model.id).toBe('model-synthetic-meff');
    expect(model.name).toBe('Synthetic MEFF Schema Check');
    expect(source).toMatchObject({
      id: 'component-source',
      type: 'archimate:ApplicationComponent',
      conceptType: 'archimate:ApplicationComponent',
      name: 'Source component',
      localizedNames: [{ language: 'en', value: 'Source component' }]
    });
    expect(target).toMatchObject({
      id: 'service-target',
      type: 'archimate:ApplicationService',
      name: 'Target service'
    });
    expect(relationship).toMatchObject({
      id: 'serving-link',
      type: 'archimate:Serving',
      sourceRefId: 'component-source',
      targetRefId: 'service-target',
      name: 'Synthetic serving relation'
    });
    expect(relationship.source).toBe(source);
    expect(relationship.target).toBe(target);
    expect(first.elementsById['component-source']).toBe(source);
    expect(first.elementsById['serving-link']).toBe(relationship);
    expect(model.elementsById).toBe(first.elementsById);
    expect(first.diagnostics).toEqual([]);

    const project = ({ rootElement, diagnostics }) => ({
      model: {
        id: rootElement.id,
        name: rootElement.name,
        elements: rootElement.elementsNode.baseElements.map(({ id, type, name, localizedNames }) =>
          ({ id, type, name, localizedNames })),
        relationships: rootElement.relationshipsNode.relationships.map(({ id, type, source, target }) =>
          ({ id, type, source: source.id, target: target.id }))
      },
      diagnostics
    });
    expect(project(first)).toEqual(project(second));
  });
});
