import { afterEach, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  acquireControllerLease,
  assertControllerLease,
  controllerLeasePath,
  enterControllerLease,
  readControllerLease,
  reclaimStaleControllerLease,
  releaseControllerLease,
} from '../sdlc-controller-lease.mjs';

const roots = [];
const SESSION = '00000000-0000-4000-8000-000000000538';
const NOW = 1_800_000_000_000;
const HEARTBEAT_WINDOW_MS = 60_000;

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-controller-lease-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

// A process table in which the recorded pid no longer exists; every signal probe is recorded.
function deadProcess() {
  const signals = [];
  return {
    signals,
    kill: (pid, signal) => {
      signals.push([pid, signal]);
      throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    },
  };
}

function heartbeatPath(root, session = SESSION) {
  return path.join(root, '.nmg-sdlc', 'execute', session, 'host.json');
}

function writeHeartbeat(root, at, session = SESSION) {
  fs.mkdirSync(path.dirname(heartbeatPath(root, session)), { recursive: true });
  fs.writeFileSync(heartbeatPath(root, session), `${JSON.stringify({ schemaVersion: 1, claudeSessionId: SESSION, at }, null, 2)}\n`);
}

// A lease held by a supervising session, as /sdlc-execute's controller records it.
function supervisedLease(root, { pid = 42 } = {}) {
  const lease = acquireControllerLease({
    projectRoot: root,
    runId: 'run-538',
    supervisorSession: SESSION,
    pid,
    startedAt: '2026-11-08T00:00:00.000Z',
  });
  fs.closeSync(lease.fd);
  return lease;
}

// A lease from before supervised sessions: it names only a controller pane.
function legacyLease(root, { pid = 42 } = {}) {
  const lease = acquireControllerLease({
    projectRoot: root,
    runId: 'run-538',
    controllerPaneId: 'w14:p1',
    pid,
    startedAt: '2026-11-08T00:00:00.000Z',
  });
  fs.closeSync(lease.fd);
  return lease;
}

describe('controller lease', () => {
  test('acquires one canonical project writer and permits only its run identity', () => {
    const root = makeRoot();
    const lease = acquireControllerLease({
      projectRoot: root,
      runId: 'run-42',
      controllerPaneId: 'controller-pane',
      pid: 42,
      startedAt: '2026-08-27T00:00:00.000Z',
    });

    expect(readControllerLease(root)).toEqual(lease.record);
    expect(assertControllerLease({ projectRoot: root, runId: 'run-42' })).toEqual(lease.record);
    expect(() => assertControllerLease({ projectRoot: root })).toThrow('controller_lease_held');
    expect(() => assertControllerLease({ projectRoot: root, runId: 'other-run' }))
      .toThrow('controller_lease_held');
    expect(() => acquireControllerLease({
      projectRoot: root,
      runId: 'other-run',
      controllerPaneId: 'other-pane',
    })).toThrow('controller_lease_held');

    expect(releaseControllerLease(lease)).toBe(true);
    expect(fs.existsSync(controllerLeasePath(root))).toBe(false);
  });

  test('scoped helpers share the active lease and foreign replacement is preserved', () => {
    const root = makeRoot();
    const lease = acquireControllerLease({
      projectRoot: root,
      runId: 'run-42',
      controllerPaneId: 'controller-pane',
    });
    const scoped = enterControllerLease({ projectRoot: root, runId: 'run-42' });
    expect(scoped).toEqual({ lease: lease.record, owned: false });

    const foreign = `${JSON.stringify({ ...lease.record, runId: 'foreign-run' }, null, 2)}\n`;
    fs.writeFileSync(controllerLeasePath(root), foreign);
    expect(releaseControllerLease(lease)).toBe(false);
    expect(fs.readFileSync(controllerLeasePath(root), 'utf8')).toBe(foreign);
  });

  test('standalone helper owns and releases its temporary lease', () => {
    const root = makeRoot();
    const context = enterControllerLease({ projectRoot: root });
    expect(context.owned).toBe(true);
    expect(fs.existsSync(controllerLeasePath(root))).toBe(true);
    expect(releaseControllerLease(context.lease)).toBe(true);
    expect(fs.existsSync(controllerLeasePath(root))).toBe(false);
  });

  test('a supervising session holder records its session and no controller pane', () => {
    const root = makeRoot();
    const lease = supervisedLease(root);

    expect(lease.record).toMatchObject({ supervisorSession: SESSION, pid: 42, runId: 'run-538' });
    expect(lease.record).not.toHaveProperty('controllerPaneId');
    expect(readControllerLease(root)).toEqual(lease.record);
  });

  test('does not create a lease when stale recovery finds none', () => {
    const root = makeRoot();
    const processApi = { kill: () => { throw new Error('unexpected kill'); } };

    expect(reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'run-42',
      processApi,
      now: () => NOW,
    })).toEqual({ reclaimed: false });
    expect(fs.existsSync(controllerLeasePath(root))).toBe(false);
  });
});

