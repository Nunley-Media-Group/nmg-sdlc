#!/usr/bin/env node

/** The verify review checklist. `init` builds the checklist a review must complete: every acceptance criterion and
 * functional requirement of the issue's delivery scope, every error and state path the design names, and the
 * consumers of anything the change introduces or extends. `finalize` writes the verify handoff: it refuses while
 * any row or lens has no verdict, hands every finding back to implement in one handoff when a blocking one exists,
 * and otherwise passes the review. After a repair, `init` scopes the next review to the listed findings and the
 * repair diff unless the repair reaches files outside the findings' scope. No validation runs here. */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { inspectIssueSpecScope, isSpecApproved, resolveSpecDir } from './issue-spec-scope.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import { enterControllerLease, releaseControllerLease } from './sdlc-controller-lease.mjs';
import { declaredOverlap } from './sdlc-shared-state.mjs';

const USAGE = 'Usage: node scripts/sdlc-review.mjs <init|finalize|status> --issue N --spec specs/N-SLUG [--base BRANCH] [--restart] [--controller-run-id ID]';
const SHA = /^[0-9a-f]{40}$/;
export const REVIEW_LENSES = Object.freeze(['acceptance', 'failure-paths', 'test-quality']);
export const REVIEW_VERDICTS = Object.freeze(['pass', 'fail', 'partial', 'not_applicable']);
export const REVIEW_SEVERITIES = Object.freeze(['blocking', 'major', 'minor', 'info']);
export const EXERCISED = Object.freeze(['real_entry_point', 'mocked', 'not_exercisable']);
const ROW_KINDS = Object.freeze(['acceptance', 'requirement', 'design-path', 'consumer', 'repair']);
const FAILING_VERDICTS = ['fail', 'partial'];
const MAX_DESIGN_PATHS = 40;
// Commits the controller and finalizers make: they are not part of a repair.
const CONTROLLER_SUBJECT = /^(?:Revert "?)?(?:(?:feat|fix): deliver issue #\d+|docs: record (?:verification|PR evidence) for #\d+)/;

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}
function ok(result) { return result && !result.error && result.status === 0; }
function lines(result) { return String(result?.stdout ?? '').split(/\r?\n/).filter(Boolean); }

export function reviewRecordPath(issue) { return `.nmg-sdlc/verification/${issue}-review.json`; }
export function reviewSummaryPath(issue) { return `.nmg-sdlc/verification/${issue}-review.md`; }

/** The stored review record for an issue, or null when it is absent, unsafe or malformed. */
export function readReview(cwd, issue) {
  const path = join(cwd, reviewRecordPath(issue));
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) return null;
    const record = JSON.parse(readFileSync(path, 'utf8'));
    return record?.schemaVersion === 1 && record.issue === issue && Array.isArray(record.rows)
      && Array.isArray(record.findings) && Array.isArray(record.lenses) ? record : null;
  } catch { return null; }
}
function writeJson(cwd, relativePath, value) {
  const path = join(cwd, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.${process.pid}.tmp`, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  renameSync(`${path}.${process.pid}.tmp`, path);
}

function headings(text, pattern) {
  return [...String(text).matchAll(pattern)].map((match) => ({ id: match[1], title: (match[2] ?? '').trim().slice(0, 200) }));
}
/** The error and state paths a design names: table rows and list items under headings that mention them. */
export function designPaths(design) {
  const paths = [];
  let inSection = false;
  let depth = 0;
  for (const line of String(design).split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const relevant = /\b(?:errors?|failures?|states?|edge cases?|recovery)\b/i.test(heading[2]);
      if (relevant) { inSection = true; depth = heading[1].length; } else if (inSection && heading[1].length <= depth) inSection = false;
      continue;
    }
    if (!inSection) continue;
    const row = /^\|\s*([^|]+?)\s*\|/.exec(line);
    const item = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
    const text = (row && !/^:?-{2,}/.test(row[1]) ? row[1] : item?.[1])?.replace(/[`*_]/g, '').trim();
    if (!text || /^(?:path|state|error|condition|scenario|case|failure|from|trigger|#)$/i.test(text)) continue;
    if (!paths.includes(text.slice(0, 200))) paths.push(text.slice(0, 200));
    if (paths.length === MAX_DESIGN_PATHS) break;
  }
  return paths;
}

