import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  baseViewer: await readFile(new URL('../../lib/BaseViewer.js', import.meta.url), 'utf8'),
  importer: await readFile(new URL('../../lib/import/Importer.js', import.meta.url), 'utf8'),
  logger: await readFile(new URL('../../lib/util/Logger.js', import.meta.url), 'utf8')
};

const forbiddenPatterns = [
  [ 'BaseViewer must not log complete XML strings', files.baseViewer, /logger\.log\(xml\)/ ],
  [ 'BaseViewer must not log raw parse results', files.baseViewer, /logger\.log\(parseResult\)/ ],
  [ 'BaseViewer must not log raw model objects', files.baseViewer, /logger\.log\(model\)/ ],
  [ 'BaseViewer must not write lifecycle errors directly to console', files.baseViewer, /console\.error\(/ ],
  [ 'Importer must not log raw model and view payloads', files.importer, /logger\.log\(\{ model, viewId \}\)/ ],
  [ 'Importer must not log raw view payloads', files.importer, /logger\.log\(view\)/ ],
  [ 'Importer must not log raw view elements', files.importer, /logger\.log\(viewElement\)/ ],
  [ 'Importer must not log raw connection elements', files.importer, /logger\.log\(connectionElement\)/ ],
  [ 'Importer must not write import failures directly to console', files.importer, /console\.error\(/ ]
];

for (const [message, source, pattern] of forbiddenPatterns) {
  assert.equal(pattern.test(source), false, message);
}

assert.match(files.logger, /const DEFAULT_LOG_LEVEL = 'warn'/, 'default log level must suppress debug payloads');
assert.match(files.logger, /ARCHIMATE_JS_LOG_LEVEL/, 'debug logging must require explicit opt-in');

console.log('unsafe logging regression test passed');
