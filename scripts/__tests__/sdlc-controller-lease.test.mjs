import { afterEach, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  acquireControllerLease,
  assertControllerLease,
  controllerLeasePath,
  enterControllerLease,
  readControllerLease,
  reclaimControllerLease,
  releaseControllerLease,
} from '../sdlc-controller-lease.mjs';

const roots = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-controller-lease-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

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

  test('reclaims an explicitly confirmed stale lease for the same run', () => {
    const root = makeRoot();
    const lease = acquireControllerLease({
      projectRoot: root,
      runId: 'run-42',
      controllerPaneId: 'controller-pane',
      pid: 42,
    });

    expect(reclaimControllerLease({
      projectRoot: root,
      runId: 'run-42',
      ownerIsAlive: () => false,
    })).toEqual(lease.record);
    expect(readControllerLease(root)).toBeNull();
  });

  test('preserves a live or foreign lease during stale recovery', () => {
    const root = makeRoot();
    const lease = acquireControllerLease({
      projectRoot: root,
      runId: 'run-42',
      controllerPaneId: 'controller-pane',
      pid: 42,
    });

    expect(() => reclaimControllerLease({
      projectRoot: root,
      runId: 'run-42',
      ownerIsAlive: () => true,
    })).toThrow('controller_lease_held');
    expect(readControllerLease(root)).toEqual(lease.record);
    expect(() => reclaimControllerLease({
      projectRoot: root,
      runId: 'run-42',
      ownerIsAlive: () => undefined,
    })).toThrow('controller_lease_held');
    expect(readControllerLease(root)).toEqual(lease.record);


    const foreign = `${JSON.stringify({ ...lease.record, runId: 'foreign-run' }, null, 2)}\n`;
    fs.writeFileSync(controllerLeasePath(root), foreign);
    expect(() => reclaimControllerLease({
      projectRoot: root,
      runId: 'run-42',
      ownerIsAlive: () => false,
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(controllerLeasePath(root), 'utf8')).toBe(foreign);
  });
  test('restores a changed lease rather than deleting it during compare', () => {
    const root = makeRoot();
    const lease = acquireControllerLease({
      projectRoot: root,
      runId: 'run-42',
      controllerPaneId: 'controller-pane',
      pid: 42,
    });
    const changed = `${JSON.stringify({ ...lease.record, controllerPaneId: 'changed-pane' }, null, 2)}\n`;

    expect(() => reclaimControllerLease({
      projectRoot: root,
      runId: 'run-42',
      ownerIsAlive: () => {
        fs.writeFileSync(controllerLeasePath(root), changed);
        return false;
      },
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(controllerLeasePath(root), 'utf8')).toBe(changed);
  });

  test('restores a new lease that appears during atomic stale comparison', () => {
    const root = makeRoot();
    const lease = acquireControllerLease({
      projectRoot: root,
      runId: 'run-42',
      controllerPaneId: 'controller-pane',
      pid: 42,
    });
    const replacement = {
      ...lease.record,
      runId: 'replacement-run',
      controllerPaneId: 'replacement-pane',
    };
    const replacementBytes = `${JSON.stringify(replacement, null, 2)}\n`;

    expect(() => reclaimControllerLease({
      projectRoot: root,
      runId: 'run-42',
      ownerIsAlive: () => {
        fs.writeFileSync(controllerLeasePath(root), replacementBytes);
        return false;
      },
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(controllerLeasePath(root), 'utf8')).toBe(replacementBytes);
  });
});