/** The checklist rows the spec requires, before any verdict. */
export function checklistRows(cwd, issue, specPath) {
  const read = (name) => { try { return readFileSync(join(cwd, specPath, name), 'utf8'); } catch { return ''; } };
  const requirements = read('requirements.md');
  let acceptance = headings(requirements, /^#{2,4}\s+(AC[1-9]\d*)\s*[:.—-]?\s*(.*)$/gm);
  let functional = headings(requirements, /^\|\s*(FR[1-9]\d*)\s*\|\s*([^|]*)\|/gm);
  try {
    // A cumulative spec is reviewed for this issue's delivery slice only.
    const scope = inspectIssueSpecScope({ projectRoot: cwd, issueNumber: issue, specPath });
    const narrow = (rows, ids) => (Array.isArray(ids) && ids.length ? rows.filter((row) => ids.includes(row.id)) : rows);
    if (scope.status === 'scoped') {
      acceptance = narrow(acceptance, scope.delivery?.acceptanceCriteria);
      functional = narrow(functional, scope.delivery?.functionalRequirements);
    }
  } catch { /* an unreadable scope reviews the whole spec */ }
  const unique = (rows) => rows.filter((row, index) => rows.findIndex((other) => other.id === row.id) === index);
  const row = (kind, id, title) => ({ id, kind, title, verdict: null, evidence: '', ...(kind === 'acceptance' ? { exercised: null } : {}) });
  const named = designPaths(read('design.md'));
  return [
    ...unique(acceptance).map(({ id, title }) => row('acceptance', id, title)),
    ...unique(functional).map(({ id, title }) => row('requirement', id, title)),
    ...(named.length ? named.map((title, index) => row('design-path', `DP${index + 1}`, title))
      : [row('design-path', 'DP0', 'No error or state path was extracted from design.md: list each one the design names as its own design-path row, or record not_applicable with the reason')]),
    row('consumer', 'CONSUMERS', 'Consumers of every identifier, job name or contract this change introduces or extends: add one consumer row per consumer found, then record this row, or record not_applicable when the change introduces and extends none'),
  ];
}

function changedSince(cwd, run, base) {
  const response = run('git', ['diff', '--name-only', `${base}...HEAD`], { cwd });
  return ok(response) ? lines(response).filter((path) => !path.startsWith('.nmg-sdlc/')).sort() : [];
}
/** The paths the branch's own commits changed since `since`, leaving out merges of the default branch and controller commits. */
export function repairPathsSince(cwd, run, since) {
  const log = run('git', ['log', '--first-parent', '--no-merges', '--format=%H%x09%s', `${since}..HEAD`], { cwd });
  if (!ok(log)) return null;
  const paths = new Set();
  for (const line of lines(log)) {
    const [sha, ...subject] = line.split('\t');
    if (CONTROLLER_SUBJECT.test(subject.join('\t'))) continue;
    const changed = run('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', sha], { cwd });
    if (!ok(changed)) return null;
    for (const path of lines(changed)) if (!path.startsWith('.nmg-sdlc/')) paths.add(path);
  }
  return [...paths].sort();
}

/**
 * Whether the next review after `previous` may be scoped: the repair touches only files inside the prior findings'
 * scope (their files, or the files the prior review covered when it had no finding).
 */
export function repairScope(previous, repairPaths) {
  const findingFiles = [...new Set(previous.findings.flatMap((finding) => finding.files ?? []))];
  const scope = findingFiles.length ? findingFiles : previous.reviewedPaths ?? [];
  const inside = declaredOverlap(repairPaths, scope);
  const outside = repairPaths.filter((path) => !inside.includes(path));
  return { scoped: repairPaths.length > 0 && outside.length === 0, outside, scope };
}

/**
 * How the next review after a repair is scoped. `{ mode: 'scoped', priorHead, findings, repairPaths }` when the prior
 * review returned findings and every repaired path is one of the findings' files; otherwise `{ mode: 'full' }`,
 * naming `outsidePaths` when the repair reached outside them.
 */
export function reviewScope({ issue, cwd = process.cwd(), run = defaultRun } = {}) {
  const previous = readReview(cwd, issue);
  const findings = previous ? reviewFindings(previous) : [];
  if (!previous || !findings.length || !SHA.test(previous.headSha ?? '')
    || !ok(run('git', ['merge-base', '--is-ancestor', previous.headSha, 'HEAD'], { cwd }))) return { mode: 'full' };
  const repairPaths = repairPathsSince(cwd, run, previous.headSha);
  if (!repairPaths) return { mode: 'full' };
  const scope = repairScope(previous, repairPaths);
  return scope.outside.length ? { mode: 'full', priorHead: previous.headSha, outsidePaths: scope.outside }
    : { mode: 'scoped', priorHead: previous.headSha, findings, repairPaths };
}

