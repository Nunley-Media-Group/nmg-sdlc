import { afterAll, afterEach, describe, expect, it, jest } from '@jest/globals';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { HOST_STATE_ENV } from '../../src/heavy-pool.mjs';
import {
  clearInFlight,
  declaredOverlap,
  enterMergeQueue,
  gitCommonDir,
  inFlightOverlaps,
  leaveMergeQueue,
  listHostInFlight,
  listInFlight,
  listMergeQueue,
  processAlive,
  recordInFlight,
  sharedStateDir,
  withLock,
} from '../sdlc-shared-state.mjs';

jest.setTimeout(60_000);

const MODULE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-shared-state.mjs');

// No test may reach the real `~/.nmg-sdlc`: the process default points at a throwaway directory, and every call
// that mirrors to the host directory is also given an explicit per-test one.
const fallbackHost = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-shared-host-default-'));
const previousHost = process.env[HOST_STATE_ENV];
process.env[HOST_STATE_ENV] = fallbackHost;
afterAll(() => {
  if (previousHost === undefined) delete process.env[HOST_STATE_ENV]; else process.env[HOST_STATE_ENV] = previousHost;
  fs.rmSync(fallbackHost, { recursive: true, force: true });
});

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A primary checkout on `main` with one linked worktree per requested branch, and a private host state directory. */
function repository(...branches) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-shared-')));
  roots.push(root);
  const cwd = path.join(root, 'primary');
  const host = path.join(root, 'host');
  fs.mkdirSync(cwd);
  fs.mkdirSync(host);
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(cwd, 'README.md'), 'main\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', 'main');
  const worktrees = branches.map((branch) => {
    const worktree = path.join(root, 'worktrees', branch);
    git(cwd, 'worktree', 'add', '-b', branch, worktree, 'main');
    return worktree;
  });
  return { root, cwd, host, worktrees, env: { [HOST_STATE_ENV]: host } };
}

const DEAD = 2 ** 22 + 4321;
const aliveExcept = (...dead) => (pid) => !dead.includes(pid);
const entry = (issue, extra = {}) => ({ issue, branch: `${issue}-work`, worktree: `/worktrees/${issue}-work`, pid: 1000 + issue, ...extra });

describe('shared state directory', () => {
  it('is the same directory from the primary checkout, a subdirectory of it and a linked worktree', () => {
    const repo = repository('7-thing');
    fs.mkdirSync(path.join(repo.cwd, 'nested/deeper'), { recursive: true });
    const common = path.join(repo.cwd, '.git');

    expect(gitCommonDir(repo.cwd)).toBe(common);
    expect(gitCommonDir(path.join(repo.cwd, 'nested/deeper'))).toBe(common);
    expect(fs.realpathSync(gitCommonDir(repo.worktrees[0]))).toBe(common);

    expect(fs.existsSync(path.join(common, 'nmg-sdlc'))).toBe(false);
    expect(sharedStateDir(repo.worktrees[0])).toBe(path.join(gitCommonDir(repo.worktrees[0]), 'nmg-sdlc'));
    expect(fs.realpathSync(sharedStateDir(repo.worktrees[0]))).toBe(path.join(common, 'nmg-sdlc'));
    expect(sharedStateDir(repo.cwd)).toBe(path.join(common, 'nmg-sdlc'));
    expect(fs.statSync(path.join(common, 'nmg-sdlc')).isDirectory()).toBe(true);
    // The linked worktree's own git directory holds no state.
    expect(fs.existsSync(path.join(common, 'worktrees/7-thing/nmg-sdlc'))).toBe(false);
  });

  it('throws when the directory is not inside a repository or git cannot answer', () => {
    const repo = repository();
    expect(() => gitCommonDir(repo.root)).toThrow('git_common_dir_unreadable');
    expect(() => sharedStateDir(repo.root)).toThrow('git_common_dir_unreadable');
    expect(() => gitCommonDir(repo.cwd, () => ({ status: 0, stdout: '\n' }))).toThrow('git_common_dir_unreadable');
    expect(() => gitCommonDir(repo.cwd, () => ({ status: 128, stdout: '.git\n' }))).toThrow('git_common_dir_unreadable');
  });
});

