import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { slugFromTitle, startIssue } from '../start-issue.mjs';

const roots = [];
const SCRIPT = fileURLToPath(new URL('../start-issue.mjs', import.meta.url));
const FAKE_HEAD = '0123456789abcdef0123456789abcdef01234567';
// Real repositories, clones and worktrees are slower than the default five seconds allows on a loaded machine.
jest.setTimeout(60_000);
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

/** Runs a setup git command that must succeed and returns its trimmed stdout. */
function git(cwd, ...args) {
  const result = runGit(cwd, args);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A per-test root directory. Worktrees live beside the clone, so everything is created inside it and removed with it. */
function tempRoot() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-start-controller-')));
  roots.push(root);
  return root;
}

function commitFile(cwd, file, content, message) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), content);
  git(cwd, 'add', '-f', '--', file);
  git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

/** A bare remote whose `main` holds one commit, and the seed checkout that pushes to it. `cwd` is where the clone goes. */
function seedRemote({ files = {} } = {}) {
  const root = tempRoot();
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  fs.mkdirSync(seed);
  git(root, 'init', '--bare', remote);
  git(seed, 'init', '-b', 'main');
  git(seed, 'config', 'user.name', 'Test');
  git(seed, 'config', 'user.email', 'test@example.com');
  for (const [file, content] of Object.entries({ 'README.md': 'main\n', '.gitignore': '.nmg-sdlc/\n', ...files })) {
    fs.mkdirSync(path.dirname(path.join(seed, file)), { recursive: true });
    fs.writeFileSync(path.join(seed, file), content);
    git(seed, 'add', '-f', '--', file);
  }
  git(seed, 'commit', '-m', 'main');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-u', 'origin', 'main');
  git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  return { root, remote, seed, cwd: path.join(root, 'clone') };
}

function cloneRepo(repo, ...options) {
  git(repo.root, 'clone', ...options, repo.remote, repo.cwd);
  git(repo.cwd, 'config', 'user.name', 'Test');
  git(repo.cwd, 'config', 'user.email', 'test@example.com');
  return repo;
}

/** Pushes an issue branch holding one commit beyond `main` from the seed, and returns that commit. */
function pushIssueBranch(repo, branch = '42-ship-it') {
  git(repo.seed, 'checkout', '-b', branch);
  const head = commitFile(repo.seed, 'spec.txt', 'approved\n', 'spec');
  git(repo.seed, 'push', '-u', 'origin', branch);
  git(repo.seed, 'checkout', 'main');
  return head;
}

function snapshot(cwd) {
  return {
    branch: git(cwd, 'branch', '--show-current'),
    head: git(cwd, 'rev-parse', 'HEAD'),
    status: runGit(cwd, ['status', '--porcelain']).stdout,
  };
}

/**
 * A `run` for a real repository: git (and any worktree setup command) really runs, in the directory the controller
 * asks for, while `gh` is answered from canned data. `develop` is what `gh issue develop` does: 'push' creates the
 * remote branch, 'push-then-fail' creates it and reports failure, 'fail' creates nothing. `extra` may answer any
 * command first.
 */
function realRun(repo, { titles = { 42: 'Ship It!' }, develop = 'push', extra = () => undefined } = {}) {
  const calls = [];
  const run = (command, args, options) => {
    calls.push([command, ...args]);
    const override = extra(command, args, options);
    if (override) return override;
    if (command === 'git') return runGit(options?.cwd ?? repo.cwd, args);
    if (command !== 'gh') return spawnSync(command, args, { encoding: 'utf8', ...options });
    const ok = (stdout) => ({ status: 0, stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout), stderr: '' });
    if (args[0] === 'issue' && args[1] === 'view') {
      const number = Number(args[2]);
      return ok({ number, title: titles[number], body: '', labels: [], state: 'OPEN' });
    }
    if (args[0] === 'issue' && args[1] === 'develop') {
      if (develop !== 'fail') git(repo.remote, 'branch', args[args.indexOf('--name') + 1], args[args.indexOf('--base') + 1]);
      return { status: develop === 'push' ? 0 : 1, stdout: '', stderr: '' };
    }
    if (args[0] === 'repo' && args.includes('nameWithOwner')) return ok({ nameWithOwner: 'nmg/repo' });
    if (args[0] === 'repo' && args.includes('defaultBranchRef')) return ok('main\n');
    if (args[0] === 'repo') return ok({ owner: { login: 'nmg' }, name: 'repo' });
    if (args[0] === 'api' && args.includes('--paginate')) return ok('[[]]');
    if (args[0] === 'api' && /^repos\/nmg\/repo\/issues\/\d+$/.test(args[1] || '')) {
      const number = Number(args[1].split('/').at(-1));
      return ok({
        id: number * 100, number, state: 'open', title: titles[number],
        repository_url: 'https://api.github.com/repos/nmg/repo',
      });
    }
    if (args[0] === 'api') return ok({ data: { repository: { issue: { projectItems: { nodes: [] } } } } });
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };
  return { run, calls };
}

