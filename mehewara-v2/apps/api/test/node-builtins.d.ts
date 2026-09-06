// Test-only ambient shapes for node builtins. The api tsconfig deliberately
// excludes @types/node (the Worker runtime has no node builtins), while
// vitest executes on node — so the real-SQL admin tests declare just the
// surface they use.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
}
declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
declare module "node:sqlite" {
  export interface SyncStatement {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): SyncStatement;
  }
}
