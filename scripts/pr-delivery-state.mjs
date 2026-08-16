#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const OID = /^[0-9a-f]{40}$/i;
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const SUCCESS_CHECKS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const PENDING_CHECKS = new Set(['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED']);
const FAILURE_CHECKS = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED']);
const REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']);

function positive(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function deliveryFingerprint(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function baseResult(normalized) {
  return {
    schemaVersion: 1,
    status: 'unverifiable',
    reasonCode: 'invalid_evidence',
    issueNumber: normalized.issueNumber,
    pullRequestNumber: normalized.pullRequest?.number ?? null,
    headSha: normalized.pullRequest?.headRefOid ?? null,
    fingerprint: deliveryFingerprint(normalized),
    evidence: normalized,
    gaps: [],
  };
}

function normalizeSnapshot(snapshot, options, gaps) {
  const issueNumber = positive(options.issueNumber ?? snapshot?.issue?.number);
  const pullRequest = snapshot?.pullRequest && typeof snapshot.pullRequest === 'object'
    ? {
      number: positive(snapshot.pullRequest.number),
      state: String(snapshot.pullRequest.state ?? '').toUpperCase(),
      isDraft: snapshot.pullRequest.isDraft,
      headRefOid: String(snapshot.pullRequest.headRefOid ?? '').toLowerCase(),
      baseRefName: text(snapshot.pullRequest.baseRefName),
      headRefName: text(snapshot.pullRequest.headRefName),
      mergeStateStatus: String(snapshot.pullRequest.mergeStateStatus ?? '').toUpperCase(),
      mergedAt: snapshot.pullRequest.mergedAt ?? null,
      mergeCommitOid: snapshot.pullRequest.mergeCommitOid
        ? String(snapshot.pullRequest.mergeCommitOid).toLowerCase()
        : null,
    }
    : null;
  const issue = snapshot?.issue && typeof snapshot.issue === 'object'
    ? { number: positive(snapshot.issue.number), state: String(snapshot.issue.state ?? '').toUpperCase() }
    : null;
  const pagination = {
    checksComplete: snapshot?.pagination?.checksComplete === true,
    reviewsComplete: snapshot?.pagination?.reviewsComplete === true,
    threadsComplete: snapshot?.pagination?.threadsComplete === true,
  };
  const checks = Array.isArray(snapshot?.checks) ? snapshot.checks.map((check) => ({
    name: text(check?.name),
    event: text(check?.event) ?? 'pull_request',
    state: String(check?.state ?? check?.conclusion ?? '').toUpperCase(),
    required: check?.required === true,
    url: text(check?.url ?? check?.link),
  })).sort((left, right) => `${left.name}\0${left.event}`.localeCompare(`${right.name}\0${right.event}`)) : [];
  const reviews = Array.isArray(snapshot?.reviews) ? snapshot.reviews.map((review, index) => ({
    id: text(review?.id) ?? `index-${index}`,
    author: text(review?.author ?? review?.authorLogin),
    state: String(review?.state ?? '').toUpperCase(),
    submittedAt: text(review?.submittedAt) ?? '',
  })).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt) || left.id.localeCompare(right.id)) : [];
  const threads = Array.isArray(snapshot?.threads) ? snapshot.threads.map((thread) => ({
    id: text(thread?.id),
    isResolved: thread?.isResolved,
    isOutdated: thread?.isOutdated,
    url: text(thread?.url),
  })).sort((left, right) => String(left.id).localeCompare(String(right.id))) : [];
  const verification = snapshot?.verification && typeof snapshot.verification === 'object'
    ? {
      status: String(snapshot.verification.status ?? '').toLowerCase(),
      headSha: String(snapshot.verification.headSha ?? '').toLowerCase(),
    }
    : null;
  const declaredPrOnlyChecks = Array.isArray(snapshot?.declaredPrOnlyChecks)
    ? [...new Set(snapshot.declaredPrOnlyChecks.map(text).filter(Boolean))].sort()
    : [];
  const normalized = {
    issueNumber,
    issue,
    pullRequest,
    checks,
    reviews,
    threads,
    pagination,
    requiredChecksConfigured: snapshot?.requiredChecksConfigured === true,
    declaredPrOnlyChecks,
    verification,
  };

  if (snapshot?.schemaVersion !== 1) gaps.push('schemaVersion must equal 1');
  if (!issueNumber || !issue || issue.number !== issueNumber) gaps.push('active issue identity is missing or mismatched');
  if (!['OPEN', 'CLOSED'].includes(issue?.state)) gaps.push('active issue state is unknown');
  if (!pullRequest?.number) gaps.push('pull request number is missing');
  if (!['OPEN', 'CLOSED', 'MERGED'].includes(pullRequest?.state)) gaps.push('pull request state is unknown');
  if (typeof pullRequest?.isDraft !== 'boolean') gaps.push('pull request draft state is missing');
  if (!OID.test(pullRequest?.headRefOid ?? '')) gaps.push('pull request headRefOid is invalid');
  if (!pullRequest?.baseRefName || !pullRequest?.headRefName) gaps.push('pull request base/head ref is missing');
  if (!pagination.checksComplete || !pagination.reviewsComplete || !pagination.threadsComplete) {
    gaps.push('checks, reviews, and review threads must be fully paged');
  }
  const expectedHead = options.expectedHead ? String(options.expectedHead).toLowerCase() : null;
  if (expectedHead && (!OID.test(expectedHead) || pullRequest?.headRefOid !== expectedHead)) {
    gaps.push('observed head does not match expected exact head');
  }
  const checkKeys = new Set();
  for (const check of checks) {
    if (!check.name || ![...SUCCESS_CHECKS, ...PENDING_CHECKS, ...FAILURE_CHECKS].includes(check.state)) {
      gaps.push('check identity or state is invalid');
      continue;
    }
    const key = `${check.name}\0${check.event}`;
    if (checkKeys.has(key)) gaps.push(`duplicate check identity: ${check.name} (${check.event})`);
    checkKeys.add(key);
  }
  for (const review of reviews) {
    if (!review.author || !REVIEW_STATES.has(review.state)) gaps.push('review identity or state is invalid');
  }
  const threadIds = new Set();
  for (const thread of threads) {
    if (!thread.id || typeof thread.isResolved !== 'boolean' || typeof thread.isOutdated !== 'boolean') {
      gaps.push('review thread identity or state is invalid');
      continue;
    }
    if (threadIds.has(thread.id)) gaps.push(`duplicate review thread identity: ${thread.id}`);
    threadIds.add(thread.id);
  }
  if (!verification || verification.status !== 'pass' || verification.headSha !== pullRequest?.headRefOid) {
    gaps.push('current passing verification for the exact head is required');
  }
  return normalized;
}

