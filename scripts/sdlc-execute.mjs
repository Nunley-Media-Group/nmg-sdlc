#!/usr/bin/env node

/** Branch-first controller. A lease coordinates concurrent invocations; Git, GitHub,
 * the Approved spec and registered verification are the only lifecycle evidence. */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { defaultPromptRegistry, renderPrompt, writePromptProvenance } from '../src/sdlc-prompt-snippets.mjs';
import { packageRoot } from '../src/sdlc-workflows.mjs';
import { executeGoalCondition, SDLC_EFFORTS, SDLC_MODELS } from '../src/host-events.mjs';
import { collectEvidence, parseIssueBranch } from './sdlc-status.mjs';
import { inspectPublicationScope, publicationFileEntries } from './sdlc-safe-recoveries.mjs';
import { inspectVerificationArtifactRepair, inspectVerificationReadiness, MAX_VERIFICATION_REPORT_BYTES } from './verification-readiness.mjs';
import { matchesRegisteredResults } from './sdlc-finalize-verification.mjs';
import { resolveSpecDir, specStatus } from './issue-spec-scope.mjs';
import { createIssueDependencyClient, eligibleIssues, issueDependencyStatus, readDependencyGraph } from './issue-dependencies.mjs';
import { issueHasSpecCreatedLabel, SPEC_CREATED_LABEL } from './spec-created-label.mjs';
import { acquireControllerLease, readControllerLease, reclaimStaleControllerLease, releaseControllerLease } from './sdlc-controller-lease.mjs';
import { isCliEntry, materializeControllerPaths } from './plugin-controller-path.mjs';

