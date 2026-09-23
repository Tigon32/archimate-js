/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import packageJson from '../../package.json';
import Viewer from '../../index.js';
import { ARCHIMATE_LANGUAGE_VERSION, validateArchimateXml } from 'archimate-js/validator';

describe('package contract', () => {
  it('publishes the public entry point and library sources', () => {
    expect(packageJson.name).toBe('archimate-js');
    expect(packageJson.license).toBe('MIT');
    expect(packageJson.files).toContain('index.js');
    expect(packageJson.files).toContain('lib');
  });

  it('declares the core browser-modeling dependencies', () => {
    expect(packageJson.dependencies).toHaveProperty('diagram-js');
    expect(packageJson.dependencies).toHaveProperty('moddle-xml');
  });

  it('exports the supported Viewer from the package entry point', () => {
    expect(typeof Viewer).toBe('function');
  });

  it('exposes the compiled validator through its stable package subpath', () => {
    expect(packageJson.archimateLanguageVersion).toBe('3.2');
    expect(ARCHIMATE_LANGUAGE_VERSION).toBe('3.2');
    expect(typeof validateArchimateXml).toBe('function');
  });
});
