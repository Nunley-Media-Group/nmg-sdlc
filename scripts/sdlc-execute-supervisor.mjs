#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { terminateOwnedProcessGroup, terminateOwnedProcessGroupAfterLeaderLoss } from '../src/process-supervision.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import {
  controllerLeasePath,
  readControllerLease,
  releaseControllerLease,
} from './sdlc-controller-lease.mjs';
import { VALID_STEPS, defaultHerdr, parseArgs, readRun, runExecute, writeRun } from './sdlc-execute.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const BRIDGE_PORT = 'SDLC_EXECUTE_BRIDGE_PORT';
const BRIDGE_NONCE = 'SDLC_EXECUTE_BRIDGE_NONCE';

function takeBridgeEnvironment() {
  const port = Number(process.env[BRIDGE_PORT]);
  const nonce = process.env[BRIDGE_NONCE];
  delete process.env[BRIDGE_PORT];
  delete process.env[BRIDGE_NONCE];
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^[a-f0-9]{64}$/.test(nonce || '')) {
    throw new Error('controller_supervisor_bridge_missing');
  }
  return { port, nonce };
}

// Only control frames are bounded; the authenticated result keeps the existing
// stdout/stderr payload contract. Never include peer input (especially the nonce)
// in errors or logs.
function readMessages(socket, receive, failed, acceptsResult = () => false) {
  let buffered = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    buffered += chunk;
    let end;
    while ((end = buffered.indexOf('\n')) !== -1) {
      const frame = buffered.slice(0, end);
      buffered = buffered.slice(end + 1);
      try {
        if (!acceptsResult() && frame.length > 4096) throw new Error();
        const message = JSON.parse(frame);
        if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error();
        receive(message);
      } catch {
        failed();
        return;
      }
      if (socket.destroyed) return;
    }
    if (!acceptsResult() && buffered.length > 4096) failed();
  });
}

function writeMessage(socket, message) {
  return new Promise((resolve) => {
    if (socket.destroyed || !socket.writable) return resolve(false);
    socket.write(`${JSON.stringify(message)}\n`, (error) => resolve(!error));
  });
}

