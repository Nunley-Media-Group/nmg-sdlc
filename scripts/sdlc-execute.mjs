#!/usr/bin/env node

/** Branch-first controller. Each issue is worked in its own checkout: the invoking checkout when it is already on
 * the issue's branch, otherwise the issue's worktree, which holds that issue's lease, handoffs and verification
 * records. Git, GitHub, the Approved spec and registered verification are the only lifecycle evidence. A branch
 * whose review passed enters the repository's merge queue; only the queue head integrates the default branch,
 * prepares its version, runs the pre-merge validations and merges. Stage workers run as hooks-module subagents
 * through the `host` transport (scripts/sdlc-execute-host.mjs). */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { defaultPromptRegistry, renderPrompt, writePromptProvenance } from '../src/sdlc-prompt-snippets.mjs';
import { packageRoot } from '../src/sdlc-workflows.mjs';
import { executeGoalCondition } from '../src/host-events.mjs';
import { ACTIVE_AGENT_STATUSES, activityRecord, STAGE_AGENTS, WORKER_PERMISSION_MODES } from '../src/execute-host.mjs';
import { loadStageModels, STAGE_MODEL_DEFAULTS, stageModelsWarning } from './sdlc-models.mjs';
import { loadTestLayers, TEST_LAYER_TYPES } from './test-layers.mjs';
import { collectEvidence, parseIssueBranch } from './sdlc-status.mjs';
import { inspectPublicationScope, publicationFileEntries } from './sdlc-safe-recoveries.mjs';
import { inspectVerificationArtifactRepair, inspectVerificationReadiness, MAX_VERIFICATION_REPORT_BYTES } from './verification-readiness.mjs';
import { matchesRegisteredResults } from './sdlc-finalize-verification.mjs';
import { resolveSpecDir, specStatus, specStatusOnRef } from './issue-spec-scope.mjs';
import { createIssueDependencyClient, eligibleIssues, issueDependencyStatus, readDependencyGraph } from './issue-dependencies.mjs';
import { issueHasSpecCreatedLabel, SPEC_CREATED_LABEL } from './spec-created-label.mjs';
import { acquireControllerLease, readControllerLease, reclaimStaleControllerLease, releaseControllerLease } from './sdlc-controller-lease.mjs';
import { isCliEntry, materializeControllerPaths } from './plugin-controller-path.mjs';
import { readReview, repairPathsSince } from './sdlc-review.mjs';
import { mergeUnreleasedEntries } from './sdlc-deliver.mjs';
import { clearInFlight, enterMergeQueue, inFlightOverlaps, leaveMergeQueue, recordInFlight } from './sdlc-shared-state.mjs';
import { fastForwardPrimary, findWorktree, isLinkedWorktree, removeWorktree } from './sdlc-worktree.mjs';

export const VALID_STEPS = ['start', 'implement', 'verify', 'deliver'];
export const REMEDIABLE_STEPS = ['implement', 'verify', 'deliver'];
const SKILLS = { start: 'start-issue', implement: 'write-code', verify: 'verify-code', deliver: 'open-pr' };
const HANDOFF_DIR = '.nmg-sdlc/handoffs';
const GATE_INTENT_DIR = '.nmg-sdlc/execute/gate-intent';
const MAX_HANDOFF_BYTES = 256 * 1024;
// The gate artifact holds bounded command evidence for every validation: stream tails, failure lines and log paths.
const MAX_GATE_ARTIFACT_BYTES = 4 * 1024 * 1024;
// How long a resumed or prompted worker may take to start a new turn, and how often a worker that is waiting on its
// own background work is rechecked; the background wait itself has no deadline.
const RESUME_POLL_MS = 60_000;
// How often a queued branch rechecks whether it has reached the head of the merge queue.
const QUEUE_POLL_MS = 5_000;
// Files only version preparation writes: a merge conflict confined to them is resolved to the default branch's side.
const VERSION_ARTIFACTS = Object.freeze(['VERSION', 'CHANGELOG.md']);
const SHA = /^[0-9a-f]{40}$/;
// A supervised worker is checked in on after this long without a handoff, or once its activity or
// waiting marker has been unchanged this long; waits are sliced so a check-in is never late by more than a slice.
export const DEFAULT_CHECK_IN_MS = 300_000;
const CHECK_IN_SLICE_MS = 30_000;
const REPORT_HISTORY = 8;
// A settled stage subagent whose turn ended cleanly; failed and killed subagents end the stage as process_lost.
const SETTLED = ['idle', 'completed'];
// A stage subagent that stopped without ending its turn cleanly.
const STOPPED = ['failed', 'killed'];
export const STAGE_DECISIONS = Object.freeze(['accept', 'prompt', 'redispatch', 'halt']);
export const CHECK_IN_DECISIONS = Object.freeze(['continue', 'prompt', 'redispatch', 'halt']);

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}
function succeeded(result) { return result?.status === undefined || result.status === 0; }
function parsed(value) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } }
  if (typeof value?.stdout === 'string') return parsed(value.stdout);
  return value;
}
function usage() { return 'Usage: /sdlc-execute [--check-in-seconds N] [#N ...]'; }
export function parseArgs(input = '') {
  const text = String(input ?? '').trim();
  if (!text) return { issues: [], defaultBacklog: true };
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) throw new Error(usage());
  const issues = [];
  let checkInSeconds;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--retain-worker') {
      throw new Error(`--retain-worker is removed: stage workers are hooks-module subagents. ${usage()}`);
    }
    if (token === '--check-in-seconds') {
      const value = tokens[index += 1];
      if (checkInSeconds !== undefined || !/^[1-9]\d{0,4}$/.test(value ?? '') || Number(value) > 86_400) throw new Error(usage());
      checkInSeconds = Number(value);
      continue;
    }
    const match = token.match(/^(?:#|issue:\/\/|pr:\/\/)?(\d+)$/);
    const issue = Number(match?.[1]);
    if (!Number.isSafeInteger(issue) || issue <= 0) throw new Error(usage());
    if (!issues.includes(issue)) issues.push(issue);
  }
  if (issues.length > 20) throw new Error(usage());
  return { issues, defaultBacklog: !issues.length, ...(checkInSeconds ? { checkInSeconds } : {}) };
}
function projectDone(projectItems) {
  const items = Array.isArray(projectItems) ? projectItems
    : Array.isArray(projectItems?.nodes) ? projectItems.nodes : [];
  const statuses = items.map((item) =>
    String(item?.statusName ?? item?.status?.name ?? '').trim().toLowerCase()).filter(Boolean);
  return statuses.length > 0 && statuses.every((status) => status === 'done');
}
export function selectBacklog(options = {}) {
  const run = options.run ?? defaultRun;
  const cwd = options.cwd ?? process.cwd();
  if (!Array.isArray(options.issues)) return listSpecifiedIssues({ run, cwd })[0]?.number ?? null;
  if (!options.graph) throw new Error('dependency_unreadable');
  return eligibleIssues(options.graph, options.issues)
    .filter((issue) => {
      const override = options.projectStatuses?.[issue.number];
      return !projectDone(Array.isArray(override) ? override.map((statusName) => ({ statusName }))
        : issue.projectItems);
    })
    .sort((left, right) => left.number - right.number)[0]?.number ?? null;
}
export function listSpecifiedIssues({ run = defaultRun, cwd = process.cwd() } = {}) {
  const response = run('gh', ['issue', 'list', '--state', 'open', '--label', SPEC_CREATED_LABEL,
    '--limit', '100', '--json', 'number,title'], { cwd });
  if (!succeeded(response)) throw new Error('issues_unreadable');
  const issues = parsed(response);
  if (!Array.isArray(issues)) throw new Error('issues_unreadable');
  const client = createIssueDependencyClient({ cwd, run });
  const eligible = [];
  for (const issue of issues) {
    if (!Number.isSafeInteger(issue?.number) || issue.number <= 0) continue;
    const items = run('gh', ['issue', 'view', String(issue.number), '--json', 'projectItems'], { cwd });
    if (succeeded(items) && projectDone(parsed(items)?.projectItems)) continue;
    try {
      const graph = readDependencyGraph(client, [issue.number]);
      if (issueDependencyStatus(graph, issue.number).status === 'eligible') {
        eligible.push({ number: issue.number, title: String(issue.title ?? '') });
      }
    } catch (error) {
      if (!['dependency_cycle', 'dependency_dangling'].includes(error?.reasonCode)) throw error;
    }
  }
  return eligible.sort((a, b) => a.number - b.number);
}
const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
/** An implement handoff's optional `justifiedTests`: each non-scenario test with its kept, non-`bdd` type and reason. */
function validJustifiedTests(entries) {
  return Array.isArray(entries) && entries.every((entry) => entry !== null && typeof entry === 'object'
    && !Array.isArray(entry) && Object.keys(entry).every((key) => ['path', 'type', 'justification'].includes(key))
    && nonEmptyString(entry.path) && nonEmptyString(entry.justification)
    && TEST_LAYER_TYPES.includes(entry.type) && entry.type !== 'bdd');
}
export function validateHandoff(input) {
  let value = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(readFileSync(input, 'utf8')); } catch { throw new Error('handoff missing or malformed'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schemaVersion !== 1 || !Number.isSafeInteger(value.issue) || value.issue <= 0
    || !VALID_STEPS.includes(value.step) || !['passed', 'failed', 'blocked'].includes(value.status)
    || typeof value.intervention !== 'boolean' || typeof value.summary !== 'string'
    || !Array.isArray(value.artifacts) || !value.artifacts.every((item) => typeof item === 'string')
    || (value.next !== null && typeof value.next !== 'string')
    || (value.reasonCode !== null && typeof value.reasonCode !== 'string')
    || (Object.hasOwn(value, 'justifiedTests') && !validJustifiedTests(value.justifiedTests))) {
    throw new Error('handoff_invalid');
  }
  return value;
}
export function workerPrompt({ step, issue, skill, cwd, controllerRunId } = {}) {
  if (!VALID_STEPS.includes(step) || !Number.isSafeInteger(issue) || issue <= 0 || (skill && skill !== SKILLS[step])) {
    throw new Error('invalid worker step or issue');
  }
  const { text, provenance } = renderPrompt(defaultPromptRegistry(packageRoot, { projectRoot: cwd, consumer: `worker:${step}` }), {
    consumer: `worker:${step}`,
    vars: { issue: String(issue), step, handoffPath: `${HANDOFF_DIR}/${issue}-${step}.json`, controllerRunId: controllerRunId ?? '' },
  });
  if (cwd) writePromptProvenance(cwd, provenance);
  return materializeControllerPaths(text, packageRoot).trimEnd();
}
export function isRemediableFailedHandoff({ step, state, handoff } = {}) {
  return REMEDIABLE_STEPS.includes(step) && ['idle', 'done'].includes(state)
    && handoff?.step === step && handoff.status === 'failed' && handoff.intervention === false;
}
export function remediationPrompt({ issue, failedStep, evidence, cwd, controllerRunId } = {}) {
  if (!evidence || !REMEDIABLE_STEPS.includes(failedStep)) throw new Error('remediation_evidence_missing');
  return `Diagnose ${failedStep} for #${issue} at ${evidence.head ?? 'current HEAD'}: ${evidence.reasonCode ?? 'failed'}: ${evidence.summary}.\nArtifacts: ${(evidence.artifacts ?? []).join(', ') || '(none)'}.\nExplain the prior failure and make a different measurable repair; never repeat unchanged smoke inputs.\n${workerPrompt({ issue, step: failedStep, cwd, controllerRunId })}`;
}
export { WORKER_PERMISSION_MODES };
const DEFAULT_WORKER_PERMISSION_MODE = 'auto';
/** Claude Code permission mode for stage subagents: NMG_SDLC_WORKER_PERMISSION_MODE when it
 * names a supported mode, otherwise `auto`. */
