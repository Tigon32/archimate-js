import { SaxesParser } from 'saxes';

export const IMPORT_XML_LIMITS = Object.freeze({
  maxBytes: 1_048_576,
  maxDepth: 64,
  maxNodes: 25_000,
  maxAttributes: 64
});

/** Inspect XML before moddle parsing and return fixed, content-free diagnostics. */
export function preflightImportXml(xml) {
  if (typeof xml !== 'string') {
    return { diagnostics: [diagnostic('IMPORT_XML_INPUT_INVALID', 'XML input must be a string.')] };
  }

  // UTF-8 bytes cannot be fewer than UTF-16 code units. Reject obviously
  // oversized input before TextEncoder allocates a second copy.
  if (xml.length > IMPORT_XML_LIMITS.maxBytes) {
    return { diagnostics: [diagnostic('XML_SIZE_LIMIT', 'XML size limit exceeded.')] };
  }

  if (new TextEncoder().encode(xml).byteLength > IMPORT_XML_LIMITS.maxBytes) {
    return { diagnostics: [diagnostic('XML_SIZE_LIMIT', 'XML size limit exceeded.')] };
  }

  const parser = new SaxesParser({ xmlns: false, fragment: false });
  let depth = 0;
  let nodes = 0;
  let result;
  let blocked = false;

  const block = (code, message) => {
    if (!result) result = diagnostic(code, message);
    blocked = true;
    throw new Error(code);
  };

  parser.on('doctype', () => block('XML_DTD_FORBIDDEN', 'DOCTYPE declarations are not accepted.'));
  parser.on('opentag', (tag) => {
    if (blocked) return;
    nodes += 1;
    depth += 1;
    if (nodes > IMPORT_XML_LIMITS.maxNodes) block('XML_NODE_LIMIT', 'XML node limit exceeded.');
    if (depth > IMPORT_XML_LIMITS.maxDepth) block('XML_DEPTH_LIMIT', 'XML nesting limit exceeded.');
    if (Object.keys(tag.attributes).length > IMPORT_XML_LIMITS.maxAttributes) {
      block('XML_ATTRIBUTE_LIMIT', 'XML attribute limit exceeded.');
    }
  });
  parser.on('closetag', () => { depth = Math.max(0, depth - 1); });
  parser.on('error', () => {
    if (!result) result = diagnostic('IMPORT_XML_MALFORMED', 'XML is malformed or contains unsupported syntax.');
  });

  try {
    parser.write(xml).close();
  } catch {
    if (!result) result = diagnostic('IMPORT_XML_MALFORMED', 'XML is malformed or contains unsupported syntax.');
  }

  return { diagnostics: result ? [result] : [] };
}

/** Map parser warnings to fixed diagnostics without returning parser text. */
export function summarizeParseWarnings(parseWarnings) {
  const found = new Set();

  (parseWarnings || []).forEach(function(warning) {
    const message = warning && typeof warning.message === 'string' ? warning.message.toLowerCase() : '';
    if (/unresolved|not found|cannot resolve/.test(message)) {
      found.add('IMPORT_REFERENCE_UNRESOLVED');
    } else if (/unknown|unsupported|unrecognized/.test(message)) {
      found.add('IMPORT_TYPE_UNSUPPORTED');
    } else {
      found.add('IMPORT_PARSE_WARNING');
    }
  });

  const messages = {
    IMPORT_PARSE_WARNING: 'The parser reported a model issue that requires review.',
    IMPORT_REFERENCE_UNRESOLVED: 'One or more model references could not be resolved.',
    IMPORT_TYPE_UNSUPPORTED: 'One or more model types are not supported by this importer.'
  };

  return Array.from(found).sort().map(function(code) {
    return { code, severity: 'warning', stage: 'parse', message: messages[code] };
  });
}

function diagnostic(code, message) {
  return {
    code,
    severity: 'error',
    stage: 'parse',
    message
  };
}
