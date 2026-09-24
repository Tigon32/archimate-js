export function verifyReleaseEvidence(directory: string): Promise<{ package: { name: string; version: string } }>;
export function createReleaseEvidence(directory: string): Promise<{ package: { name: string; version: string } }>;
