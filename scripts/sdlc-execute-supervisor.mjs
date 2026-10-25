#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { linkSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageRoot } from '../src/sdlc-workflows.mjs';
import { terminateOwnedProcessGroup, terminateOwnedProcessGroupAfterLeaderLoss } from '../src/process-supervision.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import {
  controllerLeasePath,
  readControllerLease,
  releaseControllerLease,
} from './sdlc-controller-lease.mjs';
import {
  defaultHerdr,
  parseArgs,
  runExecute,
} from './sdlc-execute.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const BRIDGE_PORT = 'SDLC_EXECUTE_BRIDGE_PORT';
const BRIDGE_NONCE = 'SDLC_EXECUTE_BRIDGE_NONCE';
// A supervised session: its id reaches the daemon and controller through this variable, and its
// reports, decisions and result live under `.nmg-sdlc/execute/<session>/`.
const SESSION_ENV = 'NMG_SDLC_EXECUTE_SESSION';
const SESSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Every supervised invocation returns within this budget, well inside the 600 s Bash tool timeout.
export const MAX_SESSION_WAIT_MS = 540_000;
const SESSION_POLL_MS = 250;
const DECISION_POLL_MS = 500;
const ORCHESTRATOR_CHECK_MS = 60_000;
const MAX_GUIDANCE_CHARS = 8000;
const EXECUTE_CLI = join(packageRoot, 'scripts', 'sdlc-execute.mjs');

export function sessionDirectory(cwd, session) {
  return join(cwd, '.nmg-sdlc', 'execute', session);
}
function sessionFromEnvironment(env = process.env) {
  return SESSION_PATTERN.test(env[SESSION_ENV] ?? '') ? env[SESSION_ENV] : null;
}
function writeAtomic(path, value) {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}
// Fails with EEXIST when the file already exists, so one decision answers one report.
function writeExclusive(path, value) {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try { linkSync(temporary, path); } finally { unlinkSync(temporary); }
}
function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}

function orchestratorGone(herdr, controllerPane) {
  try {
    return !parsedHerdrPanes(herdr).some((pane) => String(pane?.pane_id ?? pane?.paneId ?? '') === controllerPane);
  } catch { return false; }
}

/** The controller's supervise callback for a session: writes each report, then blocks until its
 * decision arrives. A closed orchestrator pane halts the run so its lease is never stranded. */
export function fileSupervisor({ dir, session, herdr, controllerPane, now = Date.now, sleep = pause,
  pollMs = DECISION_POLL_MS, paneCheckMs = ORCHESTRATOR_CHECK_MS }) {
  let seq = 0;
  return (report) => {
    seq += 1;
    writeAtomic(join(dir, `report-${seq}.json`), { schemaVersion: 1, session, seq, ...report });
    let checked = now();
    for (;;) {
      const decision = readJson(join(dir, `decision-${seq}.json`));
      if (decision?.session === session && decision.seq === seq) return { action: decision.action, text: decision.text };
      if (now() - checked >= paneCheckMs) {
        checked = now();
        if (orchestratorGone(herdr, controllerPane)) return { action: 'halt', text: 'orchestrator pane closed' };
      }
      sleep(pollMs);
    }
  };
}

