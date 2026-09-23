/* eslint-env node */

const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: './index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'archimate-js.js',
    library: {
      type: 'module'
    }
  },
  experiments: {
    outputModule: true
  }
};
