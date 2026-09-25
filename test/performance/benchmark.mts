// SYNTHETIC: Deterministic generated models only; no imported architecture data.
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';

import { optimizeDiagram } from '../../lib/layout/optimize-diagram.mjs';
import { routeViewConnections } from '../../lib/layout/route-view-connections.mjs';
import {
  NODE_MEASUREMENT_KEYS,
  PERFORMANCE_BUDGETS,
  PERFORMANCE_CONTRACT_VERSION,
  PERFORMANCE_HARD_LIMITS,
  PERFORMANCE_TIERS,
  artifactMetadata,
  classifyPerformance,
  median,
  summarizeSamples,
  type NodeMeasurementKey,
  type PerformanceTier,
  type TimingSummary
} from './performance-contract.mts';
import {
  createSyntheticModel,
  isDiagramConnection,
  isDiagramNode,
  type SyntheticModel
} from './synthetic-model.mts';

type ValidationResult = {
  valid: boolean;
  diagnostics: Array<{ severity: string }>;
  summary?: { elements: readonly unknown[]; relationships: readonly unknown[] };
};
type Validator = (xml: string, options?: { includeSummary: boolean }) => ValidationResult;
type RouteMetrics = {
  nodeIntersections: number;
  sharedSegmentCount: number;
  crossingCount: number;
  unavoidableCrossings: Array<{ connectionId: string; at: { x: number; y: number } }>;
};
type RoutingResult = {
  connections: Array<{ waypoints: Array<{ x: number; y: number }> }>;
  metrics: RouteMetrics;
};
type LayoutResult = { metrics: Record<string, unknown> };
type Measurement = TimingSummary & ReturnType<typeof classifyPerformance>;
type NodeMeasurements = Record<NodeMeasurementKey, Measurement>;
type BenchmarkEntry = {
  tier: PerformanceTier;
  fixture: {
    provenance: 'SYNTHETIC';
    semantic: { elementCount: number; relationshipCount: number; xmlBytes: number };
    diagram: { nodeCount: number; connectionCount: number };
  };
  repeats: number;
  fixtureFingerprint: string;
  measurements: NodeMeasurements;
  metrics: {
    semantic: Record<string, unknown>;
    diagram: Record<string, unknown>;
  };
};
type BenchmarkResult = {
  schemaVersion: number;
  contractVersion: number;
  provenance: 'SYNTHETIC';
  mode: 'smoke' | 'full';
  artifact: ReturnType<typeof artifactMetadata>;
  environment: {
    node: string;
    platform: string;
    arch: string;
    cpuCount: number;
    ci: boolean;
  };
  options: { tiers: PerformanceTier[]; repeats: number };
  benchmarks: BenchmarkEntry[];
};
type Sample = {
  model: SyntheticModel;
  fixtureFingerprint: string;
  timings: Record<NodeMeasurementKey, number>;
  metrics: BenchmarkEntry['metrics'];
};

export const BENCHMARK_SCHEMA_VERSION = 2;
export { median };

const now = (): bigint => process.hrtime.bigint();
const elapsedMs = (started: bigint): number => Number(now() - started) / 1e6;

function timed<T>(operation: () => T): { value: T; durationMs: number } {
  const started = now();
  const value = operation();
  return { value, durationMs: elapsedMs(started) };
}

function fingerprint(model: SyntheticModel): string {
  const fixture = {
    semanticXml: model.semanticXml,
    xml: model.xml,
    nodes: model.view.viewElements.filter(isDiagramNode)
      .map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
    connections: model.view.viewElements.filter(isDiagramConnection)
      .map(({ id, source, target, relationshipRef }) => ({
        id,
        source: source.id,
        target: target.id,
        relationshipRef
      }))
  };
  return createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
}

export function createSyntheticFixtures(size: number) {
  const model = createSyntheticModel({ name: 'small', size });
  return {
    size,
    provenance: model.provenance,
    semantic: {
      xml: model.semanticXml,
      elementCount: model.elementCount,
      relationshipCount: model.relationshipCount
    },
    diagram: {
      view: model.view,
      nodeCount: model.nodeCount,
      connectionCount: model.connectionCount
    }
  };
}

async function loadValidator(): Promise<Validator> {
  try {
    const modulePath = '../../dist/validator/index.js';
    const validatorModule: unknown = await import(modulePath);
    if (typeof validatorModule !== 'object' || validatorModule === null ||
        !('validateArchimateXml' in validatorModule) ||
        typeof validatorModule.validateArchimateXml !== 'function') {
      throw new TypeError('Validator build does not expose validateArchimateXml');
    }
    return validatorModule.validateArchimateXml as Validator;
  } catch (error) {
    throw new Error(
      'Validator build is missing. Run "npm run compile:validator" before the benchmark.',
      { cause: error }
    );
  }
}