function reportFiles(dir) {
  try {
    return readdirSync(dir).map((name) => Number(/^report-([1-9]\d*)\.json$/.exec(name)?.[1]))
      .filter(Number.isSafeInteger).sort((left, right) => left - right);
  } catch { return []; }
}
// The lowest-numbered report after `after` that has no decision yet.
function pendingReport(dir, session, after) {
  for (const seq of reportFiles(dir)) {
    if (seq <= after) continue;
    const report = readJson(join(dir, `report-${seq}.json`));
    if (report?.session === session && report.seq === seq && !readJson(join(dir, `decision-${seq}.json`))) return report;
  }
  return null;
}
function decideCommand(session, seq, action) {
  const text = ['accept', 'continue'].includes(action) ? '' : ' --text "<guidance or diagnosis>"';
  return `node ${JSON.stringify(EXECUTE_CLI)} decide --session ${session} --seq ${seq} ${action}${text}`;
}
function reportOutput(report) {
  return [
    `NMG_SDLC_EXECUTE_REPORT: session ${report.session} seq ${report.seq} (${report.kind} report for #${report.issue} ${report.stage})`,
    JSON.stringify(report, null, 2),
    'Answer with exactly one command:',
    ...report.decisions.map((action) => `  ${decideCommand(report.session, report.seq, action)}`),
    '',
  ].join('\n');
}
function runningOutput(session) {
  return `NMG_SDLC_EXECUTE_RUNNING: session ${session} has no new report yet; the controller is still working.\n`
    + `Resume with: node ${JSON.stringify(EXECUTE_CLI)} wait --session ${session}\n`;
}
function terminalResult(dir, session) {
  const result = readJson(join(dir, 'result.json'));
  if (result?.session !== session || !Number.isInteger(result.status)) return null;
  rmSync(dir, { recursive: true, force: true });
  return { status: result.status, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') };
}

/** Waits up to `waitMs` for the session's next report after `after`, or its result. SIGINT/SIGTERM
 * are forwarded to the session daemon, which cancels the run as `run` cancellation does. */
export async function awaitSession({ cwd = process.cwd(), session, after = 0, waitMs = MAX_SESSION_WAIT_MS } = {}) {
  const dir = sessionDirectory(cwd, session);
  const daemon = readJson(join(dir, 'daemon.json'));
  if (!SESSION_PATTERN.test(session ?? '') || daemon?.session !== session || !Number.isSafeInteger(daemon.pid)) {
    return terminalResult(dir, session) ?? { status: 2, stdout: '', stderr: `execute_session_unknown: ${session}\n` };
  }
  const forward = (signal) => { try { process.kill(daemon.pid, signal); } catch { /* already gone */ } };
  const interrupt = () => forward('SIGINT');
  const terminate = () => forward('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    const deadline = Date.now() + Math.min(waitMs, MAX_SESSION_WAIT_MS);
    for (;;) {
      const result = terminalResult(dir, session);
      if (result) return result;
      const report = pendingReport(dir, session, after);
      if (report) return { status: 0, stdout: reportOutput(report), stderr: '' };
      if (!processAlive(daemon.pid)) {
        return terminalResult(dir, session) ?? { status: 1, stdout: '', stderr: 'controller_supervisor_lost\n' };
      }
      if (Date.now() >= deadline) return { status: 0, stdout: runningOutput(session), stderr: '' };
      await new Promise((resolve) => setTimeout(resolve, SESSION_POLL_MS));
    }
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
}

/** Answers report `seq` with one of its allowed actions, then waits for what follows it. */
export async function decideSession({ cwd = process.cwd(), session, seq, action, text = '', waitMs } = {}) {
  const dir = sessionDirectory(cwd, session);
  const report = SESSION_PATTERN.test(session ?? '') && Number.isSafeInteger(seq) && seq > 0
    ? readJson(join(dir, `report-${seq}.json`)) : null;
  if (report?.session !== session || report.seq !== seq) {
    return { status: 2, stdout: '', stderr: `execute_report_unknown: session ${session} seq ${seq}\n` };
  }
  const guidance = String(text ?? '').trim();
  if (!report.decisions.includes(action)) {
    return { status: 2, stdout: '', stderr: `execute_decision_invalid: ${action} (allowed: ${report.decisions.join(', ')})\n` };
  }
  if (!['accept', 'continue'].includes(action) && (!guidance || guidance.length > MAX_GUIDANCE_CHARS)) {
    return { status: 2, stdout: '', stderr: `execute_decision_invalid: ${action} requires --text of 1-${MAX_GUIDANCE_CHARS} characters\n` };
  }
  try {
    writeExclusive(join(dir, `decision-${seq}.json`), { schemaVersion: 1, session, seq, action,
      ...(guidance ? { text: guidance } : {}) });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    return { status: 2, stdout: '', stderr: `execute_report_decided: session ${session} seq ${seq}\n` };
  }
  return awaitSession({ cwd, session, after: seq, waitMs });
}

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

function parsedHerdrPanes(herdr) {
  const response = herdr.listPanes();
  if (response?.status !== 0) throw new Error('ownership_unreadable');
  let parsed;
  try {
    parsed = typeof response.stdout === 'string' ? JSON.parse(response.stdout) : response;
  } catch {
    throw new Error('ownership_unreadable');
  }
  const panes = Array.isArray(parsed) ? parsed : parsed?.result?.panes ?? parsed?.panes;
  if (!Array.isArray(panes)) throw new Error('ownership_unreadable');
  return panes;
}

function cleanupCancelledRun(controllerPid, cwd, retainWorker, ownedPanes, ownedLease) {
  const lease = readControllerLease(cwd);
  // A controller without an authenticated lease announcement owns no cleanup.
  if (!lease) return;
  const root = realpathSync(cwd);
  const path = controllerLeasePath(root);
  const serialized = readFileSync(path, 'utf8');
  if (!ownedLease || lease.pid !== controllerPid || lease.projectRoot !== root
    || lease.runId !== ownedLease.runId || serialized !== ownedLease.serialized) {
    throw new Error('controller_cleanup_ownership_mismatch');
  }

  const run = (command, args, options = {}) => spawnSync(command, args, {
    cwd: root, encoding: 'utf8', ...options,
  });
  const herdr = defaultHerdr(run, root);
  let closeFailed = false;
  const live = parsedHerdrPanes(herdr);
  const controllerPaneId = lease.controllerPaneId;
  for (const paneId of ownedPanes) {
    if (!paneId || paneId === controllerPaneId) continue;
    if (retainWorker) continue;
    const isLive = live.some((p) => String(p?.pane_id ?? p?.paneId ?? '') === paneId);
    if (!isLive) continue;
    try {
      if (herdr.paneClose(paneId).status !== 0) closeFailed = true;
    } catch {
      closeFailed = true;
    }
  }
  // Failed close leaves lease for recovery; never false success.
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
  const ownedPanes = new Set();
  let ownedLease = null;
  controller.on('message', (message) => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'lease-acquired' && typeof message.runId === 'string') {
      try {
        const current = readControllerLease(process.cwd());
        const serialized = readFileSync(controllerLeasePath(process.cwd()), 'utf8');
        if (current?.pid === controller.pid && current.runId === message.runId
          && current.projectRoot === realpathSync(process.cwd())) {
          ownedLease = { runId: message.runId, serialized };
        }
      } catch {
        // No lease proof: cleanup must preserve the unknown controller state.
      }
    }
    if (message.type === 'owned-pane' || message.type === 'pane-closed') {
      const id = typeof message.paneId === 'string' ? message.paneId : (typeof message === 'string' ? message : null);
      if (id) {
        if (message.type === 'owned-pane') ownedPanes.add(id);
        else ownedPanes.delete(id);
      }
    }
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
      // Stop the group before releasing ownership. Close only panes reported via IPC for this invocation.
      const cleanup = await (leaderLost ? terminateOwnedProcessGroupAfterLeaderLoss : terminateOwnedProcessGroup)(controller);
      if (!cleanup.ok) throw new Error(`controller_process_cleanup_failed: ${cleanup.error.message}`);
      await closed;
      cleanupCancelledRun(controller.pid, process.cwd(), parsed.retainWorker, ownedPanes, ownedLease);
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
  const session = sessionFromEnvironment();
  const dir = session ? sessionDirectory(process.cwd(), session) : null;
  if (dir) writeAtomic(join(dir, 'daemon.json'), { schemaVersion: 1, session, pid: process.pid });
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
  // A supervised invoker detaches at a yield: losing its connection afterwards is not cancellation.
  let detached = false;
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
  const lost = () => { if (!detached) terminate(); };
  socket.on('error', lost);
  socket.once('close', lost);
  // A half-closed control connection has lost its owner just as completely.
  socket.once('end', lost);
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
    } else if (authenticated && message.type === 'detach' && dir && startRequested && !detached) {
      detached = true;
      void writeMessage(socket, { type: 'detached' });
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
    if (dir) writeAtomic(join(dir, 'result.json'), { schemaVersion: 1, session, ...result });
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

/** Runs execute through the authenticated bootstrap and daemon. Without `session` it waits for the
 * controller's result. With `session` it returns at the first report, or when `waitMs` passes, after
 * detaching from the daemon, which keeps the controller running for `decide` and `wait`. */
export async function superviseExecute({ args = '', cwd = process.cwd(), env = process.env, session = null,
  waitMs = MAX_SESSION_WAIT_MS } = {}) {
  try {
    parseArgs(args);
  } catch (error) {
    return { status: 2, stdout: '', stderr: `${error.message}\n` };
  }
  const childEnv = { ...env };
  delete childEnv[SESSION_ENV];
  if (session) {
    mkdirSync(sessionDirectory(cwd, session), { recursive: true });
    childEnv[SESSION_ENV] = session;
  }
  let yielded = null;
  let watch = null;
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
  // A supervised start yields its first report, or a running notice once the budget passes.
  const watchSession = () => {
    const dir = sessionDirectory(cwd, session);
    const deadline = Date.now() + Math.min(waitMs, MAX_SESSION_WAIT_MS);
    watch = setInterval(() => {
      if (settled || yielded) return;
      const report = pendingReport(dir, session, 0);
      if (!report && Date.now() < deadline) return;
      yielded = report ? reportOutput(report) : runningOutput(session);
      void writeMessage(channel, { type: 'detach' }).then((sent) => {
        if (!sent) fail('controller_supervisor_transport_lost');
      });
    }, SESSION_POLL_MS);
  };
  const start = () => {
    if (!settled && channel && bootstrapExited && !started) {
      started = true;
      void writeMessage(channel, { type: 'start' }).then((sent) => {
        if (!sent) fail('controller_supervisor_transport_lost');
      });
      if (session) watchSession();
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
      } else if (started && yielded && message.type === 'detached') {
        settle({ status: 0, stdout: yielded, stderr: '' });
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
        cwd, env: { ...childEnv, [BRIDGE_PORT]: String(server.address().port), [BRIDGE_NONCE]: nonce },
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
    const value = await outcome;
    // The controller finished before any yield: its session holds nothing further.
    if (session && value.stdout !== yielded) rmSync(sessionDirectory(cwd, session), { recursive: true, force: true });
    return value;
  } catch (error) {
    return { status: 1, stdout, stderr: `${stderr}${error.message}\n` };
  } finally {
    if (watch) clearInterval(watch);
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
    const session = sessionFromEnvironment();
    const run = (command, commandArgs, options = {}) => spawnSync(command, commandArgs, { encoding: 'utf8', ...options });
    const result = runExecute({
      args,
      ...(session ? { supervise: fileSupervisor({ dir: sessionDirectory(process.cwd(), session), session,
        herdr: defaultHerdr(run, process.cwd()), controllerPane: process.env.HERDR_PANE_ID }) } : {}),
      onOwnedPane: (paneId) => { if (process.send && typeof paneId === 'string') process.send({ type: 'owned-pane', paneId }); },
      onLeaseAcquired: (runId) => { if (process.send && typeof runId === 'string') process.send({ type: 'lease-acquired', runId }); },
      onPaneClosed: (paneId) => { if (process.send && typeof paneId === 'string') process.send({ type: 'pane-closed', paneId }); },
    });
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
