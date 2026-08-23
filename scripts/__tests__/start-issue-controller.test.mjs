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

function fixture({
  issueStatus = 0,
  issue = { number: 42, title: 'Ship It!', body: '', labels: [], state: 'OPEN' },
  parentStatus = 0,
  parentState = 'CLOSED',
  branch = 'main',
  dirty = '',
  defaultStatus = 0,
  defaultBranch = 'main',
  developStatus = 0,
  checkedOutBranch = '42-ship-it',
  projectThrows = false,
} = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-start-controller-'));
  roots.push(cwd);
  const calls = [];
  let branchReads = 0;
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
    if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.includes('state')) {
      return { status: parentStatus, stdout: parentStatus === 0 ? JSON.stringify({ state: parentState }) : '', stderr: '' };
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

  it('develops the issue branch from a clean detached HEAD', () => {
    const f = fixture({ branch: '', dirty: '' });
    const result = startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(result.handoff.status).toBe('passed');
    expect(f.calls).toContainEqual([
      'gh', 'issue', 'develop', '42', '--checkout', '--name', '42-ship-it', '--base', 'main',
    ]);
  });

  it('writes default_branch_unreadable', () => {
    const f = fixture({ defaultStatus: 1 });
    startIssue({ issue: 42, cwd: f.cwd, run: f.run });
    expect(handoff(f.cwd).reasonCode).toBe('default_branch_unreadable');
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
