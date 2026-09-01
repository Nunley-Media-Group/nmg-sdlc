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
      return { status: remoteBranch || (remoteBranchAfterDevelop && developAttempted) ? 0 : 1, stdout: '', stderr: '' };
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
    if (command === 'git' && args[0] === 'branch') {
      branchReads += 1;
      return { status: 0, stdout: `${branchReads === 1 ? branch : checkedOutBranch}\n`, stderr: '' };
    }
    if (command === 'git' && args[0] === 'status') return { status: 0, stdout: dirty, stderr: '' };
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
    const f = fixture({ localBranch: true });
    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(result.handoff.status).toBe('passed');
    expect(f.calls).toContainEqual([
      'git', 'show-ref', '--verify', '--quiet', 'refs/heads/42-ship-it',
    ]);
    expect(f.calls).toContainEqual(['git', 'checkout', '42-ship-it']);
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'fetch')).toBe(false);
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
    expect(f.calls.filter((call) => call[0] === 'git' && call[1] === 'fetch')).toHaveLength(2);
    expect(f.calls).toContainEqual([
      'gh', 'issue', 'develop', '42', '--checkout', '--name', '42-ship-it', '--base', 'main',
    ]);
    expect(f.calls).toContainEqual([
      'git', 'checkout', '--track', '-b', '42-ship-it', 'origin/42-ship-it',
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


  it('develops the issue branch from a clean detached HEAD', () => {
    const f = fixture({ branch: '', dirty: '' });
    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(result.handoff.status).toBe('passed');
    expect(f.calls).toContainEqual([
      'gh', 'issue', 'develop', '42', '--checkout', '--name', '42-ship-it', '--base', 'main',
    ]);
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'config' && call[2] === '--add')).toBe(false);
  });

  it('writes default_branch_unreadable', () => {
    const f = fixture({ defaultStatus: 1 });
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

  it('passes with spike labels and ignores project status failure', () => {
    const f = fixture({ issue: { number: 42, title: 'Ship It!', body: '', labels: [{ name: 'spike' }], state: 'OPEN' }, projectThrows: true });
    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(result.handoff).toMatchObject({ status: 'passed', next: 'implement', intervention: false });
    expect(handoff(f.cwd).reasonCode).toBeNull();
  });
});