function sendMessage(target, message) {
  return new Promise((resolve) => {
    if (!target.connected) return resolve(false);
    target.send(message, (error) => resolve(!error));
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

async function runSupervisor(args, cancellation) {
  let parsed;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    return { status: 2, stdout: '', stderr: `${error.message}\n` };
  }
  if (cancellation.aborted) {
    return { status: cancellation.reason === 'SIGINT' ? 130 : 143, stdout: '', stderr: '' };
  }
  const controller = spawn(process.execPath, [SCRIPT, 'controller', args], {
    cwd: process.cwd(), env: process.env,
    detached: true, shell: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stdout = '';
  let stderr = '';
  controller.stdout.on('data', (chunk) => { stdout += chunk; });
  controller.stderr.on('data', (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve) => {
    controller.once('error', (error) => resolve({ code: 1, error }));
    controller.once('close', (code, signal) => resolve({ code, signal }));
  });
  let leaderLost = false;
  const exited = new Promise((resolve) => {
    // A dead leader's inherited pipes need not close until its group is stopped.
    controller.once('exit', (code, signal) => {
      if (signal || typeof code !== 'number') {
        leaderLost = true;
        resolve({ code, signal });
      }
    });
    closed.then(resolve);
  });
  let requestCancellation;
  const cancelled = new Promise((resolve) => { requestCancellation = resolve; });
  let cancelSignal = null;
  let finished = false;
  const cancel = (signal) => {
    if (finished || cancelSignal) return;
    cancelSignal = signal;
    requestCancellation({ cancelled: true });
  };
  const onCancel = () => cancel(cancellation.reason);
  cancellation.addEventListener('abort', onCancel, { once: true });
  if (cancellation.aborted) onCancel();

  const outcome = await Promise.race([exited, cancelled]);
  finished = true;
  cancellation.removeEventListener('abort', onCancel);
  let status = outcome.code ?? 1;
  if (cancelSignal || leaderLost) {
    status = cancelSignal ? (cancelSignal === 'SIGINT' ? 130 : 143) : 1;
    try {
      // Stop the group before reading its last checkpoint or releasing ownership.
      const cleanup = await (leaderLost ? terminateOwnedProcessGroupAfterLeaderLoss : terminateOwnedProcessGroup)(controller);
      if (!cleanup.ok) throw new Error(`controller_process_cleanup_failed: ${cleanup.error.message}`);
      await closed;
      cleanupCancelledRun(controller.pid, process.cwd(), parsed.retainWorker,
        cancelSignal ? 'controller_cancelled' : 'controller_process_lost');
    } catch (error) {
      stderr += `${error.message}\n`;
      // Failed termination must not hang on surviving children or release their lease.
      controller.stdout.destroy();
      controller.stderr.destroy();
      if (controller.connected) controller.disconnect();
      controller.unref();
    }
  }
  if (outcome.error) stderr += `${outcome.error.message}\n`;
  return { status, stdout, stderr };
}

// This process owns no controller. It must exit before the launcher can grant
// start, so a host's recursive cancellation of the launcher cannot reach the
// supervisor or anything the supervisor subsequently owns.
async function runBootstrap(args) {
  const { port, nonce } = takeBridgeEnvironment();
  if (!process.connected) throw new Error('controller_supervisor_invoker_lost');
  const supervisor = spawn(process.execPath, [SCRIPT, 'supervisor', args], {
    cwd: process.cwd(), env: { ...process.env, [BRIDGE_PORT]: String(port), [BRIDGE_NONCE]: nonce },
    detached: true, shell: false, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let ready = false;
  const abandon = () => {
    if (!ready) supervisor.kill('SIGTERM');
  };
  process.once('disconnect', abandon);
  process.once('SIGINT', abandon);
  process.once('SIGTERM', abandon);
  try {
    await new Promise((resolve, reject) => {
      supervisor.once('error', reject);
      supervisor.once('exit', () => reject(new Error('controller_supervisor_startup_failed')));
      supervisor.on('message', (message) => {
        if (message?.type !== 'ready' || ready) return;
        if (!process.connected) {
          abandon();
          return;
        }
        ready = true;
        supervisor.disconnect();
        supervisor.unref();
        resolve();
      });
    });
  } finally {
    process.removeListener('disconnect', abandon);
    process.removeListener('SIGINT', abandon);
    process.removeListener('SIGTERM', abandon);
    if (process.connected) process.disconnect();
  }
}

async function runDaemon(args) {
  const { port, nonce } = takeBridgeEnvironment();
  if (!process.connected) throw new Error('controller_supervisor_bootstrap_lost');
  const cancellation = new AbortController();
  const interrupt = () => cancellation.abort('SIGINT');
  const terminate = () => cancellation.abort('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  const socket = createConnection({ host: '127.0.0.1', port });
  let authenticated = false;
  let ready = false;
  let startRequested = false;
  let bootstrapDisconnected = !process.connected;
  let started = false;
  let finishStartup;
  const startup = new Promise((resolve) => { finishStartup = resolve; });
  const maybeStart = () => {
    if (startRequested && bootstrapDisconnected) finishStartup(true);
  };
  const disconnect = () => {
    bootstrapDisconnected = true;
    if (!ready) terminate();
    else maybeStart();
  };
  process.once('disconnect', disconnect);
  const cancelled = () => { if (!started) finishStartup(false); };
  cancellation.signal.addEventListener('abort', cancelled, { once: true });
  socket.on('error', terminate);
  socket.once('close', terminate);
  // A half-closed control connection has lost its owner just as completely.
  socket.once('end', terminate);
  socket.once('connect', () => {
    void writeMessage(socket, { type: 'authenticate', nonce });
  });
  readMessages(socket, (message) => {
    if (!authenticated && message.type === 'authenticated') {
      authenticated = true;
      ready = true;
      void sendMessage(process, { type: 'ready' }).then((sent) => {
        if (!sent) terminate();
      });
    } else if (authenticated && message.type === 'start' && !startRequested) {
      startRequested = true;
      maybeStart();
    } else if (authenticated && message.type === 'cancel'
      && ['SIGINT', 'SIGTERM'].includes(message.signal)) {
      cancellation.abort(message.signal);
    } else {
      socket.destroy();
    }
  }, () => socket.destroy());
  if (bootstrapDisconnected) terminate();
  try {
    const authorized = await startup;
    let result;
    if (authorized && !cancellation.signal.aborted) {
      started = true;
      result = await runSupervisor(args, cancellation.signal);
    } else {
      result = { status: cancellation.signal.reason === 'SIGINT' ? 130 : 143, stdout: '', stderr: '' };
    }
    await writeMessage(socket, { type: 'result', ...result });
    process.exitCode = result.status;
  } finally {
    await new Promise((resolve) => {
      if (socket.destroyed) resolve();
      else socket.end(resolve);
    });
    socket.destroy();
    if (process.connected) process.disconnect();
    process.removeListener('disconnect', disconnect);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    cancellation.signal.removeEventListener('abort', cancelled);
  }
}

export async function superviseExecute({ args = '', cwd = process.cwd(), env = process.env } = {}) {
  try {
    parseArgs(args);
  } catch (error) {
    return { status: 2, stdout: '', stderr: `${error.message}\n` };
  }
  const nonce = randomBytes(32).toString('hex');
  const connections = new Set();
  let channel = null;
  let bootstrap = null;
  let bootstrapClosed = null;
  let bootstrapExited = false;
  let started = false;
  let settled = false;
  let result = null;
  let stdout = '';
  let stderr = '';
  let cancelSignal = null;
  let settle;
  const outcome = new Promise((resolve) => {
    settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
  });
  const fail = (message) => settle({ status: 1, stdout, stderr: `${stderr}${message}\n` });
  const start = () => {
    if (!settled && channel && bootstrapExited && !started) {
      started = true;
      void writeMessage(channel, { type: 'start' }).then((sent) => {
        if (!sent) fail('controller_supervisor_transport_lost');
      });
    }
  };
  const cancel = (signal) => {
    if (cancelSignal || settled) return;
    cancelSignal = signal;
    if (started) void writeMessage(channel, { type: 'cancel', signal });
    else settle({ status: signal === 'SIGINT' ? 130 : 143, stdout, stderr });
  };
  const interrupt = () => cancel('SIGINT');
  const terminate = () => cancel('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  const server = createServer((socket) => {
    if (settled || channel) return socket.destroy();
    connections.add(socket);
    socket.on('error', () => {
      if (socket === channel) fail('controller_supervisor_transport_lost');
      socket.destroy();
    });
    socket.once('close', () => {
      connections.delete(socket);
      if (socket === channel) {
        if (result) settle(result);
        else fail('controller_supervisor_lost');
      }
    });
    readMessages(socket, (message) => {
      if (socket !== channel) {
        if (channel || message.type !== 'authenticate' || typeof message.nonce !== 'string'
          || message.nonce.length !== nonce.length
          || !timingSafeEqual(Buffer.from(message.nonce), Buffer.from(nonce))) {
          socket.destroy();
          return;
        }
        channel = socket;
        server.close();
        for (const extra of connections) if (extra !== socket) extra.destroy();
        void writeMessage(socket, { type: 'authenticated' });
        start();
      } else if (started && !result && message.type === 'result' && Number.isInteger(message.status)
        && typeof message.stdout === 'string' && typeof message.stderr === 'string') {
        result = { status: message.status, stdout: message.stdout, stderr: message.stderr };
      } else {
        socket.destroy();
      }
    }, () => socket.destroy(), () => socket === channel);
  });
  server.on('error', (error) => fail(error.message));
  try {
    await new Promise((resolve) => {
      server.once('listening', resolve);
      server.once('error', resolve);
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true });
    });
    if (!settled) {
      bootstrap = spawn(process.execPath, [SCRIPT, 'bootstrap', args], {
        cwd, env: { ...env, [BRIDGE_PORT]: String(server.address().port), [BRIDGE_NONCE]: nonce },
        shell: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      bootstrap.stdout.on('data', (chunk) => { stdout += chunk; });
      bootstrap.stderr.on('data', (chunk) => { stderr += chunk; });
      bootstrapClosed = new Promise((resolve) => bootstrap.once('close', (code) => {
        resolve();
        if (code !== 0) fail('controller_supervisor_startup_failed');
        else {
          bootstrapExited = true;
          if (!channel) fail('controller_supervisor_startup_failed');
          else start();
        }
      }));
      bootstrap.once('error', (error) => fail(error.message));
    }
    return await outcome;
  } catch (error) {
    return { status: 1, stdout, stderr: `${stderr}${error.message}\n` };
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    for (const socket of connections) socket.destroy();
    if (server.listening) server.close();
    // Disconnect asks a still-starting bootstrap to abandon its child. After
    // its successful exit, only the authenticated connection owns cancellation.
    if (bootstrap?.connected) bootstrap.disconnect();
    if (bootstrapClosed) await bootstrapClosed;
  }
}

if (isCliEntry(import.meta.url)) {
  const [mode, args = ''] = process.argv.slice(2);
  if (!process.send || !['bootstrap', 'supervisor', 'controller'].includes(mode)) {
    process.stderr.write('execute supervisor requires an owned IPC invocation\n');
    process.exitCode = 2;
  } else if (mode === 'controller') {
    const result = runExecute({ args });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.status;
    process.disconnect();
  } else {
    const operation = mode === 'bootstrap' ? runBootstrap : runDaemon;
    operation(args).catch((error) => {
      process.stderr.write(`${error.message}\n`);
      if (process.connected) process.disconnect();
      process.exitCode = 1;
    });
  }
}
