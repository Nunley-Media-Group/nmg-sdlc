#!/usr/bin/env node

/** State shared by every worktree and session of one repository, kept under the git common directory
 * (`<git-common-dir>/nmg-sdlc/`): the merge queue and the in-flight issue records. In-flight records are mirrored
 * to the machine-level state directory so a status command can list every project's issues on this host. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { hostname as osHostname } from 'node:os';
import { join, resolve } from 'node:path';
import { hostStateDir } from '../src/heavy-pool.mjs';

const LOCK_STALE_MS = 30_000;
const LOCK_POLL_MS = 25;
const LOCK_WAIT_MS = 60_000;

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
export function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}
function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}
function writeAtomic(path, value) {
  const temporary = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

/** The repository's git common directory (shared by all its worktrees), absolute; throws when Git cannot name it. */
export function gitCommonDir(cwd, run = defaultRun) {
  const response = run('git', ['rev-parse', '--git-common-dir'], { cwd });
  const value = String(response?.stdout ?? '').trim();
  if ((response?.status ?? 0) !== 0 || !value) throw new Error('git_common_dir_unreadable');
  return resolve(cwd, value);
}

/** `<git-common-dir>/nmg-sdlc`, created on demand. */
export function sharedStateDir(cwd, run = defaultRun) {
  const dir = join(gitCommonDir(cwd, run), 'nmg-sdlc');
  mkdirSync(dir, { recursive: true });
  return dir;
}

const LOCK_HOLDER = 'holder.json';

function removeLock(lock) {
  rmSync(join(lock, LOCK_HOLDER), { force: true });
  rmdirSync(lock);
}
/** Whether a held lock may be broken: its recorded holder is dead on this host, or, when the holder cannot be
 * checked (no readable record yet, or another host), the lock is older than the stale age. A live holder's lock
 * is never broken. */
function lockBreakable(lock, { alive, hostname }) {
  let age = 0;
  try { age = Date.now() - statSync(lock).mtimeMs; } catch { return true; }
  const holder = readJson(join(lock, LOCK_HOLDER));
  if (Number.isSafeInteger(holder?.pid) && holder.pid > 0 && holder.host === hostname) return !alive(holder.pid);
  return age > LOCK_STALE_MS;
}

/** Runs `action` while holding the named lock in `dir`. The lock records its holder; it is broken only when that
 * holder has died, or, when the holder cannot be checked, once the lock is stale. */
export function withLock(dir, name, action, { now = Date.now, sleep = pause, alive = processAlive, hostname = osHostname() } = {}) {
  const lock = join(dir, `${name}.lock`);
  const deadline = now() + LOCK_WAIT_MS;
  for (;;) {
    try { mkdirSync(lock); break; } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (lockBreakable(lock, { alive, hostname })) { try { removeLock(lock); } catch { /* another process broke it first */ } continue; }
      if (now() >= deadline) throw new Error(`shared_state_locked: ${name}`);
      sleep(LOCK_POLL_MS);
    }
  }
  try {
    try { writeFileSync(join(lock, LOCK_HOLDER), `${JSON.stringify({ pid: process.pid, host: hostname, at: Date.now() })}\n`); } catch { /* breakable on age alone */ }
    return action();
  } finally { try { removeLock(lock); } catch { /* already broken */ } }
}

// --- Merge queue -----------------------------------------------------------------------------------------------

const QUEUE_FILE = 'merge-queue.json';

function validEntry(entry) {
  return Number.isSafeInteger(entry?.issue) && entry.issue > 0 && typeof entry.branch === 'string' && entry.branch
    && typeof entry.worktree === 'string' && Number.isSafeInteger(entry.pid) && entry.pid > 0
    && Number.isSafeInteger(entry.enqueuedAt);
}
function readQueue(dir) {
  const record = readJson(join(dir, QUEUE_FILE));
  return record?.schemaVersion === 1 && Array.isArray(record.entries) ? record.entries.filter(validEntry) : [];
}
function writeQueue(dir, entries) {
  writeAtomic(join(dir, QUEUE_FILE), { schemaVersion: 1, entries });
}

/** The queue entries in order, each with its 1-based `position` and whether its controller process is `alive`. */
export function listMergeQueue(cwd, { run = defaultRun, alive = processAlive } = {}) {
  // Listing is read-only: the shared-state directory is not created for it.
  return readQueue(join(gitCommonDir(cwd, run), 'nmg-sdlc'))
    .map((entry, index) => ({ ...entry, position: index + 1, alive: alive(entry.pid) }));
}

/**
 * Adds the issue's branch to the tail of the repository's merge queue, or refreshes its controller on an entry it
 * already holds (its place is kept). Entries whose controller process is dead are dropped first, so a crashed
 * session never blocks the queue. Returns `{ position, head }`.
 */
export function enterMergeQueue(cwd, { issue, branch, worktree, session = null, pid = process.pid },
  { run = defaultRun, alive = processAlive, now = Date.now } = {}) {
  const dir = sharedStateDir(cwd, run);
  return withLock(dir, 'merge-queue', () => {
    const entries = readQueue(dir).filter((entry) => entry.issue === issue || alive(entry.pid));
    const existing = entries.find((entry) => entry.issue === issue);
    if (existing) Object.assign(existing, { branch, worktree, session, pid });
    else entries.push({ issue, branch, worktree, session, pid, enqueuedAt: now() });
    writeQueue(dir, entries);
    const position = entries.findIndex((entry) => entry.issue === issue) + 1;
    return { position, head: position === 1, ahead: entries.slice(0, position - 1).map((entry) => entry.issue) };
  });
}

