import { afterEach, describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { acquireControllerLease, releaseControllerLease } from '../sdlc-controller-lease.mjs';

import {
  assertInitialStagePublication,
  consumeSafeRecovery,
  inspectPublicationScope,
  reconcileStagePublication,
  resolveRecoveryOwner,
} from '../sdlc-safe-recoveries.mjs';

const roots = [];
const REPORT = 'specs/42-feature/verification-report.md';
const SUBJECT = 'docs: record verification for #42';
const TOKEN1 = '11111111-1111-4111-8111-111111111111';
const TOKEN2 = '22222222-2222-4222-8222-222222222222';
const failure = { status: 1, stdout: '', stderr: 'injected observation failure', error: null };
const observation = (stdout) => ({ status: 0, stdout, stderr: '', error: null });

function fixture({ createOwner = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-safe-recovery-'));
  roots.push(base);
  const root = path.join(base, 'work');
  const remote = path.join(base, 'remote.git');
  fs.mkdirSync(root);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git('init', '--bare', remote); git('init', '-b', '42-feature');
  git('config', 'user.name', 'Recovery fixture'); git('config', 'user.email', 'recovery@example.test');
  git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', path.join(base, 'no-hooks'));
  const put = (file, body) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), body);
  };
  put('.gitignore', '.omp/\n'); put(REPORT, 'original report\n'); put('src/code.mjs', 'original code\n');
  git('add', '.'); git('commit', '-m', 'chore: initialize recovery fixture');
  git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', '42-feature');
  const calls = [];
  const run = (command, args, options) => {
    calls.push([command, ...args]);
    return spawnSync(command, args, { encoding: 'utf8', ...options });
  };
  const owner = (overrides = {}) => resolveRecoveryOwner({ cwd: root, issue: 42, step: 'verify', run, ...overrides });
  const ownerId = createOwner ? owner() : null;
  calls.length = 0;
  const statePath = path.join(root, '.omp/sdlc/safe-recoveries.json');
  const state = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const commit = (files = { [REPORT]: 'current report\n' }, subject = SUBJECT) => {
    for (const [file, body] of Object.entries(files)) put(file, body);
    git('add', '--', ...Object.keys(files)); git('commit', '-m', subject);
    return git('rev-parse', 'HEAD');
  };
  const reconcile = (overrides = {}) => reconcileStagePublication({ cwd: root, issue: 42, step: 'verify', ownerId, expectedSubject: SUBJECT, allowedPaths: [REPORT], run, ...overrides });
  return { root, remote, git, put, run, calls, owner, ownerId, statePath, state, commit, reconcile };
}

