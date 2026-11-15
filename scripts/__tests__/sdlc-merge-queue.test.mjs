import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as queueModule from '../sdlc-merge-queue.mjs';
import * as sharedState from '../sdlc-shared-state.mjs';

jest.setTimeout(60_000);

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-merge-queue.mjs');
const USAGE = 'Usage: node scripts/sdlc-merge-queue.mjs list | position --issue N | enqueue --issue N --branch B [--worktree DIR] | dequeue --issue N\n';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}
function temporary(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}
/** A repository with one commit; the queue file is `<git-common-dir>/nmg-sdlc/merge-queue.json`. */
function repository() {
  const root = temporary('nmg-sdlc-merge-queue-');
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'chore: baseline');
  const commonDir = path.resolve(root, git(root, 'rev-parse', '--git-common-dir'));
  return { root, queueFile: path.join(commonDir, 'nmg-sdlc', 'merge-queue.json') };
}
/** The command as a real child process of this test process, which is therefore the owner `enqueue` records. */
function cli(cwd, ...args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* usage errors print no JSON */ }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json };
}
const stored = (queueFile) => JSON.parse(fs.readFileSync(queueFile, 'utf8'));
/** The pid of a process that has already exited. */
function deadPid() {
  const child = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
  expect(child.status).toBe(0);
  expect(sharedState.processAlive(child.pid)).toBe(false);
  return child.pid;
}