/** Removes the issue from the merge queue. Returns whether it held an entry. */
export function leaveMergeQueue(cwd, issue, { run = defaultRun } = {}) {
  const dir = sharedStateDir(cwd, run);
  return withLock(dir, 'merge-queue', () => {
    const entries = readQueue(dir);
    const kept = entries.filter((entry) => entry.issue !== issue);
    if (kept.length !== entries.length) writeQueue(dir, kept);
    return kept.length !== entries.length;
  });
}

// --- In-flight issues ------------------------------------------------------------------------------------------

function inFlightDir(dir) { return join(dir, 'in-flight'); }
function hostInFlightDir(env) { return join(hostStateDir(env), 'in-flight'); }
function hostKey(commonDir, issue) {
  return `${createHash('sha256').update(commonDir).digest('hex').slice(0, 16)}-${issue}.json`;
}
function validInFlight(record) {
  return record?.schemaVersion === 1 && Number.isSafeInteger(record.issue) && record.issue > 0
    && typeof record.branch === 'string' && typeof record.worktree === 'string' && Number.isSafeInteger(record.pid);
}

/** Records (or updates) an in-flight issue for this repository and mirrors it to the host directory. */
export function recordInFlight(cwd, { issue, branch, worktree, stage, session = null, declaredFiles, pid = process.pid },
  { run = defaultRun, now = Date.now, env = process.env } = {}) {
  const commonDir = gitCommonDir(cwd, run);
  const dir = sharedStateDir(cwd, run);
  mkdirSync(inFlightDir(dir), { recursive: true });
  const path = join(inFlightDir(dir), `${issue}.json`);
  const previous = readJson(path);
  const record = {
    schemaVersion: 1, issue, branch, worktree, stage, session, pid,
    declaredFiles: declaredFiles ?? (validInFlight(previous) ? previous.declaredFiles ?? [] : []),
    startedAt: validInFlight(previous) && previous.branch === branch ? previous.startedAt ?? now() : now(),
    updatedAt: now(),
  };
  writeAtomic(path, record);
  try {
    mkdirSync(hostInFlightDir(env), { recursive: true });
    writeAtomic(join(hostInFlightDir(env), hostKey(commonDir, issue)), { ...record, commonDir, declaredFiles: undefined });
  } catch { /* the host mirror is informational */ }
  return record;
}

/** Removes an issue's in-flight record and its host mirror. */
export function clearInFlight(cwd, issue, { run = defaultRun, env = process.env } = {}) {
  const commonDir = gitCommonDir(cwd, run);
  rmSync(join(inFlightDir(join(commonDir, 'nmg-sdlc')), `${issue}.json`), { force: true });
  rmSync(join(hostInFlightDir(env), hostKey(commonDir, issue)), { force: true });
}

function readRecords(dir) {
  let names = [];
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter((name) => name.endsWith('.json')).map((name) => readJson(join(dir, name))).filter(validInFlight)
    .sort((left, right) => left.issue - right.issue);
}

/** This repository's in-flight issue records, each with whether its controller process is `alive`. */
export function listInFlight(cwd, { run = defaultRun, alive = processAlive } = {}) {
  return readRecords(inFlightDir(join(gitCommonDir(cwd, run), 'nmg-sdlc')))
    .map((record) => ({ ...record, alive: alive(record.pid) }));
}

/** Every project's in-flight issue records on this host; records whose controller is dead are dropped and, unless
 * `prune` is false (a read-only caller), removed. */
export function listHostInFlight({ env = process.env, alive = processAlive, prune = true } = {}) {
  const dir = hostInFlightDir(env);
  let names = [];
  try { names = readdirSync(dir); } catch { return []; }
  const live = [];
  for (const name of names.filter((item) => item.endsWith('.json'))) {
    const record = readJson(join(dir, name));
    if (validInFlight(record) && typeof record.commonDir === 'string' && alive(record.pid)) live.push(record);
    else if (prune) rmSync(join(dir, name), { force: true });
  }
  return live.sort((left, right) => left.commonDir.localeCompare(right.commonDir) || left.issue - right.issue);
}

// --- Declared-file overlap ---------------------------------------------------------------------------------------

function globRegex(entry) {
  const pattern = entry.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]').replace(/\0/g, '.*');
  return new RegExp(`^${pattern}$`);
}
function entriesOverlap(left, right) {
  if (left === right) return true;
  for (const [a, b] of [[left, right], [right, left]]) {
    if (a.endsWith('/') && b.startsWith(a)) return true;
    if (/[*?]/.test(a) && !/[*?]/.test(b) && !b.endsWith('/') && globRegex(a).test(b)) return true;
  }
  return false;
}

/** The entries of `declared` that overlap `other`: equal paths, a directory containing a path, or a glob matching one. */
export function declaredOverlap(declared, other) {
  return [...new Set((declared ?? []).filter((entry) => (other ?? []).some((candidate) => entriesOverlap(entry, candidate))))].sort();
}

/**
 * The in-flight issues whose declared files overlap `declaredFiles`, as `[{ issue, branch, files }]`. An issue
 * counts as in flight while its controller is alive or its checkout still exists on the issue's branch.
 */
// A record whose controller is gone is still in flight while its checkout exists and is on the issue's branch.
function holdsBranch(record, run) {
  if (!record.branch || !existsSync(record.worktree)) return false;
  const current = run('git', ['branch', '--show-current'], { cwd: record.worktree });
  return current?.status === 0 && String(current.stdout ?? '').trim() === record.branch;
}

export function inFlightOverlaps(cwd, { issue, declaredFiles }, options = {}) {
  return listInFlight(cwd, options)
    .filter((record) => record.issue !== issue && (record.alive || holdsBranch(record, options.run ?? defaultRun)))
    .map((record) => ({ issue: record.issue, branch: record.branch, files: declaredOverlap(declaredFiles, record.declaredFiles) }))
    .filter((overlap) => overlap.files.length > 0);
}