export function workerPermissionMode(env = process.env) {
  const value = env?.NMG_SDLC_WORKER_PERMISSION_MODE;
  return WORKER_PERMISSION_MODES.includes(value) ? value : DEFAULT_WORKER_PERMISSION_MODE;
}
// Failures that wait on outside evidence rather than a repair: the next dispatch keeps its stage model.
const REPAIR_EXEMPT_REASONS = new Set(['pr_evidence_pending', 'mergeability_reverification_required']);
/** The steering/sdlc-models.json entry a stage worker runs on: the repair entry for a repair
 * re-dispatch, otherwise the stage's own entry. */
function stageEntry(step, failure, config) {
  if (!VALID_STEPS.includes(step)) throw new Error(`unknown stage: ${step}`);
  return repairDispatch(step, failure) ? config.repair : config[step];
}
/** Claude Code model alias for a stage worker, from the project configuration. */
export function stageModel(step, failure, config = STAGE_MODEL_DEFAULTS) {
  return stageEntry(step, failure, config).model;
}
/** Claude Code effort level for a stage worker; `default` yields none, so no `--effort` flag is passed. */
export function stageEffort(step, failure, config = STAGE_MODEL_DEFAULTS) {
  const effort = stageEntry(step, failure, config).effort;
  return effort === 'default' ? undefined : effort;
}
function repairDispatch(step, failure) {
  return step !== 'start' && Boolean(failure) && !REPAIR_EXEMPT_REASONS.has(failure.reasonCode);
}
/** The stage_models entry name a worker is registered under: `repair` for a repair redispatch, otherwise the stage. */
function entryName(step, failure) {
  return repairDispatch(step, failure) ? 'repair' : step;
}
function checkout(cwd, run) {
  const branch = run('git', ['branch', '--show-current'], { cwd });
  const head = run('git', ['rev-parse', 'HEAD'], { cwd });
  if (!succeeded(branch) || !succeeded(head) || !branch.stdout?.trim() || !SHA.test(String(head.stdout).trim())) {
    throw new Error('issue_branch_unreadable');
  }
  return { branch: branch.stdout.trim(), head: head.stdout.trim() };
}
function statusEvidence(cwd, run) {
  return collectEvidence(cwd, { run: (command, args, options) => {
    const response = run(command, args, options);
    return { ...response, ok: succeeded(response), stdout: String(response?.stdout ?? ''), stderr: String(response?.stderr ?? '') };
  } });
}
/**
 * Whether the branch has commits beyond the freshly fetched remote default ref. The local default
 * branch can lag origin, so it is never counted; an unreadable name, fetch, or count throws.
 */
