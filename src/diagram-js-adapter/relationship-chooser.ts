import { CONCEPT_REGISTRY, createConceptRegistry } from '../language/concept-registry.mjs';
import {
  evaluateRelationshipChoices,
  quickCreateCandidates,
  RelationshipChooser
} from '../modeler/relationship-chooser.js';
import { ConceptPicker, type CreateElementCommand } from '../modeler/concept-picker.js';
import type { EditorCommand } from '../model-dto/editor.js';
import type { RelationshipCandidate } from '../modeler/relationship-chooser.js';

type Element = {
  id: string;
  type?: string;
  businessObject?: {
    type?: string;
    elementRef?: { id?: string; type?: string };
    relationshipRef?: { id?: string; type?: string };
  };
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};
type EventBus = { on(event: string, priority: number, handler: (event: any) => unknown): void;
  off(event: string, handler: (event: any) => unknown): void };
type Modeling = { connect(source: Element, target: Element, attrs: { type: string }, hints?: unknown): unknown };
type Canvas = { getContainer(): HTMLElement };
type Services = { get(name: string): unknown };

export interface RelationshipChooserAdapterOptions {
  modeler: Services;
  viewId: string;
  editor: {
    createId(kind: 'element' | 'node' | 'relationship' | 'connection'): string;
    execute(command: EditorCommand): void;
    startNameEditing(nodeId: string): void;
  };
}

export function attachRelationshipChooser(options: RelationshipChooserAdapterOptions): () => void {
  const eventBus = options.modeler.get('eventBus') as EventBus;
  const modeling = options.modeler.get('modeling') as Modeling;
  const canvas = options.modeler.get('canvas') as Canvas;
  let chooser: RelationshipChooser | undefined;
  let picker: ConceptPicker | undefined;
  const onConnectEnd = (event: any): false | undefined => {
    const context = event.context;
    const source = context?.source as Element | undefined;
    const target = context?.target as Element | undefined;
    if (!isElement(source)) return;
    if (!isElement(target)) {
      picker = openQuickCreate(options, canvas, source, event, modeling, () => {
        picker = undefined;
      });
      return false;
    }
    const choice = evaluateRelationshipChoices(typeOf(source), typeOf(target));
    if (choice.status === 'default') {
      context.canExecute = { type: choice.allowed[0]!.type };
      return;
    }
    context.canExecute = false;
    chooser?.close(false);
    chooser = new RelationshipChooser({
      choice,
      anchor: { x: event.x, y: event.y },
      onChoose: (candidate) => modeling.connect(source, target, { type: candidate.type }),
      onCancel: () => { chooser = undefined; }
    });
    return false;
  };
  eventBus.on('connect.end', 1250, onConnectEnd);
  return () => {
    eventBus.off('connect.end', onConnectEnd);
    chooser?.close(false);
    picker?.close();
  };
}

function openQuickCreate(
  options: RelationshipChooserAdapterOptions,
  canvas: Canvas,
  source: Element,
  event: any,
  modeling: Modeling,
  onClose: () => void
): ConceptPicker {
  const candidates = quickCreateCandidates(typeOf(source), CONCEPT_REGISTRY);
  const registry = createConceptRegistry(candidates.map(({ concept }) => concept)
    .filter((concept, index, all) => all.indexOf(concept) === index));
  return new ConceptPicker({
    viewId: options.viewId,
    position: { x: event.x, y: event.y },
    anchor: { x: event.x, y: event.y },
    registry,
    returnFocus: canvas.getContainer().querySelector('svg'),
    editor: {
      createId: options.editor.createId,
      execute: options.editor.execute,
      startNameEditing: options.editor.startNameEditing
    },
    onChoose: (command, result) => {
      const choice = evaluateRelationshipChoices(typeOf(source), result.type);
      if (choice.status === 'feedback') return;
      if (choice.status === 'chooser') {
        new RelationshipChooser({
          choice,
          onChoose: (candidate) => commitQuickCreate(options, source, command, candidate),
          onCancel: onClose
        });
        return;
      }
      commitQuickCreate(options, source, command, choice.allowed[0]!);
    }
  });
}

function commitQuickCreate(
  options: RelationshipChooserAdapterOptions,
  source: Element,
  command: CreateElementCommand,
  candidate: RelationshipCandidate
): void {
  const relationshipId = options.editor.createId('relationship');
  const connectionId = options.editor.createId('connection');
  options.editor.execute(command);
  try {
    options.editor.execute({
      type: 'create-relationship',
      viewId: options.viewId,
      relationship: {
        id: relationshipId, type: `archimate:${candidate.type}`,
        sourceId: elementRef(source), targetId: command.element.id
      },
      connection: {
        id: connectionId, kind: 'relationship', relationshipId,
        sourceId: source.id, targetId: command.node.id,
        waypoints: [{ x: source.x ?? command.node.x, y: source.y ?? command.node.y },
          { x: command.node.x, y: command.node.y }]
      }
    });
  } catch (error) {
    options.editor.execute({ type: 'delete', viewId: options.viewId, itemId: command.node.id });
    throw error;
  }
  options.editor.startNameEditing(command.node.id);
}

function isElement(value: Element | undefined): value is Element {
  return Boolean(value?.id && !value.businessObject?.relationshipRef &&
    value.businessObject?.type !== 'Note' && typeOf(value));
}

function typeOf(element: Element): string {
  return (element.businessObject?.elementRef?.type || element.type || '').replace(/^archimate:/, '');
}

function elementRef(element: Element): string {
  return element.businessObject?.elementRef?.id || element.id;
}
