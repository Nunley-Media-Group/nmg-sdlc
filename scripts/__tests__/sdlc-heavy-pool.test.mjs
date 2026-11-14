import { afterAll, afterEach, describe, expect, it, jest } from '@jest/globals';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as pool from '../../src/heavy-pool.mjs';
import { heavyPoolList, parseHeavyPoolCli, runHeavy } from '../sdlc-heavy-pool.mjs';

const { HOST_STATE_ENV, acquireHeavySlot, heavyPoolHolders, heavyPoolSize, hostStateDir } = pool;

jest.setTimeout(60_000);

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-heavy-pool.mjs');

// No test may reach the real `~/.nmg-sdlc`: the process default points at a throwaway directory, and every call
// is also given an explicit per-test host directory.
const fallbackHost = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-heavy-default-'));
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

function temporary(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}
/** A private host state directory, with `heavyJobSlots` in its config.json when `slots` is given. */
function host(slots) {
  const dir = temporary('nmg-sdlc-heavy-host-');
  if (slots !== undefined) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ heavyJobSlots: slots }));
  return { dir, env: { [HOST_STATE_ENV]: dir }, lock: (slot) => path.join(dir, 'heavy-jobs', `slot-${slot}.lock`) };
}
const lockFiles = (h) => { try { return fs.readdirSync(path.join(h.dir, 'heavy-jobs')).sort(); } catch { return []; } };
const readLock = (h, slot) => JSON.parse(fs.readFileSync(h.lock(slot), 'utf8'));
function writeLock(h, slot, record) {
  fs.mkdirSync(path.dirname(h.lock(slot)), { recursive: true });
  fs.writeFileSync(h.lock(slot), typeof record === 'string' ? record : JSON.stringify(record));
}
/** The pid of a process that has already exited. */
function deadPid() {
  const exited = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  return Number(exited.stdout);
}
const noWait = async () => { throw new Error('should not wait'); };

describe('host state directory and slot count', () => {
  it('uses NMG_SDLC_HOST_STATE_DIR, else ~/.nmg-sdlc', () => {
    expect(HOST_STATE_ENV).toBe('NMG_SDLC_HOST_STATE_DIR');
    expect(hostStateDir({ [HOST_STATE_ENV]: '/somewhere/else' })).toBe('/somewhere/else');
    expect(hostStateDir({})).toBe(path.join(os.homedir(), '.nmg-sdlc'));
    expect(hostStateDir({ [HOST_STATE_ENV]: '  ' })).toBe(path.join(os.homedir(), '.nmg-sdlc'));
    expect(hostStateDir()).toBe(fallbackHost);
  });

  it('reads heavyJobSlots from config.json', () => {
    expect(heavyPoolSize(host(1).env)).toBe(1);
    expect(heavyPoolSize(host(3).env)).toBe(3);
    expect(heavyPoolSize(host(200).env)).toBe(200);
  });

  it.each([
    ['zero', 0], ['a negative number', -2], ['a fraction', 1.5], ['a numeric string', '3'], ['an unsafe integer', 2 ** 53],
    ['null', null], ['true', true], ['a list', [2]],
  ])('falls back to one slot when heavyJobSlots is %s', (_name, value) => {
    expect(heavyPoolSize(host(value).env)).toBe(1);
  });

  it('falls back to one slot when the file, the key or the directory is missing or the file is not JSON', () => {
    const missingFile = host();
    expect(heavyPoolSize(missingFile.env)).toBe(1);
    fs.writeFileSync(path.join(missingFile.dir, 'config.json'), JSON.stringify({ other: 4 }));
    expect(heavyPoolSize(missingFile.env)).toBe(1);
    fs.writeFileSync(path.join(missingFile.dir, 'config.json'), '{broken');
    expect(heavyPoolSize(missingFile.env)).toBe(1);
    fs.writeFileSync(path.join(missingFile.dir, 'config.json'), 'null');
    expect(heavyPoolSize(missingFile.env)).toBe(1);
    expect(heavyPoolSize({ [HOST_STATE_ENV]: path.join(missingFile.dir, 'never-created') })).toBe(1);
  });

  it('no longer takes the size from the environment or from host.json', () => {
    const h = host();
    fs.writeFileSync(path.join(h.dir, 'host.json'), JSON.stringify({ heavyJobs: 4, heavyJobSlots: 4 }));
    expect(heavyPoolSize({ ...h.env, NMG_SDLC_HEAVY_JOBS: '4' })).toBe(1);
    expect(Object.hasOwn(pool, 'HEAVY_JOBS_ENV')).toBe(false);
  });
});