function branchCommits(cwd, run, evidence) {
  const base = evidence?.project?.defaultBranch;
  if (!base) throw new Error('default_branch_unreadable');
  const remoteRef = `refs/remotes/origin/${base}`;
  const fetched = run('git', ['fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${base}:${remoteRef}`], { cwd });
  if (!succeeded(fetched)) throw new Error('default_branch_unreadable');
  const response = run('git', ['rev-list', '--count', `${remoteRef}..HEAD`], { cwd });
  const count = String(response?.stdout ?? '').trim();
  if (!succeeded(response) || !/^\d+$/.test(count)) throw new Error('default_branch_unreadable');
  return Number(count) > 0;
}
function remoteHead(cwd, run, branch) {
  const response = run('git', ['ls-remote', '--heads', 'origin', branch], { cwd });
  if (!succeeded(response)) throw new Error('upstream_unavailable');
  const match = String(response.stdout ?? '').trim().match(/^([0-9a-f]{40})\trefs\/heads\/(.+)$/);
  return match?.[2] === branch ? match[1] : null;
}
function completed(cwd, run, issue, branch, head) {
  const listed = run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '100',
    '--json', 'number,state,headRefName,headRefOid'], { cwd });
  if (!succeeded(listed)) throw new Error('pr_evidence_unavailable');
  const candidates = parsed(listed);
  if (!Array.isArray(candidates)) throw new Error('pr_evidence_unavailable');
  const matching = candidates.filter((pr) => pr.state === 'MERGED' && pr.headRefName === branch
    && pr.headRefOid === head && Number.isSafeInteger(pr.number));
  if (!matching.length) return false;
  if (matching.length !== 1) throw new Error('merged_pr_ambiguous');
  const prResponse = run('gh', ['pr', 'view', String(matching[0].number), '--json',
    'number,state,headRefName,headRefOid,mergedAt,mergeCommit,closingIssuesReferences'], { cwd });
  const issueResponse = run('gh', ['issue', 'view', String(issue), '--json', 'number,state'], { cwd });
  if (!succeeded(prResponse) || !succeeded(issueResponse)) throw new Error('delivery_evidence_unavailable');
  const pr = parsed(prResponse);
  const issueState = parsed(issueResponse);
  return pr?.number === matching[0].number && pr.state === 'MERGED' && pr.headRefName === branch
    && pr.headRefOid === head && typeof pr.mergedAt === 'string'
    && SHA.test(pr.mergeCommit?.oid ?? '') && issueState?.number === issue
    && issueState.state === 'CLOSED' && Array.isArray(pr.closingIssuesReferences)
    && pr.closingIssuesReferences.some((reference) => reference.number === issue);
}
// Off-branch delivery proof from the issue side: the live issue state and its same-repository
// closing pull requests. Returns 'open' or 'delivered'; otherwise throws `<reasonCode>: #<issue>`.
function closedIssueDelivery(cwd, run, issue) {
  const unavailable = () => new Error(`delivery_evidence_unavailable: #${issue}`);
  const undelivered = () => new Error(`issue_closed_undelivered: #${issue}`);
  const view = run('gh', ['issue', 'view', String(issue), '--json', 'number,state,closedByPullRequestsReferences'], { cwd });
  if (!succeeded(view)) throw unavailable();
  const value = parsed(view);
  if (value?.number !== issue || !['OPEN', 'CLOSED'].includes(value.state)) throw unavailable();
  if (value.state === 'OPEN') return 'open';
  const references = value.closedByPullRequestsReferences;
  if (!Array.isArray(references) || !references.every((reference) => Number.isSafeInteger(reference?.number)
    && reference.number > 0 && typeof reference.repository?.owner?.login === 'string'
    && typeof reference.repository?.name === 'string')) throw unavailable();
  const repo = run('gh', ['repo', 'view', '--json', 'nameWithOwner'], { cwd });
  const nameWithOwner = succeeded(repo) ? parsed(repo)?.nameWithOwner : null;
  if (typeof nameWithOwner !== 'string' || !/^[^/]+\/[^/]+$/.test(nameWithOwner)) throw unavailable();
  const numbers = new Set(references.filter(({ repository }) =>
    `${repository.owner.login}/${repository.name}`.toLowerCase() === nameWithOwner.toLowerCase())
    .map(({ number }) => number));
  const merged = [...numbers].map((number) => {
    const response = run('gh', ['pr', 'view', String(number), '--json',
      'number,state,headRefName,mergedAt,mergeCommit,closingIssuesReferences'], { cwd });
    const pr = succeeded(response) ? parsed(response) : null;
    if (pr?.number !== number || typeof pr.state !== 'string') throw unavailable();
    return pr;
  }).filter((pr) => pr.state === 'MERGED');
  if (!merged.length) throw undelivered();
  if (merged.length > 1) throw new Error(`merged_pr_ambiguous: #${issue}`);
  const [pr] = merged;
  if (typeof pr.mergedAt !== 'string' || !SHA.test(pr.mergeCommit?.oid ?? '')
    || !Array.isArray(pr.closingIssuesReferences)) throw unavailable();
  if (!pr.closingIssuesReferences.some((reference) => reference?.number === issue)
    || parseIssueBranch(pr.headRefName)?.issueNumber !== issue) throw undelivered();
  return 'delivered';
}
// Whether the worktree holds any change outside .nmg-sdlc/; an unreadable status throws.
function dirtyOutsideRuntime(cwd, run) {
  const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd });
  if (!succeeded(status)) throw new Error('worktree_status_unavailable');
  return String(status.stdout ?? '').split(/\r?\n/).filter(Boolean)
    .some((line) => !line.slice(3).startsWith('.nmg-sdlc/'));
}
// The repository default branch name; an empty or failed lookup throws.
function defaultBranchName(cwd, run) {
  const base = run('gh', ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'], { cwd });
  const name = succeeded(base) ? String(base.stdout ?? '').trim() : '';
  if (!name) throw new Error('default_branch_unreadable');
  return name;
}
// Another issue's branch is left for the default branch only when that issue is delivered at
// this head and the worktree is clean outside .nmg-sdlc/; otherwise the caller keeps it (returns false).
function leaveDeliveredBranch(cwd, run, current, branchIssue) {
  if (dirtyOutsideRuntime(cwd, run) || !completed(cwd, run, branchIssue.issueNumber, current.branch, current.head)) return false;
  const defaultBranch = defaultBranchName(cwd, run);
  if (!succeeded(run('git', ['switch', defaultBranch], { cwd }))) throw new Error('default_checkout_failed');
  return true;
}
// Deletes the remote issue branch only while it still points at the proven head. Returns the warning
// reason to report, or null when the branch was deleted or is already absent.
function deleteRemoteDeliveredBranch(cwd, run, branch, head) {
  let remote;
  try { remote = remoteHead(cwd, run, branch); } catch { return 'remote_head_unreadable'; }
  if (remote === null) return null;
  if (remote !== head) return 'remote_head_mismatch';
  return succeeded(run('git', ['push', 'origin', '--delete', branch], { cwd })) ? null : 'remote_delete_failed';
}
// Post-delivery cleanup of the issue branch proven delivered at `current.head`. A refused or failed
// local step returns its reason and runs no later step; a remote warning never stops local cleanup.
// It never throws, so its lines cannot change the delivery result or exit status.
function cleanupDeliveredBranch(cwd, run, issue, current) {
  const { branch, head } = current;
  const lines = [];
  const skipped = (reasonCode) => [...lines, `#${issue}: branch cleanup skipped: ${reasonCode}`];
  let dirty;
  try { dirty = dirtyOutsideRuntime(cwd, run); } catch { dirty = true; }
  if (dirty) return skipped('worktree_dirty');
  try {
    const now = checkout(cwd, run);
    if (now.branch !== branch || now.head !== head) return skipped('local_head_mismatch');
  } catch { return skipped('local_head_mismatch'); }
  const remoteWarning = deleteRemoteDeliveredBranch(cwd, run, branch, head);
  if (remoteWarning) lines.push(`#${issue}: remote branch cleanup skipped: ${remoteWarning}`);
  let defaultBranch;
  try { defaultBranch = defaultBranchName(cwd, run); } catch { return skipped('default_branch_unreadable'); }
  if (!succeeded(run('git', ['switch', defaultBranch], { cwd }))) return skipped('default_checkout_failed');
  if (!succeeded(run('git', ['pull', '--ff-only', 'origin', defaultBranch], { cwd }))) return skipped('pull_not_fast_forward');
  const ref = run('git', ['rev-parse', `refs/heads/${branch}`], { cwd });
  if (!succeeded(ref) || String(ref.stdout ?? '').trim() !== head) return skipped('local_branch_delete_failed');
  if (!succeeded(run('git', ['branch', '-D', branch], { cwd }))) return skipped('local_branch_delete_failed');
  return [...lines, `#${issue}: branch cleanup: deleted ${branch} and fast-forwarded ${defaultBranch}`];
}
function samePath(left, right) {
  const real = (path) => { try { return realpathSync(path); } catch { return resolve(path); } };
  return real(left) === real(right);
}
/** The checkout an issue is worked in: the invoking checkout when it is on the issue's branch, otherwise the
 * issue's worktree. Null while the issue has neither. */
function issueWorkdir(cwd, run, issue) {
  const here = run('git', ['branch', '--show-current'], { cwd });
  if (succeeded(here) && parseIssueBranch(String(here.stdout ?? '').trim())?.issueNumber === issue) return cwd;
  try {
    return findWorktree(cwd, (branch) => parseIssueBranch(branch)?.issueNumber === issue, run)?.path ?? null;
  } catch { return null; }
}
// Post-delivery cleanup of an issue's own worktree: the remote branch at the proven head, the worktree, its local
// branch, and a best-effort fast-forward of the primary checkout. It never switches a checkout and never throws.
function cleanupDeliveredWorktree(cwd, run, issue, current, workdir, env) {
  const lines = [];
  const remoteWarning = deleteRemoteDeliveredBranch(cwd, run, current.branch, current.head);
  if (remoteWarning) lines.push(`#${issue}: remote branch cleanup skipped: ${remoteWarning}`);
  let dirty;
  try { dirty = dirtyOutsideRuntime(workdir, run); } catch { dirty = true; }
  if (dirty) return [...lines, `#${issue}: worktree cleanup skipped: worktree_dirty (${workdir})`];
  const removal = removeWorktree({ cwd, branch: current.branch, run, env });
  lines.push(...removal.lines.map((line) => `#${issue}: ${line}`));
  let forwarded = null;
  try {
    const base = defaultBranchName(cwd, run);
    if (fastForwardPrimary({ cwd, base, run })) forwarded = base;
  } catch { /* the fast-forward is best-effort */ }
  if (removal.removed) lines.push(`#${issue}: worktree cleanup: removed ${current.branch}${forwarded ? ` and fast-forwarded ${forwarded}` : ''}`);
  return lines;
}
// A run started inside the issue's own linked worktree cannot switch it to the default branch or remove it from
// under itself: only the remote branch is cleaned up, and the worktree is named for the operator.
function cleanupInsideWorktree(cwd, run, issue, current) {
  const remoteWarning = deleteRemoteDeliveredBranch(cwd, run, current.branch, current.head);
  return [...(remoteWarning ? [`#${issue}: remote branch cleanup skipped: ${remoteWarning}`] : []),
    `#${issue}: worktree cleanup skipped: run_inside_worktree (${cwd})`];
}
/** Whether a passed review still covers `head`: it was finalized at this head, or only merges of the default branch
 * and controller commits (version preparation, the verification report) have landed since. */
function reviewCurrent(cwd, run, issue, head) {
  const record = readReview(cwd, issue);
  if (record?.status !== 'passed' || !SHA.test(record.headSha ?? '')) return false;
  if (record.headSha === head) return true;
  if (!succeeded(run('git', ['merge-base', '--is-ancestor', record.headSha, 'HEAD'], { cwd }))) return false;
  const repair = repairPathsSince(cwd, run, record.headSha);
  return Array.isArray(repair) && repair.length === 0;
}
/** After a conflicted `CHANGELOG.md` took the default branch's side, adds back the branch's `[Unreleased]` bullets that
 * side lacks. Returns how many were kept, or null when the two sides cannot be read or merged. */
function keepBranchChangelogEntries(cwd, run, files) {
  if (!files.includes('CHANGELOG.md')) return 0;
  const ours = run('git', ['show', ':2:CHANGELOG.md'], { cwd });
  const theirs = run('git', ['show', ':3:CHANGELOG.md'], { cwd });
  if (!succeeded(ours) || !succeeded(theirs)) return null;
  try {
    const merged = mergeUnreleasedEntries(String(theirs.stdout ?? ''), String(ours.stdout ?? ''));
    writeFileSync(join(cwd, 'CHANGELOG.md'), merged.content);
    return merged.kept;
  } catch { return null; }
}
/** Merges the freshly fetched remote default branch into the issue branch and publishes the result. Returns
 * `current` when nothing was needed, `merged`, or `conflict` with the conflicting files after aborting the merge. */
function integrateDefault(cwd, run, base) {
  const ref = `refs/remotes/origin/${base}`;
  if (!succeeded(run('git', ['fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${base}:${ref}`], { cwd }))) {
    throw new Error('default_branch_unreadable');
  }
  if (succeeded(run('git', ['merge-base', '--is-ancestor', ref, 'HEAD'], { cwd }))) return { status: 'current' };
  if (!succeeded(run('git', ['merge', '--no-edit', ref], { cwd }))) {
    const conflicted = run('git', ['diff', '--name-only', '--diff-filter=U'], { cwd });
    const files = String(conflicted?.stdout ?? '').split(/\r?\n/).filter(Boolean);
    // The version is prepared after integration, so a conflict confined to the version artifacts takes the default
    // branch's content, keeping the branch's own changelog entries; any other conflict goes back to implement.
    const versionOnly = files.length > 0 && files.every((file) => VERSION_ARTIFACTS.includes(file));
    const kept = versionOnly && succeeded(run('git', ['checkout', '--theirs', '--', ...files], { cwd }))
      ? keepBranchChangelogEntries(cwd, run, files) : null;
    if (kept === null || !succeeded(run('git', ['add', '--', ...files], { cwd }))
      || !succeeded(run('git', ['commit', '--no-edit'], { cwd }))) {
      run('git', ['merge', '--abort'], { cwd });
      return { status: 'conflict', files };
    }
    if (!succeeded(run('git', ['push', 'origin', 'HEAD'], { cwd }))) throw new Error('integration_push_failed');
    return { status: 'merged', resolved: files, kept };
  }
  if (!succeeded(run('git', ['push', 'origin', 'HEAD'], { cwd }))) throw new Error('integration_push_failed');
  return { status: 'merged' };
}
/** Reverts the issue's version-preparation commit when the branch still carries one, and publishes the revert, so a
 * branch that leaves the merge queue claims no version. Returns whether a revert was published. */
function revertPreparedVersion(cwd, run, issue, base) {
  const log = run('git', ['log', '--first-parent', '--format=%H%x09%s', `refs/remotes/origin/${base}..HEAD`], { cwd });
  if (!succeeded(log)) return false;
  const delivery = new RegExp(`^(?:feat|fix): deliver issue #${issue}$`);
  for (const line of String(log.stdout ?? '').split(/\r?\n/).filter(Boolean)) {
    const [sha, subject = ''] = line.split('\t');
    if (subject.startsWith('Revert "') && subject.includes(`deliver issue #${issue}"`)) return false;
    if (!delivery.test(subject)) continue;
    if (!succeeded(run('git', ['revert', '--no-edit', sha], { cwd }))) {
      run('git', ['revert', '--abort'], { cwd });
      return false;
    }
    return succeeded(run('git', ['push', 'origin', 'HEAD'], { cwd }));
  }
  return false;
}
function readRegularEvidence(root, path, maxBytes) {
  const relativePath = relative(resolve(root), resolve(path));
  if (relativePath.startsWith('..') || relativePath.startsWith('/') || !relativePath) return null;
  let parent = realpathSync(root);
  for (const component of relativePath.split('/').slice(0, -1)) {
    parent = join(parent, component);
    const stat = lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
  }
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd, { bigint: true });
    if (!stat.isFile() || stat.size > BigInt(maxBytes)) return null;
    return { bytes: readFileSync(fd), inode: stat.ino, modified: stat.mtimeNs };
  } finally { closeSync(fd); }
}
function handoffSnapshot(root, path) {
  try { return readRegularEvidence(root, path, MAX_HANDOFF_BYTES); } catch { return null; }
}
function freshHandoff(cwd, issue, step, previous) {
  const path = join(cwd, HANDOFF_DIR, `${issue}-${step}.json`);
  const snapshot = handoffSnapshot(cwd, path);
  if (!snapshot || (previous && snapshot.inode === previous.inode
    && snapshot.modified === previous.modified && snapshot.bytes.equals(previous.bytes))) return null;
  const handoff = validateHandoff(JSON.parse(snapshot.bytes.toString('utf8')));
  if (handoff.issue !== issue || handoff.step !== step) throw new Error('invalid_handoff_identity');
  return handoff;
}
/** The stage subagent's status from its agent record, or '' when none is readable. */
function workerState(host, agentId) {
  try {
    return String(host.activity(agentId)?.status ?? '').toLowerCase();
  } catch { return ''; }
}
function waitingMarker(path) {
  try { const stat = lstatSync(path); return stat.isFile() && stat.size > 0; } catch { return false; }
}
function reminderPrompt(handoffPath) {
  return `nmg-sdlc controller: your turn ended without a handoff at ${handoffPath}. If a background command for this step is still running, write ${handoffPath}.waiting naming it and end your turn; you are resumed when it finishes. Otherwise finish the step now and write and validate the handoff.`;
}
/** The activity time a later start is measured from: the record's last activity, or 0 before any. */
function activityMark(record) {
  return Number.isSafeInteger(record?.lastActivityAt) ? record.lastActivityAt : 0;
}
/** The git directory of the checkout, resolved against `cwd`, or null when Git cannot name it. */
function gitDirOf(cwd, run) {
  const response = run('git', ['rev-parse', '--git-dir'], { cwd });
  const value = String(response?.stdout ?? '').trim();
  return succeeded(response) && value ? resolve(cwd, value) : null;
}
/** Supervises one dispatched stage subagent until it writes a fresh handoff or stops. A subagent settles
 * `idle`/`completed` whenever its turn ends, including while a `run_in_background` command it started is still
 * running, so a settled subagent without a handoff is not yet done: one that wrote its waiting marker is awaited
 * until it resumes, and one that did not is reminded once through the append path and awaited through its resumed
 * turn. Before it returns, the worker's tracked background commands and the git index lock must clear, so the
 * commits they made are visible to the stage report. */
export function awaitWorkerHandoff({ host, agentId, cwd, issue, step, prior, run = defaultRun,
  waitFor = (args) => host.wait({ agentId, ...args }),
  pause = (args) => host.wait({ agentId, ...args, timeoutMs: CHECK_IN_SLICE_MS }) }) {
  const handoffPath = `${HANDOFF_DIR}/${issue}-${step}.json`;
  const waiting = join(cwd, `${handoffPath}.waiting`);
  waitFor({ until: 'working' });
  const observed = awaitTurnEnd({ host, agentId, cwd, issue, step, prior, waitFor, handoffPath, waiting });
  settleCommits({ host, agentId, cwd, run, pause });
  return observed;
}
// Waits for the worker's turn to end with a fresh handoff, a waiting marker, or a stop; see awaitWorkerHandoff.
function awaitTurnEnd({ host, agentId, cwd, issue, step, prior, waitFor, handoffPath, waiting }) {
  const settle = () => ({ handoff: freshHandoff(cwd, issue, step, prior), state: workerState(host, agentId) });
  let reminded = false;
  // What ends a wait on a settled worker besides its next turn: its marker is gone, its handoff has changed, or it
  // has stopped.
  const changed = () => {
    try {
      return !waitingMarker(waiting) || freshHandoff(cwd, issue, step, prior) !== null
        || STOPPED.includes(workerState(host, agentId));
    } catch { return true; }
  };
  for (;;) {
    waitFor({});
    // The mark is read before the handoff, so a turn that starts after either read ends the wait below at once.
    let mark = activityMark(host.activity(agentId));
    let observed = settle();
    if (observed.handoff || !SETTLED.includes(observed.state)) return observed;
    if (!waitingMarker(waiting)) {
      if (reminded) return observed;
      // The reminder resumes the settled turn through append; the resumed turn must start within the bound.
      mark = activityMark(host.activity(agentId));
      if (!host.append({ agentId, text: reminderPrompt(handoffPath) })) return observed;
      reminded = true;
      if (waitFor({ until: 'started', since: mark, timeoutMs: RESUME_POLL_MS }).timedOut) return observed;
      continue;
    }
    // A settled worker already counts as working, so the wait is for its next turn: it blocks between host polls
    // until the worker starts one, its marker or handoff changes, or the resume bound passes.
    while (SETTLED.includes(observed.state) && waitingMarker(waiting)) {
      waitFor({ until: 'started', since: mark, timeoutMs: RESUME_POLL_MS, changed });
      mark = activityMark(host.activity(agentId));
      observed = settle();
      if (observed.handoff) return observed;
    }
    if (!SETTLED.includes(observed.state) && !ACTIVE_AGENT_STATUSES.includes(observed.state)) return observed;
    rmSync(waiting, { force: true });
    reminded = false;
  }
}
// Holds the stage report until the worker tracks no background command and the git index is unlocked. An active
// worker is waited on until it settles; a settled one is waited on until it starts a new turn, which ends its
// tracked background commands. A worker that stopped is not waited on.
function settleCommits({ host, agentId, cwd, run, pause }) {
  const gitDir = gitDirOf(cwd, run);
  for (;;) {
    const record = host.activity(agentId);
    const background = Array.isArray(record?.background) && record.background.length > 0;
    const locked = gitDir !== null && existsSync(join(gitDir, 'index.lock'));
    const state = workerState(host, agentId);
    if ((!background && !locked) || (!SETTLED.includes(state) && !ACTIVE_AGENT_STATUSES.includes(state))) return;
    pause(ACTIVE_AGENT_STATUSES.includes(state) ? {} : { until: 'started', since: activityMark(record) });
  }
}
// A supervisor decision taken at a check-in that ends the current wait.
class SupervisorDecision extends Error {
  constructor(decision) { super(`supervisor_${decision.action}`); this.decision = decision; }
}
// The stage reason for a subagent that ended without a handoff: a settled turn is a missing handoff, a
// failed or killed subagent (or one whose status is unknown) is a lost process.
function lostReason(state) {
  return SETTLED.includes(state) ? 'missing_handoff' : 'process_lost';
}
function headOf(cwd, run) {
  const head = run('git', ['rev-parse', 'HEAD'], { cwd });
  const value = String(head?.stdout ?? '').trim();
  return succeeded(head) && SHA.test(value) ? value : null;
}
/** The spec's declared files: its own directory plus every task `**File(s)**:` entry. `tasks.md` is read from the
 * working tree, or, given a `ref`, as committed on that ref. */
function declaredSpecEntries(cwd, specPath, { ref = null, run = defaultRun } = {}) {
  if (!specPath) return [];
  const entries = [`${specPath}/`];
  let tasks = '';
  if (ref) {
    const shown = run('git', ['show', `${ref}:${specPath}/tasks.md`], { cwd });
    if (!succeeded(shown)) return entries;
    tasks = String(shown.stdout ?? '');
  } else {
    try { tasks = readFileSync(join(cwd, specPath, 'tasks.md'), 'utf8'); } catch { return entries; }
  }
  for (const match of tasks.matchAll(/^\*\*File\(s\)\*\*:\s*(.+)$/gm)) {
    try { entries.push(...publicationFileEntries(match[1])); } catch { /* an unparsable declaration declares nothing */ }
  }
  return entries;
}
function matchesEntry(path, entry) {
  if (entry.endsWith('/')) return path.startsWith(entry);
  if (!/[*?]/.test(entry)) return path === entry;
  const pattern = entry.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]').replace(/\0/g, '.*');
  return new RegExp(`^${pattern}$`).test(path);
}
/** Commits added since `before`, their changed paths, and the paths outside the spec's declared files. */
function addedWork(cwd, run, before, specPath) {
  const none = { commits: [], changedPaths: [], outsideSpecPaths: [] };
  const after = headOf(cwd, run);
  if (!SHA.test(before ?? '') || !after || after === before) return none;
  const log = run('git', ['log', '--format=%H %s', `${before}..HEAD`], { cwd });
  const diff = run('git', ['diff', '--name-only', `${before}..HEAD`], { cwd });
  if (!succeeded(log) || !succeeded(diff)) return { ...none, unreadable: true };
  const lines = (value) => String(value.stdout ?? '').split(/\r?\n/).filter(Boolean);
  const changedPaths = lines(diff);
  const entries = declaredSpecEntries(cwd, specPath);
  return {
    commits: lines(log).map((line) => ({ sha: line.slice(0, 40), subject: line.slice(41) })),
    changedPaths,
    outsideSpecPaths: changedPaths.filter((path) => !path.startsWith('.nmg-sdlc/')
      && !entries.some((entry) => matchesEntry(path, entry))),
  };
}
function reportHistory(history) {
  return history.slice(-REPORT_HISTORY).map(({ step, head, reasonCode, summary, artifacts }) =>
    ({ step, head, reasonCode, summary, artifacts }));
}
// Markdown sections of a verification report whose heading names critical or remaining issues.
function issueSections(content) {
  const lines = content.split(/\r?\n/);
  const level = (line) => /^(#{1,6})\s/.exec(line)?.[1].length ?? Infinity;
  const sections = [];
  for (let index = 0; index < lines.length; index += 1) {
    const own = level(lines[index]);
    if (own < 2 || own > 6 || !/critical|remaining issues/i.test(lines[index])) continue;
    let end = index + 1;
    while (end < lines.length && level(lines[end]) > own) end += 1;
    sections.push(lines.slice(index, end).join('\n').trim().slice(0, 4000));
    index = end - 1;
  }
  return sections;
}
function verificationSummary(cwd, issue, evidence) {
  const path = evidence?.verification?.path;
  if (!path) return { report: null };
  try {
    const report = readRegularEvidence(cwd, join(cwd, path), MAX_VERIFICATION_REPORT_BYTES);
    if (!report) return { report: path, readiness: null, issues: [] };
    const content = report.bytes.toString('utf8');
    const { status, reasonCode, gaps } = inspectVerificationReadiness({ content, options: {
      expectedIssueNumber: issue, expectedSpecPath: evidence.spec?.path, expectedScope: evidence.spec?.scope } });
    return { report: path, readiness: { status, reasonCode, gaps }, issues: issueSections(content) };
  } catch { return { report: path, readiness: null, issues: [] }; }
}
function waitingInfo(path, now) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size === 0) return null;
    const command = readFileSync(path, 'utf8').trim().split(/\r?\n/)[0].slice(0, 500);
    return { command, ageSeconds: Math.max(0, Math.round((now - stat.mtimeMs) / 1000)), modified: stat.mtimeMs };
  } catch { return null; }
}
function guidancePrompt({ issue, step, text, handoffPath, boundary }) {
  return `nmg-sdlc supervisor guidance for #${issue} ${step}:\n${text}\n${boundary
    ? `Act on this guidance, then write and validate a fresh handoff at ${handoffPath}.`
    : 'Act on this guidance within the current step; the handoff contract is unchanged.'}`;
}

