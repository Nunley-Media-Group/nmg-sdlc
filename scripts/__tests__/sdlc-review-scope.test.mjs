import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { finalizeReview, initReview, reviewScope as reviewScopeOfReview } from '../sdlc-review.mjs';
import { reviewScope } from '../sdlc-review-scope.mjs';

jest.setTimeout(60_000);

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-review-scope.mjs');
const SPEC = 'specs/42-example';
const RECORD = '.nmg-sdlc/verification/42-review.json';
const USAGE = 'Usage: node scripts/sdlc-review-scope.mjs --issue N\n';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}
function commit(cwd, files, message) {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), content);
  }
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

const HEADER = '**Issue**: #42\n**Status**: Approved\n\n';

/** A project on issue branch `42-example`, one implementation commit (src/app.js, src/util.js) ahead of `main`. */
function project() {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-review-scope-')));
  roots.push(cwd);
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'user.email', 'test@example.com');
  commit(cwd, {
    '.gitignore': '.nmg-sdlc/\n',
    'README.md': 'main\n',
    'src/app.js': 'export const app = 1;\n',
    'src/other.js': 'export const other = 1;\n',
    [`${SPEC}/requirements.md`]: `${HEADER}# Requirements\n\n### AC1: The widget saves\n\n### AC2: The widget reports a failed save\n\n| ID | Requirement | Priority |\n|----|-------------|----------|\n| FR1 | Persist widget settings | Must |\n`,
    [`${SPEC}/design.md`]: `${HEADER}# Design\n\n## Error handling\n\n- Disk full on save\n`,
    [`${SPEC}/tasks.md`]: `${HEADER}### T001: Save the widget\n\n**File(s)**: \`src/app.js\`\n`,
    [`${SPEC}/feature.gherkin`]: `${HEADER}Feature: Widget\n  Scenario: Save\n    Given a widget\n    When it is saved\n    Then its settings persist\n`,
  }, 'main');
  git(cwd, 'checkout', '-b', '42-example');
  const head = commit(cwd, { 'src/app.js': 'export const app = 2;\n', 'src/util.js': 'export const util = 1;\n' }, 'feat: implement the widget save (#42)');
  return { cwd, head };
}

const finding = (id, extra = {}) => ({ id, severity: 'blocking', lens: 'acceptance', files: ['src/app.js'], summary: `${id} summary`, ...extra });

/**
 * Runs a real review at the current head: `initReview`, a verdict on every row as a reviewer would record it, then
 * `edit`, then `finalizeReview`. Returns the reviewed head and the finalizer's outcome.
 */
function review(cwd, edit = () => {}) {
  const { record } = initReview({ issue: 42, spec: SPEC, cwd, restart: true });
  for (const row of record.rows) {
    if (row.verdict !== null) continue;
    Object.assign(row, { verdict: 'pass', evidence: `${row.id} checked against the code` }, row.kind === 'acceptance' ? { exercised: 'real_entry_point' } : {});
  }
  for (const lens of record.lenses) Object.assign(lens, { status: 'complete', summary: `${lens.id} reviewed` });
  edit(record);
  fs.writeFileSync(path.join(cwd, RECORD), `${JSON.stringify(record, null, 2)}\n`);
  const outcome = finalizeReview({ issue: 42, spec: SPEC, cwd });
  expect(outcome.handoff).not.toBeNull();
  return { head: record.headSha, outcome };
}
/** A review that returned findings at the current head. */
function reviewWithFindings(cwd, findings = [finding('F1')]) {
  const reviewed = review(cwd, (record) => { record.findings.push(...findings); });
  expect(reviewed.outcome).toMatchObject({ status: 1, handoff: { status: 'failed', reasonCode: 'review_findings', next: 'implement' } });
  return reviewed.head;
}
const scope = (cwd) => reviewScope({ issue: 42, cwd });
const cli = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

