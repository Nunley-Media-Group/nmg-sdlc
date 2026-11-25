import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readManifestOptions } from '../../src/sdlc-steering-runtime.mjs';
import { ensureWorktree, removeWorktree } from '../sdlc-worktree.mjs';

jest.setTimeout(60_000);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A bare remote, a seed checkout that pushes to it, and a clone (the primary checkout), all inside one per-test root. */
function repository({ files = {} } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-worktree-rerun-')));
  roots.push(root);
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const cwd = path.join(root, 'clone');
  fs.mkdirSync(seed);
  git(root, 'init', '--bare', remote);
  git(seed, 'init', '-b', 'main');
  git(seed, 'config', 'user.name', 'Test');
  git(seed, 'config', 'user.email', 'test@example.com');
  for (const [file, content] of Object.entries({ 'README.md': 'main\n', '.gitignore': '.nmg-sdlc/\n', ...files })) {
    fs.mkdirSync(path.dirname(path.join(seed, file)), { recursive: true });
    fs.writeFileSync(path.join(seed, file), content);
  }
  git(seed, 'add', '-A');
  git(seed, 'commit', '-m', 'main');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-u', 'origin', 'main');
  git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(root, 'clone', remote, cwd);
  return { cwd };
}

const record = (worktree) => JSON.parse(recordText(worktree));
const recordText = (worktree) => fs.readFileSync(path.join(worktree, '.nmg-sdlc/worktree.json'), 'utf8');
const node = (source) => ({ program: process.execPath, args: ['-e', source] });
const manifest = (worktree) => ({ 'steering/manifest.json': `${JSON.stringify({ worktree })}\n` });
const log = (worktree) => (fs.existsSync(path.join(worktree, 'setup.log')) ? fs.readFileSync(path.join(worktree, 'setup.log'), 'utf8') : '');

/** Declares `setup` in the manifest inside an existing worktree, as a steering change made there would. */
function declare(worktree, setup) {
  fs.mkdirSync(path.join(worktree, 'steering'), { recursive: true });
  fs.writeFileSync(path.join(worktree, 'steering/manifest.json'), `${JSON.stringify({ worktree: { setup } })}\n`);
}

describe('worktree setup declared for this repository and rerun on reuse (#620)', () => {
  it('@SCN001 declares npm ci in scripts as this repository worktree setup, and the manifest validates', () => {
    expect(readManifestOptions(repoRoot).worktree.setup).toEqual({ program: 'npm', args: ['ci'], cwd: 'scripts' });
  });

  it('@SCN002 runs a setup command declared after the worktree was created without one, and records the command that ran', () => {
    const repo = repository();
    const created = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main', now: () => 1 });
    expect(record(created.path).setup).toEqual({ ran: false, ok: true, summary: 'no worktree setup command declared' });

    const setup = node("require('fs').appendFileSync('setup.log', 'ran\\n')");
    declare(created.path, setup);
    const reused = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });

    expect(reused).toMatchObject({ path: created.path, created: false, setup: { ran: true, ok: true } });
    expect(reused.setup.command).toEqual({ program: process.execPath, args: setup.args, cwd: '.', env: [] });
    expect(log(created.path)).toBe('ran\n');
    expect(record(created.path).setup).toEqual(reused.setup);
  });

  it('@SCN003 runs a setup command that replaced the recorded one once on reuse, and records the new command', () => {
    const original = node("require('fs').appendFileSync('setup.log', 'a\\n')");
    const replacement = node("require('fs').appendFileSync('setup.log', 'b\\n')");
    const repo = repository({ files: manifest({ setup: original }) });
    const first = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });
    declare(first.path, replacement);

    const second = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });
    const third = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });

    expect(second).toMatchObject({ created: false, setup: { ran: true, ok: true } });
    expect(record(first.path).setup.command.args).toEqual(replacement.args);
    expect(log(first.path)).toBe('a\nb\n');
    expect(third).toEqual(second);
  });

  it('@SCN004 does not run an unchanged successful setup again on reuse, and leaves the record unchanged', () => {
    const setup = node("require('fs').appendFileSync('setup.log', 'x\\n')");
    const repo = repository({ files: manifest({ setup }) });
    const first = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });
    const before = recordText(first.path);

    const second = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });

    expect(second).toEqual({ ...first, created: false });
    expect(log(first.path)).toBe('x\n');
    expect(recordText(first.path)).toBe(before);
  });

  it('@SCN005 runs neither setup nor teardown for a spec worktree on create, reuse, or removal', () => {
    const setup = node("require('fs').appendFileSync('../setup.log', 'setup\\n')");
    const teardown = node("require('fs').appendFileSync('../teardown.log', 'teardown\\n')");
    const repo = repository({ files: manifest({ setup, teardown }) });
    const spec = 'spec/7-new-thing';

    const created = ensureWorktree({ cwd: repo.cwd, branch: spec, base: 'main' });

    expect(created.setup).toEqual({ ran: false, ok: true, summary: 'spec worktree: setup not run' });
    expect(record(created.path).setup).toEqual(created.setup);
    expect(ensureWorktree({ cwd: repo.cwd, branch: spec, base: 'main' })).toEqual({ ...created, created: false });
    expect(removeWorktree({ cwd: repo.cwd, branch: spec })).toEqual({ removed: true, lines: [], path: created.path });
    expect(fs.existsSync(`${repo.cwd}-wt/setup.log`)).toBe(false);
    expect(fs.existsSync(`${repo.cwd}-wt/teardown.log`)).toBe(false);
  });

  it('@SCN005 fails an issue worktree whose setup fails with worktree_setup_failed, and runs setup again on the next reuse', () => {
    const setup = node("const fs = require('fs'); fs.appendFileSync('setup.log', 'x\\n'); if (!fs.existsSync('fixed')) { console.error('dependency install broke'); process.exit(3); }");
    const repo = repository({ files: manifest({ setup }) });
    const worktree = `${repo.cwd}-wt/7`;

    let failure = null;
    try { ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' }); } catch (error) { failure = error; }

    expect(failure?.reasonCode).toBe('worktree_setup_failed');
    expect(failure.message).toContain('exited 3');
    expect(failure.message).toContain('dependency install broke');
    expect(record(worktree).setup).toMatchObject({ ran: true, ok: false });

    fs.writeFileSync(path.join(worktree, 'fixed'), '');
    const reused = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });

    expect(reused).toMatchObject({ path: worktree, created: false, setup: { ran: true, ok: true } });
    expect(log(worktree)).toBe('x\nx\n');
    expect(ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' })).toEqual(reused);
    expect(log(worktree)).toBe('x\nx\n');
  });

  it.each(['references/steering-schema.md', 'README.md'])('@SCN006 %s says when setup reruns on a reused issue worktree', (file) => {
    expect(fs.readFileSync(path.join(repoRoot, file), 'utf8')).toContain(
      'On a reused issue worktree, setup runs again when the recorded setup failed, ran no command while one is now declared, or ran a different command than the one now declared.',
    );
  });
});
