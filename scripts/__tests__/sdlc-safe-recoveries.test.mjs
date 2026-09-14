import { afterEach, describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { acquireControllerLease, releaseControllerLease } from '../sdlc-controller-lease.mjs';

import {
  assertInitialStagePublication,
  consumeSafeRecovery,
  inspectPublicationScope,
  parseDeliveryTaskFileLines,
  probePublicationScope,
  PUBLICATION_FILE_SYNTAX,
  publicationFileEntries,
  reconcileStagePublication,
  resolveRecoveryOwner,
} from '../sdlc-safe-recoveries.mjs';

const roots = [];
const REPORT = 'specs/42-feature/verification-report.md';
const TASKS_TEMPLATE = fileURLToPath(new URL('../../workflows/write-spec/templates/tasks.md', import.meta.url));
const PATHCAST_TASKS = fileURLToPath(new URL('../__fixtures__/pathcast-108-publication-scope/tasks.md', import.meta.url));
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
    f.put(`${spec}/tasks.md`, `${header}### T001: Apply changes\n\n**File(s)**: \`src/\` (after \`skill://skill-creator\`), \`deleted.txt\` (remove), \`${REPORT}\`, \`${spec}/design.md\`, \`specs/other/input.md\`\n\n## Notes\n\n**File(s)**: \`unrelated.txt\`\n`);
    f.put(`${spec}/feature.gherkin`, `${header}Feature: Scope\n  Scenario: Publish approved paths\n    Given approved tasks\n    When changes publish\n    Then only approved paths publish\n`);
    f.put('unrelated.txt', 'not authorized\n');
    const scope = inspectPublicationScope({ cwd: f.root, issue: 42, step: 'fix1', spec, run: f.run });
    expect(scope.allowedPaths).toContain('src/code.mjs');
    expect(scope.allowedPaths).toContain('deleted.txt');
    expect(scope.allowedPaths).not.toContain('unrelated.txt');
    expect(scope.allowedPaths).not.toContain('skill://skill-creator');
    expect(inspectPublicationScope({ cwd: f.root, issue: 42, step: 'verify', spec, run: f.run }).allowedPaths).toEqual([REPORT]);
    expect(scope.allowedPaths).not.toContain(REPORT);
    expect(scope.allowedPaths.some((file) => file === 'specs' || file.startsWith('specs/'))).toBe(false);
    expect(scope.readOnlyPaths).toEqual(expect.arrayContaining([
      REPORT,
      `${spec}/design.md`,
      'specs/other/input.md',
    ]));
    f.put(`${spec}/design.md`, `${header.replace('Approved', 'Draft')}Unapproved changes.\n`);
    expect(() => inspectPublicationScope({ cwd: f.root, issue: 42, step: 'fix1', spec, run: f.run })).toThrow('spec_not_approved');
  });

  test.each([
    ['missing', '**Type**: Modify'],
    ['near-miss', '**Files**: `src/code.mjs`'],
    ['duplicate', '**File(s)**: `src/code.mjs`\n**File(s)**: `src/other.mjs`'],
  ])('rejects an admitted level-two task with a %s declaration', (_name, declaration) => {
    const f = fixture();
    const header = '**Issue**: #42\n**Status**: Approved\n\n';
    const spec = 'specs/42-feature';
    f.put(`${spec}/requirements.md`, `${header}### AC1: Apply approved changes\n\n| FR1 | Publish only approved paths | Must |\n`);
    f.put(`${spec}/design.md`, `${header}Use approved paths only.\n`);
    f.put(`${spec}/tasks.md`, `${header}## T001: Apply changes\n\n${declaration}\n`);
    f.put(`${spec}/feature.gherkin`, `${header}Feature: Scope\n  Scenario: Publish approved paths\n`);

    expect(() => inspectPublicationScope({
      cwd: f.root,
      issue: 42,
      step: 'implement',
      spec,
      run: f.run,
    })).toThrow(expect.objectContaining({
      reasonCode: 'publication_scope_unproven',
      taskId: 'T001',
    }));
  });

  test('accepts one canonical declaration on an admitted level-two task', () => {
    const f = fixture();
    const header = '**Issue**: #42\n**Status**: Approved\n\n';
    const spec = 'specs/42-feature';
    f.put(`${spec}/requirements.md`, `${header}### AC1: Apply approved changes\n\n| FR1 | Publish only approved paths | Must |\n`);
    f.put(`${spec}/design.md`, `${header}Use approved paths only.\n`);
    f.put(`${spec}/tasks.md`, `${header}## T001: Apply changes\n\n**File(s)**: \`src/code.mjs\`\n`);
    f.put(`${spec}/feature.gherkin`, `${header}Feature: Scope\n  Scenario: Publish approved paths\n`);

    expect(inspectPublicationScope({
      cwd: f.root,
      issue: 42,
      step: 'implement',
      spec,
      run: f.run,
    }).allowedPaths).toContain('src/code.mjs');
  });
});

  test('shares canonical parsing and reports the exact invalid task location', () => {
    expect(publicationFileEntries('`src/a.ts`, tests/steps/; VERSION (delivery owner only)'))
      .toEqual(['src/a.ts', 'tests/steps/']);
    expect(() => parseDeliveryTaskFileLines([
      '# Tasks',
      '### T001: Create code',
      '',
      '**File(s)**: Create `src/a.ts`',
    ].join('\n'), { spec: 'specs/42-feature/tasks.md' })).toThrow(expect.objectContaining({
      reasonCode: 'publication_scope_unproven',
      spec: 'specs/42-feature/tasks.md',
      taskId: 'T001',
      line: 4,
      entry: 'Create `src/a.ts`',
      syntax: PUBLICATION_FILE_SYNTAX,
    }));
  });

  test.each([
    {
      name: 'missing',
      lines: ['# Tasks', '### T001: Create code', '', '**Type**: Modify'],
      expected: { line: 2 },
    },
    {
      name: 'near-miss',
      lines: ['# Tasks', '### T001: Create code', '', '**Files**: `src/a.ts`'],
      expected: { line: 4, entry: '**Files**: `src/a.ts`' },
    },
    {
      name: 'singular near-miss',
      lines: ['# Tasks', '### T001: Create code', '', '**File**: `src/a.ts`'],
      expected: { line: 4, entry: '**File**: `src/a.ts`' },
    },
    {
      name: 'duplicate',
      lines: ['# Tasks', '### T001: Create code', '', '**File(s)**: `src/a.ts`', '**File(s)**: `src/b.ts`'],
      expected: { line: 5, entry: '**File(s)**: `src/b.ts`' },
    },
    {
      name: 'level-two missing',
      lines: ['# Tasks', '## T001: Create code', '', '**Type**: Modify'],
      expected: { line: 2 },
    },
    {
      name: 'level-two near-miss',
      lines: ['# Tasks', '## T001: Create code', '', '**Files**: `src/a.ts`'],
      expected: { line: 4, entry: '**Files**: `src/a.ts`' },
    },
    {
      name: 'level-two duplicate',
      lines: ['# Tasks', '## T001: Create code', '', '**File(s)**: `src/a.ts`', '**File(s)**: `src/b.ts`'],
      expected: { line: 5, entry: '**File(s)**: `src/b.ts`' },
    },
  ])('rejects a $name declaration defect at the task location', ({ lines, expected }) => {
    expect(() => parseDeliveryTaskFileLines(lines.join('\n'), {
      spec: 'specs/42-feature/tasks.md',
    })).toThrow(expect.objectContaining({
      reasonCode: 'publication_scope_unproven',
      spec: 'specs/42-feature/tasks.md',
      taskId: 'T001',
      syntax: PUBLICATION_FILE_SYNTAX,
      ...expected,
    }));
  });

  test('accepts one canonical declaration for every admitted task and ignores other metadata', () => {
    expect(parseDeliveryTaskFileLines([
      '**Files**: `outside.txt`',
      '### T001: Create code',
      '**File(s)**: `src/a.ts`',
      '## T002: Test code',
      '**File(s)**: `tests/a.test.mjs`',
      '### T003: Excluded task',
      '**Files**: `excluded.txt`',
    ].join('\n'), {
      spec: 'specs/42-feature/tasks.md',
      taskIds: ['T001', 'T002'],
    })).toEqual(['src/a.ts', 'tests/a.test.mjs']);
  });

  test.each([
    ['backtick fence', ['```text', '**File(s)**: `src/hidden.ts`', '```']],
    ['tilde fence', ['~~~text', '**File(s)**: `src/hidden.ts`', '~~~']],
    ['multiline HTML comment', ['<!--', '**File(s)**: `src/hidden.ts`', '-->']],
  ])('ignores metadata inside a %s', (_name, hiddenDeclaration) => {
    expect(() => parseDeliveryTaskFileLines([
      '# Tasks',
      '### T001: Create code',
      ...hiddenDeclaration,
    ].join('\n'), {
      spec: 'specs/42-feature/tasks.md',
    })).toThrow(expect.objectContaining({
      reasonCode: 'publication_scope_unproven',
      taskId: 'T001',
      line: 2,
    }));
  });

  test.each([
    ['backtick fence', ['```text', '## T001: Hidden task', '**File(s)**: `src/hidden.ts`', '```']],
    ['HTML comment', ['<!--', '## T001: Hidden task', '**File(s)**: `src/hidden.ts`', '-->']],
    ['multiline code span', ['``', '## T001: Hidden task', '**File(s)**: `src/hidden.ts`', '``']],
    ['multiline code span with opener content', ['``example', '## T001: Hidden task', '**File(s)**: `src/hidden.ts`', '``']],
    ['multiline code span after astral prefix', ['😀 `` opener', '## T001: Hidden task', '**File(s)**: `src/hidden.ts`', '``']],
  ])('rejects an admitted task heading hidden inside a %s', (_name, hiddenTask) => {
    expect(() => parseDeliveryTaskFileLines([
      '# Tasks',
      ...hiddenTask,
    ].join('\n'), {
      spec: 'specs/42-feature/tasks.md',
      taskIds: ['T001'],
    })).toThrow(expect.objectContaining({
      reasonCode: 'publication_scope_unproven',
      taskId: 'T001',
      line: 3,
    }));
  });

  test.each([
    ['HTML comment', ['<!-- unmatched ` -->'], 4],
    ['HTML comment after astral prefix', ['😀<!-- unmatched ` -->'], 4],
    ['tilde fence', ['~~~text', 'unmatched `', '~~~'], 6],
  ])('ignores backticks in a %s when pairing a later multiline span', (_name, prefix, line) => {
    expect(() => parseDeliveryTaskFileLines([
      '# Tasks',
      ...prefix,
      '``',
      '## T001: Hidden task',
      '**File(s)**: `src/hidden.ts`',
      '``',
    ].join('\n'), {
      spec: 'specs/42-feature/tasks.md',
      taskIds: ['T001'],
    })).toThrow(expect.objectContaining({
      reasonCode: 'publication_scope_unproven',
      taskId: 'T001',
      line,
    }));
  });

  test('pairs crossing multiline code-span delimiters in document order', () => {
    expect(() => parseDeliveryTaskFileLines([
      '### T001: Create code',
      '`` opener',
      'inside old span `` then `` opener for new span',
      '**File(s)**: `src/hidden.ts`',
      '``',
    ].join('\n'), {
      spec: 'specs/42-feature/tasks.md',
      taskIds: ['T001'],
    })).toThrow(expect.objectContaining({
      reasonCode: 'publication_scope_unproven',
      taskId: 'T001',
      line: 1,
    }));
  });

  test('does not count hidden metadata as a duplicate declaration', () => {
    expect(parseDeliveryTaskFileLines([
      '# Tasks',
      '### T001: Create code',
      '<!--',
      '**File(s)**: `src/hidden.ts`',
      '-->',
      '```text',
      '**File(s)**: `src/also-hidden.ts`',
      '```',
      '**File(s)**: `src/visible.ts`',
    ].join('\n'), {
      spec: 'specs/42-feature/tasks.md',
    })).toEqual(['src/visible.ts']);
  });

  test('parses visible File(s) text after an inline HTML comment', () => {
    expect(parseDeliveryTaskFileLines([
      '# Tasks',
      '### T001: Create code',
      '**File(s)**: `src/a.ts` <!-- note -->; `src/b.ts`',
    ].join('\n'), {
      spec: 'specs/42-feature/tasks.md',
    })).toEqual(['src/a.ts', 'src/b.ts']);
  });

  test.each([
    ['tab-delimited', '##\tNotes'],
    ['bare level-two', '##'],
    ['bare level-three', '###'],
  ])('ends a task before a %s Markdown section heading', (_name, boundary) => {
    expect(() => parseDeliveryTaskFileLines([
      '### T001: Create code',
      boundary,
      '**File(s)**: `outside.txt`',
    ].join('\n'), {
      spec: 'specs/42-feature/tasks.md',
      taskIds: ['T001'],
    })).toThrow(expect.objectContaining({
      reasonCode: 'publication_scope_unproven',
      taskId: 'T001',
      line: 1,
    }));
  });

  test('preserves HTML comment markers inside a code-quoted path', () => {
    expect(parseDeliveryTaskFileLines([
      '### T001: Create code',
      '**File(s)**: `src/<!--note-->`',
    ].join('\n'), {
      spec: 'specs/42-feature/tasks.md',
      taskIds: ['T001'],
    })).toEqual(['src/<!--note-->']);
  });

  test.each([
    ['unmatched', 'Prose with unmatched ` delimiter'],
    ['escaped', 'Prose with escaped \\` delimiter'],
  ])('does not treat an %s backtick as a multiline code span', (_name, prose) => {
    expect(parseDeliveryTaskFileLines([
      '### T001: Create code',
      prose,
      '**File(s)**: `src/a.ts`',
    ].join('\n'), {
      spec: 'specs/42-feature/tasks.md',
      taskIds: ['T001'],
    })).toEqual(['src/a.ts']);
  });

  test.each(['`*`', '`**`', '`**/*`'])('rejects repository-wide glob %s', (declaration) => {
    expect(() => publicationFileEntries(declaration))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_scope_unproven' }));
  });

  test.each(['`!src/private/**`', '`^src/private/**`'])('rejects Git exclusion pathspec %s', (declaration) => {
    expect(() => publicationFileEntries(declaration))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_scope_unproven' }));
  });

  test('authorizes bounded glob matches without widening to unrelated files', () => {
    const f = fixture();
    const header = '**Issue**: #42\n**Status**: Approved\n\n';
    const spec = 'specs/42-feature';
    f.put(`${spec}/requirements.md`, `${header}### AC1: Generate steps\n`);
    f.put(`${spec}/design.md`, `${header}Generate bounded steps.\n`);
    f.put(`${spec}/tasks.md`, `${header}### T001: Generate steps\n\n**File(s)**: \`tests/generated/*.mjs\`\n`);
    f.put(`${spec}/feature.gherkin`, `${header}Feature: Steps\n  Scenario: Generate steps\n`);
    f.put('tests/generated/step.mjs', 'export const step = true;\n');
    f.put('tests/unrelated.mjs', 'export const unrelated = true;\n');

    const scope = inspectPublicationScope({ cwd: f.root, issue: 42, step: 'implement', spec, run: f.run });

    expect(scope.allowedPaths).toContain('tests/generated/step.mjs');
    expect(scope.allowedPaths).not.toContain('tests/unrelated.mjs');
  });

  test('rejects a bounded declaration that expands to no files', () => {
    const f = fixture();
    const header = '**Issue**: #42\n**Status**: Approved\n\n';
    const spec = 'specs/42-feature';
    f.put(`${spec}/requirements.md`, `${header}### AC1: Generate steps\n`);
    f.put(`${spec}/design.md`, `${header}Generate bounded steps.\n`);
    f.put(`${spec}/tasks.md`, `${header}### T001: Generate steps\n\n**File(s)**: \`tests/generated/**/*.mjs\`\n`);
    f.put(`${spec}/feature.gherkin`, `${header}Feature: Steps\n  Scenario: Generate steps\n`);
    expect(() => inspectPublicationScope({ cwd: f.root, issue: 42, step: 'implement', spec, run: f.run }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_scope_unproven', entry: 'tests/generated/**/*.mjs' }));
  });


  test('write-spec task template uses only the shared publication grammar', () => {
    const renderedTemplate = fs.readFileSync(TASKS_TEMPLATE, 'utf8')
      .replace(/^```(?:markdown)?\s*$/gm, '');
    const entries = parseDeliveryTaskFileLines(renderedTemplate, {
      spec: 'workflows/write-spec/templates/tasks.md',
    });
    expect(entries.length).toBeGreaterThan(0);
  });


describe('read-only owner-bound publication probe', () => {
  const script = fileURLToPath(new URL('../sdlc-safe-recoveries.mjs', import.meta.url));
  const branch = '108-establish-claim-specific-ip-and-product-safety-guardrails';
  const runId = '5045d7eb-1038-49d7-9d81-d17ba22e7a62';
  const spec = 'specs/108-coordinate-the-pathcast-to-miledar-prelaunch-rebrand';
  const trackedPaths = [
    '.github/workflows/miledar-ip-guardrails.yml',
    'api/package.json',
    'api/src/__tests__/features/miledar_ip_guardrails.feature',
    'api/src/__tests__/steps/miledar_ip_guardrails.steps.ts',
    'api/src/__tests__/unit/ip-guardrails/reconciliation.test.ts',
    'api/src/scripts/capture-miledar-ip-evidence.ts',
    'api/src/scripts/reconcile-miledar-ip-guardrails.ts',
    'api/src/services/ip-guardrails/semantic.ts',
    'api/src/services/ip-guardrails/service.ts',
    'api/src/services/ip-guardrails/types.ts',
    'docs/release/miledar-ip-guardrails.json',
    'docs/release/miledar-ip-product-safety.md',
  ].sort();
  const evidencePaths = [
    'api/.artifacts/miledar-ip-guardrails/evidence.json',
    'artifacts/issue-108/hosted-check.json',
    'artifacts/issue-108/live-ruleset.json',
    'artifacts/issue-108/local-results.json',
    'artifacts/issue-108/merged-inputs.json',
    'artifacts/issue-108/reconciliation.json',
  ].sort();

  function pathCastFixture() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-pathcast-scope-'));
    roots.push(base);
    const root = path.join(base, 'work');
    fs.mkdirSync(root);
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
      return result.stdout.trim();
    };
    git('init', '-b', branch);
    git('config', 'user.name', 'Scope fixture');
    git('config', 'user.email', 'scope@example.test');
    git('config', 'commit.gpgsign', 'false');
    const put = (file, body) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), body);
    };
    put('.gitignore', '.omp/\n');
    for (const file of trackedPaths) put(file, `tracked fixture ${file}\n`);
    const header = '**Issue**: #108\n**Status**: Approved\n\n';
    put(`${spec}/requirements.md`, `${header}### AC1: Preserve exact scope\n`);
    put(`${spec}/design.md`, `${header}Use structured scope.\n`);
    put(`${spec}/tasks.md`, fs.readFileSync(PATHCAST_TASKS));
    put(`${spec}/feature.gherkin`, `${header}Feature: Scope\n  Scenario: Preserve exact scope\n`);
    put('steering/product.md', 'product authority\n');
    put('.pi-glla/state.json', '{\"state\":\"unchanged\"}\n');
    git('add', '.');
    git('commit', '-m', 'chore: create PathCast scope fixture');
    put('.omp/sdlc/run.json', `${JSON.stringify({
      schemaVersion: 1,
      projectRoot: fs.realpathSync(root),
      runId,
      issue: 108,
      branch: 'main',
      issues: [108],
      currentIssue: 108,
      currentStep: 'implement',
    }, null, 2)}\n`);
    put('.omp/sdlc/safe-recoveries.json', `${JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      owners: [{
        ownerId: runId,
        projectRoot: fs.realpathSync(root),
        issue: 108,
        branch,
        step: 'implement',
        status: 'incomplete',
      }],
      records: [],
    }, null, 2)}\n`);
    put('.omp/sdlc/handoffs/108-implement.json', '{\"status\":\"failed\"}\n');
    return { root, git };
  }

  test('reports exact PathCast 18/12/6 scope and preserves all observed bytes', () => {
    const f = pathCastFixture();
    const protectedPaths = [
      '.omp/sdlc/controller.lock',
      '.omp/sdlc/run.json',
      '.omp/sdlc/safe-recoveries.json',
      '.omp/sdlc/handoffs/108-implement.json',
      '.pi-glla/state.json',
      'steering/product.md',
      ...['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'].map((file) => `${spec}/${file}`),
    ];
    const snapshot = () => Object.fromEntries(protectedPaths.map((file) => {
      const absolute = path.join(f.root, file);
      if (!fs.existsSync(absolute)) return [file, null];
      const bytes = fs.readFileSync(absolute);
      return [file, { bytes: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') }];
    }));
    const before = snapshot();
    const calls = [];
    const run = (command, args, options) => {
      calls.push([command, ...args]);
      return spawnSync(command, args, { encoding: 'utf8', ...options });
    };

    const result = probePublicationScope({
      cwd: f.root,
      issue: 108,
      step: 'implement',
      spec,
      controllerRunId: runId,
      run,
    });

    expect(result.ownerId).toBe(runId);
    expect(result.binding.actualBranch).toBe(branch);
    expect(result.binding.discrepancies).toEqual([
      { field: 'branch', run: 'main', actual: branch, owner: branch },
    ]);
    expect(Object.keys(result.scope)).toEqual([
      'trackedWritablePaths',
      'untrackedEvidencePaths',
      'taskOperations',
      'readOnlyPaths',
      'allowedPaths',
    ]);
    expect(result.scope.trackedWritablePaths).toEqual(trackedPaths);
    expect(result.scope.untrackedEvidencePaths).toEqual(evidencePaths);
    expect(result.scope.taskOperations.find(({ taskId }) => taskId === 'T004').operations)
      .toContainEqual(expect.objectContaining({
        path: 'api/.artifacts/miledar-ip-guardrails/evidence.json',
        operation: 'Acquire',
      }));
    expect(result.scope.allowedPaths).toEqual([...trackedPaths, ...evidencePaths].sort());
    expect(result.scope.taskOperations).toHaveLength(4);
    expect(result.scope.readOnlyPaths).toEqual(expect.arrayContaining([
      `${spec}/requirements.md`,
      `${spec}/design.md`,
      `${spec}/tasks.md`,
      `${spec}/feature.gherkin`,
      'docs/release/miledar-ip-guardrails.schema.json',
    ]));
    expect(result.scope.allowedPaths.some((file) => file.startsWith(`${spec}/`))).toBe(false);
    expect(snapshot()).toEqual(before);
    expect(calls.some((call) => ['add', 'commit', 'push'].includes(call[1]))).toBe(false);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/controller.lock'))).toBe(false);

    const cli = spawnSync(process.execPath, [
      script,
      'probe',
      '--issue', '108',
      '--step', 'implement',
      '--spec', spec,
      '--controller-run-id', runId,
    ], { cwd: f.root, encoding: 'utf8' });
    expect({ status: cli.status, stderr: cli.stderr }).toEqual({ status: 0, stderr: '' });
    expect(JSON.parse(cli.stdout.trim().replace(/^NMG_SDLC_PUBLICATION: /, '')).scope.allowedPaths)
      .toEqual(result.scope.allowedPaths);
    expect(snapshot()).toEqual(before);
  });

  test('keeps task-relative duplicate provenance while writable authority wins', () => {
    const operations = parseDeliveryTaskFileLines([
      '### T001: Read then create',
      '**Read-only**: `src/shared.mjs`',
      '**File(s)**: `src/shared.mjs` (Create)',
      '**Type**: Create',
      '### T002: Modify again',
      '**File(s)**: `src/shared.mjs` (Modify), `src/shared.mjs` (Modify)',
      '**Type**: Modify',
    ].join('\n'), { structured: true });
    expect(operations).toHaveLength(2);
    expect(operations.flatMap((task) => task.operations).filter((item) => item.path === 'src/shared.mjs'))
      .toHaveLength(4);
    for (const note of ['Download tracked', 'Archive', 'Create / Modify', 'Create | Modify']) {
      expect(() => parseDeliveryTaskFileLines([
        '### T001: Unsupported',
        `**File(s)**: \`src/shared.mjs\` (${note})`,
      ].join('\n'), { structured: true })).toThrow(expect.objectContaining({
        reasonCode: 'publication_scope_unproven',
        taskId: 'T001',
      }));
    }
    expect(parseDeliveryTaskFileLines([
      '### T001: Ordinary note',
      '**File(s)**: `src/shared.mjs` (as needed)',
      '**Type**: Modify',
    ].join('\n'), { structured: true })[0].operations[0].operation).toBe('Modify');
    expect(() => parseDeliveryTaskFileLines([
      '### T001: Unsupported task type',
      '**File(s)**: `src/shared.mjs`',
      '**Type**: Archive',
    ].join('\n'), { structured: true })).toThrow(expect.objectContaining({
      reasonCode: 'publication_scope_unproven',
      taskId: 'T001',
    }));
    expect(parseDeliveryTaskFileLines([
      '### T001: Explicit path override',
      '**File(s)**: `src/shared.mjs` (Create)',
      '**Type**: Archive',
    ].join('\n'), { structured: true })[0].operations[0].operation).toBe('Create');
  });

  test('rejects missing or mismatched owner-bound inputs without creating state', () => {
    const f = pathCastFixture();
    const recovery = fs.readFileSync(path.join(f.root, '.omp/sdlc/safe-recoveries.json'));
    expect(() => probePublicationScope({
      cwd: f.root,
      issue: 108,
      step: 'implement',
      spec,
      controllerRunId: 'foreign-run',
    })).toThrow('recovery_owner_ambiguous');
    expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/safe-recoveries.json'))).toEqual(recovery);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/controller.lock'))).toBe(false);
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
    const publication = (action, identity, subject) => spawnSync(process.execPath, [
      script, action, '--issue', '42', '--step', 'implement', '--spec', spec,
      '--controller-run-id', identity,
      ...(subject === null ? [] : ['--subject', subject]),
    ], { cwd: f.root, encoding: 'utf8' });
    const bind = (identity = runId, subject = 'fix: validate implementation subject before publication for #42') =>
      publication('bind', identity, subject);
    const reconcile = (identity = runId, subject = 'fix: validate implementation subject before publication for #42') =>
      publication('reconcile', identity, subject);
    return { ...f, bind, reconcile };
  }

  test('bind accepts approved plain and quoted File(s) lists without granting notes or out-of-task paths', () => {
    const f = cliFixture();
    f.put(`${spec}/tasks.md`, `**Issue**: #42
**Status**: Approved

### T001: Add opt-in composed-greeting brackets

**File(s)**: src/nmg_sdlc_smoke/cli.py
**Type**: Modify

### T002: Cover enabled composition and omitted preservation

**File(s)**: tests/features/add_nmg_smoke_brackets_flag.feature; tests/features/steps/test_brackets_steps.py
**Type**: Create

### T003: Document the flag and verify delivery behavior

**File(s)**: README.md; CHANGELOG.md; VERSION (delivery owner only)
**Type**: Modify

### T004: Preserve quoted declarations

**File(s)**: \`src/code.mjs\` (see \`notes.txt\`; not authority), \`deleted.txt\` (remove)
**Notes**: \`prose.txt\`

### T000: Not an admitted task identifier

**File(s)**: unowned.txt

## Execution Boundary

**File(s)**: outside.txt
`);
    for (const file of ['VERSION', 'notes.txt', 'prose.txt', 'unowned.txt', 'outside.txt']) f.put(file, 'not implementation authority\n');
    const result = f.bind();
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    const publication = JSON.parse(result.stdout.trim().replace(/^NMG_SDLC_PUBLICATION: /, ''));
    expect(publication.scope.allowedPaths).toEqual([
      'CHANGELOG.md', 'README.md', 'deleted.txt', 'src/code.mjs', 'src/nmg_sdlc_smoke/cli.py',
      'tests/features/add_nmg_smoke_brackets_flag.feature', 'tests/features/steps/test_brackets_steps.py',
    ].sort());
    expect(reconcileStagePublication({
      cwd: f.root, issue: 42, step: 'implement', ownerId: runId,
      expectedSubject: 'feat: add brackets #42', allowedPaths: publication.scope.allowedPaths, run: f.run,
    })).toMatchObject({ passed: false });
    expect(f.state().records).toEqual([]);
  });

  test('accepts the clean subjectless initial implement bind', () => {
    const f = cliFixture();
    f.git('add', '--', spec);
    f.git('commit', '-m', 'docs: approve publication fixture #42');
    f.git('push');
    expect(f.git('status', '--porcelain=v1')).toBe('');

    const initial = f.bind(runId, null);
    expect({ status: initial.status, stderr: initial.stderr }).toEqual({ status: 0, stderr: '' });
    expect(JSON.parse(initial.stdout.trim().replace(/^NMG_SDLC_PUBLICATION: /, ''))).toMatchObject({
      passed: true, ownerId: runId,
    });
  });

  test('rejects dirty missing, wrong, and non-boundary issue identifiers before publication', () => {
    const f = cliFixture();
    expect(f.git('status', '--porcelain=v1')).not.toBe('');
    const head = f.git('rev-parse', 'HEAD');
    const upstream = f.git('rev-parse', '@{upstream}');
    for (const subject of [
      null,
      'fix: validate implementation subject before publication',
      'fix: validate implementation subject before publication for #43',
      'fix: validate implementation subject before publication for #420',
      'not-a-conventional-subject #42',
      ' fix: validate implementation subject before publication for #42',
      'fix: validate implementation subject before publication for #42 ',
      'fix: validate implementation subject before publication for #42\nbody',
      'fix: validate implementation subject before publication for #42\rbody',
    ]) {
      const rejected = f.bind(runId, subject);
      expect({ status: rejected.status, stdout: rejected.stdout, stderr: rejected.stderr }).toEqual({
        status: 1, stdout: '', stderr: 'publication_subject_unproven\n',
      });
      expect(fs.existsSync(f.statePath)).toBe(false);
      expect(f.git('rev-parse', 'HEAD')).toBe(head);
      expect(f.git('rev-parse', '@{upstream}')).toBe(upstream);
      expect(f.git('diff', '--cached')).toBe('');
    }

    const accepted = f.bind();
    expect({ status: accepted.status, stderr: accepted.stderr }).toEqual({ status: 0, stderr: '' });
    expect(JSON.parse(accepted.stdout.trim().replace(/^NMG_SDLC_PUBLICATION: /, ''))).toMatchObject({
      passed: true, ownerId: runId,
    });
  });

  test('rejects an already-staged implement bind before publication', () => {
    const f = cliFixture();
    f.put('src/code.mjs', 'staged implementation\n');
    f.git('add', '--', 'src/code.mjs');
    const head = f.git('rev-parse', 'HEAD');
    const upstream = f.git('rev-parse', '@{upstream}');

    const rejected = f.bind(runId, 'fix: validate implementation subject before publication #42');
    expect({ status: rejected.status, stdout: rejected.stdout, stderr: rejected.stderr }).toEqual({
      status: 1, stdout: '', stderr: 'publication_subject_unproven\n',
    });
    expect(fs.existsSync(f.statePath)).toBe(false);
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
    expect(f.git('rev-parse', '@{upstream}')).toBe(upstream);
    expect(f.git('diff', '--cached', '--name-only')).toBe('src/code.mjs');
  });

  test('binds the planned implement subject to later reconciliation', () => {
    const f = cliFixture();
    f.git('add', '--', spec);
    f.git('commit', '-m', 'docs: approve publication fixture #42');
    f.git('push');
    f.put('src/code.mjs', 'planned implementation\n');
    const planned = 'fix: publish the planned implementation for #42';

    const accepted = f.bind(runId, planned);
    expect({ status: accepted.status, stderr: accepted.stderr }).toEqual({ status: 0, stderr: '' });
    expect(f.state().owners).toEqual([
      expect.objectContaining({ ownerId: runId, plannedSubject: planned }),
    ]);
    f.git('add', '--', 'src/code.mjs');
    f.git('commit', '-m', planned);

    const rejected = f.reconcile(runId, 'fix: substitute a different implementation for #42');
    expect({ status: rejected.status, stdout: rejected.stdout, stderr: rejected.stderr }).toEqual({
      status: 1, stdout: '', stderr: 'publication_subject_unproven\n',
    });
    expect(f.git('rev-parse', 'refs/heads/42-feature')).not.toBe(f.git('rev-parse', 'refs/remotes/origin/42-feature'));
  });

  test.each([
    'src/code.mjs; ../escape.txt',
    '`src/code.mjs`; `../escape.txt`',
    'src/code.mjs; update unrelated.txt',
    'src/code.mjs; notes',
    'src/code.mjs (unclosed',
    '`src/code.mjs',
    'src/code.mjs;; unrelated.txt',
    'src/code.mjs; .omp/sdlc/run.json',
  ])('bind rejects ambiguous or unsafe declarations: %s', (files) => {
    const f = cliFixture();
    f.put(`${spec}/tasks.md`, `**Issue**: #42\n**Status**: Approved\n\n### T001: Changes\n\n**File(s)**: ${files}\n`);
    const result = f.bind();
    expect(result.status).toBe(1);
    expect(result.stderr.split('\n')[0]).toBe('publication_scope_unproven');
    expect(result.stderr).toContain(`spec: ${spec}/tasks.md`);
    expect(result.stderr).toContain('taskId: T001');
    expect(result.stderr).toContain(`entry: ${files}`);
    expect(result.stderr).toContain(`syntax: ${PUBLICATION_FILE_SYNTAX}`);
    expect(fs.existsSync(f.statePath)).toBe(false);
  });

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
