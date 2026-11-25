import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  WORKTREES_DIR_ENV,
  ensureWorktree,
  fastForwardPrimary,
  findWorktree,
  isLinkedWorktree,
  listWorktrees,
  primaryCheckout,
  removeWorktree,
  specBranchName,
  worktreesRoot,
} from '../sdlc-worktree.mjs';

jest.setTimeout(60_000);

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tryGit(cwd, ...args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}
function git(cwd, ...args) {
  const result = tryGit(cwd, ...args);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}
function commitFile(cwd, file, content, message) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), content);
  git(cwd, 'add', '--', file);
  git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

/**
 * A bare remote, a seed checkout that pushes to it, and a clone (the primary checkout), all inside one per-test
 * root: worktrees live in `<clone>-wt/`, beside the clone, and are removed with the root.
 */
function repository({ files = {}, cloneOptions = [], beforeClone = () => {} } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-worktree-')));
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
  const repo = { root, remote, seed, cwd };
  beforeClone(repo);
  git(root, 'clone', ...cloneOptions, remote, cwd);
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'user.email', 'test@example.com');
  return repo;
}

function pushBranch(repo, branch) {
  git(repo.seed, 'checkout', '-b', branch);
  const head = commitFile(repo.seed, `${branch.replaceAll('/', '-')}.txt`, 'branch work\n', `work on ${branch}`);
  git(repo.seed, 'push', '-u', 'origin', branch);
  git(repo.seed, 'checkout', 'main');
  return head;
}

function advanceRemoteMain(repo) {
  const head = commitFile(repo.seed, 'later.txt', `later ${Date.now()}\n`, 'later default work');
  git(repo.seed, 'push', 'origin', 'main');
  return head;
}

function snapshot(cwd) {
  return {
    branch: git(cwd, 'branch', '--show-current'),
    head: git(cwd, 'rev-parse', 'HEAD'),
    status: tryGit(cwd, 'status', '--porcelain').stdout,
  };
}

function reason(action) {
  try { action(); } catch (error) { return error.reasonCode; }
  return null;
}

const record = (worktree) => JSON.parse(fs.readFileSync(path.join(worktree, '.nmg-sdlc/worktree.json'), 'utf8'));
const node = (source) => ({ program: process.execPath, args: ['-e', source] });
const manifest = (worktree) => ({ 'steering/manifest.json': `${JSON.stringify({ worktree })}\n` });

