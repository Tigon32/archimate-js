import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  ConsoleLogger,
  sanitizeLogValue
} from '../../lib/util/Logger.js';

const privateXml = '<model><element name="PrivateCustomerSystem"/></model>';
const sanitizedXml = sanitizeLogValue(privateXml);

assert.equal(typeof sanitizedXml, 'string');
assert.ok(!sanitizedXml.includes('PrivateCustomerSystem'));
assert.ok(sanitizedXml.includes('redacted'));

const privateModel = {
  $type: 'archimate:Model',
  name: 'Private Architecture Model',
  elements: [
    { id: 'private-node', name: 'Private Application' }
  ]
};

const sanitizedModel = sanitizeLogValue(privateModel);

assert.equal(sanitizedModel, '[archimate:Model redacted]');
assert.ok(!sanitizedModel.includes('Private Architecture Model'));
assert.ok(!sanitizedModel.includes('Private Application'));

const captured = [];
const logger = new ConsoleLogger({
  level: 'log',
  console: {
    log: (...args) => captured.push(args),
    warn: (...args) => captured.push(args),
    error: (...args) => captured.push(args)
  }
});

logger.log('import payload', privateXml, privateModel);

const flattened = captured.flat().join(' ');

assert.ok(flattened.includes('import payload'));
assert.ok(flattened.includes('redacted'));
assert.ok(!flattened.includes('PrivateCustomerSystem'));
assert.ok(!flattened.includes('Private Architecture Model'));
assert.ok(!flattened.includes('Private Application'));

console.log('logger redaction test passed');

const baseViewerSource = await readFile(new URL('../../lib/BaseViewer.js', import.meta.url), 'utf8');
const importerSource = await readFile(new URL('../../lib/import/Importer.js', import.meta.url), 'utf8');

const unsafeBaseViewerPatterns = [
  /logger\.log\(xml\)/,
  /logger\.log\(parseResult\)/,
  /logger\.log\(model\)/,
  /logger\.log\(viewOrId\)/,
  /logger\.log\(view\)/,
  /console\.error\('error in saveXML life-cycle listener', e\)/
];

for (const pattern of unsafeBaseViewerPatterns) {
  assert.equal(pattern.test(baseViewerSource), false, 'BaseViewer must not log raw import internals');
}

const unsafeImporterPatterns = [
  /logger\.log\(\{ model, viewId \}\)/,
  /logger\.log\(viewElement\)/,
  /logger\.log\(connectionElement\)/,
  /console\.error\(e\)/,
  /console\.error\('failed to import \{element\}'/
];

for (const pattern of unsafeImporterPatterns) {
  assert.equal(pattern.test(importerSource), false, 'Importer must not bypass logger redaction');
}

const importer = await readFile(new URL('../../lib/import/Importer.js', import.meta.url), 'utf8');

assert.equal(importer.includes('elementToString'), false);
assert.equal(importer.includes('summarizeError'), false);
assert.ok(importer.includes("logger.warn('failed to import view element')"));
assert.ok(importer.includes("logger.warn('failed to import connection element')"));
