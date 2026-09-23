import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseViewerSource = await readFile(new URL('../../lib/BaseViewer.js', import.meta.url), 'utf8');
const loggerSource = await readFile(new URL('../../lib/util/Logger.js', import.meta.url), 'utf8');

const prohibitedPayloadLogs = [
  /logger\.log\(xml\)/,
  /logger\.log\(parseResult\)/,
  /logger\.log\(model\)/,
  /logger\.log\(viewOrId\)/,
  /logger\.log\(view\)/,
  /logger\.log\(moddle\)/
];

for (const pattern of prohibitedPayloadLogs) {
  assert.doesNotMatch(
    baseViewerSource,
    pattern,
    'BaseViewer must not log model payloads matching ' + pattern
  );
}

assert.match(
  loggerSource,
  /ARCHIMATE_JS_DEBUG/,
  'verbose logger output must be explicitly opt-in'
);

assert.doesNotMatch(
  loggerSource,
  /APP_ENV === 'production' \? 'warn' : 'log'/,
  'development mode must not enable verbose logging by default'
);

console.log('logging safety regression test passed');
