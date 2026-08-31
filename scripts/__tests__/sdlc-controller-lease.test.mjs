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
  reclaimStaleControllerLease,
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

  test('does not create a lease when stale recovery finds none', () => {
    const root = makeRoot();

    expect(reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'run-42',
      processApi: { kill: () => { throw new Error('unexpected kill'); } },
      listAgents: () => { throw new Error('unexpected list'); },
    })).toEqual({ reclaimed: false });
    expect(fs.existsSync(controllerLeasePath(root))).toBe(false);
  });

  test('reclaims an unchanged same-run lease only after pid and pane absence', () => {
    const root = makeRoot();
    const lease = acquireControllerLease({
      projectRoot: root,
      runId: 'run-42',
      controllerPaneId: 'dead-pane',
      pid: 42,
    });
    fs.closeSync(lease.fd);
    const signals = [];

    expect(reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'run-42',
      processApi: {
        kill: (pid, signal) => {
          signals.push([pid, signal]);
          throw Object.assign(new Error('gone'), { code: 'ESRCH' });
        },
      },
      listAgents: () => ({ status: 0, stdout: '{"result":{"agents":[{"pane_id":"other-pane"}]}}' }),
    })).toEqual({ reclaimed: true, record: lease.record });
    expect(signals).toEqual([[42, 0]]);
    expect(fs.existsSync(controllerLeasePath(root))).toBe(false);
  });

  test.each([
    ['live pid', () => undefined, () => []],
    ['unknown pid', () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); }, () => []],
    ['live pane', () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); }, () => [{ paneId: 'dead-pane' }]],
    ['failed agent list', () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); }, () => ({ status: 1, stdout: '[]' })],
    ['unparseable agent list', () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); }, () => ({ status: 0, stdout: 'not json' })],
  ])('preserves a lease when %s prevents confirmed recovery', (_name, kill, listAgents) => {
    const root = makeRoot();
    const lease = acquireControllerLease({
      projectRoot: root,
      runId: 'run-42',
      controllerPaneId: 'dead-pane',
      pid: 42,
    });
    fs.closeSync(lease.fd);

    expect(() => reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'run-42',
      processApi: { kill },
      listAgents,
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(lease.path, 'utf8')).toBe(lease.serialized);
  });

  test.each([
    ['foreign run', (record) => ({ ...record, runId: 'other-run' })],
    ['malformed JSON', () => '{'],
  ])('preserves %s lease bytes', (_name, replacement) => {
    const root = makeRoot();
    const lease = acquireControllerLease({
      projectRoot: root,
      runId: 'run-42',
      controllerPaneId: 'dead-pane',
      pid: 42,
    });
    fs.closeSync(lease.fd);
    const value = replacement(lease.record);
    const bytes = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(lease.path, bytes);

    expect(() => reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'run-42',
      processApi: { kill: () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); } },
      listAgents: () => [],
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(lease.path, 'utf8')).toBe(bytes);
  });

  test('preserves replacement bytes when the lease changes before unlink', () => {
    const root = makeRoot();
    const lease = acquireControllerLease({
      projectRoot: root,
      runId: 'run-42',
      controllerPaneId: 'dead-pane',
      pid: 42,
    });
    fs.closeSync(lease.fd);
    const replacement = `${JSON.stringify({ ...lease.record, controllerPaneId: 'new-pane' }, null, 2)}\n`;

    expect(() => reclaimStaleControllerLease({
      projectRoot: root,
      runId: 'run-42',
      processApi: { kill: () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); } },
      listAgents: () => {
        fs.writeFileSync(lease.path, replacement);
        return [];
      },
    })).toThrow('controller_lease_held');
    expect(fs.readFileSync(lease.path, 'utf8')).toBe(replacement);
  });
});
