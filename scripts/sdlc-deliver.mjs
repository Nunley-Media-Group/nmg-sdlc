#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fsDefault from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyPrDeliveryState } from './pr-delivery-state.mjs';
import { inspectVerificationReadiness } from './verification-readiness.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';

const USAGE = 'Usage: node scripts/sdlc-deliver.mjs --issue N [--remediation-result human_review]';
const REQUIRED_SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];
const ISSUE = /^#?([1-9]\d*)$/;
const SHA = /^[0-9a-f]{40}$/i;
const POLL_INTERVAL_MS = 30_000;
const PENDING_CEILING_MS = 60 * 60 * 1000;

function defaultRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function command(run, cwd, executable, args, { allowFailure = false } = {}) {
  const result = run(executable, args, { cwd });
  if (!result || typeof result.status !== 'number') throw new Error(`${executable} returned an invalid result`);
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${executable} ${args.join(' ')} failed: ${String(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function jsonCommand(run, cwd, executable, args, options) {
  const result = command(run, cwd, executable, args, options);
  try {
    return { result, value: JSON.parse(String(result.stdout || '').trim() || 'null') };
  } catch (error) {
    throw new Error(`${executable} returned invalid JSON: ${error.message}`);
  }
}

function positiveIssue(value) {
  const match = String(value ?? '').match(ISSUE);
  if (!match) return null;
  const issue = Number(match[1]);
  return Number.isSafeInteger(issue) ? issue : null;
}

export function parseDeliverCli(argv) {
  let issue = null;
  let remediationResult = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--issue' && issue === null && index + 1 < argv.length) {
      issue = positiveIssue(argv[index += 1]);
      if (!issue) throw new Error(USAGE);
      continue;
    }
    if (arg === '--remediation-result' && remediationResult === null && index + 1 < argv.length) {
      remediationResult = argv[index += 1];
      if (remediationResult !== 'human_review') throw new Error(USAGE);
      continue;
    }
    throw new Error(USAGE);
  }
  if (!issue) throw new Error(USAGE);
  return { issue, remediationResult };
}

function handoffFor(issue, status, summary, artifacts, reasonCode) {
  return {
    schemaVersion: 1,
    issue,
    step: 'deliver',
    status,
    intervention: status !== 'passed',
    summary,
    artifacts,
    next: null,
    reasonCode,
  };
}

function writeHandoff({ cwd, fs, issue, status, summary, artifacts = [], reasonCode = null }) {
  const handoffPath = `.omp/sdlc/handoffs/${issue}-deliver.json`;
  const absolute = path.join(cwd, handoffPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const handoff = handoffFor(issue, status, summary, artifacts, reasonCode);
  fs.writeFileSync(absolute, `${JSON.stringify(handoff, null, 2)}\n`);
  return {
    status: status === 'passed' ? 0 : 1,
    stdout: `NMG_SDLC_HANDOFF: ${handoffPath}\n`,
    stderr: '',
    handoff,
    handoffPath,
  };
}

function fail(context, reasonCode, summary) {
  return writeHandoff({ ...context, status: 'failed', reasonCode, summary });
}

function approvedSpec(fs, cwd, issue) {
  const specsRoot = path.join(cwd, 'specs');
  const prefix = `${issue}-`;
  const matches = fs.readdirSync(specsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort();
  if (matches.length !== 1) throw new Error('spec_not_approved');
  const relative = `specs/${matches[0]}`;
  const root = path.join(cwd, relative);
  const files = {};
  for (const name of REQUIRED_SPEC_FILES) {
    const content = fs.readFileSync(path.join(root, name), 'utf8');
    if (!new RegExp(`^\\*\\*Issue\\*\\*:\\s*#?${issue}$`, 'm').test(content)
      || !/^\*\*Status\*\*:\s*Approved$/m.test(content)) {
      throw new Error('spec_not_approved');
    }
    files[name] = content;
  }
  const verificationPath = path.join(root, 'verification-report.md');
  if (!fs.existsSync(verificationPath)) throw new Error('verification_not_ready');
  return { root, relative, files, verificationPath };
}

function issueLabels(issue) {
  return (Array.isArray(issue.labels) ? issue.labels : [])
    .map((label) => typeof label === 'string' ? label : label?.name)
    .filter(Boolean)
    .map((label) => label.toLowerCase());
}

function semver(value) {
  const match = String(value).trim().match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!match) throw new Error('invalid VERSION');
  return match.slice(1).map(Number);
}

function bumpedVersion(current, bump) {
  let [major, minor, patch] = semver(current);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return `${major}.${minor + 1}.0`;
}

function approvedMajor(spec) {
  return /^\*\*Version bump\*\*:\s*major\s*$/im.test(spec.files['requirements.md'])
    || /^\*\*Version bump\*\*:\s*major\s*$/im.test(spec.files['design.md']);
}

function configuredBotLogins(tech) {
  const logins = new Set(['coderabbitai']);
  const row = tech.match(/^\|\s*`logins`\s*\|\s*`(\[[^`]+\])`/m);
  if (row) {
    try {
      for (const login of JSON.parse(row[1])) logins.add(String(login).toLowerCase());
    } catch {
      // The mandatory coderabbit identity remains available when steering is malformed.
    }
  }
  return logins;
}

function updateChangelog(content, version, date, title, breaking) {
  const marker = '## [Unreleased]';
  const index = content.indexOf(marker);
  if (index < 0) throw new Error('CHANGELOG.md lacks [Unreleased]');
  const nextHeading = content.indexOf('\n## [', index + marker.length);
  const end = nextHeading < 0 ? content.length : nextHeading;
  const prefix = content.slice(0, index);
  const suffix = content.slice(end).replace(/^\n+/, '\n');
  const category = breaking ? 'Changed (BREAKING)' : 'Changed';
  return `${prefix}${marker}\n\n## [${version}] - ${date}\n\n### ${category}\n\n- ${title}\n${suffix}`;
}

