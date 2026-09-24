import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { checkPackedAssets, readPackedFiles } from '../../scripts/check-packed-assets.mts';

function gitHash(bytes: Buffer): string {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function tarEntry(name: string, bytes: Buffer, type = '0'): Buffer {
  const header = Buffer.alloc(512);
  const field = (offset: number, size: number, value: string): void => {
    header.write(value, offset, size, 'utf8');
  };
  field(0, 100, name);
  field(100, 8, '0000644\0');
  field(108, 8, '0000000\0');
  field(116, 8, '0000000\0');
  field(124, 12, bytes.length.toString(8).padStart(11, '0') + '\0');
  field(136, 12, '00000000000\0');
  header.fill(32, 148, 156);
  field(156, 1, type);
  field(257, 6, 'ustar\0');
  field(263, 2, '00');
  field(148, 8, header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0') + '\0 ');
  return Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)]);
}

function pack(entries: { name: string; content: Buffer; type?: string }[]): Buffer {
  return gzipSync(Buffer.concat([...entries.map(entry => tarEntry(entry.name, entry.content,
    entry.type)), Buffer.alloc(1024)]));
}

const content = Buffer.from('synthetic public icon');
const inventory = {
  schema: 'archimate-js.packaged-assets/v1',
  sources: { synthetic: { classification: 'SYNTHETIC' as const, origin: 'hand-authored for test',
    license: 'MIT', reviewer: 'synthetic reviewer', reviewedAt: '2026-09-24' } },
  assets: [{ path: 'assets/icon.svg', gitBlobSha1: gitHash(content), source: 'synthetic' }]
};
const base = { name: 'package/assets/icon.svg', content };
assert.deepEqual(checkPackedAssets(pack([base]), inventory), []);
assert.deepEqual(checkPackedAssets(pack([{ ...base, content: Buffer.from('changed') }]), inventory),
  ['asset-content-drift']);
assert.deepEqual(checkPackedAssets(pack([{ name: 'package/unexpected.xml', content }]), inventory),
  ['unknown-packed-asset', 'stale-inventory-entry']);
assert.deepEqual(checkPackedAssets(pack([{ name: 'package/index.js', content }]), inventory),
  ['stale-inventory-entry']);
assert.deepEqual(checkPackedAssets(pack([base, { name: 'package/dist/code.js.map', content }]), inventory),
  ['unknown-packed-asset']);
assert.throws(() => readPackedFiles(pack([base, base])), /duplicate-tar-entry/);
assert.throws(() => readPackedFiles(pack([{ name: 'package/..\/secret.xml', content }])),
  /unsafe-tar-entry/);
assert.throws(() => readPackedFiles(pack([{ ...base, type: '2' }])), /unsafe-tar-entry/);
const userSupplied = { ...inventory, sources: { synthetic: { ...inventory.sources.synthetic,
  classification: 'USER_SUPPLIED' as const } } };
assert.deepEqual(checkPackedAssets(pack([base]), userSupplied), ['unverified-release-permission']);
const arbitraryPath = 'package/assets/PRIVATE_SENTINEL.xml';
assert.throws(() => readPackedFiles(pack([{ name: arbitraryPath, content,
  type: '2' }])), (error: unknown) => {
  if (!(error instanceof Error)) return false;
  assert.ok(!error.message.includes('PRIVATE_SENTINEL'));
  return true;
});
console.log('Packed asset provenance synthetic archive tests passed.');