describe('acquireHeavySlot', () => {
  it('takes slot 1 by writing heavy-jobs/slot-1.lock with the holder record, and release removes it', async () => {
    const h = host(1);

    const held = await acquireHeavySlot({ label: 'unit suite', projectRoot: '/projects/a', env: h.env, now: () => 5_000, sleep: noWait });

    expect(held).toEqual({ slot: 1, slots: 1, waitedMs: 0, release: expect.any(Function) });
    expect(lockFiles(h)).toEqual(['slot-1.lock']);
    expect(readLock(h, 1)).toEqual({ schemaVersion: 1, pid: process.pid, label: 'unit suite', projectRoot: '/projects/a', startedAt: 5_000 });
    expect(fs.statSync(h.lock(1)).mode & 0o777).toBe(0o600);
    expect(held.release()).toBe(true);
    expect(held.release()).toBe(false);
    expect(lockFiles(h)).toEqual([]);
    // Nothing reached the process-default host directory.
    expect(fs.readdirSync(fallbackHost)).toEqual([]);
  });

  it('records the issue when one is given, and defaults the label and project root', async () => {
    const h = host(2);
    const first = await acquireHeavySlot({ label: 'suite (#42)', projectRoot: '/projects/a', issue: 42, env: h.env, now: () => 1 });
    const second = await acquireHeavySlot({ env: h.env, now: () => 2 });

    expect(readLock(h, 1)).toEqual({ schemaVersion: 1, pid: process.pid, label: 'suite (#42)', projectRoot: '/projects/a', issue: 42, startedAt: 1 });
    expect(readLock(h, 2)).toEqual({ schemaVersion: 1, pid: process.pid, label: 'heavy job', projectRoot: null, startedAt: 2 });
    first.release();
    second.release();
  });

  it('numbers slots from 1 to the slot count and fills the lowest free one', async () => {
    const h = host(3);
    const held = [];
    for (const label of ['one', 'two', 'three']) held.push(await acquireHeavySlot({ label, env: h.env, sleep: noWait }));

    expect(held.map(({ slot, slots }) => [slot, slots])).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(lockFiles(h)).toEqual(['slot-1.lock', 'slot-2.lock', 'slot-3.lock']);
    held[1].release();
    const again = await acquireHeavySlot({ label: 'four', env: h.env, sleep: noWait });
    expect(again.slot).toBe(2);
    for (const slot of [held[0], held[2], again]) slot.release();
    expect(lockFiles(h)).toEqual([]);
  });

  it('makes a second job wait until the slot is released and reports the wait', async () => {
    const h = host(1);
    const clock = { now: 1_000_000 };
    const first = await acquireHeavySlot({ label: 'suite A', projectRoot: '/a', env: h.env, now: () => clock.now });
    const sleeps = [];

    const second = await acquireHeavySlot({ label: 'suite B', projectRoot: '/b', env: h.env, now: () => clock.now,
      sleep: async (ms) => { sleeps.push(ms); clock.now += ms; if (sleeps.length === 3) first.release(); } });

    // The default poll interval is half a second.
    expect(sleeps).toEqual([500, 500, 500]);
    expect(second).toMatchObject({ slot: 1, waitedMs: 1500 });
    expect(readLock(h, 1)).toMatchObject({ label: 'suite B', projectRoot: '/b', startedAt: 1_001_500 });
    // The first holder's release was already used; it cannot free the second holder's slot.
    expect(first.release()).toBe(false);
    expect(lockFiles(h)).toEqual(['slot-1.lock']);
    expect(second.release()).toBe(true);
  });

  it('waits in real time too: the second acquirer gets the slot only after the release', async () => {
    const h = host(1);
    const first = await acquireHeavySlot({ label: 'suite A', env: h.env });
    let releasedAt = null;
    setTimeout(() => { releasedAt = Date.now(); first.release(); }, 120);

    const second = await acquireHeavySlot({ label: 'suite B', env: h.env, pollMs: 10 });

    expect(releasedAt).not.toBeNull();
    expect(second.waitedMs).toBeGreaterThan(0);
    expect(second.waitedMs).toBeGreaterThanOrEqual(100);
    expect(readLock(h, 1).startedAt).toBeGreaterThanOrEqual(releasedAt);
    second.release();
  });

  it('reclaims a slot whose holder process no longer exists, without waiting', async () => {
    const h = host(1);
    const gone = deadPid();
    writeLock(h, 1, { schemaVersion: 1, pid: gone, label: 'crashed suite', projectRoot: '/projects/crashed', startedAt: 1 });

    const next = await acquireHeavySlot({ label: 'next suite', projectRoot: '/projects/next', env: h.env, sleep: noWait });

    expect(next).toMatchObject({ slot: 1, waitedMs: 0 });
    expect(readLock(h, 1)).toMatchObject({ pid: process.pid, label: 'next suite', projectRoot: '/projects/next' });
    expect(lockFiles(h)).toEqual(['slot-1.lock']);
    next.release();
  });

  it('does not let a reclaimed holder free the slot of the job that took it over', async () => {
    const h = host(1);
    const stale = await acquireHeavySlot({ label: 'presumed dead', env: h.env, pid: 4_000_001, alive: () => true, now: () => 10 });
    const next = await acquireHeavySlot({ label: 'next', env: h.env, alive: (pid) => pid !== 4_000_001, now: () => 20, sleep: noWait });

    expect(stale.release()).toBe(false);
    expect(readLock(h, 1)).toMatchObject({ pid: process.pid, label: 'next', startedAt: 20 });
    expect(next.release()).toBe(true);
  });

  it('reclaims a lock file that holds no valid record', async () => {
    const h = host(1);
    writeLock(h, 1, { schemaVersion: 1, pid: process.pid, label: 'no start time' });

    const held = await acquireHeavySlot({ label: 'next', env: h.env, sleep: noWait });

    expect(readLock(h, 1)).toMatchObject({ label: 'next' });
    held.release();
  });

  it('waits on a lock file that is still being written, and reclaims one that stayed unreadable', async () => {
    const h = host(1);
    writeLock(h, 1, '');
    let polls = 0;
    const controller = new AbortController();

    await expect(acquireHeavySlot({ label: 'waiting', env: h.env, signal: controller.signal,
      sleep: async () => { polls += 1; if (polls === 2) controller.abort(); } })).rejects.toMatchObject({ reasonCode: 'cancelled' });
    expect(fs.readFileSync(h.lock(1), 'utf8')).toBe('');

    // The writer died before it recorded itself: after a grace period the slot is taken over.
    const old = new Date(Date.now() - 11_000);
    fs.utimesSync(h.lock(1), old, old);
    const held = await acquireHeavySlot({ label: 'next', env: h.env, sleep: noWait });
    expect(readLock(h, 1)).toMatchObject({ label: 'next', pid: process.pid });
    held.release();
  });

  it('rejects a wait that is cancelled and leaves the holder its slot', async () => {
    const h = host(1);
    const held = await acquireHeavySlot({ label: 'held', env: h.env });
    const controller = new AbortController();

    await expect(acquireHeavySlot({ label: 'waiting', env: h.env, signal: controller.signal, sleep: async () => controller.abort() }))
      .rejects.toMatchObject({ reasonCode: 'cancelled' });
    const already = new AbortController();
    already.abort();
    await expect(acquireHeavySlot({ label: 'never', env: host(1).env, signal: already.signal })).rejects.toMatchObject({ reasonCode: 'cancelled' });

    expect(readLock(h, 1)).toMatchObject({ label: 'held' });
    expect(held.release()).toBe(true);
  });
});

