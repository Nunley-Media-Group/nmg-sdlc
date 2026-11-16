#!/usr/bin/env node

/**
 * Publish an approved specs/{N}-{slug}/ package from its own worktree on the
 * spec branch spec/{N}-{slug}, cut from the remote default branch, then
 * squash-merge that spec-only PR. The invoking checkout is never switched.
 * JSON stdout. Never force-push. Never git add -A. Spec PRs must not close the issue.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';

import { isSpecApproved, resolveSpecDir, specStatus } from './issue-spec-scope.mjs';
import { applySpecCreatedLabel, issueHasSpecCreatedLabel } from './spec-created-label.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import { parseDeliveryTaskFileLines } from './sdlc-safe-recoveries.mjs';
import { ensureWorktree, fastForwardPrimary, primaryCheckout, removeWorktree, specBranchName } from './sdlc-worktree.mjs';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(reasonCode, extra = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, reasonCode, ...extra })}\n`);
  process.exit(1);
}

function ok(payload) {
  process.stdout.write(`${JSON.stringify({ ok: true, ...payload })}\n`);
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || argv[index + 1] == null || argv[index + 1] === '') return null;
  return argv[index + 1];
}

function parseIssue(raw) {
  if (raw == null || !/^[1-9]\d*$/.test(String(raw))) {
    fail('invalid_arguments', { detail: 'issue must be a positive integer' });
  }
  const issueN = Number(raw);
  if (!Number.isSafeInteger(issueN)) {
    fail('invalid_arguments', { detail: 'issue must be a positive integer' });
  }
  return issueN;
}

function parseName(issueN, raw) {
  const name = String(raw || '');
  const match = name.match(/^([1-9]\d*)-(.+)$/);
  if (!match || Number.parseInt(match[1], 10) !== issueN || !SLUG_RE.test(match[2])) {
    fail('invalid_arguments', { detail: '--name must equal {N}-{slug}' });
  }
  return name;
}

function parseSpecDir(issueN, raw) {
  const dir = String(raw || '');
  if (dir.includes('..') || dir.includes('\\') || dir.startsWith('/')) {
    fail('invalid_arguments', { detail: '--dir must be specs/{N}-{slug}' });
  }
  const match = dir.match(/^specs\/([1-9]\d*)-([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (!match || Number.parseInt(match[1], 10) !== issueN) {
    fail('invalid_arguments', { detail: '--dir must be specs/{N}-{slug}' });
  }
  return { dir, name: `${match[1]}-${match[2]}` };
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
}
function readJson(result, reasonCode) {
  if (result.status !== 0) {
    fail(reasonCode, { stderr: result.stderr || '' });
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(reasonCode, { detail: 'malformed JSON' });
  }
}

function relativeSpecDir(dir) {
  if (!dir) return null;
  return dir.startsWith('specs/') ? dir : relative(process.cwd(), dir).split('\\').join('/');
}

function statusSource(status) {
  if (!status.dir) return null;
  if (!status.ref) return 'worktree';
  return status.ref.startsWith('origin/') ? 'remote' : 'local';
}

function discover(argv) {
  if (argv.length !== 2 || argv[0] !== '--issue') {
    fail('invalid_arguments', { detail: 'Usage: discover --issue N' });
  }
  const issueN = parseIssue(argv[1]);
  const issue = readJson(
    run('gh', ['issue', 'view', String(issueN), '--json', 'number,title,body,labels,state']),
    'issue_unreadable',
  );
  const validIssue = Number.isSafeInteger(issue?.number)
    && issue.number === issueN
    && typeof issue.title === 'string'
    && typeof issue.body === 'string'
    && typeof issue.state === 'string'
    && issue.state.length > 0
    && Array.isArray(issue.labels)
    && issue.labels.every((label) => typeof label?.name === 'string');
  if (!validIssue) {
    fail('issue_unreadable', { detail: 'issue output does not match the requested issue' });
  }

  const slug = issue.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'issue';
  const resolved = resolveSpecDir(process.cwd(), issueN, { detailed: true });
  if (resolved.reasonCode) fail(resolved.reasonCode);
  const status = specStatus(issueN, process.cwd());
  if (status.reasonCode) fail(status.reasonCode);
  const dir = relativeSpecDir(status.dir);
  const labels = issue.labels.map(({ name }) => name);
  ok({
    issue: {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      labels,
      state: issue.state,
    },
    classification: labels.some((name) => name.toLowerCase() === 'bug') ? 'bug' : 'feature',
    slug,
    targetDir: dir || (resolved.dir ? relativeSpecDir(resolved.dir) : `specs/${issueN}-${slug}`),
    spec: {
      dir,
      approved: status.approved,
      source: statusSource(status),
    },
  });
}

function parsePublished(argv) {
  const published = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    if (argv[index] !== '--published' || argv[index + 1] == null) {
      fail('invalid_arguments', { detail: 'Usage: candidates [--published N ...]' });
    }
    published.add(parseIssue(argv[index + 1]));
  }
  return published;
}

function candidates(argv) {
  const published = parsePublished(argv);
  const issues = readJson(
    run('gh', ['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title']),
    'issues_unreadable',
  );
  if (!Array.isArray(issues)
    || issues.some((issue) => !Number.isSafeInteger(issue?.number)
      || issue.number <= 0
      || typeof issue.title !== 'string')) {
    fail('issues_unreadable', { detail: 'issue list output is malformed' });
  }

  const unique = new Map();
  for (const issue of issues) {
    if (!unique.has(issue.number)) unique.set(issue.number, issue.title);
  }
  const rows = [];
  for (const [number, title] of [...unique].sort(([left], [right]) => left - right)) {
    if (published.has(number)) continue;
    const status = specStatus(number, process.cwd());
    if (status.reasonCode) fail(status.reasonCode, { issue: number });
    if (!status.approved) rows.push({ number, title });
  }
  ok({ candidates: rows });
}

function missingSpecCreated(argv) {
  if (argv.length !== 0) {
    fail('invalid_arguments', { detail: 'Usage: missing-spec-created' });
  }
  const issues = readJson(
    run('gh', ['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,labels']),
    'issues_unreadable',
  );
  const validIssues = Array.isArray(issues)
    && issues.every((issue) => Number.isSafeInteger(issue?.number)
      && issue.number > 0
      && typeof issue.title === 'string'
      && issue.title.length > 0
      && Array.isArray(issue.labels)
      && issue.labels.every((label) => typeof label === 'string'
        || (label !== null
          && typeof label === 'object'
          && typeof label.name === 'string')));
  if (!validIssues) {
    fail('issues_unreadable', { detail: 'issue list output is malformed' });
  }

  const unique = new Map();
  for (const issue of issues) {
    if (!issueHasSpecCreatedLabel(issue) && !unique.has(issue.number)) {
      unique.set(issue.number, issue.title);
    }
  }
  const rows = [...unique]
    .sort(([left], [right]) => left - right)
    .map(([number, title]) => ({ number, title }));
  ok({ issues: rows });
}


function git(args, cwd = process.cwd()) {
  return run('git', args, { cwd });
}

function readDefaultBranch() {
  const viewed = run('gh', [
    'repo',
    'view',
    '--json',
    'defaultBranchRef',
    '--jq',
    '.defaultBranchRef.name',
  ]);
  const name = viewed.status === 0 ? viewed.stdout.trim() : '';
  if (!name) {
    fail('default_branch_unreadable', { stderr: viewed.stderr || '' });
  }
  return name;
}

/** A primary checkout holding uncommitted or untracked work keeps its HEAD: it is not fast-forwarded. */
function primaryIsClean() {
  try {
    const status = git(['status', '--porcelain'], primaryCheckout(process.cwd()));
    return status.status === 0 && status.stdout.trim() === '';
  } catch {
    return false;
  }
}

