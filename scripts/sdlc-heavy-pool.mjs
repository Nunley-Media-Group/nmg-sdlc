#!/usr/bin/env node

/** The host-wide heavy-job pool from the command line: `list` prints the slot holders, and `run -- <command>`
 * holds a slot while a worker-run command that steering marks as heavy runs. */
import { spawn } from 'node:child_process';
import { acquireHeavySlot, heavyPoolHolders, heavyPoolSize } from '../src/heavy-pool.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';

const USAGE = 'Usage: node scripts/sdlc-heavy-pool.mjs list | run [--label TEXT] -- <program> [args...]';

export function parseHeavyPoolCli(argv) {
  const [sub, ...rest] = argv;
  if (sub === 'list' && rest.length === 0) return { action: 'list' };
  if (sub !== 'run') throw new Error(USAGE);
  let label = null;
  let index = 0;
  if (rest[index] === '--label' && rest[index + 1] !== undefined) { label = rest[index + 1]; index += 2; }
  if (rest[index] !== '--' || rest.length <= index + 1) throw new Error(USAGE);
  const [program, ...args] = rest.slice(index + 1);
  return { action: 'run', label: label ?? [program, ...args].join(' ').slice(0, 200), program, args };
}

/** What `list` prints: `{ slots, holders: [{ slot, pid, label, projectRoot, startedAt, alive }] }`. */
export function heavyPoolList(options = {}) {
  return { slots: heavyPoolSize(options.env), holders: heavyPoolHolders(options) };
}

/** Runs one command while holding a heavy-job slot. Resolves to its exit status; the wait is written to stderr. */
export async function runHeavy({ label, program, args, cwd = process.cwd(), env = process.env, stderr = process.stderr,
  spawnCommand = spawn, signal, ...pool } = {}) {
  const held = await acquireHeavySlot({ label, projectRoot: cwd, env, signal, ...pool });
  stderr.write(`NMG_SDLC_HEAVY_SLOT: ${JSON.stringify({ slot: held.slot, slots: held.slots, waitedMs: held.waitedMs, label })}\n`);
  try {
    return await new Promise((resolve) => {
      let child;
      try { child = spawnCommand(program, args, { cwd, env, shell: false, stdio: 'inherit' }); } catch { return resolve(127); }
      child.once('error', () => resolve(127));
      child.once('close', (code, childSignal) => resolve(typeof code === 'number' ? code : childSignal ? 1 : 0));
    });
  } finally {
    held.release();
  }
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseHeavyPoolCli(argv); } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.action === 'list') {
    process.stdout.write(`${JSON.stringify(heavyPoolList(), null, 2)}\n`);
    return;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    process.exitCode = await runHeavy({ ...options, signal: controller.signal });
  } catch (error) {
    process.stderr.write(`${error.reasonCode ?? error.message}\n`);
    process.exitCode = controller.signal.aborted ? 130 : 1;
  }
}

if (isCliEntry(import.meta.url)) main();