describe('withLock', () => {
  const lockDir = () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-lock-')));
    roots.push(dir);
    return dir;
  };
  /** A clock that only moves when the lock waits, so a timeout costs no real time. */
  const clock = () => {
    const state = { now: 1_000, sleeps: [] };
    return { state, now: () => state.now, sleep: (ms) => { state.sleeps.push(ms); state.now += ms; } };
  };

  it('holds the lock for the action, returns its value and releases afterwards', () => {
    const dir = lockDir();
    const lock = path.join(dir, 'queue.lock');
    expect(withLock(dir, 'queue', () => fs.existsSync(lock))).toBe(true);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('releases the lock when the action throws', () => {
    const dir = lockDir();
    expect(() => withLock(dir, 'queue', () => { throw new Error('action failed'); })).toThrow('action failed');
    expect(fs.existsSync(path.join(dir, 'queue.lock'))).toBe(false);
    expect(withLock(dir, 'queue', () => 'again')).toBe('again');
  });

  it('refuses a second holder of the same name until the wait runs out, and leaves the first holder its lock', () => {
    const dir = lockDir();
    const { state, now, sleep } = clock();
    let inner = null;
    const outer = withLock(dir, 'queue', () => {
      try { withLock(dir, 'queue', () => { inner = 'entered'; }, { now, sleep }); } catch (error) { inner = error.message; }
      // A different name is a different lock.
      expect(withLock(dir, 'other', () => 'free', { now, sleep })).toBe('free');
      return fs.existsSync(path.join(dir, 'queue.lock'));
    });
    expect(inner).toBe('shared_state_locked: queue');
    expect(outer).toBe(true);
    expect(state.sleeps.length).toBeGreaterThan(1);
    expect(state.now - 1_000).toBeGreaterThanOrEqual(60_000);
    expect(fs.existsSync(path.join(dir, 'queue.lock'))).toBe(false);
  });

  it('breaks a lock left behind by a crashed holder once it is stale, but not a fresh one', () => {
    const dir = lockDir();
    const lock = path.join(dir, 'queue.lock');
    fs.mkdirSync(lock);
    const fresh = clock();
    expect(() => withLock(dir, 'queue', () => 'entered', fresh)).toThrow('shared_state_locked: queue');
    expect(fs.existsSync(lock)).toBe(true);

    const old = new Date(Date.now() - 31_000);
    fs.utimesSync(lock, old, old);
    const stale = clock();
    expect(withLock(dir, 'queue', () => 'entered', stale)).toBe('entered');
    expect(stale.state.sleeps).toEqual([]);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('never breaks the lock of a live holder on this host, however old, and breaks a dead holder\'s at once (#556 AC3)', () => {
    const dir = lockDir();
    const lock = path.join(dir, 'queue.lock');
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'holder.json'), JSON.stringify({ pid: 4242, host: 'this-host', at: 0 }));
    const old = new Date(Date.now() - 3_600_000);
    fs.utimesSync(lock, old, old);

    const live = clock();
    expect(() => withLock(dir, 'queue', () => 'entered', { ...live, alive: () => true, hostname: 'this-host' }))
      .toThrow('shared_state_locked: queue');
    expect(live.state.now - 1_000).toBeGreaterThanOrEqual(60_000);
    expect(fs.existsSync(path.join(lock, 'holder.json'))).toBe(true);

    const dead = clock();
    const checked = [];
    expect(withLock(dir, 'queue', () => 'entered', { ...dead, alive: (pid) => { checked.push(pid); return false; }, hostname: 'this-host' }))
      .toBe('entered');
    // Checked when read, and again under the reclaim guard before the lock is broken.
    expect(checked).toEqual([4242, 4242]);
    expect(dead.state.sleeps).toEqual([]);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('leaves a dead holder\'s lock to the waiter that broke it first, and waits instead (#556 AC3)', () => {
    const dir = lockDir();
    const lock = path.join(dir, 'queue.lock');
    const holderFile = path.join(lock, 'holder.json');
    const dead = { pid: 999_001, host: 'this-host', at: 0 };
    const other = { pid: 999_002, host: 'this-host', at: 1 };
    fs.mkdirSync(lock);
    fs.writeFileSync(holderFile, JSON.stringify(dead));
    let raced = false;
    // While this waiter is deciding that the holder is dead, another waiter that read the same dead holder breaks
    // the lock and takes it.
    const alive = (pid) => {
      if (pid === dead.pid && !raced) {
        raced = true;
        fs.rmSync(holderFile);
        fs.rmdirSync(lock);
        fs.mkdirSync(lock);
        fs.writeFileSync(holderFile, JSON.stringify(other));
      }
      return pid === other.pid;
    };
    let entered = false;
    expect(() => withLock(dir, 'queue', () => { entered = true; }, { ...clock(), alive, hostname: 'this-host' }))
      .toThrow('shared_state_locked: queue');
    expect(raced).toBe(true);
    expect(entered).toBe(false);
    expect(JSON.parse(fs.readFileSync(holderFile, 'utf8'))).toEqual(other);
    expect(fs.readdirSync(dir)).toEqual(['queue.lock']);
  });

  it('breaks a reclaim guard left by a crashed waiter once it is stale, then breaks the dead holder\'s lock (#556 AC3)', () => {
    const dir = lockDir();
    const lock = path.join(dir, 'queue.lock');
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'holder.json'), JSON.stringify({ pid: 999_001, host: 'this-host', at: 0 }));
    fs.mkdirSync(`${lock}.reclaim`);
    const old = new Date(Date.now() - 11_000);
    fs.utimesSync(`${lock}.reclaim`, old, old);

    expect(withLock(dir, 'queue', () => 'entered', { ...clock(), alive: () => false, hostname: 'this-host' })).toBe('entered');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('breaks a lock recorded on another host only once it is stale (#556 AC3)', () => {
    const dir = lockDir();
    const lock = path.join(dir, 'queue.lock');
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'holder.json'), JSON.stringify({ pid: 4242, host: 'other-host', at: 0 }));
    const alive = () => { throw new Error('another host\'s pid is never checked'); };
    expect(() => withLock(dir, 'queue', () => 'entered', { ...clock(), alive, hostname: 'this-host' }))
      .toThrow('shared_state_locked: queue');

    const old = new Date(Date.now() - 31_000);
    fs.utimesSync(lock, old, old);
    expect(withLock(dir, 'queue', () => 'entered', { ...clock(), alive, hostname: 'this-host' })).toBe('entered');
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('records its holder while the action runs and removes it on release (#556 AC3)', () => {
    const dir = lockDir();
    const holder = withLock(dir, 'queue', () => JSON.parse(fs.readFileSync(path.join(dir, 'queue.lock', 'holder.json'), 'utf8')),
      { hostname: 'this-host' });
    expect(holder).toMatchObject({ pid: process.pid, host: 'this-host' });
    expect(Number.isSafeInteger(holder.at)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'queue.lock'))).toBe(false);
  });

  it('rethrows a failure that is not a held lock', () => {
    const dir = lockDir();
    expect(() => withLock(path.join(dir, 'absent'), 'queue', () => 'entered')).toThrow(/ENOENT/);
  });

  it('excludes other processes: concurrent read-modify-write cycles lose no update', async () => {
    const dir = lockDir();
    const counter = path.join(dir, 'counter');
    fs.writeFileSync(counter, '0');
    const source = `
      import fs from 'node:fs';
      const { withLock } = await import(${JSON.stringify(pathToFileURL(MODULE).href)});
      const [dir, counter] = process.argv.slice(1);
      for (let round = 0; round < 15; round += 1) {
        withLock(dir, 'counter', () => {
          const value = Number(fs.readFileSync(counter, 'utf8'));
          const until = Date.now() + 2;
          while (Date.now() < until) { /* widen the race window */ }
          fs.writeFileSync(counter, String(value + 1));
        });
      }`;
    const workers = Array.from({ length: 4 }, () => new Promise((resolve) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', source, dir, counter], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('close', (code) => resolve({ code, stderr }));
    }));
    expect(await Promise.all(workers)).toEqual(Array(4).fill({ code: 0, stderr: '' }));
    expect(fs.readFileSync(counter, 'utf8')).toBe('60');
    expect(fs.existsSync(path.join(dir, 'counter.lock'))).toBe(false);
  });
});