describe('ensureWorktree', () => {
  it('creates a worktree for a new branch from the freshly fetched remote default, leaving a dirty primary alone', () => {
    const repo = repository();
    const remoteMain = advanceRemoteMain(repo);
    fs.appendFileSync(path.join(repo.cwd, 'README.md'), 'uncommitted\n');
    fs.writeFileSync(path.join(repo.cwd, 'untracked.txt'), 'untracked\n');
    const before = snapshot(repo.cwd);
    expect(before.head).not.toBe(remoteMain);

    const result = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main', now: () => 1234 });

    const expected = `${repo.cwd}-wt/7`;
    expect(result).toEqual({
      path: expected,
      branch: '7-new-thing',
      created: true,
      setup: { ran: false, ok: true, summary: 'no worktree setup command declared' },
    });
    expect(snapshot(expected)).toEqual({ branch: '7-new-thing', head: remoteMain, status: '' });
    // A branch that does not exist on the remote yet has no upstream to track.
    expect(tryGit(expected, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}').status).not.toBe(0);
    expect(record(expected)).toEqual({ schemaVersion: 1, branch: '7-new-thing', createdAt: 1234, setup: result.setup });
    expect(snapshot(repo.cwd)).toEqual(before);
  });

  it('creates a worktree tracking an existing remote branch', () => {
    const repo = repository();
    const branchHead = pushBranch(repo, '7-new-thing');
    const before = snapshot(repo.cwd);

    const result = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });

    expect(result).toMatchObject({ path: `${repo.cwd}-wt/7`, created: true });
    expect(snapshot(result.path)).toEqual({ branch: '7-new-thing', head: branchHead, status: '' });
    expect(git(result.path, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')).toBe('origin/7-new-thing');
    expect(snapshot(repo.cwd)).toEqual(before);
  });

  it('tracks an existing remote branch from a single-branch clone by registering its fetch refspec', () => {
    const repo = repository({ cloneOptions: ['--single-branch'], beforeClone: (r) => pushBranch(r, '7-new-thing') });
    const branchHead = git(repo.remote, 'rev-parse', 'refs/heads/7-new-thing');

    const result = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });

    expect(git(result.path, 'rev-parse', 'HEAD')).toBe(branchHead);
    expect(git(result.path, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')).toBe('origin/7-new-thing');
    expect(git(repo.cwd, 'config', '--get-all', 'remote.origin.fetch').split('\n')).toEqual([
      '+refs/heads/main:refs/remotes/origin/main',
      'refs/heads/7-new-thing:refs/remotes/origin/7-new-thing',
    ]);
  });

  it('leaves the fetch refspecs of an ordinary clone alone', () => {
    const repo = repository({ beforeClone: (r) => pushBranch(r, '7-new-thing') });

    ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });

    expect(git(repo.cwd, 'config', '--get-all', 'remote.origin.fetch')).toBe('+refs/heads/*:refs/remotes/origin/*');
  });

  it('checks out an existing local branch and flattens a namespaced branch into one directory name', () => {
    const repo = repository();
    const localHead = git(repo.cwd, 'rev-parse', 'HEAD');
    advanceRemoteMain(repo);
    git(repo.cwd, 'branch', '--no-track', 'spec/7-new-thing', 'main');

    const result = ensureWorktree({ cwd: repo.cwd, branch: specBranchName('7-new-thing'), base: 'main' });

    expect(result).toMatchObject({ path: `${repo.cwd}-wt/spec-7`, branch: 'spec/7-new-thing', created: true });
    expect(snapshot(result.path)).toEqual({ branch: 'spec/7-new-thing', head: localHead, status: '' });
  });

  it('reuses the worktree of a branch, from the primary checkout or from any other worktree', () => {
    const repo = repository();
    const first = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main', now: () => 1 });
    fs.writeFileSync(path.join(first.path, 'in-progress.txt'), 'work\n');
    const other = ensureWorktree({ cwd: repo.cwd, branch: '8-other', base: 'main' });

    const second = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main', now: () => 2 });
    const third = ensureWorktree({ cwd: other.path, branch: '7-new-thing', base: 'main' });

    expect(second).toEqual({ ...first, created: false });
    expect(third).toEqual(second);
    expect(record(first.path).createdAt).toBe(1);
    expect(fs.existsSync(path.join(first.path, 'in-progress.txt'))).toBe(true);
    expect(listWorktrees(repo.cwd).map((worktree) => worktree.branch)).toEqual(['main', '7-new-thing', '8-other']);
    expect(other.path).toBe(`${repo.cwd}-wt/8`);
  });

  it('reuses a worktree that lives outside the worktrees directory', () => {
    const repo = repository();
    const elsewhere = path.join(repo.root, 'elsewhere');
    git(repo.cwd, 'worktree', 'add', '-b', '7-new-thing', elsewhere, 'origin/main');

    const result = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });

    expect(result).toMatchObject({ path: elsewhere, created: false });
    expect(fs.existsSync(`${repo.cwd}-wt`)).toBe(false);
  });

  it('honors the worktrees directory override', () => {
    const repo = repository();
    const override = path.join(repo.root, 'custom-worktrees');
    const env = { ...process.env, [WORKTREES_DIR_ENV]: override };

    expect(worktreesRoot(repo.cwd, { env })).toBe(override);
    expect(worktreesRoot(repo.cwd, { env: {} })).toBe(`${repo.cwd}-wt`);
    expect(ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main', env }).path).toBe(path.join(override, '7'));
  });

  it('throws worktree_setup_failed for an invalid manifest worktree declaration', () => {
    const repo = repository({ files: manifest({ setup: { program: 'sh', args: ['-c', 'true'] } }) });
    expect(reason(() => ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' }))).toBe('worktree_setup_failed');
  });

  it('fails with a reason code and leaves the primary alone', () => {
    const repo = repository();
    const before = snapshot(repo.cwd);
    fs.mkdirSync(`${repo.cwd}-wt/9`, { recursive: true });

    expect(reason(() => ensureWorktree({ cwd: repo.cwd, branch: '9-occupied', base: 'main' }))).toBe('worktree_path_occupied');
    expect(reason(() => ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'no-such-default' }))).toBe('default_branch_unreadable');
    expect(reason(() => ensureWorktree({ cwd: repo.cwd, branch: '', base: 'main' }))).toBe('worktree_arguments_invalid');
    expect(reason(() => ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing' }))).toBe('worktree_arguments_invalid');
    expect(reason(() => ensureWorktree({ cwd: repo.root, branch: '7-new-thing', base: 'main' }))).toBe('worktree_list_unreadable');
    const refuse = (command, args, options) => (args[0] === 'worktree' && args[1] === 'add'
      ? { status: 128, stdout: '', stderr: 'fatal: refused' } : spawnSync(command, args, { encoding: 'utf8', ...options }));
    expect(reason(() => ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main', run: refuse }))).toBe('worktree_create_failed');
    expect(snapshot(repo.cwd)).toEqual(before);
    expect(listWorktrees(repo.cwd)).toHaveLength(1);
  });
});

describe('removeWorktree', () => {
  it('runs teardown, then removes the worktree and its local branch', () => {
    const teardown = node("require('fs').writeFileSync('../teardown.log', process.cwd())");
    const repo = repository({ files: manifest({ teardown }) });
    const { path: worktree } = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });
    fs.writeFileSync(path.join(worktree, 'leftover.txt'), 'uncommitted\n');
    const before = snapshot(repo.cwd);

    // Asked from inside the worktree being removed.
    const result = removeWorktree({ cwd: worktree, branch: '7-new-thing' });

    expect(result).toEqual({ removed: true, lines: [], path: worktree });
    expect(fs.readFileSync(`${repo.cwd}-wt/teardown.log`, 'utf8')).toBe(worktree);
    expect(fs.existsSync(worktree)).toBe(false);
    expect(tryGit(repo.cwd, 'show-ref', '--verify', '--quiet', 'refs/heads/7-new-thing').status).not.toBe(0);
    expect(listWorktrees(repo.cwd)).toHaveLength(1);
    expect(snapshot(repo.cwd)).toEqual(before);
  });

  it('keeps the local branch when asked to', () => {
    const repo = repository();
    const { path: worktree } = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });

    expect(removeWorktree({ cwd: repo.cwd, branch: '7-new-thing', deleteBranch: false })).toEqual({ removed: true, lines: [], path: worktree });
    expect(fs.existsSync(worktree)).toBe(false);
    expect(tryGit(repo.cwd, 'show-ref', '--verify', '--quiet', 'refs/heads/7-new-thing').status).toBe(0);
  });

  it('still removes the worktree when teardown fails, and says so', () => {
    const repo = repository({ files: manifest({ teardown: node('process.exit(4)') }) });
    const { path: worktree } = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });

    const result = removeWorktree({ cwd: repo.cwd, branch: '7-new-thing' });

    expect(result.removed).toBe(true);
    expect(result.lines).toEqual([expect.stringMatching(/^worktree teardown failed: .* exited 4$/)]);
    expect(fs.existsSync(worktree)).toBe(false);
  });

  it('refuses the primary checkout', () => {
    const repo = repository();
    const before = snapshot(repo.cwd);

    const result = removeWorktree({ cwd: repo.cwd, branch: 'main' });

    expect(result).toEqual({ removed: false, lines: ['worktree cleanup skipped: branch is checked out in the primary checkout'] });
    expect(snapshot(repo.cwd)).toEqual(before);
    expect(fs.existsSync(path.join(repo.cwd, 'README.md'))).toBe(true);
  });

  it('never throws: no worktree, no repository, or a failing git', () => {
    const repo = repository();
    git(repo.cwd, 'branch', '--no-track', 'stray', 'main');
    ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });

    // A branch with no worktree only loses its local branch.
    expect(removeWorktree({ cwd: repo.cwd, branch: 'stray' })).toEqual({ removed: false, lines: [], path: null });
    expect(tryGit(repo.cwd, 'show-ref', '--verify', '--quiet', 'refs/heads/stray').status).not.toBe(0);
    expect(removeWorktree({ cwd: repo.cwd, branch: 'never-existed' })).toEqual({ removed: false, lines: [], path: null });
    expect(removeWorktree({ cwd: repo.root, branch: '7-new-thing' })).toEqual({
      removed: false, lines: ['worktree cleanup skipped: worktree_list_unreadable'],
    });
    const refuse = (command, args, options) => (args[0] === 'worktree' && args[1] === 'remove'
      ? { status: 1, stdout: '', stderr: 'locked' } : spawnSync(command, args, { encoding: 'utf8', ...options }));
    const kept = removeWorktree({ cwd: repo.cwd, branch: '7-new-thing', run: refuse });
    expect(kept.removed).toBe(false);
    expect(kept.lines).toEqual([`worktree cleanup skipped: could not remove ${repo.cwd}-wt/7`]);
    // The branch of a worktree that could not be removed is kept with it.
    expect(tryGit(repo.cwd, 'show-ref', '--verify', '--quiet', 'refs/heads/7-new-thing').status).toBe(0);
  });
});

