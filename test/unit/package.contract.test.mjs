import { describe, expect, it } from 'vitest';

import packageJson from '../../package.json';

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
});