function sourceHeadForGate(cwd, run, head, report, artifactHead) {
  if (artifactHead === head) return head;
  if (!report || !SHA.test(artifactHead ?? '')) return null;
  const parents = run('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { cwd });
  const paths = run('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], { cwd });
  if (!succeeded(parents) || !succeeded(paths)) return null;
  const commits = String(parents.stdout).trim().split(/\s+/);
  const changed = String(paths.stdout).trim().split(/\r?\n/).filter(Boolean);
  return commits.length === 2 && commits[0] === head && commits[1] === artifactHead
    && changed.length === 1 && changed[0] === report ? artifactHead : null;
}

function registeredGateStatus(cwd, run, issue, head, snapshot, { allowPending = false } = {}) {
  const reportPath = snapshot.verification?.path;
  if (!reportPath) return null;
  if (!allowPending) {
    const tracked = run('git', ['ls-files', '--error-unmatch', '--', reportPath], { cwd });
    const status = run('git', ['status', '--porcelain=v1', '--', reportPath], { cwd });
    if (!succeeded(tracked) || !succeeded(status) || String(status.stdout ?? '').trim()) return null;
  }
  try {
    const gate = readRegularEvidence(cwd, join(cwd, '.nmg-sdlc/verification', `${issue}.json`), MAX_GATE_ARTIFACT_BYTES);
    const report = readRegularEvidence(cwd, join(cwd, reportPath), MAX_VERIFICATION_REPORT_BYTES);
    if (!gate || !report) return null;
    const artifact = JSON.parse(gate.bytes.toString('utf8'));
    const gateHead = sourceHeadForGate(cwd, run, head, reportPath, artifact.identity?.headSha);
    if (!gateHead) return null;
    const readiness = inspectVerificationReadiness({
      content: report.bytes.toString('utf8'),
      options: { expectedIssueNumber: issue, expectedSpecPath: snapshot.spec.path,
        expectedScope: snapshot.spec.scope, expectedHeadSha: gateHead },
    });
    if (readiness.gaps.length || !['pass', 'pr_evidence_pending', 'pr_evidence_satisfied'].includes(readiness.status)) {
      return null;
    }
    const result = inspectVerificationArtifactRepair(artifact, {
      expectedIssueNumber: issue, expectedHeadSha: gateHead,
    });
    if (artifact.ceiling !== null || artifact.coverage?.complete !== true || result.gaps.length
      || !matchesRegisteredResults(cwd, artifact, {
        issue, specPath: snapshot.spec.path, gateHead, reportPath, run,
      })) return null;
    return readiness.status;
  } catch { return null; }
}
function gatePassed(cwd, run, issue, head, snapshot, { allowPending = false } = {}) {
  const status = registeredGateStatus(cwd, run, issue, head, snapshot, { allowPending });
  return allowPending ? status === 'pr_evidence_pending'
    : status === 'pass' || status === 'pr_evidence_satisfied';
}
function observedSource(cwd, run) {
  const tree = run('git', ['rev-parse', 'HEAD^{tree}'], { cwd });
  const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd });
  if (!succeeded(tree) || !succeeded(status)) throw new Error('source_evidence_unavailable');
  return {
    tree: String(tree.stdout ?? '').trim(),
    worktree: String(status.stdout ?? '').split(/\r?\n/).filter((line) =>
      line && !line.slice(3).startsWith('.nmg-sdlc/')),
  };
}
// Prepares the issue's version artifacts on its published branch (`sdlc-deliver.mjs prepare-version`,
// a no-op once they are synchronized) and returns the resulting source head.
function prepareVersion(cwd, run, issue, invocationId) {
  const result = run(process.execPath, [join(packageRoot, 'scripts', 'sdlc-deliver.mjs'), 'prepare-version',
    '--issue', String(issue), '--controller-run-id', invocationId], { cwd });
  const prepared = String(result?.stdout ?? '').split(/\r?\n/)
    .find((line) => line.startsWith('NMG_SDLC_VERSION_PREPARED: '));
  if (succeeded(result) && prepared) {
    const headSha = JSON.parse(prepared.slice('NMG_SDLC_VERSION_PREPARED: '.length)).headSha;
    if (SHA.test(headSha ?? '')) return headSha;
  }
  let reason = String(result?.stderr ?? '').trim().split(/\r?\n/)[0] || 'unknown';
  let summary = '';
  if (String(result?.stdout ?? '').includes('NMG_SDLC_HANDOFF: ')) {
    try {
      const handoff = JSON.parse(readFileSync(join(cwd, HANDOFF_DIR, `${issue}-deliver.json`), 'utf8'));
      reason = handoff.reasonCode ?? reason;
      summary = typeof handoff.summary === 'string' ? handoff.summary.trim() : '';
    } catch { /* keep the stderr reason */ }
  }
  throw new Error(summary
    ? `version_preparation_failed: ${reason} — ${summary}`
    : `version_preparation_failed: ${reason}`);
}

