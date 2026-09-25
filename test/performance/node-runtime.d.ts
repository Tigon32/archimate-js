declare const process: {
  version: string;
  platform: string;
  arch: string;
  env: Record<string, string | undefined>;
  argv: string[];
  hrtime: { bigint(): bigint };
  stdout: { write(value: string): void };
};

declare const Buffer: {
  byteLength(value: string): number;
};

declare module 'node:os' {
  export function cpus(): readonly unknown[];
}

declare module 'node:crypto' {
  export function createHash(algorithm: string): {
    update(value: string): { digest(encoding: 'hex'): string };
  };
}

declare module 'node:fs/promises' {
  export function mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
  export function writeFile(path: string, data: string): Promise<void>;
}