describe('listWorktrees and isLinkedWorktree', () => {
  it('lists the primary checkout first, then linked worktrees, from any of them', () => {
    const repo = repository();
    const head = git(repo.cwd, 'rev-parse', 'HEAD');
    const { path: worktree } = ensureWorktree({ cwd: repo.cwd, branch: 'spec/7-new-thing', base: 'main' });
    const detached = path.join(repo.root, 'detached');
    git(repo.cwd, 'worktree', 'add', '--detach', detached, 'origin/main');

    const expected = [
      { path: repo.cwd, head, branch: 'main', detached: false, primary: true },
      { path: worktree, head, branch: 'spec/7-new-thing', detached: false, primary: false },
      { path: detached, head, branch: null, detached: true, primary: false },
    ];
    expect(listWorktrees(repo.cwd)).toEqual(expected);
    expect(listWorktrees(worktree)).toEqual(expected);
    expect(primaryCheckout(worktree)).toBe(repo.cwd);
    expect(findWorktree(worktree, 'main')).toEqual(expected[0]);
    expect(findWorktree(repo.cwd, (branch) => branch.startsWith('spec/'))).toEqual(expected[1]);
    expect(findWorktree(repo.cwd, 'absent')).toBeNull();
  });

  it('tells a linked worktree from the primary checkout', () => {
    const repo = repository();
    const { path: worktree } = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });
    fs.mkdirSync(path.join(worktree, 'nested'));

    expect(isLinkedWorktree(repo.cwd)).toBe(false);
    expect(isLinkedWorktree(worktree)).toBe(true);
    expect(isLinkedWorktree(path.join(worktree, 'nested'))).toBe(true);
    expect(isLinkedWorktree(repo.root)).toBe(false);
    expect(reason(() => listWorktrees(repo.root))).toBe('worktree_list_unreadable');
  });
});

