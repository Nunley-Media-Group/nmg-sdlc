// The host-wide heavy-job pool: a machine-level set of slots shared by every project and session on this machine.
// A job that steering marks as heavy holds one slot while it runs; a slot whose holder process is dead is reclaimed.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_SLOTS = 1;
const POLL_MS = 500;
// A lock file that stays unreadable this long was left by a writer that died before recording itself.
const UNREADABLE_LOCK_MS = 10_000;
export const HOST_STATE_ENV = "NMG_SDLC_HOST_STATE_DIR";

/** The machine-level nmg-sdlc state directory: `NMG_SDLC_HOST_STATE_DIR`, or `~/.nmg-sdlc`. */
export function hostStateDir(env = process.env) {
  const override = env?.[HOST_STATE_ENV];
  return typeof override === "string" && override.trim() ? override : join(homedir(), ".nmg-sdlc");
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

/** The number of slots: `heavyJobSlots` in `<host state>/config.json` when it is a positive safe integer, else 1. */
export function heavyPoolSize(env = process.env) {
  const slots = readJson(join(hostStateDir(env), "config.json"))?.heavyJobSlots;
  return Number.isSafeInteger(slots) && slots >= 1 ? slots : DEFAULT_SLOTS;
}

function poolDir(env) { return join(hostStateDir(env), "heavy-jobs"); }
function slotPath(env, slot) { return join(poolDir(env), `slot-${slot}.lock`); }

function defaultAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

function validHolder(record) {
  return record?.schemaVersion === 1 && Number.isSafeInteger(record.pid) && record.pid > 0
    && typeof record.label === "string" && Number.isSafeInteger(record.startedAt);
}

/**
 * The slot holders on record, lowest slot first, as `{ slot, pid, label, projectRoot, startedAt, alive }` (plus
 * `issue` when the holder recorded one). A holder whose process is gone is listed with `alive: false` until its
 * slot is reclaimed; an unreadable lock file is not listed.
 */
export function heavyPoolHolders({ env = process.env, alive = defaultAlive } = {}) {
  let names = [];
  try { names = readdirSync(poolDir(env)); } catch { return []; }
  return names.map((name) => Number(/^slot-([1-9]\d*)\.lock$/.exec(name)?.[1]))
    .filter(Number.isSafeInteger).sort((left, right) => left - right)
    .map((slot) => ({ slot, record: readJson(slotPath(env, slot)) }))
    .filter(({ record }) => validHolder(record))
    .map(({ slot, record }) => ({ slot, pid: record.pid, label: record.label, projectRoot: record.projectRoot ?? null,
      startedAt: record.startedAt, alive: alive(record.pid), ...(Number.isSafeInteger(record.issue) ? { issue: record.issue } : {}) }));
}

// How long a reclaim guard may stand before it is treated as left by a crashed process.
const RECLAIM_GUARD_STALE_MS = 10_000;

/** Whether a slot lock may be reclaimed: its holder is dead, or it has been unreadable for longer than a write takes. */
function reclaimable(path, holder, alive) {
  if (validHolder(holder)) return !alive(holder.pid);
  if (holder !== null) return true;
  // A holder that is still being written is read again on the next poll rather than reclaimed.
  try { return Date.now() - statSync(path).mtimeMs > UNREADABLE_LOCK_MS; } catch { return true; /* released meanwhile */ }
}

/** Moves a reclaim guard left by a crashed process aside. The guard is renamed to a unique name rather than removed
 * by name, so a fresh guard that another process took after the same stale read is put back instead of removed.
 * Returns whether the guard may be taken again now. */
function breakStaleGuard(guard) {
  let seen;
  try { seen = statSync(guard); } catch { return true; /* released meanwhile */ }
  if (Date.now() - seen.mtimeMs <= RECLAIM_GUARD_STALE_MS) return false;
  const aside = `${guard}.${process.pid}.${randomBytes(4).toString("hex")}.stale`;
  try { renameSync(guard, aside); } catch { return true; /* broken by another process */ }
  let moved = null;
  try { moved = statSync(aside); } catch { /* removed meanwhile */ }
  if (moved && (moved.ino !== seen.ino || moved.dev !== seen.dev)) {
    try { renameSync(aside, guard); return false; } catch { /* the guard was taken again meanwhile */ }
  }
  try { rmdirSync(aside); } catch { /* already removed */ }
  return moved !== null && moved.ino === seen.ino && moved.dev === seen.dev;
}

/**
 * Runs `action` while holding the reclaim guard directory `<path>.reclaim`, so that only one process at a time can
 * re-read and remove the lock at `path`. Returns the action's result, or `false` when another process holds the
 * guard. A guard older than the stale age was left by a crashed process and is broken once.
 */
export function underReclaimGuard(path, action) {
  const guard = `${path}.reclaim`;
  for (let attempt = 0; ; attempt += 1) {
    try { mkdirSync(guard); break; } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (attempt > 0 || !breakStaleGuard(guard)) return false;
    }
  }
  try { return action(); } finally {
    try { rmdirSync(guard); } catch { /* broken as stale */ }
  }
}

