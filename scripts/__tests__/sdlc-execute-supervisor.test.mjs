import { afterEach, describe, expect, it } from '@jest/globals';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

async function fixture({ pending = false, retain = false, closeFailure = false, inheritedPipes = false, groupFailure = false } = {}) {
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
  const checkpoint = {
    schemaVersion: 1, projectRoot: root, runId: 'cancel-fixture', issue: 42,
    branch: '42-ship-it', head, issues: [42], revision: 1,
    currentIssue: 42, currentStep: 'implement', completed: { 42: ['start'] },
    failed: null, startedAt: new Date().toISOString(), workers: {
      's42-implement': {
        name: 's42-implement', paneId: 'owned-worker', projectRoot: root, runId: 'cancel-fixture',
        issue: 42, step: 'implement', branch: '42-ship-it', head,
        promptDelivery: pending ? 'pending' : 'delivered', promptDeliveryVersion: 2,
      },
      'r42-verify': {
        name: 'r42-verify', paneId: 'foreign-worker', projectRoot: root, runId: 'foreign-run',
        issue: 42, step: 'verify', branch: '42-ship-it', head,
        promptDelivery: 'delivered', promptDeliveryVersion: 2,
      },
    },
  };
  const runPath = path.join(runtime, 'run.json');
  const leasePath = path.join(runtime, 'controller.lock');
  const marker = path.join(runtime, 'waiting.json');
  const closedPath = path.join(runtime, 'closed.jsonl');
  fs.writeFileSync(runPath, JSON.stringify(checkpoint));
  const command = (name, content) => {
    const file = path.join(bin, name);
    fs.writeFileSync(file, `#!/usr/bin/env node\n${content}`);
    fs.chmodSync(file, 0o755);
  };
  const preload = path.join(bin, 'controller-fixture.mjs');
  fs.writeFileSync(preload, `
import { spawn } from 'node:child_process';
if (${inheritedPipes} && process.argv[2] === 'controller') {
  const pipeHolder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  process.env.SDLC_FIXTURE_PIPE_PID = String(pipeHolder.pid);
}
if (${groupFailure} && process.argv[2] === 'supervisor') {
  const kill = process.kill;
  process.kill = (pid, signal) => {
    if (pid < -1) throw Object.assign(new Error('fixture group termination denied'), { code: 'EPERM' });
    return kill(pid, signal);
  };
}
`);
  command('gh', `const args = process.argv.slice(2);
const out = value => { console.log(typeof value === 'string' ? value : JSON.stringify(value)); process.exit(0); };
if (args[0] === 'auth') out('');
if (args[0] === 'repo') out({nameWithOwner:'acme/widgets'});
if (args[0] === 'api' && args.includes('--paginate')) out([[]]);
if (args[0] === 'api') out({id:4200,number:42,state:'open',title:'Ship It',repository_url:'https://api.github.com/repos/acme/widgets'});
if (args[0] === 'issue' && args.some(arg => arg.includes('labels'))) out({number:42,labels:[{name:'spec-created'}]});
if (args[0] === 'issue') out({title:'Ship It'});
throw new Error('Unexpected gh command: '+args.join(' '));\n`);
  command('herdr', `const fs = require('node:fs');
const args = process.argv.slice(2);
const out = value => { console.log(typeof value === 'string' ? value : JSON.stringify(value)); process.exit(0); };
if (args[0] === 'integration') out('omp: installed');
if (args[0] === 'agent' && args[1] === 'list') out([{name:'s42-implement',pane_id:'owned-worker',cwd:${JSON.stringify(root)},state:'working'}]);
if (args[0] === 'agent' && args[1] === 'get') out({result:{state:'working'}});
if (args[0] === 'agent' && args[1] === ${JSON.stringify(pending ? 'prompt' : 'wait')}) {
  fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,controllerPid:process.ppid,pipePid:Number(process.env.SDLC_FIXTURE_PIPE_PID)||null}));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
}
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
      HERDR_ENV: '1', HERDR_SOCKET_PATH: path.join(runtime, 'fixture.sock'), HERDR_PANE_ID: 'controller-pane',
    },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr })));
  const value = { root, runtime, child, done, runPath, leasePath, marker,
    readRun: () => JSON.parse(fs.readFileSync(runPath, 'utf8')),
    closed: () => fs.existsSync(closedPath) ? fs.readFileSync(closedPath, 'utf8').trim().split('\n').map(JSON.parse) : [],
  };
  fixtures.push(value);
  await until(() => {
    if (child.exitCode !== null) throw new Error(`CLI exited before blocking: ${stdout}${stderr}`);
    return fs.existsSync(marker);
  }, 'the actual controller entering its blocking external command');
  value.waiting = JSON.parse(fs.readFileSync(marker, 'utf8'));
  return value;
}

afterEach(async () => {
  for (const value of fixtures.splice(0)) {
    if (value.child.exitCode === null && value.child.signalCode === null) value.child.kill('SIGTERM');
    await value.done;
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
  it.each([false, true])('cleans descendants after direct controller SIGKILL (inherited pipes: %s)', async (inheritedPipes) => {
    const value = await fixture({ inheritedPipes });
    value.foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true, stdio: 'ignore',
    });
    process.kill(value.waiting.controllerPid, 'SIGKILL');
    const result = await value.done;
    expect(result.code).toBe(1);
    expect(value.readRun().failed.reasonCode).toBe('controller_process_lost');
    expect(fs.existsSync(value.leasePath)).toBe(false);
    expect(value.closed()).toEqual(['owned-worker']);
    expect(value.readRun().workers['r42-verify'].runId).toBe('foreign-run');
    await until(() => !alive(value.waiting.pid), 'the blocked Herdr descendant exiting before teardown');
    if (inheritedPipes) {
      await until(() => !alive(value.waiting.pipePid), 'the inherited-pipe descendant exiting before teardown');
    }
    expect(alive(value.foreign.pid)).toBe(true);
  }, 30_000);

  it.each(['loss', 'cancel'])('retains ownership and returns cleanup failure without hanging on %s', async (mode) => {
    const value = await fixture({ inheritedPipes: true, groupFailure: true });
    const before = fs.readFileSync(value.runPath, 'utf8');
    const lease = fs.readFileSync(value.leasePath, 'utf8');
    if (mode === 'loss') process.kill(value.waiting.controllerPid, 'SIGKILL');
    else value.child.kill('SIGTERM');
    const result = await value.done;
    expect(result.code).toBe(mode === 'loss' ? 1 : 143);
    expect(result.stderr).toContain('controller_process_cleanup_failed');
    expect(fs.readFileSync(value.runPath, 'utf8')).toBe(before);
    expect(fs.readFileSync(value.leasePath, 'utf8')).toBe(lease);
    expect(value.closed()).toEqual([]);
    expect(alive(value.waiting.pid)).toBe(true);
    expect(alive(value.waiting.pipePid)).toBe(true);
  }, 30_000);

  it('preserves explicit pane retention on direct controller loss', async () => {
    const value = await fixture({ retain: true, inheritedPipes: true });
    process.kill(value.waiting.controllerPid, 'SIGKILL');
    expect((await value.done).code).toBe(1);
    expect(value.readRun().failed.reasonCode).toBe('controller_process_lost');
    expect(value.closed()).toEqual([]);
    expect(value.readRun().workers['s42-implement'].paneId).toBe('owned-worker');
    expect(fs.existsSync(value.leasePath)).toBe(false);
    await until(() => !alive(value.waiting.pid) && !alive(value.waiting.pipePid), 'owned descendants exiting despite pane retention');
  }, 30_000);

  it('keeps the lease when direct loss cannot persist its checkpoint', async () => {
    const value = await fixture({ inheritedPipes: true });
    const before = fs.readFileSync(value.runPath, 'utf8');
    fs.writeFileSync(path.join(value.runtime, 'run.json.lock'), 'owned test lock');
    process.kill(value.waiting.controllerPid, 'SIGKILL');
    const result = await value.done;
    expect(result.code).toBe(1);
    expect(result.stderr).not.toBe('');
    expect(value.closed()).toEqual(['owned-worker']);
    expect(fs.readFileSync(value.runPath, 'utf8')).toBe(before);
    expect(fs.existsSync(value.leasePath)).toBe(true);
    await until(() => !alive(value.waiting.pid) && !alive(value.waiting.pipePid), 'owned descendants exiting before checkpoint failure');
  }, 30_000);

  it.each([
    ['SIGINT', true, 130], ['SIGTERM', false, 143], ['SIGKILL', false, null],
  ])('%s closes owned workers and preserves foreign ownership', async (signal, pending, exitCode) => {
    const value = await fixture({ pending });
    value.child.kill(signal);
    const result = await value.done;
    expect(result.code).toBe(exitCode);
    await until(() => value.readRun().failed?.reasonCode === 'controller_cancelled'
      && !fs.existsSync(value.leasePath), 'durable cancellation after launcher exit');
    expect(value.closed()).toEqual(['owned-worker']);
    expect(value.readRun().workers['s42-implement']).toBeUndefined();
    expect(value.readRun().workers['r42-verify'].runId).toBe('foreign-run');
    expect(() => process.kill(value.waiting.pid, 0)).toThrow();
  }, 30_000);

  it('retains the worker explicitly but stops the controller and records cancellation', async () => {
    const value = await fixture({ retain: true });
    value.child.kill('SIGTERM');
    expect((await value.done).code).toBe(143);
    expect(value.readRun().failed.reasonCode).toBe('controller_cancelled');
    expect(value.closed()).toEqual([]);
    expect(value.readRun().workers['s42-implement'].paneId).toBe('owned-worker');
    expect(fs.existsSync(value.leasePath)).toBe(false);
  }, 30_000);

  it('does not mutate a replacement controller lease or its checkpoint', async () => {
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
    expect(value.readRun().failed).toMatchObject({ reasonCode: 'controller_cancelled', cleanupReasonCode: 'pane_close_failed' });
    expect(value.readRun().workers['s42-implement']).toBeDefined();
    expect(fs.existsSync(value.leasePath)).toBe(true);
  }, 30_000);

  it('keeps the lease when cancellation cannot persist its checkpoint', async () => {
    const value = await fixture();
    const before = fs.readFileSync(value.runPath, 'utf8');
    fs.writeFileSync(path.join(value.runtime, 'run.json.lock'), 'owned test lock');
    value.child.kill('SIGINT');
    expect((await value.done).code).toBe(130);
    expect(value.closed()).toEqual(['owned-worker']);
    expect(fs.readFileSync(value.runPath, 'utf8')).toBe(before);
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