function synchronizeVersion({ fs, cwd, issue, spec, issueData, tech, existingPr, now }) {
  const versionPath = path.join(cwd, 'VERSION');
  const packagePath = path.join(cwd, 'package.json');
  const changelogPath = path.join(cwd, 'CHANGELOG.md');
  const current = fs.readFileSync(versionPath, 'utf8').trim();
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (manifest.version !== current) throw new Error('VERSION and package.json are not synchronized');
  const breaking = /breaking/i.test(`${issueData.title}\n${issueData.body ?? ''}`);
  if (breaking && !approvedMajor(spec)) {
    const error = new Error('major_bump_required');
    error.reasonCode = 'major_bump_required';
    throw error;
  }
  if (existingPr) return { version: current, changed: [] };
  const labels = issueLabels(issueData);
  const bump = breaking && approvedMajor(spec) ? 'major' : labels.includes('bug') ? 'patch' : 'minor';
  const version = bumpedVersion(current, bump);
  const changed = ['VERSION', 'package.json', 'CHANGELOG.md'];
  fs.writeFileSync(versionPath, `${version}\n`);
  manifest.version = version;
  fs.writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
  const date = new Date(now()).toISOString().slice(0, 10);
  fs.writeFileSync(
    changelogPath,
    updateChangelog(fs.readFileSync(changelogPath, 'utf8'), version, date, `${issueData.title} (#${issue})`, breaking),
  );

  const tablePaths = [...tech.matchAll(/^\|\s*`([^`]+)`\s*\|[^\n]*version/gim)].map((match) => match[1]);
  for (const relative of tablePaths) {
    if (changed.includes(relative) || !fs.existsSync(path.join(cwd, relative))) continue;
    const absolute = path.join(cwd, relative);
    const original = fs.readFileSync(absolute, 'utf8');
    const replaced = original.replaceAll(current, version);
    if (replaced !== original) {
      fs.writeFileSync(absolute, replaced);
      changed.push(relative);
    }
  }
  return { version, changed };
}

function parsePorcelain(output) {
  return String(output || '').split('\0').filter(Boolean).map((entry) => entry.slice(3));
}

function publishVersionChanges({ run, cwd, issue, issueData, changed }) {
  if (changed.length > 0) {
    command(run, cwd, 'git', ['add', '--', ...changed]);
    const staged = command(run, cwd, 'git', ['diff', '--cached', '--quiet'], { allowFailure: true });
    if (staged.status === 0) throw new Error('delivery version diff is empty');
    const prefix = issueLabels(issueData).includes('bug') ? 'fix' : 'feat';
    command(run, cwd, 'git', ['commit', '-m', `${prefix}: deliver issue #${issue}`]);
  }
  const upstream = command(run, cwd, 'git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { allowFailure: true });
  if (upstream.status === 0) command(run, cwd, 'git', ['push']);
  else command(run, cwd, 'git', ['push', '-u', 'origin', 'HEAD']);
}

