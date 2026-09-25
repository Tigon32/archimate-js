export type FixtureFinding = { rule: string; file?: string; fileIndex?: number; line?: number };
export function scanFixtureContent(content: string, blockedTerms?: readonly RegExp[]): FixtureFinding[];
export function scanFixtureTree(root?: string, blockedTerms?: readonly RegExp[]): FixtureFinding[];
export function formatFindings(findings: readonly FixtureFinding[]): string;