describe('fastForwardPrimary', () => {
  it('moves a primary that is on the default branch and behind, also when asked from a worktree', () => {
    const repo = repository();
    const { path: worktree } = ensureWorktree({ cwd: repo.cwd, branch: '7-new-thing', base: 'main' });
    const first = advanceRemoteMain(repo);

    expect(fastForwardPrimary({ cwd: repo.cwd, base: 'main' })).toBe(true);
    expect(snapshot(repo.cwd)).toEqual({ branch: 'main', head: first, status: '' });
    expect(fastForwardPrimary({ cwd: repo.cwd, base: 'main' })).toBe(false);

    const worktreeHead = git(worktree, 'rev-parse', 'HEAD');
    const second = advanceRemoteMain(repo);
    expect(fastForwardPrimary({ cwd: worktree, base: 'main' })).toBe(true);
    expect(git(repo.cwd, 'rev-parse', 'HEAD')).toBe(second);
    expect(git(worktree, 'rev-parse', 'HEAD')).toBe(worktreeHead);
  });

  it('keeps unrelated uncommitted work in the primary while moving it', () => {
    const repo = repository();
    fs.writeFileSync(path.join(repo.cwd, 'untracked.txt'), 'mine\n');
    const remoteMain = advanceRemoteMain(repo);

    expect(fastForwardPrimary({ cwd: repo.cwd, base: 'main' })).toBe(true);
    expect(snapshot(repo.cwd)).toEqual({ branch: 'main', head: remoteMain, status: '?? untracked.txt\n' });
  });

  it('returns false and moves nothing when the primary is not on the default branch, has diverged, or is no repository', () => {
    const repo = repository();
    advanceRemoteMain(repo);
    git(repo.cwd, 'checkout', '-b', 'feature');
    const onFeature = snapshot(repo.cwd);

    expect(fastForwardPrimary({ cwd: repo.cwd, base: 'main' })).toBe(false);
    expect(snapshot(repo.cwd)).toEqual(onFeature);
    expect(git(repo.cwd, 'rev-parse', 'main')).toBe(onFeature.head);

    git(repo.cwd, 'checkout', 'main');
    const diverged = commitFile(repo.cwd, 'local.txt', 'local\n', 'local commit');
    expect(fastForwardPrimary({ cwd: repo.cwd, base: 'main' })).toBe(false);
    expect(git(repo.cwd, 'rev-parse', 'HEAD')).toBe(diverged);

    expect(fastForwardPrimary({ cwd: repo.root, base: 'main' })).toBe(false);
  });
});