function result(normalized, status, reasonCode, gaps = []) {
  return { ...baseResult(normalized), status, reasonCode, gaps };
}

export function classifyPrDeliveryState(snapshot, options = {}) {
  const gaps = [];
  const normalized = normalizeSnapshot(snapshot, options, gaps);
  if (gaps.length > 0) return result(normalized, 'unverifiable', 'evidence_incomplete_or_invalid', [...new Set(gaps)].sort());

  const { pullRequest, issue } = normalized;
  if (pullRequest.state === 'MERGED') {
    if (!pullRequest.mergedAt || !OID.test(pullRequest.mergeCommitOid ?? '')) {
      return result(normalized, 'unverifiable', 'merge_proof_incomplete', ['merged PR lacks merge time or merge commit OID']);
    }
    return issue.state === 'CLOSED'
      ? result(normalized, 'complete', 'merged_exact_head_and_issue_closed')
      : result(normalized, 'external_blocker', 'merged_pr_child_still_open', ['the merged PR did not close the active issue']);
  }
  if (pullRequest.state === 'CLOSED') {
    return result(normalized, 'external_blocker', 'pull_request_closed_unmerged', ['the exact pull request is closed without merge']);
  }
  if (issue.state !== 'OPEN') {
    return result(normalized, 'external_blocker', 'issue_closed_before_merge', ['the active issue closed before its exact PR merged']);
  }

  const failing = normalized.checks.filter((check) => FAILURE_CHECKS.has(check.state));
  if (failing.length > 0) {
    return result(normalized, 'remediate', 'checks_failed', failing.map((check) => `${check.name}: ${check.state}`));
  }
  const pending = normalized.checks.filter((check) => PENDING_CHECKS.has(check.state));
  if (pending.length > 0) {
    return result(normalized, 'pending', 'checks_pending', pending.map((check) => `${check.name}: ${check.state}`));
  }
  if (normalized.checks.length === 0
    && (normalized.requiredChecksConfigured || normalized.declaredPrOnlyChecks.length > 0)) {
    return result(normalized, 'unverifiable', 'required_checks_missing', ['required or declared PR-only checks were not returned']);
  }

  const latestByAuthor = new Map();
  for (const review of normalized.reviews) latestByAuthor.set(review.author, review);
  const requested = [...latestByAuthor.values()].filter((review) => review.state === 'CHANGES_REQUESTED');
  if (requested.length > 0) {
    return result(normalized, 'remediate', 'changes_requested', requested.map((review) => `changes requested by ${review.author}`));
  }
  const unresolved = normalized.threads.filter((thread) => !thread.isResolved && !thread.isOutdated);
  if (unresolved.length > 0) {
    return result(normalized, 'remediate', 'review_threads_unresolved', unresolved.map((thread) => `unresolved thread ${thread.id}`));
  }
  if (pullRequest.isDraft) return result(normalized, 'pending', 'pull_request_still_draft');
  if (pullRequest.mergeStateStatus === 'CLEAN') return result(normalized, 'merge_ready', 'exact_head_clean');
  if (['UNKNOWN', 'UNSTABLE'].includes(pullRequest.mergeStateStatus)) {
    return result(normalized, 'pending', 'mergeability_pending', [`mergeStateStatus is ${pullRequest.mergeStateStatus}`]);
  }
  if (['BEHIND', 'DIRTY', 'CONFLICTING'].includes(pullRequest.mergeStateStatus)) {
    return result(normalized, 'remediate', 'mergeability_defect', [`mergeStateStatus is ${pullRequest.mergeStateStatus}`]);
  }
  return result(normalized, 'external_blocker', 'merge_blocked_by_external_policy', [`mergeStateStatus is ${pullRequest.mergeStateStatus || 'missing'}`]);
}

function readEvidence(filePath) {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_EVIDENCE_BYTES) {
    throw new Error('evidence must be a bounded regular non-symlink file');
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      evidence: { type: 'string' },
      issue: { type: 'string' },
      'expected-head': { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  if (!values.evidence || !values.issue || !values.json) throw new Error('--evidence, --issue, and --json are required');
  const issueNumber = positive(values.issue);
  if (!issueNumber) throw new Error('--issue must be a positive integer');
  if (values['expected-head'] && !OID.test(values['expected-head'])) throw new Error('--expected-head must be a full Git OID');
  return { evidence: values.evidence, issueNumber, expectedHead: values['expected-head'] ?? null };
}

function usage() {
  return 'Usage: node scripts/pr-delivery-state.mjs --evidence <snapshot.json> --issue <N> [--expected-head <oid>] --json';
}

function main() {
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
    const snapshot = readEvidence(options.evidence);
    process.stdout.write(`${JSON.stringify(classifyPrDeliveryState(snapshot, options), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Evidence error: ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
