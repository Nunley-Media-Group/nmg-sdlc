import { afterEach, describe, expect, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs,
  selectBacklog,
  validateHandoff,
  nextStep,
  isSpecApproved,
  specStatus,
  workerPrompt,
  writeRun,
} from '../sdlc-execute.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sdlc-execute.mjs');

const temporaryRoots = [];

function makeSpecDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-spec-'));
  temporaryRoots.push(root);
  return root;
}

function writeApproved(dir, issueN, extra = {}) {
  const body = [
    extra.issue === undefined ? `**Issue**: #${issueN}` : extra.issue,
    extra.status === undefined ? '**Status**: Approved' : extra.status,
    '',
    extra.body ?? 'content',
    '',
  ].filter((line) => line !== null).join('\n');
  for (const name of extra.files ?? ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
    fs.writeFileSync(path.join(dir, name), body);
  }
}


describe('sdlc-execute helpers (SCN001–SCN007)', () => {
  it('parseArgs empty defaults to backlog', () => {
    expect(parseArgs('')).toEqual({ issues: [], defaultBacklog: true });
    expect(parseArgs('   ')).toEqual({ issues: [], defaultBacklog: true });
  });

  it('parseArgs collects unique numbers in given order', () => {
    expect(parseArgs('#12 #10')).toEqual({ issues: [12, 10], defaultBacklog: false });
    expect(parseArgs('#12 #12')).toEqual({ issues: [12], defaultBacklog: false });
  });

  it('parseArgs rejects other tokens and lists over 20', () => {
    expect(() => parseArgs('foo')).toThrow(/Usage: \/sdlc-execute \[#N \.\.\.\]/);
    const twentyOne = Array.from({ length: 21 }, (_, index) => `#${index + 1}`).join(' ');
    expect(() => parseArgs(twentyOne)).toThrow();
  });

  it('selectBacklog returns the lowest unblocked non-Done issue', () => {
    const issues = [
      { number: 8, title: 'Later', labels: [], body: '' },
      { number: 3, title: 'First', labels: [], body: '' },
    ];
    expect(selectBacklog({
      issues,
      parentStates: {},
      projectStatuses: {},
    })).toBe(3);
  });

  it('selectBacklog drops open Depends-on parents and Project Done', () => {
    const issues = [
      { number: 8, title: 'Ready', labels: [], body: '' },
      { number: 3, title: 'Blocked', labels: [], body: 'Depends on: #1\n' },
      { number: 4, title: 'Done', labels: [], body: '' },
    ];
    expect(selectBacklog({
      issues,
      parentStates: { 1: 'OPEN' },
      projectStatuses: { 4: ['Done'] },
    })).toBe(8);
  });

  it('selectBacklog throws when parent state is unreadable', () => {
    expect(() => selectBacklog({
      issues: [{ number: 3, title: 'Blocked', labels: [], body: 'Depends on: #1\n' }],
      parentStates: {},
      parentLookupError: new Error('graphql failed'),
    })).toThrow();
  });

  it('validateHandoff accepts a golden passed object', () => {
    const handoff = {
      schemaVersion: 1,
      issue: 42,
      step: 'verify',
      status: 'passed',
      intervention: false,
      summary: 'ok',
      artifacts: ['specs/42-slug/verification-report.md'],
      next: 'deliver',
      reasonCode: null,
    };
    expect(validateHandoff(handoff)).toEqual(handoff);
  });

  it('validateHandoff rejects missing status', () => {
    expect(() => validateHandoff({
      schemaVersion: 1,
      issue: 42,
      step: 'verify',
      intervention: false,
      summary: 'ok',
      artifacts: [],
      next: 'deliver',
      reasonCode: null,
    })).toThrow();
  });

  it('nextStep skips completed prefix steps', () => {
    expect(nextStep(['start', 'implement'])).toBe('verify');
  });

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('isSpecApproved rejects a directory missing required artifacts', () => {
    const dir = makeSpecDir();
    fs.writeFileSync(path.join(dir, 'design.md'), '**Issue**: #42\n**Status**: Approved\n');
    expect(isSpecApproved(dir, 42)).toBe(false);
  });

  it('isSpecApproved rejects files with no Issue field', () => {
    const dir = makeSpecDir();
    writeApproved(dir, 42, { issue: null });
    expect(isSpecApproved(dir, 42)).toBe(false);
  });

  it('isSpecApproved accepts four approved files for the matching issue', () => {
    const dir = makeSpecDir();
    writeApproved(dir, 42);
    expect(isSpecApproved(dir, 42)).toBe(true);
    expect(isSpecApproved(dir, 7)).toBe(false);
  });

  it('isSpecApproved rejects trailing data on Issue and Status lines', () => {
    const extraIssue = makeSpecDir();
    writeApproved(extraIssue, 42, { issue: '**Issue**: #42, #43' });
    expect(isSpecApproved(extraIssue, 42)).toBe(false);

    const extraStatus = makeSpecDir();
    writeApproved(extraStatus, 42, { status: '**Status**: Approved extra' });
    expect(isSpecApproved(extraStatus, 42)).toBe(false);
  });

  it('writeRun creates run and handoff state beneath the supplied root', () => {
    const root = makeSpecDir();
    writeRun({ schemaVersion: 1 }, root);
    expect(fs.existsSync(path.join(root, '.omp', 'sdlc', 'run.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.omp', 'sdlc', 'handoffs'))).toBe(true);
  });

  it('workerPrompt and CLI inline start-issue without /skill:', () => {
    const prompt = workerPrompt({ step: 'start', issue: 42 });
    expect(prompt).toContain('# Start Issue');
    expect(prompt).toContain('$ARGUMENTS: #42');
    expect(prompt).not.toMatch(/\/skill:/);

    const cli = spawnSync(process.execPath, [SCRIPT, 'worker-prompt', '--step', 'start', '--issue', '42'], {
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain('# Start Issue');
    expect(cli.stdout).not.toMatch(/\/skill:/);
  });

  it('workerPrompt inlines extra workflows for implement and deliver', () => {
    expect(workerPrompt({ step: 'implement', issue: 42 })).toContain('# Simplify');
    expect(workerPrompt({ step: 'deliver', issue: 42 })).toContain('# Address PR Comments');
  });

  it('write-run CLI persists run state', () => {
    const root = makeSpecDir();
    const run = { schemaVersion: 1 };
    const cli = spawnSync(process.execPath, [SCRIPT, 'write-run', JSON.stringify(run)], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(root, '.omp/sdlc/run.json'), 'utf8'))).toEqual(run);
  });

  it('specStatus keeps a worktree Draft unapproved when origin is Approved', () => {
    const { root } = makeGitRepo();
    const specDir = path.join(root, 'specs', '42-add-x');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 42);
    git(root, ['checkout', '-b', '42-add-x']);
    git(root, ['add', 'specs/42-add-x']);
    git(root, ['commit', '-m', 'docs: approve spec for #42']);
    git(root, ['push', '-u', 'origin', 'HEAD']);
    git(root, ['checkout', 'main']);
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 42, { status: '**Status**: Draft' });
    expect(specStatus(42, root)).toEqual({
      dir: specDir,
      approved: false,
    });
  });

  it('specStatus treats a unique origin approved branch as approved', () => {
    const { root } = makeGitRepo();
    const specDir = path.join(root, 'specs', '42-add-x');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 42);
    git(root, ['checkout', '-b', '42-add-x']);
    git(root, ['add', 'specs/42-add-x']);
    git(root, ['commit', '-m', 'docs: approve spec for #42']);
    git(root, ['push', '-u', 'origin', 'HEAD']);
    git(root, ['checkout', 'main']);
    git(root, ['branch', '-D', '42-add-x']);
    fs.rmSync(path.join(root, 'specs'), { recursive: true, force: true });
    expect(specStatus(42, root)).toEqual({
      dir: 'specs/42-add-x',
      approved: true,
      ref: 'origin/42-add-x',
    });
  });

  it('specStatus treats two local issue branches as unapproved', () => {
    const { root } = makeGitRepo();
    git(root, ['checkout', '-b', '42-add-x']);
    git(root, ['checkout', 'main']);
    git(root, ['checkout', '-b', '42-other']);
    git(root, ['checkout', 'main']);
    expect(specStatus(42, root)).toEqual({ dir: null, approved: false });
  });

});

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

function makeGitRepo() {
  const root = makeSpecDir();
  const remote = makeSpecDir();
  execFileSync('git', ['init', '--bare'], { cwd: remote, encoding: 'utf8' });
  git(root, ['init', '-b', 'main']);
  fs.writeFileSync(path.join(root, 'README.md'), 'root\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'init']);
  git(root, ['remote', 'add', 'origin', remote]);
  git(root, ['push', '-u', 'origin', 'HEAD']);
  return { root, remote };
}
