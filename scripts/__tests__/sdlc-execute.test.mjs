import { afterEach, describe, expect, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  runBoundedReview,
  resolveReviewArtifacts,
  invalidateDeliveryGates,
} from '../sdlc-execute.mjs';
import {
  acquireControllerLease,
  releaseControllerLease,
} from '../sdlc-controller-lease.mjs';
import { startIssue } from '../start-issue.mjs';
import { consumeSafeRecovery, resolveRecoveryOwner } from '../sdlc-safe-recoveries.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sdlc-execute.mjs');
const ISOLATION_MODULE = pathToFileURL(fs.realpathSync(
  path.join(REPOSITORY_ROOT, 'src/sdlc-review-isolation.mjs'),
)).href;

function appendReviewReceipts(environment, rows = [], start = {}, includeStart = true) {
  const bytes = fs.readFileSync(environment.NMG_SDLC_REVIEW_ASSIGNMENT);
  const assignment = JSON.parse(bytes);
  const identity = {
    invocationId: assignment.invocationId,
    assignmentDigest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
  for (const row of [
    ...(includeStart ? [{ event: 'session_start', activeTools: ['read'], isolationModule: ISOLATION_MODULE, ...start }] : []),
    ...rows,
  ]) {
    fs.appendFileSync(environment.NMG_SDLC_REVIEW_RECEIPT, `${JSON.stringify({ ...identity, ...row })}\n`);
  }
  return assignment;
}


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
    branch: fields.branch ?? `${fields.issue ?? currentIssue}-ship-it`,
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
        branch: fields.workerBranch ?? `${currentIssue}-ship-it`,
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
      intervention: false,
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
  it('removes completed runtime while preserving original review handoff bytes', () => {
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
    const reviewBytes = new Map();
    for (const step of VALID_STEPS) {
      fs.writeFileSync(path.join(handoffDir, `42-${step}.json`), '{}\n');
      if (step === 'review1' || step === 'review2') {
        const bytes = Buffer.from(`{"step":"${step}","summary":"original review evidence"}\r\n`);
        fs.writeFileSync(path.join(handoffDir, `42-${step}.json`), bytes);
        reviewBytes.set(step, bytes);
      }
      fs.writeFileSync(path.join(provenanceDir, `worker-${step}.json`), '{}\n');
    }
    fs.writeFileSync(path.join(handoffDir, 'unrelated.json'), '{}\n');
    fs.writeFileSync(path.join(provenanceDir, 'sdlc-execute.json'), '{}\n');
    fs.writeFileSync(`${runPath}.tmp`, 'temporary\n');

    cleanupCompletedRun({ ...stored, currentIssue: null }, root);

    expect(fs.existsSync(runPath)).toBe(false);
    expect(fs.existsSync(`${runPath}.tmp`)).toBe(false);
    for (const step of VALID_STEPS) {
      const handoffPath = path.join(handoffDir, `42-${step}.json`);
      if (reviewBytes.has(step)) expect(fs.readFileSync(handoffPath)).toEqual(reviewBytes.get(step));
      else expect(fs.existsSync(handoffPath)).toBe(false);
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
    reviewArtifactBody = 'No findings.\n',
    reviewPromptStatus = 0,
    reviewReceipt = (environment) => appendReviewReceipts(environment),
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
    const paneEnvironments = new Map();
    const reviewEnvironments = new Map();

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
      if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
        return { status: 0, stdout: `${branch}\n`, stderr: '' };
      }
      if (command === 'git' && args[0] === 'merge-base') {
        if (args[1] === '--is-ancestor') return { status: 1, stdout: '', stderr: '' };
        return { status: 0, stdout: `${'b'.repeat(40)}\n`, stderr: '' };
      }
      if (command === 'git' && args[0] === 'show') {
        const file = args[1].slice(args[1].indexOf(':') + 1);
        return {
          status: 0,
          stdout: file.startsWith('specs/')
            ? fs.readFileSync(path.join(cwd, file))
            : Buffer.from('export const changed = true;\n'),
          stderr: '',
        };
      }
      if (command === 'git' && args[0] === 'diff') {
        return {
          status: 0,
          stdout: args.includes('--name-only')
            ? 'src/change.mjs\0'
            : 'diff --git a/src/change.mjs b/src/change.mjs\n+export const changed = true;\n',
          stderr: '',
        };
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
        if (input.environment?.NMG_SDLC_REVIEW_SLICE === '1') roots.push(input.cwd);
        else expect(input.direction).toBe(paneWidth >= 40 ? 'right' : 'down');
        splits.push(input);
        paneSequence += 1;
        paneEnvironments.set(`pane-${paneSequence}`, input.environment);
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
        const environment = paneEnvironments.get(input.paneId);
        if (environment?.NMG_SDLC_REVIEW_SLICE === '1') reviewEnvironments.set(input.name, environment);
        return { status: pendingAgentStartStatuses.shift() ?? 0 };
      },
      agentPrompt: ({ name, prompt }) => {
        activePrompt = prompt;
        prompts.push({ name, prompt });
        events.push(`prompt:${name}`);
        const environment = reviewEnvironments.get(name);
        if (environment) {
          reviewReceipt(environment);
          appendReviewReceipts(environment, [{
            event: 'review_result', stopReason: 'stop',
            text: `NMG_REVIEW_RESULT_BEGIN\n${reviewArtifactBody.trim()}\nNMG_REVIEW_RESULT_END\n`,
          }], {}, false);
          return { status: reviewPromptStatus };
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
            artifacts: failed && !intervention ? [`artifacts/${step}.txt`] : [],
            next: failed ? failedNext : step === 'deliver' ? null : 'next',
            reasonCode: intervention ? 'implementation_failed' : failed ? `${step}_failed` : null,
          };
          const content = handoffContent
            ? handoffContent(handoff, { isRem, step })
            : JSON.stringify(handoff);
          fs.writeFileSync(path.join(handoffDir, `${workerIssue}-${step}.json`), `${content}\n`);
        }
        return { status: promptStatus };
      },
      agentRead: ({ name }) => reviewEnvironments.has(name)
        ? { status: 0, stdout: `NMG_REVIEW_RESULT_BEGIN\n${reviewArtifactBody.trim()}\nNMG_REVIEW_RESULT_END\n` }
        : activePrompt,
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
        if (reviewEnvironments.has(input.name)) return { status: 0 };
        if (!input.until && writeHandoffs) {
          const name = input.name;
          const step = name.slice(name.lastIndexOf('-') + 1);
          const workerIssue = Number(/^.[^0-9]*([1-9]\d*)-/.exec(name)?.[1] || 42);
          const handoffDir = path.join(cwd, '.omp/sdlc/handoffs');
          fs.mkdirSync(handoffDir, { recursive: true });
          fs.writeFileSync(path.join(handoffDir, `${workerIssue}-${step}.json`), `${JSON.stringify({
            schemaVersion: 1,
            issue: workerIssue,
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
      agentGet: (name) => {
        events.push('get');
        const environment = reviewEnvironments.get(name);
        if (environment) {
          const { step } = JSON.parse(fs.readFileSync(environment.NMG_SDLC_REVIEW_ASSIGNMENT, 'utf8'));
          return { result: { state: step === failedStep ? 'error' : 'done' } };
        }
        return agentLost ? { status: 1 } : ({ result: { state: agentState } });
      },
      listAgents: () => {
        events.push('list');
        return starts
          .filter((started) => !closed.includes(started.paneId))
          .map((started) => ({ name: started.name, pane_id: started.paneId, state: agentState }));
      },
      listPanes: () => herdr.listAgents().map(({ pane_id }) => ({ pane_id })),
      notificationShow: (notice) => notifications.push(notice),
    };
    return {
      cwd, calls, starts, splits, closed, events, notifications, sentKeys, waits, prompts, run, herdr,
      reviewEnvironments,
    };
  }

  function makeBoundedReviewFixture({
    receipt = ({ environment }) => appendReviewReceipts(environment),
    response = () => ({ status: 0, stdout: 'NMG_REVIEW_RESULT_BEGIN\nNo findings.\nNMG_REVIEW_RESULT_END\n' }),
    onLaunch = () => {},
  } = {}) {
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-bounded-review-test-')));
    roots.push(cwd);
    git(cwd, ['init', '-b', 'main']);
    const specDir = path.join(cwd, 'specs/42-review');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 42);
    fs.writeFileSync(path.join(cwd, '.gitignore'), '.omp/\n');
    const changedPaths = [
      'cli/a.mjs', 'cli/b.mjs', 'lib/a.mjs', 'lib/b.mjs',
      'specs/42-review/feature.gherkin', 'specs/42-review/tasks.md',
    ];
    for (const file of changedPaths.filter((file) => !file.startsWith('specs/'))) {
      fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      fs.writeFileSync(path.join(cwd, file), 'base\n');
    }
    git(cwd, ['add', '.']);
    git(cwd, ['commit', '-m', 'chore: review fixture base']);
    const baseSha = git(cwd, ['rev-parse', 'HEAD']).trim();
    git(cwd, ['switch', '-c', '42-review']);
    for (const file of changedPaths) fs.appendFileSync(path.join(cwd, file), `changed ${file}\n`);
    git(cwd, ['add', '.']);
    git(cwd, ['commit', '-m', 'feat: review fixture change']);
    const headSha = git(cwd, ['rev-parse', 'HEAD']).trim();
    const runState = seedRun(cwd, {
      branch: '42-review', head: headSha, currentStep: 'review1',
      completed: { 42: ['start', 'implement'] }, workers: {},
      recoveries: [{ runId: 'historical-owner', issue: 7, step: 'verify', disposition: 'stopped' }],
      remediation: { issue: 42, step: 'deliver', completedAttempts: 2, status: 'stopped' },
    });
    const panes = new Map();
    const workers = new Map();
    const launches = [];
    const closed = [];
    const herdr = {
      paneSplit: (input) => {
        const assignmentBytes = fs.readFileSync(input.environment.NMG_SDLC_REVIEW_ASSIGNMENT);
        const assignment = JSON.parse(assignmentBytes);
        const launch = {
          ...input, assignment, assignmentBytes,
          attempt: input.environment.NMG_SDLC_REVIEW_RECEIPT.includes('.attempt-2.') ? 2 : 1,
        };
        roots.push(input.cwd);
        launches.push(launch);
        const pane_id = `bounded-pane-${launches.length}`;
        panes.set(pane_id, launch);
        onLaunch(launch, { cwd, runState });
        return { status: 0, pane_id };
      },
      agentStart: ({ name, paneId }) => {
        workers.set(name, panes.get(paneId));
        return { status: 0 };
      },
      agentPrompt: ({ name }) => {
        receipt(workers.get(name));
        const result = response(workers.get(name));
        if (result?.status === 0 && typeof result.stdout === 'string') {
          appendReviewReceipts(workers.get(name).environment, [{
            event: 'review_result', stopReason: 'stop', text: result.stdout,
          }], {}, false);
        }
        return { status: 0 };
      },
      agentWait: () => ({ status: 0 }),
      agentGet: () => ({ status: 0, agent_status: 'done' }),
      agentRead: () => { throw new Error('terminal text is not host review output'); },
      paneClose: (paneId) => { closed.push(paneId); return { status: 0 }; },
    };
    return {
      cwd, runState, herdr, launches, closed, changedPaths, baseSha, headSha,
      invoke: (step = 'review1') => runBoundedReview({ cwd, issue: 42, step, baseRef: 'main', runState, herdr }),
    };
  }

  function reviewEvidenceBytes(cwd, step = 'review1') {
    const index = JSON.parse(fs.readFileSync(path.join(cwd, `.omp/sdlc/reviews/42-${step}.slices.json`), 'utf8'));
    const paths = [
      `.omp/sdlc/reviews/42-${step}.md`,
      `.omp/sdlc/handoffs/42-${step}.json`,
      `.omp/sdlc/reviews/42-${step}.slices.json`,
      ...index.slices.flatMap((_, index) => [
        `.omp/sdlc/reviews/42-${step}-reviewer-${index + 1}.assignment.json`,
        `.omp/sdlc/reviews/42-${step}-reviewer-${index + 1}.access.jsonl`,
      ]),
    ];
    return new Map(paths.map((file) => [file, fs.readFileSync(path.join(cwd, file))]));
  }

  it('SCN002 SCN011 partitions changed paths into disjoint snapshots and reuses only receipt-proven review', () => {
    const fixture = makeBoundedReviewFixture();
    const checkoutPath = path.join(fixture.cwd, 'cli/a.mjs');
    fs.appendFileSync(checkoutPath, 'uncommitted bytes must not enter the snapshot\n');
    const checkoutBytes = fs.readFileSync(checkoutPath);
    expect(fixture.invoke().status).toBe(0);
    expect(fixture.launches).toHaveLength(3);
    const assigned = fixture.launches.flatMap(({ assignment }) => assignment.allowedPaths);
    expect(assigned.sort()).toEqual(fixture.changedPaths);
    expect(new Set(assigned).size).toBe(fixture.changedPaths.length);
    for (const { cwd, assignment, environment } of fixture.launches) {
      expect(assignment.allowedPaths).toHaveLength(2);
      expect(assignment).toMatchObject({
        issue: 42, step: 'review1', runId: fixture.runState.runId,
        headSha: fixture.headSha, baseSha: fixture.baseSha,
      });
      expect(path.relative(fixture.cwd, cwd).split(path.sep)).toContain('..');
      expect(environment.NMG_SDLC_REVIEW_SLICE).toBe('1');
      expect(path.isAbsolute(environment.NMG_SDLC_REVIEW_ASSIGNMENT)).toBe(true);
      expect(path.isAbsolute(environment.NMG_SDLC_REVIEW_RECEIPT)).toBe(true);
      for (const file of fixture.changedPaths) {
        const snapshotPath = path.join(cwd, file);
        if (assignment.allowedPaths.includes(file)) {
          expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(git(fixture.cwd, ['show', `${fixture.headSha}:${file}`]));
        } else expect(fs.existsSync(snapshotPath)).toBe(false);
      }
    }
    const bytes = reviewEvidenceBytes(fixture.cwd);
    expect(fixture.invoke().status).toBe(0);
    expect(fixture.launches).toHaveLength(3);
    expect(reviewEvidenceBytes(fixture.cwd)).toEqual(bytes);
    expect(fs.readFileSync(checkoutPath)).toEqual(checkoutBytes);
  });

  it('SCN002 SCN008 replaces the whole step once and preserves every original evidence byte', () => {
    let originals;
    let consumedBeforeReplacement;
    const fixture = makeBoundedReviewFixture({
      receipt: ({ environment, assignment, attempt }) => appendReviewReceipts(environment,
        attempt === 1 && assignment.sliceId === 'reviewer-2'
          ? [{ event: 'tool_call', toolName: 'bash', decision: 'allow' }] : []),
      onLaunch: ({ attempt }, { cwd }) => {
        if (attempt !== 2 || originals) return;
        originals = reviewEvidenceBytes(cwd);
        consumedBeforeReplacement = JSON.parse(fs.readFileSync(path.join(cwd, '.omp/sdlc/safe-recoveries.json')));
      },
    });
    const counters = structuredClone({
      recoveries: fixture.runState.recoveries, remediation: fixture.runState.remediation,
    });
    const result = fixture.invoke();
    expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(result.handoffPath).toBe('.omp/sdlc/handoffs/42-review1.attempt-2.json');
    expect(fixture.launches.map(({ attempt }) => attempt)).toEqual([1, 1, 1, 2, 2, 2]);
    for (let slice = 0; slice < 3; slice += 1) {
      expect(fixture.launches[slice + 3].assignmentBytes).toEqual(fixture.launches[slice].assignmentBytes);
    }
    expect(reviewEvidenceBytes(fixture.cwd)).toEqual(originals);
    expect(JSON.parse(originals.get('.omp/sdlc/handoffs/42-review1.json'))).toMatchObject({ status: 'failed' });
    expect(consumedBeforeReplacement.records).toEqual([expect.objectContaining({
      class: 'invalid_review_slice', runId: fixture.runState.runId, issue: 42, step: 'review1', disposition: 'consumed',
    })]);
    expect({
      recoveries: fixture.runState.recoveries, remediation: fixture.runState.remediation,
    }).toEqual(counters);
    expect(fixture.invoke().handoff.status).toBe('passed');
    expect(fixture.launches).toHaveLength(6);
    expect(reviewEvidenceBytes(fixture.cwd)).toEqual(originals);
  });

  it('SCN002 SCN008 stops second contamination without any third launch or budget refill', () => {
    const fixture = makeBoundedReviewFixture({
      receipt: ({ environment, assignment }) => appendReviewReceipts(environment,
        assignment.sliceId === 'reviewer-1'
          ? [{ event: 'tool_call', toolName: 'read', path: path.join(REPOSITORY_ROOT, 'package.json'), decision: 'allow' }]
          : []),
    });
    const counters = structuredClone({ recoveries: fixture.runState.recoveries, remediation: fixture.runState.remediation });
    expect(() => fixture.invoke()).toThrow('invalid_review_slice');
    expect(fixture.launches.map(({ attempt }) => attempt)).toEqual([1, 1, 1, 2, 2, 2]);
    const original = reviewEvidenceBytes(fixture.cwd);
    const safePath = path.join(fixture.cwd, '.omp/sdlc/safe-recoveries.json');
    const safe = fs.readFileSync(safePath);
    expect(JSON.parse(safe).records).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.attempt-2.json'))).status).toBe('failed');
    expect(() => fixture.invoke()).toThrow('review_scope_unproven');
    expect(fixture.launches).toHaveLength(6);
    expect(fs.readFileSync(safePath)).toEqual(safe);
    expect(reviewEvidenceBytes(fixture.cwd)).toEqual(original);
    expect({ recoveries: fixture.runState.recoveries, remediation: fixture.runState.remediation }).toEqual(counters);
  });

  it('SCN009 SCN011 rejects cwd and model scope claims without host receipts', () => {
    const fixture = makeBoundedReviewFixture({
      receipt: () => {},
      response: () => ({ status: 0, stdout: 'I only read assigned files.\nNMG_REVIEW_RESULT_BEGIN\nNo findings.\nNMG_REVIEW_RESULT_END\n' }),
    });
    expect(() => fixture.invoke()).toThrow('review_scope_unproven');
    expect(fixture.launches).toHaveLength(3);
    const safe = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/safe-recoveries.json')));
    expect(safe.records).toEqual([]);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.json'))).toBe(false);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/reviews/42-review1.invalidation.json'))).toBe(false);
  });

  it.each([
    ['foreign source module', { isolationModule: 'file:///foreign/src/sdlc-review-isolation.mjs' }],
    ['wrong invocation', { invocationId: 'another-invocation' }],
    ['wrong assignment digest', { assignmentDigest: `sha256:${'0'.repeat(64)}` }],
    ['unrestricted active tools', { activeTools: ['read', 'bash'] }],
  ])('SCN011 rejects %s receipts without granting a replacement', (_label, start) => {
    const fixture = makeBoundedReviewFixture({
      receipt: ({ environment }) => appendReviewReceipts(environment, [], start),
    });
    expect(() => fixture.invoke()).toThrow('review_scope_unproven');
    expect(fixture.launches).toHaveLength(3);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/safe-recoveries.json'))).records).toEqual([]);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.json'))).toBe(false);
  });

  it('SCN002 stops an unproven replacement as invalid_review_slice without generic remediation', () => {
    const fixture = makeControllerFixture({
      reviewReceipt: (environment) => {
        if (!environment.NMG_SDLC_REVIEW_RECEIPT.includes('.attempt-2.')) {
          appendReviewReceipts(environment, [{ event: 'tool_call', toolName: 'bash', decision: 'allow' }]);
        }
      },
    });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const checkpoint = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json')));
    expect(result.status).toBe(1);
    expect(checkpoint.failed).toMatchObject({ step: 'review1', reasonCode: 'invalid_review_slice' });
    expect(fixture.starts.map(({ name }) => name)).toEqual([
      's42-start', 's42-implement', 's42-review1-reviewer-1', 's42-review1-reviewer-1.attempt-2',
    ]);
    expect(checkpoint.remediation?.completedAttempts ?? 0).toBe(0);
    expect(checkpoint.recoveries ?? []).toEqual([]);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.json'))).status).toBe('failed');
  });

  it('SCN011 accepts blocked disallowed calls without treating findings prose as contamination', () => {
    const fixture = makeBoundedReviewFixture({
      receipt: ({ environment, assignment }) => appendReviewReceipts(environment, [
        { event: 'tool_call', toolName: 'bash', decision: 'block' },
        { event: 'tool_call', toolName: 'read', path: assignment.allowedPaths[0], decision: 'allow' },
      ]),
      response: () => ({ status: 0, stdout: 'NMG_REVIEW_RESULT_BEGIN\nP1: caller in unassigned/consumer.mjs needs correction.\nNMG_REVIEW_RESULT_END\n' }),
    });
    expect(fixture.invoke().handoff.status).toBe('passed');
    expect(fixture.launches).toHaveLength(3);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/safe-recoveries.json'))).records).toEqual([]);
  });

  it.each([
    ['missing response', { status: 1 }, 'review_artifact_missing'],
    ['empty delimited result', { status: 0, stdout: 'NMG_REVIEW_RESULT_BEGIN\n \nNMG_REVIEW_RESULT_END\n' }, 'review_empty'],
  ])('SCN003 keeps %s nonpassing without fabricating an artifact', (_label, response, reason) => {
    const fixture = makeBoundedReviewFixture({ response: () => response });
    expect(() => fixture.invoke()).toThrow(reason);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/reviews/42-review1.md'))).toBe(false);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.json'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/safe-recoveries.json'))).records).toEqual([]);
  });

  it('SCN003 never promotes delimiter-looking terminal or tool output into a host review result', () => {
    const fixture = makeBoundedReviewFixture({ response: () => ({ status: 1 }) });
    fixture.herdr.agentRead = () => ({ status: 0, stdout: 'NMG_REVIEW_RESULT_BEGIN\nNo findings.\nNMG_REVIEW_RESULT_END\n' });
    expect(() => fixture.invoke()).toThrow('review_artifact_missing');
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.json'))).toBe(false);
  });

  function prepareMergeabilityRevalidation(fixture) {
    fs.appendFileSync(path.join(fixture.cwd, 'cli/a.mjs'), 'reconciled base\n');
    git(fixture.cwd, ['add', 'cli/a.mjs']);
    git(fixture.cwd, ['commit', '-m', 'fix: reconcile review fixture base']);
    const head = git(fixture.cwd, ['rev-parse', 'HEAD']).trim();
    const ownerId = resolveRecoveryOwner({
      cwd: fixture.cwd, issue: 42, step: 'deliver', controllerRunId: fixture.runState.runId,
    });
    consumeSafeRecovery({ cwd: fixture.cwd, ownerId, issue: 42, step: 'deliver', class: 'mergeability_defect' });
    Object.assign(fixture.runState, {
      currentStep: 'deliver',
      completed: { 42: VALID_STEPS.slice(0, -1), 7: ['start', 'implement'] },
      delivery: { issue: 42, expectedHead: head, mergeabilityReverificationRequired: true },
    });
    const revision = fixture.runState.revision;
    fixture.runState.revision += 1;
    writeRun(fixture.runState, fixture.cwd, revision);
    return head;
  }

  it('SCN005 SCN008 SCN010 invalidates all gates and selects new immutable head evidence without refilling budgets', () => {
    const fixture = makeBoundedReviewFixture();
    expect(fixture.invoke().status).toBe(0);
    expect(fixture.invoke('review2').status).toBe(0);
    const originals = new Map([...reviewEvidenceBytes(fixture.cwd), ...reviewEvidenceBytes(fixture.cwd, 'review2')]);
    const head = prepareMergeabilityRevalidation(fixture);
    const before = structuredClone({ recoveries: fixture.runState.recoveries, remediation: fixture.runState.remediation });
    const safePath = path.join(fixture.cwd, '.omp/sdlc/safe-recoveries.json');
    const safeBytes = fs.readFileSync(safePath);
    expect(invalidateDeliveryGates({ cwd: fixture.cwd, issue: 42, runState: fixture.runState })).toBe('review1');
    expect(fixture.runState.completed).toEqual({ 42: ['start', 'implement'], 7: ['start', 'implement'] });
    expect(fixture.runState.delivery.mergeabilityReverificationRequired).toBe(false);
    expect({ recoveries: fixture.runState.recoveries, remediation: fixture.runState.remediation }).toEqual(before);
    expect(fs.readFileSync(safePath)).toEqual(safeBytes);
    for (const step of ['review1', 'review2']) {
      expect(resolveReviewArtifacts({ cwd: fixture.cwd, issue: 42, step })).toMatchObject({
        generation: `.head-${head}`, attemptSuffix: '',
        artifactPath: `.omp/sdlc/reviews/42-${step}.head-${head}.md`,
        handoffPath: `.omp/sdlc/handoffs/42-${step}.head-${head}.json`,
        indexPath: `.omp/sdlc/reviews/42-${step}.head-${head}.slices.json`,
      });
      expect(fixture.invoke(step)).toMatchObject({
        status: 0,
        handoff: { status: 'passed', artifacts: [`.omp/sdlc/reviews/42-${step}.head-${head}.md`] },
      });
    }
    expect(fixture.launches.slice(6).map(({ assignment }) => assignment.headSha)).toEqual(Array(6).fill(head));
    expect(new Map([...reviewEvidenceBytes(fixture.cwd), ...reviewEvidenceBytes(fixture.cwd, 'review2')])).toEqual(originals);
    expect(fs.readFileSync(safePath)).toEqual(safeBytes);
    const history = path.join(fixture.cwd, `.omp/sdlc/reviews/42-revalidation-${head}`);
    expect(fs.readFileSync(path.join(history, '42-review1.json'))).toEqual(originals.get('.omp/sdlc/handoffs/42-review1.json'));
    expect(fs.readFileSync(path.join(history, '42-review2.md'))).toEqual(originals.get('.omp/sdlc/reviews/42-review2.md'));
  });

  it('SCN008 retains the consumed whole-step replacement allowance after head-bound revalidation', () => {
    const fixture = makeBoundedReviewFixture({
      receipt: ({ environment, assignment, attempt }) => appendReviewReceipts(environment,
        attempt === 1 && assignment.sliceId === 'reviewer-1'
          ? [{ event: 'tool_call', toolName: 'bash', decision: 'allow' }] : []),
    });
    expect(fixture.invoke().status).toBe(0);
    const original = reviewEvidenceBytes(fixture.cwd);
    const head = prepareMergeabilityRevalidation(fixture);
    const safePath = path.join(fixture.cwd, '.omp/sdlc/safe-recoveries.json');
    const safeBytes = fs.readFileSync(safePath);
    invalidateDeliveryGates({ cwd: fixture.cwd, issue: 42, runState: fixture.runState });
    expect(() => fixture.invoke()).toThrow('invalid_review_slice');
    expect(fixture.launches).toHaveLength(9);
    expect(fixture.launches.slice(6).map(({ attempt }) => attempt)).toEqual([1, 1, 1]);
    expect(fs.existsSync(path.join(fixture.cwd, `.omp/sdlc/reviews/42-review1.head-${head}.attempt-2.md`))).toBe(false);
    expect(fs.readFileSync(safePath)).toEqual(safeBytes);
    expect(reviewEvidenceBytes(fixture.cwd)).toEqual(original);
    expect(fixture.runState.remediation.completedAttempts).toBe(2);
    expect(fixture.runState.recoveries).toHaveLength(1);
  });

  it('SCN005 SCN010 routes mergeability control handoffs through every gate before generic delivery remediation', () => {
    let reconciled = false;
    let head = 'a'.repeat(40);
    let checkpointBeforeRevalidation;
    let counters;
    let deliveryCalls = 0;
    const fixture = makeControllerFixture({
      handoffContent: (handoff, { step }) => {
        if (step !== 'deliver') return JSON.stringify(handoff);
        deliveryCalls += 1;
        if (reconciled) return JSON.stringify(handoff);
        reconciled = true;
        head = 'c'.repeat(40);
        const checkpoint = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json')));
        const ownerId = resolveRecoveryOwner({
          cwd: fixture.cwd, issue: 42, step: 'deliver', controllerRunId: checkpoint.runId, run: fixture.run,
        });
        consumeSafeRecovery({ cwd: fixture.cwd, ownerId, issue: 42, step: 'deliver', class: 'mergeability_defect' });
        checkpoint.delivery = { issue: 42, expectedHead: head, mergeabilityReverificationRequired: true };
        checkpoint.remediation = { issue: 42, step: 'deliver', status: 'active', completedAttempts: 2 };
        checkpoint.recoveries = [{ runId: 'historical-owner', issue: 7, step: 'verify', disposition: 'stopped' }];
        counters = structuredClone({ remediation: checkpoint.remediation, recoveries: checkpoint.recoveries });
        const revision = checkpoint.revision;
        checkpoint.revision += 1;
        writeRun(checkpoint, fixture.cwd, revision);
        return JSON.stringify({
          ...handoff, status: 'failed', intervention: false, next: null,
          reasonCode: 'mergeability_reverification_required',
        });
      },
    });
    const run = fixture.run;
    fixture.run = (command, args) => {
      if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { status: 0, stdout: `${head}\n`, stderr: '' };
      }
      if (command === 'git' && args[0] === 'merge-base' && args[1] === '--is-ancestor'
        && args[2] === 'a'.repeat(40) && args[3] === 'c'.repeat(40) && reconciled) {
        return { status: 0, stdout: '', stderr: '' };
      }
      return run(command, args);
    };
    const prompt = fixture.herdr.agentPrompt;
    fixture.herdr.agentPrompt = (input) => {
      if (reconciled && !checkpointBeforeRevalidation && fixture.reviewEnvironments.has(input.name)) {
        checkpointBeforeRevalidation = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json')));
      }
      return prompt(input);
    };
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toMatchObject({ status: 0 });
    expect(deliveryCalls).toBe(2);
    expect(fixture.starts.slice(8).map(({ name }) => name)).toEqual([
      's42-review1-reviewer-1', 's42-fix1', 's42-review2-reviewer-1', 's42-fix2', 's42-verify', 's42-deliver',
    ]);
    expect(checkpointBeforeRevalidation.completed['42']).toEqual(['start', 'implement']);
    expect(checkpointBeforeRevalidation.delivery.mergeabilityReverificationRequired).toBe(false);
    expect({
      remediation: checkpointBeforeRevalidation.remediation, recoveries: checkpointBeforeRevalidation.recoveries,
    }).toEqual(counters);
    expect(fixture.starts.some(({ name }) => name.startsWith('r42-'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/safe-recoveries.json'))).records).toEqual([
      expect.objectContaining({ class: 'mergeability_defect', issue: 42, step: 'deliver', disposition: 'consumed' }),
    ]);
  });

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
      fs.writeFileSync(path.join(handoffDir, `42-${step}.json`), `${JSON.stringify({
        schemaVersion: 1,
        issue: 42,
        step,
        status: 'passed',
        intervention: false,
        summary: `${step} completed after delayed activation`,
        artifacts: [],
        next: step === 'deliver' ? null : 'next',
        reasonCode: null,
      })}\n`);
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
    intervention = true,
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
      intervention,
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
      workers: {},
      completed: { 42: [] },
      failed: null,
      startedAt: '2026-08-23T00:00:00.000Z',
    });

    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result).toMatchObject({ status: 0 });
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
          const handoffPath = path.join(handoffDir, `6-${step}.json`);
          if (step === 'review1' || step === 'review2') expect(fs.readFileSync(handoffPath, 'utf8')).toBe('{}\n');
          else expect(fs.existsSync(handoffPath)).toBe(false);
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
      { name: 's42-review1-reviewer-1', paneId: 'pane-3', kind: 'omp' },
      { name: 's42-fix1', paneId: 'pane-4', kind: 'omp' },
      { name: 's42-review2-reviewer-1', paneId: 'pane-5', kind: 'omp' },
      { name: 's42-fix2', paneId: 'pane-6', kind: 'omp' },
      { name: 's42-verify', paneId: 'pane-7', kind: 'omp' },
      { name: 's42-deliver', paneId: 'pane-8', kind: 'omp' },
    ]);
    expect(fixture.closed).toEqual([
      'pane-1', 'pane-2', 'pane-3', 'pane-4', 'pane-5', 'pane-6', 'pane-7', 'pane-8',
    ]);
    expect([...fixture.reviewEnvironments.keys()]).toEqual([
      's42-review1-reviewer-1', 's42-review2-reviewer-1',
    ]);
    expect(fixture.prompts.some(({ prompt }) => prompt === '/review')).toBe(false);
    expect(fixture.sentKeys).toEqual([]);
    const generatedPromptNames = fixture.prompts
      .filter(({ name }) => !fixture.reviewEnvironments.has(name))
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
    expect(fixture.splits.filter((split) => split.environment?.NMG_SDLC_SMOKE_ISSUES)).toHaveLength(1);
  });

  it('passes smoke ownership only to verification and delivery panes', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env: { ...env, NMG_SDLC_SMOKE_OWNED: '1', UNRELATED_SECRET: 'do-not-copy' },
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.splits[VALID_STEPS.indexOf('verify')]).toEqual({
      direction: 'right',
      cwd: fixture.cwd,
      environment: { NMG_SDLC_SMOKE_OWNED: '1' },
    });
    expect(fixture.splits[VALID_STEPS.indexOf('deliver')]).toEqual({
      direction: 'right',
      cwd: fixture.cwd,
      environment: { NMG_SDLC_SMOKE_OWNED: '1' },
    });
    expect(fixture.splits.filter((split) => split.environment?.NMG_SDLC_SMOKE_OWNED)).toHaveLength(2);
  });

  it('omits smoke values when the smoke queue and ownership are missing', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result).toMatchObject({ status: 0 });
    for (const { environment = {} } of fixture.splits) {
      expect(environment).not.toHaveProperty('NMG_SDLC_SMOKE_ISSUES');
      expect(environment).not.toHaveProperty('NMG_SDLC_SMOKE_OWNED');
    }
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
    expect(fixture.splits.filter((split) => split.environment?.NMG_SDLC_SMOKE_ISSUES)).toHaveLength(1);
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

  it('reverifies repeated implement repairs under the original identity before review', () => {
    const fixture = makeControllerFixture({
      remediableFailedStep: 'implement',
      remFailures: 1,
      failedNext: null,
      handoffContent: (handoff) => JSON.stringify({
        ...handoff,
        reasonCode: handoff.status === 'failed' ? 'implementation_failed' : null,
      }),
    });
    const promptAgent = fixture.herdr.agentPrompt;
    const observed = [];
    fixture.herdr.agentPrompt = (input) => {
      if (input.name === 's42-review1-reviewer-1') {
        observed.push(JSON.parse(fs.readFileSync(
          path.join(fixture.cwd, '.omp/sdlc/handoffs/42-implement.json'), 'utf8',
        )));
      }
      return promptAgent(input);
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.starts.slice(0, 5).map(({ name }) => name)).toEqual([
      's42-start', 's42-implement', 'r42-implement', 'r42-implement', 's42-review1-reviewer-1',
    ]);
    expect(observed).toEqual([expect.objectContaining({
      step: 'implement', status: 'passed', intervention: false,
    })]);
    expect(fixture.events).toContain('close:pane-3');
    expect(fixture.events).toContain('close:pane-4');
    expect(fixture.events.indexOf('close:pane-3')).toBeLessThan(
      fixture.events.lastIndexOf('start:r42-implement'),
    );
    expect(fixture.events.indexOf('close:pane-4')).toBeLessThan(
      fixture.events.indexOf('start:s42-review1-reviewer-1'),
    );
  });

  it('never starts remediation or review for an implement authority or publication blocker', () => {
    const fixture = makeControllerFixture({ failedStep: 'implement', failedNext: null });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const checkpoint = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts.map(({ name }) => name)).toEqual(['s42-start', 's42-implement']);
    expect(checkpoint.completed[42]).toEqual(['start']);
    expect(checkpoint.failed).toEqual(expect.objectContaining({
      issue: 42, step: 'implement', reasonCode: 'implementation_failed',
    }));
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
    expect(fixture.splits.filter((split) => split.environment?.NMG_SDLC_SMOKE_ISSUES)).toEqual([
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

  it('passes the exact smoke queue to every fresh verify remediation pane', () => {
    const fixture = makeControllerFixture({ remediableFailedStep: 'verify', remFailures: 1 });
    const queue = '39,40';
    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env: { ...env, NMG_SDLC_SMOKE_ISSUES: queue },
      run: fixture.run,
      herdr: fixture.herdr,
    });
    const remStarts = fixture.starts.filter(({ name }) => name === 'r42-verify');

    expect(result.status).toBe(0);
    expect(remStarts).toEqual([
      { name: 'r42-verify', paneId: 'pane-8', kind: 'omp' },
      { name: 'r42-verify', paneId: 'pane-9', kind: 'omp' },
    ]);
    expect(fixture.splits.slice(6, 9).map(({ environment }) => environment)).toEqual([
      { NMG_SDLC_SMOKE_ISSUES: queue },
      { NMG_SDLC_SMOKE_ISSUES: queue },
      { NMG_SDLC_SMOKE_ISSUES: queue },
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

  it('does not rewind a stopped blocked remediation on resume', () => {
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

    expect(result.status).toBe(1);
    expect(fixture.starts.map(({ name }) => name)).toEqual([
    ]);
    expect(fixture.starts.some(({ name }) => name === 'r42-verify')).toBe(false);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    expect(persisted.remediation).toMatchObject({ issue: 42, step: 'verify', status: 'stopped' });
    expect(persisted.failed).toMatchObject({ issue: 42, step: 'verify' });
  });
  it.each(REMEDIABLE_STEPS.filter((step) => !step.startsWith('review')))('SCN010 stops after two failed remediation completions for step %s with remediation_loop and no third worker', (step) => {
    const fixture = makeControllerFixture({ remediableFailedStep: step, remFailures: 2 });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    expect(result.status).toBe(1);
    const remWorkers = fixture.starts.filter(({ name }) => name.startsWith('r42-'));
    expect(remWorkers).toHaveLength(2);
    expect(persisted.remediation).toMatchObject({ issue: 42, step, status: 'stopped' });
    expect(String(persisted.remediation.reasonCode || persisted.failed?.reasonCode || '')).toMatch(/remediation_loop/);
    expect(persisted.completed[42] || []).not.toContain(step);
  });

  it.each(['review1', 'review2'])('SCN010 preserves an exhausted historical %s remediation on explicit reinvocation', (step) => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      branch: '42-ship-it', currentStep: step, workers: {},
      completed: { 42: VALID_STEPS.slice(0, VALID_STEPS.indexOf(step)) },
      failed: { issue: 42, step, reasonCode: 'review_failed' },
      recoveries: [],
      remediation: { issue: 42, step, status: 'stopped', reasonCode: 'remediation_loop', completedAttempts: 2 },
    });
    fs.writeFileSync(path.join(fixture.cwd, `.omp/sdlc/handoffs/42-${step}.json`), JSON.stringify({
      schemaVersion: 1, issue: 42, step, status: 'failed', intervention: false,
      summary: 'historical review failed', artifacts: [], next: null, reasonCode: 'review_failed',
    }));
    for (let invocation = 0; invocation < 2; invocation += 1) {
      expect(runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr }).status).toBe(1);
      const checkpoint = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json')));
      expect(checkpoint.remediation.completedAttempts).toBe(2);
      expect(checkpoint.failed.reasonCode).toBe('remediation_loop');
      expect(checkpoint.recoveries).toEqual([]);
      expect(fixture.starts).toEqual([]);
    }
  });
  it('does not renew review evidence from unrelated HEAD churn or an old consumed recovery', () => {
    const fixture = makeBoundedReviewFixture();
    expect(fixture.invoke().status).toBe(0);
    const original = reviewEvidenceBytes(fixture.cwd);
    fixture.runState.recoveries.push({ runId: fixture.runState.runId, issue: 42, step: 'review1', disposition: 'consumed' });
    fs.appendFileSync(path.join(fixture.cwd, 'cli/a.mjs'), 'unrelated change\n');
    git(fixture.cwd, ['add', 'cli/a.mjs']);
    git(fixture.cwd, ['commit', '-m', 'fix: unrelated head change']);
    expect(() => fixture.invoke()).toThrow('review_scope_unproven');
    expect(fixture.launches).toHaveLength(3);
    expect(reviewEvidenceBytes(fixture.cwd)).toEqual(original);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/reviews/42-review1.current.json'))).toBe(false);
  });

  it('reruns both immutable review generations after a downstream implementation repair changes HEAD', () => {
    const fixture = makeControllerFixture({ failedStep: 'verify', failedNext: 'implement' });
    expect(runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr }).status).toBe(1);
    const originals = new Map([...reviewEvidenceBytes(fixture.cwd), ...reviewEvidenceBytes(fixture.cwd, 'review2')]);
    const handoffPath = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-verify.json');
    const failed = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
    fs.writeFileSync(handoffPath, JSON.stringify({ ...failed, intervention: false }));
    let head = 'a'.repeat(40);
    const repairedHead = 'c'.repeat(40);
    const run = (command, args) => command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD'
      ? { status: 0, stdout: `${head}\n`, stderr: '' } : fixture.run(command, args);
    const prompt = fixture.herdr.agentPrompt;
    fixture.herdr.agentPrompt = (input) => {
      if (input.name === 's42-implement') head = repairedHead;
      const result = prompt(input);
      if (input.name === 's42-verify') {
        const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
        fs.writeFileSync(handoffPath, JSON.stringify({ ...handoff, status: 'passed', intervention: false, next: 'deliver', reasonCode: null }));
      }
      return result;
    };
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    for (const step of ['review1', 'review2']) {
      const current = resolveReviewArtifacts({ cwd: fixture.cwd, issue: 42, step });
      expect(current.generation).toBe(`.head-${repairedHead}`);
      const index = JSON.parse(fs.readFileSync(path.join(fixture.cwd, current.indexPath), 'utf8'));
      expect(index.headSha).toBe(repairedHead);
      expect(index.slices.every(({ assignment }) => assignment.headSha === repairedHead)).toBe(true);
      expect(JSON.parse(fs.readFileSync(path.join(fixture.cwd, current.handoffPath), 'utf8')).status).toBe('passed');
    }
    expect(new Map([...reviewEvidenceBytes(fixture.cwd), ...reviewEvidenceBytes(fixture.cwd, 'review2')])).toEqual(originals);
    expect(fixture.starts.filter(({ name }) => name === 's42-implement')).toHaveLength(2);
    expect(fixture.starts.filter(({ name }) => name === 's42-review1-reviewer-1')).toHaveLength(2);
    expect(fixture.starts.filter(({ name }) => name === 's42-review2-reviewer-1')).toHaveLength(2);
  });

  it.each(['review1', 'review2'])('bare exhausted historical %s recovery dispatches isolated review once and preserves old evidence', (step) => {
    const next = step === 'review1' ? 'fix1' : 'fix2';
    const fixture = makeControllerFixture({ blockedStep: next });
    seedRun(fixture.cwd, {
      branch: '42-ship-it', currentStep: step, workers: {},
      completed: { 42: VALID_STEPS.slice(0, VALID_STEPS.indexOf(step)) },
      failed: { issue: 42, step, reasonCode: 'review_failed' },
      recoveries: [],
      remediation: { issue: 42, step, status: 'stopped', reasonCode: 'remediation_loop', completedAttempts: 2 },
    });
    const oldPath = path.join(fixture.cwd, `.omp/sdlc/handoffs/42-${step}.json`);
    const original = JSON.stringify({
      schemaVersion: 1, issue: 42, step, status: 'failed', intervention: false,
      summary: 'historical review failed', artifacts: [], next: null, reasonCode: 'review_failed',
    });
    fs.writeFileSync(oldPath, original);
    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(1);
    const checkpoint = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    expect(checkpoint.completed['42']).toContain(step);
    expect(checkpoint.currentStep).toBe(next);
    expect(checkpoint.recoveries).toHaveLength(1);
    expect(checkpoint.recoveries[0]).toMatchObject({ issue: 42, step, disposition: 'consumed' });
    expect(fs.readFileSync(oldPath, 'utf8')).toBe(original);
    const current = resolveReviewArtifacts({ cwd: fixture.cwd, issue: 42, step });
    expect(JSON.parse(fs.readFileSync(path.join(fixture.cwd, current.handoffPath), 'utf8')).status).toBe('passed');
    expect(fixture.starts.filter(({ name }) => name === `s42-${step}-reviewer-1`)).toHaveLength(1);
    const starts = fixture.starts.length;
    expect(runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr }).status).toBe(1);
    expect(fixture.starts).toHaveLength(starts);
  });
  it('retains cleanup evidence and the lease when the second remediation pane cannot close at the exact limit', () => {
    const fixture = makeControllerFixture({ remediableFailedStep: 'implement', remFailures: 2 });
    const paneClose = fixture.herdr.paneClose;
    const failedCloses = [];
    fixture.herdr.paneClose = (paneId) => {
      const secondRem = fixture.starts.filter(({ name }) => name === 'r42-implement')[1];
      if (secondRem?.paneId === paneId) {
        failedCloses.push(paneId);
        return { status: 1 };
      }
      return paneClose(paneId);
    };
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    const remWorkers = fixture.starts.filter(({ name }) => name === 'r42-implement');

    expect(result.status).toBe(1);
    expect(remWorkers).toHaveLength(2);
    expect(failedCloses).toEqual([remWorkers[1].paneId]);
    expect(fixture.closed).toContain(remWorkers[0].paneId);
    expect(persisted.completed['42']).toEqual(['start']);
    expect(persisted.remediation).toMatchObject({
      issue: 42, step: 'implement', completedAttempts: 2,
      status: 'stopped', reasonCode: 'remediation_loop',
    });
    expect(persisted.failed).toEqual({
      issue: 42, step: 'implement', reasonCode: 'remediation_loop',
      cleanupReasonCode: 'pane_close_failed',
    });
    expect(persisted.workers['r42-implement']).toMatchObject({
      name: 'r42-implement', paneId: remWorkers[1].paneId,
    });
  });

  it('keeps the controller lease when remediation limit cleanup checkpoint persistence fails', () => {
    const fixture = makeControllerFixture({ remediableFailedStep: 'implement', remFailures: 2 });
    const paneClose = fixture.herdr.paneClose;
    let failedPane;
    fixture.herdr.paneClose = (paneId) => {
      const secondRem = fixture.starts.filter(({ name }) => name === 'r42-implement')[1];
      if (secondRem?.paneId === paneId) {
        failedPane = paneId;
        fs.writeFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json.lock'), '');
        return { status: 1 };
      }
      return paneClose(paneId);
    };
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    const remWorkers = fixture.starts.filter(({ name }) => name === 'r42-implement');

    expect(result.status).toBe(1);
    expect(remWorkers).toHaveLength(2);
    expect(failedPane).toBe(remWorkers[1].paneId);
    expect(persisted.remediation).toMatchObject({ status: 'stopped', reasonCode: 'remediation_loop' });
    expect(persisted.workers['r42-implement']).toMatchObject({
      paneId: failedPane, projectRoot: persisted.projectRoot, runId: persisted.runId,
    });
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/controller.lock'))).toBe(true);
  });

  it('unchanged reinvocation stays stopped after remediation_loop with no additional worker', () => {
    const fixture = makeControllerFixture({ remediableFailedStep: 'implement', remFailures: 2 });
    runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const firstRems = fixture.starts.filter(({ name }) => name.startsWith('r42-')).length;
    const result2 = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    expect(result2.status).toBe(1);
    expect(fixture.starts.filter(({ name }) => name.startsWith('r42-')).length).toBe(firstRems);
    expect(persisted.remediation.status).toBe('stopped');
  });

  it('passed first or second remediation advances current step and gives next stage a fresh streak', () => {
    for (const rf of [0, 1]) {
      const fixture = makeControllerFixture({ remediableFailedStep: 'implement', remFailures: rf, failedNext: null });
      const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
      expect(result.status).toBe(0);
      expect(fixture.starts.some(({ name }) => name === 's42-review1-reviewer-1')).toBe(true);
      const rems = fixture.starts.filter(({ name }) => name === 'r42-implement').length;
      expect(rems).toBe(rf + 1);
    }
  });

  it('legacy attempt 13 does not restart a remediation', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'implement',
      completed: { 42: ['start'] },
      failed: { issue: 42, step: 'implement', reasonCode: 'implement_failed' },
      remediation: {
        issue: 42,
        step: 'implement',
        attempt: 13,
        status: 'stopped',
        reasonCode: 'remediation_loop',
      },
      startedAt: '2026-08-27T00:00:00.000Z',
    });
    const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(path.join(handoffDir, '42-implement.json'), `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      step: 'implement',
      status: 'failed',
      intervention: false,
      summary: 'legacy',
      artifacts: [],
      next: 'review1',
      reasonCode: 'implement_failed',
    })}\n`);
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(1);
    expect(fixture.starts.filter(({ name }) => name.startsWith('r42-')).length).toBe(0);
  });

  it('repaired passed handoff can advance a stopped remediation state', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'verify',
      completed: { 42: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'] },
      failed: { issue: 42, step: 'verify', reasonCode: 'verify_failed' },
      remediation: { issue: 42, step: 'verify', status: 'stopped', reasonCode: 'remediation_loop' },
      startedAt: '2026-08-27T00:00:00.000Z',
    });
    const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(path.join(handoffDir, '42-verify.json'), `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      step: 'verify',
      status: 'passed',
      intervention: false,
      summary: 'repaired passed',
      artifacts: [],
      next: 'deliver',
      reasonCode: null,
    })}\n`);
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('rejects a same-project remediation without matching recorded ownership', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      currentStep: 'verify',
      completed: { 42: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'] },
      failed: { issue: 42, step: 'verify', reasonCode: 'verification_failed' },
      remediation: { issue: 42, step: 'verify', status: 'active', attempt: 1 },
      workers: {},
    });
    fixture.herdr.listAgents = () => [{
      name: 'r42-verify', pane_id: 'foreign-live-rem', cwd: fixture.cwd, state: 'working',
    }];
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(1);
    expect(fixture.closed).toEqual([]);
    expect(fixture.starts).toEqual([]);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).failed.reasonCode)
      .toBe('retained_worker_mismatch');
  });

  it('failed initial agent startup closes owned pane by default but --retain-worker keeps it', () => {
    const def = makeControllerFixture({ agentStartStatuses: [1, 1] });
    runExecute({ args: '#42', cwd: def.cwd, env, run: def.run, herdr: def.herdr });
    expect(def.closed).toEqual(['pane-1']);
    const ret = makeControllerFixture({ agentStartStatuses: [1, 1] });
    runExecute({ args: '--retain-worker #42', cwd: ret.cwd, env, run: ret.run, herdr: ret.herdr });
    expect(ret.closed).toEqual([]);
  });

  it.each([false, true])('cleans up failed remediation startup with retain-worker %s', (retain) => {
    const fixture = makeControllerFixture({
      remediableFailedStep: 'verify', agentStartStatuses: [...Array(7).fill(0), 1, 1],
    });
    const result = runExecute({
      args: `${retain ? '--retain-worker ' : ''}#42`,
      cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr,
    });
    const checkpoint = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json')));
    expect(result.status).toBe(1);
    expect(fixture.starts.filter(({ name }) => name === 'r42-verify')).toHaveLength(2);
    expect(fixture.closed.includes('pane-8')).toBe(!retain);
    expect(checkpoint.failed.reasonCode).toBe('agent_start_failed');
    expect(Boolean(checkpoint.workers['r42-verify'])).toBe(retain);
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
      workers: {
        'r42-verify': {
          ...boundRunData(fixture.cwd, { currentStep: 'verify' }).workers['s42-verify'],
          name: 'r42-verify', paneId: 'live-rem',
        },
      },
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

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env: { ...env, NMG_SDLC_SMOKE_ISSUES: '99,100' },
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.waits).toContainEqual({ name: 'r42-verify' });
    expect(fixture.starts.some(({ name }) => name === 's42-verify' || name === 'r42-verify')).toBe(false);
    expect(fixture.starts.map(({ name }) => name)).toEqual(['s42-deliver']);
    expect(fixture.splits).toEqual([{ direction: 'right', cwd: fixture.cwd }]);
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
      workers: {
        'r42-verify': {
          ...boundRunData(fixture.cwd, { currentStep: 'verify' }).workers['s42-verify'],
          name: 'r42-verify', paneId: 'live-rem',
        },
      },
    });
    fixture.herdr.listAgents = () => [
      { name: 'r42-verify', pane_id: 'live-rem', state: 'idle' },
      ...activeStartedAgents(fixture),
    ];
    fixture.herdr.agentGet = () => ({ result: { state: 'idle' } });
    const readAgent = fixture.herdr.agentRead;
    const pastedPrompt = remediationPrompt({ issue: 42, failedStep: 'verify', cwd: fixture.cwd });
    fixture.herdr.agentRead = (input) => input.name === 'r42-verify' ? pastedPrompt : readAgent(input);

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result).toMatchObject({ status: 0 });
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
    expect(persisted.workers['s42-verify']).toMatchObject({
      paneId: fixture.starts.find(({ name }) => name === 's42-verify').paneId,
      projectRoot: persisted.projectRoot, runId: persisted.runId,
    });
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/controller.lock'))).toBe(true);
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

  it('observes a working review slice without a deadline or duplicate prompt', () => {
    const fixture = makeControllerFixture();
    const get = fixture.herdr.agentGet;
    let observations = 0;
    fixture.herdr.agentGet = (name) => name === 's42-review1-reviewer-1' && observations < 65
      ? { result: { state: 'working' } }
      : get(name);
    fixture.herdr.observationPause = () => { observations += 1; };
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    expect(observations).toBe(65);
    expect(fixture.prompts.filter(({ name }) => name === 's42-review1-reviewer-1')).toHaveLength(1);
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

  it('keeps observing visible work while agent state is stale idle', () => {
    const fixture = makeControllerFixture({
      settledBeforeSubmit: true,
      agentState: 'idle',
      writeHandoffs: false,
    });
    const readAgent = fixture.herdr.agentRead;
    const sendKeys = fixture.herdr.agentSendKeys;
    let stateReads = 0;
    let observations = 0;
    fixture.herdr.agentGet = () => ({
      result: { state: stateReads++ === 0 ? 'working' : 'idle' },
    });
    fixture.herdr.agentRead = (input) => input.name === 's42-start' ? 'Working…' : readAgent(input);
    fixture.herdr.agentSendKeys = (input) => {
      if (input.name === 's42-start') throw new Error('must not resubmit an active worker prompt');
      return sendKeys(input);
    };
    fixture.herdr.observationPause = () => {
      observations += 1;
      if (observations !== 2) return;
      const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
      fs.mkdirSync(handoffDir, { recursive: true });
      fs.writeFileSync(path.join(handoffDir, '42-start.json'), `${JSON.stringify({
        schemaVersion: 1,
        issue: 42,
        step: 'start',
        status: 'failed',
        intervention: true,
        summary: 'implementation failed',
        artifacts: [],
        next: null,
        reasonCode: 'implementation_failed',
      })}\n`);
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(observations).toBe(2);
    expect(fixture.prompts.filter(({ name }) => name === 's42-start')).toHaveLength(1);
    expect(fixture.sentKeys).toEqual([]);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(persisted.failed).toMatchObject({ reasonCode: 'implementation_failed' });
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


  it('stops after failed review1 without launching later queue steps', () => {
    const fixture = makeControllerFixture({ failedStep: 'review1' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(1);
    expect(fixture.starts.map(({ name }) => name)).toEqual(['s42-start', 's42-implement', 's42-review1-reviewer-1']);
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
    expect(fixture.closed).toEqual(['pane-1']);
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
    expect(persisted.workers['s42-start']).toBeUndefined();
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/controller.lock'))).toBe(false);
  });

  it('records synchronous cancellation cleanup failure and retains the owned worker and lease', () => {
    const fixture = makeControllerFixture({ writeHandoffs: false });
    const processApi = new EventEmitter();
    const failedCloses = [];
    processApi.exit = (code) => {
      throw new Error(`signal_exit_${code}`);
    };
    fixture.herdr.paneClose = (paneId) => {
      failedCloses.push(paneId);
      throw new Error('pane close unavailable');
    };
    fixture.herdr.agentPrompt = () => {
      processApi.emit('SIGTERM');
      return { status: 1 };
    };

    const result = runExecute({
      args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr,
      installSignalHandlers: true, processApi,
    });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('signal_exit_143\n');
    expect(fixture.starts).toHaveLength(1);
    expect(failedCloses).toEqual([fixture.starts[0].paneId]);
    expect(persisted.failed).toEqual({
      issue: 42, step: 'start', reasonCode: 'controller_cancelled',
      cleanupReasonCode: 'pane_close_failed',
    });
    expect(persisted.workers['s42-start']).toMatchObject({
      name: 's42-start', paneId: fixture.starts[0].paneId,
      projectRoot: persisted.projectRoot, runId: persisted.runId,
      issue: 42, step: 'start',
    });
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/controller.lock'))).toBe(true);
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
    expect(fixture.closed).toEqual(['pane-1']);
    expect(persisted.failed).toBeNull();
    expect(persisted.workers['s42-start']).toBeDefined();
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/controller.lock'))).toBe(true);
  });


  it.each([true, false])('selects the exact default review base with local ref present %s', (localDefaultRef) => {
    const fixture = makeControllerFixture({ localDefaultRef, paneWidth: 30 });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    for (const step of ['review1', 'review2']) {
      const index = JSON.parse(fs.readFileSync(path.join(fixture.cwd, `.omp/sdlc/reviews/42-${step}.slices.json`)));
      expect(index.baseRef).toBe(localDefaultRef ? 'main' : 'origin/main');
    }
    expect(fixture.sentKeys).toEqual([]);
  });


  it('settles a review slice from receipts and results after an observer wait error', () => {
    const fixture = makeControllerFixture();
    const wait = fixture.herdr.agentWait;
    fixture.herdr.agentWait = (input) => fixture.reviewEnvironments.has(input.name)
      ? { status: 1, reasonCode: 'no_future_working_transition' }
      : wait(input);
    expect(runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr }).status).toBe(0);
    expect(fixture.closed).toContain('pane-3');
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
    expect(fixture.reviewEnvironments.size).toBe(0);
    expect(fixture.sentKeys).toEqual([]);
  });


  it('fails an unproven slice prompt dispatch without Enter or downstream workers', () => {
    const fixture = makeControllerFixture({ reviewPromptStatus: 1 });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json')));
    expect(result.status).toBe(1);
    expect(persisted.failed).toMatchObject({ step: 'review1', reasonCode: 'prompt_pending' });
    expect(fixture.starts.map(({ name }) => name)).toEqual([
      's42-start', 's42-implement', 's42-review1-reviewer-1',
    ]);
    expect(fixture.sentKeys).toEqual([]);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.json'))).toBe(false);
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

  it('SCN003 stops empty slice output before writing a review artifact or passed handoff', () => {
    const fixture = makeControllerFixture({ reviewArtifactBody: '' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json')));
    expect(result.status).toBe(1);
    expect(persisted.failed).toMatchObject({ issue: 42, step: 'review1', reasonCode: 'review_empty', intervention: true });
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/reviews/42-review1.md'))).toBe(false);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.json'))).toBe(false);
    expect(fixture.starts.some(({ name }) => name.includes('fix1'))).toBe(false);
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

    expect(result).toMatchObject({ status: 1 });
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
    expect(fixture.closed).toEqual(['pane-1']);
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
    expect(persisted.workers['s42-start']).toMatchObject({
      paneId: fixture.starts[0].paneId,
      projectRoot: persisted.projectRoot, runId: persisted.runId,
    });
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/controller.lock'))).toBe(true);
  });

  it('keeps the controller lease when ordinary failure-stop pane cleanup fails', () => {
    const fixture = makeControllerFixture({ failedStep: 'start', paneCloseStatus: 1 });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toHaveLength(1);
    expect(fixture.closed).toEqual([fixture.starts[0].paneId]);
    expect(persisted.completed['42']).toEqual([]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'pane_close_failed' });
    expect(persisted.workers['s42-start']).toMatchObject({
      name: 's42-start', paneId: fixture.starts[0].paneId,
      projectRoot: persisted.projectRoot, runId: persisted.runId,
      issue: 42, step: 'start',
    });
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/controller.lock'))).toBe(true);
  });

  it('keeps the controller lease when ordinary failure-stop checkpoint persistence fails', () => {
    const fixture = makeControllerFixture({ failedStep: 'start' });
    const paneClose = fixture.herdr.paneClose;
    fixture.herdr.paneClose = (paneId) => {
      fs.writeFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json.lock'), '');
      return paneClose(paneId);
    };
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toHaveLength(1);
    expect(fixture.closed).toEqual([fixture.starts[0].paneId]);
    expect(persisted.workers['s42-start']).toMatchObject({
      paneId: fixture.starts[0].paneId,
      projectRoot: persisted.projectRoot, runId: persisted.runId,
    });
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/controller.lock'))).toBe(true);
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
  });
  it('ignores same-issue workers owned by another project', () => {
    const fixture = makeControllerFixture();
    const listAgents = fixture.herdr.listAgents;
    fixture.herdr.listAgents = () => [{
      name: 's42-implement',
      pane_id: 'foreign-pane',
      cwd: '/another/project',
      state: 'working',
    }, ...listAgents()];

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(0);
    expect(fixture.starts.map(({ name }) => name)).toContain('s42-start');
    expect(fixture.closed).not.toContain('foreign-pane');
    expect(result.stdout).not.toContain('retained_worker_mismatch');
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
    expect(result).toMatchObject({ status: 1 });
    const persisted = JSON.parse(fs.readFileSync(runPath, 'utf8'));

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
    expect(fixture.starts.map(({ name }) => name)).toContain('s42-review1-reviewer-1');
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

  it('rejects legacy retained review prose without host assignment and receipt proof', () => {
    const fixture = makeControllerFixture();
    seedRun(fixture.cwd, {
      currentStep: 'review1', completed: { 42: ['start', 'implement'] },
      failed: { issue: 42, step: 'review1', reasonCode: 'worker_failed' },
    });
    fixture.herdr.listAgents = () => [{
      name: 's42-review1', pane_id: 'kept-review-pane', state: 'idle',
    }];
    fixture.herdr.agentRead = () => 'No findings.';
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([]);
    expect(fixture.prompts).toEqual([]);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.json'))).toBe(false);
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
      { name: 's42-review1-reviewer-1', paneId: 'pane-2', kind: 'omp' },
      { name: 's42-fix1', paneId: 'pane-3', kind: 'omp' },
      { name: 's42-review2-reviewer-1', paneId: 'pane-4', kind: 'omp' },
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
      's42-review1-reviewer-1',
      's42-fix1',
      's42-review2-reviewer-1',
      's42-fix2',
      's42-verify',
    ]);
    expect(stopped.currentIssue).toBe(42);
    expect(stopped.currentStep).toBe('verify');
    expect(stopped.completed['42']).toEqual([
      'start', 'implement', 'review1', 'fix1', 'review2', 'fix2',
    ]);
    expect(stopped.failed).toEqual({ issue: 42, step: 'verify', reasonCode: 'implementation_failed' });
    const failedHandoffPath = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-verify.json');
    const failedHandoff = JSON.parse(fs.readFileSync(failedHandoffPath, 'utf8'));
    fs.writeFileSync(failedHandoffPath, JSON.stringify({ ...failedHandoff, intervention: false }));

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
      's42-fix1',
      's42-fix2',
      's42-verify',
      's42-deliver',
    ]);
    expect([...fixture.reviewEnvironments.keys()]).toEqual([
      's42-review1-reviewer-1', 's42-review2-reviewer-1',
    ]);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('resumes failed verification at implement and reruns every downstream gate', () => {
    const fixture = makeControllerFixture();
    configureFailedRetainedVerifyWorker(fixture, { intervention: false });

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.closed).toEqual([
      'kept-verify-pane', 'pane-1', 'pane-2', 'pane-3', 'pane-4', 'pane-5', 'pane-6', 'pane-7',
    ]);
    expect(fixture.starts.map(({ name }) => name)).toEqual([
      's42-implement',
      's42-review1-reviewer-1',
      's42-fix1',
      's42-review2-reviewer-1',
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
    configureFailedRetainedVerifyWorker(fixture, { issues: [42, 43], intervention: false });
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

    expect(result).toMatchObject({ status: 1 });
    expect(names).toEqual([
      's42-implement',
      's42-review1-reviewer-1',
      's42-fix1',
      's42-review2-reviewer-1',
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
      workerBranch: '43-later',
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
      if (fixture.reviewEnvironments.has(input.name)) reviewPromptBranches.push(currentBranch);
      return agentPrompt(input);
    };
    fixture.run = (command, args) => {
      if (command === 'git' && ((args[0] === 'branch' && args[1] === '--show-current')
        || (args[0] === 'rev-parse' && args[1] === '--abbrev-ref'))) {
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

    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toMatchObject({ status: 0 });

    const checkoutMain = events.indexOf('checkout:main');
    const checkoutLater = events.indexOf('checkout:43-later');
    const reviewStart = events.indexOf('start:s43-review1-reviewer-1:43-later');
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
      currentStep: 'verify',
      completed: {
        42: VALID_STEPS,
        43: VALID_STEPS.slice(0, -2),
      },
      failed: null,
      workers: {
        's43-verify': {
          name: 's43-verify',
          paneId: 'kept-review-pane',
          projectRoot: fs.realpathSync(fixture.cwd),
          runId: 'test-run-id',
          issue: 43,
          step: 'verify',
          branch: '43-later',
          head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      startedAt: '2026-08-24T00:00:00.000Z',
    });
    fixture.herdr.listAgents = () => [{
      name: 's43-verify',
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
      result: { state: name === 's43-verify' ? 'working' : 'done' },
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

    const checkpointPath = path.join(fixture.cwd, '.omp/sdlc/run.json');
    const stopped = fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath)).failed : null;
    expect({ status: result.status, reasonCode: stopped?.reasonCode ?? null }).toEqual({ status: 0, reasonCode: null });
    expect(result.stdout).not.toContain('retained_worker_mismatch');
    const checkout = events.indexOf('checkout:43-later');
    const retained = events.indexOf('retained:kept-review-pane:43-later');
    expect(checkout).toBeGreaterThanOrEqual(0);
    expect(retained).toBeGreaterThan(checkout);
    expect(fixture.starts.map(({ name }) => name)).not.toContain('s43-verify');
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

  it('completes stopped delivery remediation from repaired passed proof without starting another worker', () => {
    const fixture = makeControllerFixture({ branch: 'main' });
    seedRun(fixture.cwd, {
      currentStep: 'deliver',
      completed: { 42: VALID_STEPS.slice(0, -1) },
      failed: { issue: 42, step: 'deliver', reasonCode: 'remediation_loop' },
      remediation: { issue: 42, step: 'deliver', status: 'stopped', reasonCode: 'remediation_loop' },
      workers: {},
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

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(fixture.cwd, '.omp/sdlc/run.json'))).toBe(false);
    expect(fixture.starts).toEqual([]);
    expect(fixture.calls).toContainEqual(['gh', 'pr', 'view', '77', '--json', 'state,headRefName']);
    expect(fixture.calls).toContainEqual(['gh', 'issue', 'view', '42', '--json', 'state']);
    expect(fixture.calls).toContainEqual([
      'git', 'fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main',
    ]);
    expect(fixture.calls).toContainEqual(['git', 'merge', '--ff-only', 'origin/main']);
    expect(fixture.calls).toContainEqual(['git', 'branch', '-d', '42-ship-it']);
    expect(fixture.calls).not.toContainEqual(['git', 'checkout', '42-ship-it']);
  });

  it.each([
    { pullRequestState: 'OPEN', issueState: 'CLOSED' },
    { pullRequestState: 'MERGED', issueState: 'OPEN' },
  ])('keeps stopped delivery incomplete when repaired passed evidence has PR $pullRequestState and issue $issueState', ({
    pullRequestState, issueState,
  }) => {
    const fixture = makeControllerFixture({ branch: 'main' });
    seedRun(fixture.cwd, {
      currentStep: 'deliver',
      completed: { 42: VALID_STEPS.slice(0, -1) },
      failed: { issue: 42, step: 'deliver', reasonCode: 'remediation_loop' },
      remediation: { issue: 42, step: 'deliver', status: 'stopped', reasonCode: 'remediation_loop' },
      workers: {},
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
    fixture.run = (command, args) => {
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        fixture.calls.push([command, ...args]);
        return {
          status: 0,
          stdout: JSON.stringify({ state: pullRequestState, headRefName: '42-ship-it' }),
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.includes('state')) {
        fixture.calls.push([command, ...args]);
        return { status: 0, stdout: JSON.stringify({ state: issueState }), stderr: '' };
      }
      return baseRun(command, args);
    };

    const result = runExecute({
      args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr,
      waitForDeliveryRetry: () => {},
    });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(persisted.completed['42']).not.toContain('deliver');
    expect(persisted.failed).toMatchObject({ issue: 42, step: 'deliver', reasonCode: 'delivery_not_complete' });
    expect(persisted.remediation).toMatchObject({ issue: 42, step: 'deliver', status: 'stopped' });
    expect(fixture.starts).toEqual([]);
    expect(fixture.calls).not.toContainEqual(['git', 'merge', '--ff-only', 'origin/main']);
    expect(fixture.calls).not.toContainEqual(['git', 'branch', '-d', '42-ship-it']);
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
