import { expect, it } from 'vitest';
import { createExtensionRegistry } from '../../src/extensions/index.mjs';
import type { ArchimateExtension } from '../../src/extensions/index.mjs';
import { createLintEngine } from '../../src/lint/index.mjs';

// SYNTHETIC: test-only manifests and DTOs authored to exercise the public contract.
function extension(overrides: Partial<ArchimateExtension> = {}): ArchimateExtension {
  return {
    manifestVersion: 1,
    id: 'synthetic.extension',
    version: '1.0.0',
    compatibleApi: '^0.1.0',
    ...overrides
  };
}

const codes = (result: ReturnType<ReturnType<typeof createExtensionRegistry>['register']>) =>
  result.diagnostics.map(({ code }) => code);

it('registers typed metadata and lint contributions without coupling the lint package', () => {
    const registry = createExtensionRegistry();
    const rule = { id: 'synthetic.extension/example', evaluate: () => [] };
    const result = registry.register(extension({
      contributions: {
        propertySchemas: [{ id: 'synthetic.extension.reviewed', type: 'string', name: 'Reviewed' }],
        lintRules: [rule]
      }
    }));
    expect(result).toEqual({ registered: true, diagnostics: [] });
    expect(registry.propertySchemas).toEqual([
      { id: 'synthetic.extension.reviewed', type: 'string', name: 'Reviewed' }
    ]);
    expect(registry.lintRules).toEqual([rule]);
    expect(createLintEngine(registry.lintRules).ruleIds).toEqual(['synthetic.extension/example']);
});

it('returns content-safe malformed and incompatible diagnostics without partial registration', () => {
    const registry = createExtensionRegistry();
    const malformed = registry.register({ id: 'synthetic.secret-input', version: 'bad',
      compatibleApi: '^0.1.0', manifestVersion: 1 });
    expect(codes(malformed)).toEqual(['EXTENSION_MANIFEST_INVALID']);
    expect(JSON.stringify(malformed)).not.toContain('synthetic.secret-input');
    expect(JSON.stringify(malformed)).not.toContain('bad');
    expect(codes(registry.register(extension({ id: 'synthetic.invalid-range',
      compatibleApi: '>=0.1.0' }))))
      .toEqual(['EXTENSION_MANIFEST_INVALID']);
    const incompatible = registry.register(extension({ id: 'synthetic.incompatible',
      compatibleApi: '^0.2.0' }));
    expect(codes(incompatible)).toEqual(['EXTENSION_API_INCOMPATIBLE']);
    expect(registry.extensionIds).toEqual([]);
});

it('accepts exact, caret, and tilde API ranges that include the host version', () => {
  for (const [id, compatibleApi] of [
    ['exact', '0.1.0'], ['caret', '^0.1.0'], ['tilde', '~0.1.0']
  ]) {
    const registry = createExtensionRegistry();
    expect(registry.register(extension({ id: `synthetic.range-${id}`, compatibleApi })).registered)
      .toBe(true);
  }
});

it('exposes extension identities and contributions in stable sorted order', () => {
  const registry = createExtensionRegistry();
  const alpha = registry.register(extension({ id: 'synthetic.alpha', contributions: {
    propertySchemas: [{ id: 'synthetic.z-schema', type: 'string' },
      { id: 'synthetic.a-schema', type: 'string' }],
    lintRules: [{ id: 'synthetic.z-rule', evaluate: () => [] },
      { id: 'synthetic.a-rule', evaluate: () => [] }]
  } }));
  const beta = registry.register(extension({ id: 'synthetic.beta' }));
  expect(alpha.registered).toBe(true);
  expect(beta.registered).toBe(true);
  expect(registry.extensionIds).toEqual(['synthetic.alpha', 'synthetic.beta']);
  expect(registry.propertySchemas.map(({ id }) => id))
    .toEqual(['synthetic.a-schema', 'synthetic.z-schema']);
  expect(registry.lintRules.map(({ id }) => id))
    .toEqual(['synthetic.a-rule', 'synthetic.z-rule']);
});

