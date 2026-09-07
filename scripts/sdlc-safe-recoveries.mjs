#!/usr/bin/env node

/**
 * nmg-sdlc safe recoveries for #374.
 * Durable one-use owners and class records for bounded automatic recovery.
 * CAS protected like run.json; no run.json creation or modification.
 * Standalone reuses owner across fresh leases/sessions; one consume per class+owner+issue+step.
 */

import { spawnSync } from 'node:child_process';
import { isCliEntry } from './plugin-controller-path.mjs';
import { enterControllerLease, releaseControllerLease } from './sdlc-controller-lease.mjs';
import { inspectIssueSpecScope } from './issue-spec-scope.mjs';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  lstatSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';

const HANDOFF_DIR = join('.omp', 'sdlc', 'handoffs');
const REVIEWS_DIR = join('.omp', 'sdlc', 'reviews');

const VALID_STEPS = ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify', 'deliver'];
const SESSION_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function commandSucceeded(result) {
  return result && !result.error && result.status === 0;
}

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function safeError(reasonCode) {
  const error = new Error(reasonCode);
  error.reasonCode = reasonCode;
  return error;
}

function validSafeState(data) {
  return !!data
    && data.schemaVersion === 1
    && Number.isSafeInteger(data.revision) && data.revision >= 0
    && Array.isArray(data.owners)
    && Array.isArray(data.records);
}

function validOwner(o) {
  return o
    && typeof o.ownerId === 'string' && o.ownerId.length > 0
    && typeof o.projectRoot === 'string' && o.projectRoot.length > 0
    && Number.isSafeInteger(o.issue) && o.issue > 0
    && typeof o.branch === 'string' && o.branch.length > 0
    && typeof o.step === 'string' && o.step.length > 0
    && o.status === 'incomplete';
}

function validRecord(r) {
  return r
    && typeof r.class === 'string' && r.class.length > 0
    && typeof r.runId === 'string' && r.runId.length > 0
    && Number.isSafeInteger(r.issue) && r.issue > 0
    && typeof r.step === 'string' && r.step.length > 0
    && typeof r.invocationId === 'string' && r.invocationId.length > 0
    && typeof r.consumedAt === 'string' && r.consumedAt.length > 0
    && r.disposition === 'consumed'
    && r.evidence && typeof r.evidence === 'object' && !Array.isArray(r.evidence);
}

function porcelainPaths(output) {
  const text = String(output ?? '');
  if (!text) return [];
  if (!text.endsWith('\0')) throw safeError('publication_state_unreadable');
  const entries = text.slice(0, -1).split('\0');
  const paths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const record = entries[index];
    if (!/^(?:[ MADRCUT]{2}|\?\?|!!) /.test(record) || record.startsWith('   ')) {
      throw safeError('publication_state_unreadable');
    }
    const status = record.slice(0, 2);
    const p = record.slice(3);
    if (!p || isAbsolute(p) || p.split('/').includes('..')) throw safeError('publication_state_unreadable');
    if (p !== '.omp' && !p.startsWith('.omp/')) paths.push(p);
    if (status.includes('R') || status.includes('C')) {
      const source = entries[++index];
      if (!source || isAbsolute(source) || source.split('/').includes('..')) throw safeError('publication_state_unreadable');
      if (source !== '.omp' && !source.startsWith('.omp/')) paths.push(source);
    }
  }
  return paths;
}
function lstatIfPresent(target) {
  try {
    return lstatSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw safeError('recovery_state_unreadable');
  }
}

function safeStorageDirectory(root, create = false) {
  const canonicalRoot = realpathSync(root);
  let current = canonicalRoot;
  for (const segment of ['.omp', 'sdlc']) {
    current = join(current, segment);
    const stat = lstatIfPresent(current);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw safeError('unsafe_safe_recoveries_path');
      }
    } else if (create) {
      try {
        mkdirSync(current);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        const raced = lstatIfPresent(current);
        if (!raced || raced.isSymbolicLink() || !raced.isDirectory()) {
          throw safeError('unsafe_safe_recoveries_path');
        }
      }
    } else {
      return null;
    }
  }
  return current;
}

