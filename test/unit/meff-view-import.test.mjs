import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseMeffViews } from '../../lib/import/MeffView.js';

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

});