describe('stale lease reclaim with a supervising session holder', () => {
  test('reclaims when the holder pid is dead and its session has no heartbeat file', () => {
    const root = makeRoot();
    const lease = supervisedLease(root);
    const processApi = deadProcess();

    expect(reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'new-invocation',
      processApi,
      now: () => NOW,
    })).toEqual({ reclaimed: true, record: lease.record });
    expect(processApi.signals).toEqual([[42, 0]]);
    expect(fs.existsSync(controllerLeasePath(root))).toBe(false);
  });

  test('reclaims when the heartbeat is older than the 60 second window', () => {
    const root = makeRoot();
    const lease = supervisedLease(root);
    writeHeartbeat(root, NOW - HEARTBEAT_WINDOW_MS - 1);

    expect(reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'new-invocation',
      processApi: deadProcess(),
      now: () => NOW,
    })).toEqual({ reclaimed: true, record: lease.record });
    expect(fs.existsSync(controllerLeasePath(root))).toBe(false);
  });

  test('treats a heartbeat exactly 60 seconds old as still fresh and refuses', () => {
    const root = makeRoot();
    const lease = supervisedLease(root);
    writeHeartbeat(root, NOW - HEARTBEAT_WINDOW_MS);

    expect(() => reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'new-invocation',
      processApi: deadProcess(),
      now: () => NOW,
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(lease.path, 'utf8')).toBe(lease.serialized);
  });

  test('refuses with controller_lease_held when the heartbeat is fresh and preserves the lease', () => {
    const root = makeRoot();
    const lease = supervisedLease(root);
    writeHeartbeat(root, NOW - 5_000);

    let thrown;
    try {
      reclaimStaleControllerLease({
        projectRoot: root,
        runId: 'new-invocation',
        processApi: deadProcess(),
        now: () => NOW,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown?.reasonCode).toBe('controller_lease_held');
    expect(fs.readFileSync(lease.path, 'utf8')).toBe(lease.serialized);
  });

  test('treats a malformed heartbeat file as absent and reclaims', () => {
    const root = makeRoot();
    const lease = supervisedLease(root);
    fs.mkdirSync(path.dirname(heartbeatPath(root)), { recursive: true });
    fs.writeFileSync(heartbeatPath(root), '{not json');

    expect(reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'new-invocation',
      processApi: deadProcess(),
      now: () => NOW,
    })).toEqual({ reclaimed: true, record: lease.record });
  });

  test('refuses a live holder pid even when its heartbeat is stale', () => {
    const root = makeRoot();
    const lease = supervisedLease(root);
    writeHeartbeat(root, NOW - HEARTBEAT_WINDOW_MS * 10);

    expect(() => reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'new-invocation',
      processApi: { kill: () => undefined },
      now: () => NOW,
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(lease.path, 'utf8')).toBe(lease.serialized);
  });

  test('refuses when the pid probe fails for a reason other than the process being gone', () => {
    const root = makeRoot();
    const lease = supervisedLease(root);

    expect(() => reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'new-invocation',
      processApi: { kill: () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); } },
      now: () => NOW,
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(lease.path, 'utf8')).toBe(lease.serialized);
  });

  test('preserves a lease whose replacement lands between the liveness probe and unlink', () => {
    const root = makeRoot();
    const lease = supervisedLease(root);
    const replacement = `${JSON.stringify({ ...lease.record, runId: 'replacement-run' }, null, 2)}\n`;

    expect(() => reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'new-invocation',
      processApi: {
        kill: () => {
          fs.writeFileSync(lease.path, replacement);
          throw Object.assign(new Error('gone'), { code: 'ESRCH' });
        },
      },
      now: () => NOW,
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(lease.path, 'utf8')).toBe(replacement);
  });

  test('preserves malformed lease bytes when no ownership can be proven', () => {
    const root = makeRoot();
    const lease = supervisedLease(root);
    fs.writeFileSync(lease.path, '{');

    expect(() => reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'new-invocation',
      processApi: deadProcess(),
      now: () => NOW,
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(lease.path, 'utf8')).toBe('{');
  });
});

describe('stale lease reclaim with a legacy controller pane holder', () => {
  test('reclaims a controllerPaneId-only lease whose pid is dead, with no heartbeat consulted', () => {
    const root = makeRoot();
    const lease = legacyLease(root);
    const processApi = deadProcess();

    expect(reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'new-invocation',
      processApi,
      now: () => NOW,
    })).toEqual({ reclaimed: true, record: lease.record });
    expect(processApi.signals).toEqual([[42, 0]]);
    expect(fs.existsSync(controllerLeasePath(root))).toBe(false);
  });

  test('refuses a controllerPaneId-only lease whose pid is still alive', () => {
    const root = makeRoot();
    const lease = legacyLease(root);

    expect(() => reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'new-invocation',
      processApi: { kill: () => undefined },
      now: () => NOW,
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(lease.path, 'utf8')).toBe(lease.serialized);
  });

  test('refuses a lease with an empty run identity', () => {
    const root = makeRoot();
    legacyLease(root);

    expect(() => reclaimStaleControllerLease({
      projectRoot: root,
      runId: '',
      processApi: deadProcess(),
      now: () => NOW,
    })).toThrow('controller_lease_held');
  });
});

describe('stale lease reclaim does not consult the Herdr pane surface', () => {
  test('the lease module names no herdr surface and lists no agents', () => {
    const libraryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-controller-lease.mjs');
    const source = fs.readFileSync(libraryPath, 'utf8');
    expect(source.toLowerCase()).not.toContain('herdr');
    expect(source).not.toContain('listAgents');
  });
});