function existingPullRequest({ run, cwd, branch }) {
  const { value } = jsonCommand(run, cwd, 'gh', [
    'pr', 'list', '--head', branch, '--state', 'open',
    '--json', 'number,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,mergedAt,mergeCommit',
  ]);
  if (!Array.isArray(value)) throw new Error('PR list is not an array');
  const exact = value.filter((pr) => pr.headRefName === branch);
  if (exact.length > 1) throw new Error('multiple exact-branch PRs');
  return exact[0] ?? null;
}

function createPullRequest({ run, fs, cwd, issue, issueData, branch, spec, draft }) {
  const bodyPath = path.join(cwd, '.omp', 'sdlc', `pr-body-${issue}.md`);
  fs.mkdirSync(path.dirname(bodyPath), { recursive: true });
  fs.writeFileSync(bodyPath, `Closes #${issue}\n\nSpec: ${spec.relative}/\n\n## Verification\n\`${spec.relative}/verification-report.md\`\n`);
  const args = ['pr', 'create', '--head', branch, '--title', issueData.title, '--body-file', bodyPath];
  if (draft) args.push('--draft');
  const result = command(run, cwd, 'gh', args);
  fs.rmSync(bodyPath, { force: true });
  const url = String(result.stdout).trim();
  const number = Number(url.match(/\/(\d+)\/?$/)?.[1]);
  if (!number) throw new Error('created PR URL lacks a number');
  return { number, url, headRefName: branch };
}

function normalizeCheck(check) {
  let state = String(check.state ?? check.conclusion ?? '').toUpperCase();
  const bucket = String(check.bucket ?? '').toLowerCase();
  if (!state && bucket === 'pass') state = 'SUCCESS';
  if (!state && bucket === 'fail') state = 'FAILURE';
  if (!state && bucket === 'pending') state = 'PENDING';
  return {
    name: check.name,
    event: check.event ?? 'pull_request',
    state,
    required: check.required === true,
    url: check.link ?? check.url ?? null,
  };
}

function threadComments(thread) {
  if (Array.isArray(thread.comments)) return thread.comments;
  if (Array.isArray(thread.comments?.nodes)) return thread.comments.nodes;
  return [];
}

function threadAuthor(thread) {
  const comments = threadComments(thread);
  const comment = comments[comments.length - 1] ?? thread.comment ?? {};
  return {
    login: String(comment.author?.login ?? comment.authorLogin ?? thread.author?.login ?? thread.authorLogin ?? '').toLowerCase(),
    typename: comment.author?.__typename ?? thread.author?.__typename ?? thread.authorType ?? null,
    body: comment.body ?? thread.body ?? '',
    path: thread.path ?? comment.path ?? null,
    line: thread.line ?? comment.line ?? null,
    url: thread.url ?? comment.url ?? null,
  };
}

function isBot(author, botLogins) {
  return author.typename === 'Bot' || botLogins.has(author.login);
}

