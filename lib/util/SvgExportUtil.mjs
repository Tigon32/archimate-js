import { scopedNotationCss } from '../draw/NotationAdapter.mjs';

const LOCAL_URL_PATTERN = /url\(\s*(['"]?)#[\w:.-]+\1\s*\)/gi;

/**
 * Remove active content and network-backed references from a cloned SVG tree.
 * Only the export clone is changed; the live viewer remains untouched.
 */
export function sanitizeSvgTree(root) {
  const nodes = [ root, ...root.querySelectorAll('*') ];

  nodes.forEach((node) => {
    const localName = (node.localName || '').toLowerCase();

    if ([ 'script', 'style', 'foreignobject', 'iframe', 'object', 'embed' ].includes(localName)) {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      } else {
        node.textContent = '';
      }
      return;
    }

    Array.from(node.attributes || []).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      // diagram-js uses raw model IDs for its live hit-testing. They are not
      // needed by a standalone export and must not disclose model internals.
      if (name.startsWith('data-') && !name.startsWith('data-export-')) {
        node.removeAttribute(attribute.name);
        return;
      }

      if (/^on/.test(name) || name === 'src') {
        node.removeAttribute(attribute.name);
        return;
      }

      if (name === 'href' || name === 'xlink:href') {
        if (!/^#[\w:.-]+$/.test(value)) {
          node.removeAttribute(attribute.name);
        }
        return;
      }

      if (/@import|expression\s*\(/i.test(value)) {
        node.removeAttribute(attribute.name);
        return;
      }

      const remainingUrls = value.replace(LOCAL_URL_PATTERN, '');

      if (/url\s*\(/i.test(remainingUrls)) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  return root;
}

/** Replace renderer- and model-derived SVG ids with stable, content-free ids. */
export function normalizeSvgIds(roots) {
  const rootNodes = Array.isArray(roots) ? roots.filter(Boolean) : [ roots ].filter(Boolean);
  const nodes = rootNodes.flatMap((root) => [ root, ...root.querySelectorAll('*') ]);
  const idMap = new Map();
  const assignedIds = new Map();

  promoteExportSemantics(nodes);

  nodes.forEach((node) => {
    const id = node.getAttribute && node.getAttribute('id');
    if (!id) return;

    const normalizedId = 'archimate-export-id-' + assignedIds.size;
    if (!idMap.has(id)) idMap.set(id, normalizedId);
    // Duplicate source IDs receive distinct export IDs. References to an
    // ambiguous source ID deterministically resolve to its first instance.
    assignedIds.set(node, normalizedId);
  });

  nodes.forEach((node) => normalizeNodeReferences(node, idMap, assignedIds));

  return roots;
}

function promoteExportSemantics(nodes) {
  // The renderer marks only visible diagram objects. Promote that metadata on
  // the detached export clone; no accessibility roles/focus enter the editor.
  nodes.forEach((node) => {
    const kind = node.getAttribute && node.getAttribute('data-export-kind');
    const name = node.getAttribute && node.getAttribute('data-export-name');

    if (node.localName?.toLowerCase() === 'defs') {
      node.setAttribute('aria-hidden', 'true');
    }
    if (node.getAttribute && /\bdjs-(?:hit|outline)\b/.test(node.getAttribute('class') || '')) {
      node.setAttribute('aria-hidden', 'true');
    }

    if (kind === 'node' || kind === 'relationship') {
      node.setAttribute('role', 'graphics-object group');
      // tiny-svg's innerSVG serializes attributes without escaping '&'/'<'.
      // Escape the clone's label before serialization to keep XML well formed.
      node.setAttribute('aria-label', escapeXml(name || 'Unnamed diagram object'));
      // The named group represents its visual contents. Text, icons, paths,
      // hit areas, and other graphical primitives must not be read twice.
      node.querySelectorAll('*').forEach((child) => {
        if (!child.getAttribute('data-export-kind')) {
          child.setAttribute('aria-hidden', 'true');
        }
      });
    }

    if (node.getAttribute && node.getAttribute('class')?.split(/\s+/).includes('djs-label') && !kind) {
      node.setAttribute('aria-hidden', 'true');
    }

    if (node.removeAttribute) {
      node.removeAttribute('data-export-kind');
      node.removeAttribute('data-export-name');
    }
  });
}

function normalizeNodeReferences(node, idMap, assignedIds) {
  if (!node.attributes || !node.setAttribute) return;

  Array.from(node.attributes).forEach(({ name, value }) => {
      if (name === 'id') {
        node.setAttribute(name, assignedIds.get(node));
        return;
      }

      if ((name === 'href' || name === 'xlink:href') && value.startsWith('#')) {
        const normalizedId = idMap.get(value.slice(1));
        if (normalizedId) {
          node.setAttribute(name, '#' + normalizedId);
        }
        return;
      }

      if (name === 'aria-labelledby' || name === 'aria-describedby') {
        const references = value.split(/\s+/).map((id) => idMap.get(id)).filter(Boolean);
        if (references.length) node.setAttribute(name, references.join(' '));
        else node.removeAttribute(name);
        return;
      }

      if (/url\(/i.test(value)) {
        node.setAttribute(name, value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/gi,
          (match, quote, id) => idMap.has(id) ? 'url(' + quote + '#' + idMap.get(id) + quote + ')' : match));
      }
  });
}

/**
 * Serialize a rendered diagram as a small, deterministic SVG wrapper.
 */
export function createSvg({ bbox, contents, defs = '', title = 'ArchiMate diagram', description }) {
  const safeTitle = escapeXml(title || 'ArchiMate diagram');
  const safeDescription = escapeXml(description || 'ArchiMate view with named diagram elements and relationships.');
  const accessibility = '<title id="archimate-svg-title">' + safeTitle + '</title>' +
    '<desc id="archimate-svg-description">' + safeDescription + '</desc>';
  const labelledBy = 'archimate-svg-title';

  // Sanitization removes arbitrary source <style> nodes. Add only the trusted
  // packaged notation sheet after sanitization for self-contained SVG output.
  const usesNotation = /class="[^"]*\bam-(?:shape|rel|icon)\b/.test(contents);
  const notationClass = usesNotation ? ' class="am-diagram"' : '';
  const notationStyle = usesNotation ? '<style>' + scopedNotationCss() + '</style>' : '';
  const hiddenDefs = defs.startsWith('<defs>')
    ? '<defs aria-hidden="true">' + defs.slice('<defs>'.length)
    : defs;
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"' + notationClass + ' ' +
      'role="graphics-document document" aria-labelledby="' + labelledBy + '" aria-describedby="archimate-svg-description" ' +
      'width="' + formatNumber(bbox.width) + '" height="' + formatNumber(bbox.height) + '" ' +
      'viewBox="' + [ bbox.x, bbox.y, bbox.width, bbox.height ].map(formatNumber).join(' ') + '">' +
      accessibility + notationStyle + hiddenDefs + contents + '</svg>';
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError('SVG bounds must contain finite numbers');
  }

  return Object.is(number, -0) ? '0' : String(number);
}