describe('heavyPoolHolders', () => {
  it('lists each holder with its slot and whether its process is alive, lowest slot first', async () => {
    const h = host(12);
    const gone = deadPid();
    writeLock(h, 10, { schemaVersion: 1, pid: process.pid, label: 'ten', projectRoot: '/projects/ten', startedAt: 30 });
    writeLock(h, 2, { schemaVersion: 1, pid: gone, label: 'crashed', projectRoot: '/projects/crashed', issue: 7, startedAt: 20, extra: 'ignored' });
    const first = await acquireHeavySlot({ label: 'one', projectRoot: '/projects/one', env: h.env, now: () => 10 });
    // Not holder records.
    writeLock(h, 3, '{broken');
    writeLock(h, 4, { schemaVersion: 2, pid: process.pid, label: 'future', startedAt: 1 });
    writeLock(h, 5, { schemaVersion: 1, pid: 0, label: 'no pid', startedAt: 1 });
    fs.writeFileSync(path.join(h.dir, 'heavy-jobs', 'slot-0.lock'), JSON.stringify({ schemaVersion: 1, pid: process.pid, label: 'zero', startedAt: 1 }));
    fs.writeFileSync(path.join(h.dir, 'heavy-jobs', 'slot-6.json'), JSON.stringify({ schemaVersion: 1, pid: process.pid, label: 'old name', startedAt: 1 }));
    fs.writeFileSync(path.join(h.dir, 'heavy-jobs', 'notes.txt'), 'ignored');

    expect(heavyPoolHolders({ env: h.env })).toEqual([
      { slot: 1, pid: process.pid, label: 'one', projectRoot: '/projects/one', startedAt: 10, alive: true },
      { slot: 2, pid: gone, label: 'crashed', projectRoot: '/projects/crashed', startedAt: 20, alive: false, issue: 7 },
      { slot: 10, pid: process.pid, label: 'ten', projectRoot: '/projects/ten', startedAt: 30, alive: true },
    ]);
    expect(heavyPoolHolders({ env: h.env, alive: () => false }).map(({ slot, alive }) => [slot, alive])).toEqual([[1, false], [2, false], [10, false]]);
    expect(heavyPoolList({ env: h.env })).toEqual({ slots: 12, holders: heavyPoolHolders({ env: h.env }) });
    first.release();
  });

  it('is empty before any job ran', () => {
    expect(heavyPoolHolders({ env: host(1).env })).toEqual([]);
    expect(heavyPoolList({ env: host().env })).toEqual({ slots: 1, holders: [] });
  });
});

