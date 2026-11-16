// The host-wide heavy-job pool: a machine-level set of slots shared by every project and session on this machine.
// A job that steering marks as heavy holds one slot while it runs; a slot whose holder process is dead is reclaimed.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname as osHostname, homedir } from "node:os";
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

// How long a process start token is reused for one pid, so a waiter polling a held lock does not spawn a process per poll.
const START_TOKEN_TTL_MS = 5_000;
const startTokens = new Map();

function readStartToken(pid, platform) {
  if (platform === "linux") {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      // Field 22 (starttime) is the 20th field after the parenthesized command name, which may contain spaces.
      const value = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
      return /^\d+$/.test(value ?? "") ? `linux:${value}` : null;
    } catch { return null; }
  }
  const response = platform === "win32"
    ? spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
      `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`], { encoding: "utf8", timeout: 10_000, windowsHide: true })
    : spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", timeout: 10_000 });
  const value = response?.status === 0 ? String(response.stdout ?? "").trim().replace(/\s+/g, " ") : "";
  return value ? `${platform}:${value}` : null;
}

/** A token naming when process `pid` started, or null when it cannot be read. Two tokens for one pid differ when the pid
 * was reused by a later process. Cached per pid for a few seconds. */
export function processStartToken(pid, { platform = process.platform, now = Date.now } = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  const cached = startTokens.get(pid);
  if (cached && now() - cached.at < START_TOKEN_TTL_MS) return cached.token;
  const token = readStartToken(pid, platform);
  startTokens.set(pid, { token, at: now() });
  return token;
}

/** Whether the holder recorded as `pid` (started at `recordedStart`) is still running: its pid is alive and, when both
 * start tokens can be read, the live process at that pid is the one that recorded itself rather than a reuse. */