function semanticMetrics(validation: ValidationResult, model: SyntheticModel) {
  return {
    valid: validation.valid,
    diagnosticCount: validation.diagnostics.length,
    errorCount: validation.diagnostics.filter(({ severity }) => severity === 'error').length,
    summaryElementCount: validation.summary?.elements?.length ?? null,
    summaryRelationshipCount: validation.summary?.relationships?.length ?? null,
    generatedElementCount: model.elementCount,
    generatedRelationshipCount: model.relationshipCount
  };
}

function diagramMetrics(routed: RoutingResult, optimized: LayoutResult, model: SyntheticModel) {
  return {
    generatedNodeCount: model.nodeCount,
    generatedConnectionCount: model.connectionCount,
    routedConnectionCount: routed.connections.length,
    routedWaypointCount: routed.connections
      .reduce((total, connection) => total + connection.waypoints.length, 0),
    routeMetrics: routed.metrics,
    layoutMetrics: optimized.metrics
  };
}

function runFixture(tier: PerformanceTier, validate: Validator): Sample {
  const generation = timed(() => createSyntheticModel(tier));
  const model = generation.value;
  const validation = timed(() => validate(model.semanticXml, { includeSummary: true }));
  const diagramGeneration = timed(() => createSyntheticModel(tier));
  const nodes = diagramGeneration.value.view.viewElements.filter(isDiagramNode);
  const connections = diagramGeneration.value.view.viewElements.filter(isDiagramConnection);
  const routing = timed(() => routeViewConnections({ nodes, connections }));
  const layout = timed(() => optimizeDiagram(diagramGeneration.value.view));
  return {
    model,
    fixtureFingerprint: fingerprint(model),
    timings: {
      semanticGenerationMs: generation.durationMs,
      semanticValidationMs: validation.durationMs,
      diagramGenerationMs: diagramGeneration.durationMs,
      routingMs: routing.durationMs,
      layoutMs: layout.durationMs
    },
    metrics: {
      semantic: semanticMetrics(validation.value, model),
      diagram: diagramMetrics(routing.value, layout.value, model)
    }
  };
}

function measurements(samples: Sample[], tier: PerformanceTier): NodeMeasurements {
  return Object.fromEntries(NODE_MEASUREMENT_KEYS.map((key) => {
    const summary = summarizeSamples(samples.map(({ timings }) => timings[key]));
    const classification = classifyPerformance(summary.medianMs, summary.toleranceMs, {
      budgetMs: PERFORMANCE_BUDGETS.node[tier.name][key],
      hardLimitMs: PERFORMANCE_HARD_LIMITS.node[tier.name][key]
    });
    return [ key, { ...summary, ...classification } ];
  })) as NodeMeasurements;
}

function aggregate(samples: Sample[], tier: PerformanceTier): BenchmarkEntry {
  const first = samples[0];
  if (samples.some(({ fixtureFingerprint }) => fixtureFingerprint !== first.fixtureFingerprint)) {
    throw new Error(`Synthetic ${tier.name} fixture changed between benchmark repeats`);
  }
  return {
    tier,
    fixture: {
      provenance: 'SYNTHETIC',
      semantic: {
        elementCount: first.model.elementCount,
        relationshipCount: first.model.relationshipCount,
        xmlBytes: Buffer.byteLength(first.model.semanticXml)
      },
      diagram: {
        nodeCount: first.model.nodeCount,
        connectionCount: first.model.connectionCount
      }
    },
    repeats: samples.length,
    fixtureFingerprint: first.fixtureFingerprint,
    measurements: measurements(samples, tier),
    metrics: first.metrics
  };
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function validMeasurement(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.samplesMs) || !value.samplesMs.length) return false;
  return [ 'medianMs', 'medianAbsoluteDeviationMs', 'toleranceMs', 'budgetMs', 'hardLimitMs' ]
    .every((key) => typeof value[key] === 'number' && Number.isFinite(value[key])) &&
    [ 'within', 'exceeded' ].includes(String(value.budgetStatus)) &&
    [ 'within', 'exceeded' ].includes(String(value.hardLimitStatus));
}

