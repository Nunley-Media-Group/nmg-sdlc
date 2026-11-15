import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXERCISED,
  REVIEW_LENSES,
  REVIEW_SEVERITIES,
  REVIEW_VERDICTS,
  checklistRows,
  designPaths,
  finalizeReview,
  initReview,
  readReview,
  repairPathsSince,
  repairScope,
  reviewFindings,
  reviewRecordPath,
  reviewSummaryPath,
} from '../sdlc-review.mjs';

jest.setTimeout(60_000);

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-review.mjs');
const SPEC = 'specs/42-example';
const RECORD = '.nmg-sdlc/verification/42-review.json';
const SUMMARY = '.nmg-sdlc/verification/42-review.md';
const HANDOFF = '.nmg-sdlc/handoffs/42-verify.json';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tryGit(cwd, ...args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}
function git(cwd, ...args) {
  const result = tryGit(cwd, ...args);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}
const run = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', ...options });
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
const REQUIREMENTS = `# Requirements

## Acceptance Criteria

### AC1: The widget saves its settings

Given a widget, when it is saved, then its settings persist.

### AC2: The widget reports a failed save

Given a full disk, when the widget is saved, then it reports the failure.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Persist widget settings | Must |
| FR2 | Report a failed save | Must |
`;
const DESIGN = `# Design

## Overview

- Not an error or state path

## Error handling

| Condition | Behaviour |
|-----------|-----------|
| Disk full on save | Report the failure and keep the old settings |
| \`Settings file unreadable\` | Start from defaults |

## State

- Idle to saving
- Saving to saved

## Testing

- Unit tests for the save path
`;
const DESIGN_ROWS = ['Disk full on save', 'Settings file unreadable', 'Idle to saving', 'Saving to saved'];
const ROW_IDS = ['AC1', 'AC2', 'FR1', 'FR2', 'DP1', 'DP2', 'DP3', 'DP4', 'CONSUMERS'];

/** A project on issue branch `42-example`, one implementation commit ahead of `main`, with an approved spec. */
function project({ design = DESIGN, requirements = REQUIREMENTS, status = 'Approved' } = {}) {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-review-')));
  roots.push(cwd);
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'user.email', 'test@example.com');
  const header = HEADER.replace('Approved', status);
  commit(cwd, {
    '.gitignore': '.nmg-sdlc/\n',
    'README.md': 'main\n',
    'src/app.js': 'export const app = 1;\n',
    [`${SPEC}/requirements.md`]: `${header}${requirements}`,
    [`${SPEC}/design.md`]: `${header}${design}`,
    [`${SPEC}/tasks.md`]: `${header}### T001: Save the widget\n\n**File(s)**: \`src/app.js\`\n`,
    [`${SPEC}/feature.gherkin`]: `${header}Feature: Widget\n  Scenario: Save\n    Given a widget\n    When it is saved\n    Then its settings persist\n`,
  }, 'main');
  git(cwd, 'checkout', '-b', '42-example');
  const head = commit(cwd, { 'src/app.js': 'export const app = 2;\n', 'src/util.js': 'export const util = 1;\n' }, 'feat: implement the widget save (#42)');
  return { cwd, head };
}

const init = (cwd, options = {}) => initReview({ issue: 42, spec: SPEC, cwd, ...options });
const finalize = (cwd, options = {}) => finalizeReview({ issue: 42, spec: SPEC, cwd, ...options });
const readJson = (cwd, file) => JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8'));
const exists = (cwd, file) => fs.existsSync(path.join(cwd, file));
const rowOf = (record, id) => record.rows.find((row) => row.id === id);
const refusal = (outcome) => JSON.parse(outcome.stdout.replace(/^NMG_SDLC_REVIEW_REFUSED: /, ''));

