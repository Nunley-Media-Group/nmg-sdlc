import { afterEach, describe, expect, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs,
  VALID_STEPS,
  selectBacklog,
  validateHandoff,
  nextStep,
  remediationCompletedSteps,
  isSpecApproved,
  specStatus,
  workerPrompt,
  REMEDIABLE_STEPS,
  remAgentName,
  isRemediableFailedHandoff,
  remediationPrompt,
  writeRun,
  cleanupCompletedRun,
  runExecute,
  listSpecifiedIssues,
  defaultHerdr,
} from '../sdlc-execute.mjs';
import {
  acquireControllerLease,
  releaseControllerLease,
} from '../sdlc-controller-lease.mjs';
import { startIssue } from '../start-issue.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sdlc-execute.mjs');


const temporaryRoots = [];

function makeSpecDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-spec-'));
  temporaryRoots.push(root);
  return root;
}

function boundRunData(root, fields = {}) {
  const currentIssue = fields.currentIssue ?? 42;
  const currentStep = fields.currentStep ?? 'start';
  const workerName = `s${currentIssue}-${currentStep}`;
  const defaultPane = {
    start: 'kept-pane',
    implement: 'kept-implement-pane',
    review1: 'kept-review-pane',
    review2: 'kept-review-pane',
    verify: 'kept-verify-pane',
    deliver: 'kept-deliver-pane',
  }[currentStep] ?? `kept-${currentStep}-pane`;
  return {
    schemaVersion: 1,
    projectRoot: fields.projectRoot ?? fs.realpathSync(root),
    runId: fields.runId ?? 'test-run-id',
    issue: fields.issue ?? currentIssue,
    branch: fields.branch ?? 'issue-branch',
    head: fields.head ?? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    issues: fields.issues ?? [currentIssue],
    revision: fields.revision ?? 1,
    currentIssue,
    currentStep,
    completed: { [currentIssue]: [] },
    failed: null,
    workers: currentStep ? {
      [workerName]: {
        name: workerName,
        paneId: fields.workerPaneId ?? defaultPane,
        projectRoot: fields.projectRoot ?? fs.realpathSync(root),
        runId: fields.runId ?? 'test-run-id',
        issue: currentIssue,
        step: currentStep,
        branch: fields.workerBranch ?? '42-ship-it',
        head: fields.workerHead ?? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    } : {},
    startedAt: '2026-08-27T00:00:00.000Z',
    ...fields,
  };
}

function seedRun(root, fields = {}) {
  const runData = boundRunData(root, fields);
  writeRun(runData, root, 0);
  return runData;
}

function legacyRunData(fields = {}) {
  return {
    schemaVersion: 1,
    issues: [6],
    currentIssue: null,
    currentStep: null,
    completed: { 6: VALID_STEPS },
    failed: null,
    startedAt: '<legacy timestamp>',
    ...fields,
  };
}

function writeLegacyRun(root, fields = {}, newline = '\n') {
  const data = legacyRunData(fields);
  const runPath = path.join(root, '.omp', 'sdlc', 'run.json');
  fs.mkdirSync(path.dirname(runPath), { recursive: true });
  const serialized = `${JSON.stringify(data, null, 2)}\n`.replaceAll('\n', newline);
  const bytes = Buffer.from(serialized);
  fs.writeFileSync(runPath, bytes);
  return { data, runPath, bytes };
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

  it('parseArgs rejects comma-only input', () => {
    expect(() => parseArgs(',')).toThrow(/Usage: \/sdlc-execute \[--retain-worker\] \[--recover-stale\] \[#N \.\.\.\]/);
    expect(() => parseArgs(', ,')).toThrow(/Usage: \/sdlc-execute \[--retain-worker\] \[--recover-stale\] \[#N \.\.\.\]/);
  });

  it('parseArgs collects unique numbers in given order', () => {
    expect(parseArgs('#12 #10')).toEqual({ issues: [12, 10], defaultBacklog: false });
    expect(parseArgs('#12 #12')).toEqual({ issues: [12], defaultBacklog: false });
    expect(parseArgs('#12,#10')).toEqual({ issues: [12, 10], defaultBacklog: false });
    expect(parseArgs('#12, #10')).toEqual({ issues: [12, 10], defaultBacklog: false });
  });

  it('parseArgs accepts one retain-worker flag among issue tokens', () => {
    expect(parseArgs('#12 --retain-worker #10')).toEqual({
      issues: [12, 10],
      defaultBacklog: false,
      retainWorker: true,
    });
    expect(() => parseArgs('--retain-worker --retain-worker #12')).toThrow(/Usage:/);
  });

  it('parseArgs accepts one recover-stale flag among issue tokens', () => {
    expect(parseArgs('#12 --recover-stale #10')).toEqual({
      issues: [12, 10],
      defaultBacklog: false,
      recoverStale: true,
    });
    expect(parseArgs('#12 --retain-worker --recover-stale')).toEqual({
      issues: [12],
      defaultBacklog: false,
      retainWorker: true,
      recoverStale: true,
    });
    expect(() => parseArgs('--recover-stale --recover-stale #12')).toThrow(/Usage:/);
  });

  it('parseArgs accepts OMP-expanded issue and pull-request tokens', () => {
    expect(parseArgs('issue://12 pr://10 #8 7')).toEqual({
      issues: [12, 10, 8, 7],
      defaultBacklog: false,
    });
  });

  it('parseArgs rejects unrelated URI and nonnumeric expansions', () => {
    expect(() => parseArgs('artifact://12')).toThrow(/Usage:/);
    expect(() => parseArgs('issue://abc')).toThrow(/Usage:/);
    expect(() => parseArgs('https://example.com/12')).toThrow(/Usage:/);
  });

  it('lists open spec-created issues sorted by number', () => {
    const calls = [];
    const issues = listSpecifiedIssues({
      cwd: '/repo',
      run: (command, args, options) => {
        calls.push([command, args, options]);
        if (args[0] === 'issue' && args[1] === 'list') {
          return {
            status: 0,
            stdout: JSON.stringify([{ number: 12, title: 'Later' }, { number: 8, title: 'First' }]),
          };
        }
        if (args[0] === 'issue' && args[1] === 'view') {
          return { status: 0, stdout: '{"projectItems":[]}' };
        }
        if (args[0] === 'repo') return { status: 0, stdout: '{"nameWithOwner":"acme/widgets"}' };
        if (args.includes('--paginate')) return { status: 0, stdout: '[[]]' };
        const number = Number(args[1].split('/').at(-1));
        return { status: 0, stdout: JSON.stringify({
          id: number * 100, number, state: 'open', title: number === 8 ? 'First' : 'Later',
          repository_url: 'https://api.github.com/repos/acme/widgets',
        }) };
      },
    });
    expect(issues).toEqual([{ number: 8, title: 'First' }, { number: 12, title: 'Later' }]);
    expect(calls[0]).toEqual([
      'gh',
      ['issue', 'list', '--state', 'open', '--label', 'spec-created', '--limit', '100', '--json', 'number,title'],
      { cwd: '/repo' },
    ]);
  });

  it('does not require project scope to list executable issues', () => {
    const run = (_command, args) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return { status: 0, stdout: '[{"number":3,"title":"Ready"}]' };
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        return { status: 1, stdout: '', stderr: 'missing required scopes [read:project]' };
      }
      if (args[0] === 'repo') return { status: 0, stdout: '{"nameWithOwner":"acme/widgets"}' };
      if (args.includes('--paginate')) return { status: 0, stdout: '[[]]' };
      const number = Number(args[1].split('/').at(-1));
      return { status: 0, stdout: JSON.stringify({
        id: number * 100,
        number,
        state: 'open',
        title: 'Ready',
        repository_url: 'https://api.github.com/repos/acme/widgets',
      }) };
    };

    expect(listSpecifiedIssues({ cwd: '/repo', run })).toEqual([{ number: 3, title: 'Ready' }]);
  });

  it('keeps independent picker work eligible when another reachable graph cycles', () => {
    const records = new Map([2, 3, 7].map((number) => [number, {
      id: number * 100,
      number,
      state: 'open',
      title: `Issue ${number}`,
      repository_url: 'https://api.github.com/repos/acme/widgets',
    }]));
    const run = (_command, args) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return { status: 0, stdout: JSON.stringify([records.get(2), records.get(3)]) };
      }
      if (args[0] === 'issue' && args[1] === 'view') return { status: 1, stdout: '' };
      if (args[0] === 'repo') return { status: 0, stdout: '{"nameWithOwner":"acme/widgets"}' };
      if (args.includes('--paginate')) {
        const endpoint = args.find((arg) => /dependencies\/blocked_by$/.test(arg));
        const number = Number(endpoint.match(/issues\/(\d+)/)[1]);
        const targets = number === 2 ? [7] : number === 7 ? [2] : [];
        return { status: 0, stdout: JSON.stringify([targets.map((target) => records.get(target))]) };
      }
      const number = Number(args[1].split('/').at(-1));
      return { status: 0, stdout: JSON.stringify(records.get(number)) };
    };

    expect(listSpecifiedIssues({ cwd: '/repo', run })).toEqual([{ number: 3, title: 'Issue 3' }]);
  });

  it('parseArgs rejects other tokens and lists over 20', () => {
    expect(() => parseArgs('1 nope')).toThrow(/Usage: \/sdlc-execute \[--retain-worker\] \[--recover-stale\] \[#N \.\.\.\]/);
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
      graph: {
        repository: 'acme/widgets',
        nodes: issues.map((issue) => ({ id: issue.number * 100, number: issue.number, state: 'OPEN', repository: 'acme/widgets' })),
        edges: [],
      },
      projectStatuses: {},
    })).toBe(3);
  });

  it('selectBacklog sorts eligible issues returned out of order by the live CLI', () => {
    const records = new Map([8, 3].map((number) => [number, {
      id: number * 100,
      number,
      state: 'open',
      title: `Issue ${number}`,
      repository_url: 'https://api.github.com/repos/acme/widgets',
      projectItems: [],
    }]));
    const run = (_command, args) => {
      if (args[0] === 'issue') {
        return { status: 0, stdout: JSON.stringify([records.get(8), records.get(3)]) };
      }
      if (args[0] === 'repo') {
        return { status: 0, stdout: JSON.stringify({ nameWithOwner: 'acme/widgets' }) };
      }
      if (args.includes('--paginate')) {
        return { status: 0, stdout: JSON.stringify([[]]) };
      }
      const number = Number(args[1].split('/').at(-1));
      return { status: 0, stdout: JSON.stringify(records.get(number)) };
    };

    expect(selectBacklog({ cwd: '/repo', run })).toBe(3);
  });

  it('selectBacklog drops official open blockers and Project Done', () => {
    const issues = [
      { number: 8, title: 'Ready', labels: [], body: '' },
      { number: 3, title: 'Blocked', labels: [], body: 'Depends on: #99 is inert' },
      { number: 4, title: 'Done', labels: [], body: '' },
    ];
    expect(selectBacklog({
      issues,
      graph: {
        repository: 'acme/widgets',
        nodes: [...issues, { number: 1 }].map((issue) => ({ id: issue.number * 100, number: issue.number, state: 'OPEN', repository: 'acme/widgets' })),
        edges: [{ issue: 3, blockedBy: 1 }],
      },
      projectStatuses: { 4: ['Done'] },
    })).toBe(8);
  });

  it('selectBacklog fails closed without official graph evidence', () => {
    expect(() => selectBacklog({
      issues: [{ number: 3, title: 'Unknown' }],
    })).toThrow('dependency_unreadable');
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

  it('nextStep follows both review and fix pairs before verification', () => {
    expect(nextStep(['start', 'implement'])).toBe('review1');
    expect(nextStep(['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'])).toBe('verify');
  });

  it('rewinds a failed lifecycle handoff to a completed prefix', () => {
    const completed = ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'];
    const handoff = {
      issue: 42,
      step: 'verify',
      status: 'failed',
      intervention: true,
      next: 'implement',
    };

    expect(remediationCompletedSteps({
      issue: 42,
      step: 'verify',
      completed,
      handoff,
    })).toEqual(['start']);
  });

  it.each([
    ['null target', null],
    ['unknown target', 'repair'],
    ['forward target', 'deliver'],
  ])('rejects a failed lifecycle handoff with %s', (_label, next) => {
    expect(remediationCompletedSteps({
      issue: 42,
      step: 'verify',
      completed: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'],
      handoff: {
        issue: 42,
        step: 'verify',
        status: 'failed',
        intervention: true,
        next,
      },
    })).toBeNull();
  });

  it('does not rewind a blocked non-intervention handoff', () => {
    expect(remediationCompletedSteps({
      issue: 42,
      step: 'verify',
      completed: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'],
      handoff: {
        issue: 42,
        step: 'verify',
        status: 'blocked',
        intervention: false,
        next: 'implement',
      },
    })).toBeNull();
  });

  it('validateHandoff accepts review and fix steps and rejects unknown steps', () => {
    const base = {
      schemaVersion: 1,
      issue: 42,
      status: 'passed',
      intervention: false,
      summary: 'ok',
      artifacts: [],
      next: null,
      reasonCode: null,
    };
    expect(validateHandoff({ ...base, step: 'review1' }).step).toBe('review1');
    expect(validateHandoff({ ...base, step: 'fix2' }).step).toBe('fix2');
    expect(() => validateHandoff({ ...base, step: 'simplify' })).toThrow('handoff step');
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
    seedRun(root, { schemaVersion: 1 });
    expect(fs.existsSync(path.join(root, '.omp', 'sdlc', 'run.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.omp', 'sdlc', 'handoffs'))).toBe(true);
  });

  it('writeRun binds a legacy completed checkpoint with a null current issue', () => {
    const root = makeSpecDir();
    const runPath = path.join(root, '.omp', 'sdlc', 'run.json');
    fs.mkdirSync(path.dirname(runPath), { recursive: true });
    fs.writeFileSync(runPath, `${JSON.stringify({
      schemaVersion: 1,
      issues: [42],
      currentIssue: null,
      currentStep: null,
      completed: { 42: VALID_STEPS },
      failed: null,
      startedAt: '2026-08-27T00:00:00.000Z',
    }, null, 2)}\n`);

    const rebound = boundRunData(root);
    writeRun(rebound, root, 0);

    expect(JSON.parse(fs.readFileSync(runPath, 'utf8'))).toEqual(rebound);
  });

  it('writeRun rejects stale or mismatched CAS writes without changing checkpoint bytes', () => {
    const root = makeSpecDir();
    const initial = seedRun(root);
    const runPath = path.join(root, '.omp', 'sdlc', 'run.json');
    const initialBytes = fs.readFileSync(runPath, 'utf8');

    expect(() => writeRun({ ...initial, issue: 43, revision: 2 }, root, 1))
      .toThrow('identity_mismatch');
    expect(fs.readFileSync(runPath, 'utf8')).toBe(initialBytes);
    expect(() => writeRun({ ...initial, revision: 1 }, root, 0))
      .toThrow('stale_revision');
    expect(fs.readFileSync(runPath, 'utf8')).toBe(initialBytes);

    const advanced = {
      ...initial,
      revision: 2,
      currentStep: 'implement',
      completed: { 42: ['start'] },
      failed: { issue: 42, step: 'implement', reasonCode: 'implementation_failed' },
    };
    writeRun(advanced, root, 1);
    expect(JSON.parse(fs.readFileSync(runPath, 'utf8'))).toEqual(advanced);
  });

  it('writeRun accepts only supported prompt delivery states', () => {
    const root = makeSpecDir();
    const initial = seedRun(root);
    const worker = {
      name: 's42-start',
      paneId: 'pane-1',
      projectRoot: initial.projectRoot,
      runId: initial.runId,
      issue: 42,
      step: 'start',
      branch: initial.branch,
      head: initial.head,
    };

    expect(() => writeRun({
      ...initial,
      revision: 2,
      workers: {
        's42-start': {
          ...worker,
          promptDelivery: 'activating',
          promptDeliveryVersion: 2,
        },
      },
    }, root, 1)).not.toThrow();

    const activating = JSON.parse(
      fs.readFileSync(path.join(root, '.omp/sdlc/run.json'), 'utf8'),
    );
    expect(() => writeRun({
      ...activating,
      revision: 3,
      workers: {
        's42-start': {
          ...worker,
          promptDelivery: 'accepted',
          promptDeliveryVersion: 2,
        },
      },
    }, root, 2)).toThrow('invalid run schema');
  });

  it('writeRun rejects a held checkpoint lock without changing checkpoint bytes', () => {
    const root = makeSpecDir();
    const initial = seedRun(root);
    const runPath = path.join(root, '.omp', 'sdlc', 'run.json');
    const lockPath = `${runPath}.lock`;
    const initialBytes = fs.readFileSync(runPath, 'utf8');
    const lock = fs.openSync(lockPath, 'wx');
    try {
      expect(() => writeRun({ ...initial, revision: 2 }, root, 1))
        .toThrow('checkpoint_locked');
      expect(fs.readFileSync(runPath, 'utf8')).toBe(initialBytes);
    } finally {
      fs.closeSync(lock);
      fs.unlinkSync(lockPath);
    }
  });
  it('removes only exact runtime owned by a completed queue', () => {
    const root = makeSpecDir();
    const runPath = path.join(root, '.omp/sdlc/run.json');
    const handoffDir = path.join(root, '.omp/sdlc/handoffs');
    const provenanceDir = path.join(root, '.omp/sdlc/prompt-provenance');
    const stored = seedRun(root, {
      currentStep: null,
      completed: { 42: VALID_STEPS },
      remediation: null,
    });
    fs.mkdirSync(provenanceDir, { recursive: true });
    for (const step of VALID_STEPS) {
      fs.writeFileSync(path.join(handoffDir, `42-${step}.json`), '{}\n');
      fs.writeFileSync(path.join(provenanceDir, `worker-${step}.json`), '{}\n');
    }
    fs.writeFileSync(path.join(handoffDir, 'unrelated.json'), '{}\n');
    fs.writeFileSync(path.join(provenanceDir, 'sdlc-execute.json'), '{}\n');
    fs.writeFileSync(`${runPath}.tmp`, 'temporary\n');

    cleanupCompletedRun({ ...stored, currentIssue: null }, root);

    expect(fs.existsSync(runPath)).toBe(false);
    expect(fs.existsSync(`${runPath}.tmp`)).toBe(false);
    for (const step of VALID_STEPS) {
      expect(fs.existsSync(path.join(handoffDir, `42-${step}.json`))).toBe(false);
      expect(fs.existsSync(path.join(provenanceDir, `worker-${step}.json`))).toBe(false);
    }
    expect(fs.existsSync(path.join(handoffDir, 'unrelated.json'))).toBe(true);
    expect(fs.existsSync(path.join(provenanceDir, 'sdlc-execute.json'))).toBe(true);
  });

  it.each([
    ['held lock', (root, runPath) => fs.closeSync(fs.openSync(`${runPath}.lock`, 'wx'))],
    ['identity mismatch', (_root, _runPath, released) => { released.runId = 'other-run'; }],
    ['symlink boundary', (root) => {
      const handoffDir = path.join(root, '.omp/sdlc/handoffs');
      const outside = makeSpecDir();
      fs.rmSync(handoffDir, { recursive: true });
      fs.symlinkSync(outside, handoffDir);
    }],
    ['deletion failure', (root) => {
      fs.mkdirSync(path.join(root, '.omp/sdlc/handoffs/42-start.json'));
    }],
  ])('fails completed cleanup closed for %s', (_label, arrange) => {
    const root = makeSpecDir();
    const stored = seedRun(root, {
      currentStep: null,
      completed: { 42: VALID_STEPS },
      remediation: null,
    });
    const runPath = path.join(root, '.omp/sdlc/run.json');
    const released = { ...stored, currentIssue: null };
    arrange(root, runPath, released);

    expect(() => cleanupCompletedRun(released, root)).toThrow('completed_cleanup_failed');
    expect(fs.existsSync(runPath)).toBe(true);
  });

  it('rejects cleanup for incomplete and failed queues without removing runtime', () => {
    for (const fields of [
      { currentStep: 'verify', completed: { 42: VALID_STEPS.slice(0, -2) } },
      {
        currentStep: null,
        completed: { 42: VALID_STEPS },
        failed: { issue: 42, step: 'deliver', reasonCode: 'delivery_failed' },
      },

    ]) {
      const root = makeSpecDir();
      const stored = seedRun(root, fields);
      const runPath = path.join(root, '.omp/sdlc/run.json');
      expect(() => cleanupCompletedRun({ ...stored, currentIssue: null }, root))
        .toThrow('completed_cleanup_failed');
      expect(fs.existsSync(runPath)).toBe(true);
    }
  });
  it('keeps execute runtime ignored and untracked', () => {
    expect(() => execFileSync(
      'git',
      ['check-ignore', '-q', '.omp/sdlc/run.json'],
      { cwd: REPOSITORY_ROOT },
    )).not.toThrow();
    expect(execFileSync(
      'git',
      ['ls-files', '--', '.omp/sdlc'],
      { cwd: REPOSITORY_ROOT, encoding: 'utf8' },
    )).toBe('');
  });


  it('workerPrompt and CLI inline start-issue without /skill:', () => {
    const prompt = workerPrompt({ step: 'start', issue: 42 });
    expect(prompt).toContain('# Start Issue');
    expect(prompt).toContain('$ARGUMENTS: #42');
    expect(prompt).not.toMatch(/\/skill:/);
    const validation = prompt.indexOf('validate-handoff --file .omp/sdlc/handoffs/42-start.json');
    const marker = prompt.indexOf('NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/42-start.json');
    expect(validation).toBeGreaterThanOrEqual(0);
    expect(validation).toBeLessThan(marker);
    expect(prompt).not.toContain('<plugin-root>');

    const cliRoot = makeSpecDir();
    const cli = spawnSync(process.execPath, [SCRIPT, 'worker-prompt', '--step', 'start', '--issue', '42'], {
      cwd: cliRoot,
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain('# Start Issue');
    expect(cli.stdout).not.toMatch(/\/skill:/);
  });

  it('workerPrompt maps implementation, review, fix, and delivery workflows', () => {
    const implement = workerPrompt({ step: 'implement', issue: 42 });
    const review = workerPrompt({ step: 'review1', issue: 42 });
    expect(implement).toContain('# Simplify');
    expect(implement).toContain('## Commit and Push Implementation');
    expect(implement).toContain('git push');
    expect(review).toContain('# Review Main');
    expect(review).toContain('sdlc-review-main.mjs');
    expect(review).toContain('Run the host review now in this sibling OMP worker');
    expect(review).toContain('Do not invoke `/review`, start `omp`, or route review work through the controller or main pane.');
    expect(workerPrompt({ step: 'fix1', issue: 42 })).toContain('# Apply Review');
    expect(workerPrompt({ step: 'fix1', issue: 42 })).toContain('sdlc-apply-review.mjs');
    expect(workerPrompt({ step: 'deliver', issue: 42 })).toContain('sdlc-deliver.mjs');
    expect(workerPrompt({ step: 'deliver', issue: 42 })).not.toContain('# Address PR Comments');
  });

  it('workerPrompt materializes every controller from the active package root', () => {
    const root = makeSpecDir();
    for (const step of VALID_STEPS) {
      const prompt = workerPrompt({
        step,
        issue: 42,
        cwd: root,
        controllerRunId: 'run-42',
      });
      const operands = [...prompt.matchAll(
        /node "([^"\r\n]+[\\/]scripts[\\/][A-Za-z0-9._-]+\.mjs)"/g,
      )].map((match) => match[1]);
      expect(operands.length).toBeGreaterThan(0);
      expect(operands.every((operand) => operand.startsWith(path.join(REPOSITORY_ROOT, 'scripts'))))
        .toBe(true);
      expect(prompt).toContain(`nmg-sdlc ${step} worker for #42.`);
      expect(prompt).toContain(`.omp/sdlc/handoffs/42-${step}.json`);
      expect(prompt).toContain('Controller run id: run-42');
      expect(prompt).not.toContain('<plugin-root>');
      expect(prompt).not.toContain('/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc');
      const provenance = JSON.parse(fs.readFileSync(
        path.join(root, '.omp/sdlc/prompt-provenance', `worker-${step}.json`),
        'utf8',
      ));
      expect(provenance.consumer).toBe(`worker:${step}`);
    }
  });

  it('workerPrompt carries the active controller run identity', () => {
    const prompt = workerPrompt({
      step: 'verify',
      issue: 42,
      controllerRunId: 'run-42',
    });
    expect(prompt).toContain('Controller run id: run-42');
    expect(prompt).toContain('--controller-run-id R');
  });

  it('defines remediable steps, names, and failed-handoff predicate exactly', () => {
    expect(REMEDIABLE_STEPS).toEqual([
      'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify', 'deliver',
    ]);
    expect(remAgentName(42, 'verify')).toBe('r42-verify');
    const handoff = { step: 'verify', status: 'failed', intervention: false };
    expect(isRemediableFailedHandoff({ step: 'verify', state: 'idle', handoff })).toBe(true);
    expect(isRemediableFailedHandoff({ step: 'start', state: 'idle', handoff: { ...handoff, step: 'start' } })).toBe(false);
    expect(isRemediableFailedHandoff({ step: 'verify', state: 'blocked', handoff })).toBe(false);
    expect(isRemediableFailedHandoff({
      step: 'verify',
      state: 'done',
      handoff: { ...handoff, intervention: true },
    })).toBe(false);
  });

  it('renders the deterministic remediation header before the original worker prompt', () => {
    const prompt = remediationPrompt({
      issue: 42,
      failedStep: 'verify',
      cwd: makeSpecDir(),
      evidence: {
        attempt: 2,
        reasonCode: 'verification_failed',
        summary: 'verify failed',
        artifacts: ['artifacts/verify.txt'],
        closedName: 'r42-verify',
        closedPaneId: 'pane-8',
      },
    });
    expect(prompt.startsWith([
      'You are remediating issue #42 step verify (attempt 2).',
      'Failed worker r42-verify in pane pane-8 was closed after evidence capture.',
      'reasonCode: verification_failed',
      'summary: verify failed',
      'artifacts:',
      '- artifacts/verify.txt',
    ].join('\n'))).toBe(true);
    expect(prompt).toContain('\n---\n');
    expect(prompt).toContain('# Verify Code');
    expect(() => workerPrompt({ step: 'rem', issue: 42 })).toThrow('invalid step for workerPrompt');
  });

  it('worker-prompt CLI accepts rem evidence and rejects start as a failed step', () => {
    const root = makeSpecDir();
    seedRun(root, {
      schemaVersion: 1,
      remediation: {
        issue: 42,
        step: 'verify',
        attempt: 1,
        status: 'active',
        reasonCode: 'verification_failed',
        summary: 'verify failed',
        artifacts: [],
        closedWorker: { name: 's42-verify', paneId: 'pane-7' },
      },
    });
    const accepted = spawnSync(process.execPath, [
      SCRIPT, 'worker-prompt', '--step', 'rem', '--issue', '42', '--failed-step', 'verify',
    ], { cwd: root, encoding: 'utf8' });
    expect(accepted.status).toBe(0);
    expect(accepted.stdout).toContain('You are remediating issue #42 step verify (attempt 1).');
    const rejected = spawnSync(process.execPath, [
      SCRIPT, 'worker-prompt', '--step', 'rem', '--issue', '42', '--failed-step', 'start',
    ], { cwd: root, encoding: 'utf8' });
    expect(rejected.status).toBe(2);
    expect(rejected.stderr.trim()).toBe('Usage: node sdlc-execute.mjs worker-prompt --step rem --issue N --failed-step <implement|review1|fix1|review2|fix2|verify|deliver>');
  });

  it('worker-prompt CLI resolves the review base for review remediation', () => {
    const root = makeSpecDir();
    seedRun(root, {
      remediation: {
        issue: 42,
        step: 'review1',
        attempt: 1,
        status: 'active',
        reasonCode: 'review_failed',
        summary: 'review failed',
        artifacts: [],
        closedWorker: { name: 's42-review1', paneId: 'pane-3' },
      },
    });
    execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'test'], { cwd: root, stdio: 'ignore' });
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'gh'), '#!/usr/bin/env node\nprocess.stdout.write("main\\n");\n');
    fs.chmodSync(path.join(bin, 'gh'), 0o755);

    const result = spawnSync(process.execPath, [
      SCRIPT, 'worker-prompt', '--step', 'rem', '--issue', '42', '--failed-step', 'review1',
    ], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('exact base `main`');
    expect(result.stdout).toContain('You are remediating issue #42 step review1');
  });


  it('write-run CLI persists run state with an expected revision', () => {
    const root = makeSpecDir();
    const run = boundRunData(root);
    const cli = spawnSync(process.execPath, [
      SCRIPT,
      'write-run',
      '--expected-revision',
      '0',
      JSON.stringify(run),
    ], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(root, '.omp/sdlc/run.json'), 'utf8'))).toEqual(run);
  });

  it('write-run CLI requires an expected revision', () => {
    const root = makeSpecDir();
    const cli = spawnSync(process.execPath, [
      SCRIPT,
      'write-run',
      JSON.stringify(boundRunData(root)),
    ], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(cli.status).toBe(2);
    expect(cli.stderr).toBe('Usage: node sdlc-execute.mjs write-run --expected-revision N <json>\n');
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

  it('specStatus fails closed when the worktree specs directory is unreadable', () => {
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
    fs.mkdirSync(path.join(root, 'specs'), { mode: 0o000 });
    try {
      expect(specStatus(42, root)).toEqual({
        dir: null,
        approved: false,
        reasonCode: 'spec_status_unreadable',
      });
    } finally {
      fs.chmodSync(path.join(root, 'specs'), 0o700);
    }
  });

  it('specStatus fails closed for two local issue branches', () => {
    const { root } = makeGitRepo();
    git(root, ['checkout', '-b', '42-add-x']);
    git(root, ['checkout', 'main']);
    git(root, ['checkout', '-b', '42-other']);
    git(root, ['checkout', 'main']);
    expect(specStatus(42, root)).toEqual({
      dir: null,
      approved: false,
      reasonCode: 'spec_status_ambiguous',
    });
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

function runGitResult(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
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

describe('runExecute controller', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  function makeControllerFixture({
    stalled = false,
    stalledInStderr = false,
    blockedIssues = [],
    dependencyUnreadable = false,
    settledBeforeSubmit = false,
    agentStartStatuses = [],
    failedStep = null,
    remediableFailedStep = null,
    remFailures = 0,
    remBlocked = false,
    blockedStep = null,
    failedNext = 'next',
    handoffIssue = null,
    handoffStep = null,
    paneCloseStatus = 0,
    paneCloseFailurePane = null,
    defaultBranch = 'main',
    localDefaultRef = true,
    remoteDefaultRef = true,
    reviewRequestFailure = false,
    reviewRequestStalled = false,
    reviewArtifactBody = 'No findings.\n',
    reviewPromptStatus = 0,
    paneWidth = 120,
    writeHandoffs = true,
    handoffContent = null,
    promptStatus = 0,
    agentState = 'done',
    labelIssues = [42],
    specifiedIssues = [],
    gitignore = null,
    dirty = '',
    branch = '42-ship-it',
    trackedRuntime = '',
    lsFilesStatus = 0,
    rmStatus = 0,
    integratedRuntimeMigration = false,
    loseAgentAfterObservation = false,
  } = {}) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-run-controller-'));
    roots.push(cwd);
    const specDir = path.join(cwd, 'specs', '42-ship-it');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 42);
    if (gitignore !== null) fs.writeFileSync(path.join(cwd, '.gitignore'), gitignore);
    if (integratedRuntimeMigration) {
      const runtimePath = path.join(cwd, '.omp/sdlc/run.json');
      fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
      fs.writeFileSync(runtimePath, `${JSON.stringify({
        schemaVersion: 1,
        issues: [42],
        currentIssue: 42,
        currentStep: 'start',
        completed: { 42: [] },
        failed: null,
        startedAt: '2026-08-23T00:00:00.000Z',
      }, null, 2)}\n`);
      runGitResult(cwd, ['init', '-b', 'main']);
      runGitResult(cwd, ['config', 'user.name', 'Test']);
      runGitResult(cwd, ['config', 'user.email', 'test@example.com']);
      runGitResult(cwd, ['add', '-f', '.gitignore', 'specs', '.omp/sdlc/run.json']);
      runGitResult(cwd, ['commit', '-m', 'track runtime']);
    }
    const calls = [];
    const starts = [];
    const splits = [];
    const closed = [];
    const notifications = [];
    const sentKeys = [];
    const prompts = [];
    const waits = [];
    const events = [];
    let paneSequence = 0;
    let activePrompt = '';
    let didStall = false;
    const pendingAgentStartStatuses = [...agentStartStatuses];
    let remPromptCount = 0;
    let agentLost = false;
    let reviewInProgress = false;

    const run = (command, args) => {
      calls.push([command, ...args]);
      if (integratedRuntimeMigration && command === 'git'
        && (['ls-files', 'rm', 'status'].includes(args[0])
          || (args[0] === 'branch' && args[1] === '--show-current'))) {
        return runGitResult(cwd, args);
      }
      if (command === 'gh' && args[0] === 'repo' && args.includes('nameWithOwner')) {
        return { status: 0, stdout: '{"nameWithOwner":"acme/widgets"}', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && args.includes('--paginate')) {
        if (dependencyUnreadable) return { status: 1, stdout: '', stderr: 'forbidden' };
        const endpoint = args.find((arg) => /dependencies\/blocked_by$/.test(arg));
        const issue = Number(endpoint.match(/issues\/(\d+)/)[1]);
        const blockers = blockedIssues.includes(issue)
          ? [{
            id: 700,
            number: 7,
            state: 'open',
            title: 'Prerequisite',
            repository_url: 'https://api.github.com/repos/acme/widgets',
          }]
          : [];
        return { status: 0, stdout: JSON.stringify([blockers]), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'api' && /^repos\/acme\/widgets\/issues\/\d+$/.test(args[1] || '')) {
        const issue = Number(args[1].split('/').at(-1));
        return {
          status: 0,
          stdout: JSON.stringify({
            id: issue * 100,
            number: issue,
            state: 'open',
            title: issue === 42 ? 'Ship It' : `Issue ${issue}`,
            repository_url: 'https://api.github.com/repos/acme/widgets',
          }),
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'auth') return { status: 0, stdout: '', stderr: '' };
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'list' && args.includes('--label')) {
        return { status: 0, stdout: JSON.stringify(specifiedIssues), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.some((arg) => arg.includes('labels'))) {
        const issue = Number(args[2]);
        return {
          status: 0,
          stdout: JSON.stringify({
            number: issue,
            labels: labelIssues.includes(issue) ? [{ name: 'spec-created' }] : [],
          }),
          stderr: '',
        };
      }
      if (command === 'git' && args[0] === 'ls-files') {
        return { status: lsFilesStatus, stdout: trackedRuntime, stderr: '' };
      }
      if (command === 'git' && args[0] === 'rm') {
        return { status: rmStatus, stdout: '', stderr: '' };
      }
      if (command === 'git' && args[0] === 'status') return { status: 0, stdout: dirty, stderr: '' };
      if (command === 'git' && args[0] === 'branch' && args[1] === '--show-current') {
        return { status: 0, stdout: `${branch}\n`, stderr: '' };
      }
      if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { status: 0, stdout: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', stderr: '' };
      }
      if (command === 'git' && args[0] === 'show-ref') {
        const ref = args.at(-1);
        if (ref === `refs/heads/${defaultBranch}`) {
          return { status: localDefaultRef ? 0 : 1, stdout: '', stderr: '' };
        }
        if (ref === `refs/remotes/origin/${defaultBranch}`) {
          return { status: remoteDefaultRef ? 0 : 1, stdout: '', stderr: '' };
        }
        return { status: 1, stdout: '', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.includes('title')) {
        return { status: 0, stdout: JSON.stringify({ title: 'Ship It' }), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.includes('state')) {
        return { status: 0, stdout: JSON.stringify({ state: 'CLOSED' }), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({ state: 'MERGED', headRefName: '42-ship-it' }),
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'pr') {
        return { status: 0, stdout: JSON.stringify([{ state: 'MERGED' }]), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo') return { status: 0, stdout: `${defaultBranch}\n`, stderr: '' };
      if (command === 'git' && ['checkout', 'fetch', 'merge'].includes(args[0])) {
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'git' && args[0] === 'branch' && args[1] === '-d') return { status: 0, stdout: '', stderr: '' };
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };

    const herdr = {
      integrationStatus: () => ({ status: 0, stdout: 'omp: current (v8)\n' }),
      paneLayout: () => ({ result: { width: paneWidth, height: 40 } }),
      paneSplit: (input) => {
        expect(input.direction).toBe(paneWidth >= 40 ? 'right' : 'down');
        splits.push(input);
        paneSequence += 1;
        return { result: { pane: { pane_id: `pane-${paneSequence}` } } };
      },
      paneClose: (paneId) => {
        closed.push(paneId);
        events.push(`close:${paneId}`);
        return { status: paneId === paneCloseFailurePane ? 1 : paneCloseStatus };
      },
      agentStart: (input) => {
        starts.push(input);
        events.push(`start:${input.name}`);
        return { status: pendingAgentStartStatuses.shift() ?? 0 };
      },
      agentPrompt: ({ name, prompt }) => {
        activePrompt = prompt;
        prompts.push({ name, prompt });
        events.push(`prompt:${name}`);
        const reviewPrompt = prompt.includes('# Controller-Owned Host Review');
        if (reviewPrompt) {
          reviewInProgress = reviewRequestStalled;
          if (reviewRequestFailure) return { status: 1, reasonCode: 'worker_failed' };
        }
        const step = name.slice(name.lastIndexOf('-') + 1);
        const workerIssue = Number(/^.[^0-9]*([1-9]\d*)-/.exec(name)?.[1] || 42);
        const isRem = name.startsWith('r');
        if ((stalled || stalledInStderr) && !didStall) {
          didStall = true;
          return stalledInStderr
            ? { status: 1, stdout: '', stderr: '{"code":"agent_prompt_stalled"}\n' }
            : { status: 1, reasonCode: 'agent_prompt_stalled' };
        }
        if (settledBeforeSubmit && !didStall) {
          didStall = true;
          return { status: 0, stdout: '{"state":"idle"}\n', stderr: '' };
        }
        if (writeHandoffs) {
          if (isRem) remPromptCount += 1;
          const handoffDir = path.join(cwd, '.omp/sdlc/handoffs');
          fs.mkdirSync(handoffDir, { recursive: true });
          const remFailed = isRem && remPromptCount <= remFailures;
          const status = isRem
            ? remBlocked ? 'blocked' : remFailed ? 'failed' : 'passed'
            : step === blockedStep
              ? 'blocked'
              : step === failedStep || step === remediableFailedStep ? 'failed' : 'passed';
          const intervention = !isRem && step === failedStep;
          const failed = status !== 'passed';
          const handoff = {
            schemaVersion: 1,
            issue: handoffIssue ?? workerIssue,
            step: handoffStep ?? step,
            status,
            intervention,
            summary: `${step} complete`,
            artifacts: !failed && reviewPrompt
              ? [`.omp/sdlc/reviews/${workerIssue}-${step}.md`]
              : failed && !intervention ? [`artifacts/${step}.txt`] : [],
            next: failed ? failedNext : step === 'deliver' ? null : 'next',
            reasonCode: intervention ? 'implementation_failed' : failed ? `${step}_failed` : null,
          };
          const content = handoffContent
            ? handoffContent(handoff, { isRem, step })
            : JSON.stringify(handoff);
          fs.writeFileSync(path.join(handoffDir, `${workerIssue}-${step}.json`), `${content}\n`);
          if (!failed && reviewPrompt) {
            const artifactPath = path.join(cwd, `.omp/sdlc/reviews/${workerIssue}-${step}.md`);
            fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
            fs.writeFileSync(artifactPath, reviewArtifactBody);
          }
        }
        if (reviewPrompt && reviewRequestStalled) {
          return { status: 1, reasonCode: 'agent_prompt_stalled' };
        }
        return { status: reviewPrompt ? reviewPromptStatus : promptStatus };
      },
      agentRead: () => activePrompt,
      agentSendKeys: ({ keys }) => {
        sentKeys.push(keys);
        return { status: 0 };
      },
      observationPause: () => {
        if (loseAgentAfterObservation) agentLost = true;
      },
      promptRetryPause: () => {
        events.push('prompt-retry-pause');
      },
      agentWait: (input) => {
        waits.push(input);
        if (!input.until && reviewInProgress) {
          reviewInProgress = false;
          return { status: 0 };
        }
        if (!input.until && writeHandoffs) {
          const name = input.name;
          const step = name.slice(name.lastIndexOf('-') + 1);
          const handoffDir = path.join(cwd, '.omp/sdlc/handoffs');
          fs.mkdirSync(handoffDir, { recursive: true });
          fs.writeFileSync(path.join(handoffDir, `42-${step}.json`), `${JSON.stringify({
            schemaVersion: 1,
            issue: 42,
            step,
            status: 'passed',
            intervention: false,
            summary: `${step} complete after a 3600-second active worker`,
            artifacts: [],
            next: 'implement',
            reasonCode: null,
          })}\n`);
        }
        return { status: 0 };
      },
      agentGet: () => {
        events.push('get');
        return agentLost ? { status: 1 } : ({ result: { state: agentState } });
      },
      listAgents: () => {
        events.push('list');
        return starts
          .filter((started) => !closed.includes(started.paneId))
          .map((started) => ({ name: started.name, pane_id: started.paneId, state: agentState }));
      },
      notificationShow: (notice) => notifications.push(notice),
    };
    return {
      cwd, calls, starts, splits, closed, events, notifications, sentKeys, waits, prompts, run, herdr,
    };
  }

  function activeStartedAgents(fixture) {
    return fixture.starts
      .filter(({ paneId }) => !fixture.closed.includes(paneId))
      .map(({ name, paneId }) => ({ name, pane_id: paneId, state: 'done' }));
  }

  function configureDelayedIdleTransition(fixture, agentName, step) {
    const promptAgent = fixture.herdr.agentPrompt;
    const getAgent = fixture.herdr.agentGet;
    const listAgents = fixture.herdr.listAgents;
    const pause = fixture.herdr.observationPause;
    const waitAgent = fixture.herdr.agentWait;
    let state = 'idle';
    let observations = 0;
    let submitted = false;
    const deliveryStates = [];

    fixture.herdr.agentPrompt = (input) => {
      const result = promptAgent(input);
      if (input.name === agentName) {
        submitted = true;
        fs.rmSync(path.join(fixture.cwd, `.omp/sdlc/handoffs/42-${step}.json`), { force: true });
        fs.rmSync(path.join(fixture.cwd, `.omp/sdlc/reviews/42-${step}.md`), { force: true });
      }
      return result;
    };
    fixture.herdr.agentGet = (name) => (
      name === agentName ? { result: { state } } : getAgent(name)
    );
    fixture.herdr.listAgents = () => listAgents().map((agent) => (
      agent.name === agentName ? { ...agent, state } : agent
    ));
    fixture.herdr.agentWait = (input) => {
      const result = waitAgent(input);
      if (input.name === agentName && !input.until) state = 'done';
      return result;
    };
    fixture.herdr.observationPause = () => {
      pause?.();
      if (!submitted) return;
      const checkpoint = JSON.parse(
        fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
      );
      deliveryStates.push(checkpoint.workers[agentName]?.promptDelivery);
      observations += 1;
      if (observations === 2) state = 'working';
      if (observations !== 3) return;
      const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
      fs.mkdirSync(handoffDir, { recursive: true });
      const review = step === 'review1' || step === 'review2';
      const artifacts = review ? [`.omp/sdlc/reviews/42-${step}.md`] : [];
      fs.writeFileSync(path.join(handoffDir, `42-${step}.json`), `${JSON.stringify({
        schemaVersion: 1,
        issue: 42,
        step,
        status: 'passed',
        intervention: false,
        summary: `${step} completed after delayed activation`,
        artifacts,
        next: step === 'deliver' ? null : 'next',
        reasonCode: null,
      })}\n`);
      if (review) {
        const artifactPath = path.join(fixture.cwd, artifacts[0]);
        fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
        fs.writeFileSync(artifactPath, 'No findings.\n');
      }
    };
    const result = () => observations;
    result.deliveryStates = () => deliveryStates;
    return result;
  }

  const env = { HERDR_ENV: '1', HERDR_SOCKET_PATH: '/tmp/herdr.sock', HERDR_PANE_ID: 'main-pane' };

  function configurePassedRetainedStartWorker(fixture, agentPayload) {
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'start',
      completed: { 42: [] },
      failed: { issue: 42, step: 'start', reasonCode: 'missing_handoff' },
      startedAt: '2026-08-21T00:00:00.000Z',
    });
    fs.writeFileSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'), `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      step: 'start',
      status: 'passed',
      intervention: false,
      summary: 'Start repaired',
      artifacts: [],
      next: 'implement',
      reasonCode: null,
    })}\n`);
    fixture.herdr.listAgents = () => [{
      name: 's42-start',
      pane_id: 'kept-pane',
      state: 'idle',
    }, ...activeStartedAgents(fixture)];
    fixture.herdr.agentGet = () => ({ status: 0, stdout: JSON.stringify(agentPayload) });
  }

  function configureFailedRetainedVerifyWorker(fixture, {
    next = 'implement',
    state = 'idle',
    issues = [42],
    paneCloseStatus,
  } = {}) {
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues,
      currentIssue: 42,
      currentStep: 'verify',
      completed: {
        42: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'],
      },
      failed: { issue: 42, step: 'verify', reasonCode: 'verification_failed' },
      startedAt: '2026-08-23T00:00:00.000Z',
    });
    fs.writeFileSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-verify.json'), `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      step: 'verify',
      status: 'failed',
      intervention: true,
      summary: 'Verification requires implementation rework',
      artifacts: [],
      next,
      reasonCode: 'verification_failed',
    })}\n`);
    fixture.herdr.listAgents = () => [{
      name: 's42-verify',
      pane_id: 'kept-verify-pane',
      state,
    }, ...activeStartedAgents(fixture)];
    fixture.herdr.agentGet = () => ({ result: { state } });
    if (paneCloseStatus !== undefined) {
      const paneClose = fixture.herdr.paneClose;
      fixture.herdr.paneClose = (paneId) => paneId === 'kept-verify-pane'
        ? { status: paneCloseStatus }
        : paneClose(paneId);
    }
  }

  it('fails before Herdr mutation when the session environment is missing', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env: {}, run: fixture.run, herdr: fixture.herdr });
    expect(result).toMatchObject({ status: 2, stdout: 'execute requires a Herdr OMP session\n' });
    expect(fixture.starts).toHaveLength(0);
  });

  it('prints the exact install instruction and performs no mutation without omp integration', () => {
    const fixture = makeControllerFixture();
    fixture.herdr.integrationStatus = () => ({ status: 0, stdout: 'omp: not installed\n' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 2, stdout: 'Run: herdr integration install omp\n', stderr: '' });
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.starts).toHaveLength(0);
  });

  it('rejects invalid arguments with the stable usage line', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({ args: '#42 nope', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 2, stdout: '', stderr: 'Usage: /sdlc-execute [--retain-worker] [--recover-stale] [#N ...]\n' });
    expect(fixture.calls).toHaveLength(0);
  });

  it('rejects a competing execute before changing protected artifacts', () => {
    const fixture = makeControllerFixture();
    const runPath = path.join(fixture.cwd, '.omp/sdlc/run.json');
    const handoffPath = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json');
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(runPath, 'protected run bytes\n');
    fs.writeFileSync(handoffPath, 'protected handoff bytes\n');
    const lease = acquireControllerLease({
      projectRoot: fixture.cwd,
      runId: 'active-run',
      controllerPaneId: 'active-controller',
    });

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result).toEqual({ status: 1, stdout: '', stderr: 'controller_lease_held\n' });
    expect(fs.readFileSync(runPath, 'utf8')).toBe('protected run bytes\n');
    expect(fs.readFileSync(handoffPath, 'utf8')).toBe('protected handoff bytes\n');
    expect(fixture.starts).toEqual([]);
    expect(releaseControllerLease(lease)).toBe(true);
  });

  it('reclaims a confirmed stale same-run lease before normal startup', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      runId: 'recover-run',
      currentStep: null,
      workers: {},
      completed: { 42: [] },
    });
    const stale = acquireControllerLease({
      projectRoot: fixture.cwd,
      runId: 'recover-run',
      controllerPaneId: 'dead-controller',
      pid: 4242,
    });
    fs.closeSync(stale.fd);
    const paneSplit = fixture.herdr.paneSplit;
    let replacement;
    fixture.herdr.paneSplit = (input) => {
      replacement = JSON.parse(fs.readFileSync(stale.path, 'utf8'));
      return paneSplit(input);
    };

    const result = runExecute({
      args: '--recover-stale #42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
      processApi: {
        kill: (_pid, signal) => {
          expect(signal).toBe(0);
          throw Object.assign(new Error('gone'), { code: 'ESRCH' });
        },
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Reclaimed stale controller lease.\n');
    expect(replacement).toMatchObject({
      runId: 'recover-run',
      controllerPaneId: 'main-pane',
      pid: process.pid,
    });
    expect(fixture.starts.length).toBeGreaterThan(0);
  });

  it('reclaims a stale lease occupied only by the restarted controller pane', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      runId: 'recover-run',
      currentStep: null,
      workers: {},
      completed: { 42: [] },
    });
    const stale = acquireControllerLease({
      projectRoot: fixture.cwd,
      runId: 'recover-run',
      controllerPaneId: 'w14:p1',
      pid: 4242,
    });
    fs.closeSync(stale.fd);
    const listAgents = fixture.herdr.listAgents;
    let recoveryListing = true;
    fixture.herdr.listAgents = () => {
      if (recoveryListing) {
        recoveryListing = false;
        return [{ pane_id: 'w14:p1' }];
      }
      return listAgents();
    };

    const result = runExecute({
      args: '--recover-stale #42',
      cwd: fixture.cwd,
      env: { ...env, HERDR_PANE_ID: 'w14:p1' },
      run: fixture.run,
      herdr: fixture.herdr,
      processApi: {
        kill: (_pid, signal) => {
          expect(signal).toBe(0);
          throw Object.assign(new Error('gone'), { code: 'ESRCH' });
        },
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Reclaimed stale controller lease.\n');
    expect(fixture.starts.length).toBeGreaterThan(0);
  });

  it.each([
    ['live pid', () => undefined, () => [{ pane_id: 'w14:p1' }]],
    ['failed listing', () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); }, () => ({ status: 1, stdout: '[]' })],
    ['duplicate recorded-pane agents', () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); }, () => [{ pane_id: 'w14:p1' }, { pane_id: 'w14:p1' }]],
  ])('fails closed for same-pane stale recovery with %s', (_name, kill, listAgents) => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      runId: 'recover-run',
      currentStep: null,
      workers: {},
      completed: { 42: [] },
    });
    const stale = acquireControllerLease({
      projectRoot: fixture.cwd,
      runId: 'recover-run',
      controllerPaneId: 'w14:p1',
      pid: 4242,
    });
    fs.closeSync(stale.fd);
    const leaseBytes = fs.readFileSync(stale.path);
    fixture.herdr.listAgents = listAgents;

    const result = runExecute({
      args: '--recover-stale #42',
      cwd: fixture.cwd,
      env: { ...env, HERDR_PANE_ID: 'w14:p1' },
      run: fixture.run,
      herdr: fixture.herdr,
      processApi: { kill },
    });

    expect(result).toEqual({ status: 1, stdout: '', stderr: 'controller_lease_held\n' });
    expect(fs.readFileSync(stale.path).equals(leaseBytes)).toBe(true);
    expect(fixture.starts).toEqual([]);
  });

  it('preserves protected state when the recorded pane belongs to a foreign controller', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      runId: 'recover-run',
      currentStep: null,
      workers: {},
      completed: { 42: [] },
    });
    const runPath = path.join(fixture.cwd, '.omp/sdlc/run.json');
    const runBytes = fs.readFileSync(runPath);
    const handoffPath = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json');
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, 'protected handoff bytes\n');
    const stale = acquireControllerLease({
      projectRoot: fixture.cwd,
      runId: 'recover-run',
      controllerPaneId: 'w14:p1',
      pid: 4242,
    });
    fs.closeSync(stale.fd);
    const leaseBytes = fs.readFileSync(stale.path);
    fixture.herdr.listAgents = () => [{ pane_id: 'w14:p1' }];

    const result = runExecute({
      args: '--recover-stale #42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
      processApi: {
        kill: () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); },
      },
    });

    expect(result).toEqual({ status: 1, stdout: '', stderr: 'controller_lease_held\n' });
    expect(fs.readFileSync(stale.path).equals(leaseBytes)).toBe(true);
    expect(fs.readFileSync(runPath).equals(runBytes)).toBe(true);
    expect(fs.readFileSync(handoffPath, 'utf8')).toBe('protected handoff bytes\n');
    expect(fixture.starts).toEqual([]);
  });

  it.each([
    ['live pid', 'recover-run', 'valid', () => undefined, () => []],
    ['failed listing', 'recover-run', 'valid', () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); }, () => ({ status: 1, stdout: '[]' })],
    ['malformed lease', 'recover-run', 'malformed', () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); }, () => []],
    ['foreign run', 'foreign-run', 'valid', () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); }, () => []],
  ])('fails closed during stale recovery for %s', (_name, leaseRunId, leaseKind, kill, listAgents) => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      runId: 'recover-run',
      currentStep: null,
      workers: {},
      completed: { 42: [] },
    });
    const runPath = path.join(fixture.cwd, '.omp/sdlc/run.json');
    const runBytes = fs.readFileSync(runPath);
    const handoffPath = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json');
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, 'protected handoff bytes\n');
    const stale = acquireControllerLease({
      projectRoot: fixture.cwd,
      runId: leaseRunId,
      controllerPaneId: 'dead-controller',
      pid: 4242,
    });
    fs.closeSync(stale.fd);
    if (leaseKind === 'malformed') fs.writeFileSync(stale.path, '{');
    const leaseBytes = fs.readFileSync(stale.path);
    fixture.herdr.listAgents = listAgents;

    const result = runExecute({
      args: '--recover-stale #42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
      processApi: { kill },
    });

    expect(result).toEqual({ status: 1, stdout: '', stderr: 'controller_lease_held\n' });
    expect(fs.readFileSync(stale.path).equals(leaseBytes)).toBe(true);
    expect(fs.readFileSync(runPath).equals(runBytes)).toBe(true);
    expect(fs.readFileSync(handoffPath, 'utf8')).toBe('protected handoff bytes\n');
    expect(fixture.starts).toEqual([]);
  });

  it('preserves a lease changed after stale-owner observations', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      runId: 'recover-run',
      currentStep: null,
      workers: {},
      completed: { 42: [] },
    });
    const stale = acquireControllerLease({
      projectRoot: fixture.cwd,
      runId: 'recover-run',
      controllerPaneId: 'dead-controller',
      pid: 4242,
    });
    fs.closeSync(stale.fd);
    const replacement = stale.serialized.replace('dead-controller', 'new-controller');
    fixture.herdr.listAgents = () => {
      fs.writeFileSync(stale.path, replacement);
      return [];
    };

    const result = runExecute({
      args: '--recover-stale #42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
      processApi: {
        kill: () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); },
      },
    });

    expect(result).toEqual({ status: 1, stdout: '', stderr: 'controller_lease_held\n' });
    expect(fs.readFileSync(stale.path, 'utf8')).toBe(replacement);
    expect(fixture.starts).toEqual([]);
  });

  it('does not inspect a dead-looking lease without explicit recovery', () => {
    const fixture = makeControllerFixture();
    const stale = acquireControllerLease({
      projectRoot: fixture.cwd,
      runId: 'recover-run',
      controllerPaneId: 'dead-controller',
      pid: 4242,
    });
    fs.closeSync(stale.fd);
    let probes = 0;

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: { ...fixture.herdr, listAgents: () => { probes += 1; return []; } },
      processApi: { kill: () => { probes += 1; } },
    });

    expect(result).toEqual({ status: 1, stdout: '', stderr: 'controller_lease_held\n' });
    expect(probes).toBe(0);
    expect(fs.readFileSync(stale.path, 'utf8')).toBe(stale.serialized);
  });

  it('rejects comma-only arguments before controller side effects', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({ args: ', ,', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 2, stdout: '', stderr: 'Usage: /sdlc-execute [--retain-worker] [--recover-stale] [#N ...]\n' });
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.starts).toHaveLength(0);
  });

  it('starts nothing when empty args find no open specified issues', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 0, stdout: 'No open spec-created issues.\n', stderr: '' });
    expect(fixture.starts).toEqual([]);
  });

  it('requires an explicit selection when empty args find specified issues', () => {
    const fixture = makeControllerFixture({ specifiedIssues: [{ number: 42, title: 'Ship It' }] });
    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 2, stdout: '', stderr: 'Usage: /sdlc-execute [--retain-worker] [--recover-stale] [#N ...]\n' });
    expect(fixture.starts).toEqual([]);
  });

  it('fails dependency reads before showing a no-argument picker', () => {
    const fixture = makeControllerFixture({
      specifiedIssues: [{ number: 42, title: 'Ship It' }],
      dependencyUnreadable: true,
    });
    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result).toEqual({ status: 1, stdout: '', stderr: 'dependency_unreadable\n' });
    expect(fixture.starts).toEqual([]);
  });

  it('resumes an existing run issue list on empty args', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'start',
      completed: { 42: [] },
      failed: null,
      startedAt: '2026-08-23T00:00:00.000Z',
    });

    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.starts[0].name).toBe('s42-start');
  });

  it('advances workflow fields while preserving the bound run identity', () => {
    const fixture = makeControllerFixture({ blockedStep: 'implement' });
    const initial = seedRun(fixture.cwd, {
      branch: '42-ship-it',
      currentStep: 'start',
      completed: { 42: [] },
    });
    const identityFields = ['projectRoot', 'runId', 'issue', 'branch', 'head', 'issues'];

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(persisted.currentStep).toBe('implement');
    expect(persisted.completed['42']).toEqual(['start']);
    expect(persisted.failed).toEqual({ issue: 42, step: 'implement', reasonCode: 'implement_failed' });
    expect(Object.fromEntries(identityFields.map((field) => [field, persisted[field]])))
      .toEqual(Object.fromEntries(identityFields.map((field) => [field, initial[field]])));
    expect(persisted.revision).toBeGreaterThan(initial.revision);
  });

  it.each([
    ['in-progress', {}],
    ['blocked', {
      currentStep: 'implement',
      completed: { 42: ['start'] },
      failed: { issue: 42, step: 'implement', reasonCode: 'worker_blocked' },
    }],
    ['failed', {
      currentStep: 'verify',
      completed: { 42: VALID_STEPS.slice(0, -2) },
      failed: { issue: 42, step: 'verify', reasonCode: 'verification_failed' },
    }],
  ])('rejects a different issue list for a %s checkpoint without changing runtime', (_state, fields) => {
    const fixture = makeControllerFixture({ labelIssues: [42, 43] });
    const initial = seedRun(fixture.cwd, fields);
    const runPath = path.join(fixture.cwd, '.omp', 'sdlc', 'run.json');
    const handoffPath = path.join(fixture.cwd, '.omp', 'sdlc', 'handoffs', '42-start.json');
    const initialBytes = fs.readFileSync(runPath, 'utf8');
    fs.writeFileSync(handoffPath, '{}\n');
    const otherSpec = path.join(fixture.cwd, 'specs', '43-other');
    fs.mkdirSync(otherSpec, { recursive: true });
    writeApproved(otherSpec, 43);

    const result = runExecute({
      args: '#43',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result).toEqual({ status: 1, stdout: '', stderr: 'Run checkpoint identity mismatch\n' });
    expect(fs.readFileSync(runPath, 'utf8')).toBe(initialBytes);
    expect(fs.existsSync(handoffPath)).toBe(true);
    expect(initial.issue).toBe(42);
    expect(fixture.starts).toEqual([]);
  });
  it('releases a leftover completed checkpoint before starting a different issue list', () => {
    const fixture = makeControllerFixture({ labelIssues: [42, 43], blockedStep: 'implement' });
    const runPath = path.join(fixture.cwd, '.omp/sdlc/run.json');
    const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
    const provenanceDir = path.join(fixture.cwd, '.omp/sdlc/prompt-provenance');
    seedRun(fixture.cwd, {
      currentIssue: null,
      currentStep: null,
      completed: { 42: VALID_STEPS },
      failed: null,
      remediation: null,
    });
    fs.mkdirSync(provenanceDir, { recursive: true });
    fs.writeFileSync(path.join(handoffDir, '42-deliver.json'), '{}\n');
    fs.writeFileSync(path.join(provenanceDir, 'worker-verify.json'), '{}\n');
    const otherSpec = path.join(fixture.cwd, 'specs', '43-other');
    fs.mkdirSync(otherSpec, { recursive: true });
    writeApproved(otherSpec, 43);

    const result = runExecute({
      args: '#43',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const nextRun = JSON.parse(fs.readFileSync(runPath, 'utf8'));

    expect(result.status).toBe(1);
    expect(nextRun.issue).toBe(43);
    expect(nextRun.issues).toEqual([43]);
    expect(fs.existsSync(path.join(handoffDir, '42-deliver.json'))).toBe(false);
    expect(fs.existsSync(path.join(provenanceDir, 'worker-verify.json'))).toBe(false);
    expect(fixture.starts.map(({ name }) => name)).toEqual(['s43-start', 's43-implement']);
  });

  it('checkpoint portability migrates the exact issue-6 payload with native fresh identity', () => {
    for (const newline of ['\n', '\r\n']) {
      for (const pathApi of [path.posix, path.win32]) {
        const fixture = makeControllerFixture({
          labelIssues: [19],
          blockedStep: 'implement',
          branch: '19-portable-checkpoint',
        });
        const specDir = path.join(fixture.cwd, 'specs', '19-portable-checkpoint');
        fs.mkdirSync(specDir, { recursive: true });
        writeApproved(specDir, 19);
        const { runPath } = writeLegacyRun(fixture.cwd, {
          fixturePath: pathApi.join('consumer', 'project', '.omp', 'sdlc'),
        }, newline);
        const handoffDir = path.join(fixture.cwd, '.omp', 'sdlc', 'handoffs');
        const provenanceDir = path.join(fixture.cwd, '.omp', 'sdlc', 'prompt-provenance');
        fs.mkdirSync(handoffDir, { recursive: true });
        fs.mkdirSync(provenanceDir, { recursive: true });
        for (const step of VALID_STEPS) {
          fs.writeFileSync(path.join(handoffDir, `6-${step}.json`), '{}\n');
          fs.writeFileSync(path.join(provenanceDir, `worker-${step}.json`), '{}\n');
        }
        fs.writeFileSync(path.join(handoffDir, 'unrelated.json'), '{}\n');
        fs.writeFileSync(path.join(provenanceDir, 'unrelated.json'), '{}\n');
        fs.writeFileSync(`${runPath}.tmp`, 'temporary\n');

        const result = runExecute({
          args: '#19',
          cwd: fixture.cwd,
          env,
          run: fixture.run,
          herdr: fixture.herdr,
        });
        const nextRun = JSON.parse(fs.readFileSync(runPath, 'utf8'));

        expect(result.stderr).not.toBe('Run checkpoint identity mismatch\n');
        expect(fixture.starts.map(({ name }) => name)).toEqual(['s19-start', 's19-implement']);
        expect(nextRun).toEqual(expect.objectContaining({
          schemaVersion: 1,
          projectRoot: fs.realpathSync(fixture.cwd),
          issue: 19,
          branch: '19-portable-checkpoint',
          head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          issues: [19],
        }));
        expect(nextRun.runId).toEqual(expect.any(String));
        expect(nextRun.runId.length).toBeGreaterThan(0);
        expect(nextRun.revision).toBeGreaterThan(0);
        for (const step of VALID_STEPS) {
          expect(fs.existsSync(path.join(handoffDir, `6-${step}.json`))).toBe(false);
          const provenancePath = path.join(provenanceDir, `worker-${step}.json`);
          if (['start', 'implement'].includes(step)) {
            expect(fs.readFileSync(provenancePath, 'utf8')).not.toBe('{}\n');
          } else {
            expect(fs.existsSync(provenancePath)).toBe(false);
          }
        }
        expect(fs.existsSync(`${runPath}.tmp`)).toBe(false);
        expect(fs.existsSync(path.join(handoffDir, 'unrelated.json'))).toBe(true);
        expect(fs.existsSync(path.join(provenanceDir, 'unrelated.json'))).toBe(true);
      }
    }
  });

  it('checkpoint portability rejects every partial identity subset for LF and CRLF path forms', () => {
    const identityFields = ['projectRoot', 'runId', 'issue', 'branch', 'head', 'revision'];
    for (const newline of ['\n', '\r\n']) {
      for (const pathApi of [path.posix, path.win32]) {
        const rootValue = pathApi.join('consumer', 'project');
        const identity = {
          projectRoot: rootValue,
          runId: `${pathApi.basename(rootValue)}-run`,
          issue: 6,
          branch: '6-completed',
          head: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          revision: 1,
        };
        for (let mask = 1; mask < (2 ** identityFields.length) - 1; mask += 1) {
          const fixture = makeControllerFixture({ labelIssues: [19] });
          const specDir = path.join(fixture.cwd, 'specs', '19-portable-checkpoint');
          fs.mkdirSync(specDir, { recursive: true });
          writeApproved(specDir, 19);
          const subset = Object.fromEntries(identityFields
            .filter((_field, index) => mask & (1 << index))
            .map((field) => [field, identity[field]]));
          const { runPath, bytes } = writeLegacyRun(fixture.cwd, subset, newline);
          const supportingPath = path.join(fixture.cwd, '.omp', 'sdlc', 'supporting.json');
          fs.writeFileSync(supportingPath, '{}\n');

          const result = runExecute({
            args: '#19',
            cwd: fixture.cwd,
            env,
            run: fixture.run,
            herdr: fixture.herdr,
          });

          expect(result).toEqual({
            status: 1,
            stdout: '',
            stderr: 'Run checkpoint identity mismatch\n',
          });
          expect(fs.readFileSync(runPath).equals(bytes)).toBe(true);
          expect(fs.existsSync(supportingPath)).toBe(true);
          expect(fixture.starts).toEqual([]);
        }
      }
    }
  });

  it.each([
    ['incomplete', { completed: { 6: VALID_STEPS.slice(0, -1) } }],
    ['active', { currentIssue: 6, currentStep: 'deliver' }],
    ['failed', { failed: { issue: 6, step: 'deliver', reasonCode: 'delivery_failed' } }],
    ['remediating', { remediation: { issue: 6, step: 'deliver' } }],
    ['missing completion', { completed: {} }],
    ['malformed issues', { issues: [0], completed: { 0: VALID_STEPS } }],
  ])('checkpoint portability retains %s legacy runtime', (_label, fields) => {
    const fixture = makeControllerFixture({ labelIssues: [19] });
    const specDir = path.join(fixture.cwd, 'specs', '19-portable-checkpoint');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 19);
    const { runPath, bytes } = writeLegacyRun(fixture.cwd, fields);
    const supportingPath = path.join(fixture.cwd, '.omp', 'sdlc', 'supporting.json');
    fs.writeFileSync(supportingPath, '{}\n');

    const result = runExecute({
      args: '#19',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result).toEqual({
      status: 1,
      stdout: '',
      stderr: 'Run checkpoint identity mismatch\n',
    });
    expect(fs.readFileSync(runPath).equals(bytes)).toBe(true);
    expect(fs.existsSync(supportingPath)).toBe(true);
    expect(fixture.starts).toEqual([]);
  });

  it('checkpoint portability rejects malformed checkpoint bytes', () => {
    const fixture = makeControllerFixture({ labelIssues: [19] });
    const specDir = path.join(fixture.cwd, 'specs', '19-portable-checkpoint');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 19);
    const runPath = path.join(fixture.cwd, '.omp', 'sdlc', 'run.json');
    fs.mkdirSync(path.dirname(runPath), { recursive: true });
    const bytes = Buffer.from('{"schemaVersion":1,\r\n');
    fs.writeFileSync(runPath, bytes);

    const result = runExecute({
      args: '#19',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result).toEqual({
      status: 1,
      stdout: '',
      stderr: 'Run checkpoint identity mismatch\n',
    });
    expect(fs.readFileSync(runPath).equals(bytes)).toBe(true);
    expect(fixture.starts).toEqual([]);
  });

  it('checkpoint portability rejects an unreadable checkpoint path', () => {
    const fixture = makeControllerFixture({ labelIssues: [19] });
    const specDir = path.join(fixture.cwd, 'specs', '19-portable-checkpoint');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 19);
    const runPath = path.join(fixture.cwd, '.omp', 'sdlc', 'run.json');
    fs.mkdirSync(runPath, { recursive: true });

    const result = runExecute({
      args: '#19',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result).toEqual({
      status: 1,
      stdout: '',
      stderr: 'Run checkpoint identity mismatch\n',
    });
    expect(fs.statSync(runPath).isDirectory()).toBe(true);
    expect(fixture.starts).toEqual([]);
  });

  it('checkpoint portability keeps legacy cleanup locks bytes and owned deletion fail-closed', () => {
    for (const failure of ['held lock', 'changed bytes', 'deletion failure']) {
      const root = makeSpecDir();
      const { data, runPath, bytes } = writeLegacyRun(root);
      let lock;
      if (failure === 'held lock') lock = fs.openSync(`${runPath}.lock`, 'wx');
      if (failure === 'changed bytes') fs.appendFileSync(runPath, ' ');
      if (failure === 'deletion failure') {
        fs.mkdirSync(path.join(root, '.omp', 'sdlc', 'handoffs', '6-start.json'), {
          recursive: true,
        });
      }

      expect(() => cleanupCompletedRun(data, root, { legacyCheckpointBytes: bytes }))
        .toThrow('completed_cleanup_failed');
      expect(fs.existsSync(runPath)).toBe(true);
      if (lock !== undefined) {
        fs.closeSync(lock);
        fs.unlinkSync(`${runPath}.lock`);
      }
    }
  });

  it('checkpoint portability reports legacy startup cleanup failures', () => {
    const fixture = makeControllerFixture({ labelIssues: [19] });
    const specDir = path.join(fixture.cwd, 'specs', '19-portable-checkpoint');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 19);
    const { runPath, bytes } = writeLegacyRun(fixture.cwd);
    const lockPath = `${runPath}.lock`;
    const lock = fs.openSync(lockPath, 'wx');

    const result = runExecute({
      args: '#19',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result).toEqual({
      status: 1,
      stdout: '',
      stderr: 'completed_cleanup_failed\n',
    });
    expect(fs.readFileSync(runPath).equals(bytes)).toBe(true);
    expect(fixture.starts).toEqual([]);
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  });

  it('checkpoint portability rejects native symbolic-link and junction boundaries', () => {
    const linkTypes = process.platform === 'win32' ? ['junction', 'dir'] : ['dir'];
    for (const linkType of linkTypes) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-link-root-'));
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-link-outside-'));
      roots.push(root, outside);
      const { data, runPath, bytes } = writeLegacyRun(root);
      const handoffDir = path.join(root, '.omp', 'sdlc', 'handoffs');
      fs.writeFileSync(path.join(outside, 'foreign.json'), '{}\n');
      try {
        fs.symlinkSync(outside, handoffDir, linkType);
      } catch (error) {
        if (process.platform === 'win32' && linkType === 'dir') {
          expect(['EACCES', 'EPERM']).toContain(error.code);
          continue;
        }
        throw error;
      }

      expect(() => cleanupCompletedRun(data, root, { legacyCheckpointBytes: bytes }))
        .toThrow('completed_cleanup_failed');
      expect(fs.existsSync(runPath)).toBe(true);
      expect(fs.existsSync(path.join(outside, 'foreign.json'))).toBe(true);
    }
  });

  it('checkpoint portability preserves foreign and changed controller leases', () => {
    const fixture = makeControllerFixture({ labelIssues: [19] });
    const specDir = path.join(fixture.cwd, 'specs', '19-portable-checkpoint');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 19);
    const { runPath, bytes } = writeLegacyRun(fixture.cwd);
    const foreignLease = acquireControllerLease({
      projectRoot: fixture.cwd,
      runId: 'foreign-run',
      controllerPaneId: 'foreign-pane',
    });

    const result = runExecute({
      args: '#19',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result).toEqual({
      status: 1,
      stdout: '',
      stderr: 'controller_lease_held\n',
    });
    expect(fs.readFileSync(runPath).equals(bytes)).toBe(true);
    expect(fixture.starts).toEqual([]);
    expect(releaseControllerLease(foreignLease)).toBe(true);

    const changedLease = acquireControllerLease({
      projectRoot: fixture.cwd,
      runId: 'owned-run',
      controllerPaneId: 'owned-pane',
    });
    fs.writeFileSync(changedLease.path, changedLease.serialized.replace('owned-pane', 'changed-pane'));
    expect(releaseControllerLease(changedLease)).toBe(false);
    expect(fs.existsSync(changedLease.path)).toBe(true);
    fs.unlinkSync(changedLease.path);
  });

  it('checkpoint portability preserves bound revision branch and head checks', () => {
    const root = makeSpecDir();
    const initial = seedRun(root);
    const runPath = path.join(root, '.omp', 'sdlc', 'run.json');
    const bytes = fs.readFileSync(runPath);
    for (const candidate of [
      { ...initial, revision: 1 },
      { ...initial, branch: 'other-branch', revision: 2 },
      { ...initial, head: 'cccccccccccccccccccccccccccccccccccccccc', revision: 2 },
    ]) {
      expect(() => writeRun(candidate, root, 1)).toThrow();
      expect(fs.readFileSync(runPath).equals(bytes)).toBe(true);
    }
  });
  it('fails closed when startup cannot release a completed checkpoint', () => {
    const fixture = makeControllerFixture({ labelIssues: [42, 43] });
    const runPath = path.join(fixture.cwd, '.omp/sdlc/run.json');
    seedRun(fixture.cwd, {
      currentIssue: null,
      currentStep: null,
      completed: { 42: VALID_STEPS },
      failed: null,
      remediation: null,
    });
    fs.mkdirSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));
    const otherSpec = path.join(fixture.cwd, 'specs', '43-other');
    fs.mkdirSync(otherSpec, { recursive: true });
    writeApproved(otherSpec, 43);

    const result = runExecute({
      args: '#43',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result).toEqual({ status: 1, stdout: '', stderr: 'completed_cleanup_failed\n' });
    expect(fs.existsSync(runPath)).toBe(true);
    expect(fixture.starts).toEqual([]);
  });
  it('starts a different issue after completed runtime cleanup', () => {
    const fixture = makeControllerFixture({ labelIssues: [42, 43] });
    const first = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const otherSpec = path.join(fixture.cwd, 'specs', '43-other');
    fs.mkdirSync(otherSpec, { recursive: true });
    writeApproved(otherSpec, 43);

    const second = runExecute({
      args: '#43',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const nextRun = JSON.parse(fs.readFileSync(
      path.join(fixture.cwd, '.omp/sdlc/run.json'),
      'utf8',
    ));

    expect(first.status).toBe(0);
    expect(second.stderr).not.toBe('Run checkpoint identity mismatch\n');
    expect(nextRun.issue).toBe(43);
    expect(nextRun.issues).toEqual([43]);
  });

  it('fails closed when terminal cleanup cannot remove an owned artifact', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      branch: '42-ship-it',
      currentStep: null,
      completed: { 42: VALID_STEPS },
      remediation: null,
    });
    fs.mkdirSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result).toEqual({ status: 1, stdout: '', stderr: 'completed_cleanup_failed\n' });
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(true);
    expect(fixture.starts).toEqual([]);
  });


  it('rejects an unreadable create-time branch without writing a checkpoint', () => {
    const fixture = makeControllerFixture({ branch: '' });
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result).toEqual({ status: 2, stdout: '', stderr: 'Run checkpoint identity unreadable\n' });
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
    expect(fixture.starts).toEqual([]);
  });

  it('names every unlabeled explicit issue and starts no workers', () => {
    const fixture = makeControllerFixture({ labelIssues: [15] });
    const result = runExecute({ args: '#12 #15', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 2, stdout: '#12 has no spec-created label\n', stderr: '' });
    expect(fixture.starts).toEqual([]);
  });

  it('rejects an explicit officially blocked issue before local mutation', () => {
    const fixture = makeControllerFixture({ blockedIssues: [42] });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result).toEqual({ status: 2, stdout: '', stderr: 'dependency_blocked for #42\n' });
    expect(fixture.starts).toEqual([]);
    expect(fixture.calls.some((call) => call[0] === 'git')).toBe(false);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('preserves labeled explicit-list order and first-occurrence dedupe', () => {
    const fixture = makeControllerFixture({ labelIssues: [12, 15], writeHandoffs: false });
    for (const issue of [12, 15]) {
      const dir = path.join(fixture.cwd, 'specs', `${issue}-queued`);
      fs.mkdirSync(dir, { recursive: true });
      writeApproved(dir, issue);
    }

    runExecute({ args: '#15,#12 #15', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    expect(persisted.issues).toEqual([15, 12]);
    expect(fixture.starts[0].name).toBe('s15-start');
  });

  it('checks the label before approved-spec status', () => {
    const fixture = makeControllerFixture({ labelIssues: [] });
    fs.writeFileSync(path.join(fixture.cwd, 'specs/42-ship-it/design.md'), '**Issue**: #42\n**Status**: Draft\n');
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 2, stdout: '#42 has no spec-created label\n', stderr: '' });
    expect(fixture.starts).toEqual([]);
  });

  it('untracks tracked runtime before the execute dirty gate and preserves the working-tree file', () => {
    const fixture = makeControllerFixture({
      gitignore: '.omp/sdlc/\n',
      integratedRuntimeMigration: true,
    });
    const runtimePath = path.join(fixture.cwd, '.omp/sdlc/run.json');

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.stderr).not.toBe('Working tree is dirty for a new issue\n');
    expect(fixture.calls).toContainEqual(['git', 'rm', '--cached', '-r', '--', '.omp/sdlc']);
    expect(fixture.starts).not.toHaveLength(0);
    expect(fs.existsSync(runtimePath)).toBe(true);
  });

  it('rejects other dirt after untracking runtime before the start worker', () => {
    const fixture = makeControllerFixture({
      gitignore: '.omp/sdlc/\n',
      integratedRuntimeMigration: true,
    });
    fs.writeFileSync(path.join(fixture.cwd, 'local.txt'), 'dirty\n');

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result).toEqual({ status: 2, stdout: '', stderr: 'Working tree is dirty for a new issue\n' });
    expect(fixture.calls).toContainEqual(['git', 'rm', '--cached', '-r', '--', '.omp/sdlc']);
    expect(fixture.starts).toEqual([]);
  });

  it('keeps unignored runtime dirt blocking without git untrack calls', () => {
    const fixture = makeControllerFixture({ dirty: '?? .omp/sdlc/run.json\n', branch: 'main' });

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result).toEqual({ status: 2, stdout: '', stderr: 'Working tree is dirty for a new issue\n' });
    expect(fixture.calls.some((call) => call[0] === 'git' && ['ls-files', 'rm'].includes(call[1]))).toBe(false);
    expect(fixture.starts).toEqual([]);
  });

  it('keeps other dirty files blocking before worker startup', () => {
    const fixture = makeControllerFixture({
      gitignore: '.omp/sdlc/\n',
      dirty: ' M local.txt\n',
      branch: 'main',
    });

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result).toEqual({ status: 2, stdout: '', stderr: 'Working tree is dirty for a new issue\n' });
    expect(fixture.starts).toEqual([]);
  });

  it('uses the first incomplete persisted issue for dirty-tree resume', () => {
    const fixture = makeControllerFixture({
      dirty: ' M src/change.mjs\n',
      branch: '43-ship-it',
      labelIssues: [42, 43],
    });
    const laterSpec = path.join(fixture.cwd, 'specs', '43-ship-it');
    fs.mkdirSync(laterSpec, { recursive: true });
    writeApproved(laterSpec, 43);
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42, 43],
      currentIssue: 43,
      currentStep: 'start',
      completed: {
        42: VALID_STEPS,
        43: [],
      },
      failed: null,
      startedAt: '2026-08-25T00:00:00.000Z',
    });

    const result = runExecute({
      args: '',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.stderr).not.toBe('Working tree is dirty for a new issue\n');
    expect(fixture.starts.map(({ name }) => name)).toContain('s43-start');
  });

  it('fails closed when execute cannot untrack tracked runtime', () => {
    const fixture = makeControllerFixture({
      gitignore: '.omp/sdlc/\n',
      trackedRuntime: '.omp/sdlc/run.json\0',
      rmStatus: 1,
    });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({
      status: 2,
      stdout: '',
      stderr: 'Failed to untrack plugin runtime under .omp/sdlc\n',
    });
    expect(fixture.calls).toContainEqual(['git', 'rm', '--cached', '-r', '--', '.omp/sdlc']);
    expect(fixture.starts).toEqual([]);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('runs eight omp sibling workers in queue order', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    expect(fixture.starts).toEqual([
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-implement', paneId: 'pane-2', kind: 'omp' },
      { name: 's42-review1', paneId: 'pane-3', kind: 'omp' },
      { name: 's42-fix1', paneId: 'pane-4', kind: 'omp' },
      { name: 's42-review2', paneId: 'pane-5', kind: 'omp' },
      { name: 's42-fix2', paneId: 'pane-6', kind: 'omp' },
      { name: 's42-verify', paneId: 'pane-7', kind: 'omp' },
      { name: 's42-deliver', paneId: 'pane-8', kind: 'omp' },
    ]);
    expect(fixture.closed).toEqual([
      'pane-1', 'pane-2', 'pane-3', 'pane-4', 'pane-5', 'pane-6', 'pane-7', 'pane-8',
    ]);
    const reviewPrompts = fixture.prompts.filter(({ prompt }) => (
      prompt.includes('# Controller-Owned Host Review')
    ));
    expect(reviewPrompts.map(({ name }) => name)).toEqual([
      's42-review1',
      's42-review2',
    ]);
    expect(reviewPrompts.every(({ prompt }) => prompt.includes('exact base `main`'))).toBe(true);
    expect(fixture.prompts.some(({ prompt }) => prompt === '/review')).toBe(false);
    expect(fixture.sentKeys).toEqual([]);
    const generatedPromptNames = fixture.prompts
      .filter(({ prompt }) => !prompt.includes('# Controller-Owned Host Review'))
      .map(({ name }) => name);
    expect(generatedPromptNames).toEqual([
      's42-start',
      's42-implement',
      's42-fix1',
      's42-fix2',
      's42-verify',
      's42-deliver',
    ]);
    expect(new Set(generatedPromptNames).size).toBe(generatedPromptNames.length);
    for (const name of generatedPromptNames) {
      const started = fixture.events.indexOf(`start:${name}`);
      const prompted = fixture.events.indexOf(`prompt:${name}`, started);
      expect(fixture.events.slice(started + 1, prompted)).toEqual(['list']);
    }
  });

  it('passes only the exact smoke queue to a newly split verify pane', () => {
    const fixture = makeControllerFixture();
    const queue = '#39, 40';
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env: { ...env, NMG_SDLC_SMOKE_ISSUES: queue, UNRELATED_SECRET: 'do-not-copy' },
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.splits).toHaveLength(VALID_STEPS.length);
    expect(fixture.splits[VALID_STEPS.indexOf('verify')]).toEqual({
      direction: 'right',
      cwd: fixture.cwd,
      environment: { NMG_SDLC_SMOKE_ISSUES: queue },
    });
    expect(fixture.splits.filter((split) => Object.hasOwn(split, 'environment'))).toHaveLength(1);
  });

  it('omits pane environment when the smoke queue is missing', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.splits.every((split) => !Object.hasOwn(split, 'environment'))).toBe(true);
  });

  it('passes pane environment through Herdr argv without shell composition', () => {
    const calls = [];
    const herdr = defaultHerdr((command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    }, '/controller');
    const queue = '39,40; $(touch /tmp/never)';

    herdr.paneSplit({
      direction: 'down',
      cwd: '/consumer',
      environment: { NMG_SDLC_SMOKE_ISSUES: queue },
    });

    expect(calls).toEqual([{
      command: 'herdr',
      args: [
        'pane', 'split', '--current', '--direction', 'down', '--cwd', '/consumer', '--no-focus',
        '--env', `NMG_SDLC_SMOKE_ISSUES=${queue}`,
      ],
      options: { cwd: '/controller' },
    }]);
  });

  it('disables the interactive large-paste menu before submitting a canonical verify prompt', () => {
    const root = makeSpecDir();
    const prompt = workerPrompt({ step: 'verify', issue: 347, cwd: REPOSITORY_ROOT });
    expect(prompt.split('\n').length).toBeGreaterThan(100);
    expect(prompt).not.toMatch(/\s$/);

    const calls = [];
    const herdr = defaultHerdr((command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    }, root);

    herdr.agentStart({ name: 's347-verify', paneId: 'w1:p2' });
    herdr.agentPrompt({ name: 's347-verify', prompt });

    const configPath = path.join(fs.realpathSync(root), '.omp/sdlc/omp-controller.yml');
    expect(fs.readFileSync(configPath, 'utf8')).toBe('paste:\n  largeMenuThreshold: 0\n');
    expect(calls).toEqual([
      {
        command: 'herdr',
        args: [
          'agent', 'start', 's347-verify', '--kind', 'omp', '--pane', 'w1:p2',
          '--', '--config', configPath,
        ],
        options: { cwd: root },
      },
      {
        command: 'herdr',
        args: ['agent', 'prompt', 's347-verify', prompt],
        options: { cwd: root },
      },
    ]);
  });

  it('does not replace the environment of a retained verify worker', () => {
    const fixture = makeControllerFixture();
    configureFailedRetainedVerifyWorker(fixture, { state: 'working' });
    fixture.herdr.paneSplit = () => {
      throw new Error('retained verify worker must not be split again');
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env: { ...env, NMG_SDLC_SMOKE_ISSUES: '99,100' },
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([]);
  });

  it('closes a remediable failed verify pane then starts one rem session', () => {
    const fixture = makeControllerFixture({ remediableFailedStep: 'verify' });
    const queue = '#39, 40';
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env: { ...env, NMG_SDLC_SMOKE_ISSUES: queue },
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const verifyStarts = fixture.starts.filter(({ name }) => name === 's42-verify');
    const remStarts = fixture.starts.filter(({ name }) => name === 'r42-verify');

    expect(result.status).toBe(0);
    expect(verifyStarts).toHaveLength(1);
    expect(remStarts).toHaveLength(1);
    expect(fixture.events.indexOf('close:pane-7')).toBeLessThan(fixture.events.indexOf('start:r42-verify'));
    expect(fixture.splits.filter((split) => Object.hasOwn(split, 'environment'))).toEqual([
      {
        direction: 'right',
        cwd: fixture.cwd,
        environment: { NMG_SDLC_SMOKE_ISSUES: queue },
      },
      {
        direction: 'right',
        cwd: fixture.cwd,
        environment: { NMG_SDLC_SMOKE_ISSUES: queue },
      },
    ]);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
    expect(fixture.notifications).toEqual([]);
    expect(fixture.prompts.filter(({ name }) => name === 'r42-verify')).toHaveLength(1);
    const remStarted = fixture.events.indexOf('start:r42-verify');
    const remPrompted = fixture.events.indexOf('prompt:r42-verify', remStarted);
    expect(fixture.events.slice(remStarted + 1, remPrompted)).toEqual(['list']);
  });

  it('retries remediable rem failure with a fresh rem session', () => {
    const fixture = makeControllerFixture({ remediableFailedStep: 'verify', remFailures: 1 });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const remStarts = fixture.starts.filter(({ name }) => name === 'r42-verify');

    expect(result.status).toBe(0);
    expect(remStarts).toEqual([
      { name: 'r42-verify', paneId: 'pane-8', kind: 'omp' },
      { name: 'r42-verify', paneId: 'pane-9', kind: 'omp' },
    ]);
    expect(fixture.events.indexOf('close:pane-8')).toBeLessThan(
      fixture.events.lastIndexOf('start:r42-verify'),
    );
    expect(fixture.starts.filter(({ name }) => name === 's42-verify')).toHaveLength(1);
    expect(fixture.closed).toContain('pane-9');
  });

  it('consumes the original verify handoff after rem pass', () => {
    const fixture = makeControllerFixture({ remediableFailedStep: 'verify' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-verify.json'))).toBe(false);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-rem.json'))).toBe(false);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('closes a blocked remediation pane on terminal stop', () => {
    const fixture = makeControllerFixture({
      remediableFailedStep: 'verify',
      remBlocked: true,
      failedNext: 'implement',
    });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts.filter(({ name }) => name === 'r42-verify')).toHaveLength(1);
    expect(fixture.closed).toContain('pane-8');
    expect(persisted.remediation).toMatchObject({ issue: 42, step: 'verify', status: 'stopped' });
    expect(persisted.failed).toMatchObject({ issue: 42, step: 'verify', reasonCode: 'verify_failed' });
  });

  it('rewinds a stopped blocked remediation after its pane disappears', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'verify',
      completed: { 42: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'] },
      failed: { issue: 42, step: 'verify', reasonCode: 'verify_failed' },
      remediation: {
        issue: 42,
        step: 'verify',
        attempt: 1,
        status: 'stopped',
        reasonCode: 'verify_failed',
        summary: 'verify remediation blocked',
        artifacts: ['artifacts/verify.txt'],
        closedWorker: { name: 's42-verify', paneId: 'closed-verify' },
        remWorker: { name: 'r42-verify', paneId: 'missing-rem' },
        history: [],
      },
      startedAt: '2026-08-25T00:00:00.000Z',
    });
    const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(path.join(handoffDir, '42-verify.json'), `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      step: 'verify',
      status: 'blocked',
      intervention: false,
      summary: 'implementation must be corrected',
      artifacts: ['artifacts/verify.txt'],
      next: 'implement',
      reasonCode: 'verify_failed',
    })}\n`);
    fixture.herdr.listAgents = () => activeStartedAgents(fixture);

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.starts.map(({ name }) => name)).toEqual([
      's42-implement',
      's42-review1',
      's42-fix1',
      's42-review2',
      's42-fix2',
      's42-verify',
      's42-deliver',
    ]);
    expect(fixture.starts.some(({ name }) => name === 'r42-verify')).toBe(false);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('resumes a live rem worker without starting the step or another rem', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'verify',
      completed: { 42: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'] },
      failed: { issue: 42, step: 'verify', reasonCode: 'verification_failed' },
      remediation: {
        issue: 42,
        step: 'verify',
        attempt: 1,
        status: 'active',
        reasonCode: 'verification_failed',
        summary: 'verify failed',
        artifacts: ['artifacts/verify.txt'],
        closedWorker: { name: 's42-verify', paneId: 'closed-verify' },
        remWorker: { name: 'r42-verify', paneId: 'live-rem' },
        history: [],
      },
      startedAt: '2026-08-25T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [
      { name: 'r42-verify', pane_id: 'live-rem', state: 'working' },
      ...activeStartedAgents(fixture),
    ];
    let settled = false;
    const agentWait = fixture.herdr.agentWait;
    fixture.herdr.agentWait = (input) => {
      const result = agentWait(input);
      if (!input.until) settled = true;
      return result;
    };
    fixture.herdr.agentGet = () => ({ result: { state: settled ? 'done' : 'working' } });

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.waits).toContainEqual({ name: 'r42-verify' });
    expect(fixture.starts.some(({ name }) => name === 's42-verify' || name === 'r42-verify')).toBe(false);
    expect(fixture.starts.map(({ name }) => name)).toEqual(['s42-deliver']);
    expect(fixture.closed).toContain('live-rem');
  });

  it('closes a live review remediation worker when the review base is missing', () => {
    const fixture = makeControllerFixture({
      localDefaultRef: false,
      remoteDefaultRef: false,
    });
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'review1',
      completed: { 42: ['start', 'implement'] },
      failed: { issue: 42, step: 'review1', reasonCode: 'review_failed' },
      remediation: {
        issue: 42,
        step: 'review1',
        attempt: 1,
        status: 'active',
        reasonCode: 'review_failed',
        summary: 'review failed',
        artifacts: [],
        closedWorker: { name: 's42-review1', paneId: 'closed-review' },
        remWorker: { name: 'r42-review1', paneId: 'live-rem' },
        history: [],
      },
      workers: {
        'r42-review1': {
          name: 'r42-review1',
          paneId: 'live-rem',
          projectRoot: fs.realpathSync(fixture.cwd),
          runId: 'test-run-id',
          issue: 42,
          step: 'review1',
          branch: '42-ship-it',
          head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      startedAt: '2026-08-25T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [{
      name: 'r42-review1',
      pane_id: 'live-rem',
      state: 'working',
    }];

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(1);
    expect(fixture.closed).toContain('live-rem');
    expect(fixture.starts).toEqual([]);
  });

  it('resumes live review remediation activation without a second protocol prompt', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'review1',
      completed: { 42: ['start', 'implement'] },
      failed: { issue: 42, step: 'review1', reasonCode: 'review_failed' },
      remediation: {
        issue: 42,
        step: 'review1',
        attempt: 1,
        status: 'active',
        reasonCode: 'review_failed',
        summary: 'review failed',
        artifacts: [],
        closedWorker: { name: 's42-review1', paneId: 'closed-review' },
        remWorker: { name: 'r42-review1', paneId: 'live-rem' },
        history: [],
      },
      workers: {
        'r42-review1': {
          name: 'r42-review1',
          paneId: 'live-rem',
          projectRoot: fs.realpathSync(fixture.cwd),
          runId: 'test-run-id',
          issue: 42,
          step: 'review1',
          branch: '42-ship-it',
          head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      startedAt: '2026-08-25T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [{
      name: 'r42-review1',
      pane_id: 'live-rem',
      state: 'idle',
    }, ...activeStartedAgents(fixture)];
    fixture.herdr.agentGet = () => ({ result: { state: 'idle' } });
    const agentPrompt = fixture.herdr.agentPrompt;
    fixture.herdr.agentPrompt = (input) => {
      if (input.name !== 'r42-review1') return agentPrompt(input);
      fixture.prompts.push(input);
      fixture.events.push(`prompt:${input.name}`);
      return { status: 0 };
    };
    fixture.herdr.observationPause = () => {
      throw new Error('simulated controller crash during live review remediation activation');
    };

    const first = runExecute({
      args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr,
    });
    const crashed = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(first.status).toBe(1);
    expect(crashed.workers['r42-review1']).toMatchObject({
      promptDelivery: 'activating',
      promptDeliveryVersion: 2,
    });
    expect(fixture.prompts.filter(({ name }) => name === 'r42-review1')).toHaveLength(1);
    expect(fixture.closed).toEqual([]);

    let wroteEvidence = false;
    fixture.herdr.observationPause = () => {
      if (wroteEvidence) return;
      wroteEvidence = true;
      writeReviewEvidence(fixture, 'review1');
    };
    const second = runExecute({
      args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr,
    });

    expect(second.status).toBe(0);
    expect(wroteEvidence).toBe(true);
    expect(fixture.prompts.filter(({ name }) => name === 'r42-review1')).toHaveLength(1);
    expect(fixture.closed).toContain('live-rem');
  });

  it('submits a pasted prompt when resuming an idle remediation worker', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'verify',
      completed: { 42: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'] },
      failed: { issue: 42, step: 'verify', reasonCode: 'verification_failed' },
      remediation: {
        issue: 42,
        step: 'verify',
        attempt: 1,
        status: 'active',
        reasonCode: 'verification_failed',
        summary: 'verify failed',
        artifacts: ['artifacts/verify.txt'],
        closedWorker: { name: 's42-verify', paneId: 'closed-verify' },
        remWorker: { name: 'r42-verify', paneId: 'live-rem' },
        history: [],
      },
      startedAt: '2026-08-25T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [
      { name: 'r42-verify', pane_id: 'live-rem', state: 'idle' },
      ...activeStartedAgents(fixture),
    ];
    fixture.herdr.agentGet = () => ({ result: { state: 'idle' } });
    fixture.herdr.agentRead = () => 'You are rem\nFailed work\nreasonCode:';

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.sentKeys[0]).toEqual(['enter']);
    expect(fixture.waits.slice(0, 2)).toEqual([
      { name: 'r42-verify', until: 'working' },
      { name: 'r42-verify' },
    ]);
    expect(fixture.starts.some(({ name }) => name === 's42-verify' || name === 'r42-verify')).toBe(false);
    expect(fixture.starts.map(({ name }) => name)).toEqual(['s42-deliver']);
    expect(fixture.closed).toContain('live-rem');
    expect(fixture.prompts.filter(({ name }) => name === 'r42-verify')).toEqual([]);
  });

  it('stops a settled remediation worker without waiting for future work', () => {
    const fixture = makeControllerFixture({ writeHandoffs: false });
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'verify',
      completed: { 42: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'] },
      failed: { issue: 42, step: 'verify', reasonCode: 'verification_failed' },
      remediation: {
        issue: 42,
        step: 'verify',
        attempt: 1,
        status: 'active',
        reasonCode: 'verification_failed',
        summary: 'verify failed',
        artifacts: ['artifacts/verify.txt'],
        closedWorker: { name: 's42-verify', paneId: 'closed-verify' },
        remWorker: { name: 'r42-verify', paneId: 'live-rem' },
        history: [],
      },
      workers: {
        'r42-verify': {
          name: 'r42-verify',
          paneId: 'live-rem',
          projectRoot: fs.realpathSync(fixture.cwd),
          runId: 'test-run-id',
          issue: 42,
          step: 'verify',
          branch: '42-ship-it',
          head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      startedAt: '2026-08-25T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [{
      name: 'r42-verify',
      pane_id: 'live-rem',
      state: 'idle',
    }];
    fixture.herdr.agentGet = () => ({ result: { state: 'idle' } });
    fixture.herdr.agentRead = () => 'Unrelated settled worker output';
    fixture.herdr.agentWait = () => {
      throw new Error('must not wait for future work from a settled remediation worker');
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(fixture.closed).toEqual(['live-rem']);
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'verify',
      reasonCode: 'missing_handoff',
    });
    expect(persisted.workers).toEqual({});
  });

  it('does not rem a failed start or intervention handoff', () => {
    for (const failedStep of ['start', 'implement']) {
      const fixture = makeControllerFixture({ failedStep });
      const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
      expect(result.status).toBe(1);
      expect(fixture.starts.some(({ name }) => name.startsWith('r42-'))).toBe(false);
      expect(fixture.closed).toContain(`pane-${VALID_STEPS.indexOf(failedStep) + 1}`);
    }
  });

  it('does not rem blocked unknown missing stalled or invalid outcomes', () => {
    const blocked = makeControllerFixture({ blockedStep: 'implement' });
    blocked.herdr.observationPause = () => {
      throw new Error('valid blocked handoff must not be re-observed');
    };
    const blockedResult = runExecute({ args: '#42', cwd: blocked.cwd, env, run: blocked.run, herdr: blocked.herdr });
    expect(blockedResult.status).toBe(1);
    expect(blocked.starts.some(({ name }) => name.startsWith('r42-'))).toBe(false);

    const missing = makeControllerFixture({ writeHandoffs: false });
    const missingResult = runExecute({ args: '#42', cwd: missing.cwd, env, run: missing.run, herdr: missing.herdr });
    expect(missingResult.status).toBe(1);
    expect(missing.starts.some(({ name }) => name.startsWith('r42-'))).toBe(false);

    const invalid = makeControllerFixture({ handoffStep: 'rem' });
    const invalidResult = runExecute({ args: '#42', cwd: invalid.cwd, env, run: invalid.run, herdr: invalid.herdr });
    expect(invalidResult.status).toBe(1);
    expect(invalid.starts.some(({ name }) => name.startsWith('r42-'))).toBe(false);

    const stalled = makeControllerFixture({ stalled: true });
    stalled.herdr.agentRead = () => 'unrelated worker text';
    const stalledResult = runExecute({ args: '#42', cwd: stalled.cwd, env, run: stalled.run, herdr: stalled.herdr });
    expect(stalledResult.status).toBe(1);
    expect(stalled.starts.some(({ name }) => name.startsWith('r42-'))).toBe(false);

    const unknown = makeControllerFixture();
    configurePassedRetainedStartWorker(unknown, { result: { state: 'idle' } });
    unknown.herdr.listAgents = () => [{ name: 's42-start', state: 'idle' }];
    const unknownResult = runExecute({ args: '#42', cwd: unknown.cwd, env, run: unknown.run, herdr: unknown.herdr });
    expect(unknownResult.status).toBe(1);
    expect(unknown.starts.some(({ name }) => name.startsWith('r42-'))).toBe(false);
  });

  it('stops an invalid remediation handoff without starting another attempt', () => {
    const fixture = makeControllerFixture({
      remediableFailedStep: 'verify',
      handoffContent: (handoff, { isRem }) => {
        if (!isRem) return JSON.stringify(handoff);
        const { schemaVersion: _schemaVersion, ...invalid } = handoff;
        return JSON.stringify(invalid);
      },
    });
    let observations = 0;
    fixture.herdr.observationPause = () => {
      const handoffPath = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-verify.json');
      if (
        fs.existsSync(handoffPath)
        && !fs.readFileSync(handoffPath, 'utf8').includes('"schemaVersion"')
      ) observations += 1;
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(observations).toBe(60);
    expect(fixture.starts.filter(({ name }) => name === 'r42-verify')).toHaveLength(1);
    expect(fixture.closed).toContain('pane-8');
    expect(persisted.failed).toEqual({ issue: 42, step: 'verify', reasonCode: 'invalid_handoff' });
    expect(persisted.remediation).toMatchObject({
      issue: 42,
      step: 'verify',
      attempt: 1,
      reasonCode: 'verify_failed',
    });
    expect(persisted.remediation.history).toHaveLength(1);
  });

  it('re-reads an incomplete remediation handoff without starting another attempt', () => {
    const fixture = makeControllerFixture({
      remediableFailedStep: 'verify',
      handoffContent: (handoff, { isRem }) => isRem
        ? '{"schemaVersion":1'
        : JSON.stringify(handoff),
    });
    const agentGets = [];
    const getAgent = fixture.herdr.agentGet;
    fixture.herdr.agentGet = (name) => {
      agentGets.push(name);
      return getAgent(name);
    };
    let observations = 0;
    fixture.herdr.observationPause = () => {
      const handoffPath = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-verify.json');
      if (
        !fs.existsSync(handoffPath)
        || fs.readFileSync(handoffPath, 'utf8') !== '{"schemaVersion":1\n'
      ) return;
      observations += 1;
      fs.writeFileSync(
        handoffPath,
        `${JSON.stringify({
          schemaVersion: 1,
          issue: 42,
          step: 'verify',
          status: 'passed',
          intervention: false,
          summary: 'Remediation corrected and validated',
          artifacts: [],
          next: 'deliver',
          reasonCode: null,
        })}\n`,
      );
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(observations).toBe(1);
    expect(fixture.starts.filter(({ name }) => name === 'r42-verify')).toHaveLength(1);
    expect(agentGets).toContain('r42-verify');
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('persists remediation evidence before a failed pane close and starts no rem', () => {
    const fixture = makeControllerFixture({
      remediableFailedStep: 'verify',
      paneCloseFailurePane: 'pane-7',
    });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(persisted.failed).toEqual({ issue: 42, step: 'verify', reasonCode: 'pane_close_failed' });
    expect(persisted.remediation).toMatchObject({
      issue: 42,
      step: 'verify',
      attempt: 1,
      reasonCode: 'verify_failed',
      artifacts: ['artifacts/verify.txt'],
      closedWorker: { name: 's42-verify', paneId: 'pane-7' },
      remWorker: null,
    });
    expect(fixture.starts.some(({ name }) => name === 'r42-verify')).toBe(false);
  });

  it('runs deterministic review completion for a review rem worker', () => {
    const fixture = makeControllerFixture({ remediableFailedStep: 'review1' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.starts.filter(({ name }) => name === 'r42-review1')).toHaveLength(1);
    expect(fixture.prompts.some(({ name, prompt }) => (
      name === 'r42-review1'
      && prompt.includes('exact base `main`')
    ))).toBe(true);
    expect(fixture.prompts.some(({ name, prompt }) => name === 'r42-review1' && prompt.includes('You are remediating issue #42 step review1'))).toBe(true);
    expect(fixture.prompts.some(({ prompt }) => prompt === '/review')).toBe(false);
    expect(fixture.sentKeys).toEqual([]);
  });

  it('waits through fresh standard idle before working and prompts exactly once', () => {
    const fixture = makeControllerFixture();
    const observations = configureDelayedIdleTransition(fixture, 's42-start', 'start');

    const result = runExecute({
      args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(observations()).toBe(2);
    expect(observations.deliveryStates()).toContain('activating');
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.sentKeys).toEqual([]);
    expect(fixture.closed).toContain('pane-1');
  });

  it('waits through fresh review idle before working and prompts exactly once', () => {
    const fixture = makeControllerFixture();
    const observations = configureDelayedIdleTransition(fixture, 's42-review1', 'review1');

    const result = runExecute({
      args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(observations()).toBe(3);
    expect(observations.deliveryStates()).toContain('activating');
    expect(fixture.prompts.filter(({ name }) => name === 's42-review1')).toHaveLength(1);
    expect(fixture.sentKeys).toEqual([]);
    expect(fixture.closed).toContain('pane-3');
  });

  it('waits through fresh remediation idle before working and prompts exactly once', () => {
    const fixture = makeControllerFixture({ remediableFailedStep: 'verify' });
    const observations = configureDelayedIdleTransition(fixture, 'r42-verify', 'verify');

    const result = runExecute({
      args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(observations()).toBe(2);
    expect(observations.deliveryStates()).toContain('activating');
    expect(fixture.prompts.filter(({ name }) => name === 'r42-verify')).toHaveLength(1);
    expect(fixture.sentKeys).toEqual([]);
    expect(fixture.closed).toContain('pane-8');
  });

  it('resumes a persisted activating worker without submitting the prompt again', () => {
    const fixture = makeControllerFixture({ writeHandoffs: false, agentState: 'idle' });
    fixture.herdr.agentRead = () => '';
    fixture.herdr.observationPause = () => {
      throw new Error('simulated controller crash after prompt acceptance');
    };

    const first = runExecute({
      args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr,
    });
    const crashed = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(first.status).toBe(1);
    expect(crashed.workers['s42-start']).toMatchObject({
      promptDelivery: 'activating',
      promptDeliveryVersion: 2,
    });
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.closed).toEqual([]);

    let state = 'idle';
    let pauses = 0;
    const getAgent = fixture.herdr.agentGet;
    fixture.herdr.agentGet = (name) => (
      name === 's42-start' ? { result: { state } } : getAgent(name)
    );
    fixture.herdr.listAgents = () => activeStartedAgents(fixture).map((agent) => (
      agent.name === 's42-start' ? { ...agent, state } : agent
    ));
    const waitAgent = fixture.herdr.agentWait;
    fixture.herdr.agentWait = (input) => {
      const result = waitAgent(input);
      if (input.name === 's42-start' && !input.until) state = 'done';
      return result;
    };
    fixture.herdr.observationPause = () => {
      pauses += 1;
      if (pauses !== 2) return;
      state = 'working';
      const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
      fs.mkdirSync(handoffDir, { recursive: true });
      fs.writeFileSync(path.join(handoffDir, '42-start.json'), `${JSON.stringify({
        schemaVersion: 1,
        issue: 42,
        step: 'start',
        status: 'passed',
        intervention: false,
        summary: 'start completed after controller resume',
        artifacts: [],
        next: 'implement',
        reasonCode: null,
      })}\n`);
    };

    const second = runExecute({
      args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr,
    });

    expect(second.status).toBe(1);
    expect(second.stdout).toContain('Stopped on #42 implement');
    expect(pauses).toBeGreaterThanOrEqual(2);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.closed).toContain('pane-1');
  });

  it('closes an exhausted proven activation without another generated prompt', () => {
    const fixture = makeControllerFixture({ writeHandoffs: false, agentState: 'idle' });
    fixture.herdr.agentRead = () => '';

    const result = runExecute({
      args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr,
    });
    const exhausted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(exhausted.failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'missing_handoff',
    });
    expect(exhausted.workers).toEqual({});
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.closed).toEqual(['pane-1']);
  });

  it('ignores a stale handoff and closes an initially idle fresh worker', () => {
    const fixture = makeControllerFixture({ writeHandoffs: false });
    const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(path.join(handoffDir, '42-start.json'), `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      step: 'start',
      status: 'passed',
      intervention: false,
      summary: 'Stale start result',
      artifacts: [],
      next: 'implement',
      reasonCode: null,
    })}\n`);

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([{ name: 's42-start', paneId: 'pane-1', kind: 'omp' }]);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8')).failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'missing_handoff',
    });
  });

  it('honors a passed idle handoff when the prompt wait reports failure', () => {
    const fixture = makeControllerFixture({ promptStatus: 1 });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
    expect(fixture.closed).toContain('pane-1');
    expect(fixture.starts.map(({ name }) => name)).toContain('s42-implement');
  });

  it('retains an unproven failed prompt without a matching handoff', () => {
    const fixture = makeControllerFixture({ promptStatus: 1, writeHandoffs: false });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([{ name: 's42-start', paneId: 'pane-1', kind: 'omp' }]);
    expect(fixture.closed).toEqual([]);
    expect(persisted.failed).toEqual({
      issue: 42, step: 'start', reasonCode: 'prompt_pending', intervention: true,
    });
    expect(fixture.notifications[0]).toMatchObject({
      title: 'nmg-sdlc stopped',
      body: expect.stringContaining('retained with prompt pending'),
    });
  });

  it('settles initial idle as missing handoff after proven delivery', () => {
    const fixture = makeControllerFixture({ writeHandoffs: false, agentState: 'done' });
    fixture.herdr.agentRead = () => '';

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(fixture.waits).toEqual([]);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'missing_handoff',
    });
  });

  it('retains an unproven failed prompt even when the worker appears busy', () => {
    const fixture = makeControllerFixture({
      promptStatus: 1, agentState: 'working', writeHandoffs: false,
    });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([{ name: 's42-start', paneId: 'pane-1', kind: 'omp' }]);
    expect(fixture.closed).toEqual([]);
    expect(persisted.failed).toEqual({
      issue: 42, step: 'start', reasonCode: 'prompt_pending', intervention: true,
    });
  });

  it('recovers one pasted stalled prompt without a timeout', () => {
    const fixture = makeControllerFixture({ stalled: true });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    expect(fixture.sentKeys).toEqual([['enter']]);
    expect(fixture.waits[0]).toEqual({ name: 's42-start', until: 'working' });
    expect(fixture.waits[1]).toEqual({ name: 's42-start' });
    expect(fixture.waits.every((waitCall) => !Object.hasOwn(waitCall, 'timeout'))).toBe(true);
  });

  it('does not submit Enter twice when stalled recovery produces no handoff', () => {
    const fixture = makeControllerFixture({ stalled: true, writeHandoffs: false });
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(fixture.sentKeys).toEqual([['enter']]);
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'missing_handoff',
    });
  });

  it('recovers a stalled prompt reported as JSON on stderr', () => {
    const fixture = makeControllerFixture({ stalledInStderr: true });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.sentKeys[0]).toEqual(['enter']);
    expect(fixture.waits.slice(0, 2)).toEqual([
      { name: 's42-start', until: 'working' },
      { name: 's42-start' },
    ]);
    expect(fixture.closed).toContain('pane-1');
  });

  it('fails closed when a stalled prompt is not visibly pasted', () => {
    const fixture = makeControllerFixture({ stalled: true });
    fixture.herdr.agentRead = () => 'You are the reviewer for unrelated work';
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.sentKeys).toEqual([]);
    expect(fixture.closed).toEqual([]);
    expect(persisted.workers['s42-start'].promptDelivery).toBe('pending');
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'prompt_pending',
      intervention: true,
    });
  });

  it('does not use Enter as primary delivery when agentPrompt reports idle', () => {
    const fixture = makeControllerFixture({ settledBeforeSubmit: true });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.sentKeys).toEqual([]);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(persisted.failed).toMatchObject({ reasonCode: 'missing_handoff' });
  });

  it('does not submit Enter after a successful prompt while state is stale idle', () => {
    const fixture = makeControllerFixture({ settledBeforeSubmit: true, agentState: 'idle' });
    const readAgent = fixture.herdr.agentRead;
    const sendKeys = fixture.herdr.agentSendKeys;
    fixture.herdr.agentRead = (input) => input.name === 's42-start' ? 'Working…' : readAgent(input);
    fixture.herdr.agentSendKeys = (input) => {
      if (input.name === 's42-start') throw new Error('must not resubmit an active worker prompt');
      return sendKeys(input);
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.waits).toEqual([]);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(persisted.failed).toMatchObject({ reasonCode: 'missing_handoff' });
  });

  it('recovers a worker prompt from all three leading previews', () => {
    const fixture = makeControllerFixture({ stalled: true });
    const readAgent = fixture.herdr.agentRead;
    const previews = workerPrompt({ step: 'start', issue: 42 })
      .split('\n', 3)
      .map((line) => line.slice(0, 11))
      .join('\n');
    fixture.herdr.agentRead = (input) => input.name === 's42-start' ? previews : readAgent(input);

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.sentKeys[0]).toEqual(['enter']);
    expect(fixture.closed).toContain('pane-1');
  });

  it('keeps a failed worker pane and sends the exact notification', () => {
    const fixture = makeControllerFixture({ failedStep: 'implement' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(1);
    expect(fixture.closed).toEqual(['pane-1', 'pane-2']);
    expect(fixture.notifications).toEqual([{
      title: 'nmg-sdlc stopped',
      body: 'Stopped on #42 implement. Worker pane pane-2 agent s42-implement closed.',
      sound: 'request',
    }]);
  });

  it('stops after failed review1 without launching later queue steps', () => {
    const fixture = makeControllerFixture({ failedStep: 'review1' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(1);
    expect(fixture.starts.map(({ name }) => name)).toEqual(['s42-start', 's42-implement', 's42-review1']);
    expect(fixture.starts.some(({ name }) => /s42-(fix1|review2|fix2|verify|deliver)/.test(name))).toBe(false);
    expect(fixture.closed).toEqual(['pane-1', 'pane-2', 'pane-3']);
  });

  it('retains an owned failed worker only when explicitly requested', () => {
    const fixture = makeControllerFixture({ failedStep: 'start' });
    const result = runExecute({
      args: '--retain-worker #42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('retained by request');
    expect(fixture.closed).toEqual([]);
    expect(persisted.workers['s42-start']).toMatchObject({
      name: 's42-start',
      paneId: 'pane-1',
      runId: persisted.runId,
      issue: 42,
      step: 'start',
      branch: '42-ship-it',
      head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
  });

  it('persists cancellation after a subordinate checkpoint CAS before releasing the lease', () => {
    const fixture = makeControllerFixture({ writeHandoffs: false });
    const processApi = new EventEmitter();
    let subordinateRevision;
    processApi.exit = (code) => {
      const error = new Error(`signal_exit_${code}`);
      throw error;
    };
    fixture.herdr.agentPrompt = () => {
      const runPath = path.join(fixture.cwd, '.omp/sdlc/run.json');
      const checkpoint = JSON.parse(fs.readFileSync(runPath, 'utf8'));
      subordinateRevision = checkpoint.revision + 1;
      writeRun({
        ...checkpoint,
        revision: subordinateRevision,
        delivery: {
          issue: 42,
          pullRequest: 77,
          expectedHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          status: 'expected',
          reconciliation: null,
        },
      }, fixture.cwd, checkpoint.revision);
      processApi.emit('SIGINT');
      return { status: 1 };
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
      installSignalHandlers: true,
      processApi,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('signal_exit_130\n');
    expect(fixture.closed).toEqual([]);
    expect(persisted.revision).toBe(subordinateRevision + 1);
    expect(persisted.delivery).toEqual({
      issue: 42,
      pullRequest: 77,
      expectedHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      status: 'expected',
      reconciliation: null,
    });
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'controller_cancelled',
    });
    expect(persisted.workers['s42-start'].promptDelivery).toBe('pending');
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/controller.lock'))).toBe(false);
  });

  it('keeps the controller lease when cancellation checkpoint persistence fails', () => {
    const fixture = makeControllerFixture({ writeHandoffs: false });
    const processApi = new EventEmitter();
    processApi.exit = (code) => {
      const error = new Error(`signal_exit_${code}`);
      throw error;
    };
    fixture.herdr.agentPrompt = () => {
      fs.writeFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json.lock'), '');
      processApi.emit('SIGINT');
      return { status: 1 };
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
      installSignalHandlers: true,
      processApi,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('signal_exit_130\n');
    expect(fixture.closed).toEqual([]);
    expect(persisted.failed).toBeNull();
    expect(persisted.workers['s42-start']).toBeDefined();
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/controller.lock'))).toBe(true);
  });

  function writeReviewEvidence(fixture, step, body = 'No findings.\n') {
    const artifact = `.omp/sdlc/reviews/42-${step}.md`;
    const artifactPath = path.join(fixture.cwd, artifact);
    const handoffPath = path.join(fixture.cwd, `.omp/sdlc/handoffs/42-${step}.json`);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(artifactPath, body);
    fs.writeFileSync(handoffPath, `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      step,
      status: 'passed',
      intervention: false,
      summary: `${step} complete`,
      artifacts: [artifact],
      next: step === 'review1' ? 'fix1' : 'fix2',
      reasonCode: null,
    })}\n`);
  }

  it('SCN001 reviews both passes against a remote-only default ref without picker interaction', () => {
    const defaultBranch = 'main-with-a-name-long-enough-to-wrap-in-a-narrow-pane';
    const fixture = makeControllerFixture({
      defaultBranch,
      localDefaultRef: false,
      remoteDefaultRef: true,
      paneWidth: 30,
    });
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    const reviewPrompts = fixture.prompts.filter(({ prompt }) => (
      prompt.startsWith('# Controller-Owned Host Review')
    ));
    expect(reviewPrompts.map(({ name }) => name)).toEqual(['s42-review1', 's42-review2']);
    expect(reviewPrompts.every(({ prompt }) => (
      prompt.includes(`exact base \`origin/${defaultBranch}\``)
      && prompt.includes('# Review Finalization Contract')
    ))).toBe(true);
    expect(fixture.calls).toContainEqual([
      'git', 'show-ref', '--verify', '--quiet', `refs/remotes/origin/${defaultBranch}`,
    ]);
    expect(fixture.prompts.some(({ prompt }) => prompt === '/review')).toBe(false);
    expect(fixture.sentKeys).toEqual([]);
  });

  it('SCN002 prefers the exact local default ref for both review passes', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    const reviewPrompts = fixture.prompts.filter(({ prompt }) => (
      prompt.startsWith('# Controller-Owned Host Review')
    ));
    expect(reviewPrompts.map(({ name }) => name)).toEqual(['s42-review1', 's42-review2']);
    expect(reviewPrompts.every(({ prompt }) => prompt.includes('exact base `main`'))).toBe(true);
    expect(fixture.calls).not.toContainEqual([
      'git', 'show-ref', '--verify', '--quiet', 'refs/remotes/origin/main',
    ]);
  });

  it('SCN004 accepts a successful review handoff without a settlement wait', () => {
    const fixture = makeControllerFixture();
    const agentWait = fixture.herdr.agentWait;
    fixture.herdr.agentWait = (input) => (
      input.name === 's42-review1'
        ? { status: 1, reasonCode: 'no_future_working_transition' }
        : agentWait(input)
    );

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.waits.filter(({ name }) => name === 's42-review1')).toEqual([]);
    expect(fixture.closed).toContain('pane-3');
  });

  it('SCN005 submits one Enter for an exactly pasted stalled review prompt', () => {
    const fixture = makeControllerFixture();
    const agentPrompt = fixture.herdr.agentPrompt;
    const pending = new Map();
    fixture.herdr.agentPrompt = (input) => {
      if (!input.prompt.startsWith('# Controller-Owned Host Review')) return agentPrompt(input);
      fixture.prompts.push(input);
      pending.set(input.name, input.prompt);
      return { status: 1, reasonCode: 'agent_prompt_stalled' };
    };
    fixture.herdr.agentRead = ({ name }) => pending.get(name) || '';
    fixture.herdr.agentSendKeys = ({ name, keys }) => {
      fixture.sentKeys.push(keys);
      writeReviewEvidence(fixture, name.endsWith('review1') ? 'review1' : 'review2');
      pending.delete(name);
      return { status: 0 };
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.sentKeys).toEqual([['enter'], ['enter']]);
    expect(fixture.waits.filter(({ name }) => name.startsWith('s42-review'))).toEqual([]);
  });

  it('SCN003 fails review before submission when both exact default refs are missing', () => {
    const fixture = makeControllerFixture({
      localDefaultRef: false,
      remoteDefaultRef: false,
    });
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(1);
    expect(fixture.starts.map(({ name }) => name)).toEqual(['s42-start', 's42-implement']);
    expect(fixture.prompts.some(({ prompt }) => (
      prompt.startsWith('# Controller-Owned Host Review') || prompt === '/review'
    ))).toBe(false);
    expect(fixture.sentKeys).toEqual([]);
  });

  it('SCN006 observes a live review worker after a non-stall prompt failure', () => {
    const fixture = makeControllerFixture();
    const agentPrompt = fixture.herdr.agentPrompt;
    let pendingStep = null;
    let observations = 0;
    fixture.herdr.agentPrompt = (input) => {
      if (
        input.name === 's42-review1'
        && input.prompt.startsWith('# Controller-Owned Host Review')
      ) {
        fixture.prompts.push(input);
        pendingStep = 'review1';
        return { status: 1, reasonCode: 'worker_failed' };
      }
      return agentPrompt(input);
    };
    fixture.herdr.observationPause = () => {
      observations += 1;
      writeReviewEvidence(fixture, pendingStep);
      pendingStep = null;
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(observations).toBe(1);
    expect(fixture.starts.map(({ name }) => name)).toContain('s42-review1');
    expect(fixture.sentKeys).toEqual([]);
  });

  it('SCN006 accepts passed evidence written during a non-stall prompt failure', () => {
    const fixture = makeControllerFixture({ reviewPromptStatus: 1 });
    const paneClose = fixture.herdr.paneClose;
    let acceptedEvidence = false;
    fixture.herdr.paneClose = (paneId) => {
      acceptedEvidence ||= fs.existsSync(
        path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.json'),
      );
      return paneClose(paneId);
    };
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(acceptedEvidence).toBe(true);
    expect(fixture.waits.filter(({ name }) => name === 's42-review1')).toEqual([]);
    expect(fixture.sentKeys).toEqual([]);
  });

  it('SCN006 fails review_failed when the worker is absent after a non-stall failure', () => {
    const fixture = makeControllerFixture({ reviewRequestFailure: true });
    fixture.herdr.listAgents = () => activeStartedAgents(fixture)
      .filter(({ name }) => !name.startsWith('s42-review'));

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'review1',
      reasonCode: 'process_lost',
    });
    expect(fixture.starts.map(({ name }) => name)).toEqual([
      's42-start', 's42-implement', 's42-review1',
    ]);
    expect(fixture.sentKeys).toEqual([]);
  });

  it('SCN006 fails process_lost when a live worker disappears during observation', () => {
    const fixture = makeControllerFixture({ reviewRequestFailure: true });
    const listAgents = fixture.herdr.listAgents;
    let workerLost = false;
    let observations = 0;
    fixture.herdr.listAgents = () => workerLost ? [] : listAgents();
    fixture.herdr.observationPause = () => {
      observations += 1;
      workerLost = true;
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'review1',
      reasonCode: 'process_lost',
    });
    expect(observations).toBe(1);
    expect(fixture.starts.filter(({ name }) => name === 's42-review1')).toHaveLength(1);
    expect(fixture.sentKeys).toEqual([]);
  });

  it('SCN007 survives the 13-second stalled result with skipped detection until evidence appears', () => {
    const fixture = makeControllerFixture();
    const agentPrompt = fixture.herdr.agentPrompt;
    let pendingStep = null;
    let observations = 0;
    fixture.herdr.agentPrompt = (input) => {
      if (!input.prompt.startsWith('# Controller-Owned Host Review')) return agentPrompt(input);
      fixture.prompts.push(input);
      pendingStep = input.name.endsWith('review1') ? 'review1' : 'review2';
      return { status: 1, reasonCode: 'agent_prompt_stalled', stderr: 'after 13 seconds' };
    };
    fixture.herdr.agentRead = () => '';
    fixture.herdr.observationPause = () => {
      observations += 1;
      writeReviewEvidence(fixture, pendingStep);
      pendingStep = null;
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(observations).toBe(2);
    expect(fixture.sentKeys).toEqual([]);
    expect(fixture.waits.filter(({ name }) => name.startsWith('s42-review'))).toEqual([]);
  });

  it('SCN008 preserves findings artifacts and validates their handoffs', () => {
    const fixture = makeControllerFixture({ reviewArtifactBody: 'P1: fix the race\n' });
    const captured = [];
    const paneClose = fixture.herdr.paneClose;
    fixture.herdr.paneClose = (paneId) => {
      for (const step of ['review1', 'review2']) {
        const handoffPath = path.join(fixture.cwd, `.omp/sdlc/handoffs/42-${step}.json`);
        if (fs.existsSync(handoffPath)) captured.push(JSON.parse(fs.readFileSync(handoffPath, 'utf8')));
      }
      return paneClose(paneId);
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fs.readFileSync(
      path.join(fixture.cwd, '.omp/sdlc/reviews/42-review1.md'),
      'utf8',
    )).toBe('P1: fix the race\n');
    expect(captured).toContainEqual(expect.objectContaining({
      step: 'review1',
      status: 'passed',
      artifacts: ['.omp/sdlc/reviews/42-review1.md'],
    }));
  });

  it('rejects a passed review handoff whose canonical artifact is empty', () => {
    const fixture = makeControllerFixture({ reviewArtifactBody: '' });
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'review1',
      reasonCode: 'invalid_handoff',
    });
    expect(fixture.closed).toContain('pane-3');
  });

  it('SCN009 fails hard when the owned review worker disappears without a handoff', () => {
    const fixture = makeControllerFixture();
    const agentPrompt = fixture.herdr.agentPrompt;
    const listAgents = fixture.herdr.listAgents;
    let reviewLost = false;
    fixture.herdr.agentPrompt = (input) => {
      if (!input.prompt.startsWith('# Controller-Owned Host Review')) return agentPrompt(input);
      fixture.prompts.push(input);
      return { status: 1, reasonCode: 'agent_prompt_stalled' };
    };
    fixture.herdr.agentRead = () => '';
    fixture.herdr.observationPause = () => {
      reviewLost = true;
    };
    fixture.herdr.listAgents = () => listAgents().filter((agent) => (
      !reviewLost || !agent.name.startsWith('s42-review')
    ));

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'review1',
      reasonCode: 'process_lost',
    });
    expect(fixture.closed).toContain('pane-3');
  });
  it.each([
    ['malformed JSON', () => '{"schemaVersion":'],
    ['missing schemaVersion', ({ schemaVersion: _schemaVersion, ...handoff }) => JSON.stringify(handoff)],
  ])('classifies a fresh %s handoff as invalid without remediation', (_label, handoffContent) => {
    const fixture = makeControllerFixture({ handoffContent });
    let observations = 0;
    fixture.herdr.observationPause = () => {
      observations += 1;
    };
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result).toEqual({
      status: 1,
      stdout: 'Stopped on #42 start. Worker pane pane-1 agent s42-start closed.\n',
      stderr: '',
    });
    expect(observations).toBe(60);
    expect(fixture.starts).toEqual([{ name: 's42-start', paneId: 'pane-1', kind: 'omp' }]);
    expect(fixture.starts.some(({ name }) => name.startsWith('r42-'))).toBe(false);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'invalid_handoff' });
    expect(persisted.remediation).toBeUndefined();
  });

  it('re-reads an incomplete fresh delivery handoff until the same worker turn validates it', () => {
    const fixture = makeControllerFixture({
      handoffContent: (handoff, { step }) => step === 'deliver'
        ? '{"schemaVersion":1'
        : JSON.stringify(handoff),
    });
    let observations = 0;
    fixture.herdr.observationPause = () => {
      const handoffPath = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-deliver.json');
      if (
        !fs.existsSync(handoffPath)
        || fs.readFileSync(handoffPath, 'utf8') !== '{"schemaVersion":1\n'
      ) return;
      observations += 1;
      fs.writeFileSync(handoffPath, `${JSON.stringify({
        schemaVersion: 1,
        issue: 42,
        step: 'deliver',
        status: 'passed',
        intervention: false,
        summary: 'Delivery corrected and validated',
        artifacts: [],
        next: null,
        reasonCode: null,
      })}\n`);
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(observations).toBe(1);
    expect(fixture.starts.filter(({ name }) => name === 's42-deliver')).toHaveLength(1);
    expect(fixture.starts.some(({ name }) => name.startsWith('r42-'))).toBe(false);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('re-reads an incomplete retained handoff without duplicating or remediating the worker', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { state: 'idle' } });
    const handoffPath = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json');
    fs.writeFileSync(handoffPath, '{"schemaVersion":1\n');
    let observations = 0;
    fixture.herdr.observationPause = () => {
      if (fs.readFileSync(handoffPath, 'utf8') !== '{"schemaVersion":1\n') return;
      observations += 1;
      fs.writeFileSync(handoffPath, `${JSON.stringify({
        schemaVersion: 1,
        issue: 42,
        step: 'start',
        status: 'passed',
        intervention: false,
        summary: 'Retained start corrected and validated',
        artifacts: [],
        next: 'implement',
        reasonCode: null,
      })}\n`);
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(observations).toBe(1);
    expect(fixture.starts.some(({ name }) => name === 's42-start')).toBe(false);
    expect(fixture.starts.some(({ name }) => name.startsWith('r42-'))).toBe(false);
    expect(fixture.closed).toContain('kept-pane');
  });

  it.each([
    ['malformed JSON', '{"schemaVersion":'],
    ['missing schemaVersion', JSON.stringify({
      issue: 42,
      step: 'start',
      status: 'passed',
      intervention: false,
      summary: 'Start repaired',
      artifacts: [],
      next: 'implement',
      reasonCode: null,
    })],
    ['wrong identity', JSON.stringify({
      schemaVersion: 1,
      issue: 43,
      step: 'start',
      status: 'passed',
      intervention: false,
      summary: 'Start repaired',
      artifacts: [],
      next: 'implement',
      reasonCode: null,
    })],
  ])('classifies a retained %s handoff as invalid without another worker', (_label, content) => {
    const fixture = makeControllerFixture();
    let observations = 0;
    fixture.herdr.observationPause = () => {
      observations += 1;
    };
    configurePassedRetainedStartWorker(fixture, { result: { state: 'idle' } });
    fs.writeFileSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'), `${content}\n`);

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(observations).toBe(1);
    expect(fixture.starts).toEqual([]);
    expect(fixture.closed).toEqual(['kept-pane']);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'invalid_handoff' });
    expect(persisted.remediation).toBeUndefined();
  });

  it.each([
    ['issue', { handoffIssue: 43 }],
    ['step', { handoffStep: 'verify' }],
  ])('keeps the worker pane when handoff %s does not match', (_field, options) => {
    const fixture = makeControllerFixture(options);
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([{ name: 's42-start', paneId: 'pane-1', kind: 'omp' }]);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(persisted.completed['42']).toEqual([]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'invalid_handoff' });
    expect(fixture.starts.some(({ name }) => name.startsWith('r42-'))).toBe(false);
    expect(persisted.remediation).toBeUndefined();
  });

  it('retries one transient agent startup failure in the same pane', () => {
    const fixture = makeControllerFixture({ agentStartStatuses: [1, 0] });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.starts.slice(0, 2)).toEqual([
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
    ]);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('invokes agentPrompt exactly once when readiness dispatch fails', () => {
    const fixture = makeControllerFixture();
    fixture.herdr.agentPrompt = (input) => {
      fixture.prompts.push(input);
      fixture.events.push(`prompt:${input.name}`);
      return { status: 1, reasonCode: 'agent_not_ready' };
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const pending = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(fixture.starts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(pending.failed).toMatchObject({
      issue: 42, step: 'start', reasonCode: 'prompt_pending', intervention: true,
    });
    const started = fixture.events.indexOf('start:s42-start');
    expect(fixture.events.slice(started, started + 3)).toEqual([
      'start:s42-start',
      'list',
      'prompt:s42-start',
    ]);
  });

  it('retains exhausted prompt readiness and recovers it once on the next invocation', () => {
    const fixture = makeControllerFixture();
    const agentPrompt = fixture.herdr.agentPrompt;
    let readinessFailures = 1;
    let deliveredCalls = 0;
    fixture.herdr.agentPrompt = (input) => {
      if (input.name === 's42-start' && readinessFailures > 0) {
        readinessFailures -= 1;
        fixture.prompts.push(input);
        fixture.events.push(`prompt:${input.name}`);
        return { status: 1, reasonCode: 'agent_not_ready' };
      }
      if (input.name === 's42-start') deliveredCalls += 1;
      return agentPrompt(input);
    };

    const first = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const pending = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(first.status).toBe(1);
    expect(fixture.closed).toEqual([]);
    expect(fixture.starts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(pending.workers['s42-start'].promptDelivery).toBe('pending');
    expect(pending.failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'prompt_pending',
      intervention: true,
    });
    expect(first.stdout).toContain('retained with prompt pending');

    const secondInvocationEvent = fixture.events.length;
    const second = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const recoveryEvents = fixture.events.slice(secondInvocationEvent);

    expect(second.status).toBe(0);
    expect(deliveredCalls).toBe(1);
    expect(fixture.starts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(2);
    expect(recoveryEvents.slice(0, 2)).toEqual(['list', 'prompt:s42-start']);
    expect(recoveryEvents.indexOf('get')).toBeGreaterThan(1);
  });

  it('does not retry a generated prompt when a thrown stall follows proven delivery', () => {
    const fixture = makeControllerFixture();
    const agentPrompt = fixture.herdr.agentPrompt;
    let stalledAfterDelivery = false;
    fixture.herdr.agentPrompt = (input) => {
      const prompted = agentPrompt(input);
      if (input.name === 's42-start' && !stalledAfterDelivery) {
        stalledAfterDelivery = true;
        throw {
          error: {
            code: 'agent_prompt_stalled',
            message: 'agent prompt produced no observed state change',
          },
          id: 'cli:agent:prompt',
        };
      }
      return prompted;
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.events).not.toContain('prompt-retry-pause');
  });

  it('retains a thrown stalled prompt when delivery cannot be proven', () => {
    const fixture = makeControllerFixture();
    fixture.herdr.agentPrompt = (input) => {
      fixture.prompts.push(input);
      fixture.events.push(`prompt:${input.name}`);
      throw {
        error: {
          code: 'agent_prompt_stalled',
          message: 'agent prompt produced no observed state change',
        },
        id: 'cli:agent:prompt',
      };
    };
    fixture.herdr.agentRead = () => 'No generated prompt is visible';

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(fixture.closed).toEqual([]);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(persisted.workers['s42-start'].promptDelivery).toBe('pending');
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'prompt_pending',
      intervention: true,
    });
  });

  it.each([
    ['failed listing', { status: 1, stderr: 'temporary Herdr failure' }],
    ['unparseable listing', { status: 0, stdout: 'not-json' }],
  ])('retains an unproven worker when presence has a %s', (_name, listing) => {
    const fixture = makeControllerFixture();
    fixture.herdr.listAgents = () => listing;

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(fixture.starts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(0);
    expect(fixture.closed).toEqual([]);
    expect(persisted.workers['s42-start'].promptDelivery).toBe('pending');
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'prompt_pending',
      intervention: true,
    });
  });

  it('restarts a worker that vanished before dispatch and prompts only the replacement', () => {
    const fixture = makeControllerFixture();
    fixture.herdr.listAgents = () => fixture.starts.length > 1
      ? activeStartedAgents(fixture)
      : [];

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.starts.slice(0, 2)).toEqual([
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
    ]);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    const secondStart = fixture.events.lastIndexOf('start:s42-start');
    const firstPrompt = fixture.events.indexOf('prompt:s42-start');
    expect(secondStart).toBeGreaterThan(fixture.events.indexOf('start:s42-start'));
    expect(firstPrompt).toBeGreaterThan(secondStart);
  });

  it('restarts once when a successful prompt is followed by an absent worker', () => {
    const fixture = makeControllerFixture();
    const agentPrompt = fixture.herdr.agentPrompt;
    let firstPrompt = true;
    fixture.herdr.agentPrompt = (input) => {
      if (input.name === 's42-start' && firstPrompt) {
        firstPrompt = false;
        fixture.prompts.push(input);
        fixture.events.push(`prompt:${input.name}`);
        return { status: 0 };
      }
      return agentPrompt(input);
    };
    fixture.herdr.listAgents = () => (
      !firstPrompt && fixture.starts.length === 1
        ? []
        : activeStartedAgents(fixture)
    );

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.starts.slice(0, 2)).toEqual([
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
    ]);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(2);
    expect(fixture.events.slice(0, 4)).toEqual([
      'start:s42-start',
      'prompt:s42-start',
      'start:s42-start',
      'prompt:s42-start',
    ]);
  });

  it.each([
    ['', ['pane-1']],
    ['--retain-worker ', []],
  ])('uses post-delivery missing-handoff policy for %sdefault close policy', (flag, closed) => {
    const fixture = makeControllerFixture({ writeHandoffs: false, agentState: 'idle' });

    const result = runExecute({
      args: `${flag}#42`,
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.closed).toEqual(closed);
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'missing_handoff',
    });
  });

  it('fails with process_lost when a restarted worker is still absent before dispatch', () => {
    const fixture = makeControllerFixture({ writeHandoffs: false });
    fixture.herdr.listAgents = () => [];

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
    ]);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(0);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(persisted.failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'process_lost',
    });
  });

  it('fails closed after two agent startup failures', () => {
    const fixture = makeControllerFixture({ agentStartStatuses: [1, 1] });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
    ]);
    expect(fixture.closed).toEqual([]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'agent_start_failed' });
  });

  it('closes a new worker pane when prompt provenance cannot be written', () => {
    const fixture = makeControllerFixture();
    const provenancePath = path.join(fixture.cwd, '.omp/sdlc/prompt-provenance');
    fs.mkdirSync(path.dirname(provenancePath), { recursive: true });
    fs.writeFileSync(provenancePath, 'not a directory');

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([]);
    expect(fixture.prompts).toEqual([]);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'provenance_write_failed' });
  });

  it('stops without completing the step when a new worker pane cannot close', () => {
    const fixture = makeControllerFixture({ paneCloseStatus: 1 });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([{ name: 's42-start', paneId: 'pane-1', kind: 'omp' }]);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(persisted.completed['42']).toEqual([]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'pane_close_failed' });
  });

  it('does not start a second worker when an issue worker is live', () => {
    const fixture = makeControllerFixture();
    fixture.herdr.listAgents = () => [{ name: 's42-verify', pane_id: 'kept-pane', state: 'working' }];
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    expect(result.status).toBe(1);
    expect(fixture.starts).toHaveLength(0);
    expect(fixture.closed).toEqual([]);
    expect(persisted.failed.reasonCode).toBe('retained_worker_mismatch');
    expect(result.stdout).toContain(
      'Stopped on #42 start. Worker pane kept-pane agent s42-verify left open.',
    );
  });

  it.each([
    ['missing ownership', (runState) => { runState.workers = {}; }],
    ['wrong pane', (runState) => { runState.workers['s42-start'].paneId = 'other-pane'; }],
    ['wrong project', (runState) => { runState.workers['s42-start'].projectRoot = '/other'; }],
    ['wrong run', (runState) => { runState.workers['s42-start'].runId = 'other-run'; }],
    ['wrong issue', (runState) => { runState.workers['s42-start'].issue = 99; }],
    ['wrong step', (runState) => { runState.workers['s42-start'].step = 'verify'; }],
    ['wrong branch', (runState) => { runState.workers['s42-start'].branch = 'other-branch'; }],
    ['wrong head', (runState) => { runState.workers['s42-start'].head = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; }],
  ])('rejects a retained worker with %s and leaves its pane open', (_label, mutate) => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { state: 'idle' } });
    const runPath = path.join(fixture.cwd, '.omp/sdlc/run.json');
    const runState = JSON.parse(fs.readFileSync(runPath, 'utf8'));
    mutate(runState);
    fs.writeFileSync(runPath, `${JSON.stringify(runState, null, 2)}\n`);

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(fs.readFileSync(runPath, 'utf8'));

    expect(result.status).toBe(1);
    expect(persisted.failed.reasonCode).toBe('retained_worker_mismatch');
    expect(fixture.closed).not.toContain('kept-pane');
    expect(fixture.starts).toEqual([]);
  });
  it('waits for a matching retained working worker and continues the queue', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { state: 'working' } });
    fs.rmSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));
    const agentWait = fixture.herdr.agentWait;
    let state = 'working';
    fixture.herdr.agentGet = () => ({ result: { state } });
    fixture.herdr.agentWait = (input) => {
      const result = agentWait(input);
      if (!input.until) state = 'idle';
      return result;
    };
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    expect(fixture.waits).toContainEqual({ name: 's42-start' });
    expect(fixture.waits.find((wait) => wait.name === 's42-start' && !wait.until)).not.toHaveProperty('timeout');
    expect(fixture.starts.map(({ name }) => name)).not.toContain('s42-start');
    expect(fixture.starts[0].name).toBe('s42-implement');
  });
  it('waits once for a retained idle implement handoff before continuing', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'implement',
      completed: { 42: ['start'] },
      failed: { issue: 42, step: 'implement', reasonCode: 'missing_handoff' },
      startedAt: '2026-08-24T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [{
      name: 's42-implement',
      pane_id: 'kept-implement-pane',
      state: 'idle',
    }, ...activeStartedAgents(fixture)];
    const readAgent = fixture.herdr.agentRead;
    fixture.herdr.agentRead = (input) => input.name === 's42-implement'
      ? workerPrompt({ step: 'implement', issue: 42 })
      : readAgent(input);
    fixture.herdr.agentGet = () => ({ result: { state: 'idle' } });
    const agentWait = fixture.herdr.agentWait;
    let paneWasOpenDuringWait = false;
    fixture.herdr.agentWait = (input) => {
      if (input.name === 's42-implement') paneWasOpenDuringWait = fixture.closed.length === 0;
      return agentWait(input);
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(paneWasOpenDuringWait).toBe(true);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
    expect(fixture.starts.map(({ name }) => name)).not.toContain('s42-implement');
    expect(fixture.starts.map(({ name }) => name)).toContain('s42-review1');
    expect(fixture.closed[0]).toBe('kept-implement-pane');
    expect(fixture.waits).toContainEqual({ name: 's42-implement', until: 'working' });
    expect(fixture.waits.find((wait) => wait.name === 's42-implement' && wait.until === 'working'))
      .not.toHaveProperty('timeout');
    expect(fixture.prompts.filter(({ name }) => name === 's42-implement')).toEqual([]);
  });

  it('fails closed when a retained idle implement worker does not resume', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'implement',
      completed: { 42: ['start'] },
      failed: { issue: 42, step: 'implement', reasonCode: 'missing_handoff' },
      startedAt: '2026-08-24T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [{
      name: 's42-implement',
      pane_id: 'kept-implement-pane',
      state: 'idle',
    }];
    fixture.herdr.agentGet = () => ({ result: { state: 'idle' } });
    fixture.herdr.agentRead = () => workerPrompt({ step: 'implement', issue: 42 });
    fixture.herdr.agentWait = (input) => {
      fixture.waits.push(input);
      return { status: input.until ? 1 : 0 };
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(persisted.failed).toEqual({ issue: 42, step: 'implement', reasonCode: 'worker_failed' });
    expect(fixture.starts).toEqual([]);
    expect(fixture.closed).toEqual(['kept-implement-pane']);
  });
  it('observes a retained review worker after a non-stall prompt failure', () => {
    const fixture = makeControllerFixture({ localDefaultRef: false });
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'review1',
      completed: { 42: ['start', 'implement'] },
      failed: { issue: 42, step: 'review1', reasonCode: 'review_failed' },
      startedAt: '2026-08-25T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [{
      name: 's42-review1',
      pane_id: 'kept-review-pane',
      state: 'idle',
    }, ...activeStartedAgents(fixture)];
    fixture.herdr.agentGet = () => ({ result: { state: 'idle' } });
    const agentPrompt = fixture.herdr.agentPrompt;
    let observations = 0;
    fixture.herdr.agentPrompt = (input) => {
      if (
        input.name === 's42-review1'
        && input.prompt.startsWith('# Controller-Owned Host Review')
      ) {
        fixture.prompts.push(input);
        return { status: 1, reasonCode: 'worker_failed' };
      }
      return agentPrompt(input);
    };
    fixture.herdr.observationPause = () => {
      observations += 1;
      writeReviewEvidence(fixture, 'review1');
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(observations).toBe(1);
    expect(fixture.prompts.some(({ name, prompt }) => (
      name === 's42-review1'
      && prompt.includes('exact base `origin/main`')
    ))).toBe(true);
    expect(fixture.waits.filter(({ name }) => name === 's42-review1')).toEqual([]);
    expect(fixture.starts.map(({ name }) => name)).not.toContain('s42-review1');
    expect(fixture.closed[0]).toBe('kept-review-pane');
    expect(fixture.sentKeys).toEqual([]);
  });

  it('accepts a retained review handoff without consulting a working state', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'review1',
      completed: { 42: ['start', 'implement'] },
      failed: { issue: 42, step: 'review1', reasonCode: 'worker_failed' },
      startedAt: '2026-08-25T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [{
      name: 's42-review1',
      pane_id: 'kept-review-pane',
      state: 'working',
    }, ...activeStartedAgents(fixture)];
    fixture.herdr.agentGet = (name) => ({
      result: { state: name === 's42-review1' ? 'working' : 'done' },
    });

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.waits.filter(({ name }) => name === 's42-review1')).toEqual([]);
    expect(fixture.starts.map(({ name }) => name)).not.toContain('s42-review1');
    expect(fixture.closed[0]).toBe('kept-review-pane');
  });


  it('fails closed when a matching retained blocked worker does not settle', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { state: 'blocked' } });
    fixture.herdr.agentGet = () => ({ result: { state: 'blocked' } });
    fixture.herdr.agentWait = (input) => {
      fixture.waits.push(input);
      return { status: input.until ? 0 : 1 };
    };
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    expect(result.status).toBe(1);
    expect(persisted.failed.reasonCode).toBe('worker_failed');
    expect(fixture.waits).toEqual([
      { name: 's42-start', until: 'working' },
      { name: 's42-start' },
    ]);
    expect(fixture.starts).toEqual([]);
    expect(fixture.closed).toEqual(['kept-pane']);
  });
  it('fails closed without waiting when a matching retained worker has no pane id', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { state: 'idle' } });
    fixture.herdr.listAgents = () => [{ name: 's42-start', state: 'idle' }];
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    expect(result.status).toBe(1);
    expect(persisted.failed.reasonCode).toBe('retained_worker_mismatch');
    expect(fixture.waits).toEqual([]);
    expect(fixture.starts).toEqual([]);
  });

  it.each([
    ['snake-case idle', { result: { agent: { agent_status: 'idle' } } }],
    ['camel-case done', { result: { agent: { agentStatus: 'done' } } }],
  ])('resumes a retained worker from realistic %s Herdr JSON', (_label, agentPayload) => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, agentPayload);

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('no second worker started');
    expect(fixture.starts).toEqual([
      { name: 's42-implement', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-review1', paneId: 'pane-2', kind: 'omp' },
      { name: 's42-fix1', paneId: 'pane-3', kind: 'omp' },
      { name: 's42-review2', paneId: 'pane-4', kind: 'omp' },
      { name: 's42-fix2', paneId: 'pane-5', kind: 'omp' },
      { name: 's42-verify', paneId: 'pane-6', kind: 'omp' },
      { name: 's42-deliver', paneId: 'pane-7', kind: 'omp' },
    ]);
    expect(fixture.closed).toEqual([
      'kept-pane', 'pane-1', 'pane-2', 'pane-3', 'pane-4', 'pane-5', 'pane-6', 'pane-7',
    ]);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('reports failed verification before a later run consumes its implement transition', () => {
    const fixture = makeControllerFixture({ failedStep: 'verify', failedNext: 'implement' });

    const failed = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const stopped = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(failed.status).toBe(1);
    expect(fixture.starts.map(({ name }) => name)).toEqual([
      's42-start',
      's42-implement',
      's42-review1',
      's42-fix1',
      's42-review2',
      's42-fix2',
      's42-verify',
    ]);
    expect(stopped.currentIssue).toBe(42);
    expect(stopped.currentStep).toBe('verify');
    expect(stopped.completed['42']).toEqual([
      'start', 'implement', 'review1', 'fix1', 'review2', 'fix2',
    ]);
    expect(stopped.failed).toEqual({ issue: 42, step: 'verify', reasonCode: 'implementation_failed' });

    const prompt = fixture.herdr.agentPrompt;
    fixture.herdr.agentPrompt = (input) => {
      const result = prompt(input);
      if (input.name === 's42-verify') {
        const handoffPath = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-verify.json');
        const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
        fs.writeFileSync(handoffPath, `${JSON.stringify({
          ...handoff,
          status: 'passed',
          intervention: false,
          next: 'deliver',
          reasonCode: null,
        })}\n`);
      }
      return result;
    };

    const resumed = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(resumed.status).toBe(0);
    expect(fixture.starts.slice(7).map(({ name }) => name)).toEqual([
      's42-implement',
      's42-review1',
      's42-fix1',
      's42-review2',
      's42-fix2',
      's42-verify',
      's42-deliver',
    ]);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('resumes failed verification at implement and reruns every downstream gate', () => {
    const fixture = makeControllerFixture();
    configureFailedRetainedVerifyWorker(fixture);

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.closed).toEqual([
      'kept-verify-pane', 'pane-1', 'pane-2', 'pane-3', 'pane-4', 'pane-5', 'pane-6', 'pane-7',
    ]);
    expect(fixture.starts.map(({ name }) => name)).toEqual([
      's42-implement',
      's42-review1',
      's42-fix1',
      's42-review2',
      's42-fix2',
      's42-verify',
      's42-deliver',
    ]);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it.each([
    ['unknown', 'repair'],
    ['forward', 'deliver'],
    ['missing', null],
  ])('closes retained verification for an %s remediation target', (_label, next) => {
    const fixture = makeControllerFixture();
    configureFailedRetainedVerifyWorker(fixture, { next });

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.closed).toEqual(['kept-verify-pane']);
    expect(fixture.starts).toEqual([]);
    expect(persisted.currentStep).toBe('verify');
    expect(persisted.failed).toEqual({ issue: 42, step: 'verify', reasonCode: 'verification_failed' });
  });

  it('keeps later queued issues blocked until remediated delivery completes', () => {
    const fixture = makeControllerFixture({ labelIssues: [42, 43] });
    const laterSpec = path.join(fixture.cwd, 'specs', '43-later');
    fs.mkdirSync(laterSpec, { recursive: true });
    writeApproved(laterSpec, 43);
    configureFailedRetainedVerifyWorker(fixture, { issues: [42, 43] });
    const seededRunPath = path.join(fixture.cwd, '.omp/sdlc/run.json');
    const seededRun = JSON.parse(fs.readFileSync(seededRunPath, 'utf8'));
    seededRun.delivery = {
      issue: 42,
      pullRequest: 77,
      expectedHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      status: 'complete',
      reconciliation: null,
    };
    fs.writeFileSync(seededRunPath, `${JSON.stringify(seededRun, null, 2)}\n`);

    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    const names = fixture.starts.map(({ name }) => name);

    expect(result.status).toBe(1);
    expect(names).toEqual([
      's42-implement',
      's42-review1',
      's42-fix1',
      's42-review2',
      's42-fix2',
      's42-verify',
      's42-deliver',
      's43-start',
      's43-implement',
    ]);
    expect(persisted.completed['42']).toEqual([
      'start', 'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify', 'deliver',
    ]);
    expect(persisted.currentIssue).toBe(43);
    expect(persisted.completed['43']).toEqual(['start', 'implement']);
    expect(persisted.delivery).toBeNull();
  });
  it('restores a later issue branch after finalizing an earlier delivered issue', () => {
    const fixture = makeControllerFixture({ labelIssues: [42, 43] });
    const laterSpec = path.join(fixture.cwd, 'specs', '43-later');
    fs.mkdirSync(laterSpec, { recursive: true });
    writeApproved(laterSpec, 43);
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42, 43],
      currentIssue: 43,
      currentStep: 'review1',
      completed: {
        42: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify', 'deliver'],
        43: ['start', 'implement'],
      },
      failed: null,
      startedAt: '2026-08-24T00:00:00.000Z',
    });
    const baseRun = fixture.run;
    let currentBranch = '42-ship-it';
    const events = [];
    const reviewPromptBranches = [];
    const agentStart = fixture.herdr.agentStart;
    fixture.herdr.agentStart = (input) => {
      events.push(`start:${input.name}:${currentBranch}`);
      return agentStart(input);
    };
    const agentPrompt = fixture.herdr.agentPrompt;
    fixture.herdr.agentPrompt = (input) => {
      if (input.prompt === '/review') reviewPromptBranches.push(currentBranch);
      return agentPrompt(input);
    };
    fixture.run = (command, args) => {
      if (command === 'git' && args[0] === 'branch' && args[1] === '--show-current') {
        fixture.calls.push([command, ...args]);
        return { status: 0, stdout: `${currentBranch}\n`, stderr: '' };
      }
      if (command === 'git' && args[0] === 'checkout') {
        fixture.calls.push([command, ...args]);
        currentBranch = args[1];
        events.push(`checkout:${args[1]}`);
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.includes('title')) {
        fixture.calls.push([command, ...args]);
        return {
          status: 0,
          stdout: JSON.stringify({ title: Number(args[2]) === 43 ? 'Later' : 'Ship It' }),
          stderr: '',
        };
      }
      if (command === 'git' && args[0] === 'branch' && args[1] === '-a') {
        fixture.calls.push([command, ...args]);
        return { status: 0, stdout: '43-later\nmain\norigin/43-later\norigin/main\n', stderr: '' };
      }
      return baseRun(command, args);
    };

    runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    const checkoutMain = events.indexOf('checkout:main');
    const checkoutLater = events.indexOf('checkout:43-later');
    const reviewStart = events.indexOf('start:s43-review1:43-later');
    expect(checkoutMain).toBeGreaterThanOrEqual(0);
    expect(checkoutLater).toBeGreaterThan(checkoutMain);
    expect(reviewStart).toBeGreaterThan(checkoutLater);
    expect(reviewPromptBranches).not.toContain('main');
  });
  it('restores a later issue branch before matching its live retained worker', () => {
    const fixture = makeControllerFixture({ branch: 'main', labelIssues: [42, 43] });
    const laterSpec = path.join(fixture.cwd, 'specs', '43-later');
    fs.mkdirSync(laterSpec, { recursive: true });
    writeApproved(laterSpec, 43);
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42, 43],
      currentIssue: 43,
      currentStep: 'review1',
      completed: {
        42: VALID_STEPS,
        43: ['start', 'implement'],
      },
      failed: null,
      workers: {
        's43-review1': {
          name: 's43-review1',
          paneId: 'kept-review-pane',
          projectRoot: fs.realpathSync(fixture.cwd),
          runId: 'test-run-id',
          issue: 43,
          step: 'review1',
          branch: '43-later',
          head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      startedAt: '2026-08-24T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [{
      name: 's43-review1',
      pane_id: 'kept-review-pane',
      state: 'working',
    }, ...activeStartedAgents(fixture)];
    const baseRun = fixture.run;
    let currentBranch = 'main';
    const events = [];
    const paneClose = fixture.herdr.paneClose;
    fixture.herdr.paneClose = (paneId) => {
      if (paneId === 'kept-review-pane') events.push(`retained:${paneId}:${currentBranch}`);
      return paneClose(paneId);
    };
    fixture.herdr.agentGet = (name) => ({
      result: { state: name === 's43-review1' ? 'working' : 'done' },
    });
    fixture.run = (command, args) => {
      if (command === 'git' && args[0] === 'branch' && args[1] === '--show-current') {
        fixture.calls.push([command, ...args]);
        events.push(`branch:${currentBranch}`);
        return { status: 0, stdout: `${currentBranch}\n`, stderr: '' };
      }
      if (command === 'git' && args[0] === 'checkout') {
        fixture.calls.push([command, ...args]);
        currentBranch = args[1];
        events.push(`checkout:${args[1]}`);
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.includes('title')) {
        fixture.calls.push([command, ...args]);
        return {
          status: 0,
          stdout: JSON.stringify({ title: Number(args[2]) === 43 ? 'Later' : 'Ship It' }),
          stderr: '',
        };
      }
      return baseRun(command, args);
    };

    const result = runExecute({
      args: '',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('retained_worker_mismatch');
    const checkout = events.indexOf('checkout:43-later');
    const retained = events.indexOf('retained:kept-review-pane:43-later');
    expect(checkout).toBeGreaterThanOrEqual(0);
    expect(retained).toBeGreaterThan(checkout);
    expect(fixture.starts.map(({ name }) => name)).not.toContain('s43-review1');
    expect(fixture.closed).toContain('kept-review-pane');
  });

  it('keeps a live retained worker open when issue branch restoration fails', () => {
    const fixture = makeControllerFixture({ branch: 'main' });
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'review1',
      completed: { 42: ['start', 'implement'] },
      failed: null,
      workers: {
        's42-review1': {
          name: 's42-review1',
          paneId: 'kept-review-pane',
          projectRoot: fs.realpathSync(fixture.cwd),
          runId: 'test-run-id',
          issue: 42,
          step: 'review1',
          branch: '42-ship-it',
          head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      startedAt: '2026-08-24T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [{
      name: 's42-review1',
      pane_id: 'kept-review-pane',
      state: 'working',
    }];
    const baseRun = fixture.run;
    fixture.run = (command, args) => {
      if (command === 'git' && args[0] === 'checkout') {
        fixture.calls.push([command, ...args]);
        return { status: 1, stdout: '', stderr: 'checkout failed' };
      }
      return baseRun(command, args);
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(persisted.failed.reasonCode).toBe('branch_checkout_failed');
    expect(fixture.closed).not.toContain('kept-review-pane');
    expect(fixture.starts).toEqual([]);
  });


  it('consumes a passed retained deliver handoff after the delivered branch was deleted', () => {
    const fixture = makeControllerFixture({ branch: 'main' });
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'deliver',
      completed: { 42: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify'] },
      failed: { issue: 42, step: 'deliver', reasonCode: 'branch_checkout_failed' },
      startedAt: '2026-08-24T00:00:00.000Z',
    });
    const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(path.join(handoffDir, '42-deliver.json'), `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      step: 'deliver',
      status: 'passed',
      intervention: false,
      summary: 'PR merged and issue closed',
      artifacts: ['https://github.test/pull/77'],
      next: null,
      reasonCode: null,
    })}\n`);

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
    expect(fixture.calls).toContainEqual([
      'git', 'fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main',
    ]);
    expect(fixture.calls).toContainEqual(['git', 'merge', '--ff-only', 'origin/main']);
    expect(fixture.calls).not.toContainEqual(['git', 'checkout', '42-ship-it']);
  });

  it('retries terminal delivery proof while GitHub state converges', () => {
    const fixture = makeControllerFixture({ branch: 'main' });
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'deliver',
      completed: { 42: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify'] },
      failed: null,
      startedAt: '2026-08-24T00:00:00.000Z',
      delivery: {
        issue: 42,
        pullRequest: 77,
        expectedHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'complete',
        reconciliation: null,
      },
    });
    const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(path.join(handoffDir, '42-deliver.json'), `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      step: 'deliver',
      status: 'passed',
      intervention: false,
      summary: 'PR merged and issue closed',
      artifacts: ['https://github.test/pull/77'],
      next: null,
      reasonCode: null,
    })}\n`);
    const baseRun = fixture.run;
    let issueStateReads = 0;
    fixture.run = (command, args) => {
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.includes('state')) {
        issueStateReads += 1;
        if (issueStateReads <= 5) {
          fixture.calls.push([command, ...args]);
          return { status: 0, stdout: JSON.stringify({ state: 'OPEN' }), stderr: '' };
        }
      }
      return baseRun(command, args);
    };
    const waits = [];

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
      waitForDeliveryRetry: () => waits.push('wait'),
    });

    expect(result.status).toBe(0);
    expect(fixture.calls).toContainEqual([
      'gh', 'pr', 'view', '77', '--json', 'state,headRefName',
    ]);
    expect(issueStateReads).toBe(6);
    expect(waits).toEqual(['wait', 'wait', 'wait', 'wait', 'wait']);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('keeps branch restoration fail-closed when delivery is incomplete', () => {
    const fixture = makeControllerFixture({ branch: 'main' });
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'deliver',
      completed: { 42: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify'] },
      failed: null,
      startedAt: '2026-08-24T00:00:00.000Z',
    });

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(persisted.completed['42']).not.toContain('deliver');
    expect(persisted.failed.reasonCode).toBe('branch_checkout_failed');
    expect(fixture.calls).toContainEqual(['git', 'checkout', '42-ship-it']);
    expect(fixture.starts).toEqual([]);
  });

  it('does not prompt review when issue branch checkout is ineffective', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'review1',
      completed: { 42: ['start', 'implement'] },
      failed: null,
      startedAt: '2026-08-24T00:00:00.000Z',
    });
    const baseRun = fixture.run;
    fixture.run = (command, args) => {
      if (command === 'git' && args[0] === 'branch' && args[1] === '--show-current') {
        fixture.calls.push([command, ...args]);
        return { status: 0, stdout: 'main\n', stderr: '' };
      }
      if (command === 'git' && args[0] === 'checkout') {
        fixture.calls.push([command, ...args]);
        return { status: 0, stdout: '', stderr: '' };
      }
      return baseRun(command, args);
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(persisted.failed.reasonCode).toBe('branch_checkout_failed');
    expect(fixture.prompts.some(({ prompt }) => prompt === '/review')).toBe(false);
    expect(fixture.starts).toEqual([]);
  });

  it('closes an active failed verification worker', () => {
    const fixture = makeControllerFixture();
    configureFailedRetainedVerifyWorker(fixture, { state: 'working' });
    const runState = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    runState.failed = null;
    const expectedRevision = runState.revision;
    runState.revision += 1;
    writeRun(runState, fixture.cwd, expectedRevision);
    let state = 'working';
    fixture.herdr.agentGet = () => ({ result: { state } });
    fixture.herdr.agentWait = (input) => {
      fixture.waits.push(input);
      if (input.name === 's42-verify' && !input.until) {
        state = 'idle';
        return { status: 0 };
      }
      return { status: 1 };
    };
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('no second worker started');
    expect(result.stdout).toContain(
      'Stopped on #42 verify. Worker pane kept-verify-pane agent s42-verify closed.',
    );
    expect(persisted.failed.reasonCode).toBe('verification_failed');
    expect(fixture.waits).toContainEqual({ name: 's42-verify' });
    expect(fixture.closed).toEqual(['kept-verify-pane']);
    expect(fixture.starts).toEqual([]);
  });

  it('keeps remediation state when the retained pane cannot close', () => {
    const fixture = makeControllerFixture();
    configureFailedRetainedVerifyWorker(fixture, { paneCloseStatus: 1 });

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([]);
    expect(persisted.currentStep).toBe('verify');
    expect(persisted.completed['42']).toEqual([
      'start', 'implement', 'review1', 'fix1', 'review2', 'fix2',
    ]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'verify', reasonCode: 'pane_close_failed' });
  });

  it('does not start the next worker after a retained handoff when the label was removed', () => {
    const fixture = makeControllerFixture({ labelIssues: [] });
    configurePassedRetainedStartWorker(fixture, { result: { agent: { agent_status: 'idle' } } });

    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result).toEqual({ status: 2, stdout: '#42 has no spec-created label\n', stderr: '' });
    expect(fixture.closed).toEqual(['kept-pane']);
    expect(fixture.starts).toEqual([]);
    expect(persisted.completed['42']).toEqual(['start']);
    expect(persisted.currentStep).toBe('implement');
  });

  it.each([
    ['accepts an ancestor', true],
    ['rejects a divergent head', false],
  ])('%s for a retained completed implementation', (_label, isAncestor) => {
    const fixture = makeControllerFixture({ labelIssues: [] });
    const recordedHead = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const currentHead = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    seedRun(fixture.cwd, {
      issues: [42],
      currentIssue: 42,
      currentStep: 'implement',
      completed: { 42: ['start'] },
      failed: {
        issue: 42,
        step: 'implement',
        reasonCode: 'prompt_pending',
        intervention: true,
      },
      workers: {
        's42-implement': {
          name: 's42-implement',
          paneId: 'kept-implement-pane',
          projectRoot: fs.realpathSync(fixture.cwd),
          runId: 'test-run-id',
          issue: 42,
          step: 'implement',
          branch: '42-ship-it',
          head: recordedHead,
          promptDelivery: 'pending',
        },
      },
    });
    const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(
      path.join(handoffDir, '42-implement.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        issue: 42,
        step: 'implement',
        status: 'passed',
        intervention: false,
        summary: 'Implementation committed at the advanced head',
        artifacts: ['scripts/sdlc-execute.mjs'],
        next: 'review1',
        reasonCode: null,
      })}\n`,
    );
    fixture.herdr.listAgents = () => [{
      name: 's42-implement',
      pane_id: 'kept-implement-pane',
      state: 'idle',
    }];
    fixture.herdr.agentGet = () => ({ result: { state: 'idle' } });
    const ancestryChecks = [];
    const run = (command, args, options) => {
      if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { status: 0, stdout: `${currentHead}\n`, stderr: '' };
      }
      if (command === 'git' && args[0] === 'merge-base') {
        ancestryChecks.push(args);
        return { status: isAncestor ? 0 : 1, stdout: '', stderr: '' };
      }
      return fixture.run(command, args, options);
    };

    const result = runExecute({
      args: '',
      cwd: fixture.cwd,
      env,
      run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(ancestryChecks).toContainEqual([
      'merge-base', '--is-ancestor', recordedHead, currentHead,
    ]);
    expect(fixture.prompts.filter(({ name }) => name === 's42-implement')).toEqual([]);
    expect(fixture.starts).toEqual([]);
    if (isAncestor) {
      expect(result).toEqual({
        status: 2,
        stdout: '#42 has no spec-created label\n',
        stderr: '',
      });
      expect(fixture.closed).toEqual(['kept-implement-pane']);
      expect(persisted.completed['42']).toEqual(['start', 'implement']);
      expect(persisted.currentStep).toBe('review1');
      expect(persisted.failed).toBeNull();
    } else {
      expect(result.status).toBe(1);
      expect(fixture.closed).toEqual([]);
      expect(persisted.completed['42']).toEqual(['start']);
      expect(persisted.failed.reasonCode).toBe('retained_worker_mismatch');
      expect(persisted.workers['s42-implement'].promptDelivery).toBe('pending');
    }
  });

  it('consumes a passed handoff when its pending-prompt worker is absent', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      issues: [42],
      currentIssue: 42,
      currentStep: 'start',
      completed: { 42: [] },
      failed: {
        issue: 42,
        step: 'start',
        reasonCode: 'prompt_pending',
        intervention: true,
      },
      workers: {
        's42-start': {
          name: 's42-start',
          paneId: 'missing-start-pane',
          projectRoot: fs.realpathSync(fixture.cwd),
          runId: 'test-run-id',
          issue: 42,
          step: 'start',
          branch: '42-ship-it',
          head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          promptDelivery: 'pending',
        },
      },
    });
    const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(
      path.join(handoffDir, '42-start.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        issue: 42,
        step: 'start',
        status: 'passed',
        intervention: false,
        summary: 'Issue branch already started',
        artifacts: [],
        next: 'implement',
        reasonCode: null,
      })}\n`,
    );

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.prompts.some(({ name }) => name === 's42-start')).toBe(false);
    expect(fixture.starts.some(({ name }) => name === 's42-start')).toBe(false);
  });

  it('submits a pasted prompt retained from an earlier run', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { agent: { agent_status: 'idle' } } });
    fs.rmSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));
    const readAgent = fixture.herdr.agentRead;
    fixture.herdr.agentRead = (input) => input.name === 's42-start'
      ? workerPrompt({ step: 'start', issue: 42 })
      : readAgent(input);

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.sentKeys[0]).toEqual(['enter']);
    expect(fixture.starts.map(({ name }) => name)).not.toContain('s42-start');
    expect(fixture.closed).toContain('kept-pane');
  });

  it('closes a retained worker when prompt provenance cannot be written', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { agent: { agent_status: 'idle' } } });
    fs.rmSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));
    const provenancePath = path.join(fixture.cwd, '.omp/sdlc/prompt-provenance');
    fs.writeFileSync(provenancePath, 'not a directory');

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([]);
    expect(fixture.closed).toEqual(['kept-pane']);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'provenance_write_failed' });
  });

  it('closes a retained pane when recovered prompt settlement fails', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { agent: { agent_status: 'idle' } } });
    fs.rmSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));
    const readAgent = fixture.herdr.agentRead;
    fixture.herdr.agentRead = (input) => input.name === 's42-start'
      ? workerPrompt({ step: 'start', issue: 42 })
      : readAgent(input);
    const waitAgent = fixture.herdr.agentWait;
    fixture.herdr.agentWait = (input) => {
      const result = waitAgent(input);
      return input.until ? result : { status: 1 };
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.closed).toEqual(['kept-pane']);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'worker_failed' });
  });

  it('does not generate another prompt for a retained worker with legacy unknown delivery', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(
      fixture,
      { result: { agent: { agent_status: 'idle' } } },
    );
    fs.rmSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));
    fixture.herdr.agentRead = () => 'Unrelated settled worker output';

    runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(0);
  });

  it('migrates unversioned delivered workers back through activation without reprompting', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(
      fixture,
      { result: { agent: { agent_status: 'idle' } } },
    );
    fs.rmSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));
    const checkpoint = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );
    const expectedRevision = checkpoint.revision;
    checkpoint.revision += 1;
    checkpoint.workers['s42-start'].promptDelivery = 'delivered';
    writeRun(checkpoint, fixture.cwd, expectedRevision);
    fixture.herdr.agentRead = () => 'Unrelated settled worker output';

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const migrated = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(0);
    expect(fixture.closed).toEqual([]);
    expect(migrated.workers['s42-start']).toMatchObject({
      promptDelivery: 'activating',
      promptDeliveryVersion: 2,
    });
    expect(migrated.failed).toMatchObject({
      issue: 42,
      step: 'start',
      reasonCode: 'prompt_pending',
      intervention: true,
    });
  });
  it('does not wait on a settled retained worker without prompt-race evidence', () => {

    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { agent: { agent_status: 'idle' } } });
    fs.rmSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));
    fixture.herdr.agentRead = () => 'You are the reviewer for unrelated work';
    fixture.herdr.agentWait = () => {
      throw new Error('must not wait for future work from a settled retained worker');
    };
    let observations = 0;
    fixture.herdr.observationPause = () => {
      observations += 1;
      fixture.herdr.agentGet = () => ({ status: 1 });
    };

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'),
    );

    expect(result.status).toBe(1);
    expect(observations).toBe(1);
    expect(fixture.sentKeys).toEqual([]);
    expect(fixture.closed).toEqual(['kept-pane']);
    expect(fixture.waits).toEqual([]);
    expect(persisted.failed.reasonCode).toBe('process_lost');
  });


  it('stops on an unapproved spec with the write-spec instruction', () => {
    const fixture = makeControllerFixture();
    fs.writeFileSync(path.join(fixture.cwd, 'specs/42-ship-it/design.md'), '**Issue**: #42\n**Status**: Draft\n');
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 0, stdout: 'Run /sdlc-write-spec #42\n', stderr: '' });
    expect(fixture.starts).toHaveLength(0);
  });
});
