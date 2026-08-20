#!/usr/bin/env node

/**
 * Publish an approved specs/{N}-{slug}/ package onto branch {N}-{slug}.
 * JSON stdout. Never force-push. Never git add -A.
 */

import { spawnSync } from 'node:child_process';
import { join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSpecApproved } from './sdlc-execute.mjs';

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

function ensureOnBranch(issueN, name) {
  if (currentBranch() === name) return;
  const dirty = porcelain();
  if (dirty.trim() !== '') {
    process.stderr.write(dirty);
    fail('dirty_tree', { porcelain: dirty });
  }
  const developed = run('gh', ['issue', 'develop', String(issueN), '--checkout', '--name', name]);
  if (developed.status !== 0 || currentBranch() !== name) {
    fail('branch_checkout_failed', {
      stderr: developed.stderr || '',
      stdout: developed.stdout || '',
    });
  }
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

  const cached = git(['diff', '--cached', '--quiet']);
  let skippedCommit = false;
  let commit = null;
  if (cached.status === 0) {
    skippedCommit = true;
  } else {
    const committed = git(['commit', '-m', `docs: approve spec for #${issueN}`]);
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
  const checkedOut = git(['checkout', name]);
  if (checkedOut.status !== 0 || currentBranch() !== name) {
    fail('default_checkout_failed', { stderr: checkedOut.stderr || '' });
  }
  ok({ branch: name });
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
  if (command === 'default-branch') {
    defaultBranch();
    return;
  }
  fail('invalid_arguments', {
    detail: 'Usage: node scripts/publish-approved-spec.mjs <prepare|commit-push|default-branch> ...',
  });
}

const __filename = fileURLToPath(import.meta.url);
const isMainModule =
  process.argv[1] && pathResolve(process.argv[1]) === pathResolve(__filename);

if (isMainModule) {
  main();
}