function validEntry(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.tier) || !isRecord(value.fixture) ||
      !isRecord(value.measurements) || !isRecord(value.metrics)) return false;
  const tier = value.tier;
  const measurementsValue = value.measurements;
  const semantic = isRecord(value.fixture.semantic) ? value.fixture.semantic : {};
  const diagram = isRecord(value.fixture.diagram) ? value.fixture.diagram : {};
  const semanticMetricsValue = isRecord(value.metrics.semantic) ? value.metrics.semantic : {};
  const diagramMetricsValue = isRecord(value.metrics.diagram) ? value.metrics.diagram : {};
  return PERFORMANCE_TIERS.some((candidate) =>
    candidate.name === tier.name && candidate.size === tier.size) &&
    value.fixture.provenance === 'SYNTHETIC' &&
    semantic.elementCount === tier.size &&
    semantic.relationshipCount === Number(tier.size) - 1 &&
    diagram.nodeCount === tier.size &&
    diagram.connectionCount === Number(tier.size) - 1 &&
    typeof value.repeats === 'number' && value.repeats >= 1 &&
    typeof value.fixtureFingerprint === 'string' &&
    /^[a-f0-9]{64}$/.test(value.fixtureFingerprint) &&
    NODE_MEASUREMENT_KEYS.every((key) => validMeasurement(measurementsValue[key])) &&
    semanticMetricsValue.valid === true &&
    semanticMetricsValue.errorCount === 0 &&
    semanticMetricsValue.summaryElementCount === semantic.elementCount &&
    semanticMetricsValue.summaryRelationshipCount === semantic.relationshipCount &&
    diagramMetricsValue.routedConnectionCount === diagram.connectionCount;
}

export function validateBenchmarkResult(result: unknown): result is BenchmarkResult {
  if (!isRecord(result) || !isRecord(result.artifact) || !isRecord(result.environment)) return false;
  return result.schemaVersion === BENCHMARK_SCHEMA_VERSION &&
    result.contractVersion === PERFORMANCE_CONTRACT_VERSION &&
    result.provenance === 'SYNTHETIC' &&
    result.artifact.format === 'archimate-js.performance/v2' &&
    result.artifact.kind === 'node' &&
    Array.isArray(result.benchmarks) &&
    result.benchmarks.length === PERFORMANCE_TIERS.length &&
    result.benchmarks.every(validEntry);
}

export async function runBenchmark(
  { tiers = PERFORMANCE_TIERS, repeats = 5, smoke = false }:
  { tiers?: readonly PerformanceTier[]; repeats?: number; smoke?: boolean } = {}
): Promise<BenchmarkResult> {
  if (!Number.isInteger(repeats) || repeats < 1) {
    throw new TypeError('Repeats must be a positive integer');
  }
  const validate = await loadValidator();
  const benchmarks = tiers.map((tier) => aggregate(
    Array.from({ length: repeats }, () => runFixture(tier, validate)),
    tier
  ));
  const nodeMajor = process.version.replace(/^v/, '').split('.')[0];
  const result: BenchmarkResult = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    contractVersion: PERFORMANCE_CONTRACT_VERSION,
    provenance: 'SYNTHETIC',
    mode: smoke ? 'smoke' : 'full',
    artifact: artifactMetadata('node', `node-${nodeMajor}-${process.platform}-${process.arch}`),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: cpus().length,
      ci: process.env.CI === 'true'
    },
    options: { tiers: tiers.map((tier) => ({ ...tier })), repeats },
    benchmarks
  };
  if (!validateBenchmarkResult(result)) {
    throw new Error('Benchmark result failed its schema and safety checks');
  }
  return result;
}

function assertResult(result: BenchmarkResult): void {
  for (const benchmark of result.benchmarks) {
    const routeMetrics = benchmark.metrics.diagram.routeMetrics as RouteMetrics;
    if (benchmark.metrics.semantic.diagnosticCount !== 0 ||
        routeMetrics.nodeIntersections !== 0 ||
        NODE_MEASUREMENT_KEYS.some((key) =>
          benchmark.measurements[key].hardLimitStatus === 'exceeded')) {
      throw new Error(`Performance hard limit or structural assertion failed for ${benchmark.tier.name}`);
    }
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const smoke = args.has('--smoke');
  const repeatsArgument = process.argv.find((argument) => argument.startsWith('--repeats='));
  const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
  const repeats = repeatsArgument ? Number(repeatsArgument.slice(10)) : smoke ? 3 : 5;
  const result = await runBenchmark({ repeats, smoke });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (outputArgument) {
    const output = outputArgument.slice(9);
    const separator = Math.max(output.lastIndexOf('/'), output.lastIndexOf('\\'));
    if (separator > 0) await mkdir(output.slice(0, separator), { recursive: true });
    await writeFile(output, json);
  }
  process.stdout.write(json);
  if (args.has('--assert')) assertResult(result);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
