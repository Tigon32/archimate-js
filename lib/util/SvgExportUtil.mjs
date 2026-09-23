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

  nodes.forEach((node) => {
    const id = node.getAttribute && node.getAttribute('id');
    if (id && !idMap.has(id)) {
      idMap.set(id, 'archimate-export-id-' + idMap.size);
    }
  });

  nodes.forEach((node) => {
    if (!node.attributes || !node.setAttribute) {
      return;
    }

    Array.from(node.attributes).forEach(({ name, value }) => {
      if (name === 'id') {
        node.setAttribute(name, idMap.get(value));
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
        node.setAttribute(name, value.split(/\s+/).map((id) => idMap.get(id) || id).join(' '));
        return;
      }

      if (/url\(/i.test(value)) {
        node.setAttribute(name, value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/gi,
          (match, quote, id) => idMap.has(id) ? 'url(' + quote + '#' + idMap.get(id) + quote + ')' : match));
      }
    });
  });

  return roots;
}

/**
 * Serialize a rendered diagram as a small, deterministic SVG wrapper.
 */
export function createSvg({ bbox, contents, defs = '', title = 'ArchiMate diagram', description }) {
  const safeTitle = escapeXml(title);
  const safeDescription = description ? escapeXml(description) : '';
  const accessibility = safeDescription
    ? '<title id="archimate-svg-title">' + safeTitle + '</title>' +
      '<desc id="archimate-svg-description">' + safeDescription + '</desc>'
    : '<title id="archimate-svg-title">' + safeTitle + '</title>';
  const labelledBy = safeDescription
    ? 'archimate-svg-title archimate-svg-description'
    : 'archimate-svg-title';

  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'role="img" aria-labelledby="' + labelledBy + '" ' +
      'width="' + formatNumber(bbox.width) + '" height="' + formatNumber(bbox.height) + '" ' +
      'viewBox="' + [ bbox.x, bbox.y, bbox.width, bbox.height ].map(formatNumber).join(' ') + '">' +
      accessibility + defs + contents + '</svg>';
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