function head(cwd, run) {
  const response = run('git', ['rev-parse', 'HEAD'], { cwd });
  const sha = String(response?.stdout ?? '').trim();
  if (!ok(response) || !SHA.test(sha)) throw Object.assign(new Error('review head is unreadable'), { reasonCode: 'review_head_unreadable' });
  return sha;
}

/** Creates the review checklist for the current HEAD, or returns the one already open for it. */
export function initReview({ issue, spec, base = 'main', cwd = process.cwd(), run = defaultRun, restart = false, now = () => new Date() } = {}) {
  const specPath = String(spec ?? '').split('\\').join('/').replace(/\/$/, '');
  const headSha = head(cwd, run);
  const previous = readReview(cwd, issue);
  if (previous && previous.headSha === headSha && previous.specPath === specPath && !restart) {
    return { record: previous, resumed: true };
  }
  const rows = checklistRows(cwd, issue, specPath);
  const baseRef = ok(run('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`], { cwd })) ? `origin/${base}` : base;
  const reviewedPaths = changedSince(cwd, run, baseRef);
  const record = {
    schemaVersion: 1, issue, specPath, headSha, baseRef: base, mode: 'full', previous: null,
    reviewedPaths, repairPaths: [], previousFindings: [],
    lenses: REVIEW_LENSES.map((id) => ({ id, status: 'pending', summary: '' })),
    rows, findings: [], status: 'pending', createdAt: now().toISOString(),
  };
  const finalized = previous && ['passed', 'findings'].includes(previous.status) && previous.specPath === specPath
    && SHA.test(previous.headSha ?? '') && previous.headSha !== headSha
    && ok(run('git', ['merge-base', '--is-ancestor', previous.headSha, 'HEAD'], { cwd }));
  if (finalized) {
    const repairPaths = repairPathsSince(cwd, run, previous.headSha);
    const scope = repairPaths ? repairScope(previous, repairPaths) : { scoped: false, outside: [] };
    record.previous = { headSha: previous.headSha, status: previous.status };
    record.repairPaths = repairPaths ?? [];
    record.previousFindings = previous.findings;
    if (scope.scoped) {
      // Rows a prior finding named, and rows that did not pass, are checked again; the rest keep their verdicts.
      const recheck = new Set(previous.findings.flatMap((finding) => finding.rows ?? []));
      const carried = new Map(previous.rows.filter((row) => row.kind !== 'repair').map((row) => [row.id, row]));
      record.mode = 'scoped';
      record.rows = [
        ...rows.filter((row) => !carried.has(row.id)),
        ...[...carried.values()].map((row) => (recheck.has(row.id) || !['pass', 'not_applicable'].includes(row.verdict)
          ? { ...row, verdict: null, evidence: '', carried: false, ...(row.kind === 'acceptance' ? { exercised: null } : {}) }
          : { ...row, carried: true })),
        { id: 'REPAIR', kind: 'repair', title: `Repair diff since ${previous.headSha.slice(0, 12)}: ${record.repairPaths.join(', ')}`, verdict: null, evidence: '' },
      ];
    } else {
      record.scopeEscape = scope.outside;
    }
  }
  writeJson(cwd, reviewRecordPath(issue), record);
  return { record, resumed: false };
}

function unevaluated(record, required) {
  const gaps = [];
  for (const id of required) if (!record.rows.some((row) => row.id === id)) gaps.push(`${id} (row removed)`);
  for (const row of record.rows) {
    if (!row || typeof row.id !== 'string' || !ROW_KINDS.includes(row.kind)) { gaps.push(`${row?.id ?? '(unnamed row)'} (invalid row)`); continue; }
    if (!REVIEW_VERDICTS.includes(row.verdict)) gaps.push(`${row.id} (no verdict)`);
    else if (typeof row.evidence !== 'string' || !row.evidence.trim()) gaps.push(`${row.id} (no evidence)`);
    else if (row.kind === 'acceptance' && row.verdict !== 'not_applicable' && !EXERCISED.includes(row.exercised)) gaps.push(`${row.id} (exercised not recorded)`);
  }
  if (!record.rows.some((row) => row?.kind === 'design-path')) gaps.push('design-path (no row)');
  for (const id of REVIEW_LENSES) {
    if (record.lenses.find((lens) => lens?.id === id)?.status !== 'complete') gaps.push(`lens:${id} (not complete)`);
  }
  record.findings.forEach((finding, index) => {
    if (!finding || typeof finding.summary !== 'string' || !finding.summary.trim() || !REVIEW_SEVERITIES.includes(finding.severity)
      || !REVIEW_LENSES.includes(finding.lens) || !Array.isArray(finding.files) || !finding.files.every((file) => typeof file === 'string' && file)) {
      gaps.push(`finding ${finding?.id ?? index + 1} (needs summary, severity, lens and files)`);
    }
  });
  return gaps;
}

/** Every finding of the review: the recorded ones, plus one for each failing row that no finding names. */
export function reviewFindings(record) {
  const named = new Set(record.findings.flatMap((finding) => finding.rows ?? []));
  const implied = record.rows.filter((row) => FAILING_VERDICTS.includes(row.verdict) && !named.has(row.id))
    .map((row) => ({ id: `row:${row.id}`, lens: row.kind === 'design-path' ? 'failure-paths' : 'acceptance', severity: 'blocking',
      rows: [row.id], files: [], summary: `${row.id} is ${row.verdict}: ${row.evidence}` }));
  return [...record.findings.map((finding, index) => ({ id: finding.id ?? `F${index + 1}`, rows: [], ...finding })), ...implied];
}

function summaryMarkdown(record, findings) {
  const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const mocked = record.rows.filter((row) => row.exercised === 'mocked').map((row) => row.id);
  return [
    `# Review checklist for #${record.issue}`, '',
    `**Reviewed head**: ${record.headSha}`,
    `**Mode**: ${record.mode}${record.previous ? ` (previous review at ${record.previous.headSha}: ${record.previous.status})` : ''}`,
    `**Result**: ${record.status}`, '',
    '| Row | Kind | Verdict | Exercised | Evidence |', '|-----|------|---------|-----------|----------|',
    ...record.rows.map((row) => `| ${cell(row.id)} | ${row.kind} | ${row.verdict}${row.carried ? ' (carried)' : ''} | ${row.exercised ?? '—'} | ${cell(row.evidence)} |`),
    '', '## Lenses', '',
    ...record.lenses.map((lens) => `- ${lens.id}: ${lens.status}${lens.summary ? ` — ${cell(lens.summary)}` : ''}`),
    '', '## Findings', '',
    ...(findings.length ? findings.map((finding) => `- **${finding.id}** [${finding.severity}, ${finding.lens}] ${cell(finding.summary)}${finding.files.length ? ` (files: ${finding.files.join(', ')})` : ''}`) : ['None.']),
    '', '## Criteria whose tests mock the path under test', '',
    mocked.length ? mocked.map((id) => `- ${id}`).join('\n') : 'None.', '',
  ].join('\n');
}

function reviewHandoff(issue, status, summary, fields) {
  return { schemaVersion: 1, issue, step: 'verify', phase: 'review', status, intervention: false, summary,
    artifacts: [reviewRecordPath(issue), reviewSummaryPath(issue)], next: status === 'passed' ? 'verify' : 'implement',
    reasonCode: status === 'passed' ? null : 'review_findings', ...fields };
}

/**
 * Closes the review and writes the verify handoff. Returns `{ status, stdout, stderr, handoff }`: status 0 for a
 * passed review, 1 for a hand-back with findings, and 1 with no handoff when the checklist is refused.
 */
export function finalizeReview({ issue, spec, cwd = process.cwd(), run = defaultRun, now = () => new Date() } = {}) {
  const specPath = String(spec ?? '').split('\\').join('/').replace(/\/$/, '');
  const refuse = (reasonCode, detail) => ({ status: 1, handoff: null, stderr: '',
    stdout: `NMG_SDLC_REVIEW_REFUSED: ${JSON.stringify({ issue, reasonCode, ...detail })}\n` });
  const specDir = resolveSpecDir(cwd, issue);
  if (specDir !== resolve(cwd, specPath) || !isSpecApproved(specDir, issue)) return refuse('spec_not_approved', {});
  const record = readReview(cwd, issue);
  if (!record || record.specPath !== specPath) return refuse('review_record_missing', { record: reviewRecordPath(issue) });
  if (record.headSha !== head(cwd, run)) return refuse('review_head_changed', { reviewedHead: record.headSha });
  const required = checklistRows(cwd, issue, specPath).filter((row) => ['acceptance', 'requirement', 'consumer'].includes(row.kind)).map((row) => row.id);
  const gaps = unevaluated(record, required);
  // A review with a row, lens or finding left unevaluated cannot be handed back or passed.
  if (gaps.length) return refuse('review_checklist_incomplete', { unevaluated: gaps });
  const findings = reviewFindings(record);
  // Every finding goes back in one handoff; only an `info` note leaves the review passed.
  const failing = record.rows.some((row) => FAILING_VERDICTS.includes(row.verdict));
  const returned = failing ? findings : findings.filter((finding) => finding.severity !== 'info');
  const blocking = findings.filter((finding) => finding.severity === 'blocking');
  const mocked = record.rows.filter((row) => row.exercised === 'mocked').map((row) => row.id);
  record.status = returned.length ? 'findings' : 'passed';
  record.mockedEntryPoints = mocked;
  record.finalizedAt = now().toISOString();
  writeJson(cwd, reviewRecordPath(issue), record);
  writeJson(cwd, reviewSummaryPath(issue), summaryMarkdown(record, findings));
  const listed = findings.map((finding) => `${finding.id} [${finding.severity}] ${finding.summary}`).join('; ').slice(0, 6000);
  const handoff = returned.length
    ? reviewHandoff(issue, 'failed', `Review of #${issue} at ${record.headSha.slice(0, 12)} found ${findings.length} finding(s), ${blocking.length} blocking, with no validation run: ${listed}`,
      { reviewHead: record.headSha, mockedEntryPoints: mocked, findings: findings.map(({ id, severity, lens, files, summary }) => ({ id, severity, lens, files, summary })) })
    : reviewHandoff(issue, 'passed', `Review of #${issue} passed at ${record.headSha.slice(0, 12)}${findings.length ? ` with ${findings.length} non-blocking finding(s): ${listed}` : ''}${mocked.length ? `; criteria tested through mocks: ${mocked.join(', ')}` : ''}`,
      { reviewHead: record.headSha, mockedEntryPoints: mocked });
  const handoffPath = `.nmg-sdlc/handoffs/${issue}-verify.json`;
  const absolute = join(cwd, handoffPath);
  if (existsSync(absolute) && (lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isFile())) return refuse('handoff_target_unsafe', {});
  writeJson(cwd, handoffPath, handoff);
  return { status: returned.length ? 1 : 0, stdout: `NMG_SDLC_HANDOFF: ${handoffPath}\n`, stderr: '', handoff, handoffPath };
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (!['init', 'finalize', 'status'].includes(command)) return null;
  const options = { command, restart: false };
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--restart') { options.restart = true; continue; }
    const name = { '--issue': 'issue', '--spec': 'spec', '--base': 'base', '--controller-run-id': 'controllerRunId' }[rest[index]];
    if (!name || rest[index + 1] === undefined || options[name] !== undefined) return null;
    options[name] = rest[index += 1];
  }
  if (!/^#?[1-9]\d*$/.test(options.issue ?? '')) return null;
  options.issue = Number(String(options.issue).replace(/^#/, ''));
  if (!new RegExp(`^specs/${options.issue}-[^/]+/?$`).test(String(options.spec ?? '').split('\\').join('/'))) return null;
  return options;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (!options) { process.stderr.write(`${USAGE}\n`); return 2; }
  if (options.command === 'status') {
    const record = readReview(process.cwd(), options.issue);
    process.stdout.write(`${JSON.stringify(record ? { ok: true, status: record.status, mode: record.mode, headSha: record.headSha,
      rows: record.rows.length, findings: record.findings.length } : { ok: false, reasonCode: 'review_record_missing' })}\n`);
    return record ? 0 : 1;
  }
  let leaseContext;
  try { leaseContext = enterControllerLease({ projectRoot: process.cwd(), runId: options.controllerRunId }); } catch (error) {
    process.stdout.write(`${error?.reasonCode ?? 'controller_lease_held'}\n`);
    return 1;
  }
  try {
    if (options.command === 'init') {
      const { record, resumed } = initReview(options);
      process.stdout.write(`${JSON.stringify({ ok: true, resumed, record: reviewRecordPath(options.issue), mode: record.mode,
        headSha: record.headSha, rows: record.rows.map(({ id, kind, verdict, carried }) => ({ id, kind, verdict, ...(carried ? { carried } : {}) })),
        lenses: REVIEW_LENSES, repairPaths: record.repairPaths, previousFindings: record.previousFindings,
        ...(record.scopeEscape?.length ? { fullReviewBecause: record.scopeEscape } : {}) }, null, 2)}\n`);
      return 0;
    }
    const outcome = finalizeReview(options);
    process.stdout.write(outcome.stdout);
    return outcome.status;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, reasonCode: error.reasonCode ?? 'review_failed', summary: error.message })}\n`);
    return 1;
  } finally {
    if (leaseContext?.owned) releaseControllerLease(leaseContext.lease);
  }
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli();
