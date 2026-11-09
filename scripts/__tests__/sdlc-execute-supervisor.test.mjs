import { afterEach, describe, expect, it } from '@jest/globals';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createConnection } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { fileSupervisor, resultLines } from '../sdlc-execute-supervisor.mjs';
import { validateHostRequest } from '../../src/execute-host.mjs';
import { STAGE_MODEL_DEFAULTS, STAGE_MODELS_PATH } from '../sdlc-models.mjs';

const EXECUTE = fileURLToPath(new URL('../sdlc-execute.mjs', import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REPORT = /^NMG_SDLC_EXECUTE_REPORT: session ([0-9a-f-]{36}) seq (\d+) \((\w+) report for #42 (\w+)\)$/m;
const SESSION_LINE = /^NMG_SDLC_EXECUTE_SESSION: ([0-9a-f-]{36})$/m;
const CLAUDE_HEARTBEAT = 'fixture-claude-session';
const posix = process.platform === 'win32' ? describe.skip : describe;

const fixtures = [];
const tempDirs = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

async function until(read, detail) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() >= deadline) throw new Error(`Did not observe ${detail}`);
    await pause();
  }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

// A pid that is absent or no longer running.
const gone = (pid) => pid === null || pid === undefined || !alive(pid);

function sendSignal(pid, sig) {
  try { process.kill(pid, sig); } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function descendantTree(rootPid) {
  const snapshot = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' });
  if (snapshot.status !== 0) throw new Error(snapshot.stderr);
  const parents = snapshot.stdout.trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
  const owned = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of parents) {
      if (owned.has(ppid) && !owned.has(pid)) {
        owned.add(pid);
        changed = true;
      }
    }
  }
  return [...owned];
}

async function refusesConnection(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', (error) => {
      socket.destroy();
      resolve(error.code === 'ECONNREFUSED');
    });
  });
}

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd, encoding: 'utf8', env: {
      ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeAtomic(file, value) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function tempDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-session-')));
  tempDirs.push(dir);
  return dir;
}

function sessionDirsOf(root) {
  try {
    return fs.readdirSync(path.join(root, '.nmg-sdlc', 'execute')).filter((name) => UUID.test(name));
  } catch { return []; }
}

// The one session directory a fixture root holds, or null once it has been removed.
function sessionDirOf(root) {
  const [session] = sessionDirsOf(root);
  return session ? path.join(root, '.nmg-sdlc', 'execute', session) : null;
}

function requestNumbers(dir) {
  try {
    return fs.readdirSync(dir).map((name) => Number(/^request-([1-9]\d*)\.json$/.exec(name)?.[1]))
      .filter(Number.isSafeInteger);
  } catch { return []; }
}

// Every request the controller or supervisor wrote into a session directory that still exists.
function requestsOf(dir) {
  return requestNumbers(dir).map((n) => readJson(path.join(dir, `request-${n}.json`))).filter(Boolean);
}

// The agent ids a session directory asks to stop.
const stopsIn = (dir) => requestsOf(dir).filter((request) => request.kind === 'stop').map((request) => request.agentId);

const workerStarted = (value) => {
  const dir = sessionDirOf(value.root);
  return dir !== null && fs.existsSync(path.join(dir, 'worker.json'));
};

// The hooks module, in-process: it answers each request the controller writes into the session directory,
// keeps the session heartbeat (host.json) fresh, and writes each stage subagent's handoff when it settles.
// Modes: `running` keeps the subagent working; `reports` settles each subagent one second after spawn,
// with a failed implement handoff; `stall` never answers a spawn request. A `paused` responder writes no
// heartbeat and answers nothing until it is unpaused, as the hooks module's bridge does before supervise returns.
function startResponder(root, { mode, denyStop, paused = false }) {
  const responder = { spawns: [], stops: [], invalid: [], other: [], handled: new Set(), flips: [], attempts: 0, paused };
  const answer = (dir, session, n, fields) => writeAtomic(path.join(dir, `response-${n}.json`),
    { schemaVersion: 1, session, n, ...fields });
  const writeAgent = (dir, agentId, status, at) => writeAtomic(path.join(dir, `agent-${agentId}.json`), {
    schemaVersion: 1, agentId, status, toolCalls: [], latestText: '', lastActivityAt: at, turns: [], stopped: false, updatedAt: at,
  });
  const serve = (dir, session, n, request) => {
    const verdict = validateHostRequest(request);
    if (!verdict.ok) {
      responder.invalid.push(request);
      answer(dir, session, n, { ok: false, deny: verdict.deny });
      return;
    }
    if (request.kind === 'spawn') {
      responder.spawns.push(request);
      if (mode === 'stall') return;
      const agentId = `agent-${n}`;
      const at = Date.now();
      writeAgent(dir, agentId, 'running', at);
      if (mode === 'reports') {
        responder.attempts += 1;
        responder.flips.push({ dir, agentId, request, attempt: responder.attempts, at: at + 1000 });
      }
      answer(dir, session, n, { ok: true, agentId });
    } else if (request.kind === 'stop') {
      responder.stops.push(request);
      answer(dir, session, n, denyStop ? { ok: false, deny: 'nmg-sdlc: stop refused by fixture' } : { ok: true });
    } else {
      responder.other.push(request);
      answer(dir, session, n, { ok: true });
    }
  };
  const tick = () => {
    if (responder.paused) return;
    for (const session of sessionDirsOf(root)) {
      const dir = path.join(root, '.nmg-sdlc', 'execute', session);
      try {
        writeAtomic(path.join(dir, 'host.json'), { schemaVersion: 1, claudeSessionId: CLAUDE_HEARTBEAT, at: Date.now() });
        for (const n of requestNumbers(dir)) {
          const key = `${session}:${n}`;
          if (responder.handled.has(key)) continue;
          const request = readJson(path.join(dir, `request-${n}.json`));
          if (!request) continue;
          responder.handled.add(key);
          serve(dir, session, n, request);
        }
      } catch { /* the session directory ended while it was being served */ }
    }
    const now = Date.now();
    const due = responder.flips.filter((flip) => flip.at <= now);
    responder.flips = responder.flips.filter((flip) => flip.at > now);
    for (const flip of due) {
      try {
        const { request } = flip;
        const handoffs = path.join(request.cwd, '.nmg-sdlc', 'handoffs');
        fs.mkdirSync(handoffs, { recursive: true });
        writeAtomic(path.join(handoffs, `${request.issue}-${request.step}.json`), {
          schemaVersion: 1, issue: request.issue, step: request.step, status: 'failed', intervention: false,
          summary: `attempt ${flip.attempt}`, artifacts: [], next: request.step, reasonCode: 'tests_failed',
        });
        writeAgent(flip.dir, flip.agentId, 'idle', Date.now());
      } catch { /* the session directory ended before the subagent settled */ }
    }
  };
  responder.timer = setInterval(() => {
    try { tick(); } catch { /* keep serving */ }
  }, 20);
  responder.stop = () => clearInterval(responder.timer);
  return responder;
}

