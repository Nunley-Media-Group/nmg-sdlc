import { afterEach, describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertInitialStagePublication,
  publicationPathDenied,
  reconcileStagePublication,
  resolveRecoveryOwner,
} from '../sdlc-safe-recoveries.mjs';

const roots = [];
const report = 'specs/42-feature/verification-report.md';
const subject = 'docs: record verification for #42';

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-publication-'));
  roots.push(root);
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  fs.mkdirSync(work);
  const git = (cwd, ...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git(root, 'init', '--bare', remote);
  git(work, 'init', '-b', '42-feature');
  git(work, 'config', 'user.name', 'Fixture');
  git(work, 'config', 'user.email', 'fixture@example.test');
  const put = (file, content) => {
    const target = path.join(work, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  put('.gitignore', '.nmg-sdlc/\n');
  put(report, 'initial\n');
  git(work, 'add', '.');
  git(work, 'commit', '-m', 'chore: initialize');
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'push', '-u', 'origin', '42-feature');
  const calls = [];
  const run = (command, args, options) => {
    calls.push([command, ...args]);
    return spawnSync(command, args, { encoding: 'utf8', ...options });
  };
  const publish = () => reconcileStagePublication({
    cwd: work, issue: 42, step: 'verify', expectedSubject: subject, allowedPaths: [report], run,
  });
  return { root, work, remote, git: (...args) => git(work, ...args), put, run, calls, publish };
}

describe('live publication evidence', () => {
  test('a malformed stale run and consumed ledger cannot veto an exact-head publication or acknowledgment', () => {
    const f = fixture();
    f.put('.nmg-sdlc/run.json', '{bad');
    f.put('.nmg-sdlc/safe-recoveries.json', '{bad');
    expect(resolveRecoveryOwner({ cwd: f.work, issue: 42, step: 'verify', run: f.run }))
      .toBe('42:42-feature:verify');
    expect(() => assertInitialStagePublication({ cwd: f.work, issue: 42, step: 'verify', run: f.run }))
      .not.toThrow();
    f.put(report, 'verified result\n');
    f.git('add', report);
    f.git('commit', '-m', subject);
    expect(f.publish()).toMatchObject({ passed: true, pushed: true });
    const head = f.git('rev-parse', 'HEAD');
    expect(f.git('rev-parse', 'origin/42-feature')).toBe(head);
    f.calls.length = 0;
    expect(f.publish()).toMatchObject({ passed: true, ack: true });
    expect(f.calls.some(([command, operation]) => command === 'git' && operation === 'push')).toBe(false);
  });

  test('failed push acknowledgment reconciles from remote without a second push', () => {
    const f = fixture();
    f.put(report, 'new report\n');
    f.git('add', report);
    f.git('commit', '-m', subject);
    f.git('push', 'origin', 'HEAD:refs/heads/42-feature');
    f.calls.length = 0;
    expect(f.publish()).toMatchObject({ passed: true, ack: true });
    expect(f.calls.some(([command, operation]) => command === 'git' && operation === 'push')).toBe(false);
  });

  test('rejects a commit that edits outside approved publication paths', () => {
    const f = fixture();
    f.put(report, 'new report\n');
    f.put('src/unapproved.js', 'export const value = 1;\n');
    f.git('add', report, 'src/unapproved.js');
    f.git('commit', '-m', subject);
    expect(f.publish()).toMatchObject({ passed: false });
    expect(f.git('rev-parse', 'origin/42-feature')).not.toBe(f.git('rev-parse', 'HEAD'));
  });

  test('approved spec input and runtime receipt paths remain denied', () => {
    expect(publicationPathDenied('specs/42-feature/requirements.md', {
      spec: 'specs/42-feature', readOnlyPaths: ['specs/42-feature/requirements.md'],
    })).toBe(true);
    expect(publicationPathDenied('.nmg-sdlc/run.json', { spec: 'specs/42-feature' })).toBe(true);
    for (const file of ['.nmg-sdlc', '.nmg-sdlc/', '.nmg-sdlc/plans/steering-update.plan.json',
      '.nmg-sdlc/handoffs/42-implement.json', '.nmg-sdlc/verification/42.json']) {
      expect(publicationPathDenied(file, { spec: 'specs/42-feature' })).toBe(true);
    }
    expect(publicationPathDenied('src/nmg-sdlc/runtime.mjs', { spec: 'specs/42-feature' })).toBe(false);
    expect(publicationPathDenied('.nmg-sdlc-notes.md', { spec: 'specs/42-feature' })).toBe(false);
  });
});

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-safe-recoveries.mjs');
const spec = 'specs/42-parser';
const fixSubject = 'fix: repair the parser (#42)';

// A bare origin whose HEAD names main, and an issue branch with a pushed fix commit.
function mergeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-integration-'));
  roots.push(root);
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  fs.mkdirSync(work);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: work, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const put = (file, content) => {
    const target = path.join(work, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  spawnSync('git', ['init', '--bare', '--initial-branch=main', remote], { encoding: 'utf8' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.test');
  put('.gitignore', '.nmg-sdlc/\n');
  for (const file of ['requirements.md', 'design.md', 'feature.gherkin']) {
    put(`${spec}/${file}`, '**Issue**: #42\n**Status**: Approved\n');
  }
  put(`${spec}/tasks.md`, '**Issue**: #42\n**Status**: Approved\n\n### T001: Fix the parser\n\n'
    + '**File(s)**: `src/app.js`\n**Type**: Modify\n**Depends**: none\n**Acceptance**:\n- parses\n');
  put('src/app.js', 'export const value = 0;\n');
  git('add', '.');
  git('commit', '-m', 'chore: initialize');
  git('remote', 'add', 'origin', remote);
  git('push', '-u', 'origin', 'main');
  git('remote', 'set-head', 'origin', '-a');
  git('checkout', '-b', '42-parser');
  put('src/app.js', 'export const value = 1;\n');
  git('commit', '-am', fixSubject);
  git('push', '-u', 'origin', '42-parser');
  const advanceMain = (files) => {
    git('checkout', 'main');
    for (const [file, content] of Object.entries(files)) put(file, content);
    git('add', '.');
    git('commit', '-m', 'feat: another change (#77)');
    git('push', 'origin', 'main');
    git('checkout', '42-parser');
    git('fetch', 'origin');
  };
  const cli = (action, subject = fixSubject) => spawnSync(process.execPath, [
    script, action, '--issue', '42', '--step', 'implement', '--spec', spec, '--subject', subject,
  ], { cwd: work, encoding: 'utf8' });
  const reconcile = (allowedPaths) => reconcileStagePublication({
    cwd: work, issue: 42, step: 'implement', spec, expectedSubject: fixSubject, allowedPaths,
  });
  return { work, git, put, advanceMain, cli, reconcile };
}

describe('integration merges of the default branch', () => {
  test.each([
    ['brings in another issue\'s spec directory', { 'specs/77-other/design.md': 'other\n' }],
    ['brings in no spec files', { 'docs/other.md': 'other\n' }],
  ])('@SCN001 reconcile passes for a pushed merge-of-main tip that %s', (_, files) => {
    const f = mergeFixture();
    f.advanceMain(files);
    f.git('merge', '--no-edit', 'origin/main');
    f.git('push');
    const result = f.cli('reconcile');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"passed":true');
    expect(result.stdout).toContain('"ack":true');
  });

  test('@SCN001 reconcile pushes an unpushed merge-of-main tip without an issue-subject commit', () => {
    const f = mergeFixture();
    f.advanceMain({ 'specs/77-other/design.md': 'other\n' });
    f.git('merge', '--no-edit', 'origin/main');
    expect(f.reconcile(['src/app.js'])).toMatchObject({ passed: true, pushed: true });
    expect(f.git('rev-parse', 'origin/42-parser')).toBe(f.git('rev-parse', 'HEAD'));
  });

  test('@SCN002 bind checks only the diff from the merged-in main commit during the merge', () => {
    const f = mergeFixture();
    f.advanceMain({ 'specs/77-other/design.md': 'other\n', 'specs/77-other/tasks.md': 'other\n' });
    f.git('merge', '--no-commit', '--no-ff', 'origin/main');
    expect(f.git('diff', '--cached', '--name-only')).toContain('specs/77-other/design.md');
    f.put('src/app.js', 'export const value = 2;\n');
    f.git('add', 'src/app.js');
    const bind = f.cli('bind');
    expect(bind.stderr).toBe('');
    expect(bind.status).toBe(0);
    f.git('commit', '--no-edit');
    f.git('push');
    expect(f.git('log', '-1', '--first-parent', '--no-merges', '--format=%s', 'HEAD')).toBe(fixSubject);
    expect(f.cli('reconcile').status).toBe(0);
  });

  test('@SCN003 bind refuses a merge whose result edits another issue\'s spec not on main', () => {
    const f = mergeFixture();
    f.advanceMain({ 'specs/77-other/design.md': 'other\n' });
    f.git('merge', '--no-commit', '--no-ff', 'origin/main');
    f.put('specs/88-another/design.md', 'edited\n');
    const bind = f.cli('bind');
    expect(bind.status).toBe(1);
    expect(bind.stderr).toContain('publication_scope_unproven');
    expect(bind.stderr).toContain('specs/88-another/design.md');
  });

  test('@SCN003 reconcile refuses a merge whose result edits this issue\'s Approved requirements', () => {
    const f = mergeFixture();
    f.advanceMain({ 'docs/other.md': 'other\n' });
    f.git('merge', '--no-commit', '--no-ff', 'origin/main');
    f.put(`${spec}/requirements.md`, '**Issue**: #42\n**Status**: Approved\nedited\n');
    f.git('add', `${spec}/requirements.md`);
    f.git('commit', '--no-edit');
    expect(f.reconcile(['src/app.js'])).toMatchObject({
      passed: false, summary: 'Publication commit exceeds approved scope',
    });
    const result = f.cli('reconcile');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('publication_scope_unproven');
    expect(f.git('rev-parse', 'origin/42-parser')).not.toBe(f.git('rev-parse', 'HEAD'));
  });

  test('a merge of a non-default branch is refused by reconcile and bind', () => {
    const f = mergeFixture();
    f.git('checkout', '-b', 'side', 'main');
    f.put('side.txt', 'side\n');
    f.git('add', 'side.txt');
    f.git('commit', '-m', 'chore: side work');
    f.git('checkout', '42-parser');
    f.git('merge', '--no-commit', '--no-ff', 'side');
    expect(f.cli('bind').stderr).toContain('publication_scope_unproven');
    f.git('commit', '--no-edit');
    expect(f.reconcile(['side.txt', 'src/app.js'])).toMatchObject({
      passed: false, summary: 'Publication merge is not an integration of the default branch',
    });
  });

  test('a branch without merges keeps its bind and reconcile outcomes', () => {
    const f = mergeFixture();
    expect(f.cli('reconcile').status).toBe(0);
    expect(f.cli('reconcile', 'fix: another subject (#42)').status).toBe(1);
    f.put('src/app.js', 'export const value = 3;\n');
    expect(f.cli('bind').status).toBe(0);
    f.git('add', 'src/app.js');
    const staged = f.cli('bind');
    expect(staged.status).toBe(1);
    expect(staged.stderr).toContain('publication_subject_unproven');
  });

  test('write-code reads the implement subject from the latest first-parent non-merge commit', () => {
    const workflow = fs.readFileSync(
      path.join(path.dirname(script), '..', 'workflows', 'write-code', 'WORKFLOW.md'), 'utf8');
    expect(workflow).toContain('Read the exact existing stage subject with `git log -1 --first-parent --no-merges --format=%s HEAD`');
  });
});

describe('@SCN001 commit-merge concludes a resolved integration merge', () => {
  const commitMerge = (f, extra = []) => spawnSync(process.execPath, [
    script, 'commit-merge', '--issue', '42', '--step', 'implement', '--spec', spec, ...extra,
  ], { cwd: f.work, encoding: 'utf8' });
  // Merges origin/main, which changed src/app.js again, into the branch's own edit of the same line.
  const conflictedMerge = (f) => {
    f.advanceMain({ 'src/app.js': 'export const value = 5;\n' });
    const merged = spawnSync('git', ['merge', '--no-commit', '--no-ff', 'origin/main'], { cwd: f.work, encoding: 'utf8' });
    expect(merged.status).not.toBe(0);
    expect(f.git('ls-files', '-u')).not.toBe('');
  };

  test('commits the resolved merge with the default branch as its second parent', () => {
    const f = mergeFixture();
    conflictedMerge(f);
    f.put('src/app.js', 'export const value = 6;\n');
    f.git('add', 'src/app.js');
    const before = f.git('rev-parse', 'HEAD');
    const result = commitMerge(f);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const head = f.git('rev-parse', 'HEAD');
    expect(head).not.toBe(before);
    expect(f.git('rev-parse', 'HEAD^1')).toBe(before);
    expect(f.git('rev-parse', 'HEAD^2')).toBe(f.git('rev-parse', 'origin/main'));
    expect(result.stdout).toContain('NMG_SDLC_PUBLICATION: ');
    expect(result.stdout).toContain('"passed":true');
    expect(result.stdout).toContain(`"commit":"${head}"`);
  });

  test('refuses an unresolved merge without committing', () => {
    const f = mergeFixture();
    conflictedMerge(f);
    const before = f.git('rev-parse', 'HEAD');
    const result = commitMerge(f);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('merge_unresolved');
    expect(f.git('rev-parse', 'HEAD')).toBe(before);
  });

  test('refuses when no merge is in progress without committing', () => {
    const f = mergeFixture();
    const before = f.git('rev-parse', 'HEAD');
    const result = commitMerge(f);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('merge_not_in_progress');
    expect(f.git('rev-parse', 'HEAD')).toBe(before);
  });

  test('refuses an untracked non-runtime file beside a resolved merge', () => {
    const f = mergeFixture();
    conflictedMerge(f);
    f.put('src/app.js', 'export const value = 6;\n');
    f.git('add', 'src/app.js');
    f.put('src/scratch.js', 'unstaged\n');
    const before = f.git('rev-parse', 'HEAD');
    const result = commitMerge(f);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('merge_unstaged');
    expect(f.git('rev-parse', 'HEAD')).toBe(before);
  });

  test('refuses a resolution that edits an approved spec input and names the entry', () => {
    const f = mergeFixture();
    conflictedMerge(f);
    f.put('src/app.js', 'export const value = 6;\n');
    f.put(`${spec}/requirements.md`, '**Issue**: #42\n**Status**: Approved\nedited\n');
    f.git('add', 'src/app.js', `${spec}/requirements.md`);
    const result = commitMerge(f);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('publication_scope_unproven');
    expect(result.stderr).toContain(`entry: ${spec}/requirements.md`);
  });

  test('refuses a merge of a branch other than the default branch', () => {
    const f = mergeFixture();
    f.git('checkout', '-b', 'side', 'main');
    f.put('side.txt', 'side\n');
    f.git('add', 'side.txt');
    f.git('commit', '-m', 'chore: side work');
    f.git('checkout', '42-parser');
    f.git('merge', '--no-commit', '--no-ff', 'side');
    const result = commitMerge(f);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('publication_scope_unproven');
  });

  test('rejects a --subject argument with a usage error', () => {
    const f = mergeFixture();
    expect(commitMerge(f, ['--subject', fixSubject]).status).toBe(2);
  });
});