const mutations = (calls) => calls.filter((call) => ['add', 'commit', 'push'].includes(call[1]));
function writePointer(f, token, value, name = 'recovery-owner.json') {
  f.put(`.omp/sdlc/sessions/${token}/${name}`, JSON.stringify({
    recoveryOwnerId: f.ownerId, projectRoot: fs.realpathSync(f.root), issue: 42, branch: '42-feature', step: 'verify', ...value,
  }));
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('durable recovery ownership', () => {
  test('a new session and lease reuse one consumed tuple without refilling existing budgets', () => {
    const f = fixture();
    const runPath = '.omp/sdlc/run.json';
    f.put(runPath, JSON.stringify({
      schemaVersion: 1, runId: 'execute-original', projectRoot: fs.realpathSync(f.root),
      issue: 7, branch: '7-original', head: 'a'.repeat(40), currentIssue: 42, issues: [7, 42],
      recoveries: [{ runId: 'execute-original', issue: 42, step: 'verify', disposition: 'consumed' }],
      remediation: { completedAttempts: 2 },
    }));
    const originalRun = fs.readFileSync(path.join(f.root, runPath));
    writePointer(f, TOKEN1, {});
    expect(f.owner({ controllerRunId: 'execute-original', sessionToken: TOKEN1 })).toBe(f.ownerId);
    const first = consumeSafeRecovery({ cwd: f.root, ownerId: f.ownerId, issue: 42, step: 'verify', class: 'stage_publication', evidence: { commitSha: 'a'.repeat(40) } });
    const before = fs.readFileSync(f.statePath);
    expect(first.consumed).toBe(true);
    expect(f.owner({ controllerRunId: 'a-new-lease', sessionToken: TOKEN2 })).toBe(f.ownerId);
    const second = consumeSafeRecovery({ cwd: f.root, ownerId: f.ownerId, issue: 42, step: 'verify', class: 'stage_publication', evidence: { commitSha: 'b'.repeat(40), summary: 'new wording', version: '99.0.0' } });
    expect(second).toEqual({ consumed: false, record: first.record });
    expect(fs.readFileSync(f.statePath)).toEqual(before);
    expect(f.state().records).toEqual([expect.objectContaining({ class: 'stage_publication', runId: f.ownerId, issue: 42, step: 'verify' })]);
    expect(fs.readFileSync(path.join(f.root, runPath))).toEqual(originalRun);
  });

  test('adopts an existing execute identity for the active issue, not its immutable initial issue', () => {
    const f = fixture({ createOwner: false });
    f.put('.omp/sdlc/run.json', JSON.stringify({ schemaVersion: 1, runId: 'execute-original', projectRoot: fs.realpathSync(f.root), issue: 7, branch: '7-initial', head: 'a'.repeat(40), currentIssue: 42, issues: [7, 42] }));
    const before = fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'));
    expect(f.owner({ controllerRunId: 'execute-original' })).toBe('execute-original');
    expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'))).toEqual(before);
  });

  test.each([
    ['wrong session issue', { issue: 7 }],
    ['wrong session branch', { branch: '42-other' }],
    ['wrong session stage', { step: 'fix1' }],
    ['different owner', { recoveryOwnerId: 'unrelated-owner' }],
  ])('rejects %s without changing durable records', (_label, pointer) => {
    const f = fixture(); writePointer(f, TOKEN1, pointer);
    const before = fs.readFileSync(f.statePath);
    expect(() => f.owner({ sessionToken: TOKEN1 })).toThrow('recovery_owner_ambiguous');
    expect(fs.readFileSync(f.statePath)).toEqual(before);
    expect(mutations(f.calls)).toEqual([]);
  });

  test('rejects conflicting session pointer files and ambiguous durable owners', () => {
    const f = fixture();
    writePointer(f, TOKEN1, {}); writePointer(f, TOKEN1, { recoveryOwnerId: 'another-owner' }, 'run.json');
    expect(() => f.owner({ sessionToken: TOKEN1 })).toThrow('recovery_owner_ambiguous');
    const data = f.state(); data.owners.push({ ...data.owners[0], ownerId: 'another-owner' });
    fs.writeFileSync(f.statePath, JSON.stringify(data));
    const before = fs.readFileSync(f.statePath);
    expect(() => f.owner({ sessionToken: TOKEN2 })).toThrow('recovery_owner_ambiguous');
    expect(fs.readFileSync(f.statePath)).toEqual(before);
  });

  test.each(['failed handoff', 'unpublished commit', 'session pointer without owner'])('does not invent ownership after %s', (prior) => {
    const f = fixture({ createOwner: false });
    if (prior === 'failed handoff') f.put('.omp/sdlc/handoffs/42-verify.json', JSON.stringify({ schemaVersion: 1, issue: 42, step: 'verify', status: 'failed', intervention: true }));
    if (prior === 'unpublished commit') f.commit();
    if (prior === 'session pointer without owner') writePointer(f, TOKEN1, { recoveryOwnerId: 'missing-owner' });
    expect(() => f.owner({ sessionToken: TOKEN1 })).toThrow('recovery_owner_missing');
    expect(fs.existsSync(f.statePath)).toBe(false);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/run.json'))).toBe(false);
    expect(mutations(f.calls)).toEqual([]);
  });

  test('fails actual branch disagreement rather than trusting the caller branch', () => {
    const f = fixture();
    expect(() => f.owner({ branch: '42-other' })).toThrow('recovery_owner_ambiguous');
    f.git('switch', '--detach');
    expect(() => f.owner()).toThrow('recovery_owner_unreadable');
  });

  test('does not push when a competing durable-state writer holds the lock', () => {
    const f = fixture(); f.commit();
    const before = fs.readFileSync(f.statePath);
    fs.writeFileSync(`${f.statePath}.lock`, 'competing writer');
    expect(f.reconcile()).toMatchObject({ passed: false, reasonCode: 'verification_publish_failed' });
    expect(fs.readFileSync(f.statePath)).toEqual(before);
    expect(fs.readFileSync(`${f.statePath}.lock`, 'utf8')).toBe('competing writer');
    expect(mutations(f.calls)).toEqual([]);
  });
});

describe('proof-bearing stage publication', () => {
  test('pushes a known local commit once and acknowledges the remote exact head without another mutation', () => {
    const f = fixture(); const head = f.commit();
    expect(f.reconcile()).toMatchObject({ passed: true, pushed: true });
    const before = fs.readFileSync(f.statePath);
    expect(f.state().records).toEqual([expect.objectContaining({ class: 'stage_publication', runId: f.ownerId, issue: 42, step: 'verify', evidence: { commitSha: head, subject: SUBJECT, allowedPaths: [REPORT], upstream: 'origin/42-feature' } })]);
    expect(mutations(f.calls)).toEqual([['git', 'push', 'origin', 'HEAD:refs/heads/42-feature']]);
    f.calls.length = 0;
    expect(f.reconcile({ ownerId: f.owner({ sessionToken: TOKEN2, controllerRunId: 'fresh-lease' }) })).toMatchObject({ passed: true, ack: true });
    expect(mutations(f.calls)).toEqual([]);
    expect(fs.readFileSync(f.statePath)).toEqual(before);
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
    expect(f.git('--git-dir', f.remote, 'rev-parse', 'refs/heads/42-feature')).toBe(head);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/run.json'))).toBe(false);
  });

  test('acknowledges a push that landed despite a failed transport result without replay', () => {
    const f = fixture(); const head = f.commit();
    const uncertainPush = (command, args, options) => {
      const actual = f.run(command, args, options);
      return args[0] === 'push' ? failure : actual;
    };
    expect(f.reconcile({ run: uncertainPush }).passed).toBe(false);
    const before = fs.readFileSync(f.statePath);
    f.calls.length = 0;
    expect(f.reconcile()).toMatchObject({ passed: true, ack: true });
    expect(mutations(f.calls)).toEqual([]);
    expect(fs.readFileSync(f.statePath)).toEqual(before);
    expect(f.git('--git-dir', f.remote, 'rev-parse', 'refs/heads/42-feature')).toBe(head);
  });

  test('a failed push consumes before acting and cannot retry after commit or report churn', () => {
    const f = fixture(); f.commit();
    let pushes = 0;
    const run = (command, args, options) => {
      if (args[0] === 'push') {
        pushes += 1;
        expect(f.state().records).toEqual([expect.objectContaining({ runId: f.ownerId, class: 'stage_publication', issue: 42, step: 'verify' })]);
        return failure;
      }
      return f.run(command, args, options);
    };
    expect(f.reconcile({ run }).passed).toBe(false);
    const before = fs.readFileSync(f.statePath);
    expect(f.reconcile({ run }).passed).toBe(false);
    f.commit({ [REPORT]: 'report edited again\n' });
    expect(f.reconcile({ run, ownerId: f.owner({ sessionToken: TOKEN2 }) }).passed).toBe(false);
    expect(pushes).toBe(1);
    expect(fs.readFileSync(f.statePath)).toEqual(before);
    expect(() => assertInitialStagePublication({ cwd: f.root, issue: 42, step: 'verify', ownerId: f.ownerId, run: f.run })).toThrow('stage_publication_consumed');
  });

  test.each([
    ['status'], ['config'], ['fetch'], ['rev-parse', 'FETCH_HEAD'], ['rev-parse', '@{u}'],
    ['rev-parse', 'HEAD'], ['rev-list', '--left-right'], ['log', '-1'], ['rev-list', '--parents'], ['diff-tree'],
  ])('does not acknowledge after a failed %s %s observation', (...prefix) => {
    const f = fixture(); f.commit(); f.git('push');
    const run = (command, args, options) => prefix.every((part, index) => args[index] === part) ? failure : f.run(command, args, options);
    expect(f.reconcile({ run })).toMatchObject({ passed: false, reasonCode: 'verification_publish_failed' });
    expect(mutations(f.calls)).toEqual([]);
    expect(f.state().records).toEqual([]);
  });

  test.each([
    ['unreadable head', ['rev-parse', 'HEAD'], 'not-a-sha\n'],
    ['inconsistent fetched head', ['rev-parse', 'FETCH_HEAD'], `${'f'.repeat(40)}\n`],
    ['malformed divergence', ['rev-list', '--left-right'], '0\tunknown\n'],
    ['wrong stage subject', ['log', '-1'], 'docs: record verification for #43\n'],
    ['malformed parent identity', ['rev-list', '--parents'], 'garbage garbage\n'],
    ['truncated NUL path list', ['diff-tree'], REPORT],
    ['malformed porcelain', ['status'], '?'],
    ['empty changed-path proof', ['diff-tree'], ''],
  ])('does not acknowledge %s', (_label, prefix, stdout) => {
    const f = fixture(); f.commit(); f.git('push');
    const run = (command, args, options) => prefix.every((part, index) => args[index] === part) ? observation(stdout) : f.run(command, args, options);
    expect(f.reconcile({ run })).toMatchObject({ passed: false, reasonCode: 'verification_publish_failed' });
    expect(mutations(f.calls)).toEqual([]);
    expect(f.state().records).toEqual([]);
  });

  test.each(['dirty', 'out-of-scope commit', 'wrong subject', 'wrong issue branch', 'wrong upstream branch', 'unproven owner'])('rejects actual %s without pushing', (condition) => {
    const f = fixture();
    f.commit(condition === 'out-of-scope commit' ? { [REPORT]: 'current report\n', 'src/code.mjs': 'unrelated change\n' } : undefined, condition === 'wrong subject' ? 'chore: unrelated commit' : SUBJECT);
    if (condition === 'dirty') f.put(REPORT, 'uncommitted partial report\n');
    if (condition === 'wrong issue branch') f.git('branch', '-m', '43-other');
    if (condition === 'wrong upstream branch') f.git('config', 'branch.42-feature.merge', 'refs/heads/another-branch');
    const outcome = f.reconcile(condition === 'unproven owner' ? { ownerId: 'unrelated-owner' } : {});
    expect(outcome).toMatchObject({ passed: false, reasonCode: 'verification_publish_failed' });
    expect(mutations(f.calls)).toEqual([]);
    expect(f.state().records).toEqual([]);
  });

  test('rejects real divergence from the remote instead of pushing over it', () => {
    const f = fixture(); const localHead = f.commit();
    f.git('switch', '-c', 'remote-writer', '@{u}');
    const remoteHead = f.commit({ 'src/code.mjs': 'remote change\n' }, 'chore: independent remote change');
    f.git('push', 'origin', 'HEAD:refs/heads/42-feature'); f.git('switch', '42-feature');
    expect(f.reconcile()).toMatchObject({ passed: false, reasonCode: 'verification_publish_failed' });
    expect(mutations(f.calls)).toEqual([]);
    expect(f.git('rev-parse', 'HEAD')).toBe(localHead);
    expect(f.git('--git-dir', f.remote, 'rev-parse', 'refs/heads/42-feature')).toBe(remoteHead);
  });

  test('does not use an empty merge diff as single-parent scope proof', () => {
    const f = fixture(); f.commit();
    f.git('switch', '-c', 'side', 'HEAD~1'); f.commit({ 'src/code.mjs': 'side change\n' });
    f.git('switch', '42-feature'); f.git('merge', '--no-ff', '-m', SUBJECT, 'side');
    f.git('push');
    expect(f.reconcile({ allowedPaths: [REPORT, 'src/code.mjs'] }).passed).toBe(false);
    expect(mutations(f.calls)).toEqual([]);
  });

  test('checks every ahead commit rather than just the latest expected subject', () => {
    const f = fixture(); f.commit({ 'src/code.mjs': 'unrelated earlier change\n' }, 'chore: unrelated earlier work'); f.commit();
    expect(f.reconcile()).toMatchObject({ passed: false, reasonCode: 'verification_publish_failed' });
    expect(mutations(f.calls)).toEqual([]);
    expect(f.state().records).toEqual([]);
  });
});

describe('approved publication scope', () => {
  test('uses live task paths, including deleted files, without granting authority from parenthetical notes', () => {
    const f = fixture();
    const header = '**Issue**: #42\n**Status**: Approved\n\n';
    const spec = 'specs/42-feature';
    f.put(`${spec}/requirements.md`, `${header}### AC1: Apply approved changes\n\n| FR1 | Publish only approved paths | Must |\n`);
    f.put(`${spec}/design.md`, `${header}Use approved paths only.\n`);
    f.put(`${spec}/tasks.md`, `${header}### T001: Apply changes\n\n**File(s)**: \`src/\` (after \`skill://skill-creator\`), \`deleted.txt\` (remove)\n\n## Notes\n\n**File(s)**: \`unrelated.txt\`\n`);
    f.put(`${spec}/feature.gherkin`, `${header}Feature: Scope\n  Scenario: Publish approved paths\n    Given approved tasks\n    When changes publish\n    Then only approved paths publish\n`);
    f.put('unrelated.txt', 'not authorized\n');
    const scope = inspectPublicationScope({ cwd: f.root, issue: 42, step: 'fix1', spec, run: f.run });
    expect(scope).toContain('src/code.mjs');
    expect(scope).toContain('deleted.txt');
    expect(scope).not.toContain('unrelated.txt');
    expect(scope).not.toContain('skill://skill-creator');
    expect(inspectPublicationScope({ cwd: f.root, issue: 42, step: 'verify', spec, run: f.run })).toEqual([REPORT]);
    f.put(`${spec}/design.md`, `${header.replace('Approved', 'Draft')}Unapproved changes.\n`);
    expect(() => inspectPublicationScope({ cwd: f.root, issue: 42, step: 'fix1', spec, run: f.run })).toThrow('spec_not_approved');
  });
});

describe('publication CLI lease ownership boundary', () => {
  const script = fileURLToPath(new URL('../sdlc-safe-recoveries.mjs', import.meta.url));
  const spec = 'specs/42-feature';
  const runId = 'execute-original';

  function cliFixture() {
    const f = fixture({ createOwner: false });
    const header = '**Issue**: #42\n**Status**: Approved\n\n';
    f.put(`${spec}/requirements.md`, `${header}### AC1: Publish approved changes\n\n| FR1 | Preserve ownership | Must |\n`);
    f.put(`${spec}/design.md`, `${header}Publish only approved changes.\n`);
    f.put(`${spec}/tasks.md`, `${header}### T001: Publish changes\n\n**File(s)**: \`src/code.mjs\`\n`);
    f.put(`${spec}/feature.gherkin`, `${header}Feature: Publication\n  Scenario: Preserve ownership\n    Given an approved change\n    When publication binds\n    Then the original owner is retained\n`);
    f.put('.omp/sdlc/run.json', JSON.stringify({
      schemaVersion: 1, runId, projectRoot: fs.realpathSync(f.root), issues: [42],
      currentIssue: 42, currentStep: 'implement', remediation: { completedAttempts: 2 },
      recoveries: [{ runId, issue: 42, step: 'implement', disposition: 'consumed' }],
    }));
    f.put('.omp/sdlc/handoffs/42-implement.json', JSON.stringify({
      schemaVersion: 1, issue: 42, step: 'implement', status: 'failed', intervention: true,
    }));
    const bind = (identity = runId) => spawnSync(process.execPath, [
      script, 'bind', '--issue', '42', '--step', 'implement', '--spec', spec,
      '--controller-run-id', identity,
    ], { cwd: f.root, encoding: 'utf8' });
    return { ...f, bind };
  }

  test.each(['fresh', 'joined'])('binds the original controller through a %s lease without granting recovery credit', (mode) => {
    const f = cliFixture();
    const checkpoint = fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'));
    const failedHandoff = fs.readFileSync(path.join(f.root, '.omp/sdlc/handoffs/42-implement.json'));
    const lockPath = path.join(f.root, '.omp/sdlc/controller.lock');
    const lease = mode === 'joined' ? acquireControllerLease({ projectRoot: f.root, runId }) : null;
    try {
      const result = f.bind();
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      const publication = JSON.parse(result.stdout.trim().replace(/^NMG_SDLC_PUBLICATION: /, ''));
      expect(publication).toMatchObject({ passed: true, ownerId: runId });
      const state = fs.readFileSync(f.statePath);
      expect(f.state().owners).toEqual([expect.objectContaining({ ownerId: runId, issue: 42, step: 'implement', branch: '42-feature' })]);
      expect(f.state().records).toEqual([]);
      expect(f.bind().status).toBe(0);
      expect(fs.readFileSync(f.statePath)).toEqual(state);
      expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'))).toEqual(checkpoint);
      expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/handoffs/42-implement.json'))).toEqual(failedHandoff);
      if (lease) expect(fs.readFileSync(lockPath, 'utf8')).toBe(lease.serialized);
      else expect(fs.existsSync(lockPath)).toBe(false);
    } finally { if (lease) releaseControllerLease(lease); }
  });

  test('dirty implementation binding rejects a consumed publication allowance before Git mutation', () => {
    const f = cliFixture();
    expect(f.bind().status).toBe(0);
    consumeSafeRecovery({ cwd: f.root, ownerId: runId, issue: 42, step: 'implement', class: 'stage_publication', evidence: { commitSha: f.git('rev-parse', 'HEAD') } });
    f.put('src/code.mjs', 'additional approved changes\n');
    const head = f.git('rev-parse', 'HEAD');
    const upstream = f.git('rev-parse', '@{upstream}');
    const index = f.git('diff', '--cached');
    const recovery = fs.readFileSync(f.statePath);
    const checkpoint = fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'));
    const result = f.bind();
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 1, stderr: 'stage_publication_consumed\n' });
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
    expect(f.git('rev-parse', '@{upstream}')).toBe(upstream);
    expect(f.git('diff', '--cached')).toBe(index);
    expect(fs.readFileSync(f.statePath)).toEqual(recovery);
    expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'))).toEqual(checkpoint);
  });

  test.each([
    ['checkpoint', false, 'recovery_owner_missing'],
    ['live lease', true, 'controller_lease_held'],
  ])('rejects a mismatched %s identity without inventing an owner', (_label, held, reason) => {
    const f = cliFixture();
    const checkpoint = fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'));
    const lease = held ? acquireControllerLease({ projectRoot: f.root, runId }) : null;
    try {
      const result = f.bind('foreign-run');
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 1, stderr: `${reason}\n` });
      expect(fs.existsSync(f.statePath)).toBe(false);
      expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'))).toEqual(checkpoint);
      const lockPath = path.join(f.root, '.omp/sdlc/controller.lock');
      if (lease) expect(fs.readFileSync(lockPath, 'utf8')).toBe(lease.serialized);
      else expect(fs.existsSync(lockPath)).toBe(false);
    } finally { if (lease) releaseControllerLease(lease); }
  });
});
