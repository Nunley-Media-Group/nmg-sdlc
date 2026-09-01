#!/usr/bin/env node

/**
 * nmg-sdlc v3 execute helper.
 * Node ESM, zero runtime deps.
 * The execute skill invokes this for classification and state.
 * The agent in the main pane drives all Herdr commands.
 *
 * Exports support direct import by tests and the skill.
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  lstatSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
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
import {
  acquireControllerLease,
  reclaimStaleControllerLease,
  releaseControllerLease,
} from './sdlc-controller-lease.mjs';



const RUN_DIR = '.omp/sdlc';
const RUN_FILE = join(RUN_DIR, 'run.json');
const HANDOFF_DIR = join(RUN_DIR, 'handoffs');
const PROMPT_PROVENANCE_DIR = join(RUN_DIR, 'prompt-provenance');
const OMP_CONTROLLER_CONFIG_FILE = join(RUN_DIR, 'omp-controller.yml');
const OMP_CONTROLLER_CONFIG = 'paste:\n  largeMenuThreshold: 0\n';
const PROMPT_DELIVERY_VERSION = 2;
const PROMPT_DELIVERY_STATES = new Set(['pending', 'activating', 'delivered']);

export const VALID_STEPS = ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify', 'deliver'];
const VALID_STATUSES = ['passed', 'failed', 'blocked'];
export const REMEDIABLE_STEPS = ['implement', 'review1', 'fix1', 'review2', 'fix2', 'verify', 'deliver'];
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
  implement: ['simplify'],
};
const VERIFY_PANE_ENV_KEYS = Object.freeze(['NMG_SDLC_SMOKE_ISSUES']);

function verifyPaneEnvironment(step, env) {
  if (step !== 'verify') return null;
  const environment = {};
  for (const key of VERIFY_PANE_ENV_KEYS) {
    if (typeof env?.[key] === 'string') environment[key] = env[key];
  }
  return Object.keys(environment).length > 0 ? environment : null;
}



function usageError() {
  return 'Usage: /sdlc-execute [--retain-worker] [--recover-stale] [#N ...]';
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
  let retainWorker = false;
  let recoverStale = false;
  for (const tok of tokens) {
    if (tok === '--retain-worker') {
      if (retainWorker) throw new Error(usageError());
      retainWorker = true;
      continue;
    }
    if (tok === '--recover-stale') {
      if (recoverStale) throw new Error(usageError());
      recoverStale = true;
      continue;
    }
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
  const parsed = { issues, defaultBacklog: issues.length === 0 };
  if (retainWorker) parsed.retainWorker = true;
  if (recoverStale) parsed.recoverStale = true;
  return parsed;
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

function readExpectedHandoff(handoffPath, issue, step) {
  if (!existsSync(handoffPath)) {
    return { handoff: null, reasonCode: 'missing_handoff' };
  }
  try {
    const handoff = validateHandoff(handoffPath);
    if (handoff.issue !== issue || handoff.step !== step) {
      return { handoff: null, reasonCode: 'invalid_handoff' };
    }
    return { handoff, reasonCode: null };
  } catch {
    return { handoff: null, reasonCode: 'invalid_handoff' };
  }
}

function observeExpectedHandoff(herdr, handoffPath, issue, step, agentName) {
  let terminalObservation = false;
  for (;;) {
    const result = readExpectedHandoff(handoffPath, issue, step);
    if (result.handoff) return result;
    const state = observedAgentState(herdr, agentName);
    if (!state) return { handoff: null, reasonCode: 'process_lost' };
    if (['idle', 'done'].includes(state)) {
      if (terminalObservation) return result;
      terminalObservation = true;
    } else {
      terminalObservation = false;
    }
    herdr.observationPause?.();
  }
}

function reviewArtifactPath(issue, step) {
  return `.omp/sdlc/reviews/${issue}-${step}.md`;
}

function validReviewArtifact(cwd, issue, step, handoff) {
  if (handoff.status !== 'passed') return true;
  const artifactPath = reviewArtifactPath(issue, step);
  if (!handoff.artifacts.includes(artifactPath)) return false;
  try {
    return readFileSync(join(cwd, artifactPath), 'utf8').trim().length > 0;
  } catch {
    return false;
  }
}

function workerPresence(herdr, agentName, paneId) {
  try {
    const response = herdr.listAgents();
    if (!commandSucceeded(response)) return 'unknown';
    const parsed = parseCommandOutput(response);
    const agents = Array.isArray(parsed)
      ? parsed
      : parsed?.result?.agents ?? parsed?.agents;
    if (!Array.isArray(agents)) return 'unknown';
    return agents.some((agent) => (
      String(agent?.name || '') === agentName
      && String(agent?.pane_id ?? agent?.paneId ?? '') === String(paneId)
    )) ? 'present' : 'absent';
  } catch {
    return 'unknown';
  }
}


function observeReviewHandoff(herdr, handoffPath, issue, step, agentName, paneId, cwd) {
  for (;;) {
    const result = readExpectedHandoff(handoffPath, issue, step);
    if (result.handoff) {
      return validReviewArtifact(cwd, issue, step, result.handoff)
        ? result
        : { handoff: null, reasonCode: 'invalid_handoff' };
    }
    if (result.reasonCode !== 'missing_handoff') return result;
    if (workerPresence(herdr, agentName, paneId) === 'absent') {
      return { handoff: null, reasonCode: 'process_lost' };
    }
    herdr.observationPause?.();
  }
}

function readRunCheckpointAt(runFile, root = process.cwd()) {
  const canonicalRoot = realpathSync(root);
  const p = resolve(canonicalRoot, runFile);
  const rel = relative(canonicalRoot, p);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('unsafe run path');
  if (!existsSync(p)) return { data: null, bytes: null };
  try {
    const bytes = readFileSync(p);
    const data = JSON.parse(bytes.toString('utf8'));
    if (data && data.schemaVersion === 1) return { data, bytes };
    return { data: null, bytes };
  } catch {
    return { data: null, bytes: null };
  }
}

export function readRunAt(runFile, root = process.cwd()) {
  return readRunCheckpointAt(runFile, root).data;
}

export function readRun(root = process.cwd()) {
  return readRunAt(RUN_FILE, root);
}

const RUN_IDENTITY_FIELDS = Object.freeze([
  'projectRoot',
  'runId',
  'issue',
  'branch',
  'head',
  'revision',
]);

function validRunIdentity(runData) {
  return runData !== null
    && typeof runData === 'object'
    && typeof runData.projectRoot === 'string'
    && runData.projectRoot.length > 0
    && typeof runData.runId === 'string'
    && runData.runId.length > 0
    && Number.isSafeInteger(runData.issue)
    && runData.issue > 0
    && typeof runData.branch === 'string'
    && runData.branch.length > 0
    && typeof runData.head === 'string'
    && runData.head.length > 0
    && Array.isArray(runData.issues)
    && runData.issues.every((issue) => Number.isSafeInteger(issue) && issue > 0)
    && Number.isSafeInteger(runData.revision)
    && runData.revision > 0;
}
function validPromptDeliveryStates(runData) {
  if (runData.workers === undefined) return true;
  if (!runData.workers || typeof runData.workers !== 'object' || Array.isArray(runData.workers)) return false;
  return Object.values(runData.workers).every((worker) => {
    if (!worker || typeof worker !== 'object') return false;
    if (!Object.hasOwn(worker, 'promptDelivery')) return true;
    return PROMPT_DELIVERY_STATES.has(worker.promptDelivery)
      && (
        worker.promptDeliveryVersion === undefined
        || worker.promptDeliveryVersion === PROMPT_DELIVERY_VERSION
      );
  });
}

function migratePromptDeliveryStates(runData) {
  let changed = false;
  for (const worker of Object.values(runData.workers || {})) {
    if (!Object.hasOwn(worker, 'promptDelivery')) continue;
    if (!PROMPT_DELIVERY_STATES.has(worker.promptDelivery)) {
      throw new Error('invalid prompt delivery state');
    }
    if (worker.promptDelivery === 'delivered' && worker.promptDeliveryVersion !== PROMPT_DELIVERY_VERSION) {
      worker.promptDelivery = 'activating';
    }
    if (worker.promptDeliveryVersion !== PROMPT_DELIVERY_VERSION) {
      worker.promptDeliveryVersion = PROMPT_DELIVERY_VERSION;
      changed = true;
    }
  }
  return changed;
}


function hasRunIdentity(runData) {
  return runData !== null
    && typeof runData === 'object'
    && RUN_IDENTITY_FIELDS.some((field) => Object.hasOwn(runData, field));
}

function sameRunIdentity(left, right) {
  return left.projectRoot === right.projectRoot
    && left.runId === right.runId
    && left.issue === right.issue
    && left.branch === right.branch
    && left.head === right.head
    && JSON.stringify(left.issues) === JSON.stringify(right.issues);
}

export function writeRunAt(
  runData,
  root = process.cwd(),
  runFile = RUN_FILE,
  handoffDirectory = HANDOFF_DIR,
  expectedRevision = 0,
) {
  if (
    !runData
    || runData.schemaVersion !== 1
    || !Number.isSafeInteger(expectedRevision)
    || expectedRevision < 0
    || !validRunIdentity(runData)
    || !validPromptDeliveryStates(runData)
    || runData.revision !== expectedRevision + 1
  ) {
    throw new Error('invalid run schema');
  }

  const canonicalRoot = realpathSync(root);
  if (runData.projectRoot !== canonicalRoot) throw new Error('identity_mismatch');

  const p = resolve(canonicalRoot, runFile);
  const handoffDir = resolve(canonicalRoot, handoffDirectory);
  for (const candidate of [p, handoffDir]) {
    const rel = relative(canonicalRoot, candidate);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('unsafe run path');
  }
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  if (!existsSync(handoffDir)) mkdirSync(handoffDir, { recursive: true });

  const lockPath = `${p}.lock`;
  const temporaryPath = `${p}.tmp`;
  let lock;
  try {
    try {
      lock = openSync(lockPath, 'wx');
    } catch (error) {
      if (error?.code === 'EEXIST') throw new Error('checkpoint_locked');
      throw error;
    }

    if (existsSync(p)) {
      let existing;
      try {
        existing = JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        throw new Error('identity_mismatch');
      }

      const bound = existing?.schemaVersion === 1 && validRunIdentity(existing);
      if (!bound) {
        const bindable = existing?.schemaVersion === 1
          && !hasRunIdentity(existing)
          && expectedRevision === 0
          && JSON.stringify(existing.issues) === JSON.stringify(runData.issues)
          && (!Object.hasOwn(existing, 'currentIssue')
            || existing.currentIssue === null
            || existing.currentIssue === runData.currentIssue);
        if (!bindable) throw new Error('identity_mismatch');
      } else {
        if (existing.revision !== expectedRevision) throw new Error('stale_revision');
        if (!sameRunIdentity(existing, runData)) throw new Error('identity_mismatch');
      }
    } else if (expectedRevision !== 0) {
      throw new Error('stale_revision');
    }

    writeFileSync(temporaryPath, `${JSON.stringify(runData, null, 2)}\n`);
    renameSync(temporaryPath, p);
  } finally {
    if (lock !== undefined) {
      try {
        closeSync(lock);
      } finally {
        unlinkSync(lockPath);
      }
    }
  }
}

export function writeRun(runData, root = process.cwd(), expectedRevision = 0) {
  writeRunAt(runData, root, RUN_FILE, HANDOFF_DIR, expectedRevision);
}

function persistRunState(runState, root) {
  const expectedRevision = Number.isSafeInteger(runState.revision) ? runState.revision : 0;
  const previous = runState.revision;
  runState.revision = expectedRevision + 1;
  try {
    writeRun(runState, root, expectedRevision);
  } catch (error) {
    runState.revision = previous;
    throw error;
  }
}
function terminalRunState(runData, { requireReleasedCurrentIssue = false } = {}) {
  return runData !== null
    && typeof runData === 'object'
    && runData.schemaVersion === 1
    && Array.isArray(runData.issues)
    && runData.issues.length > 0
    && runData.issues.every((issue) => Number.isSafeInteger(issue) && issue > 0)
    && (!requireReleasedCurrentIssue || runData.currentIssue === null)
    && runData.currentStep === null
    && runData.failed === null
    && runData.remediation == null
    && runData.issues.every((issue) => VALID_STEPS.every(
      (step) => runData.completed?.[String(issue)]?.includes(step),
    ));
}

function completedRunState(runData, options = {}) {
  return validRunIdentity(runData) && terminalRunState(runData, options);
}

function legacyCompletedRunState(runData) {
  return terminalRunState(runData, { requireReleasedCurrentIssue: true })
    && !hasRunIdentity(runData);
}

function assertSafeRuntimeDirectory(path) {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('unsafe runtime path');
  }
}

export function cleanupCompletedRun(
  runData,
  root = process.cwd(),
  { legacyCheckpointBytes = null } = {},
) {
  let failed = false;
  let lock;
  let lockPath;
  try {
    const legacy = legacyCheckpointBytes !== null;
    if (
      legacy
        ? !Buffer.isBuffer(legacyCheckpointBytes) || !legacyCompletedRunState(runData)
        : !completedRunState(runData, { requireReleasedCurrentIssue: true })
    ) {
      throw new Error('incomplete run');
    }

    const canonicalRoot = realpathSync(root);
    if (!legacy && canonicalRoot !== runData.projectRoot) throw new Error('checkpoint mismatch');

    const runtimePath = join(canonicalRoot, RUN_DIR);
    const runPath = join(canonicalRoot, RUN_FILE);
    const handoffPath = join(canonicalRoot, HANDOFF_DIR);
    const provenancePath = join(canonicalRoot, PROMPT_PROVENANCE_DIR);
    assertSafeRuntimeDirectory(join(canonicalRoot, '.omp'));
    assertSafeRuntimeDirectory(runtimePath);
    assertSafeRuntimeDirectory(handoffPath);
    assertSafeRuntimeDirectory(provenancePath);

    lockPath = `${runPath}.lock`;
    lock = openSync(lockPath, 'wx');

    const existingBytes = readFileSync(runPath);
    if (legacy && !existingBytes.equals(legacyCheckpointBytes)) {
      throw new Error('checkpoint mismatch');
    }
    const existing = JSON.parse(existingBytes.toString('utf8'));
    if (
      legacy
        ? !legacyCompletedRunState(existing)
        : !completedRunState(existing)
          || existing.revision !== runData.revision
          || !sameRunIdentity(existing, runData)
    ) {
      throw new Error('checkpoint mismatch');
    }

    for (const issue of runData.issues) {
      for (const step of VALID_STEPS) {
        rmSync(join(handoffPath, `${issue}-${step}.json`), { force: true });
      }
    }
    for (const step of VALID_STEPS) {
      rmSync(join(provenancePath, `worker-${step}.json`), { force: true });
    }
    rmSync(`${runPath}.tmp`, { force: true });
    rmSync(runPath, { force: true });
  } catch {
    failed = true;
  } finally {
    if (lock !== undefined) {
      try {
        closeSync(lock);
      } catch {
        failed = true;
      }
      try {
        unlinkSync(lockPath);
      } catch {
        failed = true;
      }
    }
  }
  if (failed) throw new Error('completed_cleanup_failed');
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

export function workerPrompt({ step, issue, skill, cwd, controllerRunId } = {}) {
  if (!step || !VALID_STEPS.includes(step)) throw new Error('invalid step for workerPrompt');
  if (!Number.isInteger(issue) || issue <= 0) throw new Error('invalid issue for workerPrompt');
  const skillName = skill || STEP_SKILL[step];
  if (!skillName || skillName !== STEP_SKILL[step]) throw new Error('no skill for step');
  const { text, provenance } = renderPrompt(defaultPromptRegistry(packageRoot, { projectRoot: cwd }), {
    consumer: `worker:${step}`,
    vars: {
      issue: String(issue),
      step,
      handoffPath: `.omp/sdlc/handoffs/${issue}-${step}.json`,
      controllerRunId: controllerRunId || '',
    },
  });
  if (cwd) writePromptProvenance(cwd, provenance);
  return materializeControllerPaths(text, packageRoot).trimEnd();
}

export function remAgentName(issue, step) {
  return `r${issue}-${step}`;
}

export function isRemediableFailedHandoff({ step, state, handoff } = {}) {
  return REMEDIABLE_STEPS.includes(step)
    && ['idle', 'done'].includes(state)
    && handoff?.status === 'failed'
    && handoff.intervention === false
    && handoff.step === step;
}

export function remediationPrompt({
  issue,
  failedStep,
  evidence,
  cwd,
  controllerRunId,
  reviewBase,
} = {}) {
  let resolvedEvidence = evidence;
  if (!resolvedEvidence) {
    const runState = readRun(cwd);
    const remediation = runState?.remediation;
    if (
      remediation?.issue !== issue
      || remediation?.step !== failedStep
      || remediation.status !== 'active'
    ) {
      throw new Error('remediation_evidence_missing');
    }
    resolvedEvidence = {
      attempt: remediation.attempt,
      reasonCode: remediation.reasonCode,
      summary: remediation.summary,
      artifacts: remediation.artifacts,
      closedName: remediation.closedWorker?.name,
      closedPaneId: remediation.closedWorker?.paneId,
    };
    controllerRunId ||= runState.runId;
  }
  const artifacts = Array.isArray(resolvedEvidence.artifacts) && resolvedEvidence.artifacts.length > 0
    ? resolvedEvidence.artifacts.map((artifact) => `- ${artifact}`).join('\n')
    : '- (none)';
  const header = [
    `You are remediating issue #${issue} step ${failedStep} (attempt ${resolvedEvidence.attempt}).`,
    `Failed worker ${resolvedEvidence.closedName} in pane ${resolvedEvidence.closedPaneId} was closed after evidence capture.`,
    `reasonCode: ${resolvedEvidence.reasonCode}`,
    `summary: ${resolvedEvidence.summary}`,
    'artifacts:',
    artifacts,
    '',
    `Diagnose that failure. Fix the defect. Update the approved issue spec only when observable behavior changes. Commit and push through the existing execute gates for this step. Then rerun the same failed step contract below and write .omp/sdlc/handoffs/${issue}-${failedStep}.json with issue ${issue} and step ${failedStep}. Never write a rem step identity. Never call ask.`,
  ].join('\n');
  const stepPrompt = workerPrompt({
    step: failedStep,
    issue,
    cwd,
    controllerRunId,
  });
  const contract = failedStep === 'review1' || failedStep === 'review2'
    ? reviewProtocolPrompt(reviewBase, stepPrompt)
    : stepPrompt;
  return `${header}\n---\n${contract}`;
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
function ensureControllerOmpConfig(cwd) {
  const root = realpathSync(cwd);
  const configPath = resolve(root, OMP_CONTROLLER_CONFIG_FILE);
  const configDirectory = dirname(configPath);
  if (!existsSync(configDirectory)) mkdirSync(configDirectory, { recursive: true });
  if (existsSync(configPath) && readFileSync(configPath, 'utf8') === OMP_CONTROLLER_CONFIG) {
    return configPath;
  }
  writeFileSync(configPath, OMP_CONTROLLER_CONFIG, 'utf8');
  return configPath;
}


export function defaultHerdr(run, cwd) {
  const invoke = (args) => run('herdr', args, { cwd });
  return {
    observationPause: waitForAgentObservationRetry,
    promptRetryPause: waitForAgentObservationRetry,
    integrationStatus: () => invoke(['integration', 'status']),
    paneLayout: (paneId) => invoke(['pane', 'layout', '--pane', paneId]),
    paneSplit: ({ direction, cwd: splitCwd, environment }) => invoke([
      'pane', 'split', '--current', '--direction', direction, '--cwd', splitCwd, '--no-focus',
      ...Object.entries(environment ?? {}).flatMap(([key, value]) => [
        '--env', `${key}=${value}`,
      ]),
    ]),
    paneClose: (paneId) => invoke(['pane', 'close', paneId]),
    agentStart: ({ name, paneId }) => {
      let configPath;
      try {
        configPath = ensureControllerOmpConfig(cwd);
      } catch (error) {
        return {
          status: 1,
          stdout: '',
          stderr: `unable to prepare OMP controller config: ${error instanceof Error ? error.message : String(error)}\n`,
        };
      }
      return invoke([
        'agent', 'start', name, '--kind', 'omp', '--pane', paneId,
        '--', '--config', configPath,
      ]);
    },
    agentPrompt: ({ name, prompt }) => invoke(['agent', 'prompt', name, prompt]),
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

function observedAgentState(herdr, name) {
  try {
    const response = herdr.agentGet(name);
    if (!commandSucceeded(response)) return null;
    return agentState(response) || null;
  } catch {
    return null;
  }
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

function commandIncludesCode(value, code) {
  const candidates = [
    value,
    value?.message,
    value?.cause,
    value?.details,
    parseCommandOutput(value),
    parseCommandOutput(value?.stdout),
    parseCommandOutput(value?.stderr),
  ];
  return candidates.some((candidate) => {
    if (typeof candidate === 'string') return candidate.includes(code);
    try {
      return JSON.stringify(candidate).includes(code);
    } catch {
      return false;
    }
  });
}

function isPromptStalled(value) {
  return commandIncludesCode(value, 'agent_prompt_stalled');
}

function isPromptReadinessError(value) {
  return ['agent_not_ready', 'agent_not_found']
    .some((code) => commandIncludesCode(value, code));
}

function promptDeliveryGuaranteed(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (value.delivered === true || value.deliveryGuaranteed === true) return true;
  return Object.values(value).some((child) => promptDeliveryGuaranteed(child, seen));
}

function promptGeneratedOnce(herdr, agentName, prompt) {
  try {
    return herdr.agentPrompt({ name: agentName, prompt });
  } catch (error) {
    const outcome = { status: 1, thrown: true, error };
    if (!isPromptStalled(outcome) && !isPromptReadinessError(outcome)) throw error;
    return outcome;
  }
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
function awaitInitialPromptActivation(
  herdr,
  handoffPath,
  issue,
  step,
  agentName,
  paneId,
) {
  const retries = 10;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = readExpectedHandoff(handoffPath, issue, step);
    if (result.handoff) return { result };
    const state = observedAgentState(herdr, agentName);
    if (['working', 'blocked'].includes(state)) return { state };
    const presence = workerPresence(herdr, agentName, paneId);
    if (presence === 'absent') {
      return { result: { handoff: null, reasonCode: 'process_lost' } };
    }
    if (attempt === retries) {
      return {
        result: result.reasonCode === 'invalid_handoff'
          ? result
          : { handoff: null, reasonCode: 'prompt_pending' },
      };
    }
    herdr.observationPause?.();
  }
  return { result: { handoff: null, reasonCode: 'prompt_pending' } };
}


function deliverGeneratedPromptOnce({
  herdr,
  agentName,
  paneId,
  prompt,
  start,
  handoffPath,
}) {
  const finishStalledPrompt = (prompted) => {
    if (existsSync(handoffPath) || promptDeliveryGuaranteed(prompted)) {
      return { delivered: true, state: null };
    }
    try {
      if (hasPastedWorkerPrompt(herdr, agentName, prompt)) {
        return retryPromptSubmission(herdr, agentName)
          ? { delivered: true, state: null, promptSubmissionRetried: true }
          : { delivered: false, reasonCode: 'worker_failed' };
      }
      if (appearsWorking(herdr, agentName)) {
        return waitForWorkerSettlement(herdr, agentName)
          ? { delivered: true, state: null }
          : { delivered: false, reasonCode: 'worker_failed' };
      }
    } catch {
      // A failed proof is not process-loss evidence.
    }
    return { delivered: false, reasonCode: 'prompt_pending' };
  };

  const dispatch = () => {
    const prompted = promptGeneratedOnce(herdr, agentName, prompt);
    if (isPromptStalled(prompted)) {
      const finished = finishStalledPrompt(prompted);
      return finished.delivered ? { ...finished, proven: true } : finished;
    }
    if (commandSucceeded(prompted) || promptDeliveryGuaranteed(prompted)) {
      return { delivered: true, state: null, prompted };
    }
    return { delivered: false, prompted };
  };

  const deliveryIsProven = (delivery) => {
    if (!delivery.delivered) return false;
    if (delivery.proven || workerPresence(herdr, agentName, paneId) === 'present') return true;
    if (existsSync(handoffPath) || promptDeliveryGuaranteed(delivery.prompted)) return true;
    try {
      return hasPastedWorkerPrompt(herdr, agentName, prompt)
        || appearsWorking(herdr, agentName);
    } catch {
      return false;
    }
  };

  let restarted = false;
  const restartGoneWorker = () => {
    const presence = workerPresence(herdr, agentName, paneId);
    if (presence === 'present') return null;
    if (presence === 'unknown') {
      return { delivered: false, reasonCode: 'prompt_pending' };
    }
    if (restarted) return { delivered: false, reasonCode: 'process_lost' };
    restarted = true;
    waitForAgentStartRetry();
    if (!commandSucceeded(start())) {
      return { delivered: false, reasonCode: 'agent_start_failed' };
    }
    const restartedPresence = workerPresence(herdr, agentName, paneId);
    if (restartedPresence === 'present') return null;
    return {
      delivered: false,
      reasonCode: restartedPresence === 'unknown' ? 'prompt_pending' : 'process_lost',
    };
  };

  const prePromptFailure = restartGoneWorker();
  if (prePromptFailure) return prePromptFailure;

  let delivery = dispatch();
  if (existsSync(handoffPath)) {
    return { delivered: true, state: null, proven: true };
  }
  if (delivery.reasonCode || deliveryIsProven(delivery)) return delivery;
  if (
    !delivery.delivered
    && workerPresence(herdr, agentName, paneId) !== 'absent'
  ) {
    return { delivered: false, reasonCode: 'prompt_pending' };
  }

  const retryFailure = restartGoneWorker();
  if (retryFailure) return retryFailure;
  delivery = dispatch();
  if (delivery.reasonCode || deliveryIsProven(delivery)) return delivery;
  if (delivery.delivered) return { delivered: false, reasonCode: 'process_lost' };
  return workerPresence(herdr, agentName, paneId) === 'absent'
    ? { delivered: false, reasonCode: 'process_lost' }
    : { delivered: false, reasonCode: 'prompt_pending' };
}

function repositoryDefaultBranch(cwd, run) {
  const result = run('gh', [
    'repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name',
  ], { cwd });
  return commandSucceeded(result) ? String(result.stdout || '').trim() : '';
}

function resolveReviewBase(cwd, run) {
  const defaultBranch = repositoryDefaultBranch(cwd, run);
  if (!defaultBranch) return null;
  const localRef = run('git', [
    'show-ref', '--verify', '--quiet', `refs/heads/${defaultBranch}`,
  ], { cwd });
  if (commandSucceeded(localRef)) return defaultBranch;
  if (localRef?.status !== 1) return null;
  const remoteRef = run('git', [
    'show-ref', '--verify', '--quiet', `refs/remotes/origin/${defaultBranch}`,
  ], { cwd });
  return commandSucceeded(remoteRef) ? `origin/${defaultBranch}` : null;
}

function reviewProtocolPrompt(baseRef, finalizationPrompt) {
  if (!baseRef) throw new Error('review_base_missing');
  return [
    '# Controller-Owned Host Review',
    '',
    `In this sibling \`--kind omp\` worker, review the current branch against exact base \`${baseRef}\` using a PR-style merge-base comparison.`,
    'Use three parallel task-tool agents with file-assigned scopes. Do not use generic task agents in the controller or main pane.',
    'Group files by locality, pair tests with implementation, and assign each changed file and diff hunk to exactly one reviewer.',
    'Each reviewer must inspect only assigned files and diff hunks, read full-file context only as needed, and report findings and verdict fields incrementally via yield sections without a separate finding tool.',
    'Consolidate the findings, then complete the review artifact and handoff finalization below in this same prompt. Do not stop after reporting findings and do not wait for another controller prompt.',
    '',
    '# Review Finalization Contract',
    '',
    finalizationPrompt,
  ].join('\n');
}

function submitReviewProtocol({
  herdr,
  agentName,
  paneId,
  prompt,
  handoffPath,
  issue,
  step,
  cwd,
  activatePrompt,
}) {
  const presence = workerPresence(herdr, agentName, paneId);
  if (presence !== 'present') {
    return {
      handoff: null,
      reasonCode: presence === 'absent' ? 'process_lost' : 'prompt_pending',
    };
  }
  const prompted = promptGeneratedOnce(herdr, agentName, prompt);
  const promptStalled = isPromptStalled(prompted);
  if (
    !commandSucceeded(prompted)
    && !promptStalled
    && workerPresence(herdr, agentName, paneId) === 'absent'
  ) {
    return { handoff: null, reasonCode: 'review_failed' };
  }
  if (
    promptStalled
    && !existsSync(handoffPath)
    && hasPastedWorkerPrompt(herdr, agentName, prompt)
    && !commandSucceeded(herdr.agentSendKeys({ name: agentName, keys: ['enter'] }))
  ) {
    return { handoff: null, reasonCode: 'worker_failed' };
  }
  const activation = activatePrompt();
  if (activation.result) {
    if (!activation.result.handoff) return activation.result;
    return validReviewArtifact(cwd, issue, step, activation.result.handoff)
      ? activation.result
      : { handoff: null, reasonCode: 'invalid_handoff' };
  }
  return observeReviewHandoff(
    herdr,
    handoffPath,
    issue,
    step,
    agentName,
    paneId,
    cwd,
  );
}
function agentDetectionText(herdr, name) {
  const detection = parseCommandOutput(herdr.agentRead({ name, source: 'detection' }));
  return typeof detection === 'string' ? detection : JSON.stringify(detection);
}


function currentCheckout(cwd, run) {
  const branchResult = run('git', ['branch', '--show-current'], { cwd });
  const headResult = run('git', ['rev-parse', 'HEAD'], { cwd });
  if (!commandSucceeded(branchResult) || !commandSucceeded(headResult)) return null;
  const branch = String(branchResult.stdout || '').trim();
  const head = String(headResult.stdout || '').trim();
  return branch && head ? { branch, head } : null;
}

const WORKER_IDENTITY_FIELDS = [
  'name',
  'paneId',
  'projectRoot',
  'runId',
  'issue',
  'step',
];

function sameWorkerIdentity(left, right) {
  return left && right
    && WORKER_IDENTITY_FIELDS.every((field) => left[field] === right[field]);
}

function latestMatchingRunState(runState, cwd) {
  const latest = readRun(cwd);
  if (
    !validRunIdentity(latest)
    || !sameRunIdentity(latest, runState)
    || latest.revision < runState.revision
  ) {
    throw new Error('checkpoint_identity_mismatch');
  }
  return latest;
}

function cleanupControllerWorkers({
  runState,
  cwd,
  run,
  herdr,
  retainWorker,
}) {
  const actions = [];
  let checkout = null;
  for (const [name, worker] of Object.entries(runState.workers || {})) {
    if (
      worker?.name !== name
      || worker.projectRoot !== runState.projectRoot
      || worker.runId !== runState.runId
    ) {
      continue;
    }
    if (retainWorker || ['pending', 'activating'].includes(worker.promptDelivery)) {
      checkout ??= currentCheckout(cwd, run);
      if (checkout) actions.push({ name, worker, checkout });
    } else if (closePane(herdr, worker.paneId)) {
      actions.push({ name, worker, closed: true });
    }
  }

  const latest = latestMatchingRunState(runState, cwd);
  latest.workers ||= {};
  for (const action of actions) {
    const recorded = latest.workers[action.name];
    if (!sameWorkerIdentity(recorded, action.worker)) continue;
    if (action.closed) {
      delete latest.workers[action.name];
    } else {
      Object.assign(recorded, action.checkout);
    }
  }
  return latest;
}


function workerOwnership({ runState, issue, step, agentName, paneId, cwd, run }) {
  const checkout = currentCheckout(cwd, run);
  if (!checkout) return null;
  return {
    name: agentName,
    paneId,
    projectRoot: runState.projectRoot,
    runId: runState.runId,
    issue,
    step,
    ...checkout,
  };
}

function matchingWorkerOwnership({
  runState,
  issue,
  step,
  agentName,
  paneId,
  cwd,
  run,
  allowCompletedHeadAdvance = false,
}) {
  const expected = workerOwnership({ runState, issue, step, agentName, paneId, cwd, run });
  const recorded = runState.workers?.[agentName];
  if (!expected || !recorded) return null;
  if (!Object.keys(expected).every((key) => (
    key === 'head' || recorded[key] === expected[key]
  ))) {
    return null;
  }
  if (recorded.head === expected.head) return expected;
  if (!allowCompletedHeadAdvance) return null;
  try {
    return commandSucceeded(run('git', [
      'merge-base', '--is-ancestor', recorded.head, expected.head,
    ], { cwd })) ? expected : null;
  } catch {
    return null;
  }
}

function validatedPassedWorkerHandoff(cwd, issue, step) {
  const handoff = readExpectedHandoff(
    join(cwd, HANDOFF_DIR, `${issue}-${step}.json`),
    issue,
    step,
  ).handoff;
  if (!handoff || handoff.status !== 'passed' || handoff.intervention) return null;
  if (
    (step === 'review1' || step === 'review2')
    && !validReviewArtifact(cwd, issue, step, handoff)
  ) {
    return null;
  }
  return handoff;
}

function stopResult({
  issue,
  step,
  paneId,
  agentName,
  reasonCode,
  runState,
  cwd,
  run,
  herdr,
  output,
  retainWorker = false,
}) {
  const recorded = runState.workers?.[agentName];
  const owned = recorded?.paneId === paneId
    && recorded.name === agentName
    && recorded.projectRoot === runState.projectRoot
    && recorded.runId === runState.runId
    && recorded.issue === issue
    && recorded.step === step;
  let disposition = 'left open';
  if (owned && (retainWorker || reasonCode === 'prompt_pending')) {
    const checkout = currentCheckout(cwd, run);
    if (checkout) Object.assign(recorded, checkout);
    disposition = reasonCode === 'prompt_pending'
      ? 'retained with prompt pending'
      : 'retained by request';
  } else if (
    owned
    && reasonCode !== 'pane_close_failed'
    && reasonCode !== 'retained_worker_mismatch'
  ) {
    if (closePane(herdr, paneId)) {
      delete runState.workers[agentName];
      disposition = 'closed';
    } else {
      reasonCode = 'pane_close_failed';
    }
  }
  const sentence = `Stopped on #${issue} ${step}. Worker pane ${paneId} agent ${agentName} ${disposition}.`;
  try {
    herdr.notificationShow({ title: 'nmg-sdlc stopped', body: sentence, sound: 'request' });
  } catch {
    // The orchestrator sentence remains authoritative when notifications are unavailable.
  }
  runState.failed = {
    issue,
    step,
    reasonCode,
    ...(reasonCode === 'prompt_pending' ? { intervention: true } : {}),
  };
  persistRunState(runState, cwd);
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
  installSignalHandlers = false,
  processApi = process,
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

  const existingCheckpoint = readRunCheckpointAt(RUN_FILE, cwd);
  let existingRun = existingCheckpoint.data;
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
  const controllerRunId = validRunIdentity(existingRun) ? existingRun.runId : randomUUID();
  let runState = existingRun;
  let controllerLease;
  let releaseLeaseInFinally = true;
  if (parsedArgs.recoverStale) {
    try {
      const recovery = reclaimStaleControllerLease({
        projectRoot: cwd,
        runId: controllerRunId,
        processApi,
        listAgents: () => herdrApi.listAgents(),
        controllerPaneId: env.HERDR_PANE_ID,
      });
      if (recovery.reclaimed) output.push('Reclaimed stale controller lease.');
    } catch {
      return { status: 1, stdout: '', stderr: 'controller_lease_held\n' };
    }
  }
  try {
    controllerLease = acquireControllerLease({
      projectRoot: cwd,
      runId: controllerRunId,
      controllerPaneId: env.HERDR_PANE_ID,
    });
  } catch (error) {
    return {
      status: 1,
      stdout: '',
      stderr: `${error?.reasonCode || error?.message || 'controller_lease_held'}\n`,
    };
  }
  const signalHandlers = [];
  if (installSignalHandlers) {
    const handleSignal = (signal) => {
      if (runState?.workers && validRunIdentity(runState)) {
        try {
          runState = cleanupControllerWorkers({
            runState,
            cwd,
            run,
            herdr: herdrApi,
            retainWorker: parsedArgs.retainWorker,
          });
          if (
            Number.isSafeInteger(runState.currentIssue)
            && VALID_STEPS.includes(runState.currentStep)
          ) {
            runState.failed = {
              issue: runState.currentIssue,
              step: runState.currentStep,
              reasonCode: 'controller_cancelled',
            };
          }
          persistRunState(runState, cwd);
        } catch {
          releaseLeaseInFinally = false;
        }
      }
      if (releaseLeaseInFinally) {
        releaseControllerLease(controllerLease);
        controllerLease = null;
      }
      processApi.exit(signal === 'SIGINT' ? 130 : 143);
    };
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handler = () => handleSignal(signal);
      processApi.once(signal, handler);
      signalHandlers.push([signal, handler]);
    }
  }

  try {
  const untrack = untrackOmpSdlcRuntime({ cwd, run });
  if (!untrack.ok) {
    return {
      status: 2,
      stdout: '',
      stderr: 'Failed to untrack plugin runtime under .omp/sdlc\n',
    };
  }
  const runFileExists = existsSync(join(cwd, RUN_FILE));
  const matchingRun = existingRun && JSON.stringify(existingRun.issues) === JSON.stringify(issues);
  if (runFileExists && !matchingRun) {
    const boundTerminal = completedRunState(
      existingRun,
      { requireReleasedCurrentIssue: true },
    );
    const legacyTerminal = legacyCompletedRunState(existingRun);
    if (!boundTerminal && !legacyTerminal) {
      return { status: 1, stdout: '', stderr: 'Run checkpoint identity mismatch\n' };
    }
    try {
      cleanupCompletedRun(
        existingRun,
        cwd,
        legacyTerminal ? { legacyCheckpointBytes: existingCheckpoint.bytes } : undefined,
      );
      existingRun = null;
    } catch {
      return {
        status: 1,
        stdout: '',
        stderr: 'completed_cleanup_failed\n',
      };
    }
  }
  const dirtyIssue = matchingRun
    ? issues.find((issue) => nextStep(existingRun.completed?.[String(issue)] ?? []) !== null) ?? issues[0]
    : issues[0];
  if (dirtyTreeBlocks(dirtyIssue, cwd, run, untrack)) {
    return { status: 2, stdout: '', stderr: 'Working tree is dirty for a new issue\n' };
  }

  runState = existingRun;
  if (!runState) {
    const branchResult = run('git', ['branch', '--show-current'], { cwd });
    const headResult = run('git', ['rev-parse', 'HEAD'], { cwd });
    const branch = commandSucceeded(branchResult) ? String(branchResult.stdout || '').trim() : '';
    const head = commandSucceeded(headResult) ? String(headResult.stdout || '').trim() : '';
    if (!branch || !head) {
      return { status: 2, stdout: '', stderr: 'Run checkpoint identity unreadable\n' };
    }
    runState = {
      schemaVersion: 1,
      projectRoot: realpathSync(cwd),
      runId: controllerRunId,
      issue: issues[0],
      branch,
      head,
      issues,
      revision: 0,
      currentIssue: issues[0],
      currentStep: 'start',
      completed: {},
      failed: null,
      startedAt: new Date().toISOString(),
    };
    try {
      persistRunState(runState, cwd);
    } catch (error) {
      return { status: 1, stdout: '', stderr: `${error.message}\n` };
    }
  } else if (!validRunIdentity(runState)) {
    if (hasRunIdentity(runState)) {
      return { status: 1, stdout: '', stderr: 'Run checkpoint identity mismatch\n' };
    }
    const branchResult = run('git', ['branch', '--show-current'], { cwd });
    const headResult = run('git', ['rev-parse', 'HEAD'], { cwd });
    const branch = commandSucceeded(branchResult) ? String(branchResult.stdout || '').trim() : '';
    const head = commandSucceeded(headResult) ? String(headResult.stdout || '').trim() : '';
    if (!branch || !head) {
      return { status: 2, stdout: '', stderr: 'Run checkpoint identity unreadable\n' };
    }
    Object.assign(runState, {
      projectRoot: realpathSync(cwd),
      runId: controllerRunId,
      issue: runState.currentIssue ?? issues[0],
      branch,
      head,
      revision: 0,
      currentIssue: runState.currentIssue ?? issues[0],
    });
    try {
      persistRunState(runState, cwd);
    } catch {
      return { status: 1, stdout: '', stderr: 'Run checkpoint identity mismatch\n' };
    }
  } else if (runState.projectRoot !== realpathSync(cwd)) {
    return { status: 1, stdout: '', stderr: 'Run checkpoint identity mismatch\n' };
  }
  runState.workers ||= {};
  try {
    if (migratePromptDeliveryStates(runState)) persistRunState(runState, cwd);
  } catch (error) {
    return {
      status: 1,
      stdout: '',
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
  const stop = (input) => stopResult({
    ...input,
    run,
    retainWorker: parsedArgs.retainWorker,
  });
  function persistPromptDelivery(worker, promptDelivery) {
    worker.promptDelivery = promptDelivery;
    worker.promptDeliveryVersion = PROMPT_DELIVERY_VERSION;
    persistRunState(runState, cwd);
  }

  function awaitPersistedPromptActivation({
    worker,
    handoffPath,
    issue,
    step,
    agentName,
    paneId,
  }) {
    if (worker.promptDelivery !== 'activating') {
      persistPromptDelivery(worker, 'activating');
    }
    const activation = awaitInitialPromptActivation(
      herdrApi, handoffPath, issue, step, agentName, paneId,
    );
    if (activation.result?.handoff || ['working', 'blocked'].includes(activation.state)) {
      persistPromptDelivery(worker, 'delivered');
    } else if (activation.result?.reasonCode === 'prompt_pending') {
      persistPromptDelivery(worker, 'pending');
    }
    return activation;
  }


  function promptForPendingWorker(worker) {
    if (worker.name === `s${worker.issue}-${worker.step}`) {
      return workerPrompt({
        step: worker.step,
        issue: worker.issue,
        cwd,
        controllerRunId: runState.runId,
      });
    }
    if (worker.name !== remAgentName(worker.issue, worker.step)) return null;
    const remediation = runState.remediation;
    if (
      remediation?.issue !== worker.issue
      || remediation.step !== worker.step
      || !remediation.closedWorker
    ) {
      return null;
    }
    return remediationPrompt({
      issue: worker.issue,
      failedStep: worker.step,
      evidence: {
        attempt: remediation.attempt,
        reasonCode: remediation.reasonCode,
        summary: remediation.summary,
        artifacts: remediation.artifacts,
        closedName: remediation.closedWorker.name,
        closedPaneId: remediation.closedWorker.paneId,
      },
      cwd,
      controllerRunId: runState.runId,
      reviewBase: null,
    });
  }

  const resumedPromptActivations = new Set();

  function recoverPendingWorkerPrompts() {
    for (const worker of Object.values(runState.workers)) {
      if (
        !['pending', 'activating'].includes(worker?.promptDelivery)
        || !issues.includes(worker.issue)
        || worker.issue !== runState.currentIssue
        || worker.step !== runState.currentStep
      ) {
        continue;
      }
      const handoffPath = join(cwd, HANDOFF_DIR, `${worker.issue}-${worker.step}.json`);
      const passedHandoff = validatedPassedWorkerHandoff(
        cwd, worker.issue, worker.step,
      );
      const checkout = matchingWorkerOwnership({
        runState,
        issue: worker.issue,
        step: worker.step,
        agentName: worker.name,
        paneId: worker.paneId,
        cwd,
        run,
        allowCompletedHeadAdvance: Boolean(passedHandoff),
      });
      if (!checkout) continue;
      if (passedHandoff) {
        Object.assign(worker, checkout, {
          promptDelivery: 'delivered',
          promptDeliveryVersion: PROMPT_DELIVERY_VERSION,
        });
        if (workerPresence(herdrApi, worker.name, worker.paneId) === 'absent') {
          delete runState.workers[worker.name];
          runState.completed[String(worker.issue)].push(worker.step);
          runState.currentStep = nextStep(runState.completed[String(worker.issue)]);
        }
        runState.failed = null;
        persistRunState(runState, cwd);
        continue;
      }
      if (worker.promptDelivery === 'activating') {
        const activation = awaitPersistedPromptActivation({
          worker,
          handoffPath,
          issue: worker.issue,
          step: worker.step,
          agentName: worker.name,
          paneId: worker.paneId,
        });
        if (activation.result && !activation.result.handoff) {
          return stop({
            issue: worker.issue,
            step: worker.step,
            paneId: worker.paneId,
            agentName: worker.name,
            reasonCode: activation.result.reasonCode,
            runState,
            cwd,
            herdr: herdrApi,
            output,
          });
        }
        resumedPromptActivations.add(worker.name);
        runState.failed = null;
        persistRunState(runState, cwd);
        continue;
      }
      if (worker.step === 'review1' || worker.step === 'review2') continue;
      let prompt;
      try {
        prompt = promptForPendingWorker(worker);
      } catch (error) {
        return stop({
          issue: worker.issue,
          step: worker.step,
          paneId: worker.paneId,
          agentName: worker.name,
          reasonCode: workerPromptFailureReason(error),
          runState,
          cwd,
          herdr: herdrApi,
          output,
        });
      }
      if (!prompt) continue;
      const delivered = deliverGeneratedPromptOnce({
        herdr: herdrApi,
        agentName: worker.name,
        paneId: worker.paneId,
        prompt,
        handoffPath,
        start: () => herdrApi.agentStart({
          name: worker.name,
          paneId: worker.paneId,
          kind: 'omp',
        }),
      });
      if (!delivered.delivered) {
        return stop({
          issue: worker.issue,
          step: worker.step,
          paneId: worker.paneId,
          agentName: worker.name,
          reasonCode: delivered.reasonCode,
          runState,
          cwd,
          herdr: herdrApi,
          output,
        });
      }
      const activation = awaitPersistedPromptActivation({
        worker,
        handoffPath,
        issue: worker.issue,
        step: worker.step,
        agentName: worker.name,
        paneId: worker.paneId,
      });
      if (activation.result && !activation.result.handoff) {
        return stop({
          issue: worker.issue,
          step: worker.step,
          paneId: worker.paneId,
          agentName: worker.name,
          reasonCode: activation.result.reasonCode,
          runState,
          cwd,
          herdr: herdrApi,
          output,
        });
      }
      runState.failed = null;
      persistRunState(runState, cwd);
    }
    return null;
  }

  const pendingPromptResult = recoverPendingWorkerPrompts();
  if (pendingPromptResult) return pendingPromptResult;


  try {
    const existingAgents = firstAgentList(herdrApi.listAgents());
    const createdPanes = new Set();

  function persistRemediationFailure({ issue, step, state, handoff, agentName, paneId }) {
    if (!isRemediableFailedHandoff({ step, state, handoff })) return false;
    const prior = runState.remediation?.issue === issue && runState.remediation?.step === step
      ? runState.remediation
      : null;
    const attempt = (prior?.attempt || 0) + 1;
    const artifacts = Array.isArray(handoff.artifacts) ? handoff.artifacts : [];
    const history = [
      ...(Array.isArray(prior?.history) ? prior.history : []),
      {
        attempt,
        reasonCode: handoff.reasonCode,
        artifacts,
        closedName: agentName,
        closedPaneId: paneId,
        at: new Date().toISOString(),
      },
    ];
    runState.failed = { issue, step, reasonCode: handoff.reasonCode };
    runState.remediation = {
      issue,
      step,
      attempt,
      status: 'active',
      reasonCode: handoff.reasonCode,
      summary: handoff.summary,
      artifacts,
      closedWorker: { name: agentName, paneId },
      remWorker: null,
      history,
    };
    persistRunState(runState, cwd);
    return true;
  }

  function remediationEvidence() {
    const remediation = runState.remediation;
    return {
      attempt: remediation.attempt,
      reasonCode: remediation.reasonCode,
      summary: remediation.summary,
      artifacts: remediation.artifacts,
      closedName: remediation.closedWorker.name,
      closedPaneId: remediation.closedWorker.paneId,
    };
  }

  function runRemediationLoop({ issue, step, liveAgent = null }) {
    let remLive = liveAgent;
    const handoffPath = join(cwd, HANDOFF_DIR, `${issue}-${step}.json`);
    while (true) {
      const agentName = remAgentName(issue, step);
      let paneId = remLive?.pane_id ?? remLive?.paneId;
      let state;
      let prompt;
      const reviewStep = step === 'review1' || step === 'review2';
      const reviewBase = reviewStep ? resolveReviewBase(cwd, run) : null;
      let reviewHandoffResult = null;
      let freshHandoffResult = null;
      if (reviewStep && !reviewBase) {
        return stop({
          issue, step, paneId: paneId ?? 'none', agentName, reasonCode: 'review_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      try {
        prompt = remediationPrompt({
          issue,
          failedStep: step,
          evidence: remediationEvidence(),
          cwd,
          controllerRunId: runState.runId,
          reviewBase,
        });
      } catch (error) {
        return stop({
          issue, step, paneId: 'none', agentName, reasonCode: workerPromptFailureReason(error),
          runState, cwd, herdr: herdrApi, output,
        });
      }

      if (remLive) {
        paneId ??= 'unknown';
        if (paneId === 'unknown') {
          return stop({
            issue, step, paneId, agentName, reasonCode: 'unknown_pane',
            runState, cwd, herdr: herdrApi, output,
          });
        }
        state = agentState(herdrApi.agentGet(agentName));
        if (!reviewStep && !['idle', 'done'].includes(state)) {
          const settled = state === 'working'
            ? commandSucceeded(herdrApi.agentWait({ name: agentName }))
            : waitForWorkerSettlement(herdrApi, agentName);
          if (!settled) {
            return stop({
              issue, step, paneId, agentName, reasonCode: 'worker_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          state = agentState(herdrApi.agentGet(agentName));
        }
      } else {
        const layout = herdrApi.paneLayout(env.HERDR_PANE_ID);
        const { width, height } = paneDimensions(layout);
        const direction = width !== null && height !== null && width >= height ? 'right' : 'down';
        const environment = verifyPaneEnvironment(step, env);
        const split = herdrApi.paneSplit({
          direction,
          cwd,
          ...(environment ? { environment } : {}),
        });
        paneId = splitPaneId(split);
        if (!paneId || !commandSucceeded(split)) {
          return stop({
            issue, step, paneId: paneId || 'unknown', agentName, reasonCode: 'pane_split_failed',
            runState, cwd, herdr: herdrApi, output,
          });
        }
        createdPanes.add(paneId);
        rmSync(handoffPath, { force: true });
        const ownership = workerOwnership({
          runState, issue, step, agentName, paneId, cwd, run,
        });
        if (!ownership) {
          const closed = closePane(herdrApi, paneId);
          if (closed) createdPanes.delete(paneId);
          return stop({
            issue,
            step,
            paneId,
            agentName,
            reasonCode: closed ? 'retained_worker_mismatch' : 'pane_close_failed',
            runState,
            cwd,
            herdr: herdrApi,
            output,
          });
        }
        Object.assign(ownership, {
          promptDelivery: 'pending',
          promptDeliveryVersion: PROMPT_DELIVERY_VERSION,
        });

        runState.workers[agentName] = ownership;
        runState.remediation.remWorker = { name: agentName, paneId };
        persistRunState(runState, cwd);
        let started = herdrApi.agentStart({ name: agentName, paneId, kind: 'omp' });
        if (!commandSucceeded(started)) {
          waitForAgentStartRetry();
          started = herdrApi.agentStart({ name: agentName, paneId, kind: 'omp' });
        }
        if (!commandSucceeded(started)) {
          delete runState.workers[agentName];
          runState.remediation.remWorker = null;
          return stop({
            issue, step, paneId, agentName, reasonCode: 'agent_start_failed',
            runState, cwd, herdr: herdrApi, output,
          });
        }

        if (reviewStep) {
          reviewHandoffResult = submitReviewProtocol({
            herdr: herdrApi,
            agentName,
            paneId,
            prompt,
            handoffPath,
            issue,
            step,
            cwd,
            activatePrompt: () => awaitPersistedPromptActivation({
              worker: runState.workers[agentName],
              handoffPath,
              issue,
              step,
              agentName,
              paneId,
            }),
          });
          if (reviewHandoffResult.handoff) state = 'done';
        } else {
          const delivered = deliverGeneratedPromptOnce({
            herdr: herdrApi,
            agentName,
            paneId,
            prompt,
            handoffPath,
            start: () => herdrApi.agentStart({ name: agentName, paneId, kind: 'omp' }),
          });
          if (!delivered.delivered) {
            return stop({
              issue, step, paneId, agentName, reasonCode: delivered.reasonCode,
              runState, cwd, herdr: herdrApi, output,
            });
          }
          const activation = awaitPersistedPromptActivation({
            worker: runState.workers[agentName],
            handoffPath,
            issue,
            step,
            agentName,
            paneId,
          });
          if (activation.result) {
            if (!activation.result.handoff) {
              return stop({
                issue, step, paneId, agentName, reasonCode: activation.result.reasonCode,
                runState, cwd, herdr: herdrApi, output,
              });
            }
            freshHandoffResult = activation.result;
            state = 'done';
          } else {
            state = activation.state;
          }
        }
      }

      if (
        remLive
        && !reviewStep
        && !existsSync(handoffPath)
        && ['idle', 'done'].includes(state)
      ) {
        if (hasPastedWorkerPrompt(herdrApi, agentName, prompt)) {
          if (!retryPromptSubmission(herdrApi, agentName)) {
            return stop({
              issue, step, paneId, agentName, reasonCode: 'worker_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          state = agentState(herdrApi.agentGet(agentName));
        } else if (appearsWorking(herdrApi, agentName)) {
          if (!waitForWorkerSettlement(herdrApi, agentName)) {
            return stop({
              issue, step, paneId, agentName, reasonCode: 'worker_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          state = agentState(herdrApi.agentGet(agentName));
        }
      }
      if (!reviewStep && !existsSync(handoffPath) && state === 'working') {
        herdrApi.agentWait({ name: agentName });
        state = agentState(herdrApi.agentGet(agentName));
      }

      if (reviewStep && remLive && !existsSync(handoffPath)) {
        reviewHandoffResult = submitReviewProtocol({
          herdr: herdrApi,
          agentName,
          paneId,
          prompt,
          handoffPath,
          issue,
          step,
          cwd,
        });
        if (reviewHandoffResult.handoff) state = 'done';
      }
      const handoffResult = reviewStep
        ? reviewHandoffResult || observeReviewHandoff(
          herdrApi, handoffPath, issue, step, agentName, paneId, cwd,
        )
        : freshHandoffResult
          || observeExpectedHandoff(herdrApi, handoffPath, issue, step, agentName);
      if (!handoffResult.handoff) {
        return stop({
          issue, step, paneId, agentName, reasonCode: handoffResult.reasonCode,
          runState, cwd, herdr: herdrApi, output,
        });
      }
      const { handoff } = handoffResult;
      if (isRemediableFailedHandoff({ step, state, handoff })) {
        persistRemediationFailure({ issue, step, state, handoff, agentName, paneId });
        if (!closePane(herdrApi, paneId)) {
          return stop({
            issue, step, paneId, agentName, reasonCode: 'pane_close_failed',
            runState, cwd, herdr: herdrApi, output,
          });
        }
        delete runState.workers[agentName];
        remLive = null;
        continue;
      }
      if (!['idle', 'done'].includes(state) || handoff.status !== 'passed' || handoff.intervention) {
        runState.remediation.reasonCode = handoff.reasonCode || handoff.status || state || 'worker_failed';
        runState.remediation.summary = handoff.summary;
        runState.remediation.artifacts = Array.isArray(handoff.artifacts) ? handoff.artifacts : [];
        if (
          ['idle', 'done'].includes(state)
          && (handoff.status === 'blocked' || handoff.intervention)
        ) {
          runState.remediation.status = 'stopped';
        }
        return stop({
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
        return stop({
          issue, step, paneId, agentName, reasonCode: 'pane_close_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      delete runState.workers[agentName];
      runState.completed[String(issue)].push(step);
      runState.currentStep = nextStep(runState.completed[String(issue)]);
      runState.failed = null;
      runState.remediation = null;
      persistRunState(runState, cwd);
      return { passed: true, step: runState.currentStep };
    }
  }

  function beginRemediation({ issue, step, state, handoff, agentName, paneId }) {
    if (!persistRemediationFailure({ issue, step, state, handoff, agentName, paneId })) {
      return { passed: false };
    }
    if (!closePane(herdrApi, paneId)) {
      return {
        result: stop({
          issue, step, paneId, agentName, reasonCode: 'pane_close_failed',
          runState, cwd, herdr: herdrApi, output,
        }),
      };
    }
    delete runState.workers[agentName];
    return runRemediationLoop({ issue, step });
  }

  for (let issueIndex = 0; issueIndex < issues.length; issueIndex += 1) {
    const issue = issues[issueIndex];
    const issueAgents = existingAgents.filter(
      (agent) => String(agent?.name || '').startsWith(`s${issue}-`),
    );
    if (issueAgents.length === 0) {
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
    let live = step
      ? issueAgents.find((agent) => String(agent?.name || '') === `s${issue}-${step}`)
      : null;
    if (
      step
      && !live
      && runState.failed?.issue === issue
      && runState.failed.step === step
    ) {
      const failedHandoff = readExpectedHandoff(
        join(cwd, HANDOFF_DIR, `${issue}-${step}.json`),
        issue,
        step,
      ).handoff;
      const completed = failedHandoff
        ? remediationCompletedSteps({
          issue,
          step,
          completed: runState.completed[String(issue)],
          handoff: failedHandoff,
        })
        : null;
      if (completed) {
        runState.completed[String(issue)] = completed;
        step = nextStep(completed);
        runState.currentStep = step;
        runState.failed = null;
        persistRunState(runState, cwd);
        live = step
          ? issueAgents.find((agent) => String(agent?.name || '') === `s${issue}-${step}`)
          : null;
      }
    }
    if (step === 'deliver') {
      const deliverHandoffPath = join(cwd, HANDOFF_DIR, `${issue}-deliver.json`);
      const deliverHandoff = readExpectedHandoff(deliverHandoffPath, issue, 'deliver').handoff;
      if (deliverHandoff?.status === 'passed' && !deliverHandoff.intervention) {
        if (!syncAndDeleteIssueBranch(issue, cwd, run)) {
          runState.failed = { issue, step: 'deliver', reasonCode: 'delivery_not_complete' };
          persistRunState(runState, cwd);
          return {
            status: 1,
            stdout: `${output.join('\n')}${output.length ? '\n' : ''}`,
            stderr: 'Delivery is not MERGED and CLOSED\n',
          };
        }
        runState.completed[String(issue)].push('deliver');
        runState.currentStep = null;
        runState.failed = null;
        runState.remediation = null;
        persistRunState(runState, cwd);
        continue;
      }
    }
    if (step && step !== 'start') {
      const reasonCode = restoreActiveIssueBranch(issue, cwd, run);
      if (reasonCode) {
        return stop({
          issue,
          step,
          paneId: 'none',
          agentName: live ? String(live.name) : `s${issue}-${step}`,
          reasonCode,
          runState,
          cwd,
          herdr: herdrApi,
          output,
        });
      }
    }
    if (step && !live && issueAgents.length > 0) {
      const collision = issueAgents[0];
      return stop({
        issue,
        step,
        paneId: collision.pane_id ?? collision.paneId ?? 'unknown',
        agentName: String(collision.name),
        reasonCode: 'retained_worker_mismatch',
        runState,
        cwd,
        herdr: herdrApi,
        output,
      });
    }
    if (live) {
      const agentName = String(live.name);
      const paneId = live.pane_id ?? live.paneId ?? 'unknown';
      const passedHandoff = validatedPassedWorkerHandoff(cwd, issue, step);
      const checkout = matchingWorkerOwnership({
        runState,
        issue,
        step,
        agentName,
        paneId,
        cwd,
        run,
        allowCompletedHeadAdvance: Boolean(passedHandoff),
      });
      if (!checkout) {
        return stop({
          issue, step, paneId, agentName, reasonCode: 'retained_worker_mismatch',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      if (passedHandoff) Object.assign(runState.workers[agentName], checkout);
    }

    const liveRem = step
      ? existingAgents.find((agent) => String(agent?.name || '') === remAgentName(issue, step))
      : null;
    const activeRemediation = runState.remediation?.status === 'active'
      && runState.remediation.issue === issue
      && runState.remediation.step === step;
    const stoppedRemediation = runState.remediation?.status === 'stopped'
      && runState.remediation.issue === issue
      && runState.remediation.step === step;
    if (step && stoppedRemediation && !liveRem) {
      const handoffPath = join(cwd, HANDOFF_DIR, `${issue}-${step}.json`);
      const handoffResult = readExpectedHandoff(handoffPath, issue, step);
      if (!handoffResult.handoff) {
        return stop({
          issue, step, paneId: 'none', agentName: remAgentName(issue, step),
          reasonCode: handoffResult.reasonCode,
          runState, cwd, herdr: herdrApi, output,
        });
      }
      const { handoff } = handoffResult;
      const rewindHandoff = handoff.status === 'blocked' && !handoff.intervention
        ? { ...handoff, status: 'failed' }
        : handoff;
      const completed = remediationCompletedSteps({
        issue,
        step,
        completed: runState.completed[String(issue)],
        handoff: rewindHandoff,
      });
      if (!completed) {
        return stop({
          issue, step, paneId: 'none', agentName: remAgentName(issue, step), reasonCode: 'invalid_handoff',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      runState.completed[String(issue)] = completed;
      step = nextStep(completed);
      runState.currentStep = step;
      runState.failed = null;
      runState.remediation = null;
      persistRunState(runState, cwd);
      live = null;
    }
    if (step && (liveRem || activeRemediation)) {
      const remResult = runRemediationLoop({ issue, step, liveAgent: liveRem });
      if (remResult.result) return remResult.result;
      if (Number.isInteger(remResult.status)) return remResult;
      if (!remResult.passed) {
        return stop({
          issue, step, paneId: 'none', agentName: remAgentName(issue, step), reasonCode: 'worker_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      step = remResult.step;
      live = null;
    }
    if (live) {
      const agentName = String(live.name);
      const paneId = live.pane_id ?? live.paneId ?? 'unknown';
      let state = agentState(herdrApi.agentGet(agentName));
      const handoffPath = join(cwd, HANDOFF_DIR, `${issue}-${step}.json`);
      const reviewStep = step === 'review1' || step === 'review2';
      let retainedReviewResult = null;
      if (!step || agentName !== `s${issue}-${step}`) {
        return stop({
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
        return stop({
          issue, step, paneId, agentName, reasonCode: 'unknown_pane',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      if (!reviewStep && !['idle', 'done'].includes(state)) {
        state = agentState(herdrApi.agentGet(agentName));
        if (!['idle', 'done'].includes(state)) {
          const settled = state === 'working'
            ? commandSucceeded(herdrApi.agentWait({ name: agentName }))
            : waitForWorkerSettlement(herdrApi, agentName);
          if (!settled) {
            return stop({
              issue, step, paneId, agentName, reasonCode: 'worker_failed',
              runState, cwd, herdr: herdrApi, output,
            });
          }
          state = agentState(herdrApi.agentGet(agentName));
        }
      }
      if (
        step
        && agentName === `s${issue}-${step}`
        && (reviewStep || ['idle', 'done'].includes(state))
        && paneId !== 'unknown'
      ) {
        if (!fs.existsSync(handoffPath) && reviewStep && !resumedPromptActivations.has(agentName)) {
          const retainedReviewBase = resolveReviewBase(cwd, run);
          let prompt;
          try {
            prompt = reviewProtocolPrompt(
              retainedReviewBase,
              workerPrompt({ step, issue, cwd, controllerRunId: runState.runId }),
            );
          } catch (error) {
            return stop({
              issue,
              step,
              paneId,
              agentName,
              reasonCode: error.message === 'review_base_missing'
                ? 'review_failed'
                : workerPromptFailureReason(error),
              runState,
              cwd,
              herdr: herdrApi,
              output,
            });
          }
          retainedReviewResult = submitReviewProtocol({
            herdr: herdrApi,
            agentName,
            paneId,
            prompt,
            handoffPath,
            issue,
            step,
            cwd,
            activatePrompt: () => awaitPersistedPromptActivation({
              worker: runState.workers[agentName],
              handoffPath,
              issue,
              step,
              agentName,
              paneId,
            }),
          });
          if (retainedReviewResult.handoff) state = 'done';
        }
        if (!reviewStep && !fs.existsSync(handoffPath)) {
          let prompt;
          try {
            prompt = workerPrompt({ step, issue, cwd, controllerRunId: runState.runId });
          } catch (error) {
            return stop({
              issue, step, paneId, agentName, reasonCode: workerPromptFailureReason(error),
              runState, cwd, herdr: herdrApi, output,
            });
          }
          if (hasPastedWorkerPrompt(herdrApi, agentName, prompt)) {
            if (!retryPromptSubmission(herdrApi, agentName)) {
              return stop({
                issue, step, paneId, agentName, reasonCode: 'worker_failed',
                runState, cwd, herdr: herdrApi, output,
              });
            }
            state = agentState(herdrApi.agentGet(agentName));
          } else if (appearsWorking(herdrApi, agentName)) {
            if (!waitForWorkerSettlement(herdrApi, agentName)) {
              return stop({
                issue, step, paneId, agentName, reasonCode: 'worker_failed',
                runState, cwd, herdr: herdrApi, output,
              });
            }
            state = agentState(herdrApi.agentGet(agentName));
          }
        }
        const handoffResult = reviewStep
          ? retainedReviewResult || observeReviewHandoff(
            herdrApi, handoffPath, issue, step, agentName, paneId, cwd,
          )
          : observeExpectedHandoff(herdrApi, handoffPath, issue, step, agentName);
        if (reviewStep && handoffResult.handoff) state = 'done';
        if (!handoffResult.handoff) {
          return stop({
            issue, step, paneId, agentName, reasonCode: handoffResult.reasonCode,
            runState, cwd, herdr: herdrApi, output,
          });
        }
        const { handoff } = handoffResult;
        if (isRemediableFailedHandoff({ step, state, handoff })) {
          const remResult = beginRemediation({ issue, step, state, handoff, agentName, paneId });
          if (remResult.result) return remResult.result;
          if (Number.isInteger(remResult.status)) return remResult;
          step = remResult.step;
        } else {
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
              return stop({
                issue, step, paneId, agentName, reasonCode: state || 'worker_failed',
                runState, cwd, herdr: herdrApi, output,
              });
            }
            if (!closePane(herdrApi, paneId)) {
              return stop({
                issue, step, paneId, agentName, reasonCode: 'pane_close_failed',
                runState, cwd, herdr: herdrApi, output,
              });
            }
            delete runState.workers[agentName];
            runState.completed[String(issue)] = remediation;
            step = nextStep(remediation);
            runState.currentStep = step;
            runState.failed = null;
            persistRunState(runState, cwd);
          } else {
            if (!['idle', 'done'].includes(state) || handoff.status !== 'passed' || handoff.intervention) {
              return stop({
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
              return stop({
                issue, step, paneId, agentName, reasonCode: 'pane_close_failed',
                runState, cwd, herdr: herdrApi, output,
              });
            }
            delete runState.workers[agentName];
            runState.completed[String(issue)].push(step);
            step = nextStep(runState.completed[String(issue)]);
            runState.currentStep = step;
            runState.failed = null;
            persistRunState(runState, cwd);
          }
        }
      } else {
        return stop({
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
      persistRunState(runState, cwd);

      let reviewBase = null;
      if (step === 'review1' || step === 'review2') {
        reviewBase = resolveReviewBase(cwd, run);
        if (!reviewBase) {
          return stop({
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
          || currentBranch === reviewBase
        ) {
          return stop({
            issue, step, paneId: 'none', agentName: `s${issue}-${step}`, reasonCode: 'review_branch_mismatch',
            runState, cwd, herdr: herdrApi, output,
          });
        }
      }

      const layout = herdrApi.paneLayout(env.HERDR_PANE_ID);
      const { width, height } = paneDimensions(layout);
      const direction = width !== null && height !== null && width >= height ? 'right' : 'down';
      const environment = verifyPaneEnvironment(step, env);
      const split = herdrApi.paneSplit({
        direction,
        cwd,
        ...(environment ? { environment } : {}),
      });
      const paneId = splitPaneId(split);
      const agentName = `s${issue}-${step}`;
      const handoffPath = join(cwd, HANDOFF_DIR, `${issue}-${step}.json`);
      if (!paneId || !commandSucceeded(split)) {
        return stop({
          issue, step, paneId: paneId || 'unknown', agentName, reasonCode: 'pane_split_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      createdPanes.add(paneId);
      rmSync(handoffPath, { force: true });

      const ownership = workerOwnership({
        runState, issue, step, agentName, paneId, cwd, run,
      });
      if (!ownership) {
        const closed = closePane(herdrApi, paneId);
        if (closed) createdPanes.delete(paneId);
        return stop({
          issue,
          step,
          paneId,
          agentName,
          reasonCode: closed ? 'retained_worker_mismatch' : 'pane_close_failed',
          runState,
          cwd,
          herdr: herdrApi,
          output,
        });
      }

      const reviewStep = step === 'review1' || step === 'review2';
      let prompt;
      try {
        const stepPrompt = workerPrompt({
          step, issue, cwd, controllerRunId: runState.runId,
        });
        prompt = reviewStep ? reviewProtocolPrompt(reviewBase, stepPrompt) : stepPrompt;
      } catch (error) {
        const reasonCode = workerPromptFailureReason(error);
        const closed = closePane(herdrApi, paneId);
        if (closed) createdPanes.delete(paneId);
        return stop({
          issue,
          step,
          paneId,
          agentName,
          reasonCode: closed ? reasonCode : 'pane_close_failed',
          runState,
          cwd,
          herdr: herdrApi,
          output,
        });
      }
      Object.assign(ownership, {
        promptDelivery: 'pending',
        promptDeliveryVersion: PROMPT_DELIVERY_VERSION,
      });

      runState.workers[agentName] = ownership;
      persistRunState(runState, cwd);
      let started = herdrApi.agentStart({ name: agentName, paneId, kind: 'omp' });
      if (!commandSucceeded(started)) {
        waitForAgentStartRetry();
        started = herdrApi.agentStart({ name: agentName, paneId, kind: 'omp' });
      }
      if (!commandSucceeded(started)) {
        delete runState.workers[agentName];
        return stop({
          issue, step, paneId, agentName, reasonCode: 'agent_start_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }

      let state = null;
      let handoffResult;
      if (reviewStep) {
        state = agentState(herdrApi.agentGet(agentName));
        handoffResult = submitReviewProtocol({
          herdr: herdrApi,
          agentName,
          paneId,
          prompt,
          handoffPath,
          issue,
          step,
          cwd,
          activatePrompt: () => awaitPersistedPromptActivation({
            worker: runState.workers[agentName],
            handoffPath,
            issue,
            step,
            agentName,
            paneId,
          }),
        });
        if (handoffResult.handoff) state = 'done';
      } else {
        const delivered = deliverGeneratedPromptOnce({
          herdr: herdrApi,
          agentName,
          paneId,
          prompt,
          handoffPath,
          start: () => herdrApi.agentStart({ name: agentName, paneId, kind: 'omp' }),
        });
        if (!delivered.delivered) {
          return stop({
            issue, step, paneId, agentName, reasonCode: delivered.reasonCode,
            runState, cwd, herdr: herdrApi, output,
          });
        }
        const activation = awaitPersistedPromptActivation({
          worker: runState.workers[agentName],
          handoffPath,
          issue,
          step,
          agentName,
          paneId,
        });
        if (activation.result) {
          if (!activation.result.handoff) {
            return stop({
              issue, step, paneId, agentName, reasonCode: activation.result.reasonCode,
              runState, cwd, herdr: herdrApi, output,
            });
          }
          state = 'done';
          handoffResult = activation.result;
        } else {
          state = activation.state;
          if (state === 'working') {
            herdrApi.agentWait({ name: agentName });
            state = agentState(herdrApi.agentGet(agentName));
          }
          runState = latestMatchingRunState(runState, cwd);
          handoffResult = observeExpectedHandoff(
            herdrApi, handoffPath, issue, step, agentName,
          );
        }
      }
      if (!handoffResult.handoff) {
        return stop({
          issue, step, paneId, agentName, reasonCode: handoffResult.reasonCode,
          runState, cwd, herdr: herdrApi, output,
        });
      }
      const { handoff } = handoffResult;
      if (isRemediableFailedHandoff({ step, state, handoff })) {
        const remResult = beginRemediation({ issue, step, state, handoff, agentName, paneId });
        if (remResult.result) return remResult.result;
        if (Number.isInteger(remResult.status)) return remResult;
        step = remResult.step;
        continue;
      }
      if (!['idle', 'done'].includes(state) || handoff.status !== 'passed' || handoff.intervention) {
        return stop({
          issue, step, paneId, agentName, reasonCode: handoff.reasonCode || handoff.status || state || 'worker_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }

      if (createdPanes.has(paneId) && !closePane(herdrApi, paneId)) {
        return stop({
          issue, step, paneId, agentName, reasonCode: 'pane_close_failed',
          runState, cwd, herdr: herdrApi, output,
        });
      }
      delete runState.workers[agentName];
      runState.completed[String(issue)].push(step);
      step = nextStep(runState.completed[String(issue)]);
      runState.currentStep = step;
      persistRunState(runState, cwd);
    }

    if (!syncAndDeleteIssueBranch(issue, cwd, run)) {
      runState.failed = { issue, step: 'deliver', reasonCode: 'delivery_not_complete' };
      persistRunState(runState, cwd);
      return { status: 1, stdout: `${output.join('\n')}${output.length ? '\n' : ''}`, stderr: 'Delivery is not MERGED and CLOSED\n' };
    }
  }

  runState.currentIssue = null;
  runState.currentStep = null;
  runState.failed = null;
  runState.remediation = null;
  cleanupCompletedRun(runState, cwd);
  return { status: 0, stdout: `${output.join('\n')}${output.length ? '\n' : ''}`, stderr: '' };
  } catch (error) {
    if (runState?.workers && validRunIdentity(runState)) {
      let changed = false;
      for (const [name, worker] of Object.entries(runState.workers)) {
        if (
          worker?.name !== name
          || worker.projectRoot !== runState.projectRoot
          || worker.runId !== runState.runId
        ) {
          continue;
        }
        if (parsedArgs.retainWorker || ['pending', 'activating'].includes(worker.promptDelivery)) {
          const checkout = currentCheckout(cwd, run);
          if (
            checkout
            && (worker.branch !== checkout.branch || worker.head !== checkout.head)
          ) {
            Object.assign(worker, checkout);
            changed = true;
          }
          if (worker.promptDelivery === 'pending' && !runState.failed) {
            runState.failed = {
              issue: worker.issue,
              step: worker.step,
              reasonCode: 'prompt_pending',
              intervention: true,
            };
            changed = true;
          }
        } else if (closePane(herdrApi, worker.paneId)) {
          delete runState.workers[name];
          changed = true;
        }
      }
      if (changed) {
        try {
          persistRunState(runState, cwd);
        } catch {
          // Error cleanup remains fail-closed with any unclosed records intact.
        }
      }
    }
    return {
      status: 1,
      stdout: `${output.join('\n')}${output.length ? '\n' : ''}`,
      stderr: `${error?.message || error?.error?.code || 'controller_failed'}\n`,
    };
  }
  } finally {
    for (const [signal, handler] of signalHandlers) processApi.removeListener(signal, handler);
    if (releaseLeaseInFinally) releaseControllerLease(controllerLease);
  }
}

function runCli(argv = process.argv.slice(2)) {
  const [sub, ...rest] = argv;
  if (!sub) {
    console.error('sdlc-execute: missing subcommand');
    process.exit(2);
  }
  if (sub === 'run') {
    const result = runExecute({ args: rest.join(' '), installSignalHandlers: true });
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
    const revisionIndex = rest.indexOf('--expected-revision');
    const expectedRevision = revisionIndex >= 0 ? Number(rest[revisionIndex + 1]) : NaN;
    const input = revisionIndex >= 0
      ? rest.filter((_value, index) => index !== revisionIndex && index !== revisionIndex + 1).join(' ')
      : '';
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !input) {
      console.error('Usage: node sdlc-execute.mjs write-run --expected-revision N <json>');
      process.exit(2);
    }
    try {
      const data = JSON.parse(input);
      writeRun(data, process.cwd(), expectedRevision);
      process.exit(0);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }
  if (sub === 'worker-prompt') {
    const stepIndex = rest.indexOf('--step');
    const issueIndex = rest.indexOf('--issue');
    const failedStepIndex = rest.indexOf('--failed-step');
    const step = stepIndex >= 0 ? rest[stepIndex + 1] : '';
    const failedStep = failedStepIndex >= 0 ? rest[failedStepIndex + 1] : '';
    const issueRaw = issueIndex >= 0 ? rest[issueIndex + 1] : '';
    const issue = Number.parseInt(issueRaw, 10);
    if (step === 'rem') {
      if (!REMEDIABLE_STEPS.includes(failedStep) || !Number.isInteger(issue) || issue <= 0) {
        console.error('Usage: node sdlc-execute.mjs worker-prompt --step rem --issue N --failed-step <implement|review1|fix1|review2|fix2|verify|deliver>');
        process.exit(2);
      }
      try {
        const reviewStep = failedStep === 'review1' || failedStep === 'review2';
        const reviewBase = reviewStep ? resolveReviewBase(process.cwd(), defaultRun) : null;
        process.stdout.write(`${remediationPrompt({
          issue,
          failedStep,
          cwd: process.cwd(),
          reviewBase,
        })}\n`);
        process.exit(0);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(2);
      }
    }
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