describe('merge queue', () => {
  const alive = () => true;

  it('is empty before anyone enters', () => {
    const repo = repository();
    expect(listMergeQueue(repo.cwd)).toEqual([]);
    expect(leaveMergeQueue(repo.cwd, 7)).toBe(false);
  });

  it('queues issues first in, first out and reports position, head and who is ahead', () => {
    const repo = repository();
    const times = [100, 200, 300];
    const now = () => times.shift();

    expect(enterMergeQueue(repo.cwd, entry(7, { session: 'session-a' }), { alive, now })).toEqual({ position: 1, head: true, ahead: [] });
    expect(enterMergeQueue(repo.cwd, entry(3), { alive, now })).toEqual({ position: 2, head: false, ahead: [7] });
    expect(enterMergeQueue(repo.cwd, entry(9), { alive, now })).toEqual({ position: 3, head: false, ahead: [7, 3] });

    expect(listMergeQueue(repo.cwd, { alive })).toEqual([
      { issue: 7, branch: '7-work', worktree: '/worktrees/7-work', session: 'session-a', pid: 1007, enqueuedAt: 100, position: 1, alive: true },
      { issue: 3, branch: '3-work', worktree: '/worktrees/3-work', session: null, pid: 1003, enqueuedAt: 200, position: 2, alive: true },
      { issue: 9, branch: '9-work', worktree: '/worktrees/9-work', session: null, pid: 1009, enqueuedAt: 300, position: 3, alive: true },
    ]);
    expect(JSON.parse(fs.readFileSync(path.join(repo.cwd, '.git/nmg-sdlc/merge-queue.json'), 'utf8')))
      .toMatchObject({ schemaVersion: 1, entries: [{ issue: 7 }, { issue: 3 }, { issue: 9 }] });
    expect(fs.existsSync(path.join(repo.cwd, '.git/nmg-sdlc/merge-queue.lock'))).toBe(false);
  });

  it('defaults the controller to the calling process', () => {
    const repo = repository();
    enterMergeQueue(repo.cwd, { issue: 7, branch: '7-work', worktree: repo.cwd });
    expect(listMergeQueue(repo.cwd)).toMatchObject([{ issue: 7, pid: process.pid, alive: true, position: 1 }]);
  });

  it('keeps an issue its place when it enters again, refreshing its controller', () => {
    const repo = repository();
    enterMergeQueue(repo.cwd, entry(7), { alive, now: () => 100 });
    enterMergeQueue(repo.cwd, entry(3), { alive, now: () => 200 });

    const again = enterMergeQueue(repo.cwd, entry(7, { pid: 4242, session: 'resumed', worktree: '/moved/7-work' }), { alive, now: () => 900 });

    expect(again).toEqual({ position: 1, head: true, ahead: [] });
    expect(listMergeQueue(repo.cwd, { alive })).toMatchObject([
      { issue: 7, pid: 4242, session: 'resumed', worktree: '/moved/7-work', enqueuedAt: 100, position: 1 },
      { issue: 3, enqueuedAt: 200, position: 2 },
    ]);
  });

  it('moves the next issue to the head when the head leaves', () => {
    const repo = repository();
    for (const issue of [7, 3, 9]) enterMergeQueue(repo.cwd, entry(issue), { alive });

    expect(leaveMergeQueue(repo.cwd, 7)).toBe(true);
    expect(leaveMergeQueue(repo.cwd, 7)).toBe(false);

    expect(listMergeQueue(repo.cwd, { alive }).map(({ issue, position }) => [issue, position])).toEqual([[3, 1], [9, 2]]);
    expect(enterMergeQueue(repo.cwd, entry(3), { alive })).toEqual({ position: 1, head: true, ahead: [] });
    // An issue that left and enters again starts at the tail.
    expect(enterMergeQueue(repo.cwd, entry(7), { alive })).toEqual({ position: 3, head: false, ahead: [3, 9] });
  });

  it('drops entries whose controller is dead when another issue enters, so a crashed session never blocks the queue', () => {
    const repo = repository();
    enterMergeQueue(repo.cwd, entry(7, { pid: DEAD }), { alive });
    enterMergeQueue(repo.cwd, entry(3), { alive });
    enterMergeQueue(repo.cwd, entry(5, { pid: DEAD + 1 }), { alive });
    const crashed = aliveExcept(DEAD, DEAD + 1);

    // Listing reports the dead controllers without removing them.
    expect(listMergeQueue(repo.cwd, { alive: crashed }).map(({ issue, alive: live }) => [issue, live])).toEqual([[7, false], [3, true], [5, false]]);

    expect(enterMergeQueue(repo.cwd, entry(9), { alive: crashed })).toEqual({ position: 2, head: false, ahead: [3] });
    expect(listMergeQueue(repo.cwd, { alive: crashed }).map(({ issue }) => issue)).toEqual([3, 9]);
  });

  it('keeps the entering issue its own place even though its previous controller is dead', () => {
    const repo = repository();
    enterMergeQueue(repo.cwd, entry(7, { pid: DEAD }), { alive });
    enterMergeQueue(repo.cwd, entry(3), { alive });

    expect(enterMergeQueue(repo.cwd, entry(7, { pid: 5151 }), { alive: aliveExcept(DEAD) })).toEqual({ position: 1, head: true, ahead: [] });
    expect(listMergeQueue(repo.cwd, { alive: aliveExcept(DEAD) })).toMatchObject([{ issue: 7, pid: 5151, alive: true }, { issue: 3 }]);
  });

  it('checks controllers with the real process table by default', () => {
    const repo = repository();
    const exited = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
    const gone = Number(exited.stdout);
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(gone)).toBe(false);
    enterMergeQueue(repo.cwd, entry(7, { pid: gone }));

    expect(enterMergeQueue(repo.cwd, entry(3, { pid: process.pid }))).toEqual({ position: 1, head: true, ahead: [] });
  });

  it('is one queue for every worktree of the repository', () => {
    const repo = repository('7-work', '3-work');
    const [first, second] = repo.worktrees;

    expect(enterMergeQueue(first, { issue: 7, branch: '7-work', worktree: first, pid: 1007 }, { alive })).toMatchObject({ position: 1, head: true });
    expect(enterMergeQueue(second, { issue: 3, branch: '3-work', worktree: second, pid: 1003 }, { alive })).toEqual({ position: 2, head: false, ahead: [7] });

    const seen = [repo.cwd, first, second].map((cwd) => listMergeQueue(cwd, { alive }));
    expect(seen[0].map(({ issue, worktree }) => [issue, worktree])).toEqual([[7, first], [3, second]]);
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
    expect(leaveMergeQueue(repo.cwd, 7)).toBe(true);
    expect(listMergeQueue(second, { alive }).map(({ issue, position }) => [issue, position])).toEqual([[3, 1]]);
  });

  it('ignores a malformed queue file and malformed entries', () => {
    const repo = repository();
    const file = path.join(sharedStateDir(repo.cwd), 'merge-queue.json');
    fs.writeFileSync(file, '{not json');
    expect(listMergeQueue(repo.cwd, { alive })).toEqual([]);
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 2, entries: [{ ...entry(7), enqueuedAt: 1 }] }));
    expect(listMergeQueue(repo.cwd, { alive })).toEqual([]);
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, entries: [
      { ...entry(7), enqueuedAt: 1 }, { issue: 'x', branch: 'b', worktree: 'w', pid: 1, enqueuedAt: 1 },
      { ...entry(8), pid: 0, enqueuedAt: 1 }, { ...entry(9), branch: '', enqueuedAt: 1 }, null,
    ] }));
    expect(listMergeQueue(repo.cwd, { alive }).map(({ issue }) => issue)).toEqual([7]);
    expect(enterMergeQueue(repo.cwd, entry(3), { alive })).toEqual({ position: 2, head: false, ahead: [7] });
  });
});