const developed = (calls) => calls.filter((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop');
const unsafe = (calls) => calls.some((call) => call.includes('--force') || call.includes('--reset')
  || (call[0] === 'git' && ['checkout', 'switch', 'stash'].includes(call[1])));

/** A fully canned `run` for the paths that never reach a worktree: failures before branch work, and a checkout that is already on the issue branch. */
function fixture({
  issueStatus = 0,
  issue = { number: 42, title: 'Ship It!', body: '', labels: [], state: 'OPEN' },
  parentStatus = 0,
  parentState = 'CLOSED',
  branch = 'main',
  defaultStatus = 0,
  defaultBranch = 'main',
  remoteBranch = false,
  projectThrows = false,
} = {}) {
  const cwd = tempRoot();
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args[2] === '42' && args.includes('number,title,body,labels,state')) {
      return { status: issueStatus, stdout: issueStatus === 0 ? JSON.stringify(issue) : '', stderr: '' };
    }
    if (command === 'gh' && args[0] === 'repo' && args.includes('nameWithOwner')) {
      return { status: 0, stdout: '{"nameWithOwner":"nmg/repo"}', stderr: '' };
    }
    if (command === 'gh' && args[0] === 'api' && args.includes('--paginate')) {
      if (parentStatus !== 0) return { status: parentStatus, stdout: '', stderr: 'dependency unavailable' };
      const endpoint = args.find((arg) => /dependencies\/blocked_by$/.test(arg));
      const dependencyIssue = Number(endpoint.match(/issues\/(\d+)/)[1]);
      const blockers = dependencyIssue === 42
        ? [{
          id: 700,
          number: 7,
          state: String(parentState).toLowerCase(),
          title: 'Prerequisite',
          repository_url: 'https://api.github.com/repos/nmg/repo',
        }]
        : [];
      return { status: 0, stdout: JSON.stringify([blockers]), stderr: '' };
    }
    if (command === 'gh' && args[0] === 'api' && /^repos\/nmg\/repo\/issues\/\d+$/.test(args[1] || '')) {
      const number = Number(args[1].split('/').at(-1));
      return {
        status: 0,
        stdout: JSON.stringify({
          id: number * 100,
          number,
          state: number === 42 ? 'open' : String(parentState).toLowerCase(),
          title: number === 42 ? issue.title : 'Prerequisite',
          repository_url: 'https://api.github.com/repos/nmg/repo',
        }),
        stderr: '',
      };
    }
    if (command === 'git' && args[0] === 'fetch') {
      const isDefault = args.includes(`refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`);
      return { status: isDefault || remoteBranch ? 0 : 1, stdout: '', stderr: '' };
    }
    if (command === 'git' && ['merge-base', 'merge', 'push'].includes(args[0])) return { status: 0, stdout: '', stderr: '' };
    if (command === 'git' && args[0] === 'branch') return { status: 0, stdout: `${branch}\n`, stderr: '' };
    if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
    if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: `${FAKE_HEAD}\n`, stderr: '' };
    if (command === 'gh' && args[0] === 'repo' && args.includes('defaultBranchRef')) {
      return { status: defaultStatus, stdout: defaultStatus === 0 ? `${defaultBranch}\n` : '', stderr: '' };
    }
    if (projectThrows && command === 'gh' && args[0] === 'repo') throw new Error('project unavailable');
    if (command === 'gh' && args[0] === 'repo') {
      return { status: 0, stdout: JSON.stringify({ owner: { login: 'nmg' }, name: 'repo' }), stderr: '' };
    }
    if (command === 'gh' && args[0] === 'api') {
      return { status: 0, stdout: JSON.stringify({ data: { repository: { issue: { projectItems: { nodes: [] } } } } }), stderr: '' };
    }
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };
  return { cwd, calls, run };
}

function handoff(cwd) {
  return JSON.parse(fs.readFileSync(path.join(cwd, '.nmg-sdlc/handoffs/42-start.json'), 'utf8'));
}

