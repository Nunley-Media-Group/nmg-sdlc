import { afterEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';

import {
  exerciseOmpArgs,
  parseExerciseArgs,
  runExercise,
  usage as exerciseUsage,
} from '../exercise-omp.mjs';
import {
  interactiveHeadlessMessage,
  isInteractiveHeadless,
  parseInteractiveSlash,
  rewriteInteractiveInput,
  sessionModeFromEntries,
  withArguments,
} from '../../src/sdlc-commands.mjs';

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

function provenanceRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-command-provenance-'));
}

describe('interactive input rewrite', () => {
  it('rewrites TUI /sdlc-write-spec to builtin /plan plus workflow', () => {
    const result = rewriteInteractiveInput('/sdlc-write-spec #42', {
      source: 'interactive',
      headless: false,
      sessionMode: 'none',
      root: repoRoot,
      provenanceRoot: provenanceRoot(),
    });
    expect(result.text.startsWith('/plan\n\n')).toBe(true);
    expect(result.text).toContain('# Write Spec');
    expect(result.text).toContain('$ARGUMENTS: #42');
    expect(result.text).not.toContain('/skill:');
    expect(result.text).toContain('publish-approved-spec.mjs');
    expect(result.text).not.toContain('node <plugin-root>/scripts/');
    expect(result.text).not.toContain('node scripts/');
  });

  it('does not prefix /plan when the session is already in plan mode', () => {
    const result = rewriteInteractiveInput('/sdlc-draft-issue auth', {
      source: 'interactive',
      headless: false,
      sessionMode: 'plan',
      root: repoRoot,
      provenanceRoot: provenanceRoot(),
    });
    expect(result.text.startsWith('/plan')).toBe(false);
    expect(result.text).toContain('$ARGUMENTS: auth');
  });

  it('ignores headless, print/RPC, and automated input', () => {
    expect(rewriteInteractiveInput('/sdlc-write-spec #1', {
      source: 'interactive',
      headless: true,
    })).toBeUndefined();
    expect(rewriteInteractiveInput('/sdlc-write-spec #1', { source: 'rpc' })).toBeUndefined();
    expect(rewriteInteractiveInput('/sdlc-status --json', {
      source: 'interactive',
      headless: false,
    })).toBeUndefined();
    expect(parseInteractiveSlash('/sdlc-execute #9')).toBeNull();
  });

  it('reads the last mode_change entry', () => {
    expect(sessionModeFromEntries([
      { type: 'mode_change', mode: 'plan' },
      { type: 'message' },
      { type: 'mode_change', mode: 'none' },
    ])).toBe('none');
    expect(sessionModeFromEntries([{ type: 'mode_change', mode: 'plan' }])).toBe('plan');
  });

  it('keeps withArguments contract', () => {
    expect(withArguments('BODY', '  #7  ')).toBe('BODY\n\n$ARGUMENTS: #7');
    expect(withArguments('BODY', '   ')).toBe('BODY');
  });

  it('treats missing UI and print/RPC modes as headless', () => {
    expect(isInteractiveHeadless(undefined, ['omp'])).toBe(true);
    expect(isInteractiveHeadless({}, ['omp'])).toBe(true);
    expect(isInteractiveHeadless({ hasUI: false }, ['omp'])).toBe(true);
    expect(isInteractiveHeadless({ hasUI: true }, ['omp'])).toBe(false);
    expect(isInteractiveHeadless({ hasUI: true }, ['omp', '--print'])).toBe(true);
    expect(isInteractiveHeadless({ hasUI: true }, ['omp', '--mode', 'rpc'])).toBe(true);
    expect(interactiveHeadlessMessage('sdlc-write-spec')).toBe(
      'Run /sdlc-write-spec in the TUI.\n',
    );
  });
});

describe('exercise-omp args', () => {
  it('parses cwd and command after --', () => {
    expect(parseExerciseArgs(['--cwd', '/tmp/proj', '--', '/sdlc-status', '--json'])).toEqual({
      cwd: '/tmp/proj',
      message: '/sdlc-status --json',
    });
  });

  it('loads the source extension explicitly when extension discovery is disabled', () => {
    expect(exerciseOmpArgs({ cwd: '/tmp/proj' })).toEqual([
      '--mode', 'rpc',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--extension', path.join(repoRoot, 'src/extension.ts'),
      '--plugin-dir', repoRoot,
      '--add-dir', repoRoot,
      '--cwd', path.resolve('/tmp/proj'),
      '--auto-approve',
    ]);
  });

  it('completes a normal non-cancelled RPC exercise without a deadline', async () => {
    const spawnProcess = () => {
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
          if (frame.type === 'prompt') {
            child.stdout.write(`${JSON.stringify({ type: 'response', id: frame.id, success: true })}\n`);
            child.stdout.write(`${JSON.stringify({ type: 'agent_end' })}\n`);
          } else if (frame.type === 'get_last_assistant_text') {
            child.stdout.write(`${JSON.stringify({ type: 'response', id: frame.id, success: true, data: { text: 'complete' } })}\n`);
          }
        }
      });
      queueMicrotask(() => child.stdout.write(`${JSON.stringify({ type: 'ready' })}\n`));
      return child;
    };

    await expect(runExercise({
      cwd: '/tmp/proj',
      message: '/sdlc-status --json',
      spawnProcess,
    })).resolves.toEqual({ text: 'complete', stderr: '' });
  });

  it('classifies confirmed RPC child loss without a wall-clock wait', async () => {
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
      queueMicrotask(() => child.stdout.write(`${JSON.stringify({ type: 'ready' })}\n`));
      return child;
    };

    await expect(runExercise({
      cwd: '/tmp/proj',
      message: '/sdlc-status --json',
      spawnProcess,
    })).rejects.toMatchObject({ reasonCode: 'process_lost' });
  });

  (process.platform === 'win32' ? it.skip : it).each(['SIGKILL', 'exit', 'denied'])(
    'settles RPC descendant cleanup truthfully after unexpected leader %s',
    async (mode) => {
      const source = `
        const { spawn } = require('node:child_process');
        const { createInterface } = require('node:readline');
        const send = frame => process.stdout.write(JSON.stringify(frame) + '\\n');
        createInterface({ input: process.stdin }).on('line', line => {
          const frame = JSON.parse(line);
          if (frame.type !== 'prompt') return;
          const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
            stdio: ['ignore', 'inherit', 'inherit'],
          });
          send({ type: 'response', id: frame.id, success: true });
          send({ type: 'fixture_tree', pid: descendant.pid });
          if (${JSON.stringify(mode)} === 'exit') process.exit(0);
        });
        send({ type: 'ready' });
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
      }).then(result => ({ result }), error => ({ error }));
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

  it('rejects the removed timeout flag', () => {
    expect(() => parseExerciseArgs(['--timeout-ms', '300000', '--', '/sdlc-status'])).toThrow('Unknown argument: --timeout-ms');
  });

  it('prints usage', () => {
    expect(exerciseUsage()).toContain('exercise-omp.mjs');
    expect(exerciseUsage()).toContain('/sdlc-');
  });
});