function validateSafeRows(data) {
  const seenOwners = new Set();
  for (const owner of data.owners) {
    if (!validOwner(owner)) throw safeError('invalid_safe_recoveries');
    const key = `${owner.ownerId}\0${owner.projectRoot}\0${owner.issue}\0${owner.branch}\0${owner.step}`;
    if (seenOwners.has(key)) throw safeError('invalid_safe_recoveries');
    seenOwners.add(key);
  }
  const seenRecords = new Set();
  for (const record of data.records) {
    if (!validRecord(record)) throw safeError('invalid_safe_recoveries');
    const key = `${record.class}\0${record.runId}\0${record.issue}\0${record.step}`;
    if (seenRecords.has(key)) throw safeError('invalid_safe_recoveries');
    seenRecords.add(key);
  }
  return data;
}

function readSafeRecoveries(root = process.cwd()) {
  const canonicalRoot = realpathSync(root);
  const d = safeStorageDirectory(canonicalRoot, false);
  if (!d) return null;
  const p = join(d, 'safe-recoveries.json');
  const st = lstatIfPresent(p);
  if (!st) return null;
  if (st.isSymbolicLink() || !st.isFile()) throw safeError('unsafe_safe_recoveries_path');
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    if (!validSafeState(data)) throw safeError('invalid_safe_recoveries');
    return validateSafeRows(data);
  } catch (error) {
    if (error?.reasonCode) throw error;
    throw safeError('invalid_safe_recoveries');
  }
}

function writeSafeRecoveriesAt(safeData, root = process.cwd(), expectedRevision = 0) {
  if (
    !safeData
    || safeData.schemaVersion !== 1
    || !Number.isSafeInteger(expectedRevision)
    || expectedRevision < 0
    || !Number.isSafeInteger(safeData.revision)
    || safeData.revision !== expectedRevision + 1
    || !Array.isArray(safeData.owners)
    || !Array.isArray(safeData.records)
  ) {
    throw safeError('invalid_safe_recoveries');
  }
  validateSafeRows(safeData);

  const canonicalRoot = realpathSync(root);
  const d = safeStorageDirectory(canonicalRoot, true);
  const p = join(d, 'safe-recoveries.json');
  const lockPath = `${p}.lock`;
  const temporaryPath = `${p}.tmp`;

  const assertPathSafe = (target, { file = false } = {}) => {
    const stat = lstatIfPresent(target);
    if (!stat) return;
    if (stat.isSymbolicLink() || (file && !stat.isFile())) {
      throw safeError('unsafe_safe_recoveries_path');
    }
  };
  assertPathSafe(p, { file: true });
  assertPathSafe(lockPath);
  assertPathSafe(temporaryPath);

  let lock;
  let temporaryFd;
  let temporaryCreated = false;
  let renamed = false;
  try {
    try {
      lock = openSync(lockPath, 'wx', 0o600);
    } catch (error) {
      if (error?.code === 'EEXIST') throw safeError('safe_recoveries_locked');
      throw error;
    }
    assertPathSafe(lockPath);

    const current = lstatIfPresent(p);
    if (current) {
      assertPathSafe(p, { file: true });
      let existing;
      try {
        existing = JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        throw safeError('identity_mismatch');
      }
      if (!validSafeState(existing)) throw safeError('invalid_safe_recoveries');
      validateSafeRows(existing);
      if (existing.revision !== expectedRevision) throw safeError('stale_revision');
    } else if (expectedRevision !== 0) {
      throw safeError('stale_revision');
    }

    try {
      temporaryFd = openSync(temporaryPath, 'wx', 0o600);
      temporaryCreated = true;
    } catch (error) {
      if (error?.code === 'EEXIST') throw safeError('safe_recoveries_locked');
      throw error;
    }
    writeFileSync(temporaryFd, `${JSON.stringify(safeData, null, 2)}\n`);
    closeSync(temporaryFd);
    temporaryFd = undefined;
    assertPathSafe(temporaryPath, { file: true });
    assertPathSafe(p, { file: true });
    renameSync(temporaryPath, p);
    renamed = true;
  } finally {
    if (temporaryFd !== undefined) {
      try {
        closeSync(temporaryFd);
      } catch {
        // preserve the original persistence failure
      }
    }
    if (temporaryCreated && !renamed) {
      try {
        const tempStat = lstatIfPresent(temporaryPath);
        if (tempStat && !tempStat.isSymbolicLink()) unlinkSync(temporaryPath);
      } catch {
        // preserve the original persistence failure
      }
    }
    if (lock !== undefined) {
      try {
        closeSync(lock);
      } finally {
        unlinkSync(lockPath);
      }
    }
  }
}
function persistSafeState(state, root) {
  const expectedRevision = Number.isSafeInteger(state.revision) ? state.revision : 0;
  const previous = state.revision;
  state.revision = expectedRevision + 1;
  try {
    writeSafeRecoveriesAt(state, root, expectedRevision);
  } catch (error) {
    state.revision = previous;
    throw error;
  }
}

