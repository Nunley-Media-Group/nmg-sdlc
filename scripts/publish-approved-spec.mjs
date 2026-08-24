#!/usr/bin/env node

/**
 * Publish an approved specs/{N}-{slug}/ package onto a branch cut from the
 * repository default, then squash-merge that spec-only PR. JSON stdout.
 * Never force-push. Never git add -A. Spec PRs must not close the issue.
 */

import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

import { isSpecApproved, resolveSpecDir, specStatus } from './sdlc-execute.mjs';
import { applySpecCreatedLabel, issueHasSpecCreatedLabel } from './spec-created-label.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';

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
  return { dir, branch: `${match[1]}-${match[2]}` };
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


function git(args) {
  return run('git', args);
}

function currentBranch() {
  return git(['branch', '--show-current']).stdout.trim();
}

function porcelain() {
  return git(['status', '--porcelain']).stdout;
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

function ensureOnBranch(issueN, name) {
  if (currentBranch() === name) return;
  const dirty = porcelain();
  if (dirty.trim() !== '') {
    process.stderr.write(dirty);
    fail('dirty_tree', { porcelain: dirty });
  }
  const base = readDefaultBranch();
  const fetched = git(['fetch', 'origin', base]);
  if (fetched.status !== 0) {
    fail('branch_checkout_failed', {
      stderr: fetched.stderr || '',
      stdout: fetched.stdout || '',
    });
  }
  const checkedOut = git(['checkout', '-B', name, `origin/${base}`]);
  if (checkedOut.status !== 0 || currentBranch() !== name) {
    fail('branch_checkout_failed', {
      stderr: checkedOut.stderr || '',
      stdout: checkedOut.stdout || '',
    });
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
  ensureOnBranch(issueN, name);
  ok({ branch: name });
}

function commitPush(argv) {
  const issueN = parseIssue(flag(argv, '--issue'));
  const { dir, branch } = parseSpecDir(issueN, flag(argv, '--dir'));
  if (!isSpecApproved(join(process.cwd(), dir), issueN)) {
    fail('spec_not_approved');
  }
  ensureOnBranch(issueN, branch);

  const added = git(['add', '--', dir]);
  if (added.status !== 0) {
    fail('add_failed', { stderr: added.stderr || '' });
  }

  const cached = git(['diff', '--cached', '--quiet', '--', dir]);
  let skippedCommit = false;
  let commit = null;
  if (cached.status === 0) {
    skippedCommit = true;
  } else {
    const committed = git(['commit', '--only', '-m', `docs: approve spec for #${issueN}`, '--', dir]);
    if (committed.status !== 0) {
      fail('commit_failed', { stderr: committed.stderr || '', stdout: committed.stdout || '' });
    }
    commit = git(['rev-parse', 'HEAD']).stdout.trim() || null;
  }

  const pushed = git(['push', '-u', 'origin', 'HEAD']);
  if (pushed.status !== 0) {
    fail('push_rejected', { stderr: pushed.stderr || '', stdout: pushed.stdout || '' });
  }

  ok({
    branch,
    commit,
    pushed: true,
    skippedCommit,
  });
}

function defaultBranch() {
  const name = readDefaultBranch();
  const checkedOut = git(['checkout', name]);
  if (checkedOut.status !== 0 || currentBranch() !== name) {
    fail('default_checkout_failed', { stderr: checkedOut.stderr || '' });
  }
  ok({ branch: name });
}

function mergeSpec(argv) {
  const issueN = parseIssue(flag(argv, '--issue'));
  const { dir, branch } = parseSpecDir(issueN, flag(argv, '--dir'));
  if (!isSpecApproved(join(process.cwd(), dir), issueN)) {
    fail('spec_not_approved');
  }
  ensureOnBranch(issueN, branch);

  const base = readDefaultBranch();
  if (base === branch) {
    fail('invalid_arguments', { detail: 'spec branch must not equal the default branch' });
  }

  const listed = run('gh', [
    'pr',
    'list',
    '--head',
    branch,
    '--base',
    base,
    '--json',
    'number',
    '--limit',
    '1',
  ]);
  let pr = listed.status === 0 ? firstPrNumber(listed.stdout) : null;
  if (pr == null) {
    const title = `docs: approve spec for #${issueN}`;
    const body = `Approved specification package for #${issueN}.\n\nThis pull request publishes the spec only.`;
    const created = run('gh', [
      'pr',
      'create',
      '--base',
      base,
      '--head',
      branch,
      '--title',
      title,
      '--body',
      body,
    ]);
    pr = created.status === 0 ? parseCreatedPr(created.stdout) : null;
    if (created.status !== 0 || pr == null) {
      fail('pr_create_failed', {
        stderr: created.stderr || '',
        stdout: created.stdout || '',
      });
    }
  }

  const merged = run('gh', ['pr', 'merge', String(pr), '--squash', '--delete-branch']);
  if (merged.status !== 0) {
    fail('pr_merge_failed', { stderr: merged.stderr || '', stdout: merged.stdout || '' });
  }

  const checkedOut = git(['checkout', base]);
  if (checkedOut.status !== 0 || currentBranch() !== base) {
    fail('default_checkout_failed', {
      stderr: checkedOut.stderr || '',
      merged: true,
      pr,
    });
  }
  const pulled = git(['pull', '--ff-only', 'origin', base]);
  if (pulled.status !== 0) {
    fail('default_checkout_failed', {
      stderr: pulled.stderr || '',
      stdout: pulled.stdout || '',
      merged: true,
      pr,
    });
  }
  try {
    applySpecCreatedLabel(issueN);
  } catch (error) {
    fail('spec_created_label_failed', {
      stderr: error?.stderr || error?.message || '',
      stdout: error?.stdout || '',
      merged: true,
      pr,
    });
  }

  ok({
    branch: base,
    pr,
    merged: true,
    squash: true,
    labeled: true,
  });
}

function main(argv = process.argv.slice(2)) {
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
    mergeSpec(rest);
    return;
  }
  if (command === 'default-branch') {
    defaultBranch();
    return;
  }
  fail('invalid_arguments', {
    detail: 'Usage: node scripts/publish-approved-spec.mjs <discover|candidates|missing-spec-created|prepare|commit-push|merge|default-branch> ...',
  });
}

if (isCliEntry(import.meta.url)) {
  main();
}
