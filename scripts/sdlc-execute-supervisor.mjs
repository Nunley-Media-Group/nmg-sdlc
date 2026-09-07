#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { terminateOwnedProcessGroup } from '../src/process-supervision.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import {
  controllerLeasePath,
  readControllerLease,
  releaseControllerLease,
} from './sdlc-controller-lease.mjs';
import { VALID_STEPS, defaultHerdr, parseArgs, readRun, runExecute, writeRun } from './sdlc-execute.mjs';

const SCRIPT = fileURLToPath(import.meta.url);

function sendMessage(target, message) {
  return new Promise((resolve) => {
    if (!target.connected) return resolve();
    target.send(message, () => resolve());
  });
}

function cleanupCancelledRun(controllerPid, cwd, retainWorker, reasonCode) {
  const lease = readControllerLease(cwd);
  // Cancellation before acquisition, or after normal release, owns no checkpoint.
  if (!lease) return;
  const root = realpathSync(cwd);
  const path = controllerLeasePath(root);
  const serialized = readFileSync(path, 'utf8');
  const runState = readRun(root);
  if (lease.pid !== controllerPid || lease.projectRoot !== root
    || JSON.stringify(JSON.parse(serialized)) !== JSON.stringify(lease)
    || runState?.runId !== lease.runId || runState.projectRoot !== root) {
    throw new Error('controller_cleanup_ownership_mismatch');
  }

  const run = (command, args, options = {}) => spawnSync(command, args, {
    cwd: root, encoding: 'utf8', ...options,
  });
  const herdr = defaultHerdr(run, root);
  let checkout = null;
  if (retainWorker) {
    const branch = run('git', ['branch', '--show-current']);
    const head = run('git', ['rev-parse', 'HEAD']);
    if (branch.status === 0 && head.status === 0) {
      checkout = { branch: branch.stdout.trim(), head: head.stdout.trim() };
    }
  }
  let closeFailed = false;
  for (const [name, worker] of Object.entries(runState.workers || {})) {
    if (worker?.name !== name || worker.projectRoot !== root || worker.runId !== lease.runId
      || !Number.isSafeInteger(worker.issue) || worker.issue <= 0 || !VALID_STEPS.includes(worker.step)
      || ![`s${worker.issue}-${worker.step}`, `r${worker.issue}-${worker.step}`].includes(name)
      || typeof worker.paneId !== 'string' || !worker.paneId || worker.paneId === lease.controllerPaneId) {
      continue;
    }
    if (retainWorker) {
      if (checkout) Object.assign(worker, checkout);
      continue;
    }
    try {
      if (herdr.paneClose(worker.paneId).status === 0) delete runState.workers[name];
      else closeFailed = true;
    } catch {
      closeFailed = true;
    }
  }
  if (Number.isSafeInteger(runState.currentIssue) && VALID_STEPS.includes(runState.currentStep)) {
    runState.failed = {
      issue: runState.currentIssue,
      step: runState.currentStep,
      reasonCode,
      ...(closeFailed ? { cleanupReasonCode: 'pane_close_failed' } : {}),
    };
  }
  const expectedRevision = runState.revision;
  runState.revision += 1;
  writeRun(runState, root, expectedRevision);
  // Failed close or CAS leaves exact ownership available for recovery, never a false success.
  if (closeFailed) throw new Error('pane_close_failed');
  if (!releaseControllerLease({ path, serialized })) throw new Error('controller_lease_release_failed');
}

async function runSupervisor(args) {
  const parsed = parseArgs(args);
  const controller = spawn('node', [SCRIPT, 'controller', args], {
    cwd: process.cwd(), env: process.env,
    detached: true, shell: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stdout = '';
  let stderr = '';
  controller.stdout.on('data', (chunk) => { stdout += chunk; });
  controller.stderr.on('data', (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve) => {
    controller.once('error', (error) => resolve({ code: 1, error }));
    controller.once('close', (code, signal) => resolve({ code, signal }));
  });
  let cancellation = null;
  let cancelSignal = null;
  let finished = false;
  const cancel = (signal) => {
    if (finished || cancellation) return;
    cancelSignal = signal;
    cancellation = (async () => {
      // runExecute blocks synchronously: stop its owned group without waiting on its event loop.
      const result = await terminateOwnedProcessGroup(controller);
      if (!result.ok) throw result.error || new Error('controller_process_cleanup_failed');
      await exited;
      cleanupCancelledRun(controller.pid, process.cwd(), parsed.retainWorker, 'controller_cancelled');
    })();
    // Attach immediately; the normal completion path below consumes the same failure.
    cancellation.catch(() => {});
  };
  process.on('message', (message) => {
    if (message?.type === 'cancel') cancel(message.signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
  });
  process.once('disconnect', () => cancel('SIGTERM'));
  process.once('SIGINT', () => cancel('SIGINT'));
  process.once('SIGTERM', () => cancel('SIGTERM'));
  if (!process.connected) cancel('SIGTERM');

  const outcome = await exited;
  let status = outcome.code ?? 1;
  if (cancellation) {
    status = cancelSignal === 'SIGINT' ? 130 : 143;
    try { await cancellation; } catch (error) { stderr += `${error.message}\n`; }
  } else if (outcome.signal) {
    try {
      cleanupCancelledRun(controller.pid, process.cwd(), parsed.retainWorker, 'controller_process_lost');
    } catch (error) { stderr += `${error.message}\n`; }
  }
  if (outcome.error) stderr += `${outcome.error.message}\n`;
  finished = true;
  await sendMessage(process, { type: 'result', status, stdout, stderr });
  if (process.connected) process.disconnect();
  process.exitCode = status;
}

export async function superviseExecute({ args = '', cwd = process.cwd(), env = process.env } = {}) {
  const supervisor = spawn('node', [SCRIPT, 'supervisor', args], {
    cwd, env, detached: true, shell: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stdout = '';
  let stderr = '';
  let result = null;
  supervisor.stdout.on('data', (chunk) => { stdout += chunk; });
  supervisor.stderr.on('data', (chunk) => { stderr += chunk; });
  const interrupt = () => { void sendMessage(supervisor, { type: 'cancel', signal: 'SIGINT' }); };
  const terminate = () => { void sendMessage(supervisor, { type: 'cancel', signal: 'SIGTERM' }); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  try {
    return await new Promise((resolve) => {
      supervisor.on('message', (message) => {
        if (message?.type === 'result' && Number.isInteger(message.status)
          && typeof message.stdout === 'string' && typeof message.stderr === 'string') result = message;
      });
      supervisor.once('error', (error) => resolve({ status: 1, stdout, stderr: `${stderr}${error.message}\n` }));
      supervisor.once('close', (code) => resolve(result
        ? { status: result.status, stdout: result.stdout, stderr: result.stderr }
        : { status: code || 1, stdout, stderr: stderr || 'controller_supervisor_lost\n' }));
    });
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
}

if (isCliEntry(import.meta.url)) {
  const [mode, args = ''] = process.argv.slice(2);
  if (!process.send || !['supervisor', 'controller'].includes(mode)) {
    process.stderr.write('execute supervisor requires an owned IPC invocation\n');
    process.exitCode = 2;
  } else if (mode === 'controller') {
    const result = runExecute({ args });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.status;
    process.disconnect();
  } else {
    runSupervisor(args).catch(async (error) => {
      await sendMessage(process, { type: 'result', status: 1, stdout: '', stderr: `${error.message}\n` });
      if (process.connected) process.disconnect();
      process.exitCode = 1;
    });
  }
}