function fetchSnapshot({ run, cwd, issue, prNumber, readiness }) {
  const { value: pr } = jsonCommand(run, cwd, 'gh', [
    'pr', 'view', String(prNumber), '--json',
    'number,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,mergedAt,mergeCommit,reviews,reviewThreads',
  ]);
  const checksResult = command(run, cwd, 'gh', [
    'pr', 'checks', String(prNumber), '--json', 'name,state,bucket,link,event',
  ], { allowFailure: true });
  let checks = [];
  if (String(checksResult.stdout || '').trim()) checks = JSON.parse(checksResult.stdout).map(normalizeCheck);
  const { value: issueData } = jsonCommand(run, cwd, 'gh', ['issue', 'view', String(issue), '--json', 'number,state,url']);
  const reviews = (pr.reviews ?? []).map((review, index) => ({
    id: review.id ?? `review-${index}`,
    author: review.author?.login ?? review.authorLogin,
    state: review.state,
    submittedAt: review.submittedAt ?? '',
  }));
  const rawThreads = Array.isArray(pr.reviewThreads) ? pr.reviewThreads : pr.reviewThreads?.nodes ?? [];
  const threads = rawThreads.map((thread) => ({
    id: thread.id,
    isResolved: thread.isResolved,
    isOutdated: thread.isOutdated,
    url: thread.url ?? threadAuthor(thread).url,
  }));
  const evidence = readiness.readiness?.evidence ?? readiness.readiness?.pendingEvidence ?? [];
  const declaredPrOnlyChecks = evidence
    .filter((item) => ['required_check', 'check_run'].includes(item.kind))
    .map((item) => item.name);
  const snapshot = {
    schemaVersion: 1,
    issue: { number: issueData.number ?? issue, state: issueData.state },
    pullRequest: {
      ...pr,
      mergeCommitOid: pr.mergeCommit?.oid ?? pr.mergeCommitOid ?? null,
    },
    checks,
    reviews,
    threads,
    pagination: { checksComplete: true, reviewsComplete: true, threadsComplete: true },
    requiredChecksConfigured: declaredPrOnlyChecks.length > 0,
    declaredPrOnlyChecks,
    verification: {
      status: ['pass', 'pr_evidence_pending', 'pr_evidence_satisfied'].includes(readiness.status) ? 'pass' : readiness.status,
      headSha: pr.headRefOid,
    },
  };
  return { snapshot, rawThreads, pr, issueData };
}

function remediationPacket({ issue, pr, classified, rawThreads, botLogins }) {
  const failingNames = new Set(classified.evidence.checks
    .filter((check) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(check.state))
    .map((check) => check.name));
  const failingChecks = classified.evidence.checks
    .filter((check) => failingNames.has(check.name))
    .map((check) => ({ name: check.name, url: check.url }));
  const threads = rawThreads
    .filter((thread) => !thread.isResolved && !thread.isOutdated)
    .map((thread) => ({ thread, author: threadAuthor(thread) }))
    .filter(({ author }) => isBot(author, botLogins))
    .map(({ author }) => ({ path: author.path, line: author.line, body: author.body, url: author.url }));
  return {
    schemaVersion: 1,
    kind: 'remediation_required',
    issue,
    pullRequest: pr.number,
    headSha: classified.headSha,
    failingChecks,
    threads,
    handoffPath: `.omp/sdlc/handoffs/${issue}-deliver.json`,
  };
}

function classifyHumanReview(rawThreads, botLogins) {
  return rawThreads
    .filter((thread) => !thread.isResolved && !thread.isOutdated)
    .some((thread) => !isBot(threadAuthor(thread), botLogins));
}