describe('reviewScope (#551 AC16, FR27)', () => {
  it('is the review module\'s helper, re-exported by the scope script', () => {
    expect(reviewScope).toBe(reviewScopeOfReview);
  });

  it('is full when no review was recorded for the issue', () => {
    const { cwd } = project();
    expect(scope(cwd)).toEqual({ mode: 'full' });
    expect(fs.existsSync(path.join(cwd, '.nmg-sdlc'))).toBe(false);
  });

  it('is full when the stored record is unreadable or belongs to another issue', () => {
    const { cwd } = project();
    fs.mkdirSync(path.join(cwd, '.nmg-sdlc/verification'), { recursive: true });
    fs.writeFileSync(path.join(cwd, RECORD), '{not json');
    expect(scope(cwd)).toEqual({ mode: 'full' });
    reviewWithFindings(cwd);
    commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: repair F1 (#42)');
    expect(scope(cwd).mode).toBe('scoped');
    expect(reviewScope({ issue: 43, cwd })).toEqual({ mode: 'full' });
  });

  it('is full after a prior review that passed with no findings, even when a later commit stays inside the reviewed files', () => {
    const { cwd, head } = project();
    const reviewed = review(cwd);
    expect(reviewed).toMatchObject({ head, outcome: { status: 0, handoff: { status: 'passed' } } });
    expect(scope(cwd)).toEqual({ mode: 'full' });
    commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: a later change (#42)');
    expect(scope(cwd)).toEqual({ mode: 'full' });
  });

  it('is scoped to the prior findings and the repair diff when the repair touches only the findings\' files', () => {
    const { cwd, head } = project();
    const findings = [finding('F1'), finding('F2', { severity: 'major', lens: 'failure-paths', files: ['src/util.js'], rows: ['AC2'] })];
    const prior = reviewWithFindings(cwd, findings);
    expect(prior).toBe(head);
    commit(cwd, { 'src/util.js': 'export const util = 2;\n' }, 'fix: repair F2 (#42)');
    commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: repair F1 (#42)');

    const result = scope(cwd);

    expect(result).toEqual({
      mode: 'scoped',
      priorHead: head,
      findings: [{ ...findings[0], rows: [] }, findings[1]],
      repairPaths: ['src/app.js', 'src/util.js'],
    });
    // Reading the scope changes nothing: the stored review is still the one finalized at H.
    expect(JSON.parse(fs.readFileSync(path.join(cwd, RECORD), 'utf8'))).toMatchObject({ headSha: head, status: 'findings', mode: 'full' });
    expect(git(cwd, 'status', '--porcelain')).toBe('');
  });

  it('counts a path below a directory a finding names as inside the findings\' files', () => {
    const { cwd, head } = project();
    reviewWithFindings(cwd, [finding('F1', { files: ['src/'] })]);
    commit(cwd, { 'src/nested/new.js': 'export const added = 1;\n' }, 'fix: repair F1 (#42)');
    expect(scope(cwd)).toMatchObject({ mode: 'scoped', priorHead: head, repairPaths: ['src/nested/new.js'] });
  });

  it('is full, naming the outside paths, when the repair touches a file outside the findings\' files', () => {
    const { cwd, head } = project();
    reviewWithFindings(cwd);
    commit(cwd, { 'src/app.js': 'export const app = 3;\n', 'src/other.js': 'export const other = 2;\n', 'docs/guide.md': 'guide\n' }, 'fix: repair F1 and more (#42)');

    // src/other.js exists on main and src/util.js was part of the reviewed change: neither is one of the findings' files.
    expect(scope(cwd)).toEqual({ mode: 'full', priorHead: head, outsidePaths: ['docs/guide.md', 'src/other.js'] });
    commit(cwd, { 'src/util.js': 'export const util = 2;\n' }, 'fix: also util (#42)');
    expect(scope(cwd)).toEqual({ mode: 'full', priorHead: head, outsidePaths: ['docs/guide.md', 'src/other.js', 'src/util.js'] });
  });

  it('judges a failing row that no finding names against the files the prior review covered', () => {
    const { cwd, head } = project();
    const reviewed = review(cwd, (record) => {
      Object.assign(record.rows.find((row) => row.id === 'AC2'), { verdict: 'fail', evidence: 'AC2 does not hold' });
    });
    expect(reviewed.outcome).toMatchObject({ status: 1, handoff: { reasonCode: 'review_findings' } });
    commit(cwd, { 'src/util.js': 'export const util = 2;\n' }, 'fix: make AC2 hold (#42)');

    expect(scope(cwd)).toEqual({
      mode: 'scoped', priorHead: head, repairPaths: ['src/util.js'],
      findings: [{ id: 'row:AC2', lens: 'acceptance', severity: 'blocking', rows: ['AC2'], files: [], summary: 'AC2 is fail: AC2 does not hold' }],
    });
    commit(cwd, { 'README.md': 'changed\n' }, 'docs: readme (#42)');
    expect(scope(cwd)).toEqual({ mode: 'full', priorHead: head, outsidePaths: ['README.md'] });
  });

  it('leaves controller commits and merges of the default branch out of the repair diff', () => {
    const { cwd, head } = project();
    reviewWithFindings(cwd);
    commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: repair F1 (#42)');
    commit(cwd, { [`${SPEC}/verification-report.md`]: '# Report\n' }, 'docs: record verification for #42');
    commit(cwd, { VERSION: '1.1.0\n' }, 'feat: deliver issue #42');
    git(cwd, 'revert', '--no-edit', 'HEAD');
    git(cwd, 'checkout', '--quiet', 'main');
    commit(cwd, { 'src/other.js': 'export const other = 9;\n', 'elsewhere.txt': 'merged elsewhere\n' }, 'feat: another issue (#9)');
    git(cwd, 'checkout', '--quiet', '42-example');
    git(cwd, 'merge', '--no-edit', 'main');

    expect(scope(cwd)).toEqual({ mode: 'scoped', priorHead: head, findings: [{ ...finding('F1'), rows: [] }], repairPaths: ['src/app.js'] });
  });

  it('is full when the prior review\'s head is not an ancestor of HEAD', () => {
    const { cwd, head } = project();
    reviewWithFindings(cwd);
    // The reviewed commit is rewritten, so H is no longer in the branch's history although only src/app.js changed.
    fs.writeFileSync(path.join(cwd, 'src/app.js'), 'export const app = 3;\n');
    git(cwd, 'commit', '--amend', '-a', '--no-edit');
    expect(git(cwd, 'rev-parse', 'HEAD')).not.toBe(head);
    expect(spawnSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], { cwd }).status).toBe(1);

    expect(scope(cwd)).toEqual({ mode: 'full' });
  });

  it('is full when the prior record carries no usable head or Git cannot list the repair', () => {
    const { cwd, head } = project();
    reviewWithFindings(cwd);
    commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: repair F1 (#42)');
    const real = (command, args, options) => spawnSync(command, args, { encoding: 'utf8', ...options });
    const failing = (subcommand) => (command, args, options) => (args[0] === subcommand ? { status: 128, stdout: '', stderr: 'fatal' } : real(command, args, options));
    expect(reviewScope({ issue: 42, cwd, run: real }).mode).toBe('scoped');
    expect(reviewScope({ issue: 42, cwd, run: failing('log') })).toEqual({ mode: 'full' });
    expect(reviewScope({ issue: 42, cwd, run: failing('diff-tree') })).toEqual({ mode: 'full' });

    const record = JSON.parse(fs.readFileSync(path.join(cwd, RECORD), 'utf8'));
    fs.writeFileSync(path.join(cwd, RECORD), JSON.stringify({ ...record, headSha: head.slice(0, 12) }));
    expect(scope(cwd)).toEqual({ mode: 'full' });
  });
});

describe('sdlc-review-scope.mjs command line', () => {
  it('prints the scoped result as JSON and exits 0', () => {
    const { cwd, head } = project();
    reviewWithFindings(cwd);
    commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: repair F1 (#42)');

    const result = cli(cwd, '--issue', '42');

    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(JSON.parse(result.stdout)).toEqual({ mode: 'scoped', priorHead: head, findings: [{ ...finding('F1'), rows: [] }], repairPaths: ['src/app.js'] });
    expect(result.stdout).toBe(`${JSON.stringify(scope(cwd), null, 2)}\n`);
    // `#N` names the same issue.
    expect(cli(cwd, '--issue', '#42').stdout).toBe(result.stdout);
  });

  it('prints a full result naming the outside paths, and a bare full result without a prior review, and exits 0', () => {
    const { cwd, head } = project();
    expect(cli(cwd, '--issue', '42')).toMatchObject({ status: 0, stdout: `${JSON.stringify({ mode: 'full' }, null, 2)}\n`, stderr: '' });
    reviewWithFindings(cwd);
    commit(cwd, { 'src/other.js': 'export const other = 2;\n' }, 'fix: somewhere else (#42)');

    const result = cli(cwd, '--issue', '42');

    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(JSON.parse(result.stdout)).toEqual({ mode: 'full', priorHead: head, outsidePaths: ['src/other.js'] });
  });

  it.each([
    ['no arguments', []],
    ['a missing issue number', ['--issue']],
    ['issue zero', ['--issue', '0']],
    ['a non-numeric issue', ['--issue', 'abc']],
    ['a leading zero', ['--issue', '042']],
    ['an unknown option', ['--pr', '42']],
    ['an extra argument', ['--issue', '42', '--spec', SPEC]],
    ['a bare number', ['42']],
  ])('exits 2 with the usage line on %s', (_case, args) => {
    const { cwd } = project();
    expect(cli(cwd, ...args)).toMatchObject({ status: 2, stdout: '', stderr: USAGE });
  });
});
