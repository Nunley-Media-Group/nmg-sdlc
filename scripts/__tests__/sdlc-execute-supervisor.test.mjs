import { afterEach, describe, expect, it } from '@jest/globals';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createConnection } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXECUTE = fileURLToPath(new URL('../sdlc-execute.mjs', import.meta.url));
const fixtures = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

async function until(predicate, detail) {
  const deadline = Date.now() + 20_000;
  while (!predicate()) {
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

function descendantTree(rootPid) {
  const snapshot = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' });
  if (snapshot.status !== 0) throw new Error(snapshot.stderr);
  const parents = snapshot.stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
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
      if (error.code === 'ECONNREFUSED') resolve(true);
      else resolve(false);
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

async function fixture({
  pending = false, retain = false, closeFailure = false, inheritedPipes = false,
  holdBootstrap = false, startupFailure = false, probePeer = false, waitForController = true, outsideHerdr = false,
} = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-cancel-')));
  const runtime = path.join(root, '.omp/sdlc');
  const bin = path.join(runtime, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const spec = path.join(root, 'specs/42-ship-it');
  fs.mkdirSync(spec, { recursive: true });
  for (const file of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
    fs.writeFileSync(path.join(spec, file), '**Issue**: #42\n**Status**: Approved\n');
  }
  fs.writeFileSync(path.join(root, '.gitignore'), '.omp/sdlc/\n');
  git(root, ['init', '-b', '42-ship-it']);
  git(root, ['add', '.gitignore', 'specs']);
  git(root, ['commit', '-m', 'fixture']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const origin = path.join(runtime, 'origin.git');
  git(root, ['init', '--bare', origin]);
  git(root, ['remote', 'add', 'origin', origin]);
  git(root, ['push', '-u', 'origin', '42-ship-it']);
  const checkpoint = {
    schemaVersion: 1, projectRoot: root, runId: 'cancel-fixture', issue: 42,
    branch: '42-ship-it', head, issues: [42], revision: 1,
    currentIssue: 42, currentStep: 'implement', completed: { 42: ['start'] },
    failed: null, startedAt: new Date().toISOString(),
  };
  const runPath = path.join(runtime, 'run.json');
  const leasePath = path.join(runtime, 'controller.lock');
  const marker = path.join(runtime, 'waiting.json');
  const closedPath = path.join(runtime, 'closed.jsonl');
  const supervisorPath = path.join(runtime, 'supervisor.json');
  const bootstrapReady = path.join(runtime, 'bootstrap-ready');
  const bootstrapRelease = path.join(runtime, 'bootstrap-release');
  const controllerStarted = path.join(runtime, 'controller-started.json');
  const peerRefused = path.join(runtime, 'peer-refused');
  const extraClosed = path.join(runtime, 'extra-closed');
  fs.writeFileSync(runPath, JSON.stringify(checkpoint));
  const command = (name, content) => {
    const file = path.join(bin, name);
    fs.writeFileSync(file, `#!/usr/bin/env node\n${content}`);
    fs.chmodSync(file, 0o755);
  };
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
}
if (${inheritedPipes} && process.argv[2] === 'controller') {
  const pipeHolder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  process.env.SDLC_FIXTURE_PIPE_PID = String(pipeHolder.pid);
}
`);
  command('gh', `const args = process.argv.slice(2);
const out = value => { console.log(typeof value === 'string' ? value : JSON.stringify(value)); process.exit(0); };
if (args[0] === 'auth') out('');
if (args[0] === 'repo') out({nameWithOwner:'acme/widgets'});
if (args[0] === 'api' && args.includes('--paginate')) out([[]]);
if (args[0] === 'pr' && args[1] === 'list') out([]);
if (args[0] === 'api') out({id:4200,number:42,state:'open',title:'Ship It',repository_url:'https://api.github.com/repos/acme/widgets'});
if (args[0] === 'issue' && args.some(arg => arg.includes('labels'))) out({number:42,labels:[{name:'spec-created'}]});
if (args[0] === 'issue') out({title:'Ship It'});
throw new Error('Unexpected gh command: '+args.join(' '));\n`);
  command('herdr', `const fs = require('node:fs');
const args = process.argv.slice(2);
const out = value => { console.log(typeof value === 'string' ? value : JSON.stringify(value)); process.exit(0); };
if (args[0] === 'integration') out('omp: installed');
if (args[0] === 'agent' && args[1] === 'list') out([]);
if (args[0] === 'agent' && args[1] === 'get') out({result:{state:'working'}});
if (args[0] === 'agent' && args[1] === 'start') out('');
if (args[0] === 'agent' && args[1] === 'prompt' && !${pending}) out('');
if (args[0] === 'agent' && args[1] === ${JSON.stringify(pending ? 'prompt' : 'wait')}) {
  fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,controllerPid:process.ppid,pipePid:Number(process.env.SDLC_FIXTURE_PIPE_PID)||null}));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
}
if (args[0] === 'pane' && args[1] === 'list') out([{pane_id:'controller-pane'},{pane_id:'owned-worker'}]);
if (args[0] === 'pane' && args[1] === 'layout') out({result:{width:120,height:40}});
if (args[0] === 'pane' && args[1] === 'split') out({result:{pane:{pane_id:'owned-worker'}}});
if (args[0] === 'pane' && args[1] === 'close') {
  fs.appendFileSync(${JSON.stringify(closedPath)},JSON.stringify(args[2])+'\\n');
  process.exit(${closeFailure ? 1 : 0});
}
if (args[0] === 'notification') out('');
throw new Error('Unexpected Herdr command: '+args.slice(0,2).join(' '));\n`);
  const child = spawn('node', [EXECUTE, 'run', ...(retain ? ['--retain-worker'] : []), '#42'], {
    cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${pathToFileURL(preload).href}`,
      HERDR_ENV: outsideHerdr ? '0' : '1', HERDR_SOCKET_PATH: path.join(runtime, 'fixture.sock'), HERDR_PANE_ID: 'controller-pane',
    },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr })));
  const value = { root, runtime, child, done, runPath, leasePath, marker,
    supervisorPath, bootstrapReady, bootstrapRelease, controllerStarted, peerRefused, extraClosed,
    closed: () => fs.existsSync(closedPath) ? fs.readFileSync(closedPath, 'utf8').trim().split('\n').map(JSON.parse) : [],
  };
  fixtures.push(value);
  value.waitForController = async () => {
    await until(() => {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`CLI exited before blocking: ${stdout}${stderr}`);
      if (!fs.existsSync(marker)) return false;
      try {
        value.waiting = JSON.parse(fs.readFileSync(marker, 'utf8'));
        return true;
      } catch {
        return false;
      }
    }, 'the actual controller entering its blocking external command');
  };
  if (waitForController) await value.waitForController();
  return value;
}
afterEach(async () => {
  for (const value of fixtures.splice(0)) {
    if (fs.existsSync(value.supervisorPath)) {
      const supervisor = JSON.parse(fs.readFileSync(value.supervisorPath, 'utf8'));
      // Exact fixture-recorded PIDs only; these are fallback cleanup, never proof.
      for (const pid of [supervisor.bootstrapPid, supervisor.pid]) {
        try { process.kill(pid, 'SIGKILL'); } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
    }
    // Each PID came from this fixture's own blocked command, never from another session.
    if (value.waiting) {
      try { process.kill(-value.waiting.controllerPid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
      if (value.foreign && value.foreign.exitCode === null && value.foreign.signalCode === null) {
        const done = new Promise(resolve => value.foreign.once('close', resolve));
        process.kill(-value.foreign.pid, 'SIGKILL');
        await done;
      }
    }
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

const posix = process.platform === 'win32' ? describe.skip : describe;
posix('execute CLI cancellation during real blocking commands', () => {
  it('survives host cancellation of the invoking process tree after bootstrap exit', async () => {
    const value = await fixture({ inheritedPipes: true });
    const supervisor = JSON.parse(fs.readFileSync(value.supervisorPath, 'utf8'));
    value.foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true, stdio: 'ignore',
    });
    // Capture only this fixture launcher's descendants using OS ancestry, not
    // process groups. The old detached direct child dies in this exact sweep.
    const captured = descendantTree(value.child.pid);
    for (const pid of captured) {
      try { process.kill(pid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    expect((await value.done).signal).toBe('SIGKILL');
    await until(() => !fs.existsSync(value.leasePath) && value.closed().length > 0, 'automatic owned cleanup after host tree cancellation');
    expect(captured).not.toContain(supervisor.pid);
    expect(captured).not.toContain(value.waiting.controllerPid);
    expect(value.closed()).toEqual(['owned-worker']);
    await until(() => [supervisor.pid, value.waiting.controllerPid, value.waiting.pid, value.waiting.pipePid]
      .every(pid => !alive(pid)), 'the daemon and its owned descendants exiting before teardown');
    expect(alive(value.foreign.pid)).toBe(true);
    expect(await refusesConnection(supervisor.port)).toBe(true);
  }, 30_000);

  it.each(['bootstrap-loss', 'daemon-startup'])('fails %s before creating controller ownership', async (failure) => {
    const value = await fixture({
      holdBootstrap: failure === 'bootstrap-loss', startupFailure: failure === 'daemon-startup',
      waitForController: false,
    });
    const before = fs.readFileSync(value.runPath, 'utf8');
    await until(() => fs.existsSync(value.supervisorPath), 'the fixture supervisor starting');
    const supervisor = JSON.parse(fs.readFileSync(value.supervisorPath, 'utf8'));
    if (failure === 'bootstrap-loss') {
      await until(() => fs.existsSync(value.bootstrapReady), 'authenticated readiness before bootstrap loss');
      process.kill(supervisor.bootstrapPid, 'SIGKILL');
    }
    const result = await value.done;
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('controller_supervisor_startup_failed');
    expect(fs.existsSync(value.controllerStarted)).toBe(false);
    expect(fs.existsSync(value.leasePath)).toBe(false);
    expect(fs.readFileSync(value.runPath, 'utf8')).toBe(before);
    expect(value.closed()).toEqual([]);
    await until(() => !alive(supervisor.pid) && !alive(supervisor.bootstrapPid), 'failed startup processes exiting');
    expect(await refusesConnection(supervisor.port)).toBe(true);
  }, 30_000);

  it('rejects unauthenticated peers without surrendering invocation ownership', async () => {
    const value = await fixture({ probePeer: true, holdBootstrap: true, waitForController: false });
    await until(() => fs.existsSync(value.bootstrapReady), 'the ready bootstrap held before exit');
    const supervisor = JSON.parse(fs.readFileSync(value.supervisorPath, 'utf8'));
    const unsafeTree = descendantTree(value.child.pid);
    expect(unsafeTree).toContain(supervisor.bootstrapPid);
    expect(unsafeTree).toContain(supervisor.pid);
    expect(fs.existsSync(value.controllerStarted)).toBe(false);
    expect(fs.existsSync(value.leasePath)).toBe(false);
    fs.writeFileSync(value.bootstrapRelease, '');
    await value.waitForController();
    expect(alive(supervisor.bootstrapPid)).toBe(false);
    expect(fs.existsSync(value.peerRefused)).toBe(true);
    expect(fs.existsSync(value.extraClosed)).toBe(true);
    expect(JSON.parse(fs.readFileSync(value.controllerStarted, 'utf8')).bridgeSecretsPresent).toBe(false);
    expect(await refusesConnection(supervisor.port)).toBe(true);
    value.child.kill('SIGTERM');
    expect((await value.done).code).toBe(143);
    expect(value.closed()).toEqual(['owned-worker']);
    expect(fs.existsSync(value.leasePath)).toBe(false);
    await until(() => !alive(supervisor.pid) && !alive(value.waiting.pid), 'authenticated owner cleanup');
  }, 30_000);

  it('releases the daemon and listener after an ordinary controller error result', async () => {
    const value = await fixture({ outsideHerdr: true, waitForController: false });
    const result = await value.done;
    expect(result.code).toBe(2);
    expect(result.stdout).toContain('execute requires a Herdr OMP session');
    expect(result.stderr).toBe('');
    expect(fs.existsSync(value.leasePath)).toBe(false);
    // supervisor cleanup no longer mutates run.json; failed remains as seeded or unset
    expect(value.closed()).toEqual([]);
    const supervisor = JSON.parse(fs.readFileSync(value.supervisorPath, 'utf8'));
    await until(() => !alive(supervisor.pid) && !alive(supervisor.bootstrapPid), 'normal daemon completion');
    expect(await refusesConnection(supervisor.port)).toBe(true);
  }, 30_000);

  it.each([false, true])('cleans descendants after direct controller SIGKILL (inherited pipes: %s)', async (inheritedPipes) => {
    const value = await fixture({ inheritedPipes });
    value.foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true, stdio: 'ignore',
    });
    process.kill(value.waiting.controllerPid, 'SIGKILL');
    const result = await value.done;
    expect(result.code).toBe(1);
    expect(fs.existsSync(value.leasePath)).toBe(false);
    expect(value.closed()).toEqual(['owned-worker']);
    await until(() => !alive(value.waiting.pid), 'the blocked Herdr descendant exiting before teardown');
    if (inheritedPipes) {
      await until(() => !alive(value.waiting.pipePid), 'the inherited-pipe descendant exiting before teardown');
    }
    expect(alive(value.foreign.pid)).toBe(true);
  }, 30_000);


  it('preserves explicit pane retention on direct controller loss', async () => {
    const value = await fixture({ retain: true, inheritedPipes: true });
    process.kill(value.waiting.controllerPid, 'SIGKILL');
    expect((await value.done).code).toBe(1);
    expect(value.closed()).toEqual([]);
    expect(fs.existsSync(value.leasePath)).toBe(false);
    await until(() => !alive(value.waiting.pid) && !alive(value.waiting.pipePid), 'owned descendants exiting despite pane retention');
  }, 30_000);


  it.each([
    ['SIGINT', true, 130], ['SIGTERM', false, 143], ['SIGKILL', false, null],
  ])('%s closes owned workers and preserves foreign ownership', async (signal, pending, exitCode) => {
    const value = await fixture({ pending });
    value.child.kill(signal);
    const result = await value.done;
    expect(result.code).toBe(exitCode);
    await until(() => !fs.existsSync(value.leasePath) && value.closed().includes('owned-worker'), 'durable cancellation after launcher exit');
    expect(value.closed()).toEqual(['owned-worker']);
    expect(() => process.kill(value.waiting.pid, 0)).toThrow();
  }, 30_000);

  it('retains the worker explicitly while stopping the controller', async () => {
    const value = await fixture({ retain: true });
    value.child.kill('SIGTERM');
    expect((await value.done).code).toBe(143);
    expect(value.closed()).toEqual([]);
    expect(fs.existsSync(value.leasePath)).toBe(false);
  }, 30_000);

  it('preserves a replacement controller lease and does not close an unproven pane', async () => {
    const value = await fixture();
    const before = fs.readFileSync(value.runPath, 'utf8');
    const replacement = { ...JSON.parse(fs.readFileSync(value.leasePath, 'utf8')), runId: 'replacement' };
    fs.writeFileSync(value.leasePath, JSON.stringify(replacement));
    value.child.kill('SIGINT');
    expect((await value.done).code).toBe(130);
    expect(fs.readFileSync(value.runPath, 'utf8')).toBe(before);
    expect(value.closed()).toEqual([]);
    expect(JSON.parse(fs.readFileSync(value.leasePath, 'utf8'))).toEqual(replacement);
  }, 30_000);

  it('retains close failures and lease ownership instead of claiming pane cleanup', async () => {
    const value = await fixture({ closeFailure: true });
    value.child.kill('SIGTERM');
    expect((await value.done).code).toBe(143);
    expect(fs.existsSync(value.leasePath)).toBe(true);
  }, 30_000);

});

describe('execute CLI argument failures', () => {
  it('returns usage status 2 for unknown execute input', async () => {
    const child = spawn(process.execPath, [EXECUTE, 'run', '--unknown'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stdout.resume();
    child.stderr.on('data', chunk => { stderr += chunk; });
    const code = await new Promise(resolve => child.once('close', resolve));
    expect(code).toBe(2);
    expect(stderr).toContain('Usage:');
  });
});


