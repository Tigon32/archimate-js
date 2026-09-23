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
