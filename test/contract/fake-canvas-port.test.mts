// SYNTHETIC: Uses a checked-in hand-authored MEFF fixture and an in-memory fake port.
import { describe, expect, it } from 'vitest';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { readFileSync } from 'node:fs';
import {
  DiagramAdapter, importMeffToModelDto
} from '../../src/model-dto/index.js';
import type { CanvasPort, CanvasProjection, EditorCommand, ModelDto } from '../../src/model-dto/index.js';
import {
  defineCanvasPortContract, summarizeProjection, type CanvasPortHarness,
  type ContractAssert
} from './canvas-port-contract.mjs';

class FakeCanvasPort implements CanvasPort {
  private projection: CanvasProjection | undefined;
  private commandHandler: ((command: EditorCommand) => void) | undefined;
  private selectionHandler: ((ids: string[]) => void) | undefined;

  render(projection: CanvasProjection): void { this.projection = structuredClone(projection); }
  onCommand(handler: (command: EditorCommand) => void): () => void {
    this.commandHandler = handler;
    return () => { this.commandHandler = undefined; };
  }
  onSelection(handler: (ids: string[]) => void): () => void {
    this.selectionHandler = handler;
    return () => { this.selectionHandler = undefined; };
  }
  clear(): void { this.projection = undefined; }
  emitCommand(command: EditorCommand): void { this.commandHandler?.(command); }
  emitSelection(ids: string[]): void { this.selectionHandler?.(ids); }
  readRendered() { return summarizeProjection(this.projection); }
}

function createHarness(): CanvasPortHarness {
  const port = new FakeCanvasPort();
  return {
    port,
    emitCommand: (command) => port.emitCommand(command),
    emitSelection: (ids) => port.emitSelection(ids),
    emitUnsupportedMultiMove: () => { throw new TypeError('Multi-node move is not supported.'); },
    readRendered: () => port.readRendered()
  };
}

const assert: ContractAssert = {
  equal: (actual, expected, message) => expect(actual, message).toBe(expected),
  deepEqual: (actual, expected, message) => expect(actual, message).toEqual(expected),
  notDeepEqual: (actual, expected, message) => expect(actual, message).not.toEqual(expected),
  ok: (value, message) => expect(value, message).toBeTruthy(),
  throws: (action, message) => expect(action, message).toThrow()
};

defineCanvasPortContract('CanvasPort contract: headless fake port', {
  api: { DiagramAdapter, importMeffToModelDto },
  fixtureXml: readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8'),
  createHarness
}, { describe, it, assert });

it('preserves validator-accepted empty string names and labels in projection', () => {
  const model = importMeffToModelDto(readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8')) as ModelDto;
  model.elements.find((element) => element.id === 'component-one')!.name = '';
  model.relationships.find((relationship) => relationship.id === 'serving-one-two')!.name = '';
  model.views[0].nodes.find((node) => node.id === 'node-component')!.label = '';
  model.views[0].connections.find((connection) => connection.id === 'serving-connection')!.label = '';
  const projection = new DiagramAdapter(model).project('view-dto-export');
  expect(projection.nodes.find((node) => node.id === 'node-component')).toMatchObject({ name: '', label: '' });
  expect(projection.connections.find((connection) => connection.id === 'serving-connection'))
    .toMatchObject({ name: '', label: '' });
});