// The gate's failing results: their ids, the test failure lines extracted from their command output (first ten
// named), and the full-output log files that hold them.
function gateFailures(artifact) {
  const failing = (artifact.results ?? []).filter((item) =>
    item.required && item.applicable && item.effectiveStatus !== 'passed');
  const evidence = failing.flatMap((item) => (Array.isArray(item.result?.evidence) ? item.result.evidence : []));
  return {
    ids: failing.map((item) => item.id),
    failures: evidence.flatMap((entry) => (Array.isArray(entry?.failures) ? entry.failures : [])),
    logs: evidence.filter((entry) => entry?.kind === 'command' && typeof entry.artifact === 'string')
      .map((entry) => entry.artifact),
  };
}
function currentGateFailure(cwd, run, issue, head, report) {
  try {
    const path = `.nmg-sdlc/verification/${issue}.json`;
    const snapshot = readRegularEvidence(cwd, join(cwd, path), MAX_GATE_ARTIFACT_BYTES);
    if (!snapshot) return null;
    const artifact = JSON.parse(snapshot.bytes.toString('utf8'));
    const gateHead = sourceHeadForGate(cwd, run, head, report, artifact.identity?.headSha);
    if (!gateHead) return null;
    const result = inspectVerificationArtifactRepair(artifact, {
      expectedIssueNumber: issue, expectedHeadSha: gateHead,
    });
    if (artifact.ceiling === null && result.gaps.length === 0) return null;
    const { ids, failures, logs } = gateFailures(artifact);
    const named = failures.length ? `; failures: ${failures.slice(0, 10).join(' | ')}` : '';
    return { step: 'verify', head, reasonCode: result.reasonCode ?? 'verification_not_green',
      summary: `Current registered gate is ${artifact.ceiling ?? 'invalid'}: ${ids.join(', ') || result.gaps.join(', ')}${named}`,
      artifacts: [path, ...(report ? [report] : []), ...logs] };
  } catch { return null; }
}

// Gate intent: a verify dispatched at a head is recorded before it starts, so a controller restarted while it runs
// resumes verify at that head rather than routing on the older failed result. Writes are atomic.
function gateIntentPath(cwd, issue) { return join(cwd, GATE_INTENT_DIR, `${issue}.json`); }
function writeGateIntent(cwd, { issue, head, dispatchedAt }) {
  const path = gateIntentPath(cwd, issue);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, issue, head, dispatchedAt }, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}
function readGateIntent(cwd, issue) {
  try {
    const snapshot = readRegularEvidence(cwd, gateIntentPath(cwd, issue), 4096);
    if (!snapshot) return null;
    const record = JSON.parse(snapshot.bytes.toString('utf8'));
    return record?.schemaVersion === 1 && record.issue === issue && SHA.test(record.head ?? '')
      && Number.isSafeInteger(record.dispatchedAt) ? record : null;
  } catch { return null; }
}
function clearGateIntent(cwd, issue) { rmSync(gateIntentPath(cwd, issue), { force: true }); }
function readGateArtifact(cwd, issue) {
  try {
    const snapshot = readRegularEvidence(cwd, join(cwd, '.nmg-sdlc/verification', `${issue}.json`), MAX_GATE_ARTIFACT_BYTES);
    return snapshot ? JSON.parse(snapshot.bytes.toString('utf8')) : null;
  } catch { return null; }
}
/** Whether a verify dispatched at `head` is still unanswered: its intent exists and no gate result newer than the
 * dispatch has landed for that head. An intent for another head, or one a newer gate result answers, is removed. */
function liveGateIntent(cwd, run, issue, head, report) {
  const intent = readGateIntent(cwd, issue);
  if (!intent) return false;
  if (intent.head !== head) { clearGateIntent(cwd, issue); return false; }
  const gate = readGateArtifact(cwd, issue);
  const gateHead = gate ? sourceHeadForGate(cwd, run, head, report, gate.identity?.headSha) : null;
  if (gateHead === head && Date.parse(gate.generatedAt) > intent.dispatchedAt) {
    clearGateIntent(cwd, issue);
    return false;
  }
  return true;
}

/** Runs execute to completion. Stage subagents are started, observed, steered and stopped through `host`
 * (scripts/sdlc-execute-host.mjs); `supervisorSession` names the supervising session whose heartbeat holds
 * the lease. With `supervise(report) → { action, text }`, every worker settlement yields a stage report and
 * every check-in interval (or stall) of a running worker a check-in report; without it the existing routing
 * runs unsupervised. */
