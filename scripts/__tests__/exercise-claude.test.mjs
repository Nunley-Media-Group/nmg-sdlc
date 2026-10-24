import { afterEach, describe, expect, it, jest } from '@jest/globals';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';

import {
  INTERACTIVE_ONLY_EXIT,
  exerciseClaudeArgs,
  isInteractiveRefusal,
  parseExerciseArgs,
  runExercise,
  usage as exerciseUsage,
  userMessageFrame,
} from '../exercise-claude.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const processFixtures = [];
afterEach(async () => {
  jest.restoreAllMocks();
  for (const child of processFixtures.splice(0)) {
    const closed = new Promise(resolve => child.once('close', resolve));
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    if (child.exitCode === null && child.signalCode === null) await closed;
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

/** A fake `claude -p` stream-json child that answers each user frame with `reply(frame)`. */
function fakeClaude(reply, capture = {}) {
  return (program, args, options) => {
    Object.assign(capture, { program, args, options });
    const child = new EventEmitter();
    child.pid = undefined;
    child.exitCode = null;
    child.signalCode = null;
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin.setEncoding('utf8');
    let input = '';
    child.stdin.on('data', (chunk) => {
      input += chunk;
      for (;;) {
        const newline = input.indexOf('\n');
        if (newline < 0) break;
        const frame = JSON.parse(input.slice(0, newline));
        input = input.slice(newline + 1);
        capture.frames = [...(capture.frames ?? []), frame];
        for (const out of reply(frame)) child.stdout.write(`${JSON.stringify(out)}\n`);
      }
    });
    return child;
  };
}

const assistant = text => ({ type: 'assistant', parent_tool_use_id: null, message: { role: 'assistant', content: [{ type: 'text', text }] } });
const result = (text, extra = {}) => ({ type: 'result', subtype: 'success', is_error: false, result: text, ...extra });

describe('exercise-claude args', () => {
  it('parses cwd and command after --', () => {
    expect(parseExerciseArgs(['--cwd', '/tmp/proj', '--', '/sdlc-status', '--json'])).toEqual({
      cwd: '/tmp/proj',
      message: '/sdlc-status --json',
    });
  });

  it('parses an optional model', () => {
    expect(parseExerciseArgs(['--cwd', '/tmp/proj', '--model', 'haiku', '--', '/sdlc-status'])).toEqual({
      cwd: '/tmp/proj',
      model: 'haiku',
      message: '/sdlc-status',
    });
    expect(() => parseExerciseArgs(['--model'])).toThrow('--model requires a value');
  });

  it('launches headless Claude Code with this checkout as the plugin', () => {
    expect(exerciseClaudeArgs()).toEqual([
      '-p',
      '--plugin-dir', repoRoot,
      '--add-dir', repoRoot,
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--permission-mode', 'bypassPermissions',
    ]);
    expect(exerciseClaudeArgs({ model: 'haiku' }).slice(-2)).toEqual(['--model', 'haiku']);
  });

  it('runs claude in the project directory and submits the command as one stream-json user frame', async () => {
    const capture = {};
    await runExercise({
      cwd: '/tmp/proj',
      message: '/sdlc-status --json',
      spawnProcess: fakeClaude(() => [result('ok')], capture),
    });
    expect(capture.program).toBe('claude');
    expect(capture.options.cwd).toBe(path.resolve('/tmp/proj'));
    expect(capture.frames).toEqual([userMessageFrame('/sdlc-status --json')]);
    expect(userMessageFrame('/sdlc-status')).toEqual({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: '/sdlc-status' }] },
    });
  });

  it('completes a normal non-cancelled exercise without a deadline', async () => {
    await expect(runExercise({
      cwd: '/tmp/proj',
      message: '/sdlc-status --json',
      spawnProcess: fakeClaude(() => [{ type: 'system', subtype: 'init' }, assistant('working'), result('complete')]),
    })).resolves.toEqual({ text: 'complete', stderr: '' });
  });

  it('falls back to the last top-level assistant text when the result carries none', async () => {
    await expect(runExercise({
      cwd: '/tmp/proj',
      message: '/sdlc-status',
      spawnProcess: fakeClaude(() => [
        assistant('top-level'),
        { ...assistant('subagent'), parent_tool_use_id: 'toolu_1' },
        result(''),
      ]),
    })).resolves.toEqual({ text: 'top-level', stderr: '' });
  });

  it('reports an interactive command refused under -p as interactive_only with exit 2', async () => {
    const refusal = 'nmg-sdlc: Run /sdlc-draft-issue in the TUI.';
    await expect(runExercise({
      cwd: '/tmp/proj',
      message: '/sdlc-draft-issue',
      spawnProcess: fakeClaude(() => [assistant(refusal), result(refusal, { local_command: 'custom' })]),
    })).rejects.toMatchObject({ reasonCode: 'interactive_only', exitCode: INTERACTIVE_ONLY_EXIT, message: refusal });
    expect(INTERACTIVE_ONLY_EXIT).toBe(2);
  });

  it('recognizes the refusal only for the interactive command that was sent', () => {
    expect(isInteractiveRefusal('/sdlc-write-spec #3', 'Run /sdlc-write-spec in the TUI.\n')).toBe(true);
    expect(isInteractiveRefusal('/sdlc-write-spec', 'nmg-sdlc: Run /sdlc-steering in the TUI.')).toBe(false);
    expect(isInteractiveRefusal('/sdlc-status', 'Run /sdlc-status in the TUI.')).toBe(false);
  });

  it('classifies an error result as command_failed', async () => {
    await expect(runExercise({
      cwd: '/tmp/proj',
      message: '/sdlc-status',
      spawnProcess: fakeClaude(() => [result('', { subtype: 'error_during_execution', is_error: true, errors: ['boom'] })]),
    })).rejects.toMatchObject({ reasonCode: 'command_failed', message: expect.stringContaining('boom') });
  });

  it('classifies a missing claude binary as launch_failed', async () => {
    const spawnProcess = () => {
      const child = fakeClaude(() => [])();
      queueMicrotask(() => child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' })));
      return child;
    };
    await expect(runExercise({ cwd: '/tmp/proj', message: '/sdlc-status', spawnProcess }))
      .rejects.toMatchObject({ reasonCode: 'launch_failed' });
  });

  it('classifies confirmed child loss without a wall-clock wait', async () => {
    const spawnProcess = () => {
      const child = new EventEmitter();
      child.pid = undefined;
      child.exitCode = null;
      child.signalCode = null;
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin.once('data', () => {
        child.exitCode = 0;
        child.emit('close', 0, null);
      });
      return child;
    };

    await expect(runExercise({
      cwd: '/tmp/proj',
      message: '/sdlc-status --json',
      spawnProcess,
    })).rejects.toMatchObject({ reasonCode: 'process_lost' });
  });

  (process.platform === 'win32' ? it.skip : it).each(['SIGKILL', 'exit', 'denied'])(
    'settles descendant cleanup truthfully after unexpected leader %s',
    async (mode) => {
      const source = `
        const { spawn } = require('node:child_process');
        const { createInterface } = require('node:readline');
        const send = frame => process.stdout.write(JSON.stringify(frame) + '\\n');
        createInterface({ input: process.stdin }).on('line', line => {
          const frame = JSON.parse(line);
          if (frame.type !== 'user') return;
          const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
            stdio: ['ignore', 'inherit', 'inherit'],
          });
          send({ type: 'system', subtype: 'init' });
          send({ type: 'fixture_tree', pid: descendant.pid });
          if (${JSON.stringify(mode)} === 'exit') process.exit(0);
        });
      `;
      const foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
      processFixtures.push(foreign);
      let owned;
      let ready;
      const treeReady = new Promise(resolve => { ready = resolve; });
      const pending = runExercise({
        cwd: os.tmpdir(), message: '/sdlc-status --json',
        spawnProcess: (_program, _args, options) => {
          owned = spawn(process.execPath, ['-e', source], options);
          processFixtures.push(owned);
          let output = '';
          owned.stdout.on('data', chunk => {
            output += chunk;
            for (;;) {
              const end = output.indexOf('\n');
              if (end < 0) break;
              const frame = JSON.parse(output.slice(0, end));
              output = output.slice(end + 1);
              if (frame.type === 'fixture_tree') ready(frame);
            }
          });
          return owned;
        },
      }).then(value => ({ result: value }), error => ({ error }));
      const descendant = await treeReady;
      if (mode === 'denied') {
        const kill = process.kill;
        jest.spyOn(process, 'kill').mockImplementation((pid, signal) => {
          if (pid === -owned.pid) throw Object.assign(new Error('fixture group termination denied'), { code: 'EPERM' });
          return kill(pid, signal);
        });
      }
      if (mode !== 'exit') owned.kill('SIGKILL');
      expect((await pending).error).toMatchObject({
        reasonCode: mode === 'denied' ? 'cleanup_failed' : mode === 'SIGKILL' ? 'process_failed' : 'process_lost',
      });
      if (mode === 'denied') {
        expect(() => process.kill(descendant.pid, 0)).not.toThrow();
      } else {
        await untilGone(descendant.pid);
        expect(() => process.kill(descendant.pid, 0)).toThrow();
      }
      expect(() => process.kill(foreign.pid, 0)).not.toThrow();
    },
    10_000,
  );

  it('honors explicit exercise cancellation', async () => {
    const spawnProcess = () => {
      const child = new EventEmitter();
      child.pid = undefined;
      child.exitCode = null;
      child.signalCode = null;
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      return child;
    };
    const controller = new AbortController();
    controller.abort();

    await expect(runExercise({
      cwd: '/tmp/proj',
      message: '/sdlc-status --json',
      signal: controller.signal,
      spawnProcess,
    })).rejects.toMatchObject({ reasonCode: 'cancelled' });
  });

  it('honors cancellation while the command is running', async () => {
    const controller = new AbortController();
    const pending = runExercise({
      cwd: '/tmp/proj',
      message: '/sdlc-status --json',
      signal: controller.signal,
      spawnProcess: fakeClaude(() => {
        queueMicrotask(() => controller.abort());
        return [{ type: 'system', subtype: 'init' }];
      }),
    });
    await expect(pending).rejects.toMatchObject({ reasonCode: 'cancelled' });
  });

  it('rejects the removed timeout flag', () => {
    expect(() => parseExerciseArgs(['--timeout-ms', '300000', '--', '/sdlc-status'])).toThrow('Unknown argument: --timeout-ms');
  });

  it('prints usage', () => {
    expect(exerciseUsage()).toContain('exercise-claude.mjs');
    expect(exerciseUsage()).toContain('/sdlc-');
  });
});