function upsertOwner(safe, ownerId, projectRoot, issue, branch, step) {
  const idx = safe.owners.findIndex((o) =>
    o.ownerId === ownerId &&
    o.projectRoot === projectRoot &&
    o.issue === issue &&
    o.branch === branch &&
    o.step === step
  );
  const owner = {
    ownerId,
    projectRoot,
    issue,
    branch,
    step,
    status: 'incomplete',
  };
  if (idx >= 0) {
    safe.owners[idx] = owner;
  } else {
    safe.owners.push(owner);
  }
}


function hasPriorIncompleteArtifact(cwd, issue, step, branch, projectRoot, run, priorIncomplete = false) {
  // handoff indicates prior incomplete work
  const handoffPath = resolve(projectRoot, HANDOFF_DIR, `${issue}-${step}.json`);
  if (existsSync(handoffPath)) {
    try {
      const h = JSON.parse(readFileSync(handoffPath, 'utf8'));
      if (!h || h.schemaVersion !== 1 || h.issue !== issue || h.step !== step
        || h.status !== 'passed' || h.intervention === true) return true;
    } catch {
      return true; // malformed counts as prior
    }
  }

  // any consumed record for the (issue,step) tuple
  const safe = readSafeRecoveries(cwd);
  if (safe && safe.records.some((r) => r.issue === issue && r.step === step)) {
    return true;
  }

  // review slice artifacts (assignment/receipt/invalidation) indicate prior
  if (step === 'review1' || step === 'review2') {
    const directory = resolve(projectRoot, REVIEWS_DIR);
    const prefix = `${issue}-${step}`;
    if (existsSync(directory) && readdirSync(directory).some((name) => name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`))) return true;
  }

  // A pre-existing unpublished stage commit cannot acquire a new owner.
  if (['implement', 'fix1', 'fix2', 'verify', 'deliver'].includes(step)) {
    const upstream = run('git', ['rev-parse', '--verify', '@{u}'], { cwd: projectRoot });
    const log = run('git', ['log', '--format=%s', ...(commandSucceeded(upstream) ? ['@{u}..HEAD'] : ['-1', 'HEAD'])], { cwd: projectRoot });
    if (!commandSucceeded(log)) return true;
    const expected = getExpectedSubject(step, issue);
    if (String(log.stdout ?? '').split('\n').some((subject) => expected
      ? subject === expected
      : /^(feat|fix|docs|chore)(\([^)]+\))?!?: /.test(subject) && new RegExp(`#${issue}(?!\\d)`).test(subject))) return true;
  }

  // An explicit prior-incomplete hint is itself fail-closed evidence.
  return !!priorIncomplete;
}

function getExpectedSubject(step, issue) {
  if (step === 'verify') return `docs: record verification for #${issue}`;
  if (step === 'fix1') return `fix: apply review1 findings for #${issue}`;
  if (step === 'fix2') return `fix: apply review2 findings for #${issue}`;
  if (step === 'deliver') return `docs: record PR evidence for #${issue}`;
  // implement: caller supplies conventional subject
  return null;
}
function readSessionRecoveryOwner({ projectRoot, sessionToken, issue, step, branch }) {
  if (!SESSION_TOKEN.test(sessionToken)) throw safeError('invalid_session_token');
  const sessionsRoot = join(projectRoot, '.omp', 'sdlc', 'sessions');
  const sessionsStat = lstatIfPresent(sessionsRoot);
  if (!sessionsStat) return null;
  if (sessionsStat.isSymbolicLink() || !sessionsStat.isDirectory()) {
    throw safeError('unsafe_session_path');
  }
  const sessionDir = join(sessionsRoot, sessionToken);
  const sessionStat = lstatIfPresent(sessionDir);
  if (!sessionStat) return null;
  if (sessionStat.isSymbolicLink() || !sessionStat.isDirectory()) {
    throw safeError('unsafe_session_path');
  }

  const pointerPaths = [
    join(sessionDir, 'recovery-owner.json'),
    join(sessionDir, 'run.json'),
  ];
  const owners = [];
  for (const pointerPath of pointerPaths) {
    const pointerStat = lstatIfPresent(pointerPath);
    if (!pointerStat) continue;
    if (pointerStat.isSymbolicLink() || !pointerStat.isFile()) {
      throw safeError('unsafe_session_path');
    }
    let pointer;
    try {
      pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
    } catch {
      throw safeError('recovery_owner_ambiguous');
    }
    if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer)) {
      throw safeError('recovery_owner_ambiguous');
    }
    const pointerOwner = Object.hasOwn(pointer, 'recoveryOwnerId') ? pointer.recoveryOwnerId : pointer.ownerId;
    if (pointerOwner === undefined) continue;
    if (typeof pointerOwner !== 'string' || !pointerOwner) {
      throw safeError('recovery_owner_ambiguous');
    }
    const pointerIssue = pointer.issue ?? pointer.currentIssue;
    const pointerStep = pointer.step ?? pointer.currentStep;
    if (
      pointerIssue !== issue
      || pointerStep !== step
      || pointer.branch !== branch
      || (pointer.projectRoot !== undefined && pointer.projectRoot !== projectRoot)
    ) {
      throw safeError('recovery_owner_ambiguous');
    }
    owners.push(pointerOwner);
  }
  const unique = [...new Set(owners)];
  if (unique.length > 1) throw safeError('recovery_owner_ambiguous');
  return unique[0] ?? null;
}


