#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPEC_CREATED_LABEL = 'spec-created';

const LABEL_DESCRIPTION = 'Has an nmg-sdlc spec package';
const REQUIRED_SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function commandError(message, result) {
  const error = new Error(message);
  error.stdout = result?.stdout ?? '';
  error.stderr = result?.stderr ?? '';
  return error;
}

function parseJsonResult(result, message) {
  if (result?.status !== 0) throw commandError(message, result);
  try {
    return JSON.parse(result.stdout || 'null');
  } catch {
    throw commandError(message, result);
  }
}

function labelName(label) {
  return typeof label === 'string' ? label : label?.name;
}

export function issueHasSpecCreatedLabel(issue) {
  return Array.isArray(issue?.labels)
    && issue.labels.some((label) => labelName(label) === SPEC_CREATED_LABEL);
}

export function listIssueOwnedSpecNumbers(root) {
  const specsDir = path.join(path.resolve(root), 'specs');
  let entries;
  try {
    entries = fs.readdirSync(specsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const directoriesByNumber = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = /^(\d+)-/.exec(entry.name);
    if (!match) continue;
    const issue = Number(match[1]);
    if (!Number.isSafeInteger(issue) || issue <= 0) continue;
    const matches = directoriesByNumber.get(issue) ?? [];
    matches.push(entry.name);
    directoriesByNumber.set(issue, matches);
  }

  const owned = [];
  for (const [issue, directories] of directoriesByNumber) {
    if (directories.length !== 1) continue;
    const specDir = path.join(specsDir, directories[0]);
    const issuePattern = new RegExp(`^\\*\\*Issue\\*\\*:\\s*#${issue}\\s*$`, 'm');
    const complete = REQUIRED_SPEC_FILES.every((name) => {
      try {
        return issuePattern.test(fs.readFileSync(path.join(specDir, name), 'utf8'));
      } catch {
        return false;
      }
    });
    if (complete) owned.push(issue);
  }

  return owned.sort((left, right) => left - right);
}

export function ensureRepoLabel(run = defaultRun) {
  const list = run('gh', ['label', 'list', '--limit', '100', '--json', 'name']);
  const labels = parseJsonResult(list, 'Unable to list repository labels');
  if (!Array.isArray(labels)) throw commandError('Unable to list repository labels', list);
  if (labels.some((label) => label?.name === SPEC_CREATED_LABEL)) return;

  const create = run('gh', ['label', 'create', SPEC_CREATED_LABEL, '--description', LABEL_DESCRIPTION]);
  if (create?.status === 0) return;
  const output = `${create?.stdout ?? ''}\n${create?.stderr ?? ''}`;
  if (/already exists/i.test(output)) return;
  throw commandError('Unable to create spec-created label', create);
}

export function applySpecCreatedLabel(issueN, run = defaultRun) {
  const issue = Number(issueN);
  if (!Number.isSafeInteger(issue) || issue <= 0) {
    throw new Error('Issue number must be a positive safe integer');
  }
  ensureRepoLabel(run);
  const edit = run('gh', ['issue', 'edit', String(issue), '--add-label', SPEC_CREATED_LABEL]);
  if (edit?.status !== 0) throw commandError(`Unable to label issue #${issue}`, edit);
}

export function backfillSpecCreatedLabels(root, run = defaultRun) {
  const cwd = path.resolve(root);
  const runInRoot = (command, args, options = {}) => run(command, args, { ...options, cwd });
  const result = { ok: true, labeled: [], already: [], skipped: [], failed: [] };
  for (const issue of listIssueOwnedSpecNumbers(cwd)) {
    try {
      const view = runInRoot('gh', ['issue', 'view', String(issue), '--json', 'number,labels']);
      const issueData = parseJsonResult(view, `Unable to read issue #${issue}`);
      if (issueHasSpecCreatedLabel(issueData)) {
        result.already.push(issue);
        continue;
      }
      applySpecCreatedLabel(issue, runInRoot);
      result.labeled.push(issue);
    } catch (error) {
      result.failed.push({
        issue,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  result.ok = result.failed.length === 0;
  return result;
}

function parseCli(argv) {
  const [command, ...args] = argv;
  if (command === 'apply' && args.length === 2 && args[0] === '--issue') {
    const issue = Number(args[1]);
    if (Number.isSafeInteger(issue) && issue > 0) return { command, issue };
  }
  if (command === 'backfill') {
    if (args.length === 0) return { command, root: process.cwd() };
    if (args.length === 2 && args[0] === '--root') return { command, root: path.resolve(args[1]) };
  }
  return null;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (!options) {
    console.log(JSON.stringify({ ok: false, reasonCode: 'invalid_arguments' }));
    return 2;
  }
  try {
    if (options.command === 'apply') {
      applySpecCreatedLabel(options.issue);
      console.log(JSON.stringify({ ok: true, issue: options.issue, labeled: true }));
      return 0;
    }
    const result = backfillSpecCreatedLabels(options.root);
    console.log(JSON.stringify(result));
    return result.ok ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      reasonCode: 'spec_created_label_failed',
      message: error instanceof Error ? error.message : String(error),
    }));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}
