/** @vitest-environment jsdom */
// SYNTHETIC: Toolbar services and selection events are generated in-memory.
import { expect, it } from 'vitest';
import { attachProductivityToolbar } from '../../src/diagram-js-adapter/productivity-toolbar.js';

it('shows context actions only for a selection and routes accessible button actions', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const listeners = new Map<string, (event: unknown) => void>();
  const calls: string[] = [];
  const detach = attachProductivityToolbar({
    get(name: string) {
      if (name === 'canvas') return { getContainer: () => host };
      return {
        on: (event: string, listener: (value: unknown) => void) => listeners.set(event, listener),
        off: (event: string) => listeners.delete(event)
      };
    }
  }, {
    duplicate: () => calls.push('duplicate'),
    align: (value) => calls.push(`align:${value}`),
    distribute: (value) => calls.push(`distribute:${value}`),
    deleteSelection: () => calls.push('delete')
  });
  const toolbar = host.querySelector<HTMLElement>('[role="toolbar"]')!;
  expect(toolbar.hidden).toBe(true);
  expect(toolbar.style.display).toBe('none');
  listeners.get('selection.changed')!({ newSelection: [{ id: 'synthetic-node' }] });
  expect(toolbar.hidden).toBe(false);
  expect(toolbar.style.display).toBe('flex');
  (toolbar.querySelector('[aria-label="Duplicate"]') as HTMLButtonElement).click();
  (toolbar.querySelector('[aria-label="Align left"]') as HTMLButtonElement).click();
  (toolbar.querySelector('[aria-label="Distribute horizontal"]') as HTMLButtonElement).click();
  expect(calls).toEqual(['duplicate', 'align:left', 'distribute:horizontal']);
  listeners.get('selection.changed')!({ newSelection: [] });
  expect(toolbar.hidden).toBe(true);
  detach();
  expect(host.querySelector('[role="toolbar"]')).toBeNull();
});