async function fixture({ mode = 'running', denyStop = false, ghAuthFails = false, inheritedPipes = false,
  holdBootstrap = false, startupFailure = false, probePeer = false, ancestorModule = false,
  claudeSession = null, waitSeconds = 540, checkIn = null, bridgeAfterSupervise = false } = {}) {
  // An ancestor `"type": "module"` package.json (as a system temporary directory may hold) must not
  // change how the extensionless fixture commands load.
  const parent = ancestorModule ? fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-module-'))) : null;
  if (parent) fs.writeFileSync(path.join(parent, 'package.json'), '{"type":"module"}\n');
  const root = parent ? path.join(parent, 'project')
    : fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-cancel-')));
  fs.mkdirSync(root, { recursive: true });
  const runtime = path.join(root, '.nmg-sdlc');
  const bin = path.join(runtime, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'package.json'), '{"type":"commonjs"}\n');
  const spec = path.join(root, 'specs/42-ship-it');
  fs.mkdirSync(spec, { recursive: true });
  for (const file of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
    fs.writeFileSync(path.join(spec, file), '**Issue**: #42\n**Status**: Approved\n');
  }
  fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\n');
  // The project commits its stage configuration, so controller output carries no missing-file warning.
  fs.mkdirSync(path.join(root, path.dirname(STAGE_MODELS_PATH)), { recursive: true });
  fs.writeFileSync(path.join(root, STAGE_MODELS_PATH), `${JSON.stringify(STAGE_MODEL_DEFAULTS, null, 2)}\n`);
  git(root, ['init', '-b', 'main']);
  git(root, ['add', '.gitignore', STAGE_MODELS_PATH]);
  git(root, ['commit', '-m', 'chore: baseline']);
  git(root, ['checkout', '-b', '42-ship-it']);
  git(root, ['add', 'specs']);
  git(root, ['commit', '-m', 'fixture']);
  const origin = path.join(runtime, 'origin.git');
  git(root, ['init', '--bare', origin]);
  git(root, ['remote', 'add', 'origin', origin]);
  // The default branch is published on origin behind the issue branch, as a real repository has it.
  git(root, ['push', 'origin', 'main']);
  git(root, ['push', '-u', 'origin', '42-ship-it']);
  // Uncommitted partial work makes the controller dispatch the implement subagent.
  fs.writeFileSync(path.join(root, 'partial.txt'), 'in progress\n');

  const leasePath = path.join(runtime, 'controller.lock');
  const supervisorPath = path.join(runtime, 'supervisor.json');
  const bootstrapReady = path.join(runtime, 'bootstrap-ready');
  const bootstrapRelease = path.join(runtime, 'bootstrap-release');
  const controllerStarted = path.join(runtime, 'controller-started.json');
  const descendantPath = path.join(runtime, 'descendant.pid');
  const peerRefused = path.join(runtime, 'peer-refused');
  const extraClosed = path.join(runtime, 'extra-closed');

  const preload = path.join(bin, 'controller-fixture.mjs');
  fs.writeFileSync(preload, `
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createConnection } from 'node:net';
if (process.argv[2] === 'bootstrap') {
  if (${holdBootstrap}) {
    const hold = setInterval(() => {
      if (fs.existsSync(${JSON.stringify(bootstrapRelease)})) clearInterval(hold);
    }, 20);
    process.once('disconnect', () => fs.writeFileSync(${JSON.stringify(bootstrapReady)}, String(process.pid)));
  }
  if (${probePeer}) {
    const port = Number(process.env.SDLC_EXECUTE_BRIDGE_PORT);
    await new Promise((resolve, reject) => {
      const intruder = createConnection({ host: '127.0.0.1', port });
      intruder.once('error', reject);
      intruder.once('connect', () => intruder.write(JSON.stringify({ type: 'authenticate', nonce: 'wrong' })+'\\n'));
      intruder.once('data', () => reject(new Error('Unauthenticated peer was accepted')));
      intruder.once('close', () => {
        fs.writeFileSync(${JSON.stringify(peerRefused)}, '');
        resolve();
      });
    });
    const extra = createConnection({ host: '127.0.0.1', port });
    extra.on('error', () => {});
    extra.once('close', () => fs.writeFileSync(${JSON.stringify(extraClosed)}, ''));
  }
}
if (process.argv[2] === 'supervisor') {
  fs.writeFileSync(${JSON.stringify(supervisorPath)}, JSON.stringify({
    pid: process.pid, bootstrapPid: process.ppid, port: Number(process.env.SDLC_EXECUTE_BRIDGE_PORT),
  }));
  if (${startupFailure}) process.exit(17);
}
if (process.argv[2] === 'controller') {
  fs.writeFileSync(${JSON.stringify(controllerStarted)}, JSON.stringify({
    pid: process.pid, supervisorPid: process.ppid,
    bridgeSecretsPresent: ['SDLC_EXECUTE_BRIDGE_PORT', 'SDLC_EXECUTE_BRIDGE_NONCE'].some(key => key in process.env),
  }));
  // An owned descendant of the controller, as a stage command would be; it shares the controller's process group.
  const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: ${inheritedPipes} ? ['ignore', 'inherit', 'inherit'] : 'ignore',
  });
  // Unreferenced, so a controller that ends on its own (no worker to wait for) is not held open by its descendant.
  descendant.unref();
  fs.writeFileSync(${JSON.stringify(descendantPath)}, String(descendant.pid));
}
`);
  const command = (name, content) => {
    const file = path.join(bin, name);
    fs.writeFileSync(file, `#!/usr/bin/env node\n${content}`);
    fs.chmodSync(file, 0o755);
  };
  command('gh', `const args = process.argv.slice(2);
const out = value => { console.log(typeof value === 'string' ? value : JSON.stringify(value)); process.exit(0); };
if (args[0] === 'auth') { if (${ghAuthFails}) process.exit(1); out(''); }
if (args[0] === 'repo') out(args.includes('--jq') ? 'main' : {nameWithOwner:'acme/widgets'});
if (args[0] === 'api' && args.includes('--paginate')) out([[]]);
if (args[0] === 'pr' && args[1] === 'list') out([]);
if (args[0] === 'api') out({id:4200,number:42,state:'open',title:'Ship It',repository_url:'https://api.github.com/repos/acme/widgets'});
if (args[0] === 'issue' && args.some(arg => arg.includes('labels'))) out({number:42,labels:[{name:'spec-created'}]});
if (args[0] === 'issue') out({title:'Ship It'});
throw new Error('Unexpected gh command: '+args.join(' '));\n`);

  const childEnv = {
    ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${pathToFileURL(preload).href}`,
  };
  // Only the fixture's own Claude session id reaches the launcher; an ambient one must not leak in.
  delete childEnv.NMG_SDLC_CLAUDE_SESSION_ID;
  delete childEnv.NMG_SDLC_EXECUTE_SESSION;
  if (claudeSession) childEnv.NMG_SDLC_CLAUDE_SESSION_ID = claudeSession;

  const responder = startResponder(root, { mode, denyStop, paused: bridgeAfterSupervise });
  const args = ['supervise', ...(checkIn ? ['--check-in-seconds', String(checkIn)] : []),
    '--wait-seconds', String(waitSeconds), '#42'];
  const child = spawn('node', [EXECUTE, ...args], {
    cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve) => child.once('close', (code, exitSignal) => {
    // The hooks module starts its bridge once the supervise call has returned its session line.
    responder.paused = false;
    resolve({ code, signal: exitSignal, stdout, stderr });
  }));
  const value = {
    root, parent, childEnv, runtime, child, done, responder, foreign: null,
    leasePath, supervisorPath, bootstrapReady, bootstrapRelease, controllerStarted, descendantPath,
    peerRefused, extraClosed,
    sessionDir: () => sessionDirOf(root),
    controllerPid: () => readJson(controllerStarted)?.pid ?? null,
    descendantPid: () => {
      try { return Number(fs.readFileSync(descendantPath, 'utf8')); } catch { return null; }
    },
  };
  fixtures.push(value);
  return value;
}

const cli = (value, args) => new Promise((resolve) => {
  const child = spawn('node', [EXECUTE, ...args], { cwd: value.root, stdio: ['ignore', 'pipe', 'pipe'], env: value.childEnv });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('close', (code) => resolve({ code, stdout, stderr }));
});

function cliSync(cwd, args) {
  const response = spawnSync('node', [EXECUTE, ...args], { cwd, encoding: 'utf8' });
  return { code: response.status, stdout: response.stdout, stderr: response.stderr };
}

const reportOf = (stdout) => {
  const header = REPORT.exec(stdout);
  if (!header) throw new Error(`no report in: ${stdout}`);
  return { session: header[1], seq: Number(header[2]), kind: header[3], stage: header[4] };
};

// The session id a supervise invocation names on its first line.
const sessionOf = (stdout) => {
  const line = SESSION_LINE.exec(stdout);
  if (!line) throw new Error(`no session line in: ${stdout}`);
  return line[1];
};

const PROTOCOL = /^NMG_SDLC_EXECUTE_(WORKER|REPORT|RUNNING):/m;

// Asks `wait` again while it answers with a protocol line; the first answer that is not one is the terminal result.
async function awaitTerminal(value, session, first) {
  let response = first;
  const deadline = Date.now() + 60_000;
  while (PROTOCOL.test(response.stdout)) {
    if (Date.now() >= deadline) throw new Error(`controller still running: ${response.stdout}`);
    response = await cli(value, ['wait', '--session', session, '--wait-seconds', '5']);
  }
  return response;
}

// `wait` answers with the worker while its subagent runs and with the pending report once one exists, so the
// supervising session asks again until a report after `after` is pending.
async function awaitReport(value, session, after) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const response = await cli(value, ['wait', '--session', session, '--after', String(after), '--wait-seconds', '5']);
    if (response.code !== 0) throw new Error(`wait failed: ${response.stderr}`);
    if (REPORT.test(response.stdout)) return { ...reportOf(response.stdout), stdout: response.stdout };
    if (Date.now() >= deadline) throw new Error(`no report after ${after}: ${response.stdout}`);
    await pause();
  }
}

afterEach(async () => {
  for (const value of fixtures.splice(0)) {
    value.responder.stop();
    if (value.child.exitCode === null && value.child.signalCode === null) sendSignal(value.child.pid, 'SIGKILL');
    // The controller leads its own process group, as does its descendant's group when it has one.
    const controller = value.controllerPid();
    if (controller) sendSignal(-controller, 'SIGKILL');
    const descendant = value.descendantPid();
    if (descendant) sendSignal(descendant, 'SIGKILL');
    if (fs.existsSync(value.supervisorPath)) {
      const supervisor = readJson(value.supervisorPath);
      // Exact fixture-recorded PIDs only; these are fallback cleanup, never proof.
      for (const pid of [supervisor?.bootstrapPid, supervisor?.pid]) if (pid) sendSignal(pid, 'SIGKILL');
    }
    if (value.foreign && value.foreign.exitCode === null && value.foreign.signalCode === null) {
      const exited = new Promise((resolve) => value.foreign.once('close', resolve));
      sendSignal(-value.foreign.pid, 'SIGKILL');
      await exited;
    }
    fs.rmSync(value.parent ?? value.root, { recursive: true, force: true });
  }
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

posix('execute CLI cancellation of its stage subagent and lease', () => {
  it('survives host cancellation of the invoking process tree and releases the lease it held', async () => {
    // Stall mode keeps the launcher attached: a launcher yields as soon as its subagent runs.
    const value = await fixture({ mode: 'stall' });
    await until(() => value.responder.spawns.length > 0, 'the spawn request written');
    const supervisor = readJson(value.supervisorPath);
    value.foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
    // Only the launcher's descendants by OS ancestry: the detached daemon and controller are not among them.
    const captured = descendantTree(value.child.pid);
    for (const pid of captured) sendSignal(pid, 'SIGKILL');
    expect((await value.done).signal).toBe('SIGKILL');
    await until(() => !fs.existsSync(value.leasePath), 'the lease released after the launcher tree was cancelled');
    expect(captured).not.toContain(supervisor.pid);
    expect(captured).not.toContain(value.controllerPid());
    await until(() => [supervisor.pid, value.controllerPid(), value.descendantPid()].every(gone),
      'the daemon, controller and descendant exiting before teardown');
    expect(alive(value.foreign.pid)).toBe(true);
    expect(await refusesConnection(supervisor.port)).toBe(true);
  }, 30_000);

  it.each(['bootstrap-loss', 'daemon-startup'])('fails %s before creating controller ownership', async (failure) => {
    const value = await fixture({ holdBootstrap: failure === 'bootstrap-loss', startupFailure: failure === 'daemon-startup' });
    const supervisor = await until(() => readJson(value.supervisorPath), 'the fixture supervisor starting');
    if (failure === 'bootstrap-loss') {
      await until(() => fs.existsSync(value.bootstrapReady), 'authenticated readiness before bootstrap loss');
      sendSignal(supervisor.bootstrapPid, 'SIGKILL');
    }
    const result = await value.done;
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('controller_supervisor_startup_failed');
    expect(fs.existsSync(value.controllerStarted)).toBe(false);
    expect(fs.existsSync(value.leasePath)).toBe(false);
    expect(value.responder.spawns).toEqual([]);
    await until(() => !alive(supervisor.pid) && !alive(supervisor.bootstrapPid), 'failed startup processes exiting');
    expect(await refusesConnection(supervisor.port)).toBe(true);
  }, 30_000);

  it('rejects unauthenticated peers without surrendering invocation ownership', async () => {
    const value = await fixture({ mode: 'stall', probePeer: true, holdBootstrap: true });
    await until(() => fs.existsSync(value.bootstrapReady), 'the ready bootstrap held before exit');
    const supervisor = await until(() => readJson(value.supervisorPath), 'the supervisor recorded');
    const unsafeTree = descendantTree(value.child.pid);
    expect(unsafeTree).toContain(supervisor.bootstrapPid);
    expect(unsafeTree).toContain(supervisor.pid);
    expect(fs.existsSync(value.controllerStarted)).toBe(false);
    expect(fs.existsSync(value.leasePath)).toBe(false);
    fs.writeFileSync(value.bootstrapRelease, '');
    await until(() => fs.existsSync(value.controllerStarted), 'the controller starting after release');
    await until(() => value.responder.spawns.length > 0, 'the controller requesting its subagent');
    await until(() => !alive(supervisor.bootstrapPid), 'the bootstrap exiting after handing off');
    expect(fs.existsSync(value.peerRefused)).toBe(true);
    expect(fs.existsSync(value.extraClosed)).toBe(true);
    expect(readJson(value.controllerStarted).bridgeSecretsPresent).toBe(false);
    expect(await refusesConnection(supervisor.port)).toBe(true);
    value.child.kill('SIGTERM');
    expect((await value.done).code).toBe(143);
    await until(() => !fs.existsSync(value.leasePath), 'the lease released after cancellation');
    await until(() => [supervisor.pid, value.controllerPid(), value.descendantPid()].every(gone),
      'the owned processes exiting after cancellation');
  }, 30_000);

  it('releases the daemon and listener after an ordinary controller error result', async () => {
    const value = await fixture({ ghAuthFails: true });
    const result = await value.done;
    expect(result.code).toBe(1);
    expect(result.stdout.split('\n')[0]).toMatch(/^NMG_SDLC_EXECUTE_SESSION: [0-9a-f-]{36}$/);
    expect(result.stderr).toContain('gh auth status failed');
    expect(fs.existsSync(value.leasePath)).toBe(false);
    expect(value.responder.spawns).toEqual([]);
    expect(sessionDirOf(value.root)).toBeNull();
    const supervisor = readJson(value.supervisorPath);
    await until(() => !alive(supervisor.pid) && !alive(supervisor.bootstrapPid), 'normal daemon completion');
    expect(await refusesConnection(supervisor.port)).toBe(true);
  }, 30_000);

  it.each([['SIGINT', 130], ['SIGTERM', 143], ['SIGKILL', null]])(
    'a %s to the invoking process cancels its controller while the launcher is still attached', async (sig, exitCode) => {
      // Stall mode: no subagent starts, so the launcher stays attached until the signal reaches it.
      const value = await fixture({ mode: 'stall' });
      await until(() => value.responder.spawns.length > 0, 'the spawn request written');
      value.foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
      value.child.kill(sig);
      const result = await value.done;
      expect(result.code).toBe(exitCode);
      await until(() => !fs.existsSync(value.leasePath), 'durable cancellation after launcher exit');
      await until(() => [value.controllerPid(), value.descendantPid()].every(gone), 'the controller and descendant exiting');
      expect(alive(value.foreign.pid)).toBe(true);
      expect(value.responder.stops).toEqual([]);
    }, 30_000);

  it('forwards SIGTERM from a blocked wait to the session daemon, which returns its cancelled result', async () => {
    const value = await fixture({ mode: 'stall', waitSeconds: 2 });
    const started = await value.done;
    expect(started.code).toBe(0);
    expect(started.stdout).toContain('NMG_SDLC_EXECUTE_RUNNING');
    const session = sessionOf(started.stdout);
    await until(() => value.responder.spawns.length > 0, 'the spawn request written');
    const waiting = spawn('node', [EXECUTE, 'wait', '--session', session, '--wait-seconds', '20'],
      { cwd: value.root, stdio: ['ignore', 'pipe', 'pipe'], env: value.childEnv });
    let stdout = '';
    waiting.stdout.on('data', (chunk) => { stdout += chunk; });
    const closed = new Promise((resolve) => waiting.once('close', (code) => resolve(code)));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    waiting.kill('SIGTERM');
    expect(await closed).toBe(143);
    expect(stdout).toBe('');
    expect(fs.existsSync(value.leasePath)).toBe(false);
    expect(await cli(value, ['wait', '--session', session]))
      .toMatchObject({ code: 2, stderr: `execute_session_unknown: ${session}\n` });
  }, 30_000);

  it('returns from supervise while the first spawn waits on a bridge that starts only after it, then starts the subagent', async () => {
    const begun = Date.now();
    const value = await fixture({ bridgeAfterSupervise: true, waitSeconds: 120 });
    const started = await value.done;
    expect(started.code).toBe(0);
    expect(Date.now() - begun).toBeLessThan(25_000);
    expect(started.stdout.split('\n')[0]).toMatch(/^NMG_SDLC_EXECUTE_SESSION: [0-9a-f-]{36}$/);
    expect(started.stdout).toContain('NMG_SDLC_EXECUTE_RUNNING');
    expect(started.stderr).not.toContain('supervising_session_lost');
    const session = sessionOf(started.stdout);
    const dir = path.join(value.root, '.nmg-sdlc', 'execute', session);
    const waited = await cli(value, ['wait', '--session', session, '--wait-seconds', '20']);
    expect(waited.code).toBe(0);
    expect(JSON.parse(/^NMG_SDLC_EXECUTE_WORKER: (.+)$/m.exec(waited.stdout)[1]))
      .toEqual({ issue: 42, stage: 'implement', agentId: 'agent-1' });
    expect(value.responder.spawns).toHaveLength(1);
    sendSignal(readJson(path.join(dir, 'daemon.json')).pid, 'SIGTERM');
    const outcome = await until(() => readJson(path.join(dir, 'result.json')), 'the daemon recording its cancelled result');
    expect(outcome).toMatchObject({ session, status: 143 });
    expect(outcome.stderr).not.toContain('supervising_session_lost');
  }, 60_000);

  it('cancels a running subagent when its supervising daemon is terminated, then reports the terminal result', async () => {
    const value = await fixture({ waitSeconds: 2 });
    const started = await value.done;
    expect(started.code).toBe(0);
    const session = sessionOf(started.stdout);
    const dir = path.join(value.root, '.nmg-sdlc', 'execute', session);
    await until(() => fs.existsSync(path.join(dir, 'worker.json')), 'the running subagent recorded');
    const waited = await cli(value, ['wait', '--session', session, '--wait-seconds', '5']);
    expect(waited.code).toBe(0);
    expect(JSON.parse(/^NMG_SDLC_EXECUTE_WORKER: (.+)$/m.exec(waited.stdout)[1]))
      .toEqual({ issue: 42, stage: 'implement', agentId: 'agent-1' });
    sendSignal(readJson(path.join(dir, 'daemon.json')).pid, 'SIGTERM');
    const outcome = await until(() => readJson(path.join(dir, 'result.json')), 'the daemon recording its cancelled result');
    expect(outcome).toMatchObject({ session, status: 143 });
    expect(stopsIn(dir)).toEqual(['agent-1']);
    expect(fs.existsSync(value.leasePath)).toBe(false);
    expect(value.responder.invalid).toEqual([]);
    expect(await cli(value, ['wait', '--session', session])).toMatchObject({ code: 143, stdout: '' });
    expect(await cli(value, ['wait', '--session', session]))
      .toMatchObject({ code: 2, stderr: `execute_session_unknown: ${session}\n` });
  }, 30_000);

  it('preserves a replacement controller lease and requests no stop it cannot prove is its own', async () => {
    const value = await fixture({ waitSeconds: 1 });
    const started = await value.done;
    expect(started.code).toBe(0);
    const session = sessionOf(started.stdout);
    const dir = path.join(value.root, '.nmg-sdlc', 'execute', session);
    await until(() => fs.existsSync(path.join(dir, 'worker.json')), 'the running subagent recorded');
    const replacement = { ...readJson(value.leasePath), runId: 'replacement' };
    fs.writeFileSync(value.leasePath, JSON.stringify(replacement));
    sendSignal(readJson(path.join(dir, 'daemon.json')).pid, 'SIGINT');
    const outcome = await until(() => readJson(path.join(dir, 'result.json')), 'the daemon recording its cancelled result');
    expect(outcome).toMatchObject({ status: 130, stderr: expect.stringContaining('controller_cleanup_ownership_mismatch') });
    expect(readJson(value.leasePath)).toEqual(replacement);
    expect(stopsIn(dir)).toEqual([]);
  }, 30_000);

  it.each([false, true])('cleans the controller descendants after its direct SIGKILL (inherited pipes: %s)', async (inheritedPipes) => {
    const value = await fixture({ inheritedPipes, waitSeconds: 2 });
    const started = await value.done;
    expect(started.code).toBe(0);
    const session = sessionOf(started.stdout);
    const dir = path.join(value.root, '.nmg-sdlc', 'execute', session);
    await until(() => fs.existsSync(path.join(dir, 'worker.json')), 'the running subagent recorded');
    value.foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
    sendSignal(value.controllerPid(), 'SIGKILL');
    const outcome = await until(() => readJson(path.join(dir, 'result.json')), 'the daemon recording the controller loss');
    expect(outcome.status).toBe(1);
    expect(fs.existsSync(value.leasePath)).toBe(false);
    expect(stopsIn(dir)).toEqual(['agent-1']);
    await until(() => gone(value.descendantPid()), 'the owned descendant exiting before teardown');
    expect(alive(value.foreign.pid)).toBe(true);
  }, 30_000);

  it('runs the commonjs fixture commands under an ancestor "type": "module" package.json', async () => {
    const value = await fixture({ mode: 'stall', ancestorModule: true });
    expect(JSON.parse(fs.readFileSync(path.join(value.parent, 'package.json'), 'utf8'))).toEqual({ type: 'module' });
    expect(JSON.parse(fs.readFileSync(path.join(value.runtime, 'bin/package.json'), 'utf8'))).toEqual({ type: 'commonjs' });
    await until(() => fs.existsSync(value.controllerStarted), 'the commonjs-hosted controller starting');
    value.child.kill('SIGTERM');
    expect((await value.done).code).toBe(143);
    await until(() => !fs.existsSync(value.leasePath), 'the lease released after cancellation');
  }, 30_000);

  it('prints the session line, yields stage reports across invocations, and halts with its subagent stopped', async () => {
    const value = await fixture({ mode: 'reports', waitSeconds: 20 });
    const started = await value.done;
    expect(started.code).toBe(0);
    expect(started.stdout.split('\n')[0]).toMatch(/^NMG_SDLC_EXECUTE_SESSION: [0-9a-f-]{36}$/);
    const session = sessionOf(started.stdout);
    // The launcher yields the running subagent at once; the supervising session then waits for its report.
    const first = await awaitReport(value, session, 0);
    expect(first).toMatchObject({ seq: 1, kind: 'stage', stage: 'implement' });
    expect(first.stdout).toContain(`decide --session ${session} --seq 1 accept`);
    expect(first.stdout).toContain(`decide --session ${session} --seq 1 halt --text "<guidance or diagnosis>"`);
    const sessionDir = path.join(value.root, '.nmg-sdlc', 'execute', session);
    const lease = readJson(value.leasePath);
    expect(() => process.kill(lease.pid, 0)).not.toThrow();
    // The controller outlives the invocation that started it and still holds its lease.
    expect(readJson(path.join(sessionDir, 'report-1.json'))).toMatchObject({ session, seq: 1,
      kind: 'stage', issue: 42, stage: 'implement', agentId: 'agent-1',
      handoff: { status: 'failed', reasonCode: 'tests_failed' } });
    expect(readJson(path.join(sessionDir, 'report-1.json'))).not.toHaveProperty('pane');

    // `wait` re-prints a pending report without answering it.
    const pending = await cli(value, ['wait', '--session', session, '--after', '0', '--wait-seconds', '5']);
    expect(pending.code).toBe(0);
    expect(reportOf(pending.stdout)).toEqual({ session, seq: 1, kind: 'stage', stage: 'implement' });

    const invalid = await cli(value, ['decide', '--session', session, '--seq', '1', 'continue']);
    expect(invalid).toMatchObject({ code: 2, stderr: expect.stringContaining('execute_decision_invalid: continue') });

    const accepted = await cli(value, ['decide', '--session', session, '--seq', '1', 'accept', '--wait-seconds', '20']);
    expect(accepted.code).toBe(0);
    const next = await awaitReport(value, session, 1);
    expect(next).toMatchObject({ session, seq: 2, kind: 'stage', stage: 'implement' });
    expect(readJson(value.leasePath)).toEqual(lease);
    expect(readJson(path.join(sessionDir, 'report-2.json'))).toMatchObject({ agentId: 'agent-2',
      failureHistory: [expect.objectContaining({ step: 'implement', reasonCode: 'tests_failed' })] });

    const again = await cli(value, ['decide', '--session', session, '--seq', '1', 'accept']);
    expect(again).toMatchObject({ code: 2, stderr: expect.stringContaining('execute_report_decided') });

    const haltDecided = await cli(value, ['decide', '--session', session, '--seq', '2', 'halt', '--text', 'tests need a fixture fix outside the spec']);
    const halted = await awaitTerminal(value, session, haltDecided);
    expect(halted).toEqual({ code: 1, stdout: '', stderr: 'supervisor_halt: tests need a fixture fix outside the spec\n' });
    // The controller stops the running subagent before it exits, and waits for the hooks module to confirm.
    expect(value.responder.stops.map((request) => request.agentId)).toEqual(['agent-2']);
    expect(value.responder.invalid).toEqual([]);
    expect(fs.existsSync(value.leasePath)).toBe(false);
    expect(fs.existsSync(sessionDir)).toBe(false);
    await until(() => gone(value.controllerPid()), 'the supervised controller exiting after its halt');
  }, 60_000);

  it('reports a check-in with the subagent activity and no pane, and surfaces a refused stop as worker_stop_failed', async () => {
    const value = await fixture({ denyStop: true, checkIn: 1, waitSeconds: 30 });
    const yielded = await value.done;
    expect(yielded.code).toBe(0);
    const session = sessionOf(yielded.stdout);
    const first = await awaitReport(value, session, 0);
    expect(first).toMatchObject({ kind: 'checkin', seq: 1, stage: 'implement' });
    const sessionDir = path.join(value.root, '.nmg-sdlc', 'execute', session);
    const body = readJson(path.join(sessionDir, 'report-1.json'));
    expect(body).toMatchObject({ kind: 'checkin', reason: 'interval', issue: 42, stage: 'implement', agentId: 'agent-1',
      activity: { status: 'running', toolCalls: [], latestText: '', lastActivitySecondsAgo: expect.any(Number) },
      decisions: ['continue', 'prompt', 'redispatch', 'halt'] });
    expect(body).not.toHaveProperty('pane');
    expect(body).not.toHaveProperty('paneTail');
    const decided = await cli(value, ['decide', '--session', session, '--seq', '1', 'halt', '--text', 'stop the subagent']);
    const refused = await awaitTerminal(value, session, decided);
    expect(refused).toMatchObject({ code: 1, stderr: expect.stringContaining('worker_stop_failed: nmg-sdlc: stop refused by fixture') });
    expect(fs.existsSync(value.leasePath)).toBe(false);
    expect(value.responder.stops.map((request) => request.agentId)).toEqual(['agent-1']);
  }, 60_000);

  it('records the terminal result under the Claude session that ran /sdlc-execute', async () => {
    const claude = randomUUID();
    const value = await fixture({ ghAuthFails: true, claudeSession: claude });
    const result = await value.done;
    const session = /^NMG_SDLC_EXECUTE_SESSION: ([0-9a-f-]{36})$/m.exec(result.stdout)[1];
    const record = readJson(path.join(value.root, '.nmg-sdlc', 'execute', 'results', `${claude}.json`));
    expect(record).toMatchObject({ schemaVersion: 1, claudeSessionId: claude, session, status: 1,
      lines: ['/sdlc-execute stopped: gh auth status failed'] });
    expect(Object.keys(record).sort()).toEqual(['claudeSessionId', 'completedAt', 'lines', 'schemaVersion', 'session', 'status']);
    expect(Number.isNaN(Date.parse(record.completedAt))).toBe(false);
  }, 30_000);
});

describe('execute CLI argument and session usage', () => {
  it('refuses the removed --retain-worker flag before any session starts', () => {
    const dir = tempDir();
    const response = cliSync(dir, ['supervise', '--retain-worker', '#42']);
    expect(response.code).toBe(2);
    expect(response.stderr).toContain('--retain-worker is removed');
    expect(fs.existsSync(path.join(dir, '.nmg-sdlc'))).toBe(false);
  });

  it('answers an out-of-range check-in interval with usage', () => {
    const response = cliSync(tempDir(), ['supervise', '--check-in-seconds', '0', '#42']);
    expect(response).toMatchObject({ code: 2, stderr: expect.stringContaining('Usage: /sdlc-execute') });
  });

  it('exits 2 with the session requirement for the unsupervised run', () => {
    expect(cliSync(tempDir(), ['run', '#42']))
      .toEqual({ code: 2, stdout: '', stderr: 'execute requires /sdlc-execute in a Claude Code session\n' });
    expect(cliSync(tempDir(), ['run', '--unknown']))
      .toEqual({ code: 2, stdout: '', stderr: 'execute requires /sdlc-execute in a Claude Code session\n' });
  });

  it('rejects a non-integer --after with usage', () => {
    expect(cliSync(tempDir(), ['wait', '--session', '00000000-0000-4000-8000-000000000491', '--after', 'x']))
      .toMatchObject({ code: 2, stderr: '--after requires a non-negative report sequence\n' });
  });

  it('accepts a non-negative --after and reports an ended session as unknown', () => {
    expect(cliSync(tempDir(), ['wait', '--session', '00000000-0000-4000-8000-000000000491', '--after', '0']))
      .toMatchObject({ code: 2, stderr: 'execute_session_unknown: 00000000-0000-4000-8000-000000000491\n' });
  });
});

describe('fileSupervisor (file transport)', () => {
  const session = '00000000-0000-4000-8000-000000000491';
  const report = { kind: 'stage', issue: 42, stage: 'verify', decisions: ['accept', 'prompt', 'redispatch', 'halt'] };

  it('writes each report and returns the decision written for it', () => {
    const dir = tempDir();
    const supervise = fileSupervisor({ dir, session, sleep: () => fs.writeFileSync(path.join(dir, 'decision-1.json'),
      JSON.stringify({ session, seq: 1, action: 'redispatch', text: 'retry' })) });
    expect(supervise(report)).toEqual({ action: 'redispatch', text: 'retry' });
    expect(readJson(path.join(dir, 'report-1.json'))).toEqual({ schemaVersion: 1, session, seq: 1, ...report });
  });

  it('keeps waiting while the supervising heartbeat is fresh', () => {
    const dir = tempDir();
    let clock = 1_000_000;
    let sleeps = 0;
    const beat = () => fs.writeFileSync(path.join(dir, 'host.json'),
      JSON.stringify({ schemaVersion: 1, claudeSessionId: CLAUDE_HEARTBEAT, at: clock }));
    beat();
    const supervise = fileSupervisor({ dir, session, now: () => clock, pollMs: 500, hostCheckMs: 15_000, sleep: () => {
      clock += 500;
      sleeps += 1;
      beat();
      if (sleeps === 100) {
        fs.writeFileSync(path.join(dir, 'decision-1.json'),
          JSON.stringify({ session, seq: 1, action: 'prompt', text: 'check the gate' }));
      }
    } });
    expect(supervise(report)).toEqual({ action: 'prompt', text: 'check the gate' });
    expect(sleeps).toBe(100);
  });

  it('halts with supervising session ended once the heartbeat goes stale', () => {
    const dir = tempDir();
    let clock = 1_000_000;
    fs.writeFileSync(path.join(dir, 'host.json'),
      JSON.stringify({ schemaVersion: 1, claudeSessionId: CLAUDE_HEARTBEAT, at: clock - 120_000 }));
    let sleeps = 0;
    const supervise = fileSupervisor({ dir, session, now: () => clock, pollMs: 500, hostCheckMs: 15_000, sleep: () => {
      clock += 500;
      sleeps += 1;
    } });
    expect(supervise(report)).toEqual({ action: 'halt', text: 'supervising session ended' });
    expect(sleeps).toBe(30);
  });

  it('halts when the session has no heartbeat record at all', () => {
    const dir = tempDir();
    let clock = 0;
    const supervise = fileSupervisor({ dir, session, now: () => clock, pollMs: 500, hostCheckMs: 1000, sleep: () => {
      clock += 500;
    } });
    expect(supervise(report)).toEqual({ action: 'halt', text: 'supervising session ended' });
  });
});

describe('resultLines', () => {
  it('lists each delivered issue on success, or the output lines when nothing merged', () => {
    expect(resultLines({ status: 0, stdout: '#42: verify passed\n#42: MERGED and CLOSED\n#42: branch cleanup: deleted 42-example and fast-forwarded main\n', stderr: '' }))
      .toEqual(['#42: MERGED and CLOSED']);
    expect(resultLines({ status: 0, stdout: 'No open spec-created issues.\n', stderr: '' }))
      .toEqual(['No open spec-created issues.']);
    expect(resultLines({ status: 0, stdout: '', stderr: '' })).toEqual([]);
  });

  it('names the first diagnostic line of a stopped run', () => {
    expect(resultLines({ status: 1, stdout: '', stderr: 'gh auth status failed\nextra\n' }))
      .toEqual(['/sdlc-execute stopped: gh auth status failed']);
    expect(resultLines({ status: 1, stdout: 'supervisor_halt: host disk full\n', stderr: '' }))
      .toEqual(['/sdlc-execute stopped: supervisor_halt: host disk full']);
    expect(resultLines({ status: 2, stdout: '', stderr: '' })).toEqual(['/sdlc-execute stopped: controller_failed']);
  });
});