export const VALID_STEPS = ['start', 'implement', 'verify', 'deliver'];
export const REMEDIABLE_STEPS = ['implement', 'verify', 'deliver'];
const SKILLS = { start: 'start-issue', implement: 'write-code', verify: 'verify-code', deliver: 'open-pr' };
const HANDOFF_DIR = '.nmg-sdlc/handoffs';
const MAX_HANDOFF_BYTES = 256 * 1024;
// How often a worker that is waiting on its own background work is rechecked; the wait itself has no deadline.
const RESUME_POLL_MS = 60_000;
const SHA = /^[0-9a-f]{40}$/;
// A supervised worker is checked in on after this long without a handoff, or once its pane output
// or waiting marker has been unchanged this long; waits are sliced so a check-in is never late by more than a slice.
export const DEFAULT_CHECK_IN_MS = 300_000;
const CHECK_IN_SLICE_MS = 30_000;
const PANE_TAIL_LINES = 40;
const REPORT_HISTORY = 8;
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
function usage() { return 'Usage: /sdlc-execute [--retain-worker] [--check-in-seconds N] [#N ...]'; }
export function parseArgs(input = '') {
  const text = String(input ?? '').trim();
  if (!text) return { issues: [], defaultBacklog: true };
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) throw new Error(usage());
  const issues = [];
  let retainWorker = false;
  let checkInSeconds;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--retain-worker') {
      if (retainWorker) throw new Error(usage());
      retainWorker = true;
      continue;
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
  return { issues, defaultBacklog: !issues.length, ...(retainWorker ? { retainWorker } : {}),
    ...(checkInSeconds ? { checkInSeconds } : {}) };
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
    || (value.reasonCode !== null && typeof value.reasonCode !== 'string')) {
    throw new Error('handoff invalid');
  }
  return value;
}
export function workerPrompt({ step, issue, skill, cwd, controllerRunId } = {}) {
  if (!VALID_STEPS.includes(step) || !Number.isSafeInteger(issue) || issue <= 0 || (skill && skill !== SKILLS[step])) {
    throw new Error('invalid worker step or issue');
  }
  const { text, provenance } = renderPrompt(defaultPromptRegistry(packageRoot, { projectRoot: cwd }), {
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
export const WORKER_PERMISSION_MODES = ['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions'];
const DEFAULT_WORKER_PERMISSION_MODE = 'auto';
/** Claude Code permission mode for Herdr Claude workers: NMG_SDLC_WORKER_PERMISSION_MODE when it
 * names a supported mode, otherwise `auto`. */
export function workerPermissionMode(env = process.env) {
  const value = env?.NMG_SDLC_WORKER_PERMISSION_MODE;
  return WORKER_PERMISSION_MODES.includes(value) ? value : DEFAULT_WORKER_PERMISSION_MODE;
}
// Failures that wait on outside evidence rather than a repair: the next dispatch keeps its stage model.
const REPAIR_EXEMPT_REASONS = new Set(['pr_evidence_pending', 'mergeability_reverification_required']);
/** Claude Code model alias for a stage worker: the stage's model, or the repair model when the
 * invocation recorded a repairable failure for the issue. */
export function stageModel(step, failure) {
  if (!Object.hasOwn(SDLC_MODELS.stages, step)) throw new Error(`unknown stage: ${step}`);
  if (repairDispatch(step, failure)) return SDLC_MODELS.repair;
  return SDLC_MODELS.stages[step];
}
/** Claude Code effort level for a stage worker: the stage's effort, or none (Claude Code's default)
 * for a stage without one and for every repair re-dispatch. */
export function stageEffort(step, failure) {
  if (!Object.hasOwn(SDLC_MODELS.stages, step)) throw new Error(`unknown stage: ${step}`);
  return repairDispatch(step, failure) ? undefined : SDLC_EFFORTS.stages[step];
}
function repairDispatch(step, failure) {
  return step !== 'start' && Boolean(failure) && !REPAIR_EXEMPT_REASONS.has(failure.reasonCode);
}
/** Claude Code argv after `--`: every worker loads the controller's own plugin checkout. */
export function workerAgentArgs({ env = process.env, pluginRoot = packageRoot, model, effort } = {}) {
  return ['--plugin-dir', pluginRoot, '--permission-mode', workerPermissionMode(env),
    ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : [])];
}
export function defaultHerdr(run, cwd, env = process.env) {
  const invoke = (args) => run('herdr', args, { cwd });
  return {
    integrationStatus: () => invoke(['integration', 'status']),
    paneLayout: (pane) => invoke(['pane', 'layout', '--pane', pane]),
    paneSplit: ({ direction, cwd: root, environment }) => invoke([
      'pane', 'split', '--current', '--direction', direction, '--cwd', root, '--no-focus',
      ...Object.entries(environment ?? {}).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    ]),
    paneClose: (pane) => invoke(['pane', 'close', pane]),
    listPanes: () => invoke(['pane', 'list']),
    listAgents: () => invoke(['agent', 'list']),
    agentStart: ({ name, paneId, model, effort }) => invoke(['agent', 'start', name, '--kind', 'claude', '--pane', paneId,
      '--', ...workerAgentArgs({ env, model, effort })]),
    agentPrompt: ({ name, prompt }) => invoke(['agent', 'prompt', name, prompt]),
    agentWait: ({ name, until, timeout }) => invoke(['agent', 'wait', name, ...(until ? ['--until', until] : []),
      ...(timeout ? ['--timeout', String(timeout)] : [])]),
    agentGet: (name) => invoke(['agent', 'get', name]),
    paneRead: (pane) => invoke(['pane', 'read', pane, '--source', 'recent', '--lines', String(PANE_TAIL_LINES)]),
  };
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
function paneId(response) {
  const value = parsed(response);
  return value?.result?.pane?.pane_id ?? value?.result?.pane_id ?? value?.pane?.pane_id ?? value?.pane_id ?? null;
}
function paneDirection(response, controllerPane) {
  const value = parsed(response);
  const layout = value?.result?.layout;
  const rect = Array.isArray(layout?.panes)
    ? layout.panes.find((item) => String(item?.pane_id ?? item?.paneId ?? '') === controllerPane)?.rect
    : value?.result?.pane ?? value?.result ?? value;
  if (!succeeded(response) || !(rect?.width > 0) || !(rect?.height > 0)) throw new Error('pane_layout_unavailable');
  const pane = rect;
  return pane.width >= pane.height ? 'right' : 'down';
}
function workerState(api, name) {
  try {
    const value = parsed(api.agentGet(name));
    return String(value?.result?.agent?.agent_status ?? value?.result?.agent_status
      ?? value?.result?.agentStatus ?? value?.result?.state
      ?? value?.agent_status ?? value?.state ?? '').toLowerCase();
  } catch { return ''; }
}
const SETTLED = ['idle', 'done'];
function waitingMarker(path) {
  try { const stat = lstatSync(path); return stat.isFile() && stat.size > 0; } catch { return false; }
}
function reminderPrompt(handoffPath) {
  return `nmg-sdlc controller: your turn ended without a handoff at ${handoffPath}. If a background command for this step is still running, write ${handoffPath}.waiting naming it and end your turn; you are resumed when it finishes. Otherwise finish the step now and write and validate the handoff.`;
}
/** Supervises one dispatched worker until it writes a fresh handoff or stops. A Claude Code
 * worker settles `idle`/`done` whenever its turn ends, including while a `run_in_background`
 * command it started is still running, so a settled worker without a handoff keeps its pane:
 * one that wrote its waiting marker is awaited until it resumes, and one that did not is
 * reminded once per resumption before it counts as stopped. */
function awaitWorkerHandoff({ api, name, cwd, issue, step, prior, waitFor = api.agentWait }) {
  const handoffPath = `${HANDOFF_DIR}/${issue}-${step}.json`;
  const waiting = join(cwd, `${handoffPath}.waiting`);
  const settle = () => ({ handoff: freshHandoff(cwd, issue, step, prior), state: workerState(api, name) });
  waitFor({ name, until: 'working' });
  let reminded = false;
  for (;;) {
    waitFor({ name });
    let observed = settle();
    if (observed.handoff || !SETTLED.includes(observed.state)) return observed;
    if (!waitingMarker(waiting)) {
      if (reminded || !succeeded(api.agentPrompt({ name, prompt: reminderPrompt(handoffPath) }))) return observed;
      reminded = true;
      waitFor({ name, until: 'working' });
      continue;
    }
    while (SETTLED.includes(observed.state) && waitingMarker(waiting)) {
      waitFor({ name, until: 'working', timeout: RESUME_POLL_MS });
      observed = settle();
      if (observed.handoff) return observed;
    }
    if (observed.state !== 'working' && !SETTLED.includes(observed.state)) return observed;
    rmSync(waiting, { force: true });
    reminded = false;
  }
}
// A supervisor decision taken at a check-in that ends the current wait.
class SupervisorDecision extends Error {
  constructor(decision) { super(`supervisor_${decision.action}`); this.decision = decision; }
}
// `herdr agent wait --timeout` reports its timeout as a JSON error on stderr.
function timedOut(response) {
  return [response?.stdout, response?.stderr].some((stream) => parsed(String(stream ?? ''))?.error?.code === 'timeout');
}
function headOf(cwd, run) {
  const head = run('git', ['rev-parse', 'HEAD'], { cwd });
  const value = String(head?.stdout ?? '').trim();
  return succeeded(head) && SHA.test(value) ? value : null;
}
/** The spec's declared files: its own directory plus every task `**File(s)**:` entry. */
function declaredSpecEntries(cwd, specPath) {
  if (!specPath) return [];
  const entries = [`${specPath}/`];
  let tasks = '';
  try { tasks = readFileSync(join(cwd, specPath, 'tasks.md'), 'utf8'); } catch { return entries; }
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
function paneTail(api, pane) {
  try {
    const response = api.paneRead?.(pane);
    return response && succeeded(response) ? String(response.stdout ?? '').trimEnd() : null;
  } catch { return null; }
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
    const gate = readRegularEvidence(cwd, join(cwd, '.nmg-sdlc/verification', `${issue}.json`), 512 * 1024);
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
function paneEnvironment(step, env) {
  const value = step === 'verify' ? { NMG_SDLC_PLUGIN_ROOT: packageRoot } : {};
  for (const key of step === 'verify'
    ? ['NMG_SDLC_SMOKE_ISSUES', 'NMG_SDLC_SMOKE_OWNED', 'NMG_SDLC_SMOKE_RECOVERY']
    : step === 'deliver' ? ['NMG_SDLC_SMOKE_OWNED', 'NMG_SDLC_SMOKE_RECOVERY'] : []) {
    if (typeof env[key] === 'string') value[key] = env[key];
  }
  return Object.keys(value).length ? value : null;
}

function foreignActiveWorker(api, issue, owned, cwd) {
  const response = api.listAgents();
  if (!succeeded(response)) throw new Error('worker_presence_unavailable');
  const value = parsed(response);
  const agents = Array.isArray(value) ? value : value?.result?.agents ?? value?.agents;
  if (!Array.isArray(agents)) throw new Error('worker_presence_unavailable');
  return agents.find((agent) => {
    const name = String(agent?.name ?? '');
    if (typeof agent?.cwd === 'string' && agent.cwd) {
      try {
        if (realpathSync(agent.cwd) !== realpathSync(cwd)) return false;
      } catch {
        if (resolve(agent.cwd) !== resolve(cwd)) return false;
      }
    }
    if (!new RegExp(`^[sr]${issue}-(?:start|implement|verify|deliver)(?:-|$)`).test(name)) return false;
    const pane = agent.pane_id ?? agent.paneId;
    if (owned.has(pane)) return false;
    const state = workerState(api, name) || String(agent.agent_status ?? agent.state ?? '').toLowerCase();
    return !['done', 'idle'].includes(state);
  }) ?? null;
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

function currentGateFailure(cwd, run, issue, head, report) {
  try {
    const path = `.nmg-sdlc/verification/${issue}.json`;
    const snapshot = readRegularEvidence(cwd, join(cwd, path), 512 * 1024);
    if (!snapshot) return null;
    const artifact = JSON.parse(snapshot.bytes.toString('utf8'));
    const gateHead = sourceHeadForGate(cwd, run, head, report, artifact.identity?.headSha);
    if (!gateHead) return null;
    const result = inspectVerificationArtifactRepair(artifact, {
      expectedIssueNumber: issue, expectedHeadSha: gateHead,
    });
    if (artifact.ceiling === null && result.gaps.length === 0) return null;
    const failing = (artifact.results ?? []).filter((item) =>
      item.required && item.applicable && item.effectiveStatus !== 'passed').map((item) => item.id);
    return { step: 'verify', head, reasonCode: result.reasonCode ?? 'verification_not_green',
      summary: `Current registered gate is ${artifact.ceiling ?? 'invalid'}: ${failing.join(', ') || result.gaps.join(', ')}`,
      artifacts: [path, ...(report ? [report] : [])] };
  } catch { return null; }
}

// Why a failed or empty `herdr integration status` probe could not confirm the Claude
// integration; empty when the probe answered and simply did not report it installed.
function probeFailure(probe) {
  if (probe === null || (typeof probe !== 'object' && typeof probe !== 'string')) return 'probe returned no result';
  if (typeof probe === 'string' || succeeded(probe)) return '';
  if (probe.error !== undefined && probe.error !== null) return String(probe.error.code ?? probe.error.message ?? probe.error);
  if (probe.signal) return `signal ${probe.signal}`;
  return Number.isInteger(probe.status) ? `exit ${probe.status}` : 'probe returned no result';
}

/** Runs execute to completion. With `supervise(report) → { action, text }`, every worker settlement
 * yields a stage report and every check-in interval (or stall) of a running worker a check-in report;
 * without it the existing routing runs unsupervised. */
export function runExecute({ args = '', cwd = process.cwd(), env = process.env, run = defaultRun,
  herdr, installSignalHandlers = false, processApi = process,
  onOwnedPane = () => {}, onPaneClosed = () => {}, onLeaseAcquired = () => {},
  supervise = null, now = Date.now, checkInMs } = {}) {
  const fail = (reason, status = 1) => ({ status, stdout: '', stderr: `${reason}\n` });
  if (env.HERDR_ENV !== '1' || !env.HERDR_SOCKET_PATH || !env.HERDR_PANE_ID) {
    return { status: 2, stdout: 'execute requires a Herdr session\n', stderr: '' };
  }
  let selected;
  try { selected = parseArgs(args); } catch { return fail(usage(), 2); }
  const api = herdr ?? defaultHerdr(run, cwd, env);
  let integration;
  try { integration = api.integrationStatus(); } catch (error) { integration = { status: null, error }; }
  if (!integration || !succeeded(integration) || !/^claude:\s+(?!not installed)/m.test(
    typeof integration === 'string' ? integration : String(integration?.stdout ?? ''),
  )) {
    // A probe that never ran (spawn error, signal, no result) is not proof the integration is missing.
    const detail = probeFailure(integration);
    return { status: 2, stdout: 'Run: herdr integration install claude\n',
      stderr: detail ? `herdr integration status failed: ${detail}\n` : '' };
  }
  if (!succeeded(run('gh', ['auth', 'status'], { cwd }))) return fail('gh auth status failed');

  const invocationId = randomUUID();
  let lease;
  try {
    const previous = readControllerLease(cwd);
    if (previous) reclaimStaleControllerLease({ projectRoot: cwd, runId: previous.runId,
      controllerPaneId: env.HERDR_PANE_ID, processApi, listAgents: () => api.listAgents() });
    lease = acquireControllerLease({ projectRoot: cwd, runId: invocationId, controllerPaneId: env.HERDR_PANE_ID });
    onLeaseAcquired(invocationId);
  } catch (error) {
    if (lease) releaseControllerLease(lease);
    return fail(error?.reasonCode ?? error?.message ?? 'controller_lease_held');
  }
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
  /** Waits for one dispatched worker under supervision: check-in reports while it runs, then a stage
   * report at its settlement. Returns `{ handoff, state }` to accept, plus `decision` to re-dispatch or halt. */
  const superviseWorker = ({ issue, step, name, pane, prior, before, history }) => {
    const handoffPath = `${HANDOFF_DIR}/${issue}-${step}.json`;
    const waitingPath = join(cwd, `${handoffPath}.waiting`);
    let specPath = null;
    try {
      const dir = resolveSpecDir(cwd, issue);
      if (dir) specPath = relative(cwd, dir).split(sep).join('/');
    } catch { /* reported without spec-scoped paths */ }
    const dispatchedAt = now();
    const monitor = { lastCheckIn: dispatchedAt, tail: null, changedAt: dispatchedAt, paneReported: false, markerReported: null };
    const base = () => ({ issue, stage: step, worker: name, pane, ...addedWork(cwd, run, before, specPath),
      failureHistory: reportHistory(history) });
    const guide = (decision, boundary) => succeeded(api.agentPrompt({ name,
      prompt: guidancePrompt({ issue, step, text: decision.text, handoffPath, boundary }) }));
    const checkIn = () => {
      const at = now();
      const tail = paneTail(api, pane);
      if (tail !== null && tail !== monitor.tail) Object.assign(monitor, { tail, changedAt: at, paneReported: false });
      const marker = waitingInfo(waitingPath, at);
      const paneStalled = tail !== null && !monitor.paneReported && at - monitor.changedAt >= interval;
      const markerStale = Boolean(marker) && marker.ageSeconds * 1000 >= interval && monitor.markerReported !== marker.modified;
      const reason = at - monitor.lastCheckIn >= interval ? 'interval'
        : paneStalled ? 'pane_unchanged' : markerStale ? 'waiting_marker_stale' : null;
      if (!reason) return;
      if (paneStalled) monitor.paneReported = true;
      if (markerStale) monitor.markerReported = marker.modified;
      monitor.lastCheckIn = at;
      let note = null;
      for (;;) {
        const decision = decide({ kind: 'checkin', reason, ...base(),
          sinceDispatchSeconds: Math.round((at - dispatchedAt) / 1000), paneTail: tail,
          paneChangedSecondsAgo: tail === null ? null : Math.round((at - monitor.changedAt) / 1000),
          waiting: marker ? { command: marker.command, ageSeconds: marker.ageSeconds } : null,
          note, decisions: CHECK_IN_DECISIONS });
        if (decision.action === 'continue') return;
        if (decision.action !== 'prompt') throw new SupervisorDecision(decision);
        // Herdr queues a prompt to a busy worker until its current call finishes; the wait below covers it.
        if (guide(decision, false)) return;
        note = 'guidance could not be delivered to the worker pane';
      }
    };
    const waitFor = (args) => {
      const deadline = args.timeout ? now() + args.timeout : Infinity;
      for (;;) {
        const slice = Math.max(1, Math.ceil(Math.min(deadline - now(), CHECK_IN_SLICE_MS, interval)));
        const response = api.agentWait({ ...args, timeout: slice });
        if (!timedOut(response) || now() >= deadline) return response;
        checkIn();
      }
    };
    let previous = prior;
    let latest = null;
    for (;;) {
      let observed;
      try { observed = awaitWorkerHandoff({ api, name, cwd, issue, step, prior: previous, waitFor }); } catch (error) {
        if (error instanceof SupervisorDecision) return { handoff: null, state: workerState(api, name), decision: error.decision };
        throw error;
      }
      const handoff = observed.handoff ?? latest;
      let note = null;
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
          note, decisions: observed.state ? STAGE_DECISIONS : STAGE_DECISIONS.filter((action) => action !== 'prompt') });
        if (decision.action === 'accept') return { handoff, state: observed.state };
        if (decision.action !== 'prompt') return { handoff, state: observed.state, decision };
        // Snapshot before prompting: the handoff the worker writes for this guidance counts as fresh.
        previous = handoffSnapshot(cwd, join(cwd, handoffPath));
        if (guide(decision, true)) break;
        note = 'guidance could not be delivered to the worker pane';
      }
      latest = handoff;
    }
  };
  const owned = new Set();
  const close = (pane) => {
    if (!owned.has(pane)) return;
    if (!succeeded(api.paneClose(pane))) {
      const response = api.listPanes();
      const value = parsed(response);
      const panes = Array.isArray(value) ? value : value?.result?.panes ?? value?.panes;
      if (!succeeded(response) || !Array.isArray(panes) || panes.some(
        (item) => String(item?.pane_id ?? item?.paneId ?? '') === pane,
      )) throw new Error('pane_close_failed');
    }
    owned.delete(pane);
    onPaneClosed(pane);
  };
  const cleanup = () => { if (!selected.retainWorker) for (const pane of [...owned]) close(pane); };
  const signals = [];
  if (installSignalHandlers) for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => {
      let cleaned = false;
      try { cleanup(); cleaned = true; } finally {
        if (cleaned) releaseControllerLease(lease);
        processApi.exit(signal === 'SIGINT' ? 130 : 143);
      }
    };
    processApi.once(signal, handler);
    signals.push([signal, handler]);
  }
  const output = [];
  try {
    const first = checkout(cwd, run);
    let active = parseIssueBranch(first.branch);
    if (active && selected.issues.length && selected.issues[0] !== active.issueNumber) {
      if (!leaveDeliveredBranch(cwd, run, first, active)) {
        throw new Error(`active_issue_conflict: branch ${first.branch} belongs to #${active.issueNumber}`);
      }
      active = null;
    }
    let issues = selected.issues;
    if (active && selected.defaultBacklog) issues = [active.issueNumber];
    else if (!active && selected.defaultBacklog) {
      const candidates = listSpecifiedIssues({ cwd, run });
      if (!candidates.length) return { status: 0, stdout: 'No open spec-created issues.\n', stderr: '' };
      if (typeof api.pickIssue !== 'function') {
        return fail(`select an eligible issue: ${candidates.map((item) => `#${item.number}`).join(', ')}`, 2);
      }
      const chosen = api.pickIssue(candidates);
      if (!candidates.some((item) => item.number === chosen)) throw new Error('issue_selection_invalid');
      issues = [chosen];
    }
    for (const issue of issues) {
      let failure = null;
      const history = [];
      const recordFailure = (packet) => {
        failure = { ...packet, ...observedSource(cwd, run) };
        history.push(failure);
      };
      const foreign = foreignActiveWorker(api, issue, owned, cwd);
      if (foreign) throw new Error(`foreign_worker_live: ${foreign.name}`);
      let needsImplement = false;
      let requiresPrEvidence = false;
      // A supervisor re-dispatch: the stage to repeat where routing allows, and its guidance.
      let forced = null;
      let guidance = null;
      const implementedHeads = new Set();
      for (;;) {
        const current = checkout(cwd, run);
        const branchIssue = parseIssueBranch(current.branch);
        if (branchIssue && branchIssue.issueNumber !== issue) {
          if (!leaveDeliveredBranch(cwd, run, current, branchIssue)) throw new Error('active_issue_conflict');
          continue;
        }
        const evidence = branchIssue ? statusEvidence(cwd, run) : null;
        if (branchIssue && completed(cwd, run, issue, current.branch, current.head)) {
          output.push(`#${issue}: MERGED and CLOSED`);
          output.push(...cleanupDeliveredBranch(cwd, run, issue, current));
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
          const spec = specStatus(issue, cwd);
          if (!spec.approved) throw new Error(`approved_spec_missing: #${issue} (${spec.reasonCode ?? 'no singular four-file Approved package'})`);
        }
        let step;
        if (!branchIssue) {
          if (dirtyOutsideRuntime(cwd, run)) throw new Error('active_issue_conflict: preserve dirty worktree');
          step = 'start';
        } else {
          if (!evidence?.spec?.complete || ['repair_required', 'unverifiable'].includes(evidence.spec.scope?.status)) {
            throw new Error(`approved_spec_missing: #${issue} (${evidence?.spec?.path ?? 'no singular four-file Approved package'})`);
          }
          if (evidence.issue?.number !== issue) throw new Error(`issue #${issue} evidence unavailable`);
          if (evidence.issue.dependency?.status !== 'eligible') {
            throw new Error(evidence.issue.dependency?.reasonCode ?? 'dependency_unreadable');
          }
          const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd });
          if (!succeeded(status)) throw new Error('worktree_status_unavailable');
          const changedPaths = String(status.stdout ?? '').split(/\r?\n/).filter(Boolean)
            .map((line) => line.slice(3).split(' -> ').at(-1))
            .filter((path) => !path.startsWith('.nmg-sdlc/'));
          const dirtyReport = changedPaths.includes(evidence.verification?.path);
          const dirty = changedPaths.some((path) => path !== evidence.verification?.path);
          const published = remoteHead(cwd, run, current.branch) === current.head;
          if (evidence.pullRequest?.state === 'OPEN' && evidence.pullRequest.isDraft === true) {
            requiresPrEvidence = true;
          }
          if (registeredGateStatus(cwd, run, issue, current.head, evidence, { allowPending: true })
            === 'pr_evidence_pending') requiresPrEvidence = true;
          const gateStatus = registeredGateStatus(cwd, run, issue, current.head, evidence);
          const green = ['pass', 'pr_evidence_satisfied'].includes(gateStatus)
            && (!requiresPrEvidence || (gateStatus === 'pr_evidence_satisfied'
              && evidence.pullRequest?.state === 'OPEN'
              && evidence.pullRequest.isDraft === true
              && evidence.pullRequest.headRefOid === current.head));
          if (!failure && !forced && !dirty && published) {
            const liveFailure = currentGateFailure(cwd, run, issue, current.head, evidence.verification?.path);
            if (liveFailure) { recordFailure(liveFailure); needsImplement = true; }
          }
          // A branch with nothing on it relative to the default branch has nothing to verify yet.
          const unimplemented = !implementedHeads.has(current.head) && !branchCommits(cwd, run, evidence);
          if (dirty || needsImplement || unimplemented || (!published && !green)) step = 'implement';
          else step = green && published && !dirtyReport ? 'deliver' : 'verify';
          // A re-dispatched verify runs again even where a green gate would deliver; a re-dispatched
          // deliver runs only where routing delivers, so no decision skips the full-green gate.
          if (forced === 'verify' && step === 'deliver') step = 'verify';
          // The version commit lands before verification, so the registered gate runs at the
          // head delivery merges; a new commit is verified before anything is delivered. The
          // issue branch's merged spec PR shares its name, so only an open PR stops preparation.
          if (['verify', 'deliver'].includes(step) && !dirty && !dirtyReport && published
            && evidence.pullRequest?.state !== 'OPEN'
            && prepareVersion(cwd, run, issue, invocationId) !== current.head) continue;
        }
        if (step === 'implement') inspectPublicationScope({ cwd, issue, spec: evidence.spec.path, step, run });
        const path = join(cwd, HANDOFF_DIR, `${issue}-${step}.json`);
        const prior = handoffSnapshot(cwd, path);
        rmSync(`${path}.waiting`, { force: true });
        const name = `s${issue}-${step}-${invocationId.slice(0, 8)}`;
        const instructions = [
          `Invocation ${invocationId}; branch ${current.branch}; observed HEAD ${current.head}.`,
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
          workerPrompt({ step, issue, cwd, controllerRunId: invocationId }),
        ].join('\n\n');
        const direction = paneDirection(api.paneLayout(env.HERDR_PANE_ID), env.HERDR_PANE_ID);
        const split = api.paneSplit({ direction, cwd, environment: paneEnvironment(step, env) });
        if (!succeeded(split)) throw new Error('pane_split_failed');
        const pane = paneId(split);
        if (!pane || pane === env.HERDR_PANE_ID) throw new Error('pane_identity_unavailable');
        owned.add(pane);
        onOwnedPane(pane);
        if (!succeeded(api.agentStart({
          name, paneId: pane, model: stageModel(step, failure), effort: stageEffort(step, failure),
        }))) throw new Error('agent_start_failed');
        forced = null;
        guidance = null;
        const sent = api.agentPrompt({ name, prompt: instructions });
        if (!succeeded(sent)) {
          if (!String(JSON.stringify(sent)).includes('agent_prompt_stalled')) throw new Error('worker_prompt_failed');
          const state = workerState(api, name);
          if (!['working', 'done'].includes(state) && !freshHandoff(cwd, issue, step, prior)) {
            throw new Error('prompt_delivery_unproven');
          }
        }
        const { handoff, state, decision } = supervise
          ? superviseWorker({ issue, step, name, pane, prior, before: current.head, history })
          : awaitWorkerHandoff({ api, name, cwd, issue, step, prior });
        // A halt leaves the branch, worktree and remote as they are; cleanup closes owned panes.
        if (decision?.action === 'halt') throw new Error(`supervisor_halt: ${decision.text}`);
        if (decision || !(supervise && selected.retainWorker)) close(pane);
        if (decision?.action === 'redispatch') {
          if (handoff && handoff.status !== 'passed') {
            recordFailure({ step, head: checkout(cwd, run).head, reasonCode: handoff.reasonCode ?? 'failed',
              summary: handoff.summary, artifacts: handoff.artifacts });
          }
          forced = step;
          guidance = decision.text;
          // Only an implement re-dispatch implements; a verify re-dispatch skips the implement repair.
          needsImplement = step === 'implement';
          continue;
        }
        if (!handoff) {
          // The pane was closed before retry, and Git/GitHub must be re-observed
          // even when a worker lost its final acknowledgment.
          const after = checkout(cwd, run);
          if (branchIssue && completed(cwd, run, issue, current.branch, after.head)) continue;
          recordFailure({ step, head: after.head, reasonCode: state ? 'missing_handoff' : 'process_lost',
            summary: 'worker ended without durable handoff; reconcile current source and remote', artifacts: [] });
          // A lost verify handoff is retried as verify; an implement repair would be told to change source for it.
          needsImplement = after.head === current.head && step === 'implement';
          continue;
        }
        const after = checkout(cwd, run);
        if (handoff.status === 'passed') {
          if (handoff.intervention || handoff.next !== { start: 'implement', implement: 'verify',
            verify: 'deliver', deliver: null }[step]) throw new Error('invalid_passed_handoff');
          if (step === 'start') {
            if (parseIssueBranch(after.branch)?.issueNumber !== issue || handoff.branch !== after.branch
              || handoff.head !== after.head || remoteHead(cwd, run, after.branch) !== after.head) {
              throw new Error('start_handoff_head_unproven');
            }
          } else if (after.branch !== current.branch || parseIssueBranch(after.branch)?.issueNumber !== issue) {
            if (step !== 'deliver' || !completed(cwd, run, issue, current.branch, current.head)) throw new Error('worker_branch_mismatch');
          } else if (step === 'implement' && remoteHead(cwd, run, after.branch) !== after.head) {
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
            const afterEvidence = statusEvidence(cwd, run);
            const gateStatus = registeredGateStatus(cwd, run, issue, after.head, afterEvidence);
            const green = ['pass', 'pr_evidence_satisfied'].includes(gateStatus)
              && (!requiresPrEvidence || (gateStatus === 'pr_evidence_satisfied'
                && afterEvidence.pullRequest?.state === 'OPEN'
                && afterEvidence.pullRequest.isDraft === true
                && afterEvidence.pullRequest.headRefOid === after.head));
            if (!green) {
              const report = afterEvidence.verification?.path;
              const reportStatus = report && run('git', ['status', '--porcelain=v1', '--', report], { cwd });
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
          if (step === 'deliver' && !completed(cwd, run, issue, current.branch, after.head)) {
            throw new Error('delivery_not_merged_and_closed');
          }
          needsImplement = false;
          failure = null;
          output.push(`#${issue}: ${step} passed`);
          continue;
        }
        if (step === 'verify' && handoff.status === 'failed') {
          const afterEvidence = statusEvidence(cwd, run);
          if (handoff.reasonCode === 'pr_evidence_pending' && afterEvidence.verification?.status === 'pr_evidence_pending'
            && after.head !== current.head && remoteHead(cwd, run, after.branch) === after.head) {
            requiresPrEvidence = true;
            recordFailure({ step, head: after.head, reasonCode: 'pr_evidence_pending',
              summary: 'draft evidence changed the source head; rerun registered verification on this head',
              artifacts: [afterEvidence.verification.path] });
            needsImplement = false;
            continue;
          }
          if (gatePassed(cwd, run, issue, after.head, afterEvidence, { allowPending: true })) {
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
            || after.branch !== current.branch || remoteHead(cwd, run, after.branch) !== after.head) {
            throw new Error('mergeability_reverification_unproven');
          }
          needsImplement = false;
          continue;
        }
        needsImplement = step !== 'start';
        if (step === 'start') throw new Error(`${failure.reasonCode}: ${failure.summary}`);
      }
    }
    return { status: 0, stdout: `${output.join('\n')}${output.length ? '\n' : ''}`, stderr: '' };
  } catch (error) { return fail(error?.reasonCode ?? error?.message ?? 'controller_failed'); }
  finally {
    let cleaned = false;
    try { cleanup(); cleaned = true; } finally {
      for (const [signal, handler] of signals) processApi.removeListener(signal, handler);
      if (cleaned) releaseControllerLease(lease);
    }
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
    if (sub === 'run') return supervisor.superviseExecute({ args: argv.join(' ') });
    if (sub === 'supervise') return supervisor.superviseExecute({ args: argv.join(' '), session: randomUUID(), waitMs });
    const session = takeOption(argv, 'session');
    if (sub === 'wait' && !argv.length) return supervisor.awaitSession({ session, waitMs });
    const seq = Number(takeOption(argv, 'seq'));
    const text = takeOption(argv, 'text');
    if (sub === 'decide' && argv.length === 1) {
      return supervisor.decideSession({ session, seq, action: argv[0], text, waitMs });
    }
  } catch (error) {
    return { status: 2, stdout: '', stderr: `${error.message}\n` };
  }
  return { status: 2, stdout: '', stderr: [
    'Usage: sdlc-execute.mjs supervise [--retain-worker] [--check-in-seconds N] [#N ...]',
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
      try { validateHandoff(rest[index + 1]); } catch { process.exitCode = 1; }
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
