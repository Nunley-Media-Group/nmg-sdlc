#!/usr/bin/env node

/**
 * Opt-in live exercise for GitHub linked-branch closing semantics.
 *
 * This creates and merges fixture pull requests. It refuses to run without an
 * explicit repository and acknowledgement flag. Use only with a disposable
 * authenticated repository whose default branch accepts fixture merges.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  inspectUmbrellaPublication,
  publicationBranchName,
  publicationMarker,
} from './umbrella-publication-status.mjs';

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    timeout: options.timeout ?? 120_000,
    env: process.env,
  }).trim();
}

function positiveFromUrl(url, kind) {
  const match = String(url).match(new RegExp(`/${kind}/([1-9]\\d*)/?$`));
  if (!match) throw new Error(`could not parse ${kind} number from ${url}`);
  return Number(match[1]);
}

function write(root, relativePath, source) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function writeSpec(root, specPath, issueNumber, label) {
  write(root, `${specPath}/requirements.md`, [
    `# Requirements: ${label}`,
    '',
    `**Issues**: #${issueNumber}`,
    '',
    '| ID | Requirement | Priority |',
    '|----|-------------|----------|',
    '| FR1 | Deliver through multiple PRs | Must |',
    '',
  ].join('\n'));
  write(root, `${specPath}/design.md`, `# Design: ${label}\n\n**Issues**: #${issueNumber}\n\n## Multi-PR Rollout\n\nFixture.\n`);
  write(root, `${specPath}/tasks.md`, `# Tasks: ${label}\n\n- [ ] T001\n`);
  write(root, `${specPath}/feature.gherkin`, `Feature: ${label}\n`);
}

function checkoutRemoteBranch(work, branch) {
  run('git', ['fetch', 'origin', `refs/heads/${branch}:refs/remotes/origin/${branch}`], { cwd: work });
  run('git', ['checkout', '-B', branch, `origin/${branch}`], { cwd: work });
}

function createIssue(repository, title) {
  const url = run('gh', [
    'issue', 'create', '--repo', repository,
    '--title', title,
    '--body', 'Disposable nmg-sdlc GitHub closing-semantics exercise fixture.',
  ]);
  return { number: positiveFromUrl(url, 'issues'), url };
}

function createPr({ repository, base, head, issueNumber, specPath, tree, title }) {
  const body = [
    `Refs #${issueNumber}`,
    '',
    publicationMarker({ issueNumber, specPath, tree }),
    '',
    'Disposable nmg-sdlc closing-semantics exercise fixture.',
  ].join('\n');
  const url = run('gh', [
    'pr', 'create', '--repo', repository,
    '--base', base, '--head', head,
    '--title', title, '--body', body,
  ]);
  return { number: positiveFromUrl(url, 'pull'), url };
}

function classify({ work, repository, issueNumber, pullRequestNumber, specPath, tree, sourceCommit, base }) {
  return inspectUmbrellaPublication({
    projectRoot: work,
    repository,
    issueNumber,
    pullRequestNumber,
    specPath,
    tree,
    sourceCommit,
    base,
  });
}

async function waitForStatus(expectedStatus, inputs) {
  let result = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    result = classify(inputs);
    if (result.status === expectedStatus) return result;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`timed out waiting for ${expectedStatus}; last result: ${JSON.stringify(result)}`);
}

function mergeFixture(repository, pullRequestNumber, sourceCommit) {
  run('gh', [
    'pr', 'merge', String(pullRequestNumber), '--repo', repository,
    '--squash', '--match-head-commit', sourceCommit,
  ], { timeout: 300_000 });
}

function bestEffort(command, args, options = {}) {
  try {
    run(command, args, options);
  } catch {
    // Cleanup must not hide the primary exercise result.
  }
}

async function exercise({ repository, base }) {
  const stamp = `${Date.now()}-${process.pid}`;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-github-publication-'));
  const work = path.join(root, 'work');
  const branches = [];
  const issues = [];
  let result;

  try {
    run('gh', ['repo', 'clone', repository, work, '--', '--no-tags']);
    run('git', ['config', 'user.name', 'nmg-sdlc publication exercise'], { cwd: work });
    run('git', ['config', 'user.email', 'nmg-sdlc-exercise@example.invalid'], { cwd: work });
    const defaultBranch = base || run('gh', [
      'repo', 'view', repository, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name',
    ]);

    const controlIssue = createIssue(repository, `[nmg-sdlc fixture ${stamp}] linked publication closes`);
    issues.push(controlIssue.number);
    const controlHead = `nmg-sdlc-fixture-linked-${stamp}`;
    branches.push(controlHead);
    run('gh', [
      'issue', 'develop', String(controlIssue.number), '--repo', repository,
      '--base', defaultBranch, '--name', controlHead,
    ]);
    checkoutRemoteBranch(work, controlHead);
    const controlSpec = `specs/feature-publication-control-${stamp}`;
    writeSpec(work, controlSpec, controlIssue.number, `Linked publication control ${stamp}`);
    run('git', ['add', controlSpec], { cwd: work });
    run('git', ['commit', '-m', `docs: add linked publication control ${stamp}`], { cwd: work });
    const controlCommit = run('git', ['rev-parse', 'HEAD'], { cwd: work });
    const controlTree = run('git', ['rev-parse', `HEAD:${controlSpec}`], { cwd: work });
    run('git', ['push', 'origin', controlHead], { cwd: work });
    const controlPr = createPr({
      repository,
      base: defaultBranch,
      head: controlHead,
      issueNumber: controlIssue.number,
      specPath: controlSpec,
      tree: controlTree,
      title: `docs: linked publication control ${stamp}`,
    });
    const controlInputs = {
      work,
      repository,
      issueNumber: controlIssue.number,
      pullRequestNumber: controlPr.number,
      specPath: controlSpec,
      tree: controlTree,
      sourceCommit: controlCommit,
      base: defaultBranch,
    };
    const controlBefore = classify(controlInputs);
    if (controlBefore.status !== 'closing_relationship') {
      throw new Error(`linked control did not expose a closing relationship: ${JSON.stringify(controlBefore)}`);
    }
    mergeFixture(repository, controlPr.number, controlCommit);
    const controlAfter = await waitForStatus('publication_closed_umbrella', controlInputs);

    run('git', ['checkout', defaultBranch], { cwd: work });
    run('git', ['pull', '--ff-only', 'origin', defaultBranch], { cwd: work });
    const safeIssue = createIssue(repository, `[nmg-sdlc fixture ${stamp}] unlinked publication remains open`);
    issues.push(safeIssue.number);
    const safeSourceHead = `nmg-sdlc-fixture-source-${stamp}`;
    branches.push(safeSourceHead);
    run('gh', [
      'issue', 'develop', String(safeIssue.number), '--repo', repository,
      '--base', defaultBranch, '--name', safeSourceHead,
    ]);
    checkoutRemoteBranch(work, safeSourceHead);
    const safeSpec = `specs/feature-publication-safe-${stamp}`;
    writeSpec(work, safeSpec, safeIssue.number, `Unlinked publication ${stamp}`);
    run('git', ['add', safeSpec], { cwd: work });
    run('git', ['commit', '-m', `docs: add unlinked publication fixture ${stamp}`], { cwd: work });
    const safeCommit = run('git', ['rev-parse', 'HEAD'], { cwd: work });
    const safeTree = run('git', ['rev-parse', `HEAD:${safeSpec}`], { cwd: work });
    run('git', ['push', 'origin', safeSourceHead], { cwd: work });
    const safePublicationHead = publicationBranchName(safeIssue.number, safeTree);
    branches.push(safePublicationHead);
    run('git', ['push', 'origin', `${safeCommit}:refs/heads/${safePublicationHead}`], { cwd: work });
    const safePr = createPr({
      repository,
      base: defaultBranch,
      head: safePublicationHead,
      issueNumber: safeIssue.number,
      specPath: safeSpec,
      tree: safeTree,
      title: `docs: unlinked publication fixture ${stamp}`,
    });
    const safeInputs = {
      work,
      repository,
      issueNumber: safeIssue.number,
      pullRequestNumber: safePr.number,
      specPath: safeSpec,
      tree: safeTree,
      sourceCommit: safeCommit,
      base: defaultBranch,
    };
    const safeBefore = classify(safeInputs);
    if (safeBefore.status !== 'pending_safe') {
      throw new Error(`unlinked publication was not pending-safe: ${JSON.stringify(safeBefore)}`);
    }
    mergeFixture(repository, safePr.number, safeCommit);
    const safeAfter = await waitForStatus('merged_safe', safeInputs);
    if (safeAfter.evidence.issueState !== 'OPEN' || safeAfter.evidence.publicationClosedEvents.length !== 0) {
      throw new Error(`unlinked umbrella did not remain open: ${JSON.stringify(safeAfter)}`);
    }

    result = {
      repository,
      defaultBranch,
      stamp,
      control: { issue: controlIssue, pullRequest: controlPr, before: controlBefore, after: controlAfter },
      unlinked: { issue: safeIssue, pullRequest: safePr, before: safeBefore, after: safeAfter },
    };
    return result;
  } finally {
    if (result?.unlinked?.issue?.number) {
      bestEffort('gh', [
        'issue', 'close', String(result.unlinked.issue.number), '--repo', repository,
        '--reason', 'not planned',
      ]);
    } else {
      for (const issue of issues) {
        bestEffort('gh', ['issue', 'close', String(issue), '--repo', repository, '--reason', 'not planned']);
      }
    }
    for (const branch of branches) {
      bestEffort('git', ['push', 'origin', '--delete', branch], { cwd: work });
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      repository: { type: 'string' },
      base: { type: 'string' },
      'acknowledge-live-writes': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  if (!values.repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(values.repository)) {
    throw new Error('--repository must be an explicit owner/name disposable repository');
  }
  if (!values['acknowledge-live-writes']) {
    throw new Error('--acknowledge-live-writes is required because this exercise creates and merges fixture PRs');
  }
  if (!values.json) throw new Error('--json is required');
  return { repository: values.repository, base: values.base ?? null };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/exercise-github-umbrella-publication.mjs --repository <owner/disposable-repo> --acknowledge-live-writes --json [--base <branch>]',
    '',
    'WARNING: creates issues, branches, commits, and PRs and merges fixture PRs.',
  ].join('\n');
}

async function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Argument error: ${error.message}\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  try {
    process.stdout.write(`${JSON.stringify(await exercise(options), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Exercise failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

main();
