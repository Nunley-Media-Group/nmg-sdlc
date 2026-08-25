#!/usr/bin/env node

/**
 * nmg-sdlc v3 execute helper.
 * Node ESM, zero runtime deps.
 * The execute skill invokes this for classification and state.
 * The agent in the main pane drives all Herdr commands.
 *
 * Exports support direct import by tests and the skill.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  createIssueDependencyClient,
  eligibleIssues,
  issueDependencyStatus,
  readDependencyGraph,
} from './issue-dependencies.mjs';
import {
  defaultPromptRegistry,
  renderPrompt,
  writePromptProvenance,
} from '../src/sdlc-prompt-snippets.mjs';
import { packageRoot } from '../src/sdlc-workflows.mjs';
import { issueHasSpecCreatedLabel, SPEC_CREATED_LABEL } from './spec-created-label.mjs';
import { isCliEntry, materializeControllerPaths } from './plugin-controller-path.mjs';
import {
  isAuthorizedOmpSdlcUntrackTransition,
  untrackOmpSdlcRuntime,
} from './omp-sdlc-ignore.mjs';



const RUN_DIR = '.omp/sdlc';
const RUN_FILE = join(RUN_DIR, 'run.json');
const HANDOFF_DIR = join(RUN_DIR, 'handoffs');

export const VALID_STEPS = ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify', 'deliver'];
const VALID_STATUSES = ['passed', 'failed', 'blocked'];
const REQUIRED_SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];
const STEP_SKILL = {
  start: 'start-issue',
  implement: 'write-code',
  review1: 'review-main',
  fix1: 'apply-review',
  review2: 'review-main',
  fix2: 'apply-review',
  verify: 'verify-code',
  deliver: 'open-pr',
};
const STEP_EXTRA_WORKFLOWS = {
  deliver: ['address-pr-comments'],
};

function usageError() {
  return 'Usage: /sdlc-execute [#N ...]';
}


export function parseArgs(input = '') {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    return { issues: [], defaultBacklog: true };
  }
  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) throw new Error(usageError());
  const issues = [];
  const seen = new Set();
  for (const tok of tokens) {
    const m = tok.match(/^(?:#|issue:\/\/|pr:\/\/)?(\d+)$/);
    if (!m) {
      throw new Error(usageError());
    }
    const num = Number(m[1]);
    if (!Number.isSafeInteger(num) || num <= 0) throw new Error(usageError());
    if (!seen.has(num)) {
      seen.add(num);
      issues.push(num);
    }
  }
  if (issues.length > 20) {
    throw new Error(usageError());
  }
  return { issues, defaultBacklog: false };
}

function officialGraphForIssues(issues, { run = defaultRun, cwd = process.cwd() } = {}) {
  const client = createIssueDependencyClient({ cwd, run });
  return readDependencyGraph(client, issues.map((issue) => typeof issue === 'number' ? issue : issue.number));
}

function filterEligibleIssueEvidence(issues, { run = defaultRun, cwd = process.cwd() } = {}) {
  const client = createIssueDependencyClient({ cwd, run });
  const eligible = [];
  for (const issue of issues) {
    try {
      const graph = readDependencyGraph(client, [issue.number]);
      if (issueDependencyStatus(graph, issue.number).status === 'eligible') eligible.push(issue);
    } catch (error) {
      if (error?.reasonCode === 'dependency_cycle' || error?.reasonCode === 'dependency_dangling') continue;
      throw error;
    }
  }
  return eligible;
}

function allReadableProjectDone(projectItems) {
  if (!Array.isArray(projectItems) || projectItems.length === 0) return false;
  const readable = [];
  for (const item of projectItems) {
    if (!item || typeof item !== 'object') continue;
    let s = '';
    if (typeof item.statusName === 'string') s = item.statusName;
    else if (item.status && typeof item.status.name === 'string') s = item.status.name;
    else if (typeof item.title === 'string' && !item.itemId) s = item.title; // legacy shape guard
    const t = s.trim().toLowerCase();
    if (t) readable.push(t);
  }
  if (readable.length === 0) return false;
  return readable.every((s) => s === 'done');
}

export function selectBacklog(options = {}) {
  let listed;
  let graph = options.graph;
  if (Array.isArray(options.issues)) {
    listed = options.issues;
  } else {
    const run = options.run ?? defaultRun;
    const cwd = options.cwd ?? process.cwd();
    const listRes = run(
      'gh',
      ['issue', 'list', '--state', 'open', '--label', SPEC_CREATED_LABEL, '--limit', '100', '--json', 'number,title,projectItems'],
      { cwd },
    );
    if (!commandSucceeded(listRes)) throw new Error('gh issue list failed');
    listed = parseCommandOutput(listRes);
    if (!Array.isArray(listed)) throw new Error('failed to parse gh issue list');
    listed = filterEligibleIssueEvidence(listed, { run, cwd });
  }
  if (Array.isArray(options.issues) && !graph) throw new Error('dependency_unreadable');

  const candidates = (graph ? eligibleIssues(graph, listed) : listed)
    .filter((issue) => {
      const statuses = options.projectStatuses?.[issue.number]
        ?? (issue.projectItems || []).map((item) => item?.statusName || item?.status?.name || '');
      if (Array.isArray(options.projectStatuses?.[issue.number])) {
        return !(statuses.length > 0 && statuses.every((status) => String(status).trim().toLowerCase() === 'done'));
      }
      return !allReadableProjectDone(issue.projectItems || []);
    })
    .sort((left, right) => left.number - right.number);
  return candidates[0]?.number ?? null;
}

export function resolveSpecDir(root, issueN, { detailed = false } = {}) {
  const result = { dir: null, reasonCode: null };
  if (!Number.isInteger(issueN) || issueN <= 0) return detailed ? result : null;
  const specsDir = join(root || process.cwd(), 'specs');
  if (!existsSync(specsDir)) return detailed ? result : null;
  let entries;
  try {
    entries = readdirSync(specsDir).filter((e) => {
      try {
        const st = statSync(join(specsDir, e));
        return st.isDirectory() && !st.isSymbolicLink();
      } catch {
        return false;
      }
    });
  } catch {
    result.reasonCode = 'spec_status_unreadable';
    return detailed ? result : null;
  }
  const prefixRe = new RegExp(`^${issueN}-`);
  const matches = entries.filter((e) => prefixRe.test(e)).sort();
  if (matches.length > 1) {
    result.reasonCode = 'spec_status_ambiguous';
  } else if (matches.length === 1) {
    result.dir = join(specsDir, matches[0]);
  }
  return detailed ? result : result.dir;
}

function parseFrontmatterStatusAndIssue(source, expectedIssue) {
  const issueMatch = source.match(/^\*\*Issue\*\*:\s*#(\d+)\s*$/m);
  const statusMatch = source.match(/^\*\*Status\*\*:\s*(Draft|Approved)\s*$/im);
  const issueNumber = issueMatch ? Number(issueMatch[1]) : null;
  const status = statusMatch ? statusMatch[1].trim().toLowerCase() : null;
  return {
    issueOk: issueNumber === expectedIssue,
    status,
  };
}

function readFrontmatterStatusAndIssue(filePath, expectedIssue) {
  if (!existsSync(filePath)) return { present: false };
  try {
    return {
      present: true,
      ...parseFrontmatterStatusAndIssue(readFileSync(filePath, 'utf8'), expectedIssue),
    };
  } catch {
    return { present: true, error: true };
  }
}

export function isSpecApproved(specDir, issueN) {
  if (!specDir || !existsSync(specDir)) return false;
  return REQUIRED_SPEC_FILES.every((name) => {
    const info = readFrontmatterStatusAndIssue(join(specDir, name), issueN);
    return info.present === true
      && info.error !== true
      && info.issueOk === true
      && info.status === 'approved';
  });
}

function gitForEachRef(root, pattern) {
  const result = spawnSync('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)', pattern], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function matchingIssueBranches(shortRefs, issueN, remotePrefix) {
  const prefixRe = new RegExp(`^${issueN}-`);
  const matches = [];
  for (const short of shortRefs) {
    const name = remotePrefix && short.startsWith(`${remotePrefix}/`)
      ? short.slice(remotePrefix.length + 1)
      : short;
    if (prefixRe.test(name)) {
      matches.push({ name, ref: short });
    }
  }
  return matches;
}

function specApprovedOnRef(root, ref, specRel, issueN) {
  return REQUIRED_SPEC_FILES.every((file) => {
    const result = spawnSync('git', ['-C', root, 'show', `${ref}:${specRel}/${file}`], {
      encoding: 'utf8',
    });
    if (result.status !== 0) return false;
    const info = parseFrontmatterStatusAndIssue(result.stdout, issueN);
    return info.issueOk === true && info.status === 'approved';
  });
}

export function specStatus(issueN, root = process.cwd()) {
  const resolved = resolveSpecDir(root, issueN, { detailed: true });
  if (resolved.reasonCode) {
    return { dir: null, approved: false, reasonCode: resolved.reasonCode };
  }
  if (resolved.dir) {
    return { dir: resolved.dir, approved: isSpecApproved(resolved.dir, issueN) };
  }

  const local = matchingIssueBranches(gitForEachRef(root, 'refs/heads'), issueN);
  if (local.length > 1) {
    return { dir: null, approved: false, reasonCode: 'spec_status_ambiguous' };
  }

  const candidates = local.length === 1
    ? local
    : matchingIssueBranches(gitForEachRef(root, 'refs/remotes/origin'), issueN, 'origin');
  if (candidates.length > 1) {
    return { dir: null, approved: false, reasonCode: 'spec_status_ambiguous' };
  }
  if (candidates.length !== 1) return { dir: null, approved: false };

  const { name, ref } = candidates[0];
  const specRel = `specs/${name}`;
  if (!specApprovedOnRef(root, ref, specRel, issueN)) {
    return { dir: null, approved: false };
  }
  return { dir: specRel, approved: true, ref };
}

export function validateHandoff(input) {
  let data = input;
  if (typeof input === 'string') {
    if (!input || !existsSync(input)) {
      throw new Error('handoff missing');
    }
    try {
      data = JSON.parse(readFileSync(input, 'utf8'));
    } catch {
      throw new Error('handoff malformed');
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('handoff invalid');
  }
  if (data.schemaVersion !== 1) throw new Error('handoff schemaVersion');
  if (!Number.isInteger(data.issue) || data.issue <= 0) throw new Error('handoff issue');
  if (!VALID_STEPS.includes(data.step)) throw new Error('handoff step');
  if (!VALID_STATUSES.includes(data.status)) throw new Error('handoff status');
  if (typeof data.intervention !== 'boolean') throw new Error('handoff intervention');
  if (typeof data.summary !== 'string') throw new Error('handoff summary');
  if (!Array.isArray(data.artifacts) || !data.artifacts.every((item) => typeof item === 'string')) {
    throw new Error('handoff artifacts');
  }
  if (data.next !== null && typeof data.next !== 'string') throw new Error('handoff next');
  if (data.reasonCode !== null && typeof data.reasonCode !== 'string') throw new Error('handoff reasonCode');
  return data;
}

export function readRun(root = process.cwd()) {
  const p = join(root, RUN_FILE);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    if (data && data.schemaVersion === 1) return data;
  } catch {
    // fallthrough
  }
  return null;
}

export function writeRun(runData, root = process.cwd()) {
  if (!runData || runData.schemaVersion !== 1) {
    throw new Error('invalid run schema');
  }
  const p = join(root, RUN_FILE);
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  const handoffDir = join(root, HANDOFF_DIR);
  if (!existsSync(handoffDir)) mkdirSync(handoffDir, { recursive: true });
  const content = JSON.stringify(runData, null, 2) + '\n';
  writeFileSync(p, content);
}

export function resolveSpecDirForIssue(root, issueN) {
  return resolveSpecDir(root, issueN);
}

export function nextStep(completedForIssue = []) {
  const order = ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify', 'deliver'];
  for (const step of order) {
    if (!completedForIssue.includes(step)) return step;
  }
  return null;
}

export function remediationCompletedSteps({
  issue,
  step,
  completed = [],
  handoff,
} = {}) {
  if (!Number.isSafeInteger(issue) || issue <= 0) return null;
  const stepIndex = VALID_STEPS.indexOf(step);
  if (stepIndex < 0 || !Array.isArray(completed)) return null;
  if (
    completed.length !== stepIndex
    || completed.some((completedStep, index) => completedStep !== VALID_STEPS[index])
  ) {
    return null;
  }
  if (
    !handoff
    || handoff.issue !== issue
    || handoff.step !== step
    || (handoff.status !== 'failed' && !handoff.intervention)
  ) {
    return null;
  }
  const targetIndex = VALID_STEPS.indexOf(handoff.next);
  if (targetIndex < 0 || targetIndex > stepIndex) return null;
  return VALID_STEPS.slice(0, targetIndex);
}

export function workerPrompt({ step, issue, skill, cwd } = {}) {
  if (!step || !VALID_STEPS.includes(step)) throw new Error('invalid step for workerPrompt');
  if (!Number.isInteger(issue) || issue <= 0) throw new Error('invalid issue for workerPrompt');
  const skillName = skill || STEP_SKILL[step];
  if (!skillName || skillName !== STEP_SKILL[step]) throw new Error('no skill for step');
  const { text, provenance } = renderPrompt(defaultPromptRegistry(), {
    consumer: `worker:${step}`,
    vars: {
      issue: String(issue),
      step,
      handoffPath: `.omp/sdlc/handoffs/${issue}-${step}.json`,
    },
  });
  if (cwd) writePromptProvenance(cwd, provenance);
  return materializeControllerPaths(text, packageRoot);
}

function workerPromptFailureReason(error) {
  return error instanceof Error && error.message === 'provenance_write_failed'
    ? error.message
    : 'worker_prompt_failed';
}



function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function parseCommandOutput(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (typeof value.stdout === 'string') {
    try {
      return JSON.parse(value.stdout);
    } catch {
      return value.stdout;
    }
  }
  return value;
}

function commandSucceeded(value) {
  return value?.status === undefined || value.status === 0;
}

function readProjectItems(issueNumber, { run, cwd }) {
  try {
    const viewed = run('gh', ['issue', 'view', String(issueNumber), '--json', 'projectItems'], { cwd });
    if (!commandSucceeded(viewed)) return [];
    const parsed = parseCommandOutput(viewed);
    return Array.isArray(parsed?.projectItems) ? parsed.projectItems : [];
  } catch {
    return [];
  }
}

export function listSpecifiedIssues({ run = defaultRun, cwd = process.cwd() } = {}) {
  const listed = run('gh', [
    'issue', 'list', '--state', 'open', '--label', SPEC_CREATED_LABEL,
    '--limit', '100', '--json', 'number,title',
  ], { cwd });
  if (!commandSucceeded(listed)) throw new Error('gh issue list failed');
  const parsed = parseCommandOutput(listed);
  if (!Array.isArray(parsed)) throw new Error('gh issue list failed');
  const candidates = parsed
    .filter((issue) => Number.isSafeInteger(issue?.number) && issue.number > 0)
    .filter((issue) => !allReadableProjectDone(readProjectItems(issue.number, { run, cwd })));
  if (candidates.length === 0) return [];
  return filterEligibleIssueEvidence(candidates, { run, cwd })
    .map((issue) => ({ number: issue.number, title: String(issue.title || '') }))
    .sort((left, right) => left.number - right.number);
}

function readIssueSpecCreatedLabel(issue, cwd, run) {
  const viewed = run('gh', ['issue', 'view', String(issue), '--json', 'number,labels'], { cwd });
  if (!commandSucceeded(viewed)) return null;
  const parsed = parseCommandOutput(viewed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return issueHasSpecCreatedLabel(parsed);
}

function waitForAgentStartRetry() {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(signal, 0, 0, 1_000);
}
function waitForAgentObservationRetry() {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(signal, 0, 0, 1_000);
}

function defaultHerdr(run, cwd) {
  const invoke = (args) => run('herdr', args, { cwd });
  return {
    observationPause: waitForAgentObservationRetry,
    integrationStatus: () => invoke(['integration', 'status']),
    paneLayout: (paneId) => invoke(['pane', 'layout', '--pane', paneId]),
    paneSplit: ({ direction, cwd: splitCwd }) => invoke([
      'pane', 'split', '--current', '--direction', direction, '--cwd', splitCwd, '--no-focus',
    ]),
    paneClose: (paneId) => invoke(['pane', 'close', paneId]),
    agentStart: ({ name, paneId }) => invoke(['agent', 'start', name, '--kind', 'omp', '--pane', paneId]),
    agentPrompt: ({ name, prompt }) => invoke(['agent', 'prompt', name, prompt, '--wait']),
    agentRead: ({ name, source }) => invoke(['agent', 'read', name, '--source', source]),
    agentSendKeys: ({ name, keys }) => invoke(['agent', 'send-keys', name, ...keys]),
    agentWait: ({ name, until }) => invoke([
      'agent', 'wait', name, ...(until ? ['--until', until] : []),
    ]),
    agentGet: (name) => invoke(['agent', 'get', name]),
    listAgents: () => invoke(['agent', 'list']),
    notificationShow: ({ title, body, sound }) => invoke([
      'notification', 'show', title, '--body', body, '--sound', sound,
    ]),
  };
}

function firstAgentList(value) {
  const parsed = parseCommandOutput(value);
  if (Array.isArray(parsed)) return parsed;
  return parsed?.result?.agents || parsed?.agents || [];
}

function agentState(value) {
  const parsed = parseCommandOutput(value);
  return String(
    parsed?.result?.agent?.agent_status
      ?? parsed?.result?.agent?.agentStatus
      ?? parsed?.result?.agent?.state
      ?? parsed?.result?.agent_status
      ?? parsed?.result?.agentStatus
      ?? parsed?.result?.state
      ?? parsed?.agent?.agent_status
      ?? parsed?.agent?.agentStatus
      ?? parsed?.agent?.state
      ?? parsed?.agent_status
      ?? parsed?.agentStatus
      ?? parsed?.state
      ?? '',
  ).toLowerCase();
}

function firstNumericProperty(value, key) {
  if (!value || typeof value !== 'object') return null;
  if (Number.isFinite(Number(value[key]))) return Number(value[key]);
  for (const child of Object.values(value)) {
    const found = firstNumericProperty(child, key);
    if (found !== null) return found;
  }
  return null;
}

function paneDimensions(value) {
  const parsed = parseCommandOutput(value);
  return {
    width: firstNumericProperty(parsed?.result, 'width') ?? firstNumericProperty(parsed, 'width'),
    height: firstNumericProperty(parsed?.result, 'height') ?? firstNumericProperty(parsed, 'height'),
  };
}

function splitPaneId(value) {
  const parsed = parseCommandOutput(value);
  return parsed?.result?.pane?.pane_id ?? parsed?.result?.pane_id ?? parsed?.pane?.pane_id ?? parsed?.pane_id ?? null;
}

function isPromptStalled(value) {
  const outputs = [
    parseCommandOutput(value),
    parseCommandOutput(value?.stderr),
  ];
  return outputs.some((output) => [
    output?.reasonCode,
    output?.code,
    output?.error,
    output?.result?.reasonCode,
    output?.result?.code,
    output,
  ].some((candidate) => String(candidate || '').includes('agent_prompt_stalled')));
}

function retryPromptSubmission(herdr, agentName) {
  return commandSucceeded(herdr.agentSendKeys({ name: agentName, keys: ['enter'] }))
    && commandSucceeded(herdr.agentWait({ name: agentName, until: 'working' }))
    && commandSucceeded(herdr.agentWait({ name: agentName }));
}

function hasPastedWorkerPrompt(herdr, agentName, prompt) {
  const detection = agentDetectionText(herdr, agentName);
  if (detection.includes(prompt)) return true;
  return prompt
    .split('\n', 3)
    .every((line) => detection.includes(line.slice(0, 11)));
}

function appearsWorking(herdr, agentName) {
  return agentDetectionText(herdr, agentName).includes('Working');
}

function waitForWorkerSettlement(herdr, agentName) {
  return commandSucceeded(herdr.agentWait({ name: agentName, until: 'working' }))
    && commandSucceeded(herdr.agentWait({ name: agentName }));
}

function repositoryDefaultBranch(cwd, run) {
  const result = run('gh', [
    'repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name',
  ], { cwd });
  return commandSucceeded(result) ? String(result.stdout || '').trim() : '';
}

function reviewBranchSelectionKeys(cwd, run) {
  const defaultBranch = repositoryDefaultBranch(cwd, run);
  if (!defaultBranch) return null;
  const branches = run('git', ['branch', '-a', '--format=%(refname:short)'], { cwd });
  if (!commandSucceeded(branches)) return null;
  const names = String(branches.stdout || '').split('\n').filter(Boolean);
  const defaultIndex = names.indexOf(defaultBranch);
  if (defaultIndex < 0) return null;
  return {
    defaultBranch,
    keys: [...Array.from({ length: defaultIndex }, () => 'down'), 'enter'],
  };
}

function agentDetectionText(herdr, name) {
  const detection = parseCommandOutput(herdr.agentRead({ name, source: 'detection' }));
  return typeof detection === 'string' ? detection : JSON.stringify(detection);
}

function observeAgentText(herdr, name, expected, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (agentDetectionText(herdr, name).includes(expected)) return true;
    if (attempt + 1 < attempts) herdr.observationPause?.();
  }
  return false;
}
function completeInteractiveReview(herdr, agentName, branchSelectionKeys) {
  let branchMenuVisible = agentDetectionText(herdr, agentName).includes('Select base branch');
  if (!branchMenuVisible) {
    let reviewModeVisible = observeAgentText(herdr, agentName, 'Review Mode');
    if (!reviewModeVisible) {
      herdr.agentPrompt({ name: agentName, prompt: '/review' });
      reviewModeVisible = observeAgentText(herdr, agentName, 'Review Mode');
      if (
        !reviewModeVisible
        && observeAgentText(herdr, agentName, '/review')
        && commandSucceeded(herdr.agentSendKeys({ name: agentName, keys: ['enter'] }))
      ) {
        reviewModeVisible = observeAgentText(herdr, agentName, 'Review Mode');
      }
    }
    if (
      !reviewModeVisible
      || !commandSucceeded(herdr.agentSendKeys({ name: agentName, keys: ['enter'] }))
    ) {
      return false;
    }
    branchMenuVisible = observeAgentText(herdr, agentName, 'Select base branch');
  }
  return branchMenuVisible
    && commandSucceeded(herdr.agentSendKeys({ name: agentName, keys: branchSelectionKeys }))
    && commandSucceeded(herdr.agentWait({ name: agentName, until: 'working' }))
    && commandSucceeded(herdr.agentWait({ name: agentName }));
}

function stopResult({ issue, step, paneId, agentName, reasonCode, runState, cwd, herdr, output }) {
  const sentence = `Stopped on #${issue} ${step}. Worker pane ${paneId} agent ${agentName} left open.`;
  try {
    herdr.notificationShow({ title: 'nmg-sdlc stopped', body: sentence, sound: 'request' });
  } catch {
    // The orchestrator sentence remains authoritative when notifications are unavailable.
  }
  runState.failed = { issue, step, reasonCode };
  writeRun(runState, cwd);
  output.push(sentence);
  return { status: 1, stdout: `${output.join('\n')}\n`, stderr: '' };
}

function closePane(herdr, paneId) {
  try {
    return commandSucceeded(herdr.paneClose(paneId));
  } catch {
    return false;
  }
}

function issueBranchName(issue, cwd, run) {
  const issueResult = run('gh', ['issue', 'view', String(issue), '--json', 'title'], { cwd });
  if (!commandSucceeded(issueResult)) return null;
  const issueData = parseCommandOutput(issueResult);
  return issueData?.title ? `${issue}-${String(issueData.title).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'issue'}` : null;
}

function dirtyTreeBlocks(issue, cwd, run, untrack = null) {
  const dirtyResult = run('git', ['status', '--porcelain', '-z'], { cwd });
  const branchResult = run('git', ['branch', '--show-current'], { cwd });
  if (!commandSucceeded(dirtyResult) || !commandSucceeded(branchResult)) return true;
  const dirty = String(dirtyResult.stdout || '');
  if (!dirty || isAuthorizedOmpSdlcUntrackTransition(dirty, untrack)) return false;
  return String(branchResult.stdout || '').trim() !== issueBranchName(issue, cwd, run);
}

function restoreActiveIssueBranch(issue, cwd, run) {
  const expected = issueBranchName(issue, cwd, run);
  if (!expected) return 'issue_branch_unreadable';
  const dirtyResult = run('git', ['status', '--porcelain'], { cwd });
  const branchResult = run('git', ['branch', '--show-current'], { cwd });
  if (!commandSucceeded(dirtyResult) || !commandSucceeded(branchResult)) {
    return 'issue_branch_unreadable';
  }
  const current = String(branchResult.stdout || '').trim();
  if (String(dirtyResult.stdout || '').trim() && current !== expected) return 'dirty_tree';
  if (current === expected) return null;
  if (!commandSucceeded(run('git', ['checkout', expected], { cwd }))) {
    return 'branch_checkout_failed';
  }
  const restored = run('git', ['branch', '--show-current'], { cwd });
  return commandSucceeded(restored) && String(restored.stdout || '').trim() === expected
    ? null
    : 'branch_checkout_failed';
}

function syncAndDeleteIssueBranch(issue, cwd, run) {
  const issueState = parseCommandOutput(run('gh', ['issue', 'view', String(issue), '--json', 'state'], { cwd }));
  const currentBranch = String(run('git', ['branch', '--show-current'], { cwd })?.stdout || '').trim();
  const issueBranch = currentBranch.startsWith(`${issue}-`) ? currentBranch : issueBranchName(issue, cwd, run);
  if (!issueBranch) return false;
  const pullRequest = parseCommandOutput(run('gh', [
    'pr', 'list', '--head', issueBranch, '--state', 'merged', '--json', 'state', '--limit', '1',
  ], { cwd }));
  const merged = Array.isArray(pullRequest) && String(pullRequest[0]?.state).toUpperCase() === 'MERGED';
  const closed = String(issueState?.state).toUpperCase() === 'CLOSED';
  if (!merged || !closed) return false;

  const defaultBranch = repositoryDefaultBranch(cwd, run);
  if (!defaultBranch) return false;
  if (currentBranch !== defaultBranch && !commandSucceeded(run('git', ['checkout', defaultBranch], { cwd }))) {
    return false;
  }
  if (!commandSucceeded(run('git', ['pull', '--ff-only'], { cwd }))) return false;
  run('git', ['branch', '-d', issueBranch], { cwd });
  return true;
}

export function runExecute({
  args = '',
  cwd = process.cwd(),
  env = process.env,
  run = defaultRun,
  fs = { existsSync, readFileSync },
  herdr,
} = {}) {
  const output = [];
  if (env.HERDR_ENV !== '1' || !env.HERDR_SOCKET_PATH || !env.HERDR_PANE_ID) {
    return { status: 2, stdout: 'execute requires a Herdr OMP session\n', stderr: '' };
  }

  let parsedArgs;
  try {
    parsedArgs = parseArgs(args);
  } catch {
    return { status: 2, stdout: '', stderr: `${usageError()}\n` };
  }

  const herdrApi = herdr || defaultHerdr(run, cwd);
  let integration;
  try {
    integration = herdrApi.integrationStatus();
  } catch {
    integration = null;
  }
  const integrationText = typeof integration === 'string'
    ? integration
    : String(integration?.stdout || '');
  if (!commandSucceeded(integration) || !/^omp:\s+(?!not installed)/m.test(integrationText)) {
    return { status: 2, stdout: 'Run: herdr integration install omp\n', stderr: '' };
  }
  if (!commandSucceeded(run('gh', ['auth', 'status'], { cwd }))) {
    return { status: 1, stdout: '', stderr: 'gh auth status failed\n' };
  }

  const existingRun = readRun(cwd);
  let issues = parsedArgs.issues;
  if (parsedArgs.defaultBacklog) {
    const resumable = Array.isArray(existingRun?.issues)
      && existingRun.issues.length > 0
      && existingRun.issues.every((issue) => Number.isSafeInteger(issue) && issue > 0);
    if (resumable) {
      issues = existingRun.issues;
    } else {
      let specified;
      try {
        specified = listSpecifiedIssues({ run, cwd });
      } catch (error) {
        return { status: 1, stdout: '', stderr: `${error?.reasonCode || 'dependency_unreadable'}\n` };
      }
      if (specified.length === 0) {
        return { status: 0, stdout: 'No open spec-created issues.\n', stderr: '' };
      }
      return { status: 2, stdout: '', stderr: `${usageError()}\n` };
    }
  } else {
    const missing = [];
    for (const issue of issues) {
      const labeled = readIssueSpecCreatedLabel(issue, cwd, run);
      if (labeled === null) {
        return { status: 1, stdout: '', stderr: `Unable to read labels for #${issue}\n` };
      }
      if (!labeled) missing.push(issue);
    }
    if (missing.length > 0) {
      return {
        status: 2,
        stdout: `${missing.map((issue) => `#${issue} has no spec-created label`).join('\n')}\n`,
        stderr: '',
      };
    }
  }
  if (!parsedArgs.defaultBacklog) {
    try {
      const graph = officialGraphForIssues(issues, { run, cwd });
      for (const issue of issues) {
        const dependency = issueDependencyStatus(graph, issue);
        if (dependency.status !== 'eligible') {
          return { status: 2, stdout: '', stderr: `${dependency.reasonCode || 'dependency_unreadable'} for #${issue}\n` };
        }
      }
    } catch (error) {
      return { status: 2, stdout: '', stderr: `${error?.reasonCode || 'dependency_unreadable'}\n` };
    }
  }
  if (issues.length === 0) return { status: 0, stdout: '', stderr: '' };
  const untrack = untrackOmpSdlcRuntime({ cwd, run });
  if (!untrack.ok) {
    return {
      status: 2,
      stdout: '',
      stderr: 'Failed to untrack plugin runtime under .omp/sdlc\n',
    };
  }
  if (dirtyTreeBlocks(issues[0], cwd, run, untrack)) {
    return { status: 2, stdout: '', stderr: 'Working tree is dirty for a new issue\n' };
  }

  let runState = existingRun;
  if (!runState || JSON.stringify(runState.issues) !== JSON.stringify(issues)) {
    runState = {
      schemaVersion: 1,
      issues,
      currentIssue: issues[0],
      currentStep: 'start',
      completed: {},
      failed: null,
      startedAt: new Date().toISOString(),
    };
  }

  const existingAgents = firstAgentList(herdrApi.listAgents());
  const createdPanes = new Set();
  for (let issueIndex = 0; issueIndex < issues.length; issueIndex += 1) {
    const issue = issues[issueIndex];
    const live = existingAgents.find((agent) => String(agent?.name || '').startsWith(`s${issue}-`));
    if (!live) {
      const labeled = readIssueSpecCreatedLabel(issue, cwd, run);
      if (labeled === null) {
        return { status: 1, stdout: `${output.join('\n')}${output.length ? '\n' : ''}`, stderr: `Unable to read labels for #${issue}\n` };
      }
      if (!labeled) {
        output.push(`#${issue} has no spec-created label`);
        return { status: 2, stdout: `${output.join('\n')}\n`, stderr: '' };
      }
    }
    const spec = specStatus(issue, cwd);
    if (!spec.approved) {
      output.push(`Run /sdlc-write-spec #${issue}`);
      return { status: 0, stdout: `${output.join('\n')}\n`, stderr: '' };
    }

    runState.currentIssue = issue;
    runState.completed[String(issue)] ||= [];
    let step = nextStep(runState.completed[String(issue)]);
    if (step && step !== 'start') {
      const reasonCode = restoreActiveIssueBranch(issue, cwd, run);
      if (reasonCode) {
        return stopResult({
          issue,
          step,
          paneId: 'none',
          agentName: `s${issue}-${step}`,
          reasonCode,
          runState,
          cwd,
          herdr: herdrApi,
          output,
        });
      }
    }
    if (live) {
      const agentName = String(live.name);
      const paneId = live.pane_id ?? live.paneId ?? 'unknown';
      let state = agentState(herdrApi.agentGet(agentName));
      if (!step || agentName !== `s${issue}-${step}`) {
        return stopResult({
          issue,
          step: step || runState.currentStep || 'start',
          paneId,
          agentName,
          reasonCode: 'retained_worker_mismatch',
          runState,
          cwd,
          herdr: herdrApi,
          output,
        });
      }
      if (paneId === 'unknown') {
        return stopResult({
          issue, step, paneId, agentName, reasonCode: 'unknown_pane',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      if (!['idle', 'done'].includes(state)) {
        const settled = state === 'working'
          ? commandSucceeded(herdrApi.agentWait({ name: agentName }))
          : waitForWorkerSettlement(herdrApi, agentName);
        if (!settled) {
          return stopResult({
            issue, step, paneId, agentName, reasonCode: 'worker_failed',
            runState, cwd, herdr: herdrApi, output,
          });
        }
        state = agentState(herdrApi.agentGet(agentName));
      }
      if (step && agentName === `s${issue}-${step}` && ['idle', 'done'].includes(state) && paneId !== 'unknown') {
        const handoffPath = join(cwd, HANDOFF_DIR, `${issue}-${step}.json`);
        const reviewStep = step === 'review1' || step === 'review2';
        const retainedReviewText = reviewStep
          ? agentDetectionText(herdrApi, agentName)
          : '';
        if (
          !fs.existsSync(handoffPath)
          && reviewStep
          && (
            retainedReviewText.includes('Review Mode')
            || retainedReviewText.includes('Select base branch')
          )
        ) {
          const reviewSelection = reviewBranchSelectionKeys(cwd, run);
          if (
            !reviewSelection
            || !completeInteractiveReview(herdrApi, agentName, reviewSelection.keys)
          ) {
            return stopResult({
              issue, step, paneId, agentName, reasonCode: 'review_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          let prompt;
          try {
            prompt = workerPrompt({ step, issue, cwd });
          } catch (error) {
            return stopResult({
              issue, step, paneId, agentName, reasonCode: workerPromptFailureReason(error),
              runState, cwd, herdr: herdrApi, output,
            });
          }
          herdrApi.agentPrompt({ name: agentName, prompt });
          if (
            !fs.existsSync(handoffPath)
            && hasPastedWorkerPrompt(herdrApi, agentName, prompt)
            && !retryPromptSubmission(herdrApi, agentName)
          ) {
            return stopResult({
              issue, step, paneId, agentName, reasonCode: 'worker_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          state = agentState(herdrApi.agentGet(agentName));
        }
        if (
          !fs.existsSync(handoffPath)
          && step !== 'review1'
          && step !== 'review2'
        ) {
          let prompt;
          try {
            prompt = workerPrompt({ step, issue, cwd });
          } catch (error) {
            return stopResult({
              issue, step, paneId, agentName, reasonCode: workerPromptFailureReason(error),
              runState, cwd, herdr: herdrApi, output,
            });
          }
          if (hasPastedWorkerPrompt(herdrApi, agentName, prompt)) {
            if (!retryPromptSubmission(herdrApi, agentName)) {
              return stopResult({
                issue, step, paneId, agentName, reasonCode: 'worker_failed',
                runState, cwd, herdr: herdrApi, output,
              });
            }
            state = agentState(herdrApi.agentGet(agentName));
          }
        }
        if (!fs.existsSync(handoffPath)) {
          if (!waitForWorkerSettlement(herdrApi, agentName)) {
            return stopResult({
              issue, step, paneId, agentName, reasonCode: 'worker_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          state = agentState(herdrApi.agentGet(agentName));
        }
        let handoff;
        try {
          if (!fs.existsSync(handoffPath)) throw new Error('handoff missing');
          handoff = validateHandoff(JSON.parse(fs.readFileSync(handoffPath, 'utf8')));
          if (handoff.issue !== issue || handoff.step !== step) throw new Error('handoff mismatch');
        } catch {
          return stopResult({
            issue, step, paneId, agentName, reasonCode: 'missing_handoff',
            runState, cwd, herdr: herdrApi, output,
          });
        }
        const remediation = runState.failed?.issue === issue && runState.failed?.step === step
          ? remediationCompletedSteps({
            issue,
            step,
            completed: runState.completed[String(issue)],
            handoff,
          })
          : null;
        if (remediation) {
          if (!['idle', 'done'].includes(state)) {
            return stopResult({
              issue, step, paneId, agentName, reasonCode: state || 'worker_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          if (!closePane(herdrApi, paneId)) {
            return stopResult({
              issue, step, paneId, agentName, reasonCode: 'pane_close_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          runState.completed[String(issue)] = remediation;
          step = nextStep(remediation);
          runState.currentStep = step;
          runState.failed = null;
          writeRun(runState, cwd);
        } else {
          if (!['idle', 'done'].includes(state) || handoff.status !== 'passed' || handoff.intervention) {
            return stopResult({
              issue,
              step,
              paneId,
              agentName,
              reasonCode: !['idle', 'done'].includes(state)
                ? state || 'worker_failed'
                : handoff.reasonCode || handoff.status,
              runState,
              cwd,
              herdr: herdrApi,
              output,
            });
          }
          if (!closePane(herdrApi, paneId)) {
            return stopResult({
              issue, step, paneId, agentName, reasonCode: 'pane_close_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          runState.completed[String(issue)].push(step);
          step = nextStep(runState.completed[String(issue)]);
          runState.currentStep = step;
          runState.failed = null;
          writeRun(runState, cwd);
        }
      } else {
        return stopResult({
          issue, step, paneId, agentName, reasonCode: state || 'worker_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }
    }
    if (live && step) {
      const labeled = readIssueSpecCreatedLabel(issue, cwd, run);
      if (labeled === null) {
        return { status: 1, stdout: `${output.join('\n')}${output.length ? '\n' : ''}`, stderr: `Unable to read labels for #${issue}\n` };
      }
      if (!labeled) {
        output.push(`#${issue} has no spec-created label`);
        return { status: 2, stdout: `${output.join('\n')}\n`, stderr: '' };
      }
    }
    while (step) {
      runState.currentStep = step;
      runState.failed = null;
      writeRun(runState, cwd);

      let reviewSelection = null;
      if (step === 'review1' || step === 'review2') {
        reviewSelection = reviewBranchSelectionKeys(cwd, run);
        if (!reviewSelection) {
          return stopResult({
            issue, step, paneId: 'none', agentName: `s${issue}-${step}`, reasonCode: 'review_failed',
            runState, cwd, herdr: herdrApi, output,
          });
        }
        const currentResult = run('git', ['branch', '--show-current'], { cwd });
        const expectedBranch = issueBranchName(issue, cwd, run);
        const currentBranch = commandSucceeded(currentResult)
          ? String(currentResult.stdout || '').trim()
          : '';
        if (
          !expectedBranch
          || currentBranch !== expectedBranch
          || currentBranch === reviewSelection.defaultBranch
        ) {
          return stopResult({
            issue, step, paneId: 'none', agentName: `s${issue}-${step}`, reasonCode: 'review_branch_mismatch',
            runState, cwd, herdr: herdrApi, output,
          });
        }
      }

      const layout = herdrApi.paneLayout(env.HERDR_PANE_ID);
      const { width, height } = paneDimensions(layout);
      const direction = width !== null && height !== null && width >= height ? 'right' : 'down';
      const split = herdrApi.paneSplit({ direction, cwd });
      const paneId = splitPaneId(split);
      const agentName = `s${issue}-${step}`;
      const handoffPath = join(cwd, HANDOFF_DIR, `${issue}-${step}.json`);
      if (!paneId || !commandSucceeded(split)) {
        return stopResult({
          issue, step, paneId: paneId || 'unknown', agentName, reasonCode: 'pane_split_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      createdPanes.add(paneId);
      rmSync(handoffPath, { force: true });

      let started = herdrApi.agentStart({ name: agentName, paneId, kind: 'omp' });
      if (!commandSucceeded(started)) {
        waitForAgentStartRetry();
        started = herdrApi.agentStart({ name: agentName, paneId, kind: 'omp' });
      }
      if (!commandSucceeded(started)) {
        return stopResult({
          issue, step, paneId, agentName, reasonCode: 'agent_start_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }

      if (
        (step === 'review1' || step === 'review2')
        && !completeInteractiveReview(herdrApi, agentName, reviewSelection.keys)
      ) {
        return stopResult({
          issue, step, paneId, agentName, reasonCode: 'review_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }

      let prompt;
      try {
        prompt = workerPrompt({ step, issue, cwd });
      } catch (error) {
        return stopResult({
          issue, step, paneId, agentName, reasonCode: workerPromptFailureReason(error),
          runState, cwd, herdr: herdrApi, output,
        });
      }
      const prompted = herdrApi.agentPrompt({ name: agentName, prompt });
      let state = agentState(herdrApi.agentGet(agentName));
      const promptStalled = isPromptStalled(prompted);
      if (
        !fs.existsSync(handoffPath)
        && (promptStalled || ['idle', 'done'].includes(state))
      ) {
        if (hasPastedWorkerPrompt(herdrApi, agentName, prompt)) {
          if (!retryPromptSubmission(herdrApi, agentName)) {
            return stopResult({
              issue, step, paneId, agentName, reasonCode: 'worker_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          state = agentState(herdrApi.agentGet(agentName));
        } else if (appearsWorking(herdrApi, agentName)) {
          if (!waitForWorkerSettlement(herdrApi, agentName)) {
            return stopResult({
              issue, step, paneId, agentName, reasonCode: 'worker_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          state = agentState(herdrApi.agentGet(agentName));
        } else if (promptStalled) {
          return stopResult({
            issue, step, paneId, agentName, reasonCode: 'agent_prompt_stalled',
            runState, cwd, herdr: herdrApi, output,
          });
        }
      }
      if (!fs.existsSync(handoffPath) && ['idle', 'done'].includes(state)) {
        if (!waitForWorkerSettlement(herdrApi, agentName)) {
          return stopResult({
            issue, step, paneId, agentName, reasonCode: 'worker_failed',
            runState, cwd, herdr: herdrApi, output,
          });
        }
        state = agentState(herdrApi.agentGet(agentName));
      }
      if (!fs.existsSync(handoffPath) && state === 'working') {
        herdrApi.agentWait({ name: agentName });
        state = agentState(herdrApi.agentGet(agentName));
      }
      let handoff;
      try {
        if (!fs.existsSync(handoffPath)) throw new Error('handoff missing');
        handoff = validateHandoff(JSON.parse(fs.readFileSync(handoffPath, 'utf8')));
      } catch {
        return stopResult({
          issue, step, paneId, agentName, reasonCode: 'missing_handoff',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      if (handoff.issue !== issue || handoff.step !== step) {
        return stopResult({
          issue, step, paneId, agentName, reasonCode: 'invalid_handoff',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      if (!['idle', 'done'].includes(state) || handoff.status !== 'passed' || handoff.intervention) {
        return stopResult({
          issue, step, paneId, agentName, reasonCode: handoff.reasonCode || handoff.status || state || 'worker_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }

      if (createdPanes.has(paneId) && !closePane(herdrApi, paneId)) {
        return stopResult({
          issue, step, paneId, agentName, reasonCode: 'pane_close_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      runState.completed[String(issue)].push(step);
      step = nextStep(runState.completed[String(issue)]);
      runState.currentStep = step;
      writeRun(runState, cwd);
    }

    if (!syncAndDeleteIssueBranch(issue, cwd, run)) {
      runState.failed = { issue, step: 'deliver', reasonCode: 'delivery_not_complete' };
      writeRun(runState, cwd);
      return { status: 1, stdout: `${output.join('\n')}${output.length ? '\n' : ''}`, stderr: 'Delivery is not MERGED and CLOSED\n' };
    }
  }

  runState.currentIssue = null;
  runState.currentStep = null;
  runState.failed = null;
  writeRun(runState, cwd);
  return { status: 0, stdout: `${output.join('\n')}${output.length ? '\n' : ''}`, stderr: '' };
}

function runCli(argv = process.argv.slice(2)) {
  const [sub, ...rest] = argv;
  if (!sub) {
    console.error('sdlc-execute: missing subcommand');
    process.exit(2);
  }
  if (sub === 'run') {
    const result = runExecute({ args: rest.join(' ') });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status);
  }
  if (sub === 'parse-args') {
    try {
      const res = parseArgs(rest.join(' '));
      console.log(JSON.stringify({ issues: res.issues || [], defaultBacklog: !!res.defaultBacklog }));
      process.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : usageError());
      process.exit(2);
    }
  }
  if (sub === 'list-specified') {
    try {
      console.log(JSON.stringify({ ok: true, issues: listSpecifiedIssues() }));
      process.exit(0);
    } catch {
      console.log(JSON.stringify({ ok: false, reasonCode: 'issues_unreadable' }));
      process.exit(1);
    }
  }
  if (sub === 'backlog') {
    try {
      const n = selectBacklog();
      process.stdout.write(n != null ? `${n}\n` : '');
      process.exit(0);
    } catch (e) {
      console.error(String(e.message || e));
      process.exit(1);
    }
  }
  if (sub === 'spec-status') {
    const i = rest.indexOf('--issue');
    if (i < 0 || !rest[i + 1]) {
      console.error('Usage: node sdlc-execute.mjs spec-status --issue N');
      process.exit(2);
    }
    const n = parseInt(rest[i + 1], 10);
    if (!Number.isInteger(n) || n <= 0) {
      console.error('invalid issue');
      process.exit(2);
    }
    const out = specStatus(n);
    console.log(JSON.stringify(out));
    process.exit(0);
  }
  if (sub === 'validate-handoff') {
    const i = rest.indexOf('--file');
    if (i < 0 || !rest[i + 1]) {
      console.error('Usage: node sdlc-execute.mjs validate-handoff --file <path>');
      process.exit(2);
    }
    try {
      validateHandoff(rest[i + 1]);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  }
  if (sub === 'read-run') {
    const data = readRun();
    console.log(data ? JSON.stringify(data, null, 2) : 'null');
    process.exit(0);
  }
  if (sub === 'write-run') {
    const input = rest.join(' ');
    if (!input) {
      console.error('provide run json');
      process.exit(2);
    }
    try {
      const data = JSON.parse(input);
      writeRun(data);
      process.exit(0);
    } catch (e) {
      console.error('invalid json or schema for write-run');
      process.exit(1);
    }
  }
  if (sub === 'worker-prompt') {
    const stepIndex = rest.indexOf('--step');
    const issueIndex = rest.indexOf('--issue');
    const step = stepIndex >= 0 ? rest[stepIndex + 1] : '';
    const issueRaw = issueIndex >= 0 ? rest[issueIndex + 1] : '';
    const issue = Number.parseInt(issueRaw, 10);
    if (!VALID_STEPS.includes(step) || !Number.isInteger(issue) || issue <= 0) {
      console.error('Usage: node sdlc-execute.mjs worker-prompt --step <start|implement|review1|fix1|review2|fix2|verify|deliver> --issue N');
      process.exit(2);
    }
    try {
      process.stdout.write(`${workerPrompt({ step, issue, cwd: process.cwd() })}\n`);
      process.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    }
  }
  console.error(`unknown subcommand: ${sub}`);
  process.exit(2);
}

if (isCliEntry(import.meta.url)) {
  runCli(process.argv.slice(2));
}
