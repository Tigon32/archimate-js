interface Version {
  readonly major: bigint;
  readonly minor: bigint;
  readonly patch: bigint;
}

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION.test(value);
}

export function isCompatible(range: string, apiVersion: string): boolean {
  const match = /^(?:\^|~)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(range);
  if (!match || !isVersion(apiVersion)) return false;
  const requested = parse(match.slice(1));
  const current = parse(apiVersion.split('.'));
  const operator = range[0] === '^' || range[0] === '~' ? range[0] : '=';
  if (operator === '=') return compare(current, requested) === 0;
  if (compare(current, requested) < 0) return false;
  if (operator === '~') return current.major === requested.major &&
    current.minor === requested.minor;
  if (requested.major > 0n) return current.major === requested.major;
  if (requested.minor > 0n) return current.major === 0n && current.minor === requested.minor;
  return current.major === 0n && current.minor === 0n && current.patch === requested.patch;
}

export function isCompatibilityRange(value: unknown): value is string {
  return typeof value === 'string' && /^(?:\^|~)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
}

function parse(parts: readonly string[]): Version {
  return { major: BigInt(parts[0]), minor: BigInt(parts[1]), patch: BigInt(parts[2]) };
}

function compare(left: Version, right: Version): number {
  return comparePart(left.major, right.major) || comparePart(left.minor, right.minor) ||
    comparePart(left.patch, right.patch);
}

function comparePart(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
