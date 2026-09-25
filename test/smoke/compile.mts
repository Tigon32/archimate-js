// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import path from 'node:path';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { fileURLToPath } from 'node:url';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { mkdir, copyFile } from 'node:fs/promises';
import webpack from 'webpack';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const compiler = webpack({
  mode: 'development',
  target: 'web',
  entry: path.join(repositoryRoot, 'index.js'),
  output: {
    path: path.join(repositoryRoot, '.ci-build'),
    filename: 'archimate-js.js',
    library: {
      name: 'ArchimateJS',
      type: 'umd'
    },
    clean: true
  },
  resolve: {
    extensions: [ '.ts', '.js', '.json' ]
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        type: 'asset/source'
      },
      {
        test: /\.(eot|png|svg|ttf|woff|woff2)$/i,
        type: 'asset/inline'
      }
    ]
  },
  stats: 'errors-warnings'
});

const stats = await new Promise<import('webpack').Stats>((resolve, reject) => {
  compiler.run((error, result) => {
    compiler.close((closeError) => {
      if (error || closeError || !result) {
        reject(error || closeError || new Error('Webpack did not return compilation stats.'));
        return;
      }

      resolve(result);
    });
  });
});

const info = stats.toJson({
  all: false,
  errors: true,
  warnings: true
});

if (stats.hasErrors()) {
  console.error(info.errors);
}

if (stats.hasWarnings()) {
  console.warn(info.warnings);
}

assert.equal(stats.hasErrors(), false, 'webpack compile must not have errors');

await mkdir(path.join(repositoryRoot, 'dist/browser'), { recursive: true });
await copyFile(
  path.join(repositoryRoot, '.ci-build/archimate-js.js'),
  path.join(repositoryRoot, 'dist/browser/archimate-js.js')
);

console.log('webpack compile smoke test passed');
