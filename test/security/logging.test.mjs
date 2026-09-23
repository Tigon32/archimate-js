import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseViewerSource = await readFile(new URL('../../lib/BaseViewer.js', import.meta.url), 'utf8');
const importerSource = await readFile(new URL('../../lib/import/Importer.js', import.meta.url), 'utf8');
const loggerSource = await readFile(new URL('../../lib/util/Logger.js', import.meta.url), 'utf8');

const forbiddenPayloadLogs = [
  {
    pattern: /logger\.log\(\s*xml\s*\)/,
    label: 'full import XML'
  },
  {
    pattern: /logger\.log\(\s*parseResult\s*\)/,
    label: 'full moddle parse result'
  },
  {
    pattern: /logger\.log\(\s*model\s*\)/,
    label: 'full model object'
  },
  {
    pattern: /logger\.log\(\s*viewOrId\s*\)/,
    label: 'raw view selector'
  },
  {
    pattern: /logger\.log\(\s*view\s*\)/,
    label: 'resolved view object'
  },
  {
    pattern: /logger\.log\(\s*moddle\s*\)/,
    label: 'moddle instance'
  },
  {
    pattern: /logger\.log\(\s*\{\s*model\s*,\s*viewId\s*\}\s*\)/,
    label: 'importer model and view payload'
  },
  {
    pattern: /logger\.log\(\s*viewElement\s*\)/,
    label: 'importer view element payload'
  },
  {
    pattern: /logger\.log\(\s*connectionElement\s*\)/,
    label: 'importer connection payload'
  }
];

for (const { pattern, label } of forbiddenPayloadLogs) {
  assert.doesNotMatch(baseViewerSource, pattern, `BaseViewer must not log ${label}`);
  assert.doesNotMatch(importerSource, pattern, `Importer must not log ${label}`);
}

assert.match(loggerSource, /DEFAULT_LOG_LEVEL = 'warn'/, 'logger must default to warn level');
assert.match(loggerSource, /ARCHIMATE_JS_LOG_LEVEL/, 'debug logging must require an explicit opt-in environment variable');
assert.doesNotMatch(importerSource, /console\.error/, 'importer must not dump raw import failures to console');
assert.match(importerSource, /recordImportWarning/, 'importer failures must be reported as sanitized warnings');

console.log('sensitive logging regression test passed');