export function runDeliver({
  issue,
  cwd = process.cwd(),
  run = defaultRun,
  fs = fsDefault,
  now = Date.now,
  sleep = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds),
  remediationResult = null,
} = {}) {
  const issueNumber = positiveIssue(issue);
  if (!issueNumber) throw new Error('issue must be a positive integer');
  const context = { cwd, fs, issue: issueNumber };
  if (remediationResult === 'human_review') return fail(context, 'human_review', `Delivery for #${issueNumber} requires human review`);

  try {
    const spec = approvedSpec(fs, cwd, issueNumber);
    const readiness = inspectVerificationReadiness({
      content: fs.readFileSync(spec.verificationPath, 'utf8'),
      options: { expectedIssueNumber: issueNumber, expectedSpecPath: spec.relative },
    });
    if (!['pass', 'pr_evidence_pending', 'pr_evidence_satisfied'].includes(readiness.status)) {
      return fail(context, 'verification_not_ready', `Verification is not ready for delivery: ${readiness.reasonCode}`);
    }
    const tech = fs.readFileSync(path.join(cwd, 'steering', 'tech.md'), 'utf8');
    const botLogins = configuredBotLogins(tech);
    const { value: issueData } = jsonCommand(run, cwd, 'gh', [
      'issue', 'view', String(issueNumber), '--json', 'number,title,body,labels,state,url',
    ]);
    if (issueData.number !== issueNumber) return fail(context, 'issue_unreadable', `Issue #${issueNumber} identity is invalid`);

    const branch = command(run, cwd, 'git', ['branch', '--show-current']).stdout.trim();
    if (!branch.startsWith(`${issueNumber}-`)) return fail(context, 'delivery_failed', `Current branch ${branch || '(detached)'} does not belong to #${issueNumber}`);
    const dirty = parsePorcelain(command(run, cwd, 'git', ['status', '--porcelain=v1', '-z']).stdout)
      .filter((entry) => !entry.startsWith('.omp/'));
    if (dirty.length > 0) return fail(context, 'dirty_tree', `Delivery requires a clean worktree: ${dirty.join(', ')}`);

    let pr = existingPullRequest({ run, cwd, branch });
    let version;
    let changed;
    try {
      ({ version, changed } = synchronizeVersion({ fs, cwd, issue: issueNumber, spec, issueData, tech, existingPr: pr, now }));
    } catch (error) {
      if (error.reasonCode === 'major_bump_required') {
        return fail(context, 'major_bump_required', `BREAKING issue #${issueNumber} lacks an approved major version bump`);
      }
      throw error;
    }
    publishVersionChanges({ run, cwd, issue: issueNumber, issueData, changed });
    if (!pr) {
      pr = createPullRequest({
        run, fs, cwd, issue: issueNumber, issueData, branch, spec,
        draft: readiness.status === 'pr_evidence_pending',
      });
    }

    const startedAt = now();
    while (true) {
      const observed = fetchSnapshot({ run, cwd, issue: issueNumber, prNumber: pr.number, readiness });
      const classified = classifyPrDeliveryState(observed.snapshot, { issueNumber });
      if (classifyHumanReview(observed.rawThreads, botLogins) || classified.reasonCode === 'changes_requested') {
        return fail(context, 'human_review', `PR #${pr.number} requires human review`);
      }
      if (classified.status === 'remediate' && ['checks_failed', 'review_threads_unresolved'].includes(classified.reasonCode)) {
        const packet = remediationPacket({ issue: issueNumber, pr: observed.pr, classified, rawThreads: observed.rawThreads, botLogins });
        return {
          status: 3,
          stdout: `NMG_SDLC_REMEDIATION: ${JSON.stringify(packet)}\n`,
          stderr: '',
          handoff: null,
          handoffPath: packet.handoffPath,
          remediation: packet,
        };
      }
      if (classified.status === 'pending') {
        if (now() - startedAt >= PENDING_CEILING_MS) {
          return fail(context, 'delivery_pending', `PR #${pr.number} remained pending for one hour`);
        }
        sleep(POLL_INTERVAL_MS);
        continue;
      }
      if (classified.status !== 'merge_ready') {
        return fail(context, 'merge_failed', `PR #${pr.number} is not mergeable: ${classified.reasonCode}`);
      }

      const head = classified.headSha;
      const refreshed = fetchSnapshot({ run, cwd, issue: issueNumber, prNumber: pr.number, readiness });
      if (refreshed.pr.headRefOid !== head) continue;
      command(run, cwd, 'gh', [
        'pr', 'merge', String(pr.number), '--squash', '--match-head-commit', head, '--delete-branch',
      ]);
      const proof = fetchSnapshot({ run, cwd, issue: issueNumber, prNumber: pr.number, readiness });
      const proved = classifyPrDeliveryState(proof.snapshot, { issueNumber, expectedHead: head });
      if (proved.status !== 'complete' || proof.pr.headRefOid !== head || proof.issueData.state !== 'CLOSED') {
        return fail(context, 'merge_failed', `PR #${pr.number} merge and issue closure proof failed`);
      }
      command(run, cwd, 'git', ['checkout', proof.pr.baseRefName]);
      command(run, cwd, 'git', ['branch', '-D', branch]);
      return writeHandoff({
        ...context,
        status: 'passed',
        summary: `PR #${pr.number} merged at ${head}, issue #${issueNumber} closed, version ${version}`,
        artifacts: [proof.pr.url],
      });
    }
  } catch (error) {
    const reasonCode = error.message === 'spec_not_approved' ? 'spec_not_approved'
      : error.message === 'verification_not_ready' ? 'verification_not_ready'
        : 'delivery_failed';
    return fail(context, reasonCode, `Delivery failed for #${issueNumber}: ${error.message}`);
  }
}

function main() {
  let options;
  try {
    options = parseDeliverCli(process.argv.slice(2));
  } catch {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  const result = runDeliver({ ...options, cwd: process.cwd() });
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status;
}

if (isCliEntry(import.meta.url, process.argv[1])) main();