export function resolveRecoveryOwner({
  cwd = process.cwd(),
  issue,
  step,
  branch: branchParam,
  sessionToken = null,
  controllerRunId = null,
  priorIncomplete = false,
  run = defaultRun,
} = {}) {
  const issueNumber = Number(issue);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0 || !VALID_STEPS.includes(step)) {
    throw safeError('invalid_recovery_params');
  }
  const canonicalRoot = realpathSync(cwd);
  if (sessionToken !== null && !SESSION_TOKEN.test(sessionToken)) {
    throw safeError('invalid_session_token');
  }
  const br = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: canonicalRoot });
  if (!commandSucceeded(br)) throw safeError('recovery_owner_unreadable');
  const branch = String(br.stdout ?? '').trim();
  if (!branch || branch === 'HEAD') throw safeError('recovery_owner_unreadable');
  if (branchParam !== undefined && branchParam !== branch) throw safeError('recovery_owner_ambiguous');

  let safe = readSafeRecoveries(cwd);
  if (!safe) {
    safe = { schemaVersion: 1, revision: 0, owners: [], records: [] };
  }

  // A matching execute checkpoint is only a candidate owner. Existing durable
  // tuple ownership wins over a fresh lease/run id.
  let runOwner = null;
  const runJsonPath = resolve(canonicalRoot, '.omp/sdlc/run.json');
  const runJsonStat = lstatIfPresent(runJsonPath);
  if (runJsonStat && (runJsonStat.isSymbolicLink() || !runJsonStat.isFile())) {
    throw safeError('unsafe_recovery_owner_path');
  }
  if (runJsonStat && controllerRunId) {
    let runData;
    try {
      runData = JSON.parse(readFileSync(runJsonPath, 'utf8'));
    } catch {
      throw safeError('recovery_owner_unreadable');
    }
    if (runData && runData.schemaVersion === 1 && runData.runId === controllerRunId) {
      if (
        runData.projectRoot !== canonicalRoot
        || (Array.isArray(runData.issues) && !runData.issues.includes(issueNumber))
        || (runData.currentIssue !== undefined && runData.currentIssue !== null && runData.currentIssue !== issueNumber)
      ) {
        throw safeError('recovery_owner_ambiguous');
      }
      runOwner = runData.runId;
    }
  }

  const matching = safe.owners.filter((o) =>
    o.projectRoot === canonicalRoot &&
    o.issue === issueNumber &&
    o.branch === branch &&
    o.step === step &&
    o.status === 'incomplete'
  );
  if (matching.length > 1) {
    throw safeError('recovery_owner_ambiguous');
  }

  let sessionOwner = null;
  if (sessionToken !== null) {
    sessionOwner = readSessionRecoveryOwner({
      projectRoot: canonicalRoot,
      sessionToken,
      issue: issueNumber,
      step,
      branch,
    });
  }

  let ownerId = matching[0]?.ownerId ?? null;
  if (sessionOwner && sessionOwner !== ownerId) {
    throw safeError(ownerId ? 'recovery_owner_ambiguous' : 'recovery_owner_missing');
  }

  if (ownerId) {
    return ownerId;
  }

  if (runOwner) {
    ownerId = runOwner;
    upsertOwner(safe, ownerId, canonicalRoot, issueNumber, branch, step);
    persistSafeState(safe, cwd);
    return ownerId;
  }

  // Zero: must not invent after prior incomplete work.
  if (hasPriorIncompleteArtifact(cwd, issueNumber, step, branch, canonicalRoot, run, priorIncomplete)) {
    throw safeError('recovery_owner_missing');
  }

  // First genuine new owner; persist before any recovery side effect.
  ownerId = randomUUID();
  upsertOwner(safe, ownerId, canonicalRoot, issueNumber, branch, step);
  persistSafeState(safe, cwd);
  return ownerId;
}

