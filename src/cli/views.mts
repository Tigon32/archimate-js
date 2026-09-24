import { createHash } from 'node:crypto';
import { SaxesParser } from 'saxes';

import { sanitizeBasename } from './arguments.mjs';

const MEFF = 'http://www.opengroup.org/xsd/archimate/3.0/';

export type BatchView = { id: string; name: string; basename: string };

function parseDiagramViews(xml: string): Array<{ id: string; name: string }> {
  const views: Array<{ id: string; name: string }> = [];
  const stack: string[] = [];
  let active: { id: string; name: string } | undefined;
  let inName = false;
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', (tag) => {
    const local = tag.local.toLowerCase();
    const parent = stack.at(-1);
    const grandparent = stack.at(-2);
    stack.push(local);
    if (tag.uri !== MEFF) return;
    if (local === 'view' && parent === 'diagrams' && grandparent === 'views') {
      const attrs = Object.values(tag.attributes);
      const attr = (key: string) => attrs.find((item) => item.local === key)?.value;
      const kind = attr('type');
      if (kind && kind.split(':').at(-1) !== 'Diagram') return;
      active = { id: attr('identifier') || attr('id') || '', name: attr('name') || '' };
      views.push(active);
    } else if (local === 'name' && parent === 'view' && active && !active.name) {
      inName = true;
    }
  });
  parser.on('text', (text) => { if (inName && active) active.name += text; });
  parser.on('closetag', (tag) => {
    if (tag.local.toLowerCase() === 'name' && stack.at(-2) === 'view') inName = false;
    if (tag.local.toLowerCase() === 'view' && stack.at(-2) === 'diagrams') active = undefined;
    stack.pop();
  });
  try { parser.write(xml).close(); } catch { throw new Error('BATCH_VIEWS_INVALID'); }
  return views;
}

/** Select only diagram records the existing renderer can resolve by ID. */
export function listBatchViews(xml: string): BatchView[] {
  const views = parseDiagramViews(xml);
  const ids = new Set<string>();
  for (const view of views) {
    if (!view.id || ids.has(view.id)) throw new Error('BATCH_VIEWS_INVALID');
    ids.add(view.id);
  }
  if (!views.length) throw new Error('BATCH_VIEWS_INVALID');
  views.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const used = new Set<string>();
  return views.map((view) => {
    let stem: string;
    try { stem = sanitizeBasename(view.name || 'view'); } catch { stem = 'view'; }
    let basename = stem;
    if (used.has(basename.toLowerCase())) {
      const digest = createHash('sha256').update(view.id).digest('hex').slice(0, 12);
      basename = `${stem.slice(0, 67)}-${digest}`;
      let count = 2;
      while (used.has(basename.toLowerCase())) basename = `${stem.slice(0, 62)}-${digest}-${count++}`;
    }
    used.add(basename.toLowerCase());
    return { ...view, basename };
  });
}
