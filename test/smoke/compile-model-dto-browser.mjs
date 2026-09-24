import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const compiler = webpack({
  mode: 'development',
  target: 'web',
  entry: path.join(root, 'dist/model-dto/index.js'),
  output: {
    path: path.join(root, '.ci-build'),
    filename: 'model-dto.js',
    library: { name: 'ArchimateModelDto', type: 'umd' }
  },
  stats: 'errors-warnings'
});
const stats = await new Promise((resolve, reject) => {
  compiler.run((error, result) => {
    compiler.close((closeError) => {
      if (error || closeError) reject(error || closeError);
      else resolve(result);
    });
  });
});
if (stats.hasErrors()) console.error(stats.toJson({ all: false, errors: true, warnings: true }).errors);
assert.equal(stats.hasErrors(), false, 'DTO browser bundle must compile');
