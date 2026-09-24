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

  const parser = new SaxesParser({ xmlns: true, fragment: false });
  let depth = 0;
  let nodes = 0;
  let result;
  let blocked = false;
  const stack = [];
  const unsupportedExchangeCodes = new Set();

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
    const name = tag.name.split(':').pop();
    const parent = stack[stack.length - 1];
    if (parent === 'elements' && name === 'element' && !tag.attributes.identifier) {
      unsupportedExchangeCodes.add('MEFF_ELEMENTS_UNSUPPORTED');
    }
    if (parent === 'relationships' && name === 'relationship' && !tag.attributes.identifier) {
      unsupportedExchangeCodes.add('MEFF_RELATIONSHIPS_UNSUPPORTED');
    }
    if (parent === 'model' && [
      'metadata', 'organizations', 'properties', 'propertyDefinitions'
    ].includes(name)) {
      unsupportedExchangeCodes.add('MEFF_MODEL_METADATA_UNSUPPORTED');
    }
    const inViews = stack.includes('views');
    if (inViews && name === 'view' &&
        (parent !== 'diagrams' || getXsiType(tag.attributes) !== 'Diagram')) {
      unsupportedExchangeCodes.add('MEFF_VIEWS_UNSUPPORTED');
    }
    if (inViews && ['viewpoints', 'viewpoint'].includes(name)) {
      unsupportedExchangeCodes.add('MEFF_VIEWS_UNSUPPORTED');
    }
    if (inViews && name === 'node' && getXsiType(tag.attributes) !== 'Element') {
      unsupportedExchangeCodes.add('MEFF_DIAGRAMS_UNSUPPORTED');
    }
    if (inViews && name === 'connection' && getXsiType(tag.attributes) !== 'Relationship') {
      unsupportedExchangeCodes.add('MEFF_DIAGRAMS_UNSUPPORTED');
    }
    if (inViews && [
      'label', 'documentation', 'properties', 'viewRef'
    ].includes(name)) {
      unsupportedExchangeCodes.add('MEFF_DIAGRAMS_UNSUPPORTED');
    }
    if (tag.uri && tag.uri !== 'http://www.opengroup.org/xsd/archimate/3.0/') {
      unsupportedExchangeCodes.add('MEFF_EXTENSIONS_UNSUPPORTED');
    }
    stack.push(name);
    if (nodes > IMPORT_XML_LIMITS.maxNodes) block('XML_NODE_LIMIT', 'XML node limit exceeded.');
    if (depth > IMPORT_XML_LIMITS.maxDepth) block('XML_DEPTH_LIMIT', 'XML nesting limit exceeded.');
    if (Object.keys(tag.attributes).length > IMPORT_XML_LIMITS.maxAttributes) {
      block('XML_ATTRIBUTE_LIMIT', 'XML attribute limit exceeded.');
    }
  });
  parser.on('closetag', () => {
    depth = Math.max(0, depth - 1);
    stack.pop();
  });
  parser.on('error', () => {
    if (!result) result = diagnostic('IMPORT_XML_MALFORMED', 'XML is malformed or contains unsupported syntax.');
  });

  try {
    parser.write(xml).close();
  } catch {
    if (!result) result = diagnostic('IMPORT_XML_MALFORMED', 'XML is malformed or contains unsupported syntax.');
  }

  const warnings = result ? [] : Array.from(unsupportedExchangeCodes).sort().map(exchangeWarning);
  return { diagnostics: result ? [result] : [], warnings };
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

function getXsiType(attributes) {
  const type = attributes['{http://www.w3.org/2001/XMLSchema-instance}type'] || attributes['xsi:type'];
  const value = type && typeof type === 'object' && 'value' in type ? type.value : type;
  return typeof value === 'string' ? value.split(':').pop() : undefined;
}

function diagnostic(code, message) {
  return {
    code,
    severity: 'error',
    stage: 'parse',
    message
  };
}

function exchangeWarning(code) {
  const messages = {
    MEFF_DIAGRAMS_UNSUPPORTED: 'One or more Model Exchange diagram records are not reconstructed by this importer.',
    MEFF_ELEMENTS_UNSUPPORTED: 'One or more Model Exchange element records are not reconstructed by this importer.',
    MEFF_EXTENSIONS_UNSUPPORTED: 'One or more Model Exchange extension records are not reconstructed by this importer.',
    MEFF_MODEL_METADATA_UNSUPPORTED: 'One or more Model Exchange model metadata or organization records are not reconstructed by this importer.',
    MEFF_RELATIONSHIPS_UNSUPPORTED: 'One or more Model Exchange relationship records are not fully reconstructed by this importer.',
    MEFF_VIEWS_UNSUPPORTED: 'One or more Model Exchange view records are not reconstructed by this importer.'
  };
  return { code, severity: 'warning', stage: 'parse', message: messages[code] };
}