/**
 * Creates, or reuses, the worktree of spec/{N}-{slug} from the remote default branch.
 * Every git command of a publication runs there, never in the invoking checkout.
 */
function specWorktree(name, base = readDefaultBranch()) {
  const branch = specBranchName(name);
  try {
    return { ...ensureWorktree({ cwd: process.cwd(), branch, base }), base };
  } catch (error) {
    return fail(error.reasonCode ?? 'worktree_create_failed', { branch, detail: error.message });
  }
}

function firstPrNumber(stdout) {
  try {
    const rows = JSON.parse(stdout);
    const number = rows?.[0]?.number;
    if (Number.isInteger(number) && number > 0) return number;
  } catch {
    return null;
  }
  return null;
}

function parseCreatedPr(stdout) {
  const url = String(stdout || '').trim().split('\n').at(-1) || '';
  const match = url.match(/\/pull\/(\d+)\s*$/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function prepare(argv) {
  const issueN = parseIssue(flag(argv, '--issue'));
  const name = parseName(issueN, flag(argv, '--name'));
  const tree = specWorktree(name);
  ok({
    branch: tree.branch,
    worktree: tree.path,
    specDir: join(tree.path, 'specs', name),
    created: tree.created,
  });
}

/** The approved, valid package must be in the spec worktree; a copy in the invoking checkout is never published. */
function requirePublishablePackage(tree, dir, issueN) {
  if (!isSpecApproved(join(tree.path, dir), issueN)) {
    const elsewhere = resolve(process.cwd()) !== resolve(tree.path) && isSpecApproved(join(process.cwd(), dir), issueN);
    fail(elsewhere ? 'spec_outside_worktree' : 'spec_not_approved', {
      branch: tree.branch,
      worktree: tree.path,
      specDir: join(tree.path, dir),
      ...(elsewhere ? { detail: 'the approved package is in the invoking checkout; write it under specDir' } : {}),
    });
  }
  try {
    parseDeliveryTaskFileLines(readFileSync(join(tree.path, dir, 'tasks.md'), 'utf8'), {
      spec: `${dir}/tasks.md`,
    });
  } catch (error) {
    fail(error.reasonCode ?? 'publication_scope_unproven', {
      spec: error.spec,
      taskId: error.taskId,
      line: error.line,
      entry: error.entry,
      syntax: error.syntax,
    });
  }
}

function commitPush(argv) {
  const issueN = parseIssue(flag(argv, '--issue'));
  const { dir, name } = parseSpecDir(issueN, flag(argv, '--dir'));
  const tree = specWorktree(name);
  requirePublishablePackage(tree, dir, issueN);

  const added = git(['add', '--', dir], tree.path);
  if (added.status !== 0) {
    fail('add_failed', { stderr: added.stderr || '' });
  }

  const cached = git(['diff', '--cached', '--quiet', '--', dir], tree.path);
  let skippedCommit = false;
  let commit = null;
  if (cached.status === 0) {
    skippedCommit = true;
  } else {
    const committed = git(['commit', '--only', '-m', `docs: approve spec for #${issueN}`, '--', dir], tree.path);
    if (committed.status !== 0) {
      fail('commit_failed', { stderr: committed.stderr || '', stdout: committed.stdout || '' });
    }
    commit = git(['rev-parse', 'HEAD'], tree.path).stdout.trim() || null;
  }

  const pushed = git(['push', '-u', 'origin', 'HEAD'], tree.path);
  if (pushed.status !== 0) {
    fail('push_rejected', { stderr: pushed.stderr || '', stdout: pushed.stdout || '' });
  }

  ok({
    branch: tree.branch,
    worktree: tree.path,
    commit,
    pushed: true,
    skippedCommit,
  });
}

const PASSING_CHECK_STATES = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const PENDING_CHECK_STATES = new Set(['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED', 'EXPECTED']);

function reportedChecks(pr, head, required) {
  const args = ['pr', 'checks', String(pr)];
  if (required) args.push('--required');
  const result = run('gh', [...args, '--json', 'name,state,bucket']);
  const noChecksReported = result.status === 1 && !String(result.stdout || '').trim()
    && /^no (?:required )?checks reported on the .+ branch$/i.test(String(result.stderr || '').trim());
  let checks;
  try {
    checks = noChecksReported ? [] : JSON.parse(result.stdout);
  } catch {
    fail('pr_readiness_failed', { pr, head, detail: 'checks returned invalid JSON', stderr: result.stderr || '' });
  }
  if (![0, 1, 8].includes(result.status) || !Array.isArray(checks)
    || (result.status === 1 && checks.length === 0 && !noChecksReported
      && String(result.stderr || '').trim())) {
    fail('pr_readiness_failed', { pr, head, detail: 'checks unavailable', stderr: result.stderr || '' });
  }
  return checks;
}

const ACCOUNT_PLAN_UNAVAILABLE = 'Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)';

// Only this exact GitHub diagnostic proves the policy source is absent on the account plan;
// every other discovery failure stays fail-closed.
function isAccountPlanCapabilityUnavailable(result) {
  if (!Number.isInteger(result.status) || result.status === 0) return false;
  return String(result.stderr || '').split('\n').some((line) => {
    const trimmed = line.trim();
    return trimmed === ACCOUNT_PLAN_UNAVAILABLE || trimmed === `gh: ${ACCOUNT_PLAN_UNAVAILABLE}`;
  });
}

function expectedCheckNames(pr, head, url, base) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/\d+\/?$/.exec(url ?? '');
  if (!match) fail('pr_readiness_failed', { pr, head, detail: 'PR repository identity unavailable' });
  const path = `repos/${match[1]}/${match[2]}`;
  const rulesResult = run('gh', ['api', `${path}/rules/branches/${encodeURIComponent(base)}`]);
  const rules = isAccountPlanCapabilityUnavailable(rulesResult) ? [] : readJson(rulesResult, 'pr_readiness_failed');
  if (!Array.isArray(rules)) fail('pr_readiness_failed', { pr, head, detail: 'branch rules unavailable' });
  const expected = new Set();
  for (const rule of rules) {
    if (rule.type !== 'required_status_checks') continue;
    if (!Array.isArray(rule.parameters?.required_status_checks)) {
      fail('pr_readiness_failed', { pr, head, detail: 'required branch rules malformed' });
    }
    for (const check of rule.parameters.required_status_checks) {
      if (typeof check.context !== 'string' || !check.context) {
        fail('pr_readiness_failed', { pr, head, detail: 'required check context malformed' });
      }
      expected.add(check.context);
    }
  }
  const protection = run('gh', [
    'api', `${path}/branches/${encodeURIComponent(base)}/protection/required_status_checks`,
  ]);
  if (protection.status === 0) {
    let policy;
    try { policy = JSON.parse(protection.stdout); } catch {
      fail('pr_readiness_failed', { pr, head, detail: 'branch protection malformed' });
    }
    if (!Array.isArray(policy.contexts) || !Array.isArray(policy.checks)) {
      fail('pr_readiness_failed', { pr, head, detail: 'branch protection checks malformed' });
    }
    for (const name of policy.contexts) expected.add(name);
    for (const check of policy.checks) expected.add(check.context);
  } else if (!isAccountPlanCapabilityUnavailable(protection) && (protection.status !== 1
    || !/Branch not protected/.test(`${protection.stdout || ''} ${protection.stderr || ''}`))) {
    fail('pr_readiness_failed', { pr, head, detail: 'branch protection unavailable', stderr: protection.stderr || '' });
  }
  return expected;
}

function publicationSnapshot(pr, branch, base, head) {
  const details = readJson(run('gh', [
    'pr', 'view', String(pr), '--json',
    'number,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,url',
  ]), 'pr_readiness_failed');
  if (details.number !== pr || details.state !== 'OPEN'
    || details.headRefName !== branch || details.baseRefName !== base
    || !/^[0-9a-f]{40}$/i.test(String(details.headRefOid ?? ''))
    || details.headRefOid !== head) {
    fail('pr_head_changed', { pr, head, observed: details });
  }
  if (typeof details.isDraft !== 'boolean') {
    fail('pr_readiness_failed', { pr, head, detail: 'PR draft state unavailable' });
  }
  if (details.isDraft) fail('pr_merge_blocked', { pr, head, isDraft: true });

  // The ruleset may require a check before it has reported to this PR.
  const expected = expectedCheckNames(pr, head, details.url, base);
  const requiredChecks = reportedChecks(pr, head, true);
  const checks = [...requiredChecks, ...reportedChecks(pr, head, false)];
  const failed = checks.find((check) => check.bucket === 'fail'
    || ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(check.state));
  if (failed) fail('pr_check_failed', { pr, head, check: failed });
  const unknown = checks.find((check) => !PASSING_CHECK_STATES.has(check.state)
    && !PENDING_CHECK_STATES.has(check.state));
  if (unknown) fail('pr_readiness_failed', { pr, head, detail: 'unknown PR check state', check: unknown });
  const pending = checks.length === 0 || checks.some((check) => PENDING_CHECK_STATES.has(check.state))
    || [...expected].some((name) => !checks.some((check) => check.name === name));
  if (!['CLEAN', 'UNKNOWN', 'BLOCKED', 'UNSTABLE'].includes(details.mergeStateStatus)
    || (!pending && details.mergeStateStatus === 'BLOCKED')) {
    fail('pr_merge_blocked', { pr, head, mergeStateStatus: details.mergeStateStatus });
  }
  return !pending && details.mergeStateStatus === 'CLEAN';
}

async function awaitPublicationReady(pr, branch, base, head) {
  for (;;) {
    if (publicationSnapshot(pr, branch, base, head)
      && publicationSnapshot(pr, branch, base, head)) return head;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

function mergedPrAtHead(pr, branch, base, head) {
  const viewed = run('gh', [
    'pr', 'view', String(pr), '--json', 'number,state,headRefName,headRefOid,baseRefName',
  ]);
  if (viewed.status !== 0) return false;
  let details;
  try { details = JSON.parse(viewed.stdout); } catch { return false; }
  return details.number === pr && details.state === 'MERGED'
    && details.headRefName === branch && details.baseRefName === base
    && details.headRefOid === head;
}

/** Whether the spec directory at the spec worktree's head is the one already on the fetched remote default branch. */
function specPublishedOnBase(tree, base, dir) {
  const ref = `refs/remotes/origin/${base}`;
  if (git(['fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${base}:${ref}`], tree.path).status !== 0) {
    fail('pr_readiness_failed', { detail: 'default branch fetch failed' });
  }
  const local = git(['rev-parse', '--verify', '--quiet', `HEAD:${dir}`], tree.path);
  const remote = git(['rev-parse', '--verify', '--quiet', `${ref}:${dir}`], tree.path);
  return local.status === 0 && remote.status === 0 && local.stdout.trim() === remote.stdout.trim();
}

/** The merged spec PR for the spec worktree's head, or null when a new spec PR must be opened. Merged PRs at other
 * heads are earlier publications of this issue's spec: a revised package opens a new PR, and a package already equal
 * to the default branch's reports the latest of them. */
function priorMergedPr(tree, base, head, dir) {
  const { branch } = tree;
  const listed = run('gh', [
    'pr', 'list', '--head', branch, '--base', base, '--state', 'all',
    '--json', 'number,headRefOid,state', '--limit', '100',
  ]);
  if (listed.status !== 0) fail('pr_readiness_failed', { stderr: listed.stderr || '' });
  let rows;
  try { rows = JSON.parse(listed.stdout); } catch {
    fail('pr_readiness_failed', { detail: 'PR history returned invalid JSON' });
  }
  if (!Array.isArray(rows) || rows.some((row) => !Number.isSafeInteger(row.number)
    || row.number <= 0 || !['OPEN', 'MERGED', 'CLOSED'].includes(row.state)
    || (row.state === 'MERGED' && !/^[0-9a-f]{40}$/i.test(String(row.headRefOid ?? ''))))) {
    fail('pr_readiness_failed', { detail: 'PR history malformed' });
  }
  const merged = rows.filter((row) => row.state === 'MERGED' && row.headRefOid === head);
  if (rows.length === 100 || merged.length > 1 || (merged.length === 1
    && !mergedPrAtHead(merged[0].number, branch, base, head))) {
    fail('pr_head_changed', { head, detail: 'merged PR history ambiguous or unproven' });
  }
  if (merged.length === 1) return merged[0].number;
  const earlier = rows.filter((row) => row.state === 'MERGED').map((row) => row.number);
  if (earlier.length && specPublishedOnBase(tree, base, dir)) return Math.max(...earlier);
  return null;
}

async function mergeSpec(argv) {
  const issueN = parseIssue(flag(argv, '--issue'));
  const { dir, name } = parseSpecDir(issueN, flag(argv, '--dir'));
  const base = readDefaultBranch();
  const tree = specWorktree(name, base);
  const { branch } = tree;
  requirePublishablePackage(tree, dir, issueN);

  const head = git(['rev-parse', 'HEAD'], tree.path).stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(head)) fail('pr_readiness_failed', { detail: 'local head unavailable' });
  // --head is the spec namespace, so the code PR on {N}-{slug} is never selected.
  const listed = run('gh', [
    'pr', 'list', '--head', branch, '--base', base, '--json', 'number', '--limit', '1',
  ]);
  if (listed.status !== 0) fail('pr_readiness_failed', { stderr: listed.stderr || '' });
  let pr = firstPrNumber(listed.stdout);
  let alreadyMerged = false;
  if (pr == null) {
    pr = priorMergedPr(tree, base, head, dir);
    alreadyMerged = pr != null;
  }
  if (pr == null) {
    const title = `docs: approve spec for #${issueN}`;
    const body = `Approved specification package for #${issueN}.\n\nThis pull request publishes the spec only.`;
    const created = run('gh', [
      'pr', 'create', '--base', base, '--head', branch, '--title', title, '--body', body,
    ]);
    pr = created.status === 0 ? parseCreatedPr(created.stdout) : null;
    if (created.status !== 0 || pr == null) {
      fail('pr_create_failed', { stderr: created.stderr || '', stdout: created.stdout || '' });
    }
  }

  if (!alreadyMerged) {
    // A spec pull request carries the spec package and nothing else.
    const scope = run('gh', ['pr', 'view', String(pr), '--json', 'files', '--jq', '.files[].path']);
    if (scope.status !== 0) fail('pr_readiness_failed', { pr, stderr: scope.stderr || '' });
    const outside = String(scope.stdout ?? '').split(/\r?\n/).filter(Boolean).filter((file) => !file.startsWith(`${dir}/`));
    if (outside.length) fail('pr_scope_invalid', { pr, outside });
    const readyHead = await awaitPublicationReady(pr, branch, base, head);
    // No --delete-branch: gh would try to delete a local branch that the spec worktree still holds.
    const merged = run('gh', ['pr', 'merge', String(pr), '--squash', '--match-head-commit', readyHead]);
    if (merged.status !== 0 && !mergedPrAtHead(pr, branch, base, readyHead)) {
      fail('pr_merge_failed', { pr, stderr: merged.stderr || '', stdout: merged.stdout || '' });
    }
  }

  let labelError = null;
  try {
    applySpecCreatedLabel(issueN);
  } catch (error) {
    labelError = { stderr: error?.stderr || error?.message || '', stdout: error?.stdout || '' };
  }
  // Best-effort cleanup: none of it can turn a merged publication into a failure.
  const remoteBranchDeleted = git(['push', 'origin', '--delete', branch], tree.path).status === 0;
  const fastForwarded = primaryIsClean() && fastForwardPrimary({ cwd: process.cwd(), base });
  const cleanup = removeWorktree({ cwd: process.cwd(), branch });
  const published = {
    branch,
    base,
    pr,
    merged: true,
    issue: issueN,
    dir,
    fastForwarded,
    remoteBranchDeleted,
    worktreeRemoved: cleanup.removed,
    cleanup: cleanup.lines,
  };
  if (labelError) fail('spec_created_label_failed', { ...labelError, ...published });
  ok({ ...published, squash: true, labeled: true });
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command === 'discover') {
    discover(rest);
    return;
  }
  if (command === 'candidates') {
    candidates(rest);
    return;
  }
  if (command === 'missing-spec-created') {
    missingSpecCreated(rest);
    return;
  }
  if (command === 'prepare') {
    prepare(rest);
    return;
  }
  if (command === 'commit-push') {
    commitPush(rest);
    return;
  }
  if (command === 'merge') {
    await mergeSpec(rest);
    return;
  }
  fail('invalid_arguments', {
    detail: 'Usage: node scripts/publish-approved-spec.mjs <discover|candidates|missing-spec-created|prepare|commit-push|merge> ...',
  });
}

if (isCliEntry(import.meta.url)) {
  main().catch((error) => fail('publication_failed', { detail: error.message }));
}
