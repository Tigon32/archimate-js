import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import ArchimateModdle from '../../lib/moddle/Moddle';
import ArchimateDescriptors from '../../lib/moddle/resources/archimate.json';
import { exportMeff } from '../../lib/export/Meff';

// SYNTHETIC provenance: existing schema-valid fixtures are hand-authored from
// public MEFF 3.1 schema docs. The output used by the XSD gate is transient.
const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/meff-schema');

function project(model) {
  const names = (record) => record.localizedNames;
  const elements = model.elementsNode.baseElements;
  const relationships = model.relationshipsNode.relationships;
  const views = model.views && model.views.diagrams.viewsList || [];
  const projectNode = (node) => ({
    id: node.id, ref: node.elementRef.id, geometry: node.meffGeometry,
    style: node.style, children: (node.nodes || []).map(projectNode)
  });
  return {
    id: model.id, names: names(model), documentation: model.documentation,
    elements: elements.map((element) => ({
      id: element.id, type: element.type, names: names(element), documentation: element.documentation
    })),
    relationships: relationships.map((relation) => ({
      id: relation.id, type: relation.type, names: names(relation),
      documentation: relation.documentation, source: relation.source.id, target: relation.target.id
    })),
    views: views.map((view) => ({
      id: view.id, names: names(view),
      nodes: view.viewElements.filter((item) => item.$type === 'archimate:Node').map(projectNode),
      connections: view.viewElements.filter((item) => item.$type === 'archimate:Connection').map((connection) => ({
        id: connection.id, relationship: connection.relationshipRef.id,
        source: connection.source.id, target: connection.target.id,
        geometry: connection.meffGeometry, style: connection.style
      }))
    }))
  };
}

describe('supported MEFF export', () => {
  for (const [input, output] of [
    ['valid-model.xml', 'exported-model.xml'],
    ['valid-view-diagram.xml', 'exported-view-diagram.xml']
  ]) {
    it('preserves supported semantics through import/export/import for ' + input, async () => {
      const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
      const original = (await moddle.fromXML(await readFile(path.join(fixture, input), 'utf8'))).rootElement;
      const result = exportMeff(original);
      const reparsed = (await moddle.fromXML(result.xml)).rootElement;
      expect(result.diagnostics).toEqual([]);
      expect(project(reparsed)).toEqual(project(original));
      expect(exportMeff(reparsed).xml).toBe(result.xml);
      if (process.env.MEFF_XSD_OUTPUT_DIR) {
        await mkdir(process.env.MEFF_XSD_OUTPUT_DIR, { recursive: true });
        await writeFile(path.join(process.env.MEFF_XSD_OUTPUT_DIR, output), result.xml);
      }
    });
  }

  it('escapes XML data and emits stable, content-free omission diagnostics', async () => {
    const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
    const model = (await moddle.fromXML(await readFile(path.join(fixture, 'valid-view-diagram.xml'), 'utf8'))).rootElement;
    model.name = 'A < B & C';
    model.localizedNames = [{ value: 'A < B & C', language: 'en' }];
    model.metadata = { schema: 'secret payload' };
    model.views.diagrams.viewsList[0].viewElements[0].meffLabel = 'secret payload';
    const first = exportMeff(model);
    expect(first.xml).toContain('<name xml:lang="en">A &lt; B &amp; C</name>');
    expect(first.diagnostics.map(({ code }) => code)).toEqual([
      'MEFF_EXPORT_DIAGRAM_OMITTED', 'MEFF_EXPORT_MODEL_OMITTED'
    ]);
    expect(JSON.stringify(first.diagnostics)).not.toContain('secret payload');
    expect(exportMeff(model)).toEqual(first);
  });

  it('rejects missing mandatory references and duplicate XML identifiers', async () => {
    const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
    const model = (await moddle.fromXML(await readFile(path.join(fixture, 'valid-view-diagram.xml'), 'utf8'))).rootElement;
    const relationship = model.relationshipsNode.relationships[0];
    relationship.sourceRefId = 'absent';
    expect(() => exportMeff(model)).toThrowError(/cannot be serialized/);
    relationship.sourceRefId = 'component-one';
    model.views.diagrams.viewsList[0].id = model.id;
    expect(() => exportMeff(model)).toThrowError(/cannot be serialized/);
  });

  it('exports current integer layout and never reuses stale imported routes', async () => {
    const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
    const model = (await moddle.fromXML(await readFile(path.join(fixture, 'valid-view-diagram.xml'), 'utf8'))).rootElement;
    const [node, , connection] = model.views.diagrams.viewsList[0].viewElements;
    node.x = 35;
    connection.waypointsNode.waypoints = [
      { x: 175, y: 75 }, { x: 245, y: 85 }, { x: 300, y: 75 }
    ];
    const result = exportMeff(model);
    expect(result.diagnostics).toEqual([]);
    expect(result.xml).toContain('elementRef="component-one" x="35"');
    expect(result.xml).toContain('<bendpoint x="245" y="85"/>');
    expect(result.xml).not.toContain('<bendpoint x="220" y="80"/>');
    const reparsed = (await moddle.fromXML(result.xml)).rootElement;
    expect(reparsed.views.diagrams.viewsList[0].viewElements[0].x).toBe(35);
    if (process.env.MEFF_XSD_OUTPUT_DIR) {
      await writeFile(path.join(process.env.MEFF_XSD_OUTPUT_DIR, 'exported-edited-diagram.xml'), result.xml);
    }

    connection.waypointsNode.waypoints[1].x = 245.5;
    const lossy = exportMeff(model);
    expect(lossy.diagnostics.map(({ code }) => code)).toEqual(['MEFF_EXPORT_DIAGRAM_OMITTED']);
    expect(lossy.xml).not.toContain('<bendpoint');
    expect(lossy.xml).not.toContain('x="220" y="80"');
  });

  it('reports locally scoped connection fields as omissions without exposing values', async () => {
    const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
    const model = (await moddle.fromXML(await readFile(path.join(fixture, 'valid-view-diagram.xml'), 'utf8'))).rootElement;
    const connection = model.views.diagrams.viewsList[0].viewElements[2];
    connection.viewRefs = ['private-view-id'];
    connection.resolvedViewRefs = ['private-view-id'];
    connection.localizedLabels = [{ language: 'en', value: 'private-label' }];
    const result = exportMeff(model);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(['MEFF_EXPORT_DIAGRAM_OMITTED']);
    expect(JSON.stringify(result.diagnostics)).not.toContain('private');
    expect(result.xml).not.toContain('private');
  });
});
