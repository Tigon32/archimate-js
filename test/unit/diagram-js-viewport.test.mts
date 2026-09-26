// SYNTHETIC: viewport helper tests use fake services and no model payloads.
import { expect, it } from 'vitest';
import {
  fitSelection,
  fitView,
  onViewportChanged,
  panBy,
  viewportState,
  zoom
} from '../../src/diagram-js-adapter/viewport.js';

function fakeServices() {
  let viewbox = { x: 10, y: 20, width: 200, height: 100, scale: 1 };
  const listeners = new Set<(event: unknown) => void>();
  const canvas = {
    zoom: (level?: number | 'fit-viewport') => {
      if (level === 'fit-viewport') viewbox = { ...viewbox, x: 0, y: 0, scale: 0.5 };
      else if (typeof level === 'number') viewbox = { ...viewbox, scale: level };
      return viewbox.scale;
    },
    viewbox: (box?: false | { x: number; y: number; width: number; height: number }) => {
      if (box && typeof box === 'object') viewbox = { ...viewbox, ...box };
      return viewbox;
    },
    scroll: ({ dx, dy }: { dx: number; dy: number }) => {
      viewbox = { ...viewbox, x: viewbox.x - dx / viewbox.scale, y: viewbox.y - dy / viewbox.scale };
    },
    resized: () => undefined
  };
  return {
    services: {
      canvas,
      selection: { get: () => [{ id: 'selected', x: 40, y: 60, width: 20, height: 10 }] },
      eventBus: {
        on: (_event: string, listener: (event: unknown) => void) => listeners.add(listener),
        off: (_event: string, listener: (event: unknown) => void) => listeners.delete(listener)
      }
    },
    fire: () => listeners.forEach((listener) => listener({}))
  };
}

it('returns plain viewport values for fit, zoom, pan, and viewport events', () => {
  const { services, fire } = fakeServices();
  const events: unknown[] = [];
  const off = onViewportChanged(services, (event) => events.push(event));
  expect(viewportState(services.canvas)).toEqual({ x: 10, y: 20, scale: 1 });
  expect(zoom(services, 2)).toEqual({ x: 10, y: 20, scale: 2 });
  expect(panBy(services, 4, 8)).toEqual({ x: 8, y: 16, scale: 2 });
  expect(fitView(services)).toEqual({ x: 0, y: 0, scale: 0.5 });
  fire();
  off();
  fire();
  expect(events).toEqual([{ x: 0, y: 0, scale: 0.5 }]);
});

it('fits the current selection bounds with padding', () => {
  const { services } = fakeServices();
  expect(fitSelection(services)).toEqual({ x: -60, y: -40, scale: 1 });
  expect(services.canvas.viewbox()).toMatchObject({ width: 220, height: 210 });
});