export function assertRecoveryOwner({ cwd = process.cwd(), ownerId, issue, step, branch }) {
  const root = realpathSync(cwd);
  const matches = readSafeRecoveries(root)?.owners.filter((owner) =>
    owner.ownerId === ownerId && owner.projectRoot === root && owner.issue === issue
    && owner.step === step && owner.branch === branch && owner.status === 'incomplete') ?? [];
  if (matches.length !== 1) throw safeError(matches.length ? 'recovery_owner_ambiguous' : 'recovery_owner_missing');
  return matches[0].ownerId;
}

export function consumeSafeRecovery({
  cwd = process.cwd(),
  ownerId,
  issue,
  step,
  class: className,
  evidence = {},
  now = () => new Date().toISOString(),
} = {}) {
  const issueNumber = Number(issue);
  if (
    !ownerId || typeof ownerId !== 'string' || ownerId.length === 0
    || !className || typeof className !== 'string' || className.length === 0
    || !Number.isSafeInteger(issueNumber) || issueNumber <= 0
    || !VALID_STEPS.includes(step)
    || !evidence || typeof evidence !== 'object' || Array.isArray(evidence)
    || typeof now !== 'function'
  ) {
    throw safeError('invalid_consume_params');
  }

  let safe = readSafeRecoveries(cwd);
  if (!safe) {
    safe = { schemaVersion: 1, revision: 0, owners: [], records: [] };
  }

  const canonicalRoot = realpathSync(cwd);
  const owner = safe.owners.find((o) =>
    o.ownerId === ownerId &&
    o.projectRoot === canonicalRoot &&
    o.issue === issueNumber &&
    o.step === step &&
    o.status === 'incomplete'
  );
  if (!owner) {
    throw safeError('invalid_recovery_ownership');
  }

  const existing = safe.records.find((r) =>
    r.class === className &&
    r.runId === ownerId &&
    r.issue === issueNumber &&
    r.step === step
  );
  if (existing) {
    return { consumed: false, record: existing };
  }

  const record = {
    class: className,
    runId: ownerId,
    issue: issueNumber,
    step,
    invocationId: randomUUID(),
    consumedAt: now(),
    disposition: 'consumed',
    evidence: { ...evidence },
  };
  safe.records.push(record);

  try {
    persistSafeState(safe, cwd);
    return { consumed: true, record };
  } catch (error) {
    throw safeError('recovery_persistence_failed');
  }
}

export function assertInitialStagePublication({ cwd = process.cwd(), ownerId, issue, step, run = defaultRun } = {}) {
  const branch = run('git', ['branch', '--show-current'], { cwd });
  if (!commandSucceeded(branch) || !String(branch.stdout ?? '').trim().startsWith(`${issue}-`)) throw safeError('publication_branch_mismatch');
  const state = readSafeRecoveries(cwd);
  if (state?.records.some((record) => record.class === 'stage_publication'
    && record.runId === ownerId && record.issue === Number(issue) && record.step === step)) {
    throw safeError('stage_publication_consumed');
  }
  const upstream = run('git', ['rev-parse', '--verify', '@{u}'], { cwd });
  if (commandSucceeded(upstream)) {
    const divergence = run('git', ['rev-list', '--left-right', '--count', '@{u}...HEAD'], { cwd });
    if (!commandSucceeded(divergence) || !/^0\s+0$/.test(String(divergence.stdout ?? '').trim())) {
      throw safeError('publication_dirty_partial');
    }
  }
}

