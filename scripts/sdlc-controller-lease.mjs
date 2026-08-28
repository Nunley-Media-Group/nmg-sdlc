import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

const LEASE_FILE = join('.omp', 'sdlc', 'controller.lock');

function leaseError() {
  const error = new Error('controller_lease_held');
  error.reasonCode = 'controller_lease_held';
  return error;
}

function validLease(record, projectRoot) {
  return record?.schemaVersion === 1
    && record.projectRoot === projectRoot
    && typeof record.runId === 'string'
    && record.runId.length > 0
    && typeof record.controllerPaneId === 'string'
    && record.controllerPaneId.length > 0
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
  if (!existsSync(path)) return null;
  try {
    const record = JSON.parse(readFileSync(path, 'utf8'));
    if (!validLease(record, canonicalRoot)) throw leaseError();
    return record;
  } catch (error) {
    if (error?.reasonCode === 'controller_lease_held') throw error;
    throw leaseError();
  }
}

export function assertControllerLease({ projectRoot, runId }) {
  const lease = readControllerLease(projectRoot);
  if (!lease) return null;
  if (!runId || lease.runId !== runId) throw leaseError();
  return lease;
}

export function acquireControllerLease({
  projectRoot,
  runId = randomUUID(),
  controllerPaneId = `pid-${process.pid}`,
  pid = process.pid,
  startedAt = new Date().toISOString(),
} = {}) {
  const canonicalRoot = realpathSync(projectRoot);
  const path = controllerLeasePath(canonicalRoot);
  const record = {
    schemaVersion: 1,
    projectRoot: canonicalRoot,
    runId,
    controllerPaneId,
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
    if (fd !== undefined) closeSync(fd);
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
