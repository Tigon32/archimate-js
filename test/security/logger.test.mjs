import assert from 'node:assert/strict';

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
