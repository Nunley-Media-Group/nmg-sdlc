import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter, once } from 'node:events';
import { spawn } from 'node:child_process';

import { terminateOwnedProcessGroup, terminateOwnedProcessGroupAfterLeaderLoss } from '../../src/process-supervision.mjs';

function child(pid = 42) {
  const value = new EventEmitter();
  value.pid = pid;
  value.exitCode = null;
  value.signalCode = null;
  return value;
}

const processes = [];
afterEach(async () => {
  for (const processChild of processes.splice(0)) {
    try { process.kill(-processChild.pid, 'SIGKILL'); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    if (processChild.exitCode === null && processChild.signalCode === null) await once(processChild, 'close');
  }
});

async function untilGone(pid) {
  const deadline = Date.now() + 5000;
  for (;;) {
    try { process.kill(pid, 0); } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    if (Date.now() >= deadline) throw new Error(`Owned descendant ${pid} survived cleanup`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
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

  it('does not signal a completed leader during ordinary cleanup', async () => {
    const owned = child();
    owned.exitCode = 0;
    const killGroup = jest.fn();
    await expect(terminateOwnedProcessGroup(owned, { platform: 'linux', killGroup })).resolves.toEqual({ ok: true, alreadyExited: true });
    expect(killGroup).not.toHaveBeenCalled();
  });

  (process.platform === 'win32' ? it.skip : it).each(['ignore', 'inherit'])(
    'cleans the group after leader SIGKILL with %s descendant output and preserves a foreign group',
    async (output) => {
      const foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        detached: true, stdio: 'ignore',
      });
      processes.push(foreign);
      const owned = spawn(process.execPath, ['-e', `
        const { spawn } = require('node:child_process');
        const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
          stdio: ['ignore', ${JSON.stringify(output)}, ${JSON.stringify(output)}],
        });
        process.send({ pid: descendant.pid });
        setInterval(() => {}, 1000);
      `], { detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      processes.push(owned);
      owned.stdout.resume();
      owned.stderr.resume();
      const [descendant] = await once(owned, 'message');
      const closed = once(owned, 'close');
      const exited = once(owned, 'exit');
      owned.kill('SIGKILL');
      await exited;
      if (output === 'ignore') await closed;

      expect(() => process.kill(descendant.pid, 0)).not.toThrow();
      await expect(terminateOwnedProcessGroupAfterLeaderLoss(owned)).resolves.toMatchObject({ ok: true, alreadyExited: false });
      await closed;
      await untilGone(descendant.pid);
      expect(() => process.kill(descendant.pid, 0)).toThrow();
      expect(() => process.kill(foreign.pid, 0)).not.toThrow();
    },
    10_000,
  );

  it.each([null, 0, 1, -42, 1.5, 0x80000000])('rejects unsafe group identity %s without signalling', async (pid) => {
    const killGroup = jest.fn();
    await expect(terminateOwnedProcessGroup(child(pid), { platform: 'linux', killGroup })).resolves.toMatchObject({ ok: false });
    expect(killGroup).not.toHaveBeenCalled();
  });

  it('preserves a group termination failure after its leader exited', async () => {
    const owned = child();
    owned.signalCode = 'SIGKILL';
    const error = Object.assign(new Error('denied'), { code: 'EPERM' });
    await expect(terminateOwnedProcessGroupAfterLeaderLoss(owned, {
      platform: 'linux', killGroup: () => { throw error; },
    })).resolves.toEqual({ ok: false, error });
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

  it('does not claim Windows tree cleanup when taskkill fails after leader loss', async () => {
    const owned = child(77);
    owned.signalCode = 'SIGKILL';
    const spawnProcess = () => {
      const killer = new EventEmitter();
      queueMicrotask(() => killer.emit('close', 128, null));
      return killer;
    };
    const result = await terminateOwnedProcessGroupAfterLeaderLoss(owned, { platform: 'win32', spawnProcess });
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
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
