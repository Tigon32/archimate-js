import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import ArchimateModdle from '../../lib/moddle/Moddle';
import ArchimateDescriptors from '../../lib/moddle/resources/archimate.json';
import { preflightImportXml } from '../../lib/import/XmlPreflight';

const fixture = new URL('../fixtures/meff-schema/valid-model-records.xml', import.meta.url);
const importModel = (xml) => new ArchimateModdle({ archimate: ArchimateDescriptors }).fromXML(xml);

describe('MEFF 3.1 Model records', () => {
  it('preserves model metadata, definitions, concept properties, and organization trees', async () => {
    const xml = await readFile(fixture, 'utf8');
    const first = await importModel(xml);
    const second = await importModel(xml);
    const model = first.rootElement;
    const [component] = model.elementsNode.baseElements;
    const [relationship] = model.relationshipsNode.relationships;
    const [definition] = model.propertyDefinitions;
    const [folder] = model.organizations[0].items;

    expect(preflightImportXml(xml).warnings).toEqual([]);
    expect(first.diagnostics).toEqual([]);
    expect(model.version).toBe('1.2');
    expect(model.metadata).toEqual({ schema: 'urn:synthetic:metadata', schemaversion: '1.1' });
    expect(model.propertyDefinitionsById['pd-status']).toBe(definition);
    expect(definition).toMatchObject({ id: 'pd-status', type: 'string', name: 'Status' });
    expect(model.properties[0].propertyDefinition).toBe(definition);
    expect(model.properties[0].values).toEqual([{ language: 'en', value: 'Draft' }]);
    expect(component.properties[0].propertyDefinition).toBe(definition);
    expect(component.properties[0].values).toEqual([
      { language: 'en', value: 'Active' }, { language: 'fr', value: 'Actif' }
    ]);
    expect(relationship.properties[0].propertyDefinition).toBe(definition);
    expect(folder).toMatchObject({ id: 'folder-one', label: 'Applications' });
    expect(folder.items.map(({ id, identifierRef }) => ({ id, identifierRef }))).toEqual([
      { id: 'entry-one', identifierRef: 'app-one' },
      { id: 'entry-two', identifierRef: 'serving-one' }
    ]);
    expect(folder.items[0].referencedConcept).toBe(component);
    expect(folder.items[1].referencedConcept).toBe(relationship);
    // Tree position does not change any semantic element or relationship type.
    expect(component.type).toBe('archimate:ApplicationComponent');
    expect(relationship.type).toBe('archimate:Serving');
    expect(JSON.stringify(first.diagnostics)).toEqual(JSON.stringify(second.diagnostics));
    expect(JSON.stringify({
      metadata: model.metadata,
      definitions: model.propertyDefinitions,
      organizations: model.organizations.map(({ items }) => items.map(({ id }) => id))
    }, (key, value) => key === 'propertyDefinition' ? undefined : value)).toEqual(JSON.stringify({
      metadata: second.rootElement.metadata,
      definitions: second.rootElement.propertyDefinitions,
      organizations: second.rootElement.organizations.map(({ items }) => items.map(({ id }) => id))
    }, (key, value) => key === 'propertyDefinition' ? undefined : value));
  });

  it('uses stable, content-free diagnostics for unknown children and unresolved references', async () => {
    const xml = await readFile(fixture, 'utf8');
    const altered = xml.replace('<schemaversion>1.1</schemaversion>',
      '<schemaversion>1.1</schemaversion><privateRecord>secret-content</privateRecord>')
      .replace('propertyDefinitionRef="pd-status"', 'propertyDefinitionRef="missing-secret"')
      .replace('identifierRef="app-one"', 'identifierRef="missing-secret"');
    const first = await importModel(altered);
    const second = await importModel(altered);
    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.diagnostics.map(({ code }) => code)).toEqual([
      'IMPORT_REFERENCE_UNRESOLVED', 'MEFF_MODEL_METADATA_UNSUPPORTED'
    ]);
    expect(JSON.stringify(first.diagnostics)).not.toMatch(/secret|private/i);
    expect(preflightImportXml(altered).warnings.map(({ code }) => code))
      .toContain('MEFF_MODEL_METADATA_UNSUPPORTED');
  });

  it('keeps repeated metadata schema sets and independent organization trees in source order', async () => {
    const xml = (await readFile(fixture, 'utf8'))
      .replace('<metadata><schema>urn:synthetic:metadata</schema><schemaversion>1.1</schemaversion></metadata>',
        '<metadata><schemaInfo><schema>urn:synthetic:first</schema></schemaInfo>' +
        '<schemaInfo><schemaversion>2</schemaversion></schemaInfo></metadata>')
      .replace('</organizations>', '</organizations><organizations><item identifier="folder-two">' +
        '<label>Services</label><item identifierRef="service-one" /></item></organizations>');
    expect(preflightImportXml(xml).warnings).toEqual([]);
    const { rootElement: model, diagnostics } = await importModel(xml);
    expect(diagnostics).toEqual([]);
    expect(model.metadata).toEqual({ schemaInfo: [
      { schema: 'urn:synthetic:first' }, { schemaversion: '2' }
    ] });
    expect(model.organizations.map(({ items }) => items[0].label)).toEqual(['Applications', 'Services']);
    expect(model.organizations[1].items[0].items[0].referencedConcept.id).toBe('service-one');
  });
});
