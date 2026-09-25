#!/usr/bin/env node

/** Branch-first controller. A lease coordinates concurrent invocations; Git, GitHub,
 * the Approved spec and registered verification are the only lifecycle evidence. */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { defaultPromptRegistry, renderPrompt, writePromptProvenance } from '../src/sdlc-prompt-snippets.mjs';
import { packageRoot } from '../src/sdlc-workflows.mjs';
import { collectEvidence, parseIssueBranch } from './sdlc-status.mjs';
import { inspectPublicationScope } from './sdlc-safe-recoveries.mjs';
import { inspectVerificationArtifactRepair, inspectVerificationReadiness, MAX_VERIFICATION_REPORT_BYTES } from './verification-readiness.mjs';
import { matchesRegisteredResults } from './sdlc-finalize-verification.mjs';
import { specStatus } from './issue-spec-scope.mjs';
import { createIssueDependencyClient, eligibleIssues, issueDependencyStatus, readDependencyGraph } from './issue-dependencies.mjs';
import { issueHasSpecCreatedLabel, SPEC_CREATED_LABEL } from './spec-created-label.mjs';
import { acquireControllerLease, readControllerLease, reclaimStaleControllerLease, releaseControllerLease } from './sdlc-controller-lease.mjs';
import { isCliEntry, materializeControllerPaths } from './plugin-controller-path.mjs';

