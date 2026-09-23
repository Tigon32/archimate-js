/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';

import { displayGraphicalView } from '../../lib/import/Importer.js';
import { logger } from '../../lib/util/Logger.js';
import BaseViewer from '../../lib/BaseViewer.js';
import {
  preflightImportXml,
  summarizeParseWarnings,
  IMPORT_XML_LIMITS
} from '../../lib/import/XmlPreflight.js';

function fakeViewer({ addElement = vi.fn(() => ({})), addConnection = vi.fn() } = {}) {
  const importer = {
    addRoot: vi.fn(() => ({})),
    addElement,
    addConnection
  };
  return {
    importer,
    get(name) {
      if (name === 'ArchimateImporter') return importer;
      if (name === 'eventBus') return { fire: vi.fn() };
      if (name === 'translate') return (message) => message;
      throw new Error('unexpected service');
    }
  };
}

function modelFor(viewElements) {
  const view = { id: 'secret-view', viewElements };
  return { views: { diagrams: { viewsList: [view] } }, view };
}

describe('safe importer diagnostics', () => {
  it('returns deterministic content-free diagnostics when view objects or relationships are skipped', async () => {
    const privateData = 'PrivateCustomerSystem';
    const loggerLogSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { importer, ...viewer } = fakeViewer({
      addElement: vi.fn(() => { throw new Error(privateData); }),
      addConnection: vi.fn(() => { throw new Error(privateData); })
    });
    const { view, ...model } = modelFor([
      { $type: 'archimate:DiagramObject', id: 'private-id', name: privateData },
      {
        $type: 'archimate:Connection',
        $instanceOf: (type) => type === 'archimate:Connection',
        id: 'private-relationship',
        name: privateData
      }
    ]);

    const result = await displayGraphicalView(viewer, model, view);

    expect(result.diagnostics).toEqual([
      {
        code: 'IMPORT_VIEW_ELEMENT_SKIPPED',
        severity: 'warning',
        stage: 'render',
        message: 'A view element could not be imported and was skipped.'
      },
      {
        code: 'IMPORT_VIEW_CONNECTION_SKIPPED',
        severity: 'warning',
        stage: 'render',
        message: 'A view connection could not be imported and was skipped.'
      }
    ]);
    expect(JSON.stringify(result)).not.toContain(privateData);
    expect(JSON.stringify([...loggerLogSpy.mock.calls, ...loggerWarnSpy.mock.calls]))
      .not.toContain(privateData);
    expect(importer.addElement).toHaveBeenCalledTimes(1);
    expect(importer.addConnection).toHaveBeenCalledTimes(1);
    loggerLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('passes each nested view node to its actual parent shape', async () => {
    const root = {};
    const parentShape = { id: 'parent-shape' };
    const importer = {
      addRoot: vi.fn(() => root),
      addElement: vi.fn((node) => node.id === 'parent' ? parentShape : { id: 'child-shape' }),
      addConnection: vi.fn()
    };
    const viewer = {
      get(name) {
        if (name === 'ArchimateImporter') return importer;
        if (name === 'eventBus') return { fire: vi.fn() };
        if (name === 'translate') return (message) => message;
        throw new Error('unexpected service');
      }
    };
    const parent = { $type: 'archimate:DiagramObject', id: 'parent', nodes: [] };
    parent.nodes.push({ $type: 'archimate:DiagramObject', id: 'child', nodes: [] });

    const model = modelFor([]);
    const view = model.views.diagrams.viewsList[0] = { id: 'secret-view', viewElements: [parent] };

    await displayGraphicalView(viewer, model, view);

    expect(importer.addElement.mock.calls.map(([node, shape]) => [node.id, shape])).toEqual([
      ['parent', root], ['child', parentShape]
    ]);
  });

  it('records view depth and cycle limits without including identifiers', async () => {
    const deepRoot = { $type: 'archimate:DiagramObject', id: 'private-id', nodes: [] };
    let cursor = deepRoot;
    for (let i = 0; i < 130; i++) {
      const child = { $type: 'archimate:DiagramObject', nodes: [] };
      cursor.nodes.push(child);
      cursor = child;
    }
    const cycleRoot = { $type: 'archimate:DiagramObject', id: 'private-cycle', nodes: [] };
    cycleRoot.nodes.push(cycleRoot);
    const { view, ...model } = modelFor([deepRoot, cycleRoot]);

    const result = await displayGraphicalView(fakeViewer(), model, view);

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'IMPORT_VIEW_DEPTH_LIMIT', 'IMPORT_VIEW_CYCLE'
    ]);
    expect(JSON.stringify(result)).not.toContain('private-');
  });

  it('rejects malformed, oversized, and deeply nested XML before moddle parsing', () => {
    const malformed = preflightImportXml('<model>private payload');
    const oversized = preflightImportXml('x'.repeat(IMPORT_XML_LIMITS.maxBytes + 1));
    const deep = '<a>'.repeat(IMPORT_XML_LIMITS.maxDepth + 1) +
      '</a>'.repeat(IMPORT_XML_LIMITS.maxDepth + 1);

    expect(malformed.diagnostics[0]).toMatchObject({
      code: 'IMPORT_XML_MALFORMED', stage: 'parse', severity: 'error'
    });
    expect(oversized.diagnostics[0].code).toBe('XML_SIZE_LIMIT');
    expect(preflightImportXml(deep).diagnostics[0].code).toBe('XML_DEPTH_LIMIT');
    expect(JSON.stringify([malformed, oversized, preflightImportXml(deep)]))
      .not.toContain('private payload');
  });

  it('blocks hostile XML on BaseViewer.importXML before the moddle parser runs', async () => {
    const privatePayload = 'PRIVATE_MODEL_PAYLOAD';
    const fromXML = vi.fn();
    const events = [];
    const viewer = {
      _moddle: { fromXML },
      _emit(name, data) {
        events.push({ name, data });
        return undefined;
      }
    };
    const oversized = `<model>${privatePayload}${'x'.repeat(IMPORT_XML_LIMITS.maxBytes)}</model>`;
    let caught;

    try {
      await BaseViewer.prototype.importXML.call(viewer, oversized);
    } catch (error) {
      caught = error;
    }

    expect(fromXML).not.toHaveBeenCalled();
    expect(caught).toMatchObject({ code: 'XML_SIZE_LIMIT' });
    expect(caught.message).not.toContain(privatePayload);
    expect(caught.diagnostics).toMatchObject([{ code: 'XML_SIZE_LIMIT' }]);
    expect(events.map(({ name }) => name)).toEqual([
      'import.parse.start', 'import.parse.complete', 'import.done'
    ]);
    expect(JSON.stringify(events.slice(1))).not.toContain(privatePayload);
    expect(events[2].data.warnings).toEqual(['XML size limit exceeded.']);
  });

  it('maps unresolved references and unsupported types to stable diagnostics without parser text', () => {
    const diagnostics = summarizeParseWarnings([
      new Error('unresolved reference to PrivateCustomerSystem'),
      new Error('unsupported type PrivateSecretType')
    ]);

    expect(diagnostics.map(({ code }) => code)).toEqual([
      'IMPORT_REFERENCE_UNRESOLVED', 'IMPORT_TYPE_UNSUPPORTED'
    ]);
    expect(JSON.stringify(diagnostics)).not.toMatch(/PrivateCustomerSystem|PrivateSecretType/);
  });
});