describe('runHeavy', () => {
  it('holds a slot for the command, reports the slot on stderr and resolves to the exit status', async () => {
    const h = host(1);
    const cwd = temporary('nmg-sdlc-heavy-project-');
    const written = [];
    let during = null;

    const status = await runHeavy({ label: 'suite', program: process.execPath, args: ['-e', 'process.exit(3)'], cwd, env: { ...process.env, ...h.env },
      stderr: { write: (text) => { written.push(text); during = heavyPoolHolders({ env: h.env }); } } });

    expect(status).toBe(3);
    expect(written).toEqual(['NMG_SDLC_HEAVY_SLOT: {"slot":1,"slots":1,"waitedMs":0,"label":"suite"}\n']);
    expect(during).toMatchObject([{ slot: 1, label: 'suite', projectRoot: cwd, pid: process.pid, alive: true }]);
    expect(lockFiles(h)).toEqual([]);
  });

  it('resolves to 127 and frees the slot when the program cannot be started', async () => {
    const h = host(1);
    const stderr = { write: () => {} };
    expect(await runHeavy({ label: 'missing', program: path.join(h.dir, 'no-such-program'), args: [], env: { ...process.env, ...h.env }, stderr })).toBe(127);
    expect(await runHeavy({ label: 'throws', program: 'x', args: [], env: h.env, stderr, spawnCommand: () => { throw new Error('spawn failed'); } })).toBe(127);
    expect(lockFiles(h)).toEqual([]);
  });

  it('resolves to 1 when the command is killed by a signal', async () => {
    const h = host(1);
    const status = await runHeavy({ label: 'killed', program: process.execPath, args: ['-e', "process.kill(process.pid, 'SIGKILL')"],
      env: { ...process.env, ...h.env }, stderr: { write: () => {} } });
    expect(status).toBe(1);
    expect(lockFiles(h)).toEqual([]);
  });
});