/** Records a verdict and evidence on every open row and completes every lens, as a reviewer would, then applies `edit`. */
function complete(cwd, edit = () => {}) {
  const record = readJson(cwd, RECORD);
  for (const row of record.rows) {
    if (row.verdict !== null) continue;
    row.verdict = 'pass';
    row.evidence = `${row.id} checked against the code`;
    if (row.kind === 'acceptance') row.exercised = 'real_entry_point';
  }
  for (const lens of record.lenses) Object.assign(lens, { status: 'complete', summary: `${lens.id} reviewed` });
  edit(record);
  fs.writeFileSync(path.join(cwd, RECORD), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
const finding = (id, severity, extra = {}) => ({ id, severity, lens: 'acceptance', files: ['src/app.js'], summary: `${id} summary`, ...extra });
const fail = (record, id, verdict = 'fail') => Object.assign(rowOf(record, id), { verdict, evidence: `${id} does not hold` });

describe('designPaths', () => {
  it('lists table rows and list items under headings that name errors or states, without header and separator rows', () => {
    expect(designPaths(DESIGN)).toEqual(DESIGN_ROWS);
  });

  it('covers nested headings of a relevant section and stops at the next heading of the same depth', () => {
    const design = [
      '## Failure modes', '', '### Network', '', '1. Request times out', '2. **Connection** refused', '',
      '### Storage', '', '* Disk full', '* Disk full', '', '## Rollout', '', '- Ship it', '',
      '### Edge cases', '', '| Case | Result |', '|:--|:--|', '| Empty input | No-op |', '', '#### Recovery', '', '- Retry once', '',
      '### Naming', '', '- Not a path',
    ].join('\n');
    expect(designPaths(design)).toEqual(['Request times out', 'Connection refused', 'Disk full', 'Empty input', 'Retry once']);
  });

  it('is empty when the design names no such section, and caps what it extracts', () => {
    expect(designPaths('# Design\n\n## Overview\n\n- Something\n')).toEqual([]);
    expect(designPaths('')).toEqual([]);
    const many = `## Errors\n\n${Array.from({ length: 60 }, (_unused, index) => `- Path ${index + 1}`).join('\n')}\n`;
    expect(designPaths(many)).toHaveLength(40);
    expect(designPaths(`## Errors\n\n- ${'x'.repeat(500)}\n`)[0]).toHaveLength(200);
  });
});

describe('checklistRows', () => {
  it('has a row for every acceptance criterion, functional requirement and design path, and one for consumers', () => {
    const { cwd } = project();
    const rows = checklistRows(cwd, 42, SPEC);

    expect(rows.map(({ id, kind }) => [id, kind])).toEqual([
      ['AC1', 'acceptance'], ['AC2', 'acceptance'], ['FR1', 'requirement'], ['FR2', 'requirement'],
      ['DP1', 'design-path'], ['DP2', 'design-path'], ['DP3', 'design-path'], ['DP4', 'design-path'], ['CONSUMERS', 'consumer'],
    ]);
    expect(rows.slice(0, 4).map(({ title }) => title)).toEqual([
      'The widget saves its settings', 'The widget reports a failed save', 'Persist widget settings', 'Report a failed save',
    ]);
    expect(rows.slice(4, 8).map(({ title }) => title)).toEqual(DESIGN_ROWS);
    // No row starts with a verdict; only acceptance rows record how they were exercised.
    expect(rows[0]).toEqual({ id: 'AC1', kind: 'acceptance', title: 'The widget saves its settings', verdict: null, evidence: '', exercised: null });
    expect(rows[2]).toEqual({ id: 'FR1', kind: 'requirement', title: 'Persist widget settings', verdict: null, evidence: '' });
    expect(rows[8]).toMatchObject({ id: 'CONSUMERS', kind: 'consumer', verdict: null, evidence: '' });
    expect(rows[8].title).toContain('Consumers of every identifier, job name or contract this change introduces or extends');
    expect(rows.filter((row) => Object.hasOwn(row, 'exercised')).map(({ id }) => id)).toEqual(['AC1', 'AC2']);
  });

  it('adds the placeholder DP0 row when the design names no error or state path', () => {
    const { cwd } = project({ design: '# Design\n\n## Overview\n\n- Just save the widget\n' });
    const rows = checklistRows(cwd, 42, SPEC);

    expect(rows.map(({ id }) => id)).toEqual(['AC1', 'AC2', 'FR1', 'FR2', 'DP0', 'CONSUMERS']);
    expect(rows[4]).toMatchObject({ kind: 'design-path', verdict: null, evidence: '' });
    expect(rows[4].title).toContain('No error or state path was extracted from design.md');
  });

  it('lists a repeated criterion or requirement once', () => {
    const { cwd } = project({ requirements: `${REQUIREMENTS}\n### AC1: Repeated\n\n| FR2 | Repeated | Must |\n` });
    expect(checklistRows(cwd, 42, SPEC).map(({ id }) => id)).toEqual(ROW_IDS);
  });

  it('still asks about design paths and consumers when the spec cannot be read', () => {
    const { cwd } = project();
    expect(checklistRows(cwd, 42, 'specs/42-absent').map(({ id }) => id)).toEqual(['DP0', 'CONSUMERS']);
  });
});

describe('initReview', () => {
  it('writes the checklist for the current head', () => {
    const { cwd, head } = project();

    const { record, resumed } = init(cwd, { now: () => new Date('2026-03-04T05:06:07.000Z') });

    expect(resumed).toBe(false);
    expect(reviewRecordPath(42)).toBe(RECORD);
    expect(reviewSummaryPath(42)).toBe(SUMMARY);
    expect(readJson(cwd, RECORD)).toEqual(record);
    expect(readReview(cwd, 42)).toEqual(record);
    expect(record).toEqual({
      schemaVersion: 1, issue: 42, specPath: SPEC, headSha: head, baseRef: 'main', mode: 'full', previous: null,
      reviewedPaths: ['src/app.js', 'src/util.js'], repairPaths: [], previousFindings: [],
      lenses: [
        { id: 'acceptance', status: 'pending', summary: '' },
        { id: 'failure-paths', status: 'pending', summary: '' },
        { id: 'test-quality', status: 'pending', summary: '' },
      ],
      rows: checklistRows(cwd, 42, SPEC), findings: [], status: 'pending', createdAt: '2026-03-04T05:06:07.000Z',
    });
    expect(record.rows.map(({ id }) => id)).toEqual(ROW_IDS);
    // Building the checklist writes no handoff and no summary.
    expect(exists(cwd, HANDOFF)).toBe(false);
    expect(exists(cwd, SUMMARY)).toBe(false);
    expect(git(cwd, 'status', '--porcelain')).toBe('');
  });

  it('resumes the open checklist at the same head, keeping the verdicts already recorded', () => {
    const { cwd } = project();
    init(cwd);
    const edited = complete(cwd, (record) => { rowOf(record, 'AC2').verdict = null; });

    const again = init(cwd, { spec: `${SPEC}/` });

    expect(again.resumed).toBe(true);
    expect(again.record).toEqual(edited);
    expect(readJson(cwd, RECORD)).toEqual(edited);
  });

  it('starts over when asked to restart, when the head moved before the review was finalized, or when the record is unreadable', () => {
    const { cwd } = project();
    init(cwd);
    complete(cwd);

    const restarted = init(cwd, { restart: true });
    expect(restarted.resumed).toBe(false);
    expect(restarted.record.rows.every((row) => row.verdict === null)).toBe(true);

    complete(cwd);
    const moved = commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: more work');
    const next = init(cwd);
    expect(next).toMatchObject({ resumed: false, record: { headSha: moved, mode: 'full', previous: null, previousFindings: [], repairPaths: [] } });
    expect(next.record.rows.every((row) => row.verdict === null)).toBe(true);

    fs.writeFileSync(path.join(cwd, RECORD), '{broken');
    expect(readReview(cwd, 42)).toBeNull();
    expect(init(cwd)).toMatchObject({ resumed: false, record: { headSha: moved, status: 'pending' } });
  });

  it('compares against the remote default branch when there is one', () => {
    const { cwd } = project();
    const remote = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-review-remote-')));
    roots.push(remote);
    git(remote, 'init', '--bare');
    git(cwd, 'remote', 'add', 'origin', remote);
    git(cwd, 'push', 'origin', 'main');
    git(cwd, 'fetch', 'origin');
    // The local default branch is stale: it already contains the issue's work.
    git(cwd, 'branch', '-f', 'main', '42-example');

    expect(init(cwd).record).toMatchObject({ baseRef: 'main', reviewedPaths: ['src/app.js', 'src/util.js'] });
  });

  it('throws review_head_unreadable outside a repository', () => {
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-review-none-')));
    roots.push(cwd);
    expect(() => init(cwd)).toThrow(expect.objectContaining({ reasonCode: 'review_head_unreadable' }));
  });
});

describe('finalizeReview refuses an incomplete checklist (#551 AC15)', () => {
  /** Expects a refusal that wrote no handoff and no summary and left the record open. */
  function expectRefused(cwd, outcome, reasonCode) {
    expect(outcome).toMatchObject({ status: 1, handoff: null, stderr: '' });
    expect(outcome.stdout).toMatch(/^NMG_SDLC_REVIEW_REFUSED: \{.*\}\n$/);
    expect(refusal(outcome)).toMatchObject({ issue: 42, reasonCode });
    expect(exists(cwd, HANDOFF)).toBe(false);
    expect(exists(cwd, path.dirname(HANDOFF))).toBe(false);
    expect(exists(cwd, SUMMARY)).toBe(false);
    return refusal(outcome);
  }

  it('names every row and lens of a checklist nobody filled in', () => {
    const { cwd } = project();
    init(cwd);

    const refused = expectRefused(cwd, finalize(cwd), 'review_checklist_incomplete');

    expect(refused.unevaluated).toEqual([
      ...ROW_IDS.map((id) => `${id} (no verdict)`),
      'lens:acceptance (not complete)', 'lens:failure-paths (not complete)', 'lens:test-quality (not complete)',
    ]);
    expect(readJson(cwd, RECORD).status).toBe('pending');
  });

  it.each([
    ['a row has no verdict', (record) => { rowOf(record, 'FR2').verdict = null; }, ['FR2 (no verdict)']],
    ['a row has a verdict outside the vocabulary', (record) => { rowOf(record, 'DP3').verdict = 'looks fine'; }, ['DP3 (no verdict)']],
    ['a row has no evidence', (record) => { rowOf(record, 'FR1').evidence = ''; }, ['FR1 (no evidence)']],
    ['a row has only blank evidence', (record) => { rowOf(record, 'CONSUMERS').evidence = '  \n'; }, ['CONSUMERS (no evidence)']],
    ['a failing row has no evidence', (record) => { Object.assign(rowOf(record, 'DP1'), { verdict: 'fail', evidence: '' }); }, ['DP1 (no evidence)']],
    ['an acceptance row does not say how it was exercised', (record) => { rowOf(record, 'AC2').exercised = null; }, ['AC2 (exercised not recorded)']],
    ['an acceptance row names an unknown way of being exercised', (record) => { rowOf(record, 'AC1').exercised = 'by eye'; }, ['AC1 (exercised not recorded)']],
    ['a lens is still pending', (record) => { record.lenses[2].status = 'pending'; }, ['lens:test-quality (not complete)']],
    ['a lens was removed', (record) => { record.lenses.splice(1, 1); }, ['lens:failure-paths (not complete)']],
    ['a required acceptance row was deleted', (record) => { record.rows = record.rows.filter((row) => row.id !== 'AC2'); }, ['AC2 (row removed)']],
    ['a required requirement row was deleted', (record) => { record.rows = record.rows.filter((row) => row.id !== 'FR1'); }, ['FR1 (row removed)']],
    ['an added row has an unknown kind', (record) => { record.rows.push({ id: 'X1', kind: 'note', verdict: 'pass', evidence: 'x' }); }, ['X1 (invalid row)']],
    ['a finding has no summary', (record) => { record.findings.push(finding('F1', 'minor', { summary: ' ' })); }, ['finding F1 (needs summary, severity, lens and files)']],
    ['a finding has an unknown severity', (record) => { record.findings.push(finding('F1', 'critical')); }, ['finding F1 (needs summary, severity, lens and files)']],
    ['a finding has an unknown lens', (record) => { record.findings.push(finding('F1', 'blocking', { lens: 'style' })); }, ['finding F1 (needs summary, severity, lens and files)']],
    ['a finding has no files list', (record) => { record.findings.push(finding('F1', 'blocking', { files: 'src/app.js' })); }, ['finding F1 (needs summary, severity, lens and files)']],
    ['an unnamed finding is malformed', (record) => { record.findings.push(finding('F1', 'info'), { severity: 'blocking' }); }, ['finding 2 (needs summary, severity, lens and files)']],
    ['several rows are unevaluated at once', (record) => { rowOf(record, 'AC1').verdict = null; rowOf(record, 'DP2').evidence = ''; record.lenses[0].status = 'pending'; },
      ['AC1 (no verdict)', 'DP2 (no evidence)', 'lens:acceptance (not complete)']],
  ])('when %s', (_name, edit, unevaluated) => {
    const { cwd } = project();
    init(cwd);
    complete(cwd, edit);

    const refused = expectRefused(cwd, finalize(cwd), 'review_checklist_incomplete');

    expect(refused.unevaluated).toEqual(unevaluated);
    const record = readJson(cwd, RECORD);
    expect(record.status).toBe('pending');
    expect(Object.hasOwn(record, 'finalizedAt')).toBe(false);
  });

  it('accepts a not_applicable acceptance row without an exercised value, but not without evidence', () => {
    const { cwd } = project();
    init(cwd);
    complete(cwd, (record) => { Object.assign(rowOf(record, 'AC2'), { verdict: 'not_applicable', exercised: null, evidence: '' }); });
    expect(expectRefused(cwd, finalize(cwd), 'review_checklist_incomplete').unevaluated).toEqual(['AC2 (no evidence)']);

    complete(cwd, (record) => { rowOf(record, 'AC2').evidence = 'Superseded by AC1 in this slice'; });
    expect(finalize(cwd)).toMatchObject({ status: 0, handoff: { status: 'passed' } });
  });

  it('when HEAD moved since the checklist was built', () => {
    const { cwd, head } = project();
    init(cwd);
    complete(cwd);
    commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: late change');

    expect(expectRefused(cwd, finalize(cwd), 'review_head_changed')).toEqual({ issue: 42, reasonCode: 'review_head_changed', reviewedHead: head });
  });

  it('when no checklist was built, or it was built for another spec path', () => {
    const { cwd } = project();
    expect(expectRefused(cwd, finalize(cwd), 'review_record_missing')).toEqual({ issue: 42, reasonCode: 'review_record_missing', record: RECORD });

    init(cwd);
    complete(cwd, (record) => { record.specPath = 'specs/42-other'; });
    expectRefused(cwd, finalize(cwd), 'review_record_missing');
  });

  it('when the spec is not approved or is not the issue\'s spec', () => {
    const draft = project({ status: 'Draft' });
    init(draft.cwd);
    complete(draft.cwd);
    expectRefused(draft.cwd, finalize(draft.cwd), 'spec_not_approved');

    const { cwd } = project();
    init(cwd);
    complete(cwd);
    expectRefused(cwd, finalize(cwd, { spec: 'specs/42-elsewhere' }), 'spec_not_approved');
    expect(finalize(cwd, { issue: 43, spec: 'specs/43-example' })).toMatchObject({ status: 1, handoff: null,
      stdout: `NMG_SDLC_REVIEW_REFUSED: ${JSON.stringify({ issue: 43, reasonCode: 'spec_not_approved' })}\n` });
    expect(exists(cwd, path.dirname(HANDOFF))).toBe(false);
  });

  it('when the handoff path is not a regular file', () => {
    const { cwd } = project();
    init(cwd);
    complete(cwd);
    fs.mkdirSync(path.join(cwd, HANDOFF), { recursive: true });

    const outcome = finalize(cwd);

    expect(outcome).toMatchObject({ status: 1, handoff: null });
    expect(refusal(outcome)).toEqual({ issue: 42, reasonCode: 'handoff_target_unsafe' });
    expect(fs.readdirSync(path.join(cwd, HANDOFF))).toEqual([]);
  });
});

describe('finalizeReview hands every finding back at once (#551 AC14, FR26)', () => {
  it('writes one failed verify handoff carrying both blocking findings and the non-blocking ones of every severity', () => {
    const { cwd, head } = project();
    init(cwd);
    const findings = [
      finding('F1', 'blocking', { rows: ['AC2'], summary: 'A failed save is swallowed' }),
      finding('F2', 'major', { lens: 'test-quality', files: ['test/app.test.js'], summary: 'The save test never asserts' }),
      finding('F3', 'blocking', { lens: 'failure-paths', rows: ['DP1'], files: ['src/app.js', 'src/util.js'], summary: 'Disk full loses the old settings' }),
      finding('F4', 'minor', { files: [], summary: 'Unused import' }),
      finding('F5', 'info', { lens: 'test-quality', files: ['README.md'], summary: 'Mention the new setting' }),
    ];
    complete(cwd, (record) => { fail(record, 'AC2'); fail(record, 'DP1', 'partial'); record.findings = findings; });

    const outcome = finalize(cwd, { now: () => new Date('2026-03-04T05:06:07.000Z') });

    const summary = `Review of #42 at ${head.slice(0, 12)} found 5 finding(s), 2 blocking, with no validation run: `
      + 'F1 [blocking] A failed save is swallowed; F2 [major] The save test never asserts; F3 [blocking] Disk full loses the old settings; '
      + 'F4 [minor] Unused import; F5 [info] Mention the new setting';
    const handoff = {
      schemaVersion: 1, issue: 42, step: 'verify', phase: 'review', status: 'failed', intervention: false, summary,
      artifacts: [RECORD, SUMMARY], next: 'implement', reasonCode: 'review_findings', reviewHead: head, mockedEntryPoints: [],
      findings: findings.map(({ id, severity, lens, files, summary: text }) => ({ id, severity, lens, files, summary: text })),
    };
    expect(outcome).toEqual({ status: 1, stdout: `NMG_SDLC_HANDOFF: ${HANDOFF}\n`, stderr: '', handoff, handoffPath: HANDOFF });
    expect(readJson(cwd, HANDOFF)).toEqual(handoff);
    // One handoff for the whole review, not one per finding.
    expect(fs.readdirSync(path.join(cwd, '.nmg-sdlc/handoffs'))).toEqual(['42-verify.json']);
    expect(handoff.findings.map(({ severity }) => severity).sort()).toEqual([...REVIEW_SEVERITIES].sort().concat('blocking').sort());

    expect(readJson(cwd, RECORD)).toMatchObject({ status: 'findings', finalizedAt: '2026-03-04T05:06:07.000Z', headSha: head });
    const markdown = fs.readFileSync(path.join(cwd, SUMMARY), 'utf8');
    expect(markdown).toContain('# Review checklist for #42');
    expect(markdown).toContain(`**Reviewed head**: ${head}`);
    expect(markdown).toContain('**Mode**: full\n**Result**: findings');
    expect(markdown).toContain('| AC2 | acceptance | fail | real_entry_point | AC2 does not hold |');
    expect(markdown).toContain('- **F3** [blocking, failure-paths] Disk full loses the old settings (files: src/app.js, src/util.js)');
    expect(markdown).toContain('- **F4** [minor, acceptance] Unused import\n');
    expect(markdown).toContain('- test-quality: complete — test-quality reviewed');
    expect(git(cwd, 'status', '--porcelain')).toBe('');
  });

  it('turns a failing or partial row that no finding names into a blocking finding', () => {
    const { cwd } = project();
    init(cwd);
    complete(cwd, (record) => {
      fail(record, 'AC1');
      fail(record, 'DP2', 'partial');
      fail(record, 'FR2');
      // FR2 is already named by a recorded finding, so it implies no second one.
      record.findings = [{ severity: 'major', lens: 'acceptance', files: ['src/app.js'], rows: ['FR2'], summary: 'Failure is reported late' }];
    });

    const outcome = finalize(cwd);

    expect(outcome).toMatchObject({ status: 1, handoff: { status: 'failed', phase: 'review', reasonCode: 'review_findings', next: 'implement' } });
    expect(outcome.handoff.findings).toEqual([
      { id: 'F1', severity: 'major', lens: 'acceptance', files: ['src/app.js'], summary: 'Failure is reported late' },
      { id: 'row:AC1', severity: 'blocking', lens: 'acceptance', files: [], summary: 'AC1 is fail: AC1 does not hold' },
      { id: 'row:DP2', severity: 'blocking', lens: 'failure-paths', files: [], summary: 'DP2 is partial: DP2 does not hold' },
    ]);
    expect(outcome.handoff.summary).toContain('found 3 finding(s), 2 blocking');
    expect(reviewFindings(readJson(cwd, RECORD)).map(({ id, rows }) => [id, rows])).toEqual([['F1', ['FR2']], ['row:AC1', ['AC1']], ['row:DP2', ['DP2']]]);
    expect(fs.readFileSync(path.join(cwd, SUMMARY), 'utf8')).toContain('- **row:AC1** [blocking, acceptance] AC1 is fail: AC1 does not hold\n');
  });

  it('replaces an earlier handoff rather than adding another', () => {
    const { cwd } = project();
    init(cwd);
    complete(cwd, (record) => { fail(record, 'AC1'); });
    expect(finalize(cwd)).toMatchObject({ status: 1, handoff: { findings: [{ id: 'row:AC1' }] } });

    complete(cwd, (record) => { Object.assign(rowOf(record, 'AC1'), { verdict: 'pass', evidence: 'Fixed in review' }); });
    expect(finalize(cwd)).toMatchObject({ status: 0, handoff: { status: 'passed' } });

    expect(readJson(cwd, HANDOFF)).toMatchObject({ status: 'passed', next: 'verify' });
    expect(fs.readdirSync(path.join(cwd, '.nmg-sdlc/handoffs'))).toEqual(['42-verify.json']);
  });
});

describe('finalizeReview passes a clean review (#551 FR24)', () => {
  it('writes a passed handoff that sends the issue on to validation', () => {
    const { cwd, head } = project();
    init(cwd);
    complete(cwd);

    const outcome = finalize(cwd);

    const handoff = {
      schemaVersion: 1, issue: 42, step: 'verify', phase: 'review', status: 'passed', intervention: false,
      summary: `Review of #42 passed at ${head.slice(0, 12)}`, artifacts: [RECORD, SUMMARY], next: 'verify', reasonCode: null, reviewHead: head, mockedEntryPoints: [],
    };
    expect(outcome).toEqual({ status: 0, stdout: `NMG_SDLC_HANDOFF: ${HANDOFF}\n`, stderr: '', handoff, handoffPath: HANDOFF });
    expect(readJson(cwd, HANDOFF)).toEqual(handoff);
    expect(readJson(cwd, RECORD).status).toBe('passed');
    const markdown = fs.readFileSync(path.join(cwd, SUMMARY), 'utf8');
    expect(markdown).toContain('**Result**: passed');
    expect(markdown).toContain('## Findings\n\nNone.\n');
    expect(markdown).toContain('## Criteria whose tests mock the path under test\n\nNone.\n');
  });

  it('names the criteria whose tests mock the path under test in the handoff summary and the review summary', () => {
    const { cwd, head } = project();
    init(cwd);
    complete(cwd, (record) => {
      rowOf(record, 'AC2').exercised = 'mocked';
      Object.assign(rowOf(record, 'AC1'), { exercised: 'not_exercisable', evidence: 'Needs a | real device\nto exercise' });
    });

    const outcome = finalize(cwd);

    expect(outcome).toMatchObject({ status: 0, handoff: { status: 'passed', next: 'verify' } });
    expect(outcome.handoff.summary).toBe(`Review of #42 passed at ${head.slice(0, 12)}; criteria tested through mocks: AC2`);
    const markdown = fs.readFileSync(path.join(cwd, SUMMARY), 'utf8');
    expect(markdown).toContain('## Criteria whose tests mock the path under test\n\n- AC2\n');
    expect(markdown).toContain('| AC2 | acceptance | pass | mocked | AC2 checked against the code |');
    // Table cells stay on one line with their pipes escaped.
    expect(markdown).toContain('| AC1 | acceptance | pass | not_exercisable | Needs a \\| real device to exercise |');
  });

  it('passes with info notes only and lists them, together with the mocked criteria', () => {
    const { cwd, head } = project();
    init(cwd);
    complete(cwd, (record) => {
      rowOf(record, 'AC1').exercised = 'mocked';
      rowOf(record, 'AC2').exercised = 'mocked';
      record.findings = [finding('F1', 'info', { summary: 'Slow save' }), finding('F2', 'info', { lens: 'test-quality', summary: 'Rename the helper' })];
    });

    const outcome = finalize(cwd);

    expect(outcome).toMatchObject({ status: 0, handoff: { status: 'passed', next: 'verify', reasonCode: null } });
    expect(Object.hasOwn(outcome.handoff, 'findings')).toBe(false);
    expect(outcome.handoff.summary).toBe(`Review of #42 passed at ${head.slice(0, 12)} with 2 non-blocking finding(s): `
      + 'F1 [info] Slow save; F2 [info] Rename the helper; criteria tested through mocks: AC1, AC2');
    expect(outcome.handoff.mockedEntryPoints).toEqual(['AC1', 'AC2']);
    expect(fs.readFileSync(path.join(cwd, SUMMARY), 'utf8')).toContain('- AC1\n- AC2\n');
  });

  it.each(['major', 'minor'])('hands a review back for a single %s finding, with no blocking one (FR26)', (severity) => {
    const { cwd } = project();
    init(cwd);
    complete(cwd, (record) => { record.findings = [finding('F1', severity, { summary: 'Slow save' })]; });

    expect(finalize(cwd)).toMatchObject({ status: 1, handoff: { status: 'failed', next: 'implement', reasonCode: 'review_findings', findings: [{ id: 'F1', severity }] } });
  });

  it('hands a review back when a row fails even if only an info note names it', () => {
    const { cwd } = project();
    init(cwd);
    complete(cwd, (record) => {
      Object.assign(rowOf(record, 'AC1'), { verdict: 'fail', evidence: 'The save path drops the widget' });
      record.findings = [finding('F1', 'info', { rows: ['AC1'], summary: 'Save drops the widget' })];
    });

    expect(finalize(cwd)).toMatchObject({ status: 1, handoff: { status: 'failed', reasonCode: 'review_findings' } });
  });

  it('accepts rows the reviewer added for each consumer and each design path it found', () => {
    const { cwd } = project({ design: '# Design\n\n## Overview\n\n- Just save the widget\n' });
    init(cwd);
    complete(cwd, (record) => {
      Object.assign(rowOf(record, 'DP0'), { verdict: 'not_applicable', evidence: 'The design names no error or state path' });
      record.rows.push({ id: 'CONSUMER-status', kind: 'consumer', title: 'sdlc-status reads the new field', verdict: 'pass', evidence: 'scripts/sdlc-status.mjs:120' });
    });

    expect(finalize(cwd)).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(fs.readFileSync(path.join(cwd, SUMMARY), 'utf8')).toContain('| CONSUMER-status | consumer | pass | — | scripts/sdlc-status.mjs:120 |');
  });

  it('declares the vocabularies a reviewer may use', () => {
    expect(REVIEW_LENSES).toEqual(['acceptance', 'failure-paths', 'test-quality']);
    expect(REVIEW_VERDICTS).toEqual(['pass', 'fail', 'partial', 'not_applicable']);
    expect(REVIEW_SEVERITIES).toEqual(['blocking', 'major', 'minor', 'info']);
    expect(EXERCISED).toEqual(['real_entry_point', 'mocked', 'not_exercisable']);
  });
});

describe('scoped re-review after a repair (#551 AC16, FR27)', () => {
  const FINDINGS = [
    finding('F1', 'blocking', { rows: ['AC2'], files: ['src/app.js'], summary: 'A failed save is swallowed' }),
    finding('F2', 'minor', { lens: 'failure-paths', rows: ['DP2'], files: ['src/util.js'], summary: 'Unreadable settings are not logged' }),
  ];
  /** A project whose first review was handed back with FINDINGS at `reviewed`. */
  function reviewed(findings = FINDINGS) {
    const repo = project();
    init(repo.cwd);
    complete(repo.cwd, (record) => {
      rowOf(record, 'AC1').exercised = 'mocked';
      fail(record, 'AC2');
      // Named by F2 but passing: a finding's rows are checked again whatever their verdict.
      record.findings = findings;
    });
    expect(finalize(repo.cwd).status).toBe(1);
    return { ...repo, first: readJson(repo.cwd, RECORD) };
  }

  it('scopes the next review to the findings and the repair diff when the repair stays inside the findings\' files', () => {
    const { cwd, head, first } = reviewed();
    const repaired = commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: report a failed save');

    const { record, resumed } = init(cwd);

    expect(resumed).toBe(false);
    expect(record).toMatchObject({
      mode: 'scoped', headSha: repaired, status: 'pending', previous: { headSha: head, status: 'findings' },
      repairPaths: ['src/app.js'], previousFindings: FINDINGS, findings: [],
    });
    expect(Object.hasOwn(record, 'scopeEscape')).toBe(false);
    expect(record.lenses.every((lens) => lens.status === 'pending')).toBe(true);
    expect(record.rows.map(({ id }) => id)).toEqual([...ROW_IDS, 'REPAIR']);
    // Untouched passing rows keep their verdict, evidence and how they were exercised.
    for (const id of ['AC1', 'FR1', 'FR2', 'DP1', 'DP3', 'DP4', 'CONSUMERS']) {
      expect(rowOf(record, id)).toEqual({ ...rowOf(first, id), carried: true });
    }
    expect(rowOf(record, 'AC1')).toMatchObject({ verdict: 'pass', exercised: 'mocked', evidence: 'AC1 checked against the code' });
    // Rows the findings named are open again.
    expect(rowOf(record, 'AC2')).toEqual({ id: 'AC2', kind: 'acceptance', title: 'The widget reports a failed save', verdict: null, evidence: '', exercised: null, carried: false });
    expect(rowOf(record, 'DP2')).toEqual({ id: 'DP2', kind: 'design-path', title: 'Settings file unreadable', verdict: null, evidence: '', carried: false });
    expect(rowOf(record, 'REPAIR')).toEqual({ id: 'REPAIR', kind: 'repair', title: `Repair diff since ${head.slice(0, 12)}: src/app.js`, verdict: null, evidence: '' });
    expect(readJson(cwd, RECORD)).toEqual(record);

    // Only the reopened rows and the repair row stand between the reviewer and a handoff.
    expect(refusal(finalize(cwd)).unevaluated).toEqual([
      'AC2 (no verdict)', 'DP2 (no verdict)', 'REPAIR (no verdict)',
      'lens:acceptance (not complete)', 'lens:failure-paths (not complete)', 'lens:test-quality (not complete)',
    ]);
    complete(cwd);
    const outcome = finalize(cwd);
    expect(outcome).toMatchObject({ status: 0, handoff: { status: 'passed', next: 'verify', reviewHead: repaired } });
    expect(outcome.handoff.summary).toContain('criteria tested through mocks: AC1');
    const markdown = fs.readFileSync(path.join(cwd, SUMMARY), 'utf8');
    expect(markdown).toContain(`**Mode**: scoped (previous review at ${head}: findings)`);
    expect(markdown).toContain('| AC1 | acceptance | pass (carried) | mocked |');
    expect(markdown).toContain('| AC2 | acceptance | pass | real_entry_point |');
    expect(markdown).toContain('| REPAIR | repair | pass | — |');
  });

  it('reopens a row that did not pass even when no finding named it', () => {
    const { cwd } = reviewed([finding('F1', 'blocking', { files: ['src/app.js'], summary: 'A failed save is swallowed' })]);
    commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: report a failed save');

    const { record } = init(cwd);

    expect(record.mode).toBe('scoped');
    expect(record.rows.filter((row) => row.verdict === null).map(({ id }) => id)).toEqual(['AC2', 'REPAIR']);
    expect(record.rows.filter((row) => row.carried).map(({ id }) => id)).toEqual(ROW_IDS.filter((id) => id !== 'AC2'));
  });

  it('runs a full review when the repair touches a file outside the findings\' scope, and names the file', () => {
    const { cwd, head } = reviewed();
    const repaired = commit(cwd, { 'src/app.js': 'export const app = 3;\n', 'lib/extra.js': 'export const extra = 1;\n' }, 'fix: report a failed save');

    const { record } = init(cwd);

    expect(record).toMatchObject({
      mode: 'full', headSha: repaired, previous: { headSha: head, status: 'findings' }, scopeEscape: ['lib/extra.js'],
      repairPaths: ['lib/extra.js', 'src/app.js'], previousFindings: FINDINGS,
      reviewedPaths: ['lib/extra.js', 'src/app.js', 'src/util.js'],
    });
    expect(record.rows.map(({ id }) => id)).toEqual(ROW_IDS);
    expect(record.rows.every((row) => row.verdict === null && row.evidence === '' && !Object.hasOwn(row, 'carried'))).toBe(true);
    expect(refusal(finalize(cwd)).unevaluated).toHaveLength(ROW_IDS.length + REVIEW_LENSES.length);
  });

  it('treats a finding\'s directory or glob entry as its scope', () => {
    const { cwd } = reviewed([finding('F1', 'blocking', { rows: ['AC2'], files: ['src/', 'test/**'], summary: 'A failed save is swallowed' })]);
    commit(cwd, { 'src/deep/new.js': 'export const deep = 1;\n', 'test/unit/app.test.js': 'test\n' }, 'fix: report a failed save');
    expect(init(cwd).record).toMatchObject({ mode: 'scoped', repairPaths: ['src/deep/new.js', 'test/unit/app.test.js'] });

    // A path that merely shares the directory's name prefix is outside it.
    const other = reviewed([finding('F1', 'blocking', { rows: ['AC2'], files: ['src/', 'test/**'], summary: 'A failed save is swallowed' })]);
    commit(other.cwd, { 'src/app.js': 'export const app = 3;\n', 'srcs/near-miss.js': 'export const miss = 1;\n' }, 'fix: report a failed save');
    expect(init(other.cwd).record).toMatchObject({ mode: 'full', scopeEscape: ['srcs/near-miss.js'] });
  });

  it('scopes a change after a passed review to the files that review covered', () => {
    const passed = () => {
      const repo = project();
      init(repo.cwd);
      complete(repo.cwd);
      expect(finalize(repo.cwd).status).toBe(0);
      return repo;
    };
    const repo = passed();
    commit(repo.cwd, { 'src/util.js': 'export const util = 2;\n' }, 'fix: tidy the helper');

    const scoped = init(repo.cwd).record;
    expect(scoped).toMatchObject({ mode: 'scoped', previous: { headSha: repo.head, status: 'passed' }, repairPaths: ['src/util.js'], previousFindings: [] });
    expect(scoped.rows.filter((row) => row.verdict === null).map(({ id }) => id)).toEqual(['REPAIR']);

    const outside = passed();
    commit(outside.cwd, { 'README.md': 'changed\n' }, 'docs: mention the widget');
    expect(init(outside.cwd).record).toMatchObject({ mode: 'full', previous: { headSha: outside.head, status: 'passed' }, scopeEscape: ['README.md'] });
  });

  it('chains scoped reviews: the next one compares against the last finalized review and has one REPAIR row', () => {
    const { cwd } = reviewed();
    const second = commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: report a failed save');
    init(cwd);
    complete(cwd, (record) => {
      fail(record, 'REPAIR');
      record.findings = [finding('F1', 'blocking', { rows: ['REPAIR'], files: ['src/app.js'], summary: 'The repair drops the old settings' })];
    });
    expect(finalize(cwd).status).toBe(1);
    commit(cwd, { 'src/app.js': 'export const app = 4;\n' }, 'fix: keep the old settings');

    const { record } = init(cwd);

    expect(record).toMatchObject({ mode: 'scoped', previous: { headSha: second, status: 'findings' }, repairPaths: ['src/app.js'] });
    expect(record.rows.map(({ id }) => id)).toEqual([...ROW_IDS, 'REPAIR']);
    expect(rowOf(record, 'REPAIR')).toMatchObject({ verdict: null, evidence: '', title: `Repair diff since ${second.slice(0, 12)}: src/app.js` });
    expect(record.rows.filter((row) => row.verdict === null).map(({ id }) => id)).toEqual(['REPAIR']);
  });

  it('runs a full review when nothing but controller commits followed, or when history no longer contains the reviewed head', () => {
    const { cwd, head } = reviewed();
    commit(cwd, { [`${SPEC}/verification-report.md`]: 'report\n' }, 'docs: record verification for #42');
    expect(init(cwd).record).toMatchObject({ mode: 'full', previous: { headSha: head, status: 'findings' }, repairPaths: [], scopeEscape: [] });

    git(cwd, 'reset', '--hard', `${head}~1`);
    commit(cwd, { 'src/app.js': 'export const app = 9;\n' }, 'feat: rewritten');
    expect(init(cwd).record).toMatchObject({ mode: 'full', previous: null, previousFindings: [], repairPaths: [] });
  });

  it('does not count merges of the default branch or controller commits as repair paths', () => {
    const { cwd, head } = reviewed();
    commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: report a failed save');
    // The default branch moves on and is merged into the issue branch.
    git(cwd, 'checkout', 'main');
    commit(cwd, { 'other/unrelated.js': 'export const other = 1;\n', 'README.md': 'main moved\n' }, 'feat: unrelated work (#40)');
    git(cwd, 'checkout', '42-example');
    git(cwd, 'merge', '--no-ff', '-m', "Merge branch 'main' into 42-example", 'main');
    // Commits the controller and the finalizers make.
    commit(cwd, { VERSION: '1.1.0\n', 'CHANGELOG.md': '## [1.1.0]\n' }, 'feat: deliver issue #42');
    commit(cwd, { [`${SPEC}/verification-report.md`]: 'report\n' }, 'docs: record verification for #42');
    commit(cwd, { [`${SPEC}/verification-report.md`]: 'report with PR evidence\n' }, 'docs: record PR evidence for #42');
    commit(cwd, { VERSION: '1.1.1\n' }, 'fix: deliver issue #42');
    git(cwd, 'revert', '--no-edit', 'HEAD');

    expect(repairPathsSince(cwd, run, head)).toEqual(['src/app.js']);
    const { record } = init(cwd);
    expect(record).toMatchObject({ mode: 'scoped', repairPaths: ['src/app.js'] });
    expect(rowOf(record, 'REPAIR').title).toBe(`Repair diff since ${head.slice(0, 12)}: src/app.js`);

    // An ordinary commit is counted, also when its subject merely mentions delivery.
    commit(cwd, { 'docs/notes.md': 'notes\n' }, 'docs: explain how to deliver issue #42');
    expect(repairPathsSince(cwd, run, head)).toEqual(['docs/notes.md', 'src/app.js']);
    expect(repairPathsSince(cwd, run, 'HEAD')).toEqual([]);
    expect(repairPathsSince(cwd, run, 'f'.repeat(40))).toBeNull();
  });

  it('repairScope separates the repair paths inside the previous scope from those outside it', () => {
    const previous = { findings: [{ files: ['src/app.js', 'docs/'] }, { files: ['src/app.js'] }, {}], reviewedPaths: ['README.md'] };
    expect(repairScope(previous, ['docs/guide.md', 'src/app.js'])).toEqual({ scoped: true, outside: [], scope: ['src/app.js', 'docs/'] });
    expect(repairScope(previous, ['README.md', 'src/app.js'])).toEqual({ scoped: false, outside: ['README.md'], scope: ['src/app.js', 'docs/'] });
    expect(repairScope(previous, [])).toMatchObject({ scoped: false, outside: [] });
    expect(repairScope({ findings: [], reviewedPaths: ['README.md'] }, ['README.md'])).toEqual({ scoped: true, outside: [], scope: ['README.md'] });
    expect(repairScope({ findings: [] }, ['README.md'])).toEqual({ scoped: false, outside: ['README.md'], scope: [] });
  });
});

describe('command line', () => {
  const cli = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  const scoped = ['--issue', '42', '--spec', SPEC];

  it('rejects a malformed invocation with usage and exit code 2', () => {
    const { cwd } = project();
    for (const args of [
      [], ['review', ...scoped], ['init'], ['init', '--issue', '42'], ['init', '--issue', 'x', '--spec', SPEC],
      ['init', '--issue', '42', '--spec', 'specs/43-example'], ['init', ...scoped, '--issue', '42'], ['init', ...scoped, '--unknown', 'x'],
      ['finalize', ...scoped, '--base'],
    ]) {
      const result = cli(cwd, ...args);
      expect([args, result.status, result.stdout]).toEqual([args, 2, '']);
      expect(result.stderr).toContain('Usage: node scripts/sdlc-review.mjs <init|finalize|status>');
    }
    expect(exists(cwd, RECORD)).toBe(false);
  });

  it('init prints the checklist, status reports it, and finalize refuses, hands back or passes with matching exit codes', () => {
    const { cwd, head } = project();

    const missing = cli(cwd, 'status', ...scoped);
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout)).toEqual({ ok: false, reasonCode: 'review_record_missing' });
    const early = cli(cwd, 'finalize', ...scoped);
    expect(early.status).toBe(1);
    expect(early.stdout).toBe(`NMG_SDLC_REVIEW_REFUSED: ${JSON.stringify({ issue: 42, reasonCode: 'review_record_missing', record: RECORD })}\n`);

    const started = cli(cwd, 'init', '--issue', '#42', '--spec', `${SPEC}/`, '--base', 'main');
    expect(started.stderr).toBe('');
    expect(started.status).toBe(0);
    expect(JSON.parse(started.stdout)).toEqual({
      ok: true, resumed: false, record: RECORD, mode: 'full', headSha: head,
      rows: checklistRows(cwd, 42, SPEC).map(({ id, kind }) => ({ id, kind, verdict: null })),
      lenses: ['acceptance', 'failure-paths', 'test-quality'], repairPaths: [], previousFindings: [],
    });
    expect(JSON.parse(cli(cwd, 'init', ...scoped).stdout)).toMatchObject({ ok: true, resumed: true, headSha: head });

    const pending = cli(cwd, 'status', ...scoped);
    expect(pending.status).toBe(0);
    expect(JSON.parse(pending.stdout)).toEqual({ ok: true, status: 'pending', mode: 'full', headSha: head, rows: ROW_IDS.length, findings: 0 });

    // An unfilled checklist is refused: exit 1, the rows named, no handoff.
    const refused = cli(cwd, 'finalize', ...scoped);
    expect(refused.status).toBe(1);
    expect(refused.stdout).toMatch(/^NMG_SDLC_REVIEW_REFUSED: /);
    expect(refused.stdout).not.toContain('NMG_SDLC_HANDOFF:');
    expect(refusal(refused)).toMatchObject({ issue: 42, reasonCode: 'review_checklist_incomplete' });
    expect(refusal(refused).unevaluated).toContain('AC1 (no verdict)');
    expect(exists(cwd, HANDOFF)).toBe(false);

    // Findings: exit 1 with a handoff.
    complete(cwd, (record) => { fail(record, 'AC2'); record.findings = [finding('F1', 'blocking', { rows: ['AC2'] })]; });
    const handedBack = cli(cwd, 'finalize', ...scoped);
    expect([handedBack.status, handedBack.stdout, handedBack.stderr]).toEqual([1, `NMG_SDLC_HANDOFF: ${HANDOFF}\n`, '']);
    expect(readJson(cwd, HANDOFF)).toMatchObject({ status: 'failed', phase: 'review', reasonCode: 'review_findings', next: 'implement', findings: [{ id: 'F1' }] });
    expect(JSON.parse(cli(cwd, 'status', ...scoped).stdout)).toMatchObject({ ok: true, status: 'findings', findings: 1 });

    // A repair inside the finding's file gives a scoped checklist; a clean one passes with exit 0.
    const repaired = commit(cwd, { 'src/app.js': 'export const app = 3;\n' }, 'fix: report a failed save');
    const rescoped = JSON.parse(cli(cwd, 'init', ...scoped).stdout);
    expect(rescoped).toMatchObject({ ok: true, resumed: false, mode: 'scoped', headSha: repaired, repairPaths: ['src/app.js'], previousFindings: [{ id: 'F1' }] });
    expect(rescoped.rows).toContainEqual({ id: 'AC1', kind: 'acceptance', verdict: 'pass', carried: true });
    expect(rescoped.rows).toContainEqual({ id: 'AC2', kind: 'acceptance', verdict: null });
    expect(rescoped.rows).toContainEqual({ id: 'REPAIR', kind: 'repair', verdict: null });
    expect(Object.hasOwn(rescoped, 'fullReviewBecause')).toBe(false);
    complete(cwd);
    const passed = cli(cwd, 'finalize', ...scoped);
    expect([passed.status, passed.stdout, passed.stderr]).toEqual([0, `NMG_SDLC_HANDOFF: ${HANDOFF}\n`, '']);
    expect(readJson(cwd, HANDOFF)).toMatchObject({ status: 'passed', phase: 'review', next: 'verify', reviewHead: repaired });

    // A change outside the reviewed files: init says why the review is full again; --restart discards verdicts.
    commit(cwd, { 'lib/extra.js': 'export const extra = 1;\n' }, 'feat: something else');
    expect(JSON.parse(cli(cwd, 'init', ...scoped).stdout)).toMatchObject({ mode: 'full', fullReviewBecause: ['lib/extra.js'] });
    complete(cwd);
    const restarted = JSON.parse(cli(cwd, 'init', ...scoped, '--restart').stdout);
    expect(restarted.resumed).toBe(false);
    expect(restarted.rows.every((row) => row.verdict === null)).toBe(true);
  });

  it('reports a failure to read the head as JSON with exit code 1', () => {
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-review-none-')));
    roots.push(cwd);
    const result = cli(cwd, 'init', ...scoped);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, reasonCode: 'review_head_unreadable' });
  });
});
