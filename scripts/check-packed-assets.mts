import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

type Asset = { path: string; gitBlobSha1: string; source: string };
type Source = { classification: 'PUBLIC' | 'SYNTHETIC' | 'USER_SUPPLIED'; origin: string; license: string;
  reviewer: string; reviewedAt: string; generator?: string };
type Inventory = { schema: string; sources: Record<string, Source>; assets: Asset[] };

const BLOCK = 512;
const CODE = /\.[cm]?[jt]sx?$/i;
const HASH = /^[0-9a-f]{40}$/;
const MAX_ARCHIVE = 64 * 1024 * 1024;
const SAFE_ERRORS = new Set(['invalid-arguments', 'invalid-inventory', 'invalid-tar-header',
  'invalid-tar-size', 'invalid-tar-trailer', 'invalid-pax-header', 'duplicate-pax-path',
  'unsafe-pax-header', 'unsafe-tar-entry', 'duplicate-tar-entry']);

function validPath(path: string): boolean {
  return path.startsWith('package/') && path.length > 'package/'.length &&
    /^[\x20-\x7e]+$/.test(path) && !/[\\:]/.test(path) && !path.endsWith('/') &&
    path.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

function field(header: Buffer, start: number, length: number): string {
  return header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
}

function octal(header: Buffer, start: number, length: number): number {
  const value = field(header, start, length).trim();
  if (!/^[0-7]+$/.test(value)) throw new Error('invalid-tar-header');
  return Number.parseInt(value, 8);
}

function checkedHeader(header: Buffer): { path: string; size: number; type: string } {
  const expected = octal(header, 148, 8);
  let actual = 0;
  for (let i = 0; i < BLOCK; i++) actual += i >= 148 && i < 156 ? 32 : header[i];
  if (actual !== expected) throw new Error('invalid-tar-header');
  const name = field(header, 0, 100);
  const prefix = field(header, 345, 155);
  return { path: prefix ? `${prefix}/${name}` : name, size: octal(header, 124, 12),
    type: field(header, 156, 1) || '0' };
}

function paxPath(content: Buffer): string | undefined {
  let offset = 0;
  let path: string | undefined;
  while (offset < content.length) {
    const space = content.indexOf(32, offset);
    if (space < 0) throw new Error('invalid-pax-header');
    const length = Number(content.toString('ascii', offset, space));
    if (!Number.isSafeInteger(length) || length <= space - offset + 2 ||
        offset + length > content.length || content[offset + length - 1] !== 10) {
      throw new Error('invalid-pax-header');
    }
    const record = content.toString('utf8', space + 1, offset + length - 1);
    const equals = record.indexOf('=');
    if (equals < 1) throw new Error('invalid-pax-header');
    const key = record.slice(0, equals);
    if (key === 'path') {
      if (path !== undefined) throw new Error('duplicate-pax-path');
      path = record.slice(equals + 1);
    }
    if (key === 'linkpath' || key === 'size') throw new Error('unsafe-pax-header');
    offset += length;
  }
  return path;
}

export function readPackedFiles(compressed: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(compressed, { maxOutputLength: MAX_ARCHIVE });
  const files = new Map<string, Buffer>();
  let pendingPath: string | undefined;
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every(byte => byte === 0)) break;
    const entry = checkedHeader(header);
    const start = offset + BLOCK;
    const end = start + entry.size;
    if (!Number.isSafeInteger(end) || end > tar.length) throw new Error('invalid-tar-size');
    const content = tar.subarray(start, end);
    offset = start + Math.ceil(entry.size / BLOCK) * BLOCK;
    if (offset > tar.length) throw new Error('invalid-tar-size');
    if (entry.type === 'x') {
      if (pendingPath !== undefined) throw new Error('duplicate-pax-path');
      pendingPath = paxPath(content);
      continue;
    }
    if (entry.type === 'L') {
      if (pendingPath !== undefined) throw new Error('duplicate-pax-path');
      pendingPath = content.toString('utf8').replace(/\0.*$/s, '');
      continue;
    }
    const path = pendingPath ?? entry.path;
    pendingPath = undefined;
    if (entry.type !== '0' || !validPath(path)) throw new Error('unsafe-tar-entry');
    const name = path.slice('package/'.length);
    if (files.has(name)) throw new Error('duplicate-tar-entry');
    files.set(name, content);
  }
  if (pendingPath !== undefined || files.size === 0) throw new Error('invalid-tar-trailer');
  if (tar.subarray(offset).some(byte => byte !== 0)) throw new Error('invalid-tar-trailer');
  return files;
}

function gitBlobSha1(content: Buffer): string {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

function checkInventory(inventory: Inventory): Map<string, Asset> {
  if (inventory.schema !== 'archimate-js.packaged-assets/v1' ||
      !Array.isArray(inventory.assets) || !inventory.sources ||
      typeof inventory.sources !== 'object') throw new Error('invalid-inventory');
  const expected = new Map<string, Asset>();
  for (const asset of inventory.assets) {
    if (typeof asset.path !== 'string' || !validPath(`package/${asset.path}`) ||
        CODE.test(asset.path) || !HASH.test(asset.gitBlobSha1) ||
        typeof asset.source !== 'string' || expected.has(asset.path)) {
      throw new Error('invalid-inventory');
    }
    const source = Object.hasOwn(inventory.sources, asset.source) ?
      inventory.sources[asset.source] : undefined;
    if (!source || !['PUBLIC', 'SYNTHETIC', 'USER_SUPPLIED'].includes(source.classification) ||
        typeof source.origin !== 'string' || !source.origin ||
        typeof source.license !== 'string' || !source.license ||
        typeof source.reviewer !== 'string' || !source.reviewer ||
        !/^\d{4}-\d{2}-\d{2}$/.test(source.reviewedAt)) throw new Error('invalid-inventory');
    expected.set(asset.path, asset);
  }
  return expected;
}

export function checkPackedAssets(compressed: Buffer, inventory: Inventory): string[] {
  const expected = checkInventory(inventory);
  const files = readPackedFiles(compressed);
  const findings: string[] = [];
  for (const [name, content] of files) {
    if (CODE.test(name)) continue;
    const asset = expected.get(name);
    if (!asset) findings.push('unknown-packed-asset');
    else if (gitBlobSha1(content) !== asset.gitBlobSha1) findings.push('asset-content-drift');
    if (asset && inventory.sources[asset.source].classification === 'USER_SUPPLIED') {
      findings.push('unverified-release-permission');
    }
    expected.delete(name);
  }
  for (const _ of expected) findings.push('stale-inventory-entry');
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    if (process.argv.length !== 3) throw new Error('invalid-arguments');
    const inventory = JSON.parse(readFileSync(new URL('../docs/security/packed-assets.json', import.meta.url),
      'utf8')) as Inventory;
    const findings = checkPackedAssets(readFileSync(process.argv[2]), inventory);
    if (findings.length) {
      const counts = new Map<string, number>();
      for (const finding of findings) counts.set(finding, (counts.get(finding) ?? 0) + 1);
      for (const [rule, count] of [...counts].sort()) process.stderr.write(`${rule}: ${count}\n`);
      process.exitCode = 1;
    } else process.stdout.write('Packed asset provenance passed.\n');
  } catch (error) {
    process.stderr.write(`Packed asset provenance failed: ${error instanceof Error ?
      (SAFE_ERRORS.has(error.message) ? error.message : 'read-failed') : 'read-failed'}\n`);
    process.exitCode = 1;
  }
}