describe('startIssue controller', () => {
  it('normalizes titles and falls back for an empty slug', () => {
    expect(slugFromTitle(' Ship It! ')).toBe('ship-it');
    expect(slugFromTitle('---')).toBe('issue');
  });

  it('rejects a missing CLI issue without writing a handoff', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-start-controller-cli-'));
    roots.push(cwd);

    const result = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe('Usage: node scripts/start-issue.mjs --issue N');
    expect(JSON.parse(result.stdout)).toEqual({
      reasonCode: 'no_issue_number',
      intervention: true,
      step: 'start',
    });
    expect(fs.existsSync(path.join(cwd, '.nmg-sdlc'))).toBe(false);
  });

  const ISSUE_VIEW_CALL = ['gh', 'issue', 'view', '42', '--json', 'number,title,body,labels,state'];

  it('writes issue_closed for a CLOSED issue before any other command', () => {
    const f = fixture({ issue: { number: 42, title: 'Ship It!', body: '', labels: [], state: 'CLOSED' } });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd)).toEqual({
      schemaVersion: 1,
      issue: 42,
      step: 'start',
      status: 'failed',
      intervention: true,
      summary: 'GitHub issue #42 is CLOSED',
      artifacts: [],
      next: null,
      reasonCode: 'issue_closed',
    });
    expect(f.calls).toEqual([ISSUE_VIEW_CALL]);
  });

  it.each([
    ['failed read', () => fixture({ issueStatus: 1 })],
    ['number mismatch', () => fixture({ issue: { number: 41, title: 'Ship It!', body: '', labels: [], state: 'OPEN' } })],
    ['missing state', () => fixture({ issue: { number: 42, title: 'Ship It!', body: '', labels: [] } })],
    ['unparseable stdout', () => {
      const f = fixture();
      const run = (command, args, options) => {
        if (command === 'gh' && args[0] === 'issue' && args[1] === 'view') {
          f.calls.push([command, ...args]);
          return { status: 0, stdout: '{', stderr: '' };
        }
        return f.run(command, args, options);
      };
      return { ...f, run };
    }],
  ])('writes issue_unreadable for a %s', (_label, build) => {
    const f = build();
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd)).toMatchObject({
      reasonCode: 'issue_unreadable',
      summary: 'GitHub issue #42 is unreadable',
      intervention: true,
      next: null,
    });
    expect(f.calls).toEqual([ISSUE_VIEW_CALL]);
  });

  it('writes dependency_unreadable before branch mutation', () => {
    const f = fixture({ issue: { number: 42, title: 'Ship It!', body: 'Depends on: #7', state: 'OPEN' }, parentStatus: 1 });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd).reasonCode).toBe('dependency_unreadable');
    expect(f.calls.some((call) => call[0] === 'git')).toBe(false);
  });

  it('writes dependency_blocked without developing a branch', () => {
    const f = fixture({ issue: { number: 42, title: 'Ship It!', body: 'Depends on: #7', state: 'OPEN' }, parentState: 'OPEN' });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd).reasonCode).toBe('dependency_blocked');
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });


  it.each([
    ['failed lookup', 1, 'main'],
    ['empty successful lookup', 0, ''],
  ])('writes default_branch_unreadable for a reused branch with %s', (_label, defaultStatus, defaultBranch) => {
    const f = fixture({ branch: '42-ship-it', defaultStatus, defaultBranch });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd).reasonCode).toBe('default_branch_unreadable');
  });

  it.each([
    ['failed lookup', 1, 'main'],
    ['empty successful lookup', 0, ''],
    ['default branch named like the issue branch', 0, '42-ship-it'],
  ])('writes default_branch_unreadable from another branch with %s, before any worktree or branch is made', (_label, defaultStatus, defaultBranch) => {
    const f = fixture({ branch: 'main', defaultStatus, defaultBranch });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd).reasonCode).toBe('default_branch_unreadable');
    expect(f.calls.filter((call) => call[0] === 'git')).toEqual([['git', 'branch', '--show-current']]);
    expect(developed(f.calls)).toEqual([]);
  });

  it('does not publish locally ahead issue commits even when default is already ancestral', () => {
    const f = fixture({ branch: '42-ship-it', remoteBranch: true });
    const run = (command, args, options) => {
      if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { status: 0, stdout: `${'b'.repeat(40)}\n` };
      }
      return f.run(command, args, options);
    };
    const result = startIssue({ issue: 42, cwd: f.cwd, run });
    expect(result.handoff).toMatchObject({ status: 'failed', reasonCode: 'branch_checkout_failed' });
    expect(f.calls.some(([command, action]) => command === 'git' && action === 'push')).toBe(false);
  });

  it('works in place on a checkout already on the issue branch, with spike labels and a failing project status', () => {
    const f = fixture({
      branch: '42-ship-it',
      remoteBranch: true,
      issue: { number: 42, title: 'Ship It!', body: '', labels: [{ name: 'spike' }], state: 'OPEN' },
      projectThrows: true,
    });
    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(result.handoff).toMatchObject({
      status: 'passed', next: 'implement', intervention: false, branch: '42-ship-it', head: FAKE_HEAD,
    });
    expect(result.handoff).not.toHaveProperty('worktree');
    expect(handoff(f.cwd).reasonCode).toBeNull();
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'worktree')).toBe(false);
    expect(developed(f.calls)).toEqual([]);
  });
});