/** Removes a reclaimable slot lock under its reclaim guard, after reading it again. Returns whether the slot may be
 * tried again now; false when another process holds the guard or the lock has a new, live holder. */
function reclaimUnderGuard(path, seen, alive) {
  return underReclaimGuard(path, () => {
    const current = readJson(path);
    if (JSON.stringify(current) !== JSON.stringify(seen) || !reclaimable(path, current, alive)) return false;
    rmSync(path, { force: true });
    return true;
  });
}

/** Takes a free slot without waiting, reclaiming one whose holder is dead. Returns the slot number or null. */
function tryAcquire({ env, alive, record, slots }) {
  mkdirSync(poolDir(env), { recursive: true });
  for (let slot = 1; slot <= slots; slot += 1) {
    const path = slotPath(env, slot);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        return slot;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const holder = readJson(path);
        if (!reclaimable(path, holder, alive)) break;
        // Another process that read the same dead holder may already have replaced the lock with its own, so the
        // lock is removed only under the slot's reclaim guard, and only if it still holds what was read.
        if (!reclaimUnderGuard(path, holder, alive)) break;
      }
    }
  }
  return null;
}

/**
 * Waits for a heavy-job slot and takes it. Returns `{ slot, slots, waitedMs, release }`; `release` frees the slot
 * only while this process still holds it. An aborted `signal` rejects with reasonCode `cancelled`.
 */
export async function acquireHeavySlot({ label, projectRoot = null, issue = null, env = process.env, pid = process.pid,
  now = Date.now, alive = defaultAlive, signal, pollMs = POLL_MS,
  sleep = (ms) => new Promise((done) => { setTimeout(done, ms); }) } = {}) {
  const slots = heavyPoolSize(env);
  const started = now();
  const record = { schemaVersion: 1, pid, label: String(label ?? "heavy job"), projectRoot,
    ...(Number.isSafeInteger(issue) ? { issue } : {}), startedAt: started };
  // A slot taken on the first attempt was not waited for, whatever the clock moved between two reads.
  let waited = false;
  for (;;) {
    if (signal?.aborted) throw Object.assign(new Error("heavy slot wait cancelled"), { reasonCode: "cancelled" });
    record.startedAt = now();
    const slot = tryAcquire({ env, alive, record, slots });
    if (slot !== null) {
      const path = slotPath(env, slot);
      let released = false;
      const release = () => {
        if (released) return false;
        released = true;
        const holder = readJson(path);
        if (holder?.pid !== pid || holder.startedAt !== record.startedAt) return false;
        rmSync(path, { force: true });
        return true;
      };
      return { slot, slots, waitedMs: waited ? Math.max(0, record.startedAt - started) : 0, release };
    }
    await sleep(pollMs);
    waited = true;
  }
}
