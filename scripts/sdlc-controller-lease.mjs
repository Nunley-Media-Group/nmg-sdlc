import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { heartbeatFresh } from '../src/execute-host.mjs';

const LEASE_FILE = join('.nmg-sdlc', 'controller.lock');

function leaseError() {
  const error = new Error('controller_lease_held');
  error.reasonCode = 'controller_lease_held';
  return error;
}

// A lease names its holder either by `controllerPaneId` (a process label) or, for /sdlc-execute, by the
// `supervisorSession` whose heartbeat proves the holder is still supervised.
function validLease(record, projectRoot) {
  const holder = typeof record?.supervisorSession === 'string' ? record.supervisorSession.length > 0
    : typeof record?.controllerPaneId === 'string' && record.controllerPaneId.length > 0;
  return record?.schemaVersion === 1
    && record.projectRoot === projectRoot
    && typeof record.runId === 'string'
    && record.runId.length > 0
    && holder
    && Number.isSafeInteger(record.pid)
    && record.pid > 0
    && typeof record.startedAt === 'string'
    && !Number.isNaN(Date.parse(record.startedAt));
}

export function controllerLeasePath(projectRoot) {
  return join(projectRoot, LEASE_FILE);
}

export function readControllerLease(projectRoot) {
  const canonicalRoot = realpathSync(projectRoot);
  const path = controllerLeasePath(canonicalRoot);
  try {
    const record = JSON.parse(readFileSync(path, 'utf8'));
    if (!validLease(record, canonicalRoot)) throw leaseError();
    return record;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error?.reasonCode === 'controller_lease_held') throw error;
    throw leaseError();
  }
}

/** Whether the supervising session's heartbeat is fresh: its `host.json` exists and was written within the window. */
function supervisorAlive(projectRoot, session, now) {
  try {
    return heartbeatFresh(JSON.parse(readFileSync(join(projectRoot, '.nmg-sdlc', 'execute', session, 'host.json'), 'utf8')), now);
  } catch {
    return false;
  }
}

/**
 * Reclaims a lease only when its recorded pid is dead and, for a supervised holder, its supervising session's
 * heartbeat is absent or stale. A live pid or a fresh heartbeat refuses with controller_lease_held.
 */
export function reclaimStaleControllerLease({
  projectRoot,
  runId,
  processApi = process,
  now = Date.now,
} = {}) {
  const canonicalRoot = realpathSync(projectRoot);
  const path = controllerLeasePath(canonicalRoot);
  let snapshot;
  try {
    snapshot = readFileSync(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { reclaimed: false };
    throw leaseError();
  }

  let record;
  try {
    record = JSON.parse(snapshot);
  } catch {
    throw leaseError();
  }
  if (!validLease(record, canonicalRoot) || !runId) {
    throw leaseError();
  }

  try {
    processApi.kill(record.pid, 0);
    throw leaseError();
  } catch (error) {
    if (error?.reasonCode === 'controller_lease_held') throw error;
    if (error?.code !== 'ESRCH') throw leaseError();
  }

  if (typeof record.supervisorSession === 'string' && supervisorAlive(canonicalRoot, record.supervisorSession, now)) {
    throw leaseError();
  }

  try {
    if (readFileSync(path, 'utf8') !== snapshot) throw leaseError();
    unlinkSync(path);
  } catch (error) {
    if (error?.reasonCode === 'controller_lease_held') throw error;
    throw leaseError();
  }
  return { reclaimed: true, record };
}

export function assertControllerLease({ projectRoot, runId }) {
  const lease = readControllerLease(projectRoot);
  if (!lease) return null;
  if (!runId || lease.runId !== runId) throw leaseError();
  return lease;
}

/** Acquires the project lease. `supervisorSession` names an /sdlc-execute holder; otherwise `controllerPaneId` labels it. */
export function acquireControllerLease({
  projectRoot,
  runId = randomUUID(),
  controllerPaneId,
  supervisorSession,
  pid = process.pid,
  startedAt = new Date().toISOString(),
} = {}) {
  const canonicalRoot = realpathSync(projectRoot);
  const path = controllerLeasePath(canonicalRoot);
  const holder = typeof supervisorSession === 'string'
    ? { supervisorSession }
    : { controllerPaneId: controllerPaneId ?? `pid-${process.pid}` };
  const record = {
    schemaVersion: 1,
    projectRoot: canonicalRoot,
    runId,
    ...holder,
    pid,
    startedAt,
  };
  if (!validLease(record, canonicalRoot)) throw new Error('invalid_controller_lease');
  mkdirSync(dirname(path), { recursive: true });

  let fd;
  try {
    fd = openSync(path, 'wx');
    const serialized = `${JSON.stringify(record, null, 2)}\n`;
    writeFileSync(fd, serialized);
    return { fd, path, record, serialized };
  } catch (error) {
    if (fd !== undefined) {
      closeSync(fd);
      try {
        unlinkSync(path);
      } catch {
        // Preserve the original acquisition failure.
      }
    }
    if (error?.code === 'EEXIST') throw leaseError();
    throw error;
  }
}

export function releaseControllerLease(lease) {
  if (!lease) return false;
  try {
    closeSync(lease.fd);
  } catch {
    // The owner check below remains authoritative.
  }
  try {
    if (readFileSync(lease.path, 'utf8') !== lease.serialized) return false;
    unlinkSync(lease.path);
    return true;
  } catch {
    return false;
  }
}

export function enterControllerLease({ projectRoot, runId, controllerPaneId } = {}) {
  const active = readControllerLease(projectRoot);
  if (active) {
    if (!runId || active.runId !== runId) throw leaseError();
    return { lease: active, owned: false };
  }
  return {
    lease: acquireControllerLease({ projectRoot, runId: runId || randomUUID(), controllerPaneId }),
    owned: true,
  };
}

/** The lease file's status for a project, without changing it: absent, or the holder's identity. */
export function controllerLeaseStatus(projectRoot) {
  try {
    lstatSync(controllerLeasePath(realpathSync(projectRoot)));
    return 'held';
  } catch {
    return 'absent';
  }
}
