import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import ArchimateModdle from '../../lib/moddle/Moddle';
import ArchimateDescriptors from '../../lib/moddle/resources/archimate.json';

describe('synthetic ArchiMate XML import contract', () => {
  it('resolves model, view, element, and relationship references', async () => {
    const xml = await readFile(
      new URL('../fixtures/synthetic/minimal-application-view.xml', import.meta.url),
      'utf8'
    );
    const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
    const { rootElement: model, warnings } = await moddle.fromXML(xml);

    const [ component, service ] = model.elementsNode.baseElements;
    const [ relationship ] = model.relationshipsNode.relationships;
    const [ view ] = model.views.diagrams.viewsList;
    const [ componentNode, serviceNode, connection ] = view.viewElements;

    expect(warnings).toEqual([]);
    expect(model.id).toBe('model-synthetic-minimal');
    expect(component.$type).toBe('archimate:ApplicationComponent');
    expect(service.$type).toBe('archimate:ApplicationService');
    expect(relationship.source).toBe(component);
    expect(relationship.target).toBe(service);
    expect(view.id).toBe('view-synthetic-minimal');
    expect(componentNode.elementRef).toBe(component);
    expect(serviceNode.elementRef).toBe(service);
    expect(connection.relationshipRef).toBe(relationship);
    expect(connection.source).toBe(componentNode);
    expect(connection.target).toBe(serviceNode);
    expect(connection.waypointsNode.waypoints).toHaveLength(3);
  });
});