describe('in-flight registry', () => {
  const alive = () => true;
  const hostFiles = (repo) => { try { return fs.readdirSync(path.join(repo.host, 'in-flight')).sort(); } catch { return []; } };

  it('records an issue for the repository and mirrors it to the host directory', () => {
    const repo = repository('7-work');
    const [worktree] = repo.worktrees;

    const record = recordInFlight(worktree, { issue: 7, branch: '7-work', worktree, stage: 'implement', session: 'session-a',
      declaredFiles: ['src/a.mjs', 'docs/'], pid: 1007 }, { env: repo.env, now: () => 500 });

    const expected = { schemaVersion: 1, issue: 7, branch: '7-work', worktree, stage: 'implement', session: 'session-a', pid: 1007,
      declaredFiles: ['src/a.mjs', 'docs/'], startedAt: 500, updatedAt: 500 };
    expect(record).toEqual(expected);
    expect(JSON.parse(fs.readFileSync(path.join(repo.cwd, '.git/nmg-sdlc/in-flight/7.json'), 'utf8'))).toEqual(expected);
    // Seen from the primary checkout and from the worktree alike.
    expect(listInFlight(repo.cwd, { alive })).toEqual([{ ...expected, alive: true }]);
    expect(listInFlight(worktree, { alive: () => false })).toEqual([{ ...expected, alive: false }]);

    // The host mirror names the repository and leaves the declared files out.
    const { declaredFiles: _omitted, ...mirrored } = expected;
    const host = listHostInFlight({ env: repo.env, alive });
    expect(host).toHaveLength(1);
    expect(fs.realpathSync(host[0].commonDir)).toBe(path.join(repo.cwd, '.git'));
    expect(host[0]).toEqual({ ...mirrored, commonDir: host[0].commonDir });
    expect(hostFiles(repo)).toEqual([expect.stringMatching(/^[0-9a-f]{16}-7\.json$/)]);
    // Nothing reached the process-default host directory.
    expect(fs.readdirSync(fallbackHost)).toEqual([]);
  });

  it('updates a record in place: the start time and declared files are kept unless they are given again', () => {
    const repo = repository();
    const base = { issue: 7, branch: '7-work', worktree: repo.cwd, pid: 1007 };
    recordInFlight(repo.cwd, { ...base, stage: 'start', declaredFiles: ['src/a.mjs'] }, { env: repo.env, now: () => 100 });

    const advanced = recordInFlight(repo.cwd, { ...base, stage: 'verify', pid: 2007 }, { env: repo.env, now: () => 250 });
    expect(advanced).toMatchObject({ stage: 'verify', pid: 2007, declaredFiles: ['src/a.mjs'], startedAt: 100, updatedAt: 250, session: null });

    const redeclared = recordInFlight(repo.cwd, { ...base, stage: 'verify', declaredFiles: ['src/b.mjs'] }, { env: repo.env, now: () => 300 });
    expect(redeclared).toMatchObject({ declaredFiles: ['src/b.mjs'], startedAt: 100, updatedAt: 300 });

    // The same issue started again on another branch is a new piece of work.
    const restarted = recordInFlight(repo.cwd, { ...base, branch: '7-second-try', stage: 'start' }, { env: repo.env, now: () => 400 });
    expect(restarted).toMatchObject({ branch: '7-second-try', declaredFiles: ['src/b.mjs'], startedAt: 400, updatedAt: 400 });

    expect(listInFlight(repo.cwd, { alive })).toHaveLength(1);
    expect(hostFiles(repo)).toHaveLength(1);
    expect(listHostInFlight({ env: repo.env, alive })).toMatchObject([{ issue: 7, branch: '7-second-try', stage: 'start' }]);
  });

  it('starts with no declared files when none were ever given', () => {
    const repo = repository();
    expect(recordInFlight(repo.cwd, { issue: 7, branch: '7-work', worktree: repo.cwd, stage: 'start' }, { env: repo.env }))
      .toMatchObject({ declaredFiles: [], pid: process.pid });
  });

  it('lists the repository records by issue number and skips files that are not records', () => {
    const repo = repository();
    for (const issue of [12, 3, 7]) recordInFlight(repo.cwd, { issue, branch: `${issue}-work`, worktree: repo.cwd, stage: 'implement', pid: 1000 + issue }, { env: repo.env });
    const dir = path.join(repo.cwd, '.git/nmg-sdlc/in-flight');
    fs.writeFileSync(path.join(dir, '99.json'), '{broken');
    fs.writeFileSync(path.join(dir, '98.json'), JSON.stringify({ schemaVersion: 1, issue: 98 }));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

    expect(listInFlight(repo.cwd, { alive: aliveExcept(1003) }).map(({ issue, alive: live }) => [issue, live])).toEqual([[3, false], [7, true], [12, true]]);
  });

  it('clears an issue from the repository and from the host mirror, and tolerates clearing twice', () => {
    const repo = repository('7-work');
    const [worktree] = repo.worktrees;
    recordInFlight(repo.cwd, { issue: 7, branch: '7-work', worktree, stage: 'implement' }, { env: repo.env });
    recordInFlight(repo.cwd, { issue: 8, branch: '8-work', worktree: repo.cwd, stage: 'implement' }, { env: repo.env });

    // Cleared from the worktree, although it was recorded from the primary checkout.
    clearInFlight(worktree, 7, { env: repo.env });
    clearInFlight(worktree, 7, { env: repo.env });

    expect(listInFlight(repo.cwd, { alive }).map(({ issue }) => issue)).toEqual([8]);
    expect(listHostInFlight({ env: repo.env, alive }).map(({ issue }) => issue)).toEqual([8]);
    expect(hostFiles(repo)).toHaveLength(1);
  });

  it('lists every project on the host, dropping and removing records whose controller is dead', () => {
    const one = repository();
    const two = repository();
    const env = one.env;
    recordInFlight(one.cwd, { issue: 9, branch: '9-work', worktree: one.cwd, stage: 'verify', pid: 1009 }, { env });
    recordInFlight(one.cwd, { issue: 4, branch: '4-work', worktree: one.cwd, stage: 'implement', pid: DEAD }, { env });
    recordInFlight(two.cwd, { issue: 9, branch: '9-other', worktree: two.cwd, stage: 'start', pid: 2009 }, { env });
    recordInFlight(two.cwd, { issue: 2, branch: '2-work', worktree: two.cwd, stage: 'start', pid: 2002 }, { env });
    fs.writeFileSync(path.join(one.host, 'in-flight', 'junk.json'), '{broken');
    fs.writeFileSync(path.join(one.host, 'in-flight', 'keep.txt'), 'not a record');
    expect(hostFiles(one)).toHaveLength(6);

    const listed = listHostInFlight({ env, alive: aliveExcept(DEAD) });

    const commonDirs = [gitCommonDir(one.cwd), gitCommonDir(two.cwd)].sort((left, right) => left.localeCompare(right));
    const order = (commonDir) => listed.filter((record) => record.commonDir === commonDir).map(({ issue }) => issue);
    expect(listed.map(({ commonDir }) => commonDir)).toEqual([...listed.map(({ commonDir }) => commonDir)].sort((left, right) => left.localeCompare(right)));
    expect(order(gitCommonDir(one.cwd))).toEqual([9]);
    expect(order(gitCommonDir(two.cwd))).toEqual([2, 9]);
    expect([...new Set(listed.map(({ commonDir }) => commonDir))]).toEqual(commonDirs);
    expect(listed.every((record) => !Object.hasOwn(record, 'declaredFiles'))).toBe(true);
    // The dead record and the unreadable file are gone; the repository's own record of the dead issue is kept.
    expect(hostFiles(one)).toHaveLength(4);
    expect(hostFiles(one)).toContain('keep.txt');
    expect(listInFlight(one.cwd, { alive: aliveExcept(DEAD) }).map(({ issue, alive: live }) => [issue, live])).toEqual([[4, false], [9, true]]);
  });

  it('returns no host records when the host directory does not exist', () => {
    const repo = repository();
    expect(listHostInFlight({ env: { [HOST_STATE_ENV]: path.join(repo.root, 'never-created') } })).toEqual([]);
    expect(listInFlight(repo.cwd)).toEqual([]);
  });

  it('still records the issue for the repository when the host mirror cannot be written', () => {
    const repo = repository();
    const blocked = path.join(repo.root, 'blocked');
    fs.writeFileSync(blocked, 'a file where the host directory should be');

    const record = recordInFlight(repo.cwd, { issue: 7, branch: '7-work', worktree: repo.cwd, stage: 'start' }, { env: { [HOST_STATE_ENV]: blocked } });

    expect(record).toMatchObject({ issue: 7, stage: 'start' });
    expect(listInFlight(repo.cwd, { alive })).toMatchObject([{ issue: 7 }]);
  });
});

