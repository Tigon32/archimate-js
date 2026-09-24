export const APPROVED_LICENSES: readonly string[];
export function checkDependencyChanges(
  base: { packages: Record<string, Record<string, unknown>> },
  head: { packages: Record<string, Record<string, unknown>> },
  policy: { schemaVersion: number; exceptions: unknown[] },
  today?: string
): string[];