export function reconcileStagePublication({
  cwd = process.cwd(), issue, step, expectedSubject, allowedPaths = [], ownerId, run = defaultRun,
} = {}) {
  const issueNumber = Number(issue);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0
    || !['implement', 'fix1', 'fix2', 'verify', 'deliver'].includes(step)
    || typeof expectedSubject !== 'string' || !expectedSubject.trim()
    || typeof ownerId !== 'string' || !ownerId
    || !Array.isArray(allowedPaths) || allowedPaths.length === 0
    || !allowedPaths.every(validPublicationPath)) throw safeError('invalid_reconcile_params');
  const root = realpathSync(cwd);
  const reasonCode = step === 'verify' ? 'verification_publish_failed'
    : step === 'implement' ? 'implementation_failed'
      : step.startsWith('fix') ? 'apply_review_failed' : 'delivery_publish_failed';
  const fail = (summary) => ({ passed: false, reasonCode, summary });
  const git = (args) => {
    const result = run('git', args, { cwd: root });
    if (!commandSucceeded(result)) throw safeError(reasonCode);
    return String(result.stdout ?? '');
  };
  try {
    const branch = git(['branch', '--show-current']).trim();
    if (!branch.startsWith(`${issueNumber}-`)) return fail(`Branch does not belong to #${issueNumber}`);
    const state = readSafeRecoveries(root);
    if (!state?.owners.some((owner) => owner.ownerId === ownerId && owner.projectRoot === root
      && owner.issue === issueNumber && owner.step === step && owner.branch === branch)) {
      return fail('Publication ownership is unproven');
    }
    if (porcelainPaths(git(['status', '--porcelain=v1', '-z'])).length) {
      return fail('Publication recovery requires a clean non-runtime worktree');
    }
    const remote = git(['config', '--get', `branch.${branch}.remote`]).trim();
    const mergeRef = git(['config', '--get', `branch.${branch}.merge`]).trim();
    if (!remote || remote === '.' || remote.startsWith('-') || mergeRef !== `refs/heads/${branch}`) {
      return fail('Publication upstream does not identify the issue branch');
    }
    const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim();
    if (upstream !== `${remote}/${branch}`) return fail('Publication upstream identity mismatch');
    git(['fetch', '--no-tags', remote, mergeRef]);
    const remoteHead = git(['rev-parse', 'FETCH_HEAD']).trim();
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(remoteHead)
      || remoteHead !== git(['rev-parse', '@{u}']).trim()) return fail('Publication upstream observation is inconsistent');
    const head = git(['rev-parse', 'HEAD']).trim();
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(head)) return fail('Publication HEAD is unreadable');
    const countText = git(['rev-list', '--left-right', '--count', '@{u}...HEAD']).trim();
    if (!/^\d+\s+\d+$/.test(countText)) return fail('Publication divergence is unreadable');
    const counts = countText.split(/\s+/).map(Number);
    if (counts.length !== 2 || counts.some((n) => !Number.isSafeInteger(n) || n < 0) || counts[0] !== 0) {
      return fail('Publication branch is divergent or behind');
    }
    if ((counts[1] === 0) !== (remoteHead === head)) return fail('Publication divergence contradicts exact upstream identity');
    const prior = state.records.find((record) => record.class === 'stage_publication'
      && record.runId === ownerId && record.issue === issueNumber && record.step === step);
    if (prior && (prior.evidence.commitSha !== head || prior.evidence.subject !== expectedSubject
      || JSON.stringify(prior.evidence.allowedPaths) !== JSON.stringify([...allowedPaths].sort())
      || prior.evidence.upstream !== upstream)) {
      return fail('Consumed publication evidence no longer matches; allowance is not renewed');
    }
    const commits = counts[1] === 0 ? [head] : git(['rev-list', '@{u}..HEAD']).trim().split('\n');
    if (commits.length !== (counts[1] || 1) || !commits.includes(head)) return fail('Publication commits are unreadable');
    for (const sha of commits) {
      if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha) || git(['log', '-1', '--format=%s', sha]).trim() !== expectedSubject) {
        return fail('Publication commit subject is not the expected stage subject');
      }
      // Reject merge commits: an empty default diff-tree is not scope proof.
      const parents = git(['rev-list', '--parents', '-n', '1', sha]).trim().split(/\s+/);
      if (parents.length !== 2 || parents[0] !== sha
        || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(parents[1]) || parents[1].length !== sha.length) {
        return fail('Publication commit is not a proven single-parent stage commit');
      }
      const names = git(['diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', '-z', sha]);
      if (!names.endsWith('\0')) return fail('Publication changed-path observation is incomplete');
      const paths = names.slice(0, -1).split('\0');
      if (!paths.length || paths.some((file) => !allowedPaths.includes(file))) return fail('Publication commit exceeds approved scope');
    }
    if (counts[1] === 0 && remoteHead === head) return { passed: true, ack: true };
    if (prior) return fail('stage_publication already consumed; no second push');
    const consumed = consumeSafeRecovery({
      cwd: root, ownerId, issue: issueNumber, step, class: 'stage_publication',
      evidence: { commitSha: head, subject: expectedSubject, allowedPaths: [...allowedPaths].sort(), upstream },
    });
    if (!consumed.consumed) return fail('stage_publication already consumed; no second push');
    git(['push', remote, `HEAD:${mergeRef}`]);
    git(['fetch', '--no-tags', remote, mergeRef]);
    if (git(['rev-parse', 'FETCH_HEAD']).trim() !== head
      || git(['rev-parse', '@{u}']).trim() !== head
      || git(['rev-parse', 'HEAD']).trim() !== head
      || porcelainPaths(git(['status', '--porcelain=v1', '-z'])).length) {
      return fail('Publication exact-head postcondition failed');
    }
    return { passed: true, pushed: true };
  } catch (error) {
    return fail(`Publication stopped for #${issueNumber}: ${error.reasonCode ?? error.message}`);
  }
}

