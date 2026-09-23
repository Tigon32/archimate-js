import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import ArchimateModdle from '../../lib/moddle/Moddle';
import ArchimateDescriptors from '../../lib/moddle/resources/archimate.json';

describe('synthetic ArchiMate XML import contract', () => {
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
  });

  it('round-trips supported model identity and name while exposing current content loss', async () => {
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
});
