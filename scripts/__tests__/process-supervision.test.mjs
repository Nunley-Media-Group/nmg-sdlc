import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';

import { terminateOwnedProcessGroup } from '../../src/process-supervision.mjs';

function child(pid = 42) {
  const value = new EventEmitter();
  value.pid = pid;
  value.exitCode = null;
  value.signalCode = null;
  return value;
}

describe('owned process-group cleanup', () => {
  it('kills only the owned POSIX process group and waits for closure', async () => {
    const owned = child();
    const killGroup = jest.fn((pid, signal) => {
      expect(pid).toBe(-42);
      expect(signal).toBe('SIGKILL');
      owned.signalCode = signal;
      queueMicrotask(() => owned.emit('close', null, signal));
    });

    await expect(terminateOwnedProcessGroup(owned, { platform: 'darwin', killGroup })).resolves.toEqual({
      ok: true,
      alreadyExited: false,
    });
    expect(killGroup).toHaveBeenCalledTimes(1);
  });

  it('never signals an already-exited or confirmed-closed POSIX child', async () => {
    const exited = child();
    exited.exitCode = 0;
    const lost = child(43);
    const killGroup = jest.fn();

    await expect(terminateOwnedProcessGroup(exited, { platform: 'linux', killGroup })).resolves.toEqual({ ok: true, alreadyExited: true });
    await expect(terminateOwnedProcessGroup(lost, { platform: 'linux', killGroup, closed: true })).resolves.toEqual({ ok: true, alreadyExited: true });
    expect(killGroup).not.toHaveBeenCalled();
  });

  it('uses taskkill argument arrays for the owned Windows process tree', async () => {
    const owned = child(77);
    const spawnProcess = jest.fn((program, args, options) => {
      expect(program).toBe('taskkill');
      expect(args).toEqual(['/pid', '77', '/t', '/f']);
      expect(options).toMatchObject({ shell: false, stdio: 'ignore', windowsHide: true });
      const killer = new EventEmitter();
      queueMicrotask(() => {
        owned.signalCode = 'SIGKILL';
        killer.emit('close', 0, null);
        owned.emit('close', null, 'SIGKILL');
      });
      return killer;
    });

    await expect(terminateOwnedProcessGroup(owned, { platform: 'win32', spawnProcess })).resolves.toEqual({
      ok: true,
      alreadyExited: false,
    });
    expect(spawnProcess).toHaveBeenCalledTimes(1);
  });

  it('tolerates an already-gone POSIX process group', async () => {
    const owned = child();
    const error = Object.assign(new Error('gone'), { code: 'ESRCH' });
    const killGroup = jest.fn(() => { throw error; });

    await expect(terminateOwnedProcessGroup(owned, { platform: 'linux', killGroup })).resolves.toEqual({
      ok: true,
      alreadyExited: true,
    });
  });
});