function validPublicationPath(file) {
  return typeof file === 'string' && file.length > 0 && !isAbsolute(file)
    && !file.includes('\\') && !file.includes('\0') && !file.startsWith(':')
    && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(file)
    && !file.split('/').some((part) => part === '..' || part === '.')
    && file !== '.omp' && !file.startsWith('.omp/');
}

// Only task identifiers admitted by the existing live-scope adapter contribute
// path authority. Callers cannot supply an asserted allowlist through the CLI.
export function inspectPublicationScope({ cwd = process.cwd(), issue, spec, step, run = defaultRun } = {}) {
  const issueNumber = Number(issue);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0
    || !['implement', 'fix1', 'fix2', 'verify'].includes(step)
    || !new RegExp(`^specs/${issueNumber}-[^/\\\\]+$`).test(spec ?? '')) throw safeError('spec_not_approved');
  const scope = inspectIssueSpecScope({ projectRoot: cwd, issueNumber, specPath: spec });
  if (!['scoped', 'implicit_single_issue'].includes(scope.status)) throw safeError('spec_not_approved');
  const documents = {};
  for (const file of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
    const content = readFileSync(join(cwd, spec, file), 'utf8');
    if (!/^\*\*Status\*\*:\s*Approved\s*$/m.test(content)
      || !new RegExp(`^\\*\\*Issue\\*\\*:\\s*#${issueNumber}\\s*$`, 'm').test(content)) throw safeError('spec_not_approved');
    documents[file] = content;
  }
  if (step === 'verify') return [`${spec}/verification-report.md`];
  const patterns = new Set([`${spec}/`]);
  let active = false;
  for (const line of documents['tasks.md'].split(/\r?\n/)) {
    const heading = /^### (T\d+):/.exec(line);
    if (heading) active = scope.delivery.tasks.includes(heading[1]);
    else if (/^#{1,3} /.test(line)) active = false;
    if (active && /^\*\*File\(s\)\*\*:/.test(line)) {
      let parentheses = 0;
      let start = -1;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '`') {
          if (start < 0) start = index + 1;
          else {
            if (parentheses === 0) {
              const declared = line.slice(start, index);
              if (!validPublicationPath(declared)) throw safeError('publication_scope_unproven');
              patterns.add(declared);
            }
            start = -1;
          }
        } else if (start < 0 && character === '(') parentheses += 1;
        else if (start < 0 && character === ')') parentheses -= 1;
        if (parentheses < 0) throw safeError('publication_scope_unproven');
      }
      if (start >= 0 || parentheses !== 0) throw safeError('publication_scope_unproven');
    }
  }
  const result = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...patterns], { cwd });
  if (!commandSucceeded(result)) throw safeError('publication_scope_unproven');
  // Literal files remain authorized when deleted; directory/glob entries are
  // expanded by Git, using only the approved task text.
  const paths = new Set([...patterns].filter((p) => !p.endsWith('/') && !/[*?\[]/.test(p)));
  for (const file of String(result.stdout ?? '').split('\0').filter(Boolean)) {
    if (!validPublicationPath(file)) throw safeError('publication_scope_unproven');
    paths.add(file);
  }
  const upstream = run('git', ['rev-parse', '--verify', '@{u}'], { cwd });
  const revisions = commandSucceeded(upstream) ? ['@{u}..HEAD', 'HEAD'] : ['HEAD'];
  for (const revision of revisions) {
    const history = run('git', ['log', '--format=', '--name-only', '--no-renames', '-z', ...(revision === 'HEAD' ? ['-1'] : []), revision, '--', ...patterns], { cwd });
    if (!commandSucceeded(history)) throw safeError('publication_scope_unproven');
    for (const file of String(history.stdout ?? '').split('\0').filter(Boolean)) {
      if (!validPublicationPath(file)) throw safeError('publication_scope_unproven');
      paths.add(file);
    }
  }
  if (!paths.size) throw safeError('publication_scope_unproven');
  return [...paths].sort();
}