describe('command line', () => {
  const cliEnv = (h) => ({ ...process.env, ...h.env });
  const cli = (h, args, options = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: cliEnv(h), ...options });
  /** Starts the CLI without waiting for it. Resolves to `{ code, stdout, stderr }`. */
  const start = (h, args, cwd) => new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd, env: cliEnv(h), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
  const slotLine = (stderr) => JSON.parse(/^NMG_SDLC_HEAVY_SLOT: (.*)$/m.exec(stderr)[1]);

  it('parses list and run, and rejects anything else', () => {
    expect(parseHeavyPoolCli(['list'])).toEqual({ action: 'list' });
    expect(parseHeavyPoolCli(['run', '--label', 'suite', '--', 'npm', 'test'])).toEqual({ action: 'run', label: 'suite', program: 'npm', args: ['test'] });
    expect(parseHeavyPoolCli(['run', '--', 'npm', 'run', 'test:all'])).toEqual({ action: 'run', label: 'npm run test:all', program: 'npm', args: ['run', 'test:all'] });
    // Everything after `--` belongs to the program.
    expect(parseHeavyPoolCli(['run', '--', 'tool', '--label', 'x', '--'])).toMatchObject({ program: 'tool', args: ['--label', 'x', '--'] });
    for (const argv of [[], ['status'], ['list', 'extra'], ['run'], ['run', 'npm', 'test'], ['run', '--label', 'x'], ['run', '--label', 'x', '--'], ['run', '--']]) {
      expect(() => parseHeavyPoolCli(argv)).toThrow('Usage: node scripts/sdlc-heavy-pool.mjs list | run [--label TEXT] -- <program> [args...]');
    }
  });

  it('exits 2 with usage for a malformed invocation', () => {
    const h = host(1);
    for (const args of [[], ['status'], ['run', 'node']]) {
      const result = cli(h, args);
      expect([args, result.status, result.stdout]).toEqual([args, 2, '']);
      expect(result.stderr).toContain('Usage: node scripts/sdlc-heavy-pool.mjs list | run');
    }
    expect(lockFiles(h)).toEqual([]);
  });

  it('list prints the slot count and every holder as JSON', () => {
    const h = host(2);
    const empty = cli(h, ['list']);
    expect([empty.status, empty.stderr]).toEqual([0, '']);
    expect(JSON.parse(empty.stdout)).toEqual({ slots: 2, holders: [] });

    const gone = deadPid();
    writeLock(h, 1, { schemaVersion: 1, pid: process.pid, label: 'suite (#42)', projectRoot: '/projects/a', issue: 42, startedAt: 111 });
    writeLock(h, 2, { schemaVersion: 1, pid: gone, label: 'crashed', projectRoot: '/projects/b', startedAt: 222 });

    const listed = cli(h, ['list']);
    expect(listed.status).toBe(0);
    expect(JSON.parse(listed.stdout)).toEqual({ slots: 2, holders: [
      { slot: 1, pid: process.pid, label: 'suite (#42)', projectRoot: '/projects/a', startedAt: 111, alive: true, issue: 42 },
      { slot: 2, pid: gone, label: 'crashed', projectRoot: '/projects/b', startedAt: 222, alive: false },
    ] });
    // Listing changes nothing.
    expect(lockFiles(h)).toEqual(['slot-1.lock', 'slot-2.lock']);
  });

  it('run executes the program without a shell while holding a slot, and exits with its status', () => {
    const h = host(1);
    const project = temporary('nmg-sdlc-heavy-project-');
    const seen = path.join(h.dir, 'seen.json');
    const program = `const fs=require('node:fs');
      fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ argv: process.argv.slice(1), cwd: process.cwd(),
        lock: JSON.parse(fs.readFileSync(${JSON.stringify(h.lock(1))}, 'utf8')) }));
      console.log('child output'); process.exit(7);`;

    const result = cli(h, ['run', '--label', 'x', '--', process.execPath, '-e', program, '$HOME; echo injected', 'two words'], { cwd: project });

    expect(result.status).toBe(7);
    expect(result.stdout).toBe('child output\n');
    expect(result.stderr).toMatch(/^NMG_SDLC_HEAVY_SLOT: \{"slot":1,"slots":1,"waitedMs":0,"label":"x"\}\n$/);
    const child = JSON.parse(fs.readFileSync(seen, 'utf8'));
    expect(child.argv).toEqual(['$HOME; echo injected', 'two words']);
    expect(child.cwd).toBe(project);
    // The slot was held, by the CLI process, for this project while the program ran.
    expect(child.lock).toEqual({ schemaVersion: 1, pid: expect.any(Number), label: 'x', projectRoot: project, startedAt: expect.any(Number) });
    expect(child.lock.pid).not.toBe(process.pid);
    expect(lockFiles(h)).toEqual([]);

    expect(cli(h, ['run', '--', process.execPath, '-e', '0']).status).toBe(0);
    const missing = cli(h, ['run', '--', path.join(h.dir, 'no-such-program')]);
    expect(missing.status).toBe(127);
    expect(lockFiles(h)).toEqual([]);
  });

  it('AC7: with one slot, two runs started from different project roots never overlap, the second waits, and a dead holder\'s lock is reclaimed', async () => {
    const h = host(1);
    const projects = [temporary('nmg-sdlc-heavy-project-a-'), temporary('nmg-sdlc-heavy-project-b-')];
    const log = path.join(h.dir, 'timeline.log');
    // The slot starts out held by a process that no longer exists.
    const gone = deadPid();
    writeLock(h, 1, { schemaVersion: 1, pid: gone, label: 'crashed suite', projectRoot: '/projects/crashed', startedAt: 1 });
    expect(JSON.parse(cli(h, ['list']).stdout)).toEqual({ slots: 1, holders: [
      { slot: 1, pid: gone, label: 'crashed suite', projectRoot: '/projects/crashed', startedAt: 1, alive: false },
    ] });
    const job = (name) => `const fs=require('node:fs');
      const lock=JSON.parse(fs.readFileSync(${JSON.stringify(h.lock(1))},'utf8'));
      fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ name: '${name}', event: 'start', at: Date.now(), cwd: process.cwd(), holder: lock.projectRoot, label: lock.label })+'\\n');
      const until=Date.now()+400; while(Date.now()<until){}
      fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ name: '${name}', event: 'end', at: Date.now() })+'\\n');`;

    const results = await Promise.all(['a', 'b'].map((name, index) => start(h, ['run', '--label', `heavy ${name}`, '--', process.execPath, '-e', job(name)], projects[index])));

    expect(results.map(({ code }) => code)).toEqual([0, 0]);
    const events = fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(events.map(({ event }) => event)).toEqual(['start', 'end', 'start', 'end']);
    // Never interleaved: the first job ends before the second starts.
    expect(events[1].name).toBe(events[0].name);
    expect(events[3].name).toBe(events[2].name);
    expect(events[2].name).not.toBe(events[0].name);
    expect(events[2].at).toBeGreaterThanOrEqual(events[1].at);
    // Each job ran in its own project while that project's run held the slot.
    for (const started of [events[0], events[2]]) {
      const index = started.name === 'a' ? 0 : 1;
      expect(started).toMatchObject({ cwd: projects[index], holder: projects[index], label: `heavy ${started.name}` });
    }
    // The first took the dead holder's slot at once; the second waited for the first.
    const slots = Object.fromEntries(results.map(({ stderr }) => slotLine(stderr)).map((line) => [line.label, line]));
    const [first, second] = [events[0].name, events[2].name].map((name) => slots[`heavy ${name}`]);
    expect(first).toMatchObject({ slot: 1, slots: 1 });
    expect(second).toMatchObject({ slot: 1, slots: 1 });
    expect(second.waitedMs).toBeGreaterThan(0);
    expect(second.waitedMs).toBeGreaterThan(first.waitedMs);
    expect(lockFiles(h)).toEqual([]);
    expect(JSON.parse(cli(h, ['list']).stdout)).toEqual({ slots: 1, holders: [] });
  });

  it('runs two jobs side by side when the host has two slots', async () => {
    const h = host(2);
    const log = path.join(h.dir, 'timeline.log');
    const job = (name) => `const fs=require('node:fs');
      fs.appendFileSync(${JSON.stringify(log)}, 'start ${name}\\n');
      const until=Date.now()+1200; while(Date.now()<until){}
      fs.appendFileSync(${JSON.stringify(log)}, 'end ${name}\\n');`;

    const results = await Promise.all(['a', 'b'].map((name) => start(h, ['run', '--label', name, '--', process.execPath, '-e', job(name)], h.dir)));

    expect(results.map(({ code }) => code)).toEqual([0, 0]);
    expect(results.map(({ stderr }) => slotLine(stderr).slot).sort()).toEqual([1, 2]);
    expect(results.map(({ stderr }) => slotLine(stderr).waitedMs)).toEqual([0, 0]);
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    expect(lines.slice(0, 2).sort()).toEqual(['start a', 'start b']);
  });
});
