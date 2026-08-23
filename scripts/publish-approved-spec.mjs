#!/usr/bin/env node

/**
 * Publish an approved specs/{N}-{slug}/ package onto a branch cut from the
 * repository default, then squash-merge that spec-only PR. JSON stdout.
 * Never force-push. Never git add -A. Spec PRs must not close the issue.
 */

import { spawnSync } from 'node:child_process';
import { join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSpecApproved } from './sdlc-execute.mjs';
import { applySpecCreatedLabel } from './spec-created-label.mjs';

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
  return Number.parseInt(raw, 10);
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
    fail('default_checkout_failed', { stderr: checkedOut.stderr || '' });
  }
  const pulled = git(['pull', '--ff-only', 'origin', base]);
  if (pulled.status !== 0) {
    fail('default_checkout_failed', { stderr: pulled.stderr || '', stdout: pulled.stdout || '' });
  }
  try {
    applySpecCreatedLabel(issueN);
  } catch (error) {
    fail('spec_created_label_failed', {
      stderr: error?.stderr || error?.message || '',
      stdout: error?.stdout || '',
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
    detail: 'Usage: node scripts/publish-approved-spec.mjs <prepare|commit-push|merge|default-branch> ...',
  });
}

const __filename = fileURLToPath(import.meta.url);
const isMainModule =
  process.argv[1] && pathResolve(process.argv[1]) === pathResolve(__filename);

if (isMainModule) {
  main();
}