describe('declaredOverlap', () => {
  it('reports equal paths, once and sorted', () => {
    expect(declaredOverlap(['src/b.mjs', 'src/a.mjs', 'src/a.mjs', 'src/c.mjs'], ['src/a.mjs', 'src/b.mjs', 'README.md']))
      .toEqual(['src/a.mjs', 'src/b.mjs']);
    expect(declaredOverlap(['src/a.mjs'], ['src/a.mjs.bak', 'src/a'])).toEqual([]);
  });

  it('treats an entry ending in a slash as a directory containing every path below it, in either direction', () => {
    expect(declaredOverlap(['docs/', 'src/a.mjs'], ['docs/guide/intro.md'])).toEqual(['docs/']);
    expect(declaredOverlap(['docs/guide/intro.md', 'src/a.mjs'], ['docs/'])).toEqual(['docs/guide/intro.md']);
    expect(declaredOverlap(['docs/'], ['docs/guide/'])).toEqual(['docs/']);
    expect(declaredOverlap(['docs/'], ['docs/'])).toEqual(['docs/']);
    // A directory entry is not a name prefix.
    expect(declaredOverlap(['docs/'], ['docs-old/intro.md', 'docs'])).toEqual([]);
  });

  it('matches globs against paths: * and ? stay inside one segment, ** crosses segments', () => {
    expect(declaredOverlap(['src/*.mjs'], ['src/a.mjs'])).toEqual(['src/*.mjs']);
    expect(declaredOverlap(['src/a.mjs', 'src/deep/b.mjs', 'src/a.js'], ['src/*.mjs'])).toEqual(['src/a.mjs']);
    expect(declaredOverlap(['src/**'], ['src/deep/er/b.mjs'])).toEqual(['src/**']);
    expect(declaredOverlap(['src/**/*.test.mjs'], ['src/deep/er/b.test.mjs', 'lib/x.test.mjs'])).toEqual(['src/**/*.test.mjs']);
    expect(declaredOverlap(['file?.txt'], ['file1.txt'])).toEqual(['file?.txt']);
    expect(declaredOverlap(['file?.txt'], ['file12.txt', 'file/.txt'])).toEqual([]);
    // Regular-expression characters in a glob are literal.
    expect(declaredOverlap(['src/a+b(1).mjs', 'src/*.m.s'], ['src/a+b(1).mjs', 'src/x.mjs'])).toEqual(['src/a+b(1).mjs']);
    expect(declaredOverlap(['src/*.[jt]s'], ['src/a.js'])).toEqual([]);
  });

  it('lets a directory entry contain a glob below it, and treats two different globs as distinct', () => {
    expect(declaredOverlap(['src/'], ['src/*.mjs'])).toEqual(['src/']);
    expect(declaredOverlap(['src/*.mjs'], ['src/a*.mjs'])).toEqual([]);
    expect(declaredOverlap(['src/*.mjs'], ['src/*.mjs'])).toEqual(['src/*.mjs']);
  });

  it('is empty for missing or empty lists', () => {
    expect(declaredOverlap(undefined, ['a'])).toEqual([]);
    expect(declaredOverlap(['a'], null)).toEqual([]);
    expect(declaredOverlap([], [])).toEqual([]);
  });
});