describe('sdlc-merge-queue.mjs command line', () => {
  it('re-exports the shared-state queue functions', () => {
    expect(queueModule.enterMergeQueue).toBe(sharedState.enterMergeQueue);
    expect(queueModule.leaveMergeQueue).toBe(sharedState.leaveMergeQueue);
    expect(queueModule.listMergeQueue).toBe(sharedState.listMergeQueue);
  });

  it('lists an empty queue without writing a queue file', () => {
    const { root, queueFile } = repository();

    const listed = cli(root, 'list');

    expect(listed).toMatchObject({ status: 0, stderr: '', json: { ok: true, entries: [] } });
    expect(listed.stdout).toBe(`${JSON.stringify({ ok: true, entries: [] }, null, 2)}\n`);
    expect(fs.existsSync(queueFile)).toBe(false);
    expect(cli(root, 'position', '--issue', '7').json).toEqual({ ok: true, issue: 7, queued: false, position: null, head: false });
    // Reading the queue creates nothing, not even the shared-state directory.
    expect(fs.existsSync(path.dirname(queueFile))).toBe(false);
    expect(cli(root, 'dequeue', '--issue', '7')).toMatchObject({ status: 0, json: { ok: true, issue: 7, removed: false } });
    expect(fs.existsSync(queueFile)).toBe(false);
  });

  it('enqueues issues first in, first out, owned by the calling session, in <git-common-dir>/nmg-sdlc/merge-queue.json', () => {
    const { root, queueFile } = repository();
    const elsewhere = path.join(root, 'elsewhere');

    const first = cli(root, 'enqueue', '--issue', '7', '--branch', '7-first');
    const second = cli(root, 'enqueue', '--issue', '#9', '--branch', '9-second', '--worktree', elsewhere);

    expect(first).toMatchObject({ status: 0, stderr: '', json: { ok: true, issue: 7, position: 1, head: true, ahead: [] } });
    expect(second).toMatchObject({ status: 0, stderr: '', json: { ok: true, issue: 9, position: 2, head: false, ahead: [7] } });
    const queue = stored(queueFile);
    expect(queue).toEqual({ schemaVersion: 1, entries: [
      // The owner is the command's parent (this test process), not the short-lived command itself.
      { issue: 7, branch: '7-first', worktree: root, session: null, pid: process.pid, enqueuedAt: expect.any(Number) },
      { issue: 9, branch: '9-second', worktree: elsewhere, session: null, pid: process.pid, enqueuedAt: expect.any(Number) },
    ] });
    expect(queue.entries[0].enqueuedAt).toBeLessThanOrEqual(queue.entries[1].enqueuedAt);
    // No lock or temporary file is left beside the queue.
    expect(fs.readdirSync(path.dirname(queueFile))).toEqual(['merge-queue.json']);

    const listed = cli(root, 'list');
    expect(listed).toMatchObject({ status: 0, stderr: '' });
    expect(listed.json).toEqual({ ok: true, entries: [
      { ...queue.entries[0], position: 1, alive: true },
      { ...queue.entries[1], position: 2, alive: true },
    ] });
    // Listing and reading a position leave the file as it was.
    expect(cli(root, 'position', '--issue', '7').json).toEqual({ ok: true, issue: 7, queued: true, position: 1, head: true });
    expect(cli(root, 'position', '--issue', '#9').json).toEqual({ ok: true, issue: 9, queued: true, position: 2, head: false });
    expect(cli(root, 'position', '--issue', '11').json).toEqual({ ok: true, issue: 11, queued: false, position: null, head: false });
    expect(stored(queueFile)).toEqual(queue);
  });

  it('keeps an issue its position when it is enqueued again, taking the new branch and worktree', () => {
    const { root, queueFile } = repository();
    cli(root, 'enqueue', '--issue', '7', '--branch', '7-first');
    cli(root, 'enqueue', '--issue', '9', '--branch', '9-second');
    const before = stored(queueFile);

    const again = cli(root, 'enqueue', '--issue', '9', '--branch', '9-renamed', '--worktree', path.join(root, 'moved'));
    const head = cli(root, 'enqueue', '--issue', '7', '--branch', '7-first');

    expect(again.json).toEqual({ ok: true, issue: 9, position: 2, head: false, ahead: [7] });
    expect(head.json).toEqual({ ok: true, issue: 7, position: 1, head: true, ahead: [] });
    expect(stored(queueFile).entries).toEqual([
      before.entries[0],
      { ...before.entries[1], branch: '9-renamed', worktree: path.join(root, 'moved') },
    ]);
  });

  it('dequeues an issue, moving the next one to the head, and reports when there was nothing to remove', () => {
    const { root, queueFile } = repository();
    cli(root, 'enqueue', '--issue', '7', '--branch', '7-first');
    cli(root, 'enqueue', '--issue', '9', '--branch', '9-second');
    cli(root, 'enqueue', '--issue', '11', '--branch', '11-third');

    const removed = cli(root, 'dequeue', '--issue', '7');

    expect(removed).toMatchObject({ status: 0, stderr: '', json: { ok: true, issue: 7, removed: true } });
    expect(stored(queueFile).entries.map((entry) => entry.issue)).toEqual([9, 11]);
    expect(cli(root, 'position', '--issue', '9').json).toMatchObject({ queued: true, position: 1, head: true });
    expect(cli(root, 'position', '--issue', '11').json).toMatchObject({ queued: true, position: 2, head: false });
    expect(cli(root, 'position', '--issue', '7').json).toMatchObject({ queued: false, position: null, head: false });
    expect(cli(root, 'dequeue', '--issue', '7')).toMatchObject({ status: 0, json: { ok: true, issue: 7, removed: false } });
    // A dequeued issue that enters again goes to the tail.
    expect(cli(root, 'enqueue', '--issue', '7', '--branch', '7-first').json).toEqual({ ok: true, issue: 7, position: 3, head: false, ahead: [9, 11] });
  });

  it('lists an entry whose owner is dead without removing it, and drops it on the next enqueue', () => {
    const { root, queueFile } = repository();
    const dead = deadPid();
    sharedState.enterMergeQueue(root, { issue: 7, branch: '7-crashed', worktree: root, pid: dead });
    cli(root, 'enqueue', '--issue', '9', '--branch', '9-second');
    expect(stored(queueFile).entries.map((entry) => [entry.issue, entry.pid])).toEqual([[9, process.pid]]);

    // The crashed session's entry is written back at the head, as a queue file left on disk would have it.
    const live = stored(queueFile).entries[0];
    const crashed = { issue: 7, branch: '7-crashed', worktree: root, session: null, pid: dead, enqueuedAt: live.enqueuedAt - 1 };
    fs.writeFileSync(queueFile, `${JSON.stringify({ schemaVersion: 1, entries: [crashed, live] }, null, 2)}\n`);
    const raw = fs.readFileSync(queueFile, 'utf8');

    expect(cli(root, 'list').json.entries.map(({ issue, position, alive }) => ({ issue, position, alive }))).toEqual([
      { issue: 7, position: 1, alive: false }, { issue: 9, position: 2, alive: true },
    ]);
    expect(cli(root, 'position', '--issue', '9').json).toMatchObject({ position: 2, head: false });
    expect(fs.readFileSync(queueFile, 'utf8')).toBe(raw);

    const entered = cli(root, 'enqueue', '--issue', '11', '--branch', '11-third');

    expect(entered.json).toEqual({ ok: true, issue: 11, position: 2, head: false, ahead: [9] });
    expect(stored(queueFile).entries.map((entry) => entry.issue)).toEqual([9, 11]);
    expect(cli(root, 'position', '--issue', '9').json).toMatchObject({ position: 1, head: true });
  });

  it('is one queue for the primary checkout, a subdirectory and a linked worktree', () => {
    const { root, queueFile } = repository();
    const linked = `${root}-linked`;
    roots.push(linked);
    git(root, 'worktree', 'add', '--quiet', '-b', '9-second', linked);
    fs.mkdirSync(path.join(root, 'src'));

    expect(cli(path.join(root, 'src'), 'enqueue', '--issue', '7', '--branch', '7-first').json).toMatchObject({ position: 1 });
    const fromLinked = cli(linked, 'enqueue', '--issue', '9', '--branch', '9-second');

    expect(fromLinked.json).toEqual({ ok: true, issue: 9, position: 2, head: false, ahead: [7] });
    // The worktree defaults to the directory the command ran in.
    expect(stored(queueFile).entries.map(({ issue, worktree }) => [issue, worktree])).toEqual([[7, path.join(root, 'src')], [9, fs.realpathSync(linked)]]);
    expect(fs.existsSync(path.join(linked, '.git', 'nmg-sdlc'))).toBe(false);
    expect(cli(linked, 'list').json.entries.map((entry) => entry.issue)).toEqual([7, 9]);
    expect(cli(root, 'dequeue', '--issue', '9').json).toMatchObject({ removed: true });
    expect(cli(linked, 'position', '--issue', '9').json).toMatchObject({ queued: false });
  });

  it.each([
    ['no command', []],
    ['an unknown command', ['peek']],
    ['list with an argument', ['list', 'all']],
    ['list with an option', ['list', '--issue', '7']],
    ['position without an issue', ['position']],
    ['position for issue zero', ['position', '--issue', '0']],
    ['a non-numeric issue', ['dequeue', '--issue', 'seven']],
    ['enqueue without a branch', ['enqueue', '--issue', '7']],
    ['enqueue without an issue', ['enqueue', '--branch', '7-first']],
    ['an option without a value', ['enqueue', '--issue', '7', '--branch']],
    ['an option given twice', ['enqueue', '--issue', '7', '--issue', '9', '--branch', '7-first']],
    ['an unknown option', ['enqueue', '--issue', '7', '--branch', '7-first', '--pid', '1']],
  ])('exits 2 with the usage line and changes nothing on %s', (_case, args) => {
    const { root, queueFile } = repository();
    cli(root, 'enqueue', '--issue', '5', '--branch', '5-held');
    const raw = fs.readFileSync(queueFile, 'utf8');

    expect(cli(root, ...args)).toMatchObject({ status: 2, stdout: '', stderr: USAGE });
    expect(fs.readFileSync(queueFile, 'utf8')).toBe(raw);
  });

  it('exits 1 with merge_queue_unreadable outside a git repository', () => {
    const outside = temporary('nmg-sdlc-merge-queue-outside-');
    // The temporary directory must not sit inside some enclosing repository for this to mean anything.
    expect(spawnSync('git', ['rev-parse', '--git-dir'], { cwd: outside, encoding: 'utf8' }).status).not.toBe(0);

    const listed = cli(outside, 'list');

    expect(listed).toMatchObject({ status: 1, stderr: '' });
    expect(listed.json).toEqual({ ok: false, reasonCode: 'merge_queue_unreadable', summary: 'git_common_dir_unreadable' });
    expect(cli(outside, 'enqueue', '--issue', '7', '--branch', '7-first')).toMatchObject({ status: 1, json: { ok: false, reasonCode: 'merge_queue_unreadable' } });
    expect(fs.readdirSync(outside)).toEqual([]);
  });
});
