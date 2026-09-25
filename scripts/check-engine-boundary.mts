import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

const SCOPED_ROOTS = [
  'src/model-dto', 'src/language', 'src/validator', 'src/layout',
  'src/lint', 'src/export', 'src/cli', 'src/coordination', 'src/verification'
];
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const FORBIDDEN_SERVICES = new Set([
  'elementRegistry', 'commandStack', 'canvas', 'eventBus',
  'elementFactory', 'modeling', 'selection', 'graphicsFactory'
]);

const ALLOWED_EXCEPTIONS = [
  {
    path: 'src/model-dto/diagram-js-canvas-port.ts',
    reason: 'Current diagram-js CanvasPort adapter location until EE-M3 relocates it.'
  },
  {
    path: 'src/model-dto/modeler-session.ts',
    reason: 'Current DTO modeler session adapter location until EE-M3 relocates it.'
  },
  {
    path: 'src/diagram-js-adapter/**',
    reason: 'Planned EE-M3 diagram-js adapter home; engine-specific dependencies belong there.'
  }
] as const;

const RULE_IMPORT = 'engine-boundary/import';
const RULE_SERVICE = 'engine-boundary/service-lookup';

type AstNode = {
  type?: string;
  source?: { value?: unknown };
  callee?: AstNode;
  property?: AstNode;
  arguments?: AstNode[];
  value?: unknown;
  name?: string;
  [key: string]: unknown;
};

export type EngineBoundaryFinding = {
  filePath: string;
  rule: typeof RULE_IMPORT | typeof RULE_SERVICE;
  subject: string;
};

export type EngineBoundarySource = {
  filePath: string;
  text: string;
};

function normalized(pathName: string) {
  return pathName.replaceAll('\\', '/');
}

function isException(filePath: string) {
  return ALLOWED_EXCEPTIONS.some((entry) => {
    if (entry.path.endsWith('/**')) return filePath.startsWith(entry.path.slice(0, -2));
    return filePath === entry.path;
  });
}

function isSourceFile(filePath: string) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath)) && !/\.d\.(?:ts|mts|cts)$/.test(filePath);
}

function isForbiddenSpecifier(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('diagram-js');
}

function stringLiteralValue(node: AstNode | undefined) {
  return node?.type === 'StringLiteral' && typeof node.value === 'string' ? node.value : undefined;
}

function isRequireCall(node: AstNode) {
  return node.callee?.type === 'Identifier' && node.callee.name === 'require';
}

function dynamicImportSpecifier(node: AstNode) {
  if (node.callee?.type !== 'Import') return undefined;
  return stringLiteralValue(node.arguments?.[0]);
}

function requireSpecifier(node: AstNode) {
  if (!isRequireCall(node)) return undefined;
  return stringLiteralValue(node.arguments?.[0]);
}

function serviceLookupName(node: AstNode) {
  if (node.callee?.type !== 'MemberExpression') return undefined;
  if (node.callee.property?.type !== 'Identifier' || node.callee.property.name !== 'get') return undefined;
  const serviceName = stringLiteralValue(node.arguments?.[0]);
  return serviceName && FORBIDDEN_SERVICES.has(serviceName) ? serviceName : undefined;
}

function pushSpecifierFinding(findings: EngineBoundaryFinding[], filePath: string, specifier: unknown) {
  if (isForbiddenSpecifier(specifier)) {
    findings.push({ filePath, rule: RULE_IMPORT, subject: specifier });
  }
}

function scanNode(node: AstNode, filePath: string, findings: EngineBoundaryFinding[]) {
  if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
    pushSpecifierFinding(findings, filePath, node.source?.value);
  }
  if (node.type === 'CallExpression') {
    pushSpecifierFinding(findings, filePath, dynamicImportSpecifier(node));
    pushSpecifierFinding(findings, filePath, requireSpecifier(node));
    const serviceName = serviceLookupName(node);
    if (serviceName) findings.push({ filePath, rule: RULE_SERVICE, subject: serviceName });
  }
}

function visit(node: unknown, filePath: string, findings: EngineBoundaryFinding[]) {
  if (!node || typeof node !== 'object' || typeof (node as AstNode).type !== 'string') return;
  const astNode = node as AstNode;
  scanNode(astNode, filePath, findings);

  for (const [key, value] of Object.entries(astNode)) {
    if (key === 'loc' || key === 'tokens' || key.endsWith('Comments')) continue;
    if (Array.isArray(value)) value.forEach((entry) => visit(entry, filePath, findings));
    else visit(value, filePath, findings);
  }
}

function scanText({ filePath, text }: EngineBoundarySource) {
  if (isException(filePath)) return [];
  const sourceFile = parse(text, {
    sourceFilename: filePath,
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx']
  });
  const findings: EngineBoundaryFinding[] = [];
  visit(sourceFile.program, filePath, findings);
  return findings;
}

function sortFindings(findings: EngineBoundaryFinding[]) {
  return findings.sort((left, right) => left.filePath.localeCompare(right.filePath)
    || left.rule.localeCompare(right.rule)
    || left.subject.localeCompare(right.subject));
}

export function scanEngineBoundarySources(sources: EngineBoundarySource[]) {
  return sortFindings(sources.flatMap(scanText));
}

function collectSources(root: string, relativeDir: string, sources: EngineBoundarySource[]) {
  const absoluteDir = path.join(root, relativeDir);
  if (!existsSync(absoluteDir)) return;

  for (const entry of readdirSync(absoluteDir)) {
    const relativePath = normalized(path.join(relativeDir, entry));
    const absolutePath = path.join(root, relativePath);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) collectSources(root, relativePath, sources);
    else if (stats.isFile() && isSourceFile(relativePath)) {
      sources.push({ filePath: relativePath, text: readFileSync(absolutePath, 'utf8') });
    }
  }
}

export function checkEngineBoundary(root = process.cwd()) {
  const sources: EngineBoundarySource[] = [];
  SCOPED_ROOTS.forEach((sourceRoot) => collectSources(root, sourceRoot, sources));
  return scanEngineBoundarySources(sources);
}

export function formatEngineBoundaryFindings(findings: EngineBoundaryFinding[]) {
  return findings.map((finding) => `${finding.filePath}: ${finding.rule}: ${finding.subject}`);
}

function main() {
  const findings = checkEngineBoundary();
  if (findings.length) {
    console.error('Engine boundary policy failed:');
    formatEngineBoundaryFindings(findings).forEach((finding) => console.error(`- ${finding}`));
    process.exitCode = 1;
    return;
  }

  console.log('Engine boundary policy passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