export function holderAlive(pid, recordedStart, { alive = defaultAlive, startToken = processStartToken } = {}) {
  if (!alive(pid)) return false;
  if (typeof recordedStart !== "string" || !recordedStart) return true;
  const live = startToken(pid);
  return typeof live !== "string" || !live || live === recordedStart;
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
export function heavyPoolHolders({ env = process.env, alive = defaultAlive, startToken = processStartToken } = {}) {
  let names = [];
  try { names = readdirSync(poolDir(env)); } catch { return []; }
  return names.map((name) => Number(/^slot-([1-9]\d*)\.lock$/.exec(name)?.[1]))
    .filter(Number.isSafeInteger).sort((left, right) => left - right)
    .map((slot) => ({ slot, record: readJson(slotPath(env, slot)) }))
    .filter(({ record }) => validHolder(record))
    .map(({ slot, record }) => ({ slot, pid: record.pid, label: record.label, projectRoot: record.projectRoot ?? null,
      startedAt: record.startedAt, alive: holderAlive(record.pid, record.processStart, { alive, startToken }), ...(Number.isSafeInteger(record.issue) ? { issue: record.issue } : {}) }));
}

// How long a reclaim guard may stand before it is treated as left by a crashed process.
const RECLAIM_GUARD_STALE_MS = 10_000;

/** Whether a slot lock may be reclaimed: its holder is dead (or its pid was reused), or it has been unreadable for longer
 * than a write takes. */
function reclaimable(path, holder, check) {
  if (validHolder(holder)) return !holderAlive(holder.pid, holder.processStart, check);
  if (holder !== null) return true;
  // A holder that is still being written is read again on the next poll rather than reclaimed.
  try { return Date.now() - statSync(path).mtimeMs > UNREADABLE_LOCK_MS; } catch { return true; /* released meanwhile */ }
}

function guardRecord() {
  return { pid: process.pid, host: osHostname(), start: processStartToken(process.pid), at: Date.now() };
}

/** Whether a reclaim guard may be broken: its owner is dead (or its pid was reused) on this host, or, when the owner
 * cannot be checked (unreadable record, another host, a directory left by an earlier version), it is stale by age. */
function guardBreakable(guard, owner, seen, check) {
  if (Number.isSafeInteger(owner?.pid) && owner.pid > 0 && owner.host === osHostname()) {
    return !holderAlive(owner.pid, owner.start, check);
  }
  return Date.now() - seen.mtimeMs > RECLAIM_GUARD_STALE_MS;
}

function readGuard(path) {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

/** Breaks a reclaim guard whose owner has gone. The guard is moved to a unique name and checked there: a different guard,
 * taken after the read that judged this one breakable, is linked back into place, which fails rather than replace a
 * guard another process took meanwhile. Returns whether the guard may be taken again now. */
function breakStaleGuard(guard, check) {
  let seen;
  try { seen = statSync(guard); } catch { return true; /* released meanwhile */ }
  const text = readGuard(guard);
  let owner = null;
  try { owner = text === null ? null : JSON.parse(text); } catch { /* unreadable owner */ }
  if (!guardBreakable(guard, owner, seen, check)) return false;
  const aside = `${guard}.${process.pid}.${randomBytes(4).toString("hex")}.stale`;
  try { renameSync(guard, aside); } catch { return true; /* broken by another process */ }
  const movedText = readGuard(aside);
  let moved = null;
  try { moved = statSync(aside); } catch { /* removed meanwhile */ }
  const same = moved !== null && moved.ino === seen.ino && moved.dev === seen.dev && movedText === text;
  if (moved !== null && !same && moved.isFile()) {
    try { linkSync(aside, guard); } catch { /* the guard was taken again meanwhile; that guard stays */ }
    try { unlinkSync(aside); } catch { /* already removed */ }
    return false;
  }
  try { rmSync(aside, { recursive: true, force: true }); } catch { /* already removed */ }
  return same;
}

/**
 * Runs `action` while holding the reclaim guard file `<path>.reclaim`, so that only one process at a time can re-read and
 * remove the lock at `path`. Returns the action's result, or `false` when another process holds the guard. The guard
 * records its owner; a guard whose owner has gone is broken once.
 */
export function underReclaimGuard(path, action, check = {}) {
  const guard = `${path}.reclaim`;
  const record = `${JSON.stringify(guardRecord())}\n`;
  for (let attempt = 0; ; attempt += 1) {
    try { writeFileSync(guard, record, { flag: "wx", mode: 0o600 }); break; } catch (error) {
      if (error?.code !== "EEXIST" && error?.code !== "EISDIR") throw error;
      if (attempt > 0 || !breakStaleGuard(guard, check)) return false;
    }
  }
  try { return action(); } finally {
    // Only this process's own guard is removed; one broken meanwhile and taken by another process stays.
    if (readGuard(guard) === record) {
      try { unlinkSync(guard); } catch { /* broken meanwhile */ }
    }
  }
}

/** Removes a reclaimable slot lock under its reclaim guard, after reading it again. Returns whether the slot may be
 * tried again now; false when another process holds the guard or the lock has a new, live holder. */
function reclaimUnderGuard(path, seen, check) {
  return underReclaimGuard(path, () => {
    const current = readJson(path);
    if (JSON.stringify(current) !== JSON.stringify(seen) || !reclaimable(path, current, check)) return false;
    rmSync(path, { force: true });
    return true;
  }, check);
}

/** Takes a free slot without waiting, reclaiming one whose holder is dead. Returns the slot number or null. */
function tryAcquire({ env, check, record, slots }) {
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
        if (!reclaimable(path, holder, check)) break;
        // Another process that read the same dead holder may already have replaced the lock with its own, so the
        // lock is removed only under the slot's reclaim guard, and only if it still holds what was read.
        if (!reclaimUnderGuard(path, holder, check)) break;
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
  now = Date.now, alive = defaultAlive, startToken = processStartToken, signal, pollMs = POLL_MS,
  sleep = (ms) => new Promise((done) => { setTimeout(done, ms); }) } = {}) {
  const slots = heavyPoolSize(env);
  const started = now();
  const record = { schemaVersion: 1, pid, label: String(label ?? "heavy job"), projectRoot,
    ...(Number.isSafeInteger(issue) ? { issue } : {}), startedAt: started };
  const processStart = startToken(pid);
  if (processStart) record.processStart = processStart;
  const check = { alive, startToken };
  // A slot taken on the first attempt was not waited for, whatever the clock moved between two reads.
  let waited = false;
  for (;;) {
    if (signal?.aborted) throw Object.assign(new Error("heavy slot wait cancelled"), { reasonCode: "cancelled" });
    record.startedAt = now();
    const slot = tryAcquire({ env, check, record, slots });
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
