import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { slugFromTitle, startIssue } from '../start-issue.mjs';

const roots = [];
const SCRIPT = fileURLToPath(new URL('../start-issue.mjs', import.meta.url));
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function fixture({
  issueStatus = 0,
  issue = { number: 42, title: 'Ship It!', body: '', labels: [], state: 'OPEN' },
  parentStatus = 0,
  parentState = 'CLOSED',
  branch = 'main',
  dirty = '',
  gitignore = null,
  trackedRuntime = '',
  lsFilesStatus = 0,
  rmStatus = 0,
  integratedRuntimeMigration = false,
  defaultStatus = 0,
  defaultBranch = 'main',
  developStatus = 0,
  localBranch = false,
  remoteBranch = false,
  remoteBranchAfterDevelop = false,
  remoteConfigStatus = 0,
  checkoutStatus = 0,
  checkedOutBranch = '42-ship-it',
  projectThrows = false,
} = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-start-controller-'));
  roots.push(cwd);
  if (gitignore !== null) fs.writeFileSync(path.join(cwd, '.gitignore'), gitignore);
  if (integratedRuntimeMigration) {
    const runtimePath = path.join(cwd, '.omp/sdlc/run.json');
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
    fs.writeFileSync(runtimePath, '{}\n');
    runGit(cwd, ['init', '-b', 'main']);
    runGit(cwd, ['config', 'user.name', 'Test']);
    runGit(cwd, ['config', 'user.email', 'test@example.com']);
    runGit(cwd, ['add', '-f', '.gitignore', '.omp/sdlc/run.json']);
    runGit(cwd, ['commit', '-m', 'track runtime']);
  }
  const calls = [];
  let branchReads = 0;
  let developAttempted = false;
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (integratedRuntimeMigration && command === 'git'
      && (['ls-files', 'rm', 'status'].includes(args[0])
        || (args[0] === 'branch' && args[1] === '--show-current'))) {
      return runGit(cwd, args);
    }
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
    if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.includes('state')) {
      return { status: parentStatus, stdout: parentStatus === 0 ? JSON.stringify({ state: parentState }) : '', stderr: '' };
    }
    if (command === 'git' && args[0] === 'ls-files') {
      return { status: lsFilesStatus, stdout: trackedRuntime, stderr: '' };
    }
    if (command === 'git' && args[0] === 'rm') {
      return { status: rmStatus, stdout: '', stderr: '' };
    }
    if (command === 'git' && args[0] === 'show-ref') {
      return { status: localBranch ? 0 : 1, stdout: '', stderr: '' };
    }
    if (command === 'git' && args[0] === 'fetch') {
      if (args.includes(`refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`)) {
        return { status: 0, stdout: '', stderr: '' };
      }
      return {
        status: remoteBranch || (developAttempted && developStatus === 0) || (remoteBranchAfterDevelop && developAttempted) ? 0 : 1,
        stdout: '', stderr: '',
      };
    }
    if (command === 'git' && args[0] === 'config' && args[1] === '--get-all') {
      return {
        status: 0,
        stdout: '+refs/heads/main:refs/remotes/origin/main\n',
        stderr: '',
      };
    }
    if (command === 'git' && args[0] === 'config' && args[1] === '--add') {
      return { status: remoteConfigStatus, stdout: '', stderr: '' };
    }
    if (command === 'git' && args[0] === 'checkout') {
      return { status: checkoutStatus, stdout: '', stderr: '' };
    }
    if (command === 'git' && args[0] === 'merge-base') {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === 'git' && args[0] === 'merge') {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === 'git' && args[0] === 'branch') {
      branchReads += 1;
      return { status: 0, stdout: `${branchReads === 1 ? branch : checkedOutBranch}\n`, stderr: '' };
    }
    if (command === 'git' && args[0] === 'status') return { status: 0, stdout: dirty, stderr: '' };
    if (command === 'git' && args[0] === 'rev-parse') {
      return { status: 0, stdout: '0123456789abcdef0123456789abcdef01234567\n', stderr: '' };
    }
    if (command === 'git' && args[0] === 'push') {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === 'gh' && args[0] === 'pr' && args[1] === 'list' && args.includes('all')) {
      return { status: 0, stdout: JSON.stringify([{ number: 99, headRefOid: '0123456789abcdef0123456789abcdef01234567', state: 'MERGED' }]), stderr: '' };
    }
    if (command === 'gh' && args[0] === 'pr' && args[1] === 'view') {
      return { status: 0, stdout: JSON.stringify({ number: 99, state: 'MERGED', headRefName: '42-ship-it', headRefOid: '0123456789abcdef0123456789abcdef01234567', baseRefName: 'main' }), stderr: '' };
    }
    if (command === 'gh' && args[0] === 'repo' && args.includes('defaultBranchRef')) {
      return { status: defaultStatus, stdout: defaultStatus === 0 ? `${defaultBranch}\n` : '', stderr: '' };
    }
    if (command === 'gh' && args[0] === 'issue' && args[1] === 'develop') {
      developAttempted = true;
      if (integratedRuntimeMigration && developStatus === 0) {
        runGit(cwd, ['checkout', '-b', checkedOutBranch]);
      }
      return { status: developStatus, stdout: '', stderr: '' };
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
  return JSON.parse(fs.readFileSync(path.join(cwd, '.omp/sdlc/handoffs/42-start.json'), 'utf8'));
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
    expect(fs.existsSync(path.join(cwd, '.omp'))).toBe(false);
  });

  it('writes issue_unreadable', () => {
    const f = fixture({ issueStatus: 1 });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd).reasonCode).toBe('issue_unreadable');
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

  it('writes dirty_tree when another branch has changes', () => {
    const f = fixture({ dirty: ' M local.txt\n' });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd).reasonCode).toBe('dirty_tree');
  });
  it('proceeds from main when untracking runtime stages its deletion', () => {
    const f = fixture({
      gitignore: '.omp/sdlc/\n',
      integratedRuntimeMigration: true,
    });
    const runtimePath = path.join(f.cwd, '.omp/sdlc/run.json');

    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });

    expect(result.handoff.status).toBe('passed');
    expect(f.calls).toContainEqual(['git', 'rm', '--cached', '-r', '--', '.omp/sdlc']);
    expect(f.calls).toContainEqual(['git', 'status', '--porcelain', '-z']);
    expect(fs.existsSync(runtimePath)).toBe(true);
    expect(f.calls).toContainEqual([
      'gh', 'issue', 'develop', '42', '--checkout', '--name', '42-ship-it', '--base', 'main',
    ]);
  });

  it('rejects other dirt alongside the exact runtime staged transition', () => {
    const f = fixture({
      gitignore: '.omp/sdlc/\n',
      integratedRuntimeMigration: true,
    });
    fs.writeFileSync(path.join(f.cwd, 'local.txt'), 'dirty\n');

    startIssue({ issue: 42, cwd: f.cwd, run: f.run });

    expect(handoff(f.cwd).reasonCode).toBe('dirty_tree');
    expect(f.calls).toContainEqual(['git', 'rm', '--cached', '-r', '--', '.omp/sdlc']);
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });

  it('does not untrack unignored runtime and still fails dirty_tree', () => {
    const f = fixture({ dirty: '?? .omp/sdlc/run.json\n' });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd).reasonCode).toBe('dirty_tree');
    expect(f.calls.some((call) => call[0] === 'git' && ['ls-files', 'rm'].includes(call[1]))).toBe(false);
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });

  it('keeps non-runtime dirt blocking after ignored runtime is untracked', () => {
    const f = fixture({ gitignore: '.omp/sdlc/\n', dirty: ' M local.txt\n' });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd).reasonCode).toBe('dirty_tree');
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });

  it('writes runtime_untrack_failed before developing the issue branch', () => {
    const f = fixture({
      gitignore: '.omp/sdlc/\n',
      trackedRuntime: '.omp/sdlc/run.json\0',
      rmStatus: 1,
    });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd)).toMatchObject({
      status: 'failed',
      intervention: true,
      reasonCode: 'runtime_untrack_failed',
    });
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });

  it('checks out an existing local canonical issue branch without developing it', () => {
    const f = fixture({ localBranch: true, remoteBranch: true });
    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(result.handoff.status).toBe('passed');
    expect(f.calls).toContainEqual([
      'git', 'show-ref', '--verify', '--quiet', 'refs/heads/42-ship-it',
    ]);
    expect(f.calls).toContainEqual(['git', 'checkout', '42-ship-it']);
    expect(f.calls).toContainEqual([
      'git', 'fetch', '--quiet', '--no-tags', 'origin',
      'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
    ]);
    expect(f.calls).toContainEqual([
      'git', 'fetch', '--quiet', '--no-tags', 'origin',
      'refs/heads/main:refs/remotes/origin/main',
    ]);
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });

  it('tracks an existing origin canonical issue branch without developing it', () => {
    const f = fixture({ remoteBranch: true });
    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(result.handoff.status).toBe('passed');
    expect(f.calls).toContainEqual([
      'git', 'fetch', '--quiet', '--no-tags', 'origin',
      'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
    ]);
    expect(f.calls).toContainEqual([
      'git', 'config', '--add', 'remote.origin.fetch',
      'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
    ]);
    expect(f.calls).toContainEqual([
      'git', 'checkout', '--track', '-b', '42-ship-it', 'origin/42-ship-it',
    ]);
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });
  it('recovers when issue development creates the remote branch but cannot check it out', () => {
    const f = fixture({
      developStatus: 1,
      remoteBranchAfterDevelop: true,
    });

    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });

    expect(result.handoff.status).toBe('passed');
    expect(f.calls.filter((call) => call[0] === 'git' && call[1] === 'fetch')).toHaveLength(5);
    expect(f.calls).toContainEqual([
      'gh', 'issue', 'develop', '42', '--checkout', '--name', '42-ship-it', '--base', 'main',
    ]);
    expect(f.calls).toContainEqual([
      'git', 'checkout', '--track', '-b', '42-ship-it', 'origin/42-ship-it',
    ]);
    expect(f.calls).toContainEqual([
      'git', 'fetch', '--quiet', '--no-tags', 'origin',
      'refs/heads/main:refs/remotes/origin/main',
    ]);
  });


  it('fails closed when exact remote branch registration fails', () => {
    const f = fixture({
      remoteBranch: true,
      remoteConfigStatus: 1,
      checkedOutBranch: 'main',
    });

    startIssue({ issue: 42, cwd: f.cwd, run: f.run });

    expect(handoff(f.cwd).reasonCode).toBe('branch_checkout_failed');
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'checkout')).toBe(false);
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });

  it('reuses a remote issue branch from a single-branch clone', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-start-single-branch-'));
    roots.push(root);
    const remote = path.join(root, 'remote.git');
    const seed = path.join(root, 'seed');
    const cwd = path.join(root, 'clone');
    fs.mkdirSync(seed);
    runGit(root, ['init', '--bare', remote]);
    runGit(seed, ['init', '-b', 'main']);
    runGit(seed, ['config', 'user.name', 'Test']);
    runGit(seed, ['config', 'user.email', 'test@example.com']);
    fs.writeFileSync(path.join(seed, 'README.md'), 'main\n');
    runGit(seed, ['add', 'README.md']);
    runGit(seed, ['commit', '-m', 'main']);
    runGit(seed, ['remote', 'add', 'origin', remote]);
    runGit(seed, ['push', '-u', 'origin', 'main']);
    runGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    runGit(seed, ['checkout', '-b', '42-ship-it']);
    fs.writeFileSync(path.join(seed, 'spec.txt'), 'approved\n');
    runGit(seed, ['add', 'spec.txt']);
    runGit(seed, ['commit', '-m', 'spec']);
    runGit(seed, ['push', '-u', 'origin', '42-ship-it']);
    runGit(root, ['clone', '--single-branch', remote, cwd]);

    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      if (command === 'git') return runGit(cwd, args);
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({
            number: 42,
            title: 'Ship It!',
            body: '',
            labels: [],
            state: args.includes('number,title,body,labels,state') ? 'OPEN' : 'open',
          }),
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'repo' && args.includes('nameWithOwner')) {
        return { status: 0, stdout: '{"nameWithOwner":"nmg/repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo' && args.includes('defaultBranchRef')) {
        return { status: 0, stdout: 'main\n', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo') {
        return { status: 0, stdout: '{"owner":{"login":"nmg"},"name":"repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && args.includes('--paginate')) {
        return { status: 0, stdout: '[[]]', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && /^repos\/nmg\/repo\/issues\/42$/.test(args[1] || '')) {
        return {
          status: 0,
          stdout: '{"id":4200,"number":42,"state":"open","title":"Ship It!","repository_url":"https://api.github.com/repos/nmg/repo"}',
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'api') {
        return {
          status: 0,
          stdout: '{"data":{"repository":{"issue":{"projectItems":{"nodes":[]}}}}}',
          stderr: '',
        };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };

    const result = startIssue({ issue: 42, cwd, run });

    expect(result.handoff.status).toBe('passed');
    expect(runGit(cwd, ['branch', '--show-current']).stdout.trim()).toBe('42-ship-it');
    expect(runGit(cwd, [
      'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}',
    ]).stdout.trim()).toBe('origin/42-ship-it');
    expect(runGit(cwd, ['config', '--get-all', 'remote.origin.fetch']).stdout.trim().split('\n')).toEqual([
      '+refs/heads/main:refs/remotes/origin/main',
      'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
    ]);
    expect(calls).toContainEqual([
      'git', 'fetch', '--quiet', '--no-tags', 'origin',
      'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
    ]);
    expect(calls.some((call) => call.includes('--force') || call.includes('--reset'))).toBe(false);
    expect(calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });

  it('recovers when issue development creates the remote branch but cannot check it out', () => {
    const f = fixture({
      developStatus: 1,
      remoteBranchAfterDevelop: true,
    });

    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });

    expect(result.handoff.status).toBe('passed');
    expect(f.calls.filter((call) => call[0] === 'git' && call[1] === 'fetch')).toHaveLength(5);
    expect(f.calls).toContainEqual([
      'gh', 'issue', 'develop', '42', '--checkout', '--name', '42-ship-it', '--base', 'main',
    ]);
    expect(f.calls).toContainEqual([
      'git', 'checkout', '--track', '-b', '42-ship-it', 'origin/42-ship-it',
    ]);
    expect(f.calls).toContainEqual([
      'git', 'fetch', '--quiet', '--no-tags', 'origin',
      'refs/heads/main:refs/remotes/origin/main',
    ]);
  });

  it('fails closed when exact remote branch registration fails', () => {
    const f = fixture({
      remoteBranch: true,
      remoteConfigStatus: 1,
      checkedOutBranch: 'main',
    });

    startIssue({ issue: 42, cwd: f.cwd, run: f.run });

    expect(handoff(f.cwd).reasonCode).toBe('branch_checkout_failed');
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'checkout')).toBe(false);
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });

  it('reuses a remote issue branch from a single-branch clone', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-start-single-branch-'));
    roots.push(root);
    const remote = path.join(root, 'remote.git');
    const seed = path.join(root, 'seed');
    const cwd = path.join(root, 'clone');
    fs.mkdirSync(seed);
    runGit(root, ['init', '--bare', remote]);
    runGit(seed, ['init', '-b', 'main']);
    runGit(seed, ['config', 'user.name', 'Test']);
    runGit(seed, ['config', 'user.email', 'test@example.com']);
    fs.writeFileSync(path.join(seed, 'README.md'), 'main\n');
    runGit(seed, ['add', 'README.md']);
    runGit(seed, ['commit', '-m', 'main']);
    runGit(seed, ['remote', 'add', 'origin', remote]);
    runGit(seed, ['push', '-u', 'origin', 'main']);
    runGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    runGit(seed, ['checkout', '-b', '42-ship-it']);
    fs.writeFileSync(path.join(seed, 'spec.txt'), 'approved\n');
    runGit(seed, ['add', 'spec.txt']);
    runGit(seed, ['commit', '-m', 'spec']);
    runGit(seed, ['push', '-u', 'origin', '42-ship-it']);
    runGit(seed, ['checkout', 'main']);
    runGit(seed, ['merge', '--no-ff', '-m', 'merge spec', '42-ship-it']);
    runGit(seed, ['push', 'origin', 'main']);
    runGit(root, ['clone', '--single-branch', remote, cwd]);

    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      if (command === 'git') return runGit(cwd, args);
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({
            number: 42,
            title: 'Ship It!',
            body: '',
            labels: [],
            state: args.includes('number,title,body,labels,state') ? 'OPEN' : 'open',
          }),
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'repo' && args.includes('nameWithOwner')) {
        return { status: 0, stdout: '{"nameWithOwner":"nmg/repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo' && args.includes('defaultBranchRef')) {
        return { status: 0, stdout: 'main\n', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo') {
        return { status: 0, stdout: '{"owner":{"login":"nmg"},"name":"repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && args.includes('--paginate')) {
        return { status: 0, stdout: '[[]]', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && /^repos\/nmg\/repo\/issues\/42$/.test(args[1] || '')) {
        return {
          status: 0,
          stdout: '{"id":4200,"number":42,"state":"open","title":"Ship It!","repository_url":"https://api.github.com/repos/nmg/repo"}',
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'api') {
        return {
          status: 0,
          stdout: '{"data":{"repository":{"issue":{"projectItems":{"nodes":[]}}}}}',
          stderr: '',
        };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };

    const result = startIssue({ issue: 42, cwd, run });

    expect(result.handoff.status).toBe('passed');
    expect(runGit(cwd, ['branch', '--show-current']).stdout.trim()).toBe('42-ship-it');
    expect(runGit(cwd, [
      'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}',
    ]).stdout.trim()).toBe('origin/42-ship-it');
    expect(runGit(cwd, ['config', '--get-all', 'remote.origin.fetch']).stdout.trim().split('\n')).toEqual([
      '+refs/heads/main:refs/remotes/origin/main',
      'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
    ]);
    expect(calls).toContainEqual([
      'git', 'fetch', '--quiet', '--no-tags', 'origin',
      'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
    ]);
    expect(calls.some((call) => call.includes('--force') || call.includes('--reset'))).toBe(false);
    expect(calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });

  it.each(['remote-only', 'local', 'current'])(
    'fast-forwards a fully integrated %s spec branch without mutating its remote',
    (reuseMode) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-start-integrated-branch-'));
      roots.push(root);
      const remote = path.join(root, 'remote.git');
      const seed = path.join(root, 'seed');
      const cwd = path.join(root, 'clone');
      fs.mkdirSync(seed);
      runGit(root, ['init', '--bare', remote]);
      runGit(seed, ['init', '-b', 'main']);
      runGit(seed, ['config', 'user.name', 'Test']);
      runGit(seed, ['config', 'user.email', 'test@example.com']);
      fs.writeFileSync(path.join(seed, 'README.md'), 'main\n');
      runGit(seed, ['add', 'README.md']);
      runGit(seed, ['commit', '-m', 'main']);
      runGit(seed, ['remote', 'add', 'origin', remote]);
      runGit(seed, ['push', '-u', 'origin', 'main']);
      runGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
      runGit(seed, ['checkout', '-b', '42-ship-it']);
      fs.writeFileSync(path.join(seed, 'spec.txt'), 'approved\n');
      runGit(seed, ['add', 'spec.txt']);
      runGit(seed, ['commit', '-m', 'spec']);
      const specHead = runGit(seed, ['rev-parse', 'HEAD']).stdout.trim();
      runGit(seed, ['push', '-u', 'origin', '42-ship-it']);
      runGit(seed, ['checkout', 'main']);
      runGit(seed, ['merge', '--no-ff', '-m', 'merge spec', '42-ship-it']);
      fs.appendFileSync(path.join(seed, 'README.md'), 'later default work\n');
      runGit(seed, ['commit', '-am', 'later default work']);
      runGit(seed, ['push', 'origin', 'main']);
      const defaultHead = runGit(seed, ['rev-parse', 'HEAD']).stdout.trim();
      runGit(root, ['clone', '--single-branch', remote, cwd]);
      if (reuseMode !== 'remote-only') {
        runGit(cwd, [
          'fetch', 'origin',
          'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
        ]);
        runGit(cwd, ['branch', '--track', '42-ship-it', 'origin/42-ship-it']);
      }
      if (reuseMode === 'current') runGit(cwd, ['checkout', '42-ship-it']);

      const calls = [];
      const run = (command, args) => {
        calls.push([command, ...args]);
        if (command === 'git') return runGit(cwd, args);
        if (command === 'gh' && args[0] === 'issue' && args[1] === 'view') {
          return {
            status: 0,
            stdout: JSON.stringify({
              number: 42, title: 'Ship It!', body: '', labels: [],
              state: args.includes('number,title,body,labels,state') ? 'OPEN' : 'open',
            }),
            stderr: '',
          };
        }
        if (command === 'gh' && args[0] === 'repo' && args.includes('nameWithOwner')) {
          return { status: 0, stdout: '{"nameWithOwner":"nmg/repo"}', stderr: '' };
        }
        if (command === 'gh' && args[0] === 'repo' && args.includes('defaultBranchRef')) {
          return { status: 0, stdout: 'main\n', stderr: '' };
        }
        if (command === 'gh' && args[0] === 'repo') {
          return { status: 0, stdout: '{"owner":{"login":"nmg"},"name":"repo"}', stderr: '' };
        }
        if (command === 'gh' && args[0] === 'api' && args.includes('--paginate')) {
          return { status: 0, stdout: '[[]]', stderr: '' };
        }
        if (command === 'gh' && args[0] === 'api' && /^repos\/nmg\/repo\/issues\/42$/.test(args[1] || '')) {
          return {
            status: 0,
            stdout: '{"id":4200,"number":42,"state":"open","title":"Ship It!","repository_url":"https://api.github.com/repos/nmg/repo"}',
            stderr: '',
          };
        }
        if (command === 'gh' && args[0] === 'api') {
          return {
            status: 0,
            stdout: '{"data":{"repository":{"issue":{"projectItems":{"nodes":[]}}}}}',
            stderr: '',
          };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
      };

      const result = startIssue({ issue: 42, cwd, run });

      expect(result.handoff.status).toBe('passed');
      expect(runGit(cwd, ['branch', '--show-current']).stdout.trim()).toBe('42-ship-it');
      expect(runGit(cwd, ['rev-parse', 'HEAD']).stdout.trim()).toBe(defaultHead);
      expect(runGit(cwd, ['rev-parse', 'origin/42-ship-it']).stdout.trim()).toBe(defaultHead);
      expect(runGit(remote, ['rev-parse', 'refs/heads/42-ship-it']).stdout.trim()).toBe(defaultHead);
      expect(calls).toContainEqual(['git', 'merge', '--ff-only', defaultHead]);
      expect(calls.some((call) => call[0] === 'git' && call[1] === 'push')).toBe(true);
      expect(calls.some((call) => call.includes('--force') || call.includes('--reset'))).toBe(false);
    },
  );

  it('preserves a divergent current issue branch and its canonical remote', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-start-divergent-branch-'));
    roots.push(root);
    const remote = path.join(root, 'remote.git');
    const seed = path.join(root, 'seed');
    const cwd = path.join(root, 'clone');
    fs.mkdirSync(seed);
    runGit(root, ['init', '--bare', remote]);
    runGit(seed, ['init', '-b', 'main']);
    runGit(seed, ['config', 'user.name', 'Test']);
    runGit(seed, ['config', 'user.email', 'test@example.com']);
    fs.writeFileSync(path.join(seed, 'README.md'), 'main\n');
    runGit(seed, ['add', 'README.md']);
    runGit(seed, ['commit', '-m', 'main']);
    runGit(seed, ['remote', 'add', 'origin', remote]);
    runGit(seed, ['push', '-u', 'origin', 'main']);
    runGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    runGit(seed, ['checkout', '-b', '42-ship-it']);
    fs.writeFileSync(path.join(seed, 'spec.txt'), 'approved\n');
    runGit(seed, ['add', 'spec.txt']);
    runGit(seed, ['commit', '-m', 'spec']);
    const remoteIssueHead = runGit(seed, ['rev-parse', 'HEAD']).stdout.trim();
    runGit(seed, ['push', '-u', 'origin', '42-ship-it']);
    runGit(seed, ['checkout', 'main']);
    runGit(seed, ['merge', '--no-ff', '-m', 'merge spec', '42-ship-it']);
    fs.appendFileSync(path.join(seed, 'README.md'), 'later default work\n');
    runGit(seed, ['commit', '-am', 'later default work']);
    runGit(seed, ['push', 'origin', 'main']);
    runGit(root, ['clone', remote, cwd]);
    runGit(cwd, ['config', 'user.name', 'Test']);
    runGit(cwd, ['config', 'user.email', 'test@example.com']);
    runGit(cwd, ['checkout', '--track', '-b', '42-ship-it', 'origin/42-ship-it']);
    fs.writeFileSync(path.join(cwd, 'implementation.txt'), 'local implementation\n');
    runGit(cwd, ['add', 'implementation.txt']);
    runGit(cwd, ['commit', '-m', 'local implementation']);
    const localHead = runGit(cwd, ['rev-parse', 'HEAD']).stdout.trim();

    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      if (command === 'git') return runGit(cwd, args);
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({
            number: 42, title: 'Ship It!', body: '', labels: [],
            state: args.includes('number,title,body,labels,state') ? 'OPEN' : 'open',
          }),
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'repo' && args.includes('nameWithOwner')) {
        return { status: 0, stdout: '{"nameWithOwner":"nmg/repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo' && args.includes('defaultBranchRef')) {
        return { status: 0, stdout: 'main\n', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo') {
        return { status: 0, stdout: '{"owner":{"login":"nmg"},"name":"repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && args.includes('--paginate')) {
        return { status: 0, stdout: '[[]]', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && /^repos\/nmg\/repo\/issues\/42$/.test(args[1] || '')) {
        return {
          status: 0,
          stdout: '{"id":4200,"number":42,"state":"open","title":"Ship It!","repository_url":"https://api.github.com/repos/nmg/repo"}',
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'api') {
        return {
          status: 0,
          stdout: '{"data":{"repository":{"issue":{"projectItems":{"nodes":[]}}}}}',
          stderr: '',
        };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };

    const result = startIssue({ issue: 42, cwd, run });

    expect(result.handoff).toMatchObject({ status: 'failed', reasonCode: 'branch_checkout_failed' });
    expect(runGit(cwd, ['rev-parse', 'HEAD']).stdout.trim()).toBe(localHead);
    expect(runGit(cwd, ['rev-parse', 'origin/42-ship-it']).stdout.trim()).toBe(remoteIssueHead);
    expect(runGit(remote, ['rev-parse', 'refs/heads/42-ship-it']).stdout.trim()).toBe(remoteIssueHead);
    expect(calls).toContainEqual([
      'git', 'fetch', '--quiet', '--no-tags', 'origin',
      'refs/heads/42-ship-it:refs/remotes/origin/42-ship-it',
    ]);
    expect(calls.some((call) => call[0] === 'git' && call[1] === 'push')).toBe(false);
    expect(calls.some((call) => call.includes('--force') || call.includes('--reset'))).toBe(false);
  });


  it('develops the issue branch from a clean detached HEAD', () => {
    const f = fixture({ branch: '', dirty: '' });
    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(result.handoff.status).toBe('passed');
    expect(f.calls).toContainEqual([
      'gh', 'issue', 'develop', '42', '--checkout', '--name', '42-ship-it', '--base', 'main',
    ]);
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'config' && call[2] === '--add')).toBe(false);
  });

  it.each([
    ['failed lookup', 1, 'main'],
    ['empty successful lookup', 0, ''],
  ])('writes default_branch_unreadable for a reused branch with %s', (_label, defaultStatus, defaultBranch) => {
    const f = fixture({ branch: '42-ship-it', defaultStatus, defaultBranch });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd).reasonCode).toBe('default_branch_unreadable');
  });

  it('fails closed when an existing local branch cannot be checked out', () => {
    const f = fixture({ localBranch: true, checkoutStatus: 1, checkedOutBranch: 'main' });

    startIssue({ issue: 42, cwd: f.cwd, run: f.run });

    expect(handoff(f.cwd).reasonCode).toBe('branch_checkout_failed');
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'issue' && call[2] === 'develop')).toBe(false);
  });

  it('writes branch_checkout_failed', () => {
    const f = fixture({ developStatus: 1, checkedOutBranch: 'main' });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd).reasonCode).toBe('branch_checkout_failed');
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

  it('passes with spike labels and ignores project status failure', () => {
    const f = fixture({ issue: { number: 42, title: 'Ship It!', body: '', labels: [{ name: 'spike' }], state: 'OPEN' }, projectThrows: true });
    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(result.handoff).toMatchObject({ status: 'passed', next: 'implement', intervention: false });
    expect(handoff(f.cwd).reasonCode).toBeNull();
  });

  it('blocks checkout when branch owned by another worktree (PennyScan-like) and leaves other worktree unchanged', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-start-worktree-own-'));
    roots.push(root);
    const remote = path.join(root, 'remote.git');
    const seed = path.join(root, 'seed');
    const cwd = path.join(root, 'clone');
    const wt = path.join(root, 'worktree');
    fs.mkdirSync(seed);
    runGit(root, ['init', '--bare', remote]);
    runGit(seed, ['init', '-b', 'main']);
    runGit(seed, ['config', 'user.name', 'Test']);
    runGit(seed, ['config', 'user.email', 'test@example.com']);
    fs.writeFileSync(path.join(seed, 'README.md'), 'main\n');
    runGit(seed, ['add', 'README.md']);
    runGit(seed, ['commit', '-m', 'main']);
    runGit(seed, ['remote', 'add', 'origin', remote]);
    runGit(seed, ['push', '-u', 'origin', 'main']);
    runGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    runGit(seed, ['checkout', '-b', '42-ship-it']);
    fs.writeFileSync(path.join(seed, 'spec.txt'), 'approved spec\n');
    runGit(seed, ['add', 'spec.txt']);
    runGit(seed, ['commit', '-m', 'spec']);
    const specHead = runGit(seed, ['rev-parse', 'HEAD']).stdout.trim();
    runGit(seed, ['push', '-u', 'origin', '42-ship-it']);
    runGit(root, ['clone', remote, cwd]);
    runGit(cwd, ['config', 'user.name', 'Test']);
    runGit(cwd, ['config', 'user.email', 'test@example.com']);
    // other worktree owns the branch
    runGit(cwd, ['worktree', 'add', wt, '42-ship-it']);
    expect(runGit(wt, ['rev-parse', 'HEAD']).stdout.trim()).toBe(specHead);
    expect(runGit(cwd, ['branch', '--show-current']).stdout.trim()).toBe('main');

    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      if (command === 'git') return runGit(cwd, args);
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({ number: 42, title: 'Ship It!', body: '', labels: [], state: 'OPEN' }),
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'repo' && args.includes('nameWithOwner')) {
        return { status: 0, stdout: '{"nameWithOwner":"nmg/repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo' && args.includes('defaultBranchRef')) {
        return { status: 0, stdout: 'main\n', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo') {
        return { status: 0, stdout: '{"owner":{"login":"nmg"},"name":"repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && args.includes('--paginate')) {
        return { status: 0, stdout: '[[]]', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && /^repos\/nmg\/repo\/issues\/42$/.test(args[1] || '')) {
        return { status: 0, stdout: '{"id":4200,"number":42,"state":"open","title":"Ship It!","repository_url":"https://api.github.com/repos/nmg/repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api') {
        return { status: 0, stdout: '{"data":{"repository":{"issue":{"projectItems":{"nodes":[]}}}}}', stderr: '' };
      }
      throw new Error(`Unexpected: ${command} ${args.join(' ')}`);
    };

    const result = startIssue({ issue: 42, cwd, run });
    expect(result.handoff).toMatchObject({ status: 'failed', reasonCode: 'branch_checkout_failed' });
    // other worktree branch head unchanged
    expect(runGit(wt, ['rev-parse', 'HEAD']).stdout.trim()).toBe(specHead);
    expect(runGit(cwd, ['branch', '--show-current']).stdout.trim()).toBe('main');
    // no push or reconcile attempted
    expect(calls.some((c) => c[0] === 'git' && c[1] === 'push')).toBe(false);
    expect(calls.some((c) => c[0] === 'git' && c[1] === 'merge' && !c.includes('--ff-only'))).toBe(false);
  });

  it('reconciles squash-merged approved spec branch after release, pushes exact, records branch/head in handoff (PennyScan-like)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-start-squash-recon-'));
    roots.push(root);
    const remote = path.join(root, 'remote.git');
    const seed = path.join(root, 'seed');
    const cwd = path.join(root, 'clone');
    fs.mkdirSync(seed);
    runGit(root, ['init', '--bare', remote]);
    runGit(seed, ['init', '-b', 'main']);
    runGit(seed, ['config', 'user.name', 'Test']);
    runGit(seed, ['config', 'user.email', 'test@example.com']);
    fs.writeFileSync(path.join(seed, 'README.md'), 'main\n');
    fs.writeFileSync(path.join(seed, '.gitignore'), '.omp/sdlc/\n');
    runGit(seed, ['add', 'README.md', '.gitignore']);
    runGit(seed, ['commit', '-m', 'main']);
    runGit(seed, ['remote', 'add', 'origin', remote]);
    runGit(seed, ['push', '-u', 'origin', 'main']);
    runGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    runGit(seed, ['checkout', '-b', '42-ship-it']);
    const specDir = 'specs/42-ship-it';
    const specFiles = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];
    fs.mkdirSync(path.join(seed, specDir), { recursive: true });
    for (const file of specFiles) {
      fs.writeFileSync(path.join(seed, specDir, file), `**Issue**: #42\n**Status**: Approved\n${file}\n`);
    }
    runGit(seed, ['add', specDir]);
    runGit(seed, ['commit', '-m', 'spec']);
    const specHead = runGit(seed, ['rev-parse', 'HEAD']).stdout.trim();
    runGit(seed, ['push', '-u', 'origin', '42-ship-it']);
    // squash merge on default (no ancestry link)
    runGit(seed, ['checkout', 'main']);
    runGit(seed, ['merge', '--squash', '42-ship-it']);
    runGit(seed, ['commit', '-m', 'docs: approve spec for #42']);
    runGit(seed, ['push', 'origin', 'main']);
    const defaultAfter = runGit(seed, ['rev-parse', 'HEAD']).stdout.trim();
    // remote issue ref remains at specHead (as in observed PennyScan retain)
    expect(runGit(remote, ['rev-parse', 'refs/heads/42-ship-it']).stdout.trim()).toBe(specHead);
    runGit(root, ['clone', remote, cwd]);
    runGit(cwd, ['config', 'user.name', 'Test']);
    runGit(cwd, ['config', 'user.email', 'test@example.com']);
    const owner = path.join(root, 'owner-worktree');
    expect(runGit(cwd, ['worktree', 'add', '-b', '42-ship-it', owner, 'origin/42-ship-it']).status).toBe(0);
    expect(runGit(cwd, ['rev-parse', 'HEAD']).stdout.trim()).toBe(defaultAfter);

    const calls = [];
    let forkSource = true;
    const run = (command, args) => {
      calls.push([command, ...args]);
      if (command === 'git') return runGit(cwd, args);
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({
            number: 42, title: 'Ship It!', body: '', labels: [],
            state: args.includes('number,title,body,labels,state') ? 'OPEN' : 'open',
          }),
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'repo' && args.includes('nameWithOwner')) {
        return { status: 0, stdout: '{"nameWithOwner":"nmg/repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo' && args.includes('defaultBranchRef')) {
        return { status: 0, stdout: 'main\n', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo') {
        return { status: 0, stdout: '{"owner":{"login":"nmg"},"name":"repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && args.includes('--paginate')) {
        return { status: 0, stdout: '[[]]', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && /^repos\/nmg\/repo\/issues\/42$/.test(args[1] || '')) {
        return { status: 0, stdout: '{"id":4200,"number":42,"state":"open","title":"Ship It!","repository_url":"https://api.github.com/repos/nmg/repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api') {
        return { status: 0, stdout: '{"data":{"repository":{"issue":{"projectItems":{"nodes":[]}}}}}', stderr: '' };
      }
      // prove squash provenance for this exact old head
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'list' && args.includes('--state') && args.includes('all')) {
        return { status: 0, stdout: JSON.stringify([{ number: 228, headRefOid: specHead, state: 'MERGED' }]), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'view' && args[2] === '228') {
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
      throw new Error(`Unexpected: ${command} ${args.join(' ')}`);
    };

    const blocked = startIssue({ issue: 42, cwd, run });
    expect(blocked.handoff).toMatchObject({ status: 'failed', reasonCode: 'branch_checkout_failed' });
    expect(runGit(owner, ['rev-parse', 'HEAD']).stdout.trim()).toBe(specHead);
    expect(runGit(cwd, ['worktree', 'remove', owner]).status).toBe(0);
    const wrongSource = startIssue({ issue: 42, cwd, run });
    expect(wrongSource.handoff).toMatchObject({ status: 'failed', reasonCode: 'divergent_unproven' });
    expect(calls.some((call) => call[0] === 'git' && call[1] === 'push')).toBe(false);
    forkSource = false;
    const result = startIssue({ issue: 42, cwd, run });
    expect(result.handoff.status).toBe('passed');
    expect(result.handoff.branch).toBe('42-ship-it');
    expect(result.handoff.head).toMatch(/^[0-9a-f]{40}$/);
    const afterHead = runGit(cwd, ['rev-parse', 'HEAD']).stdout.trim();
    expect(result.handoff.head).toBe(afterHead);
    // remote was pushed to the reconciled head
    const remoteAfter = runGit(remote, ['rev-parse', 'refs/heads/42-ship-it']).stdout.trim();
    expect(remoteAfter).toBe(afterHead);
    expect(remoteAfter).not.toBe(specHead);
    // used non-ff merge and push, no force
    expect(calls.some((c) => c[0] === 'git' && c[1] === 'merge' && c.includes(defaultAfter))).toBe(true);
    expect(calls).toContainEqual(['git', 'push', 'origin', `${afterHead}:refs/heads/42-ship-it`]);
    expect(calls.some((c) => c.includes('--force') || c.includes('--reset'))).toBe(false);
    // default history incorporated (parent of merge includes defaultAfter)
    const parents = runGit(cwd, ['log', '-1', '--pretty=%P', 'HEAD']).stdout.trim().split(' ');
    expect(parents).toContain(defaultAfter);
  });

  it('fails closed on unrelated divergence even for squash-proven branch (stays blocked, pre-fix expectation preserved)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-start-squash-unsafe-'));
    roots.push(root);
    const remote = path.join(root, 'remote.git');
    const seed = path.join(root, 'seed');
    const cwd = path.join(root, 'clone');
    fs.mkdirSync(seed);
    runGit(root, ['init', '--bare', remote]);
    runGit(seed, ['init', '-b', 'main']);
    runGit(seed, ['config', 'user.name', 'Test']);
    runGit(seed, ['config', 'user.email', 'test@example.com']);
    fs.writeFileSync(path.join(seed, 'README.md'), 'main\n');
    runGit(seed, ['add', 'README.md']);
    runGit(seed, ['commit', '-m', 'main']);
    runGit(seed, ['remote', 'add', 'origin', remote]);
    runGit(seed, ['push', '-u', 'origin', 'main']);
    runGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    runGit(seed, ['checkout', '-b', '42-ship-it']);
    fs.writeFileSync(path.join(seed, 'spec.txt'), 'approved\n');
    runGit(seed, ['add', 'spec.txt']);
    runGit(seed, ['commit', '-m', 'spec']);
    const specHead = runGit(seed, ['rev-parse', 'HEAD']).stdout.trim();
    runGit(seed, ['push', '-u', 'origin', '42-ship-it']);
    runGit(seed, ['checkout', 'main']);
    runGit(seed, ['merge', '--squash', '42-ship-it']);
    runGit(seed, ['commit', '-m', 'docs: approve spec for #42']);
    runGit(seed, ['push', 'origin', 'main']);
    runGit(root, ['clone', remote, cwd]);
    runGit(cwd, ['config', 'user.name', 'Test']);
    runGit(cwd, ['config', 'user.email', 'test@example.com']);
    runGit(cwd, ['checkout', '--track', '-b', '42-ship-it', 'origin/42-ship-it']);
    // unrelated local divergence
    fs.writeFileSync(path.join(cwd, 'impl.txt'), 'dirty work\n');
    runGit(cwd, ['add', 'impl.txt']);
    runGit(cwd, ['commit', '-m', 'local unrelated']);
    const localDivergeHead = runGit(cwd, ['rev-parse', 'HEAD']).stdout.trim();

    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      if (command === 'git') return runGit(cwd, args);
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view') {
        return { status: 0, stdout: JSON.stringify({ number: 42, title: 'Ship It!', body: '', labels: [], state: 'OPEN' }), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo' && (args.includes('nameWithOwner') || args.includes('defaultBranchRef') || args[0]==='repo')) {
        if (args.includes('defaultBranchRef')) return { status: 0, stdout: 'main\n', stderr: '' };
        if (args.includes('nameWithOwner')) return { status: 0, stdout: '{"nameWithOwner":"nmg/repo"}', stderr: '' };
        return { status: 0, stdout: '{"owner":{"login":"nmg"},"name":"repo"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api') {
        if (args.includes('--paginate')) return { status: 0, stdout: '[[]]', stderr: '' };
        if (/^repos\/nmg\/repo\/issues\/42$/.test(args[1]||'')) return { status: 0, stdout: '{"id":4200,"number":42,"state":"open","title":"Ship It!"}', stderr: '' };
        return { status: 0, stdout: '{"data":{"repository":{"issue":{"projectItems":{"nodes":[]}}}}}', stderr: '' };
      }
      // even if pr would match, the local != remote will block before
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'list') {
        return { status: 0, stdout: JSON.stringify([{ number: 228, headRefOid: specHead, state: 'MERGED' }]), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        return { status: 0, stdout: JSON.stringify({ number: 228, state: 'MERGED', headRefName: '42-ship-it', headRefOid: specHead, baseRefName: 'main' }), stderr: '' };
      }
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    };

    const result = startIssue({ issue: 42, cwd, run });
    expect(result.handoff).toMatchObject({ status: 'failed', reasonCode: 'branch_checkout_failed' });
    expect(runGit(cwd, ['rev-parse', 'HEAD']).stdout.trim()).toBe(localDivergeHead);
    expect(calls.some((c) => c[0]==='git' && c[1]==='push')).toBe(false);
    expect(calls.some((c) => c[0]==='git' && c[1]==='merge' && !String(c).includes('ff-only'))).toBe(false);
  });

  // also strengthen one passed case with branch/head expectation (old fixtures preserved)
  it('includes branch and head on passed handoff for fresh develop case', () => {
    const f = fixture({ branch: '', dirty: '' });
    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(result.handoff.status).toBe('passed');
    expect(result.handoff.branch).toBe('42-ship-it');
    expect(result.handoff.head).toMatch(/^[0-9a-f]{40}$/);
  });
});