it('rejects duplicate extension and contribution IDs atomically', () => {
    const registry = createExtensionRegistry();
    expect(registry.register(extension({ id: 'synthetic.first',
      contributions: { propertySchemas: [{ id: 'synthetic.shared', type: 'string' }] }
    })).registered).toBe(true);
    expect(codes(registry.register(extension({ id: 'synthetic.first' })))
    ).toEqual(['EXTENSION_ID_DUPLICATE']);
    const rejected = registry.register(extension({ id: 'synthetic.second', contributions: {
      propertySchemas: [
        { id: 'synthetic.shared', type: 'integer' },
        { id: 'synthetic.new', type: 'boolean' }
      ]
    } }));
    expect(codes(rejected)).toEqual(['EXTENSION_CONTRIBUTION_ID_DUPLICATE']);
    expect(registry.extensionIds).toEqual(['synthetic.first']);
    expect(registry.propertySchemas.map(({ id }) => id)).toEqual(['synthetic.shared']);
});

it('rejects cross-kind contribution conflicts and duplicate IDs inside one manifest', () => {
    const registry = createExtensionRegistry();
    const conflict = registry.register(extension({ contributions: {
      propertySchemas: [{ id: 'synthetic.same', type: 'string' }],
      lintRules: [{ id: 'synthetic.same', evaluate: () => [] }]
    } }));
    expect(codes(conflict)).toEqual(['EXTENSION_CONTRIBUTION_CONFLICT']);
    expect(registry.extensionIds).toEqual([]);
    const duplicate = registry.register(extension({ contributions: {
      lintRules: [
        { id: 'synthetic.extension/repeated', evaluate: () => [] },
        { id: 'synthetic.extension/repeated', evaluate: () => [] }
      ]
    } }));
    expect(codes(duplicate)).toEqual(['EXTENSION_CONTRIBUTION_ID_DUPLICATE']);
    expect(registry.lintRules).toEqual([]);
});

it('orders initialization by ID and disposes in reverse order, continuing after errors', async () => {
    const registry = createExtensionRegistry();
    const calls: string[] = [];
    for (const id of ['synthetic.zeta', 'synthetic.alpha', 'synthetic.mu']) {
      registry.register(extension({ id, initialize: () => {
        calls.push(`init:${id}`);
        return () => {
          calls.push(`dispose:${id}`);
          if (id !== 'synthetic.alpha') throw new Error(`synthetic-${id}`);
        };
      } }));
    }
    await registry.initialize();
    expect(calls).toEqual([
      'init:synthetic.alpha', 'init:synthetic.mu', 'init:synthetic.zeta'
    ]);
    await expect(registry.dispose()).rejects.toMatchObject({
      name: 'ExtensionLifecycleError',
      code: 'EXTENSION_DISPOSAL_FAILED',
      errors: [expect.any(Error), expect.any(Error)]
    });
    expect(calls.slice(3)).toEqual([
      'dispose:synthetic.zeta', 'dispose:synthetic.mu', 'dispose:synthetic.alpha'
    ]);
    await registry.dispose();
    expect(calls).toHaveLength(6);
});

it('rolls back initialized extensions in reverse order and surfaces initialization and cleanup failures', async () => {
    const registry = createExtensionRegistry();
    const calls: string[] = [];
    registry.register(extension({ id: 'synthetic.alpha', initialize: () => {
      calls.push('init:alpha');
      return () => { calls.push('dispose:alpha'); throw new Error('synthetic-cleanup'); };
    } }));
    registry.register(extension({ id: 'synthetic.beta', initialize: () => {
      calls.push('init:beta');
      throw new Error('synthetic-initialization');
    } }));
    await expect(registry.initialize()).rejects.toMatchObject({
      name: 'ExtensionLifecycleError',
      code: 'EXTENSION_INITIALIZATION_FAILED',
      extensionId: 'synthetic.beta',
      errors: [expect.any(Error), expect.any(Error)]
    });
    expect(calls).toEqual(['init:alpha', 'init:beta', 'dispose:alpha']);
    expect(registry.extensionIds).toEqual(['synthetic.alpha', 'synthetic.beta']);
    await expect(registry.dispose()).resolves.toBeUndefined();
});

it('requires explicit registration before initialization and rejects later mutation', async () => {
    const registry = createExtensionRegistry();
    await registry.initialize();
    expect(() => registry.register(extension())).toThrow(/before initialization/);
    await expect(registry.initialize()).rejects.toThrow(/initialized once/);
    await registry.dispose();
});