export const VALID_STEPS = ['start', 'implement', 'verify', 'deliver'];
export const REMEDIABLE_STEPS = ['implement', 'verify', 'deliver'];
const SKILLS = { start: 'start-issue', implement: 'write-code', verify: 'verify-code', deliver: 'open-pr' };
const HANDOFF_DIR = '.omp/sdlc/handoffs';
const MAX_HANDOFF_BYTES = 256 * 1024;
const OMP_CONFIG = '.omp/sdlc/omp-controller.yml';
const SHA = /^[0-9a-f]{40}$/;

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}
function succeeded(result) { return result?.status === undefined || result.status === 0; }
function parsed(value) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } }
  if (typeof value?.stdout === 'string') return parsed(value.stdout);
  return value;
}
function usage() { return 'Usage: /sdlc-execute [--retain-worker] [#N ...]'; }
export function parseArgs(input = '') {
  const text = String(input ?? '').trim();
  if (!text) return { issues: [], defaultBacklog: true };
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) throw new Error(usage());
  const issues = [];
  let retainWorker = false;
  for (const token of tokens) {
    if (token === '--retain-worker') {
      if (retainWorker) throw new Error(usage());
      retainWorker = true;
      continue;
    }
    const match = token.match(/^(?:#|issue:\/\/|pr:\/\/)?(\d+)$/);
    const issue = Number(match?.[1]);
    if (!Number.isSafeInteger(issue) || issue <= 0) throw new Error(usage());
    if (!issues.includes(issue)) issues.push(issue);
  }
  if (issues.length > 20) throw new Error(usage());
  return { issues, defaultBacklog: !issues.length, ...(retainWorker ? { retainWorker } : {}) };
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
function ensureControllerOmpConfig(cwd) {
  const file = resolve(realpathSync(cwd), OMP_CONFIG);
  mkdirSync(dirname(file), { recursive: true });
  const config = 'paste:\n  largeMenuThreshold: 0\n';
  if (!existsSync(file) || readFileSync(file, 'utf8') !== config) writeFileSync(file, config);
  return file;
}
export function defaultHerdr(run, cwd) {
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
    agentStart: ({ name, paneId }) => invoke(['agent', 'start', name, '--kind', 'omp', '--pane', paneId,
      '--', '--config', ensureControllerOmpConfig(cwd)]),
    agentPrompt: ({ name, prompt }) => invoke(['agent', 'prompt', name, prompt]),
    agentWait: ({ name, until }) => invoke(['agent', 'wait', name, ...(until ? ['--until', until] : [])]),
    agentGet: (name) => invoke(['agent', 'get', name]),
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
    const gate = readRegularEvidence(cwd, join(cwd, '.omp/sdlc/verification', `${issue}.json`), 512 * 1024);
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
      line && !line.slice(3).startsWith('.omp/')),
  };
}
function currentGateFailure(cwd, run, issue, head, report) {
  try {
    const path = `.omp/sdlc/verification/${issue}.json`;
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

export function runExecute({ args = '', cwd = process.cwd(), env = process.env, run = defaultRun,
  herdr, installSignalHandlers = false, processApi = process,
  onOwnedPane = () => {}, onPaneClosed = () => {}, onLeaseAcquired = () => {} } = {}) {
  const fail = (reason, status = 1) => ({ status, stdout: '', stderr: `${reason}\n` });
  if (env.HERDR_ENV !== '1' || !env.HERDR_SOCKET_PATH || !env.HERDR_PANE_ID) {
    return { status: 2, stdout: 'execute requires a Herdr OMP session\n', stderr: '' };
  }
  let selected;
  try { selected = parseArgs(args); } catch { return fail(usage(), 2); }
  const api = herdr ?? defaultHerdr(run, cwd);
  let integration;
  try { integration = api.integrationStatus(); } catch { integration = null; }
  if (!succeeded(integration) || !/^omp:\s+(?!not installed)/m.test(
    typeof integration === 'string' ? integration : String(integration?.stdout ?? ''),
  )) return { status: 2, stdout: 'Run: herdr integration install omp\n', stderr: '' };
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
    const active = parseIssueBranch(first.branch);
    if (active && selected.issues.length && selected.issues[0] !== active.issueNumber) {
      throw new Error(`active_issue_conflict: branch ${first.branch} belongs to #${active.issueNumber}`);
    }
    if (active && selected.issues.length > 1) throw new Error(`active_issue_conflict: finish #${active.issueNumber} first`);
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
      for (;;) {
        const current = checkout(cwd, run);
        const branchIssue = parseIssueBranch(current.branch);
        if (branchIssue && branchIssue.issueNumber !== issue) throw new Error('active_issue_conflict');
        const evidence = branchIssue ? statusEvidence(cwd, run) : null;
        if (branchIssue && completed(cwd, run, issue, current.branch, current.head)) {
          output.push(`#${issue}: MERGED and CLOSED`);
          break;
        }
        if (!branchIssue && !failure) {
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
          const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd });
          if (!succeeded(status)) throw new Error('worktree_status_unavailable');
          if (String(status.stdout ?? '').split(/\r?\n/).filter(Boolean).some(
            (line) => !line.slice(3).startsWith('.omp/'),
          )) throw new Error('active_issue_conflict: preserve dirty worktree');
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
            .filter((path) => !path.startsWith('.omp/'));
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
          if (!failure && !dirty && published) {
            const liveFailure = currentGateFailure(cwd, run, issue, current.head, evidence.verification?.path);
            if (liveFailure) { recordFailure(liveFailure); needsImplement = true; }
          }
          if (dirty || needsImplement || (!published && !green)) step = 'implement';
          else step = green && published && !dirtyReport ? 'deliver' : 'verify';
        }
        if (step === 'implement') inspectPublicationScope({ cwd, issue, spec: evidence.spec.path, step, run });
        const path = join(cwd, HANDOFF_DIR, `${issue}-${step}.json`);
        const prior = handoffSnapshot(cwd, path);
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
        if (!succeeded(api.agentStart({ name, paneId: pane }))) throw new Error('agent_start_failed');
        const sent = api.agentPrompt({ name, prompt: instructions });
        if (!succeeded(sent)) {
          if (!String(JSON.stringify(sent)).includes('agent_prompt_stalled')) throw new Error('worker_prompt_failed');
          const state = workerState(api, name);
          if (!['working', 'done'].includes(state) && !freshHandoff(cwd, issue, step, prior)) {
            throw new Error('prompt_delivery_unproven');
          }
        }
        api.agentWait({ name, until: 'working' });
        api.agentWait({ name });
        const handoff = freshHandoff(cwd, issue, step, prior);
        const state = workerState(api, name);
        close(pane);
        if (!handoff) {
          // The pane was closed before retry, and Git/GitHub must be re-observed
          // even when a worker lost its final acknowledgment.
          const after = checkout(cwd, run);
          if (branchIssue && completed(cwd, run, issue, current.branch, after.head)) continue;
          recordFailure({ step, head: after.head, reasonCode: state ? 'missing_handoff' : 'process_lost',
            summary: 'worker ended without durable handoff; reconcile current source and remote', artifacts: [] });
          needsImplement = after.head === current.head && ['implement', 'verify'].includes(step);
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
                artifacts: [`.omp/sdlc/verification/${issue}.json`, ...(report ? [report] : [])] });
              needsImplement = !requiresPrEvidence && !unpublished;
              continue;
            }
          }
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
              artifacts: [afterEvidence.verification.path, `.omp/sdlc/verification/${issue}.json`] });
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

async function runCli(argv = process.argv.slice(2)) {
  const [sub, ...rest] = argv;
  if (sub === 'run') {
    const { superviseExecute } = await import('./sdlc-execute-supervisor.mjs');
    const result = await superviseExecute({ args: rest.join(' ') });
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