function runCli(argv = process.argv.slice(2)) {
  const action = argv[0];
  const options = {};
  const keys = { '--issue': 'issue', '--step': 'step', '--spec': 'spec', '--subject': 'expectedSubject', '--controller-run-id': 'controllerRunId', '--session-token': 'sessionToken' };
  for (let index = 1; index < argv.length; index += 2) {
    const key = keys[argv[index]];
    if (!key || Object.hasOwn(options, key) || !argv[index + 1]) return 2;
    options[key] = argv[index + 1];
  }
  if (!['bind', 'reconcile'].includes(action) || !/^[1-9]\d*$/.test(options.issue ?? '')
    || !['implement', 'fix1', 'fix2', 'verify'].includes(options.step)) return 2;
  let lease;
  try {
    const cwd = process.cwd();
    lease = enterControllerLease({ projectRoot: cwd, runId: options.controllerRunId });
    const branch = defaultRun('git', ['branch', '--show-current'], { cwd });
    if (!commandSucceeded(branch) || !String(branch.stdout ?? '').trim().startsWith(`${options.issue}-`)) throw safeError('publication_branch_mismatch');
    const allowedPaths = inspectPublicationScope({ ...options, cwd });
    const controllerRunId = lease.owned ? lease.lease.record.runId : lease.lease.runId;
    const ownerId = resolveRecoveryOwner({ ...options, cwd, controllerRunId });
    const status = defaultRun('git', ['status', '--porcelain=v1', '-z'], { cwd });
    if (!commandSucceeded(status)) throw safeError('publication_scope_unproven');
    if (porcelainPaths(status.stdout).length) assertInitialStagePublication({ ...options, cwd, ownerId });
    let outcome = { passed: true, ownerId, allowedPaths };
    if (action === 'reconcile') {
      const expectedSubject = options.step === 'implement' ? options.expectedSubject : getExpectedSubject(options.step, options.issue);
      if (options.step === 'implement' && (!/^(feat|fix|docs|chore)(\([^)]+\))?!?: .+/.test(expectedSubject ?? '')
        || !new RegExp(`#${options.issue}(?!\\d)`).test(expectedSubject))) throw safeError('publication_subject_unproven');
      outcome = reconcileStagePublication({ ...options, cwd, ownerId, allowedPaths, expectedSubject });
    }
    process.stdout.write(`NMG_SDLC_PUBLICATION: ${JSON.stringify(outcome)}\n`);
    return outcome.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.reasonCode ?? error.message}\n`);
    return 1;
  } finally {
    if (lease?.owned) releaseControllerLease(lease.lease);
  }
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli();