describe('startIssue worktrees', () => {
  const worktreeOf = (repo, branch = '42-ship-it') => `${repo.cwd}-wt/${branch.match(/\d+/)[0]}`;

  it('starts from a dirty primary on the default branch without touching it', () => {
    const repo = cloneRepo(seedRemote());
    fs.appendFileSync(path.join(repo.cwd, 'README.md'), 'uncommitted edit\n');
    fs.writeFileSync(path.join(repo.cwd, 'local.txt'), 'untracked\n');
    fs.writeFileSync(path.join(repo.cwd, 'staged.txt'), 'staged\n');
    git(repo.cwd, 'add', 'staged.txt');
    const before = snapshot(repo.cwd);
    expect(before.status).not.toBe('');
    const { run, calls } = realRun(repo);

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    const worktree = worktreeOf(repo);
    expect(result.handoffPath).toBe('.nmg-sdlc/handoffs/42-start.json');
    expect(handoff(repo.cwd)).toEqual({
      schemaVersion: 1,
      issue: 42,
      step: 'start',
      status: 'passed',
      intervention: false,
      summary: 'Branch ready for #42',
      artifacts: [],
      next: 'implement',
      reasonCode: null,
      branch: '42-ship-it',
      head: before.head,
      worktree,
    });
    expect(snapshot(repo.cwd)).toEqual(before);
    expect(snapshot(worktree)).toEqual({ branch: '42-ship-it', head: before.head, status: '' });
    expect(git(worktree, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')).toBe('origin/42-ship-it');
    expect(git(repo.remote, 'rev-parse', 'refs/heads/42-ship-it')).toBe(result.handoff.head);
    expect(fs.existsSync(path.join(worktree, '.nmg-sdlc/worktree.json'))).toBe(true);
    expect(fs.existsSync(path.join(worktree, '.nmg-sdlc/handoffs'))).toBe(false);
    expect(developed(calls)).toEqual([['gh', 'issue', 'develop', '42', '--name', '42-ship-it', '--base', 'main']]);
    expect(unsafe(calls)).toBe(false);
  });

  it('starts from a detached primary HEAD and leaves it detached', () => {
    const repo = cloneRepo(seedRemote());
    git(repo.cwd, 'checkout', '--detach');
    const before = snapshot(repo.cwd);
    expect(before.branch).toBe('');
    const { run } = realRun(repo);

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(result.handoff).toMatchObject({ status: 'passed', branch: '42-ship-it', head: before.head, worktree: worktreeOf(repo) });
    expect(snapshot(repo.cwd)).toEqual(before);
  });

  it('reuses the same worktree when the issue is started again', () => {
    const repo = cloneRepo(seedRemote());
    const { run, calls } = realRun(repo);

    const first = startIssue({ issue: 42, cwd: repo.cwd, run });
    fs.writeFileSync(path.join(worktreeOf(repo), 'in-progress.txt'), 'work in progress\n');
    const second = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(first.handoff).toMatchObject({ status: 'passed', worktree: worktreeOf(repo) });
    expect(second.handoff).toEqual(first.handoff);
    expect(fs.readFileSync(path.join(worktreeOf(repo), 'in-progress.txt'), 'utf8')).toBe('work in progress\n');
    expect(git(repo.cwd, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(2);
    expect(calls.filter((call) => call[0] === 'git' && call[1] === 'worktree' && call[2] === 'add')).toHaveLength(1);
    expect(developed(calls)).toHaveLength(1);
    expect(git(repo.cwd, 'branch', '--show-current')).toBe('main');
  });

  it('gives two issues started from the same primary a worktree each', () => {
    const repo = cloneRepo(seedRemote());
    const before = snapshot(repo.cwd);
    const { run } = realRun(repo, { titles: { 42: 'Ship It!', 43: 'Second thing' } });

    const first = startIssue({ issue: 42, cwd: repo.cwd, run });
    const second = startIssue({ issue: 43, cwd: repo.cwd, run });

    expect(first.handoff).toMatchObject({ status: 'passed', branch: '42-ship-it', worktree: worktreeOf(repo) });
    expect(second.handoff).toMatchObject({ status: 'passed', branch: '43-second-thing', worktree: worktreeOf(repo, '43-second-thing') });
    expect(git(first.handoff.worktree, 'branch', '--show-current')).toBe('42-ship-it');
    expect(git(second.handoff.worktree, 'branch', '--show-current')).toBe('43-second-thing');
    expect(git(repo.cwd, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(3);
    expect(JSON.parse(fs.readFileSync(path.join(repo.cwd, '.nmg-sdlc/handoffs/43-start.json'), 'utf8'))).toEqual(second.handoff);
    expect(snapshot(repo.cwd)).toEqual(before);
  });

  it('creates and publishes the branch from the remote default when issue development fails', () => {
    const repo = cloneRepo(seedRemote());
    // The remote default moves after the clone: the new branch starts from the remote, not from the stale checkout.
    const remoteMain = commitFile(repo.seed, 'later.txt', 'later\n', 'later default work');
    git(repo.seed, 'push', 'origin', 'main');
    const before = snapshot(repo.cwd);
    expect(before.head).not.toBe(remoteMain);
    const { run, calls } = realRun(repo, { develop: 'fail' });

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    const worktree = worktreeOf(repo);
    expect(result.handoff).toMatchObject({ status: 'passed', branch: '42-ship-it', head: remoteMain, worktree });
    expect(git(repo.remote, 'rev-parse', 'refs/heads/42-ship-it')).toBe(remoteMain);
    expect(git(worktree, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')).toBe('origin/42-ship-it');
    expect(calls).toContainEqual(['git', 'push', '-u', 'origin', '42-ship-it:refs/heads/42-ship-it']);
    expect(snapshot(repo.cwd)).toEqual(before);
    expect(unsafe(calls)).toBe(false);
  });

  it('writes branch_push_failed when a new branch cannot be published', () => {
    const repo = cloneRepo(seedRemote());
    const { run } = realRun(repo, {
      develop: 'fail',
      extra: (command, args) => (command === 'git' && args[0] === 'push' ? { status: 1, stdout: '', stderr: 'denied' } : undefined),
    });

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(result.handoff).toMatchObject({ status: 'failed', reasonCode: 'branch_push_failed', intervention: true, next: null });
    expect(result.handoff).not.toHaveProperty('worktree');
    expect(runGit(repo.remote, ['rev-parse', '--verify', '--quiet', 'refs/heads/42-ship-it']).status).not.toBe(0);
  });

  it('recovers when issue development creates the remote branch but reports failure', () => {
    const repo = cloneRepo(seedRemote());
    const { run, calls } = realRun(repo, { develop: 'push-then-fail' });

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(result.handoff).toMatchObject({ status: 'passed', worktree: worktreeOf(repo) });
    expect(git(worktreeOf(repo), 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')).toBe('origin/42-ship-it');
    expect(developed(calls)).toHaveLength(1);
    expect(calls.some((call) => call[0] === 'git' && call[1] === 'push')).toBe(false);
  });

  it('puts an existing local issue branch in a worktree without developing it', () => {
    const repo = seedRemote();
    const specHead = pushIssueBranch(repo);
    cloneRepo(repo);
    git(repo.cwd, 'branch', '--track', '42-ship-it', 'origin/42-ship-it');
    const before = snapshot(repo.cwd);
    const { run, calls } = realRun(repo);

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(result.handoff).toMatchObject({ status: 'passed', head: specHead, worktree: worktreeOf(repo) });
    expect(calls).toContainEqual(['git', 'worktree', 'add', worktreeOf(repo), '42-ship-it']);
    expect(developed(calls)).toEqual([]);
    expect(calls.some((call) => call[0] === 'git' && call[1] === 'push')).toBe(false);
    expect(snapshot(repo.cwd)).toEqual(before);
  });

  it('publishes an issue branch that exists only locally', () => {
    const repo = cloneRepo(seedRemote());
    git(repo.cwd, 'branch', '--no-track', '42-ship-it', 'origin/main');
    const before = snapshot(repo.cwd);
    const { run, calls } = realRun(repo);

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(result.handoff).toMatchObject({ status: 'passed', head: before.head, worktree: worktreeOf(repo) });
    expect(git(repo.remote, 'rev-parse', 'refs/heads/42-ship-it')).toBe(before.head);
    expect(developed(calls)).toEqual([]);
    expect(snapshot(repo.cwd)).toEqual(before);
  });

  it('reuses a remote issue branch from a single-branch clone', () => {
    const repo = seedRemote();
    const specHead = pushIssueBranch(repo);
    cloneRepo(repo, '--single-branch');
    const before = snapshot(repo.cwd);
    const { run, calls } = realRun(repo);

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    const worktree = worktreeOf(repo);
    expect(result.handoff).toMatchObject({ status: 'passed', branch: '42-ship-it', head: specHead, worktree });
    expect(snapshot(repo.cwd)).toEqual(before);
    expect(snapshot(worktree)).toEqual({ branch: '42-ship-it', head: specHead, status: '' });
    expect(git(worktree, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')).toBe('origin/42-ship-it');
    expect(git(repo.cwd, 'config', '--get-all', 'remote.origin.fetch').split('\n')).toEqual([
      '+refs/heads/main:refs/remotes/origin/main',
      'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
    ]);
    expect(calls).toContainEqual([
      'git', 'fetch', '--quiet', '--no-tags', 'origin',
      'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
    ]);
    expect(git(repo.remote, 'rev-parse', 'refs/heads/42-ship-it')).toBe(specHead);
    expect(unsafe(calls)).toBe(false);
    expect(developed(calls)).toEqual([]);
  });

  it.each(['remote-only', 'local', 'current'])(
    'fast-forwards a fully integrated %s spec branch and publishes the result',
    (reuseMode) => {
      const repo = seedRemote();
      pushIssueBranch(repo);
      git(repo.seed, 'merge', '--no-ff', '-m', 'merge spec', '42-ship-it');
      const defaultHead = commitFile(repo.seed, 'README.md', 'main\nlater default work\n', 'later default work');
      git(repo.seed, 'push', 'origin', 'main');
      cloneRepo(repo, '--single-branch');
      if (reuseMode !== 'remote-only') {
        git(repo.cwd, 'config', '--add', 'remote.origin.fetch', 'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it');
        git(repo.cwd, 'fetch', 'origin');
        git(repo.cwd, 'branch', '--track', '42-ship-it', 'origin/42-ship-it');
      }
      if (reuseMode === 'current') git(repo.cwd, 'checkout', '42-ship-it');
      const before = snapshot(repo.cwd);
      const { run, calls } = realRun(repo);

      const result = startIssue({ issue: 42, cwd: repo.cwd, run });

      expect(result.handoff).toMatchObject({ status: 'passed', branch: '42-ship-it', head: defaultHead });
      const work = reuseMode === 'current' ? repo.cwd : worktreeOf(repo);
      if (reuseMode === 'current') {
        expect(result.handoff).not.toHaveProperty('worktree');
        expect(calls.some((call) => call[0] === 'git' && call[1] === 'worktree')).toBe(false);
      } else {
        expect(result.handoff.worktree).toBe(work);
        expect(snapshot(repo.cwd)).toEqual(before);
      }
      expect(snapshot(work)).toEqual({ branch: '42-ship-it', head: defaultHead, status: '' });
      expect(git(work, 'rev-parse', 'origin/42-ship-it')).toBe(defaultHead);
      expect(git(repo.remote, 'rev-parse', 'refs/heads/42-ship-it')).toBe(defaultHead);
      expect(calls).toContainEqual(['git', 'merge', '--ff-only', defaultHead]);
      expect(calls).toContainEqual(['git', 'push', 'origin', `${defaultHead}:refs/heads/42-ship-it`]);
      expect(unsafe(calls)).toBe(false);
      expect(developed(calls)).toEqual([]);
    },
  );

  it('untracks ignored runtime in the worktree only', () => {
    const repo = cloneRepo(seedRemote({ files: { '.nmg-sdlc/run.json': '{}\n' } }));
    const before = snapshot(repo.cwd);
    const { run, calls } = realRun(repo);

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    const worktree = worktreeOf(repo);
    expect(result.handoff).toMatchObject({ status: 'passed', worktree });
    expect(calls).toContainEqual(['git', 'rm', '--cached', '-r', '--', '.nmg-sdlc']);
    expect(runGit(worktree, ['status', '--porcelain']).stdout).toBe('D  .nmg-sdlc/run.json\n');
    expect(fs.existsSync(path.join(worktree, '.nmg-sdlc/run.json'))).toBe(true);
    expect(git(repo.cwd, 'ls-files', '--', '.nmg-sdlc')).toBe('.nmg-sdlc/run.json');
    expect(fs.existsSync(path.join(repo.cwd, '.nmg-sdlc/run.json'))).toBe(true);
    expect(snapshot(repo.cwd)).toEqual(before);
  });

  it('writes runtime_untrack_failed when the worktree runtime cannot be untracked', () => {
    const repo = cloneRepo(seedRemote({ files: { '.nmg-sdlc/run.json': '{}\n' } }));
    const before = snapshot(repo.cwd);
    const { run } = realRun(repo, {
      extra: (command, args) => (command === 'git' && args[0] === 'rm' ? { status: 1, stdout: '', stderr: 'locked' } : undefined),
    });

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(handoff(repo.cwd)).toMatchObject({ status: 'failed', intervention: true, reasonCode: 'runtime_untrack_failed' });
    expect(result.handoff).not.toHaveProperty('worktree');
    expect(snapshot(repo.cwd)).toEqual(before);
  });

  it('writes dirty_tree when the worktree status is unreadable', () => {
    const repo = cloneRepo(seedRemote());
    const { run } = realRun(repo, {
      extra: (command, args) => (command === 'git' && args[0] === 'status' ? { status: 128, stdout: '', stderr: 'broken' } : undefined),
    });

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(result.handoff).toMatchObject({ status: 'failed', reasonCode: 'dirty_tree' });
  });

  it('writes branch_checkout_failed when the worktree cannot be created', () => {
    const repo = cloneRepo(seedRemote());
    // Something that is not this repository's worktree already occupies the worktree path.
    fs.mkdirSync(worktreeOf(repo), { recursive: true });
    fs.writeFileSync(path.join(worktreeOf(repo), 'squatter.txt'), 'not a worktree\n');
    const before = snapshot(repo.cwd);
    const { run, calls } = realRun(repo);

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(handoff(repo.cwd)).toMatchObject({
      status: 'failed', intervention: true, next: null, reasonCode: 'branch_checkout_failed',
    });
    expect(result.handoff.summary).toContain('worktree_path_occupied');
    expect(result.handoff).not.toHaveProperty('worktree');
    expect(snapshot(repo.cwd)).toEqual(before);
    expect(fs.readdirSync(worktreeOf(repo))).toEqual(['squatter.txt']);
    expect(git(repo.cwd, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
    expect(calls.some((call) => call[0] === 'git' && call[1] === 'push')).toBe(false);
  });

  it('writes branch_checkout_failed when git cannot add the worktree', () => {
    const repo = cloneRepo(seedRemote());
    const { run } = realRun(repo, {
      extra: (command, args) => (command === 'git' && args[0] === 'worktree' && args[1] === 'add'
        ? { status: 128, stdout: '', stderr: 'fatal: could not create work tree' } : undefined),
    });

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(result.handoff).toMatchObject({ status: 'failed', reasonCode: 'branch_checkout_failed' });
    expect(result.handoff.summary).toContain('could not create work tree');
    expect(git(repo.cwd, 'branch', '--show-current')).toBe('main');
  });

  it('writes worktree_setup_failed when the declared worktree setup command fails', () => {
    const manifest = { worktree: { setup: { program: process.execPath, args: ['-e', 'process.exit(3)'] } } };
    const repo = cloneRepo(seedRemote({ files: { 'steering/manifest.json': `${JSON.stringify(manifest)}\n` } }));
    const { run } = realRun(repo);

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(result.handoff).toMatchObject({ status: 'failed', reasonCode: 'worktree_setup_failed' });
    expect(git(repo.cwd, 'branch', '--show-current')).toBe('main');
  });

  it('preserves a divergent current issue branch and its canonical remote', () => {
    const repo = seedRemote();
    const remoteIssueHead = pushIssueBranch(repo);
    git(repo.seed, 'merge', '--no-ff', '-m', 'merge spec', '42-ship-it');
    commitFile(repo.seed, 'README.md', 'main\nlater default work\n', 'later default work');
    git(repo.seed, 'push', 'origin', 'main');
    cloneRepo(repo);
    git(repo.cwd, 'checkout', '--track', '-b', '42-ship-it', 'origin/42-ship-it');
    const localHead = commitFile(repo.cwd, 'implementation.txt', 'local implementation\n', 'local implementation');
    const { run, calls } = realRun(repo);

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(result.handoff).toMatchObject({ status: 'failed', reasonCode: 'branch_checkout_failed' });
    expect(git(repo.cwd, 'rev-parse', 'HEAD')).toBe(localHead);
    expect(git(repo.cwd, 'rev-parse', 'origin/42-ship-it')).toBe(remoteIssueHead);
    expect(git(repo.remote, 'rev-parse', 'refs/heads/42-ship-it')).toBe(remoteIssueHead);
    expect(calls).toContainEqual([
      'git', 'fetch', '--quiet', '--no-tags', 'origin',
      'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
    ]);
    expect(calls.some((call) => call[0] === 'git' && ['push', 'worktree'].includes(call[1]))).toBe(false);
    expect(unsafe(calls)).toBe(false);
  });

  it('reuses a worktree that already owns the issue branch, wherever it lives', () => {
    const repo = seedRemote();
    const specHead = pushIssueBranch(repo);
    cloneRepo(repo);
    const owner = path.join(repo.root, 'owner-worktree');
    git(repo.cwd, 'worktree', 'add', owner, '42-ship-it');
    const before = snapshot(repo.cwd);
    const { run, calls } = realRun(repo);

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(result.handoff).toMatchObject({ status: 'passed', branch: '42-ship-it', head: specHead, worktree: owner });
    expect(snapshot(owner)).toEqual({ branch: '42-ship-it', head: specHead, status: '' });
    expect(snapshot(repo.cwd)).toEqual(before);
    expect(fs.existsSync(`${repo.cwd}-wt`)).toBe(false);
    expect(calls.some((call) => call[0] === 'git' && (call[1] === 'push' || (call[1] === 'worktree' && call[2] === 'add')))).toBe(false);
    expect(developed(calls)).toEqual([]);
  });

  it('reconciles a squash-merged approved spec branch in its worktree, pushes exact, records branch/head/worktree (PennyScan-like)', () => {
    const repo = seedRemote();
    const specDir = 'specs/42-ship-it';
    const specFiles = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];
    git(repo.seed, 'checkout', '-b', '42-ship-it');
    fs.mkdirSync(path.join(repo.seed, specDir), { recursive: true });
    for (const file of specFiles) {
      fs.writeFileSync(path.join(repo.seed, specDir, file), `**Issue**: #42\n**Status**: Approved\n${file}\n`);
    }
    git(repo.seed, 'add', specDir);
    git(repo.seed, 'commit', '-m', 'spec');
    const specHead = git(repo.seed, 'rev-parse', 'HEAD');
    git(repo.seed, 'push', '-u', 'origin', '42-ship-it');
    // squash merge on default (no ancestry link); the remote issue ref stays at the spec head
    git(repo.seed, 'checkout', 'main');
    git(repo.seed, 'merge', '--squash', '42-ship-it');
    git(repo.seed, 'commit', '-m', 'docs: approve spec for #42');
    git(repo.seed, 'push', 'origin', 'main');
    const defaultAfter = git(repo.seed, 'rev-parse', 'HEAD');
    expect(git(repo.remote, 'rev-parse', 'refs/heads/42-ship-it')).toBe(specHead);
    cloneRepo(repo);
    const before = snapshot(repo.cwd);
    expect(before.head).toBe(defaultAfter);

    let forkSource = true;
    const { run, calls } = realRun(repo, {
      extra: (command, args) => {
        if (command !== 'gh' || args[0] !== 'pr') return undefined;
        // prove squash provenance for this exact old head
        if (args[1] === 'list' && args.includes('--state') && args.includes('all')) {
          return { status: 0, stdout: JSON.stringify([{ number: 228, headRefOid: specHead, state: 'MERGED' }]), stderr: '' };
        }
        if (args[1] === 'view' && args[2] === '228') {
          return {
            status: 0,
            stdout: JSON.stringify({
              number: 228, title: 'docs: approve spec for #42', state: 'MERGED',
              headRefName: '42-ship-it', headRefOid: specHead, baseRefName: 'main',
              headRepositoryOwner: { login: forkSource ? 'foreign-fork' : 'nmg' }, headRepository: { name: 'repo' },
              mergeCommit: { oid: defaultAfter }, files: specFiles.map((file) => ({ path: `${specDir}/${file}` })),
            }),
            stderr: '',
          };
        }
        return undefined;
      },
    });
    const worktree = `${repo.cwd}-wt/42`;

    const wrongSource = startIssue({ issue: 42, cwd: repo.cwd, run });
    expect(wrongSource.handoff).toMatchObject({ status: 'failed', reasonCode: 'divergent_unproven' });
    expect(git(worktree, 'rev-parse', 'HEAD')).toBe(specHead);
    expect(calls.some((call) => call[0] === 'git' && call[1] === 'push')).toBe(false);

    // A worktree with its own uncommitted work is never merged into.
    forkSource = false;
    fs.writeFileSync(path.join(worktree, 'scratch.txt'), 'uncommitted\n');
    const dirty = startIssue({ issue: 42, cwd: repo.cwd, run });
    expect(dirty.handoff).toMatchObject({ status: 'failed', reasonCode: 'dirty_tree' });
    expect(git(worktree, 'rev-parse', 'HEAD')).toBe(specHead);
    expect(calls.some((call) => call[0] === 'git' && call[1] === 'push')).toBe(false);
    fs.rmSync(path.join(worktree, 'scratch.txt'));

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });
    expect(result.handoff).toMatchObject({ status: 'passed', branch: '42-ship-it', worktree });
    expect(result.handoff.head).toMatch(/^[0-9a-f]{40}$/);
    const afterHead = git(worktree, 'rev-parse', 'HEAD');
    expect(result.handoff.head).toBe(afterHead);
    // remote was pushed to the reconciled head
    const remoteAfter = git(repo.remote, 'rev-parse', 'refs/heads/42-ship-it');
    expect(remoteAfter).toBe(afterHead);
    expect(remoteAfter).not.toBe(specHead);
    // used non-ff merge and push, no force
    expect(calls).toContainEqual(['git', 'merge', '--no-edit', defaultAfter]);
    expect(calls).toContainEqual(['git', 'push', 'origin', `${afterHead}:refs/heads/42-ship-it`]);
    expect(unsafe(calls)).toBe(false);
    // default history incorporated: the merge's parents are the spec head and the default head
    expect(git(worktree, 'log', '-1', '--pretty=%P', 'HEAD').split(' ')).toEqual([specHead, defaultAfter]);
    expect(snapshot(repo.cwd)).toEqual(before);
  });

  it('fails closed on unrelated divergence even for squash-proven branch (stays blocked, pre-fix expectation preserved)', () => {
    const repo = seedRemote();
    const specHead = pushIssueBranch(repo);
    git(repo.seed, 'merge', '--squash', '42-ship-it');
    git(repo.seed, 'commit', '-m', 'docs: approve spec for #42');
    git(repo.seed, 'push', 'origin', 'main');
    cloneRepo(repo);
    git(repo.cwd, 'checkout', '--track', '-b', '42-ship-it', 'origin/42-ship-it');
    // unrelated local divergence
    const localDivergeHead = commitFile(repo.cwd, 'impl.txt', 'dirty work\n', 'local unrelated');
    const { run, calls } = realRun(repo, {
      // even if a pull request would match, local != remote blocks first
      extra: (command, args) => {
        if (command !== 'gh' || args[0] !== 'pr') return undefined;
        return args[1] === 'list'
          ? { status: 0, stdout: JSON.stringify([{ number: 228, headRefOid: specHead, state: 'MERGED' }]), stderr: '' }
          : { status: 0, stdout: JSON.stringify({ number: 228, state: 'MERGED', headRefName: '42-ship-it', headRefOid: specHead, baseRefName: 'main' }), stderr: '' };
      },
    });

    const result = startIssue({ issue: 42, cwd: repo.cwd, run });

    expect(result.handoff).toMatchObject({ status: 'failed', reasonCode: 'branch_checkout_failed' });
    expect(git(repo.cwd, 'rev-parse', 'HEAD')).toBe(localDivergeHead);
    expect(calls.some((call) => call[0] === 'git' && call[1] === 'push')).toBe(false);
    expect(calls.some((call) => call[0] === 'git' && call[1] === 'merge' && !call.includes('--ff-only'))).toBe(false);
  });
});