describe('inFlightOverlaps', () => {
  it('reports each other in-flight issue whose declared files overlap, with the overlapping entries', () => {
    const repo = repository();
    const record = (issue, declaredFiles) => recordInFlight(repo.cwd, { issue, branch: `${issue}-work`, worktree: repo.cwd, stage: 'implement',
      declaredFiles, pid: 1000 + issue }, { env: repo.env });
    record(3, ['src/queue.mjs', 'docs/']);
    record(5, ['scripts/**']);
    record(8, ['unrelated/file.txt']);
    // The asking issue's own record never counts against it.
    record(7, ['src/queue.mjs', 'docs/guide.md', 'scripts/run.mjs']);

    const overlaps = inFlightOverlaps(repo.cwd, { issue: 7, declaredFiles: ['src/queue.mjs', 'docs/guide.md', 'scripts/run.mjs', 'README.md'] }, { alive: () => true });

    expect(overlaps).toEqual([
      { issue: 3, branch: '3-work', files: ['docs/guide.md', 'src/queue.mjs'] },
      { issue: 5, branch: '5-work', files: ['scripts/run.mjs'] },
    ]);
    expect(inFlightOverlaps(repo.cwd, { issue: 7, declaredFiles: ['README.md'] }, { alive: () => true })).toEqual([]);
    expect(inFlightOverlaps(repo.cwd, { issue: 7, declaredFiles: [] }, { alive: () => true })).toEqual([]);
  });

  it('keeps counting a dead controller\'s issue while its worktree still holds the branch, and stops once it does not', () => {
    const repo = repository('3-work', '5-work', '6-work');
    const [held, moved, removed] = repo.worktrees;
    const record = (issue, worktree, pid) => recordInFlight(repo.cwd, { issue, branch: `${issue}-work`, worktree, stage: 'implement',
      declaredFiles: ['src/queue.mjs'], pid }, { env: repo.env });
    record(3, held, DEAD);
    record(5, moved, DEAD + 1);
    record(6, removed, DEAD + 2);
    record(9, path.join(repo.root, 'gone-but-alive'), 1009);
    // #5's checkout moved to another branch; #6's checkout was removed.
    git(moved, 'checkout', '-b', '5-something-else');
    git(repo.cwd, 'worktree', 'remove', '--force', removed);
    const alive = aliveExcept(DEAD, DEAD + 1, DEAD + 2);
    const ask = { issue: 7, declaredFiles: ['src/queue.mjs'] };

    expect(inFlightOverlaps(repo.cwd, ask, { alive })).toEqual([
      { issue: 3, branch: '3-work', files: ['src/queue.mjs'] },
      // A live controller counts wherever its checkout is.
      { issue: 9, branch: '9-work', files: ['src/queue.mjs'] },
    ]);
    // Asked from another worktree, the answer is the same.
    expect(inFlightOverlaps(moved, ask, { alive })).toEqual(inFlightOverlaps(repo.cwd, ask, { alive }));

    // Once the dead controller's worktree leaves the branch too, the issue is no longer in flight.
    git(held, 'checkout', '--detach');
    expect(inFlightOverlaps(repo.cwd, ask, { alive }).map(({ issue }) => issue)).toEqual([9]);
    // With every controller dead and no checkout on a recorded branch, nothing overlaps.
    expect(inFlightOverlaps(repo.cwd, ask, { alive: () => false })).toEqual([]);
  });

  it('uses the real process table by default', () => {
    const repo = repository();
    recordInFlight(repo.cwd, { issue: 3, branch: '3-work', worktree: path.join(repo.root, 'absent'), stage: 'implement', declaredFiles: ['a.txt'] }, { env: repo.env });
    expect(inFlightOverlaps(repo.cwd, { issue: 7, declaredFiles: ['a.txt'] })).toEqual([{ issue: 3, branch: '3-work', files: ['a.txt'] }]);
  });
});
