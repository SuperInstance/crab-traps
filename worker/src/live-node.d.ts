// Live-driver ambient declarations (arena-gan-live.test.ts,
// arena-scenarios-003-live.test.ts, arena-scenarios-003-offline.*).
//
// The GAN chamber driver runs under Node (vitest) with RUN_LIVE_GAN=1 — not
// on the Workers runtime — but the repo's tsconfig pins
// @cloudflare/workers-types only. These ambient declarations cover the Node
// surfaces the drivers touch. No runtime code depends on them: the default
// test path skips the live file entirely (describe.skip, zero network), and
// tsc stays clean without pulling @types/node into the worker.
declare const process: { env: Record<string, string | undefined>; version: string };

declare module "node:fs" {
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function writeFileSync(path: string, data: string): void;
  export function readFileSync(path: string, encoding: string): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
}
