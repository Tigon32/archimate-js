import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE = 'origin/main';
const DEFAULT_HEAD = 'HEAD';
const FILE_LIMIT = 500;
const FUNCTION_LIMIT = 50;
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const JAVASCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx']);
const SOURCE_ROOTS = new Set(['src', 'lib', 'bin', 'test']);
const EXCLUDED_TEST_DIRS = new Set(['fixtures', 'data', 'snapshots', 'test-results']);
const FUNCTION_KINDS = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
  'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod'
]);

function normalized(pathName) {
  return pathName.replaceAll('\\', '/');
}

function isExecutableSource(pathName) {
  const filePath = normalized(pathName);
  const parts = filePath.split('/');
  const rootSource = SOURCE_ROOTS.has(parts[0]) || /^index\.(?:[cm]?[jt]s|[jt]sx)$/.test(filePath);

  if (!rootSource || !SOURCE_EXTENSIONS.has(path.extname(filePath))) return false;
  if (parts[0] === 'test' && parts.slice(1).some((part) => EXCLUDED_TEST_DIRS.has(part))) return false;
  if (/(?:^|\.)generated\./i.test(path.basename(filePath))) return false;
  if (/\.d\.(?:ts|mts|cts)$/.test(filePath)) return false;

  return true;
}

function tokenLines(tokens) {
  return tokens.filter((token) => token.type.label && token.type.label !== 'eof').map((token) => ({
    start: token.start,
    end: token.end,
    firstLine: token.loc.start.line,
    lastLine: token.loc.end.line
  }));
}

function displayFunctionName(node) {
  if (node.kind === 'constructor') return 'constructor';
  if (node.key?.name || node.key?.value) return String(node.key.name ?? node.key.value);
  return node.id?.name || 'function';
}

export function analyzeSourceText(filePath, text) {
  const sourceFile = parse(text, {
    sourceFilename: filePath,
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx'],
    tokens: true
  });
  const tokens = tokenLines(sourceFile.tokens);
  const lines = new Set(tokens.flatMap((token) => {
    const tokenLineNumbers = [];
    for (let line = token.firstLine; line <= token.lastLine; line += 1) tokenLineNumbers.push(line);
    return tokenLineNumbers;
  }));
  const functions = [];

  function visit(node) {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;

    if (FUNCTION_KINDS.has(node.type) && node.body) {
      const functionLines = new Set(tokens
        .filter((token) => token.end > node.start && token.start < node.end)
        .flatMap((token) => {
          const tokenLineNumbers = [];
          for (let line = token.firstLine; line <= token.lastLine; line += 1) tokenLineNumbers.push(line);
          return tokenLineNumbers;
        }));

      functions.push({
        name: displayFunctionName(node),
        startLine: node.loc.start.line,
        lineCount: functionLines.size
      });
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'tokens' || key.endsWith('Comments')) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  }

  visit(sourceFile.program);
  return { lineCount: lines.size, functions };
}

function readExceptions() {
  const configPath = path.join(process.cwd(), 'scripts/source-policy-exceptions.json');
  if (!existsSync(configPath)) return new Map();

  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (!Array.isArray(config.exceptions)) {
    throw new Error('scripts/source-policy-exceptions.json must define an exceptions array');
  }

  return new Map(config.exceptions.map((entry) => {
    if (!entry.path || !entry.reason || !entry.removalCondition) {
      throw new Error('Each source-policy exception requires path, reason, and removalCondition');
    }
    return [normalized(entry.path), entry];
  }));
}

function diffPaths(base, head) {
  const output = execFileSync('git', [
    'diff', '--name-status', '--find-renames', '-z', `${base}...${head}`
  ], { encoding: 'utf8' });
  const fields = output.split('\0').filter(Boolean);
  const changes = [];

  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (/^[RC]/.test(status)) {
      const oldPath = normalized(fields[index++]);
      const filePath = normalized(fields[index++]);
      changes.push({ status, oldPath, filePath });
    } else {
      changes.push({ status, filePath: normalized(fields[index++]) });
    }
  }

  return changes;
}

function validateChangedFiles(changes, exceptions) {
  const errors = [];

  for (const change of changes) {
    const filePath = change.filePath;
    if (!filePath || change.status.startsWith('D') || !isExecutableSource(filePath)) continue;

    const extension = path.extname(filePath);
    const isJavaScript = JAVASCRIPT_EXTENSIONS.has(extension);
    const exception = exceptions.get(filePath);

    if (isJavaScript && !exception) {
      errors.push(`${filePath}: changed first-party JavaScript must be migrated to TypeScript in this change`);
    }

    if (!existsSync(filePath)) {
      errors.push(`${filePath}: changed source file is missing from the checkout`);
      continue;
    }

    const { lineCount, functions } = analyzeSourceText(filePath, readFileSync(filePath, 'utf8'));
    if (lineCount > FILE_LIMIT) {
      errors.push(`${filePath}: ${lineCount} nonblank, noncomment lines exceeds the ${FILE_LIMIT}-line limit`);
    }
    for (const fn of functions) {
      if (fn.lineCount > FUNCTION_LIMIT) {
        errors.push(`${filePath}:${fn.startLine}: ${fn.name} function has ${fn.lineCount} nonblank, noncomment lines; limit is ${FUNCTION_LIMIT}`);
      }
    }
  }

  return errors;
}

export function checkSourcePolicy({ base, head }) {
  const changes = diffPaths(base, head);
  return { changes, errors: validateChangedFiles(changes, readExceptions()) };
}

function main() {
  const [argumentBase, argumentHead] = process.argv.slice(2);
  const base = process.env.SOURCE_POLICY_BASE || argumentBase || DEFAULT_BASE;
  const head = process.env.SOURCE_POLICY_HEAD || argumentHead || DEFAULT_HEAD;
  const { changes, errors } = checkSourcePolicy({ base, head });

  if (errors.length) {
    console.error('TypeScript migration and source-size policy failed:');
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Source policy passed for ${changes.length} changed path(s) (${base}...${head}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
