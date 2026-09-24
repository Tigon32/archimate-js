import { cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { optimizeDiagram } from '../../lib/layout/optimize-diagram.mjs';
import { routeViewConnections } from '../../lib/layout/route-view-connections.mjs';

export const BENCHMARK_SCHEMA_VERSION = 1;
export const FULL_SIZES = Object.freeze([ 9, 25, 49 ]);
export const SMOKE_SIZES = Object.freeze([ 4, 9 ]);
export const MEASUREMENT_KEYS = Object.freeze([
  'semanticGenerationMs',
  'semanticValidationMs',
  'diagramGenerationMs',
  'routingMs',
  'layoutMs'
]);

const now = () => process.hrtime.bigint();
const elapsedMs = (start) => Number(now() - start) / 1e6;

export function median(values) {
  if (!values.length) throw new TypeError('Cannot calculate a median of no values');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fixtureFingerprint(xml, view) {
  return digest({
    xml,
    nodes: view.viewElements
      .filter((element) => element.w)
      .map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
    connections: view.viewElements
      .filter((element) => element.waypointsNode)
      .map(({ id, source, target, type, relationshipRef }) => ({
        id,
        source: source.id,
        target: target.id,
        type,
        relationshipId: relationshipRef.id,
        relationshipType: relationshipRef.type
      }))
  });
}

function timed(operation) {
  const start = now();
  const value = operation();
  return { value, durationMs: elapsedMs(start) };
}

function semanticXml(size) {
  const elements = [];
  const relationships = [];
  for (let i = 0; i < size; i += 1) {
    const functionId = `synthetic-function-${i}`;
    const serviceId = `synthetic-service-${i}`;
    elements.push(`<element id="${functionId}" xsi:type="archimate:ApplicationFunction"/>`);
    elements.push(`<element id="${serviceId}" xsi:type="archimate:ApplicationService"/>`);
    relationships.push(`<relationship id="synthetic-realization-${i}" source="${functionId}" target="${serviceId}" xsi:type="archimate:RealizationRelationship"/>`);
  }
  return `<?xml version="1.0"?><model id="synthetic-model-${size}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><elements>${elements.join('')}</elements><relationships>${relationships.join('')}</relationships></model>`;
}

function diagramFixture(size) {
  const width = Math.ceil(Math.sqrt(size));
  const nodes = Array.from({ length: size }, (_, index) => ({
    $type: 'archimate:Node',
    id: `synthetic-node-${index}`,
    x: (index % width) * 150,
    y: Math.floor(index / width) * 110,
    w: 90,
    h: 60,
    nodes: []
  }));
  const connections = [];
  for (let index = 0; index + 1 < nodes.length; index += 1) {
    connections.push({
      $type: 'archimate:Connection',
      id: `synthetic-connection-${index}`,
      source: nodes[index],
      target: nodes[index + 1],
      type: 'Realization',
      relationshipRef: { id: `synthetic-realization-${index}`, type: 'Realization' },
      waypointsNode: { waypoints: [] }
    });
  }
  return {
    id: `synthetic-view-${size}`,
    viewElements: [ ...nodes, ...connections ]
  };
}

export function createSyntheticFixtures(size) {
  if (!Number.isInteger(size) || size < 1) throw new TypeError('Fixture size must be a positive integer');
  const xml = semanticXml(size);
  const view = diagramFixture(size);
  return {
    size,
    semantic: {
      xml,
      elementCount: size * 2,
      relationshipCount: size
    },
    diagram: {
      view,
      nodeCount: size,
      connectionCount: Math.max(0, size - 1)
    },
    provenance: 'SYNTHETIC'
  };
}

function loadValidator() {
  return import('../../dist/validator/index.js').catch((error) => {
    throw new Error('Validator build is missing. Run "npm run compile:validator" before the benchmark.', { cause: error });
  });
}

function summarizeSemantic(validation, size) {
  return {
    valid: validation.valid,
    diagnosticCount: validation.diagnostics.length,
    errorCount: validation.diagnostics.filter(({ severity }) => severity === 'error').length,
    summaryElementCount: validation.summary?.elements?.length ?? null,
    summaryRelationshipCount: validation.summary?.relationships?.length ?? null,
    generatedElementCount: size * 2,
    generatedRelationshipCount: size
  };
}

function summarizeDiagram(routed, optimized, size) {
  return {
    generatedNodeCount: size,
    generatedConnectionCount: Math.max(0, size - 1),
    routedConnectionCount: routed.connections.length,
    routedWaypointCount: routed.connections.reduce((total, connection) => total + connection.waypoints.length, 0),
    routeMetrics: routed.metrics,
    layoutMetrics: optimized.metrics
  };
}

function runFixture(size, validateArchimateXml) {
  const semanticGeneration = timed(() => semanticXml(size));
  const semanticValidation = timed(() => validateArchimateXml(semanticGeneration.value, { includeSummary: true }));
  const diagramGeneration = timed(() => diagramFixture(size));
  const routing = timed(() => routeViewConnections({
    nodes: diagramGeneration.value.viewElements.filter((element) => element.w),
    connections: diagramGeneration.value.viewElements.filter((element) => element.waypointsNode)
  }));
  const layout = timed(() => optimizeDiagram(diagramGeneration.value));
  return {
    fixture: {
      size,
      provenance: 'SYNTHETIC',
      semantic: {
        elementCount: size * 2,
        relationshipCount: size,
        xmlBytes: Buffer.byteLength(semanticGeneration.value)
      },
      diagram: {
        nodeCount: size,
        connectionCount: Math.max(0, size - 1)
      }
    },
    samples: {
      semanticGenerationMs: semanticGeneration.durationMs,
      semanticValidationMs: semanticValidation.durationMs,
      diagramGenerationMs: diagramGeneration.durationMs,
      routingMs: routing.durationMs,
      layoutMs: layout.durationMs
    },
    metrics: {
      semantic: summarizeSemantic(semanticValidation.value, size),
      diagram: summarizeDiagram(routing.value, layout.value, size)
    },
    fixtureFingerprint: fixtureFingerprint(semanticGeneration.value, diagramGeneration.value)
  };
}

function aggregate(samples) {
  const first = samples[0];
  if (samples.some((sample) => sample.fixtureFingerprint !== first.fixtureFingerprint)) {
    throw new Error('Synthetic fixture changed between benchmark repeats');
  }
  return {
    fixture: first.fixture,
    repeats: samples.length,
    mediansMs: Object.fromEntries(Object.keys(first.samples).map((key) => [
      key,
      median(samples.map((sample) => sample.samples[key]))
    ])),
    metrics: first.metrics,
    fixtureFingerprint: first.fixtureFingerprint
  };
}

export function validateBenchmarkResult(result) {
  if (!result || result.schemaVersion !== BENCHMARK_SCHEMA_VERSION ||
      result.provenance !== 'SYNTHETIC' || !result.environment ||
      !Array.isArray(result.benchmarks) || result.benchmarks.length === 0) return false;
  return result.benchmarks.every((benchmark) => {
    const fixture = benchmark?.fixture;
    const semanticFixture = fixture?.semantic;
    const diagramFixture = fixture?.diagram;
    const semanticMetrics = benchmark?.metrics?.semantic;
    const diagramMetrics = benchmark?.metrics?.diagram;
    if (fixture?.provenance !== 'SYNTHETIC' ||
        !Number.isInteger(fixture.size) || fixture.size < 1 ||
        !semanticFixture || !diagramFixture || !semanticMetrics || !diagramMetrics ||
        !Number.isInteger(benchmark.repeats) || benchmark.repeats < 1 ||
        typeof benchmark.fixtureFingerprint !== 'string' ||
        !/^[a-f0-9]{64}$/.test(benchmark.fixtureFingerprint) ||
        !MEASUREMENT_KEYS.every((key) => Number.isFinite(benchmark.mediansMs?.[key]))) return false;

    return semanticFixture.elementCount === fixture.size * 2 &&
      semanticFixture.relationshipCount === fixture.size &&
      diagramFixture.nodeCount === fixture.size &&
      diagramFixture.connectionCount === Math.max(0, fixture.size - 1) &&
      semanticMetrics.valid === true &&
      semanticMetrics.errorCount === 0 &&
      semanticMetrics.summaryElementCount === semanticFixture.elementCount &&
      semanticMetrics.summaryRelationshipCount === semanticFixture.relationshipCount &&
      semanticMetrics.generatedElementCount === semanticFixture.elementCount &&
      semanticMetrics.generatedRelationshipCount === semanticFixture.relationshipCount &&
      diagramMetrics.generatedNodeCount === diagramFixture.nodeCount &&
      diagramMetrics.generatedConnectionCount === diagramFixture.connectionCount &&
      diagramMetrics.routedConnectionCount === diagramFixture.connectionCount;
  });
}

export async function runBenchmark({ sizes = FULL_SIZES, repeats = 5, smoke = false } = {}) {
  if (!Number.isInteger(repeats) || repeats < 1) throw new TypeError('Repeats must be a positive integer');
  const { validateArchimateXml } = await loadValidator();
  const benchmarks = [];
  for (const size of sizes) {
    const samples = Array.from({ length: repeats }, () => runFixture(size, validateArchimateXml));
    benchmarks.push(aggregate(samples));
  }
  const result = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    provenance: 'SYNTHETIC',
    mode: smoke ? 'smoke' : 'full',
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: cpus().length,
      ci: process.env.CI === 'true'
    },
    options: { sizes: [...sizes], repeats },
    benchmarks
  };
  if (!validateBenchmarkResult(result)) throw new Error('Benchmark result failed its schema and safety checks');
  return result;
}

function assertResult(result) {
  if (!validateBenchmarkResult(result)) throw new Error('Benchmark assertion failed: invalid result');
  for (const benchmark of result.benchmarks) {
    if (benchmark.metrics.semantic.diagnosticCount !== 0 ||
        benchmark.metrics.diagram.routedConnectionCount !== benchmark.fixture.diagram.connectionCount ||
        benchmark.metrics.diagram.routeMetrics.nodeIntersections !== 0) {
      throw new Error(`Benchmark assertion failed for synthetic size ${benchmark.fixture.size}`);
    }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const smoke = args.has('--smoke');
  const assert = args.has('--assert');
  const repeatsArgument = process.argv.find((argument) => argument.startsWith('--repeats='));
  const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
  const repeats = repeatsArgument ? Number(repeatsArgument.slice('--repeats='.length)) : smoke ? 2 : 5;
  const result = await runBenchmark({ sizes: smoke ? SMOKE_SIZES : FULL_SIZES, repeats, smoke });
  if (assert) assertResult(result);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (outputArgument) await writeFile(outputArgument.slice('--output='.length), json);
  process.stdout.write(json);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