export function runExecute({ args = '', cwd = process.cwd(), env = process.env, run = defaultRun,
  host = null, supervisorSession, processApi = process, onLeaseAcquired = () => {},
  supervise = null, now = Date.now, checkInMs,
  sleep = (milliseconds) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); } } = {}) {
  const fail = (reason, status = 1) => ({ status, stdout: '', stderr: `${reason}\n` });
  if (!host) return { status: 2, stdout: '', stderr: 'execute requires /sdlc-execute in a Claude Code session\n' };
  let selected;
  try { selected = parseArgs(args); } catch { return fail(usage(), 2); }
  // The project stage and test-layer configurations are validated before any Git or GitHub call or worker start.
  let stageModels;
  try {
    stageModels = loadStageModels(cwd);
    loadTestLayers(cwd);
  } catch (error) { return { status: 2, stdout: '', stderr: `${error.message}\n` }; }
  const stageWarning = stageModelsWarning(stageModels);
  const warned = (result) => (stageWarning ? { ...result, stdout: `${stageWarning}\n${result.stdout}` } : result);
  if (!succeeded(run('gh', ['auth', 'status'], { cwd }))) return warned(fail('gh auth status failed'));

  const invocationId = randomUUID();
  // The lease is held on the checkout an issue is worked in, so runs for different issues never contend for the
  // invoking checkout. The supervising session's heartbeat stays under the invoking checkout (`sessionRoot`).
  let lease = null;
  let leaseRoot = null;
  const dropLease = () => {
    if (lease) releaseControllerLease(lease);
    lease = null;
    leaseRoot = null;
  };
  const holdLease = (root) => {
    if (leaseRoot === root) return;
    dropLease();
    const previous = readControllerLease(root);
    if (previous) reclaimStaleControllerLease({ projectRoot: root, runId: previous.runId, processApi, now });
    lease = acquireControllerLease({ projectRoot: root, runId: invocationId, supervisorSession, sessionRoot: cwd });
    leaseRoot = root;
    onLeaseAcquired(invocationId, root);
  };
  const interval = checkInMs ?? (selected.checkInSeconds ? selected.checkInSeconds * 1000 : DEFAULT_CHECK_IN_MS);
  const decide = (report) => {
    const decision = supervise(report);
    if (!report.decisions.includes(decision?.action)
      || (decision.action !== 'accept' && decision.action !== 'continue'
        && (typeof decision.text !== 'string' || !decision.text.trim()))) {
      throw new Error(`supervisor_decision_invalid: ${decision?.action ?? 'none'}`);
    }
    return decision;
  };
  /** Waits for one dispatched stage subagent under supervision: check-in reports while it runs, then a stage
   * report at its settlement. Returns `{ handoff, state }` to accept, plus `decision` to re-dispatch or halt. */
  const superviseWorker = ({ issue, step, host, agentId, name, prior, before, history, workdir, overlaps = [] }) => {
    const cwd = workdir;
    const handoffPath = `${HANDOFF_DIR}/${issue}-${step}.json`;
    const waitingPath = join(cwd, `${handoffPath}.waiting`);
    let specPath = null;
    try {
      const dir = resolveSpecDir(cwd, issue);
      if (dir) specPath = relative(cwd, dir).split(sep).join('/');
    } catch { /* reported without spec-scoped paths */ }
    const dispatchedAt = now();
    const monitor = { lastCheckIn: dispatchedAt, activityAt: null, changedAt: dispatchedAt, activityReported: false, markerReported: null };
    const base = () => ({ issue, stage: step, worker: name, agentId, ...addedWork(cwd, run, before, specPath),
      failureHistory: reportHistory(history), ...(overlaps.length ? { overlaps } : {}) });
    const guide = (decision, boundary) => host.append({ agentId,
      text: guidancePrompt({ issue, step, text: decision.text, handoffPath, boundary }) });
    const checkIn = () => {
      const at = now();
      const record = host.activity(agentId);
      const activityAt = Number.isSafeInteger(record?.lastActivityAt) ? record.lastActivityAt : null;
      if (activityAt !== null && activityAt !== monitor.activityAt) {
        Object.assign(monitor, { activityAt, changedAt: at, activityReported: false });
      }
      const marker = waitingInfo(waitingPath, at);
      // A tracked background command is work in progress, so an unchanged activity time is not a stall.
      const backgrounded = Array.isArray(record?.background) && record.background.length > 0;
      const activityStalled = activityAt !== null && !monitor.activityReported && !backgrounded
        && at - monitor.changedAt >= interval;
      const markerStale = Boolean(marker) && marker.ageSeconds * 1000 >= interval && monitor.markerReported !== marker.modified;
      const reason = at - monitor.lastCheckIn >= interval ? 'interval'
        : activityStalled ? 'activity_unchanged' : markerStale ? 'waiting_marker_stale' : null;
      if (!reason) return;
      if (activityStalled) monitor.activityReported = true;
      if (markerStale) monitor.markerReported = marker.modified;
      monitor.lastCheckIn = at;
      let note = null;
      for (;;) {
        const decision = decide({ kind: 'checkin', reason, ...base(),
          sinceDispatchSeconds: Math.round((at - dispatchedAt) / 1000),
          activity: activityRecord(record ?? {}, at),
          waiting: marker ? { command: marker.command, ageSeconds: marker.ageSeconds } : null,
          note, decisions: CHECK_IN_DECISIONS });
        if (decision.action === 'continue') return;
        if (decision.action !== 'prompt') throw new SupervisorDecision(decision);
        // The hooks module adds guidance to the running subagent's conversation before its next model request.
        if (guide(decision, false)) return;
        note = 'guidance could not be delivered to the stage subagent';
      }
    };
    const waitFor = (args) => {
      const deadline = args.timeoutMs ? now() + args.timeoutMs : Infinity;
      for (;;) {
        const slice = Math.max(1, Math.ceil(Math.min(deadline - now(), CHECK_IN_SLICE_MS, interval)));
        const response = host.wait({ agentId, ...args, timeoutMs: slice });
        if (!response.timedOut || now() >= deadline) return response;
        checkIn();
      }
    };
    // One slice of waiting on the worker's background work; a slice that elapses is a check-in opportunity.
    const pause = (args) => {
      const response = host.wait({ agentId, ...args, timeoutMs: CHECK_IN_SLICE_MS });
      if (response.timedOut) checkIn();
      return response;
    };
    let previous = prior;
    let latest = null;
    for (;;) {
      let observed;
      try {
        observed = awaitWorkerHandoff({ host, agentId, cwd, issue, step, prior: previous, run, waitFor, pause });
      } catch (error) {
        if (error instanceof SupervisorDecision) return { handoff: null, state: workerState(host, agentId), decision: error.decision };
        throw error;
      }
      // The turn has ended, so its running-worker marker goes before the stage report that names it.
      host.finish();
      const handoff = observed.handoff ?? latest;
      // A prompt the worker could not take, or did not start a turn for within the bound, is reported on the next report.
      let promptRefusal = null;
      for (;;) {
        const headAfter = headOf(cwd, run);
        let evidence = null;
        let gate = 'unavailable';
        try {
          evidence = statusEvidence(cwd, run);
          gate = registeredGateStatus(cwd, run, issue, headAfter, evidence) ?? 'not_green';
        } catch { /* reported as unavailable */ }
        const decision = decide({ kind: 'stage', ...base(), handoff, handoffFresh: Boolean(observed.handoff),
          workerState: observed.state, headBefore: before, headAfter, gate,
          ...(step === 'verify' ? { verification: verificationSummary(cwd, issue, evidence) } : {}),
          promptRefusal, decisions: observed.state && !promptRefusal ? STAGE_DECISIONS : STAGE_DECISIONS.filter((action) => action !== 'prompt') });
        if (decision.action === 'accept') return { handoff, state: observed.state };
        if (decision.action !== 'prompt') return { handoff, state: observed.state, decision };
        // Snapshot before prompting: the handoff the worker writes for this guidance counts as fresh.
        previous = handoffSnapshot(cwd, join(cwd, handoffPath));
        const mark = activityMark(host.activity(agentId));
        if (!guide(decision, true)) {
          promptRefusal = { reasonCode: 'stage_prompt_undelivered', summary: 'the guidance could not be delivered to the stage subagent' };
          continue;
        }
        let started;
        try {
          started = !waitFor({ until: 'started', since: mark, timeoutMs: RESUME_POLL_MS }).timedOut;
        } catch (error) {
          if (error instanceof SupervisorDecision) return { handoff, state: observed.state, decision: error.decision };
          throw error;
        }
        if (started) break;
        promptRefusal = { reasonCode: 'stage_prompt_not_resumed',
          summary: `the stage subagent did not start a new turn within ${RESUME_POLL_MS / 1000} seconds of the guidance` };
      }
      latest = handoff;
    }
  };
  const output = [];
  try {
    const first = checkout(cwd, run);
    let active = parseIssueBranch(first.branch);
    if (active && selected.issues.length && selected.issues[0] !== active.issueNumber) {
      // Another issue's branch is no conflict: the selected issues run in their own worktrees. A delivered, clean
      // branch is still left for the default branch where this checkout can switch to it.
      try { leaveDeliveredBranch(cwd, run, first, active); } catch { /* the checkout stays as it is */ }
      active = null;
    }
    let issues = selected.issues;
    if (active && selected.defaultBacklog) issues = [active.issueNumber];
    else if (!active && selected.defaultBacklog) {
      const candidates = listSpecifiedIssues({ cwd, run });
      if (!candidates.length) return warned({ status: 0, stdout: 'No open spec-created issues.\n', stderr: '' });
      if (typeof host.pickIssue !== 'function') {
        return warned(fail(`select an eligible issue: ${candidates.map((item) => `#${item.number}`).join(', ')}`, 2));
      }
      const chosen = host.pickIssue(candidates);
      if (!candidates.some((item) => item.number === chosen)) throw new Error('issue_selection_invalid');
      issues = [chosen];
    }
    for (const issue of issues) {
      let failure = null;
      const history = [];
      // The checkout this issue is worked in, once it has one; until then the invoking checkout only starts it.
      let workdir = null;
      let queued = false;
      let queueReported = false;
      let overlaps = null;
      // The approved spec when start found it only on a ref (the fetched remote default branch), not in the checkout.
      let specOnRef = null;
      const recordFailure = (packet) => {
        failure = { ...packet, ...observedSource(workdir ?? cwd, run) };
        history.push(failure);
      };
      const leaveQueue = () => {
        try { leaveMergeQueue(cwd, issue, { run }); } catch { /* an unreadable queue holds no entry to remove */ }
        queued = false;
      };
      // Repository-wide and host-wide state is informational: a failure to record it never stops delivery.
      const inFlight = (stage, branch, declaredFiles) => {
        try {
          recordInFlight(cwd, { issue, branch, worktree: workdir ?? cwd, stage, session: supervisorSession ?? null, declaredFiles }, { run, env });
        } catch { /* reported by status as absent */ }
      };
      let needsImplement = false;
      let requiresPrEvidence = false;
      // A supervisor re-dispatch: the stage to repeat where routing allows, and its guidance.
      let forced = null;
      let guidance = null;
      const implementedHeads = new Set();
      try {
      for (;;) {
        if (!workdir || !existsSync(workdir)) workdir = issueWorkdir(cwd, run, issue);
        const at = workdir ?? cwd;
        if (workdir) holdLease(workdir);
        const current = checkout(at, run);
        const branchIssue = workdir ? parseIssueBranch(current.branch) : null;
        if (workdir && branchIssue?.issueNumber !== issue) throw new Error('worker_branch_mismatch');
        const evidence = branchIssue ? statusEvidence(at, run) : null;
        if (branchIssue && completed(at, run, issue, current.branch, current.head)) {
          output.push(`#${issue}: MERGED and CLOSED`);
          leaveQueue();
          try { clearInFlight(cwd, issue, { run, env }); } catch { /* nothing recorded */ }
          let linked = false;
          try { linked = isLinkedWorktree(cwd, run); } catch { /* treated as the primary checkout */ }
          if (!samePath(at, cwd)) {
            // The worktree's lease goes before the worktree does.
            dropLease();
            output.push(...cleanupDeliveredWorktree(cwd, run, issue, current, at, env));
          } else output.push(...(linked ? cleanupInsideWorktree(cwd, run, issue, current) : cleanupDeliveredBranch(cwd, run, issue, current)));
          break;
        }
        if (!branchIssue && !failure) {
          if (closedIssueDelivery(cwd, run, issue) === 'delivered') {
            output.push(`#${issue}: MERGED and CLOSED`);
            break;
          }
          const view = run('gh', ['issue', 'view', String(issue), '--json', 'number,labels'], { cwd });
          if (!succeeded(view)) throw new Error(`issue #${issue} unavailable`);
          if (!issueHasSpecCreatedLabel(parsed(view))) throw new Error(`#${issue} has no spec-created label`);
          const graph = readDependencyGraph(createIssueDependencyClient({ cwd, run }), [issue]);
          const dependency = issueDependencyStatus(graph, issue);
          if (dependency.status !== 'eligible') throw new Error(dependency.reasonCode ?? 'dependency_blocked');
          let spec = specStatus(issue, cwd);
          if (!spec.approved) {
            // A primary checkout behind the remote default branch may not hold the approved spec yet. It is
            // fast-forwarded when it can be; otherwise the spec is read from the fetched remote default branch, from
            // which start-issue creates the issue's worktree.
            try {
              const base = defaultBranchName(cwd, run);
              if (fastForwardPrimary({ cwd, base, run })) spec = specStatus(issue, cwd);
              const ref = `refs/remotes/origin/${base}`;
              if (!spec.approved && succeeded(run('git', ['fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${base}:${ref}`], { cwd }))) {
                const remote = specStatusOnRef(issue, cwd, ref);
                // An ambiguous or unreadable spec on the remote ref is reported when the checkout gave no reason.
                if (remote.approved || (!spec.reasonCode && remote.reasonCode)) spec = remote;
              }
            } catch { /* best-effort */ }
          }
          if (spec.approved && spec.ref) specOnRef = spec;
          if (!spec.approved) throw new Error(`approved_spec_missing: #${issue} (${spec.reasonCode ?? 'no singular four-file Approved package'})`);
        }
        if (overlaps === null) {
          // At start, the spec's declared files are compared with those of the repository's in-flight issues.
          overlaps = [];
          try {
            const dir = resolveSpecDir(at, issue);
            const declaredFiles = dir ? declaredSpecEntries(at, relative(at, dir).split(sep).join('/'))
              : specOnRef ? declaredSpecEntries(cwd, specOnRef.dir, { ref: specOnRef.ref, run }) : [];
            overlaps = inFlightOverlaps(cwd, { issue, declaredFiles }, { run });
            for (const overlap of overlaps) {
              output.push(`#${issue}: overlaps in-flight #${overlap.issue} (${overlap.branch}) on ${overlap.files.join(', ')}`);
            }
            inFlight(branchIssue ? 'resumed' : 'start', branchIssue ? current.branch : '', declaredFiles);
          } catch { /* overlap reporting never blocks the run */ }
        }
        let step;
        // A verify dispatch is a review (no validation) or, at the head of the merge queue, the pre-merge gate.
        let phase = null;
        if (!branchIssue) {
          // The invoking checkout is left as it is, clean or not: start-issue gives the issue its own worktree.
          step = 'start';
        } else {
          if (!evidence?.spec?.complete || ['repair_required', 'unverifiable'].includes(evidence.spec.scope?.status)) {
            throw new Error(`approved_spec_missing: #${issue} (${evidence?.spec?.path ?? 'no singular four-file Approved package'})`);
          }
          if (evidence.issue?.number !== issue) throw new Error(`issue #${issue} evidence unavailable`);
          if (evidence.issue.dependency?.status !== 'eligible') {
            throw new Error(evidence.issue.dependency?.reasonCode ?? 'dependency_unreadable');
          }
          const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: at });
          if (!succeeded(status)) throw new Error('worktree_status_unavailable');
          const changedPaths = String(status.stdout ?? '').split(/\r?\n/).filter(Boolean)
            .map((line) => line.slice(3).split(' -> ').at(-1))
            .filter((path) => !path.startsWith('.nmg-sdlc/'));
          const dirtyReport = changedPaths.includes(evidence.verification?.path);
          const dirty = changedPaths.some((path) => path !== evidence.verification?.path);
          const published = remoteHead(at, run, current.branch) === current.head;
          if (evidence.pullRequest?.state === 'OPEN' && evidence.pullRequest.isDraft === true) {
            requiresPrEvidence = true;
          }
          if (registeredGateStatus(at, run, issue, current.head, evidence, { allowPending: true })
            === 'pr_evidence_pending') requiresPrEvidence = true;
          const gateStatus = registeredGateStatus(at, run, issue, current.head, evidence);
          const green = ['pass', 'pr_evidence_satisfied'].includes(gateStatus)
            && (!requiresPrEvidence || (gateStatus === 'pr_evidence_satisfied'
              && evidence.pullRequest?.state === 'OPEN'
              && evidence.pullRequest.isDraft === true
              && evidence.pullRequest.headRefOid === current.head));
          // A verify dispatched at this head whose gate result has not landed yet answers the older result.
          const intentLive = liveGateIntent(at, run, issue, current.head, evidence.verification?.path);
          if (!failure && !forced && !dirty && published && !intentLive) {
            const liveFailure = currentGateFailure(at, run, issue, current.head, evidence.verification?.path);
            if (liveFailure) { recordFailure(liveFailure); needsImplement = true; }
          }
          // A branch with nothing on it relative to the default branch has nothing to verify yet.
          const unimplemented = !implementedHeads.has(current.head) && !branchCommits(at, run, evidence);
          if (dirty || needsImplement || unimplemented || (!published && !green)) step = 'implement';
          else step = green && published && !dirtyReport ? 'deliver' : 'verify';
          if (intentLive && step !== 'implement') step = 'verify';
          // A re-dispatched verify runs again even where a green gate would deliver; a re-dispatched
          // deliver runs only where routing delivers, so no decision skips the full-green gate.
          if (forced === 'verify' && step === 'deliver') step = 'verify';
          const base = evidence.project?.defaultBranch;
          const noOpenPr = evidence.pullRequest?.state !== 'OPEN';
          if (step === 'verify') phase = reviewCurrent(at, run, issue, current.head) ? 'gate' : 'review';
          if (step === 'implement') {
            // A branch that goes back to implement leaves the merge queue and gives up the version it prepared, so
            // the next queue entry proceeds and no two branches claim one version.
            const held = queued;
            leaveQueue();
            if ((held || failure) && base && noOpenPr && !dirty && published
              && revertPreparedVersion(at, run, issue, base)) continue;
          } else if (phase !== 'review' && !dirty && !dirtyReport && published) {
            // Only the queue head integrates, prepares its version, validates and merges; every other entry waits.
            const entry = () => enterMergeQueue(cwd, { issue, branch: current.branch, worktree: at,
              session: supervisorSession ?? null }, { run });
            let place = entry();
            queued = true;
            if (!place.head) {
              if (!queueReported) output.push(`#${issue}: queued at position ${place.position} behind ${place.ahead.map((ahead) => `#${ahead}`).join(', ')}`);
              queueReported = true;
              inFlight('queued', current.branch);
              while (!place.head) {
                sleep(QUEUE_POLL_MS);
                place = entry();
              }
              // The default branch moved while this branch waited, so its state is observed again.
              continue;
            }
            if (step === 'verify' && base && noOpenPr) {
              const integrated = integrateDefault(at, run, base);
              if (integrated.status === 'conflict') {
                recordFailure({ step: 'verify', head: current.head, reasonCode: 'queue_integration_conflict',
                  summary: `merging origin/${base} into ${current.branch} at the head of the merge queue conflicts in ${integrated.files.join(', ') || 'unnamed files'}; merge origin/${base} into the branch, resolve the conflicts and publish`,
                  artifacts: [] });
                needsImplement = true;
                continue;
              }
              if (integrated.resolved) output.push(`#${issue}: integration took origin/${base} for ${integrated.resolved.join(', ')}${integrated.kept ? ` and kept ${integrated.kept} branch changelog ${integrated.kept === 1 ? 'entry' : 'entries'}` : ''}`);
              if (integrated.status === 'merged') continue;
            }
            // The version commit lands at the queue head, after integration and before the pre-merge validations,
            // so the registered gate runs at the head delivery merges. Only an open PR stops preparation.
            if (noOpenPr && prepareVersion(at, run, issue, invocationId) !== current.head) continue;
          }
        }
        if (step === 'implement') inspectPublicationScope({ cwd: at, issue, spec: evidence.spec.path, step, run });
        inFlight(phase ? `${step}:${phase}` : step, branchIssue ? current.branch : '');
        const path = join(at, HANDOFF_DIR, `${issue}-${step}.json`);
        const prior = handoffSnapshot(at, path);
        rmSync(`${path}.waiting`, { force: true });
        const name = `s${issue}-${step}-${invocationId.slice(0, 8)}`;
        const instructions = [
          `Invocation ${invocationId}; branch ${current.branch}; observed HEAD ${current.head}; checkout ${at}.`,
          ...(phase === 'review' ? ['Verify phase: review. Complete the review checklist against the Approved spec and finalize it with sdlc-review.mjs. Run no steering validation in this phase: the pre-merge validations run once, later, at the head of the merge queue. Report every finding of every severity in the one handoff.'] : []),
          ...(phase === 'gate' ? ['Verify phase: gate. The review already passed for this source. This branch is at the head of the merge queue with the default branch integrated and its version prepared: run the pre-merge validations once through the steering verification runner, write the report and finalize with --queue-gate. Do not repeat the review.'] : []),
          'Use the live branch, Approved spec, registered gate and remote. Ignore old run.json, safe-recoveries.json and handoffs.',
          ...(step === 'implement' ? ['Map every Approved AC to satisfied or remaining work before editing; preserve partial work and do not repeat published work.'] : []),
          ...(failure ? [
            `Previous attempted approach (${failure.step}) at HEAD ${failure.head}, tree ${failure.tree}, worktree ${JSON.stringify(failure.worktree)}: ${failure.reasonCode}: ${failure.summary}.\nArtifacts: ${failure.artifacts.join(', ') || '(none)'}.`,
            `Recent failure evidence:\n${history.slice(-8).map((item) => `- ${item.step} ${item.head}/${item.tree}: ${item.reasonCode}: ${item.summary}`).join('\n')}`,
            'Diagnose the cause and choose a different testable repair. Do not repeat unchanged smoke inputs.',
          ] : []),
          ...(guidance ? [`Supervisor guidance: ${guidance}`] : []),
          ...(failure?.reasonCode === 'pr_evidence_pending' ? (
            evidence?.pullRequest?.state === 'OPEN' && evidence.pullRequest.isDraft === true
              && evidence.pullRequest.headRefOid === current.head
              ? [
                `Controlled draft PR #${evidence.pullRequest.number} already exists at ${current.head}; do not invoke prepare-pr-evidence again for this head.`,
                'If draft preparation changed source HEAD, run the full registered gate at this new head first. Wait for actual required PR-only check conclusions to become green; never mark ready, merge or close. Then publish a truthful Pass report and verifier handoff.',
              ] : [
                `Before any further verification run, invoke node "${packageRoot}/scripts/sdlc-deliver.mjs" prepare-pr-evidence --issue ${issue} --controller-run-id ${invocationId}.`,
                'Create/observe only the exact-head draft and required PR-only checks. Never mark ready, merge or close here. After real green draft evidence, publish a truthful Pass report and fresh handoff via the verifier.',
              ]
          ) : []),
          workerPrompt({ step, issue, cwd: at, controllerRunId: invocationId }),
        ].join('\n\n');
        // A verify dispatch is recorded before it starts, so a restart at this head resumes verify.
        if (step === 'verify') writeGateIntent(at, { issue, head: current.head, dispatchedAt: now() });
        // The spawn carries the whole worker prompt; the hooks module registers `execute-<entry>` with this model and effort.
        const { agentId } = host.spawn({
          issue, step, entry: entryName(step, failure), agent: STAGE_AGENTS[step], name,
          model: stageModel(step, failure, stageModels.config),
          effort: stageEffort(step, failure, stageModels.config) ?? null,
          permissionMode: workerPermissionMode(env), prompt: instructions, cwd: at,
        });
        forced = null;
        guidance = null;
        const { handoff, state, decision } = supervise
          ? superviseWorker({ issue, step, host, agentId, name, prior, before: current.head, history, workdir: at, overlaps: overlaps ?? [] })
          : awaitWorkerHandoff({ host, agentId, cwd: at, issue, step, prior, run });
        host.finish();
        // A verify stage that completed without a redispatch or halt is answered, so its intent no longer applies.
        if (step === 'verify' && !decision) clearGateIntent(at, issue);
        // A redispatch or halt stops the running subagent before its replacement starts or the run stops.
        if (decision?.action === 'redispatch' || decision?.action === 'halt') host.stop(agentId);
        if (decision?.action === 'halt') throw new Error(`supervisor_halt: ${decision.text}`);
        if (decision?.action === 'redispatch') {
          if (handoff && handoff.status !== 'passed') {
            recordFailure({ step, head: checkout(at, run).head, reasonCode: handoff.reasonCode ?? 'failed',
              summary: handoff.summary, artifacts: handoff.artifacts });
          }
          forced = step;
          guidance = decision.text;
          // Only an implement re-dispatch implements; a verify re-dispatch skips the implement repair.
          needsImplement = step === 'implement';
          continue;
        }
        if (!handoff) {
          // The stage subagent ended before retry, and Git/GitHub must be re-observed
          // even when a worker lost its final acknowledgment.
          const after = checkout(at, run);
          if (branchIssue && completed(at, run, issue, current.branch, after.head)) continue;
          recordFailure({ step, head: after.head, reasonCode: lostReason(state),
            summary: 'worker ended without durable handoff; reconcile current source and remote', artifacts: [] });
          // A lost verify handoff is retried as verify; an implement repair would be told to change source for it.
          needsImplement = after.head === current.head && step === 'implement';
          continue;
        }
        let after = checkout(at, run);
        // A review that the finalizer closed: a passed one sends the branch to the merge queue for its gate.
        const reviewed = step === 'verify' && handoff.phase === 'review';
        if (handoff.status === 'passed') {
          if (handoff.intervention || handoff.next !== (reviewed ? 'verify' : { start: 'implement', implement: 'verify',
            verify: 'deliver', deliver: null }[step])) throw new Error('invalid_passed_handoff');
          if (reviewed) {
            if (after.branch !== current.branch || !reviewCurrent(at, run, issue, after.head)) throw new Error('review_handoff_unproven');
            needsImplement = false;
            failure = null;
            output.push(`#${issue}: review passed`);
            continue;
          }
          if (step === 'start') {
            // The issue's checkout is the worktree start-issue names, or the invoking checkout it used in place.
            const started = issueWorkdir(cwd, run, issue);
            if (!started || (handoff.worktree !== undefined && !samePath(handoff.worktree, started))) throw new Error('start_handoff_head_unproven');
            after = checkout(started, run);
            if (parseIssueBranch(after.branch)?.issueNumber !== issue || handoff.branch !== after.branch
              || handoff.head !== after.head || remoteHead(started, run, after.branch) !== after.head) {
              throw new Error('start_handoff_head_unproven');
            }
            workdir = started;
          } else if (after.branch !== current.branch || parseIssueBranch(after.branch)?.issueNumber !== issue) {
            if (step !== 'deliver' || !completed(at, run, issue, current.branch, current.head)) throw new Error('worker_branch_mismatch');
          } else if (step === 'implement' && remoteHead(at, run, after.branch) !== after.head) {
            throw new Error('implementation_not_published');
          }
          if (step === 'implement' && failure?.step === 'verify' && after.head === current.head) {
            recordFailure({ step, head: after.head, reasonCode: 'repair_made_no_source_change',
              summary: `prior ${failure.reasonCode} remains at the same source HEAD; diagnose and change the cause before rerunning verification`,
              artifacts: failure.artifacts });
            needsImplement = true;
            continue;
          }
          if (step === 'verify') {
            const afterEvidence = statusEvidence(at, run);
            const gateStatus = registeredGateStatus(at, run, issue, after.head, afterEvidence);
            const green = ['pass', 'pr_evidence_satisfied'].includes(gateStatus)
              && (!requiresPrEvidence || (gateStatus === 'pr_evidence_satisfied'
                && afterEvidence.pullRequest?.state === 'OPEN'
                && afterEvidence.pullRequest.isDraft === true
                && afterEvidence.pullRequest.headRefOid === after.head));
            if (!green) {
              const report = afterEvidence.verification?.path;
              const reportStatus = report && run('git', ['status', '--porcelain=v1', '--', report], { cwd: at });
              const unpublished = reportStatus && succeeded(reportStatus) && String(reportStatus.stdout ?? '').trim();
              recordFailure({ step, head: after.head,
                reasonCode: requiresPrEvidence ? 'pr_evidence_pending'
                  : unpublished ? 'verification_report_unpublished' : 'verification_not_green',
                summary: requiresPrEvidence
                  ? 'required PR-only evidence is not yet satisfied at the current draft head'
                  : unpublished
                    ? 'verification report is not committed; publish the current passing gate and report without replaying unchanged smoke'
                    : 'passed handoff has no current full-green registered gate; diagnose the result before another invocation',
                artifacts: [`.nmg-sdlc/verification/${issue}.json`, ...(report ? [report] : [])] });
              needsImplement = !requiresPrEvidence && !unpublished;
              continue;
            }
          }
          if (step === 'implement') implementedHeads.add(after.head);
          if (step === 'deliver' && !completed(at, run, issue, current.branch, after.head)) {
            throw new Error('delivery_not_merged_and_closed');
          }
          needsImplement = false;
          failure = null;
          output.push(`#${issue}: ${step} passed`);
          continue;
        }
        if (step === 'verify' && handoff.status === 'failed' && !reviewed) {
          const afterEvidence = statusEvidence(at, run);
          if (handoff.reasonCode === 'pr_evidence_pending' && afterEvidence.verification?.status === 'pr_evidence_pending'
            && after.head !== current.head && remoteHead(at, run, after.branch) === after.head) {
            requiresPrEvidence = true;
            recordFailure({ step, head: after.head, reasonCode: 'pr_evidence_pending',
              summary: 'draft evidence changed the source head; rerun registered verification on this head',
              artifacts: [afterEvidence.verification.path] });
            needsImplement = false;
            continue;
          }
          if (gatePassed(at, run, issue, after.head, afterEvidence, { allowPending: true })) {
            requiresPrEvidence = true;
            recordFailure({ step, head: after.head, reasonCode: 'pr_evidence_pending',
              summary: 'local registered gate passed; collect exact-head draft PR evidence before final Pass',
              artifacts: [afterEvidence.verification.path, `.nmg-sdlc/verification/${issue}.json`] });
            needsImplement = false;
            continue;
          }
        }
        if (handoff.status === 'blocked' || handoff.intervention) {
          throw new Error(`${handoff.reasonCode ?? 'intervention_required'}: ${handoff.summary}; preserved ${handoff.artifacts.join(', ')}`);
        }
        recordFailure({ step, head: after.head, reasonCode: handoff.reasonCode ?? 'failed',
          summary: handoff.summary, artifacts: handoff.artifacts });
        if (step === 'deliver' && handoff.reasonCode === 'mergeability_reverification_required') {
          if (handoff.next !== 'verify' || after.head === current.head
            || after.branch !== current.branch || remoteHead(at, run, after.branch) !== after.head) {
            throw new Error('mergeability_reverification_unproven');
          }
          needsImplement = false;
          continue;
        }
        needsImplement = step !== 'start';
        if (step === 'start') throw new Error(`${failure.reasonCode}: ${failure.summary}`);
      }
      } finally {
        // A run that stops, for any reason, never keeps a place in the merge queue.
        if (queued) leaveQueue();
      }
    }
    return warned({ status: 0, stdout: `${output.join('\n')}${output.length ? '\n' : ''}`, stderr: '' });
  } catch (error) {
    // A diagnostic beyond the bare reason code, such as the file and field of an invalid setting, is shown too.
    const reasonCode = error?.reasonCode;
    const message = error?.message;
    return warned(fail(reasonCode && message && message !== reasonCode ? `${reasonCode}: ${message}`
      : reasonCode ?? message ?? 'controller_failed'));
  }
  finally {
    dropLease();
  }
}

// Removes `--<name> <value>` (at most once) from supervised-session argv.
function takeOption(argv, name) {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const [, value] = argv.splice(index, 2);
  if (value === undefined || argv.includes(`--${name}`)) throw new Error(`--${name} requires one value`);
  return value;
}
function waitSeconds(argv) {
  const value = takeOption(argv, 'wait-seconds');
  if (value === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 540) throw new Error('--wait-seconds must be 1-540');
  return Number(value) * 1000;
}
async function sessionCommand(sub, rest) {
  const supervisor = await import('./sdlc-execute-supervisor.mjs');
  const argv = [...rest];
  try {
    const waitMs = waitSeconds(argv);
    if (sub === 'run') return { status: 2, stdout: '', stderr: 'execute requires /sdlc-execute in a Claude Code session\n' };
    if (sub === 'supervise') {
      // Arguments are checked before a session exists, so a refused call prints only its diagnosis.
      parseArgs(argv.join(' '));
      const session = randomUUID();
      const result = await supervisor.superviseExecute({ args: argv.join(' '), session, waitMs });
      return { ...result, stdout: `NMG_SDLC_EXECUTE_SESSION: ${session}\n${result.stdout}` };
    }
    const session = takeOption(argv, 'session');
    const after = takeOption(argv, 'after');
    if (sub === 'wait' && !argv.length) {
      if (after !== undefined && !/^\d+$/.test(after)) throw new Error('--after requires a non-negative report sequence');
      return await supervisor.awaitSession({ session, after: after === undefined ? 0 : Number(after), waitMs });
    }
    const seq = Number(takeOption(argv, 'seq'));
    const text = takeOption(argv, 'text');
    if (sub === 'decide' && argv.length === 1) {
      return await supervisor.decideSession({ session, seq, action: argv[0], text, waitMs });
    }
  } catch (error) {
    return { status: 2, stdout: '', stderr: `${error.message}\n` };
  }
  return { status: 2, stdout: '', stderr: [
    'Usage: sdlc-execute.mjs supervise [--check-in-seconds N] [#N ...]',
    '       sdlc-execute.mjs decide --session S --seq N <accept|continue|prompt|redispatch|halt> [--text T]',
    '       sdlc-execute.mjs wait --session S', ''].join('\n') };
}

// The single issue the current branch names when parseIssueBranch recognizes it; otherwise null.
function branchGoalIssues() {
  const result = defaultRun('git', ['branch', '--show-current'], { cwd: process.cwd() });
  const issue = parseIssueBranch(String(result.stdout ?? '').trim())?.issueNumber;
  return succeeded(result) && Number.isSafeInteger(issue) ? [issue] : null;
}

async function runCli(argv = process.argv.slice(2)) {
  const [sub, ...rest] = argv;
  // An invalid project stage or test-layer configuration stops these before any Git or GitHub call or worker start.
  if (['goal', 'list-specified', 'run', 'supervise'].includes(sub)) {
    try {
      loadStageModels(process.cwd());
      loadTestLayers(process.cwd());
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 2;
      return;
    }
  }
  if (['run', 'supervise', 'decide', 'wait'].includes(sub)) {
    const result = await sessionCommand(sub, rest);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.status;
    return;
  }
  try {
    if (sub === 'parse-args') {
      const value = parseArgs(rest.join(' '));
      console.log(JSON.stringify({ issues: value.issues, defaultBacklog: value.defaultBacklog }));
    } else if (sub === 'list-specified') {
      try {
        console.log(JSON.stringify({ ok: true, issues: listSpecifiedIssues() }));
      } catch {
        console.log(JSON.stringify({ ok: false, reasonCode: 'issues_unreadable' }));
        process.exitCode = 1;
      }
    } else if (sub === 'goal') {
      // Names the run's issues for its /goal; reads no GitHub state and changes nothing.
      const explicit = parseArgs(rest.join(' ')).issues;
      const issues = explicit.length ? explicit : branchGoalIssues();
      if (issues) console.log(JSON.stringify({ ok: true, issues, condition: executeGoalCondition(issues) }));
      else {
        console.log(JSON.stringify({ ok: false, reasonCode: 'goal_issues_unresolved' }));
        process.exitCode = 1;
      }
    } else if (sub === 'backlog') {
      const issue = selectBacklog();
      if (issue != null) process.stdout.write(`${issue}\n`);
    } else if (sub === 'spec-status') {
      const index = rest.indexOf('--issue');
      const issue = Number(rest[index + 1]);
      if (index < 0 || !Number.isSafeInteger(issue) || issue <= 0) throw new Error('Usage: spec-status --issue N');
      console.log(JSON.stringify(specStatus(issue)));
    } else if (sub === 'validate-handoff') {
      const index = rest.indexOf('--file');
      if (index < 0 || !rest[index + 1]) throw new Error('Usage: validate-handoff --file PATH');
      try { validateHandoff(rest[index + 1]); } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
      }
    } else if (sub === 'worker-prompt') {
      const issue = Number(rest[rest.indexOf('--issue') + 1]);
      const step = rest[rest.indexOf('--step') + 1];
      if (step === 'rem') throw new Error('remediation requires live failure evidence');
      process.stdout.write(`${workerPrompt({ issue, step, cwd: process.cwd() })}\n`);
    } else throw new Error(`unknown subcommand: ${sub ?? '(none)'}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
if (isCliEntry(import.meta.url)) runCli();
