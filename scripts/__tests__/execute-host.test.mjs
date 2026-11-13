import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTIVE_AGENT_STATUSES,
  activityRecord,
  agentBody,
  checkInNotice,
  clearBackground,
  emptyAgentRecord,
  executeResultPath,
  executeResultText,
  HOST_HEARTBEAT_MS,
  hostResponse,
  missingResultText,
  recordBackgroundStart,
  recordToolCall,
  recordTurnEnd,
  STAGE_AGENTS,
  summarizeToolCall,
  validateHostRequest,
  WORKER_EFFORTS,
  WORKER_PERMISSION_MODES,
} from '../../src/execute-host.mjs';
import { createFileHost } from '../sdlc-execute-host.mjs';

const SESSION = '00000000-0000-4000-8000-000000000538';
const NOW = 1_800_000_000_000;
const PROMPT = 'Verify #42 on its exact head. Write and validate the handoff, then stop.';
const roots = [];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value)}\n`);

// A session directory named by a UUID, with a fake hooks module. Each request still unanswered when the
// controller sleeps is validated the way the hooks module validates it, then answered by `handler`. Every
// sleep advances the fake clock by the requested interval and gives `onSleep` a look at the step count.
function harness({ handler = () => ({ ok: true }), onSleep = () => {}, start = NOW, seed = () => {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-host-'));
  roots.push(root);
  const sessionDir = path.join(root, SESSION);
  fs.mkdirSync(sessionDir);
  seed(sessionDir);
  const clock = { now: start };
  const sleeps = [];
  const served = [];
  const writeHeartbeat = (at = clock.now) => writeJson(path.join(sessionDir, 'host.json'),
    { schemaVersion: 1, claudeSessionId: SESSION, at });
  const writeAgent = (agentId, record) => writeJson(path.join(sessionDir, `agent-${agentId}.json`),
    { schemaVersion: 1, agentId, lastActivityAt: clock.now, ...record });
  const serve = () => {
    for (const name of fs.readdirSync(sessionDir)) {
      const match = /^request-([1-9]\d*)\.json$/.exec(name);
      if (!match || fs.existsSync(path.join(sessionDir, `response-${match[1]}.json`))) continue;
      const request = readJson(path.join(sessionDir, name));
      served.push(request);
      const verdict = validateHostRequest(request);
      const fields = verdict.ok ? handler(request) : { ok: false, deny: verdict.deny };
      writeJson(path.join(sessionDir, `response-${match[1]}.json`), hostResponse(request, fields));
    }
  };
  const sleep = (ms) => {
    sleeps.push(ms);
    clock.now += ms;
    onSleep(sleeps.length, clock);
    serve();
  };
  writeHeartbeat();
  const host = createFileHost({ sessionDir, now: () => clock.now, sleep });
  return { root, sessionDir, clock, sleeps, served, host, writeHeartbeat, writeAgent };
}

const spawnArgs = (root, overrides = {}) => ({
  issue: 42,
  step: 'verify',
  entry: 'verify',
  agent: 'architecture-reviewer',
  name: 's42-verify-abcdef12',
  model: 'opus',
  effort: 'high',
  permissionMode: 'auto',
  prompt: PROMPT,
  cwd: root,
  ...overrides,
});

const spawnRequest = (overrides = {}) => ({
  schemaVersion: 1,
  session: SESSION,
  n: 1,
  kind: 'spawn',
  issue: 42,
  step: 'verify',
  entry: 'verify',
  agent: 'architecture-reviewer',
  name: 's42-verify-abcdef12',
  model: 'opus',
  effort: 'high',
  permissionMode: 'auto',
  promptFile: 'request-1.prompt.md',
  cwd: '/project',
  ...overrides,
});

const denialOf = (request) => validateHostRequest(request).deny;

describe('validateHostRequest', () => {
  it.each([
    ['start', 'starter'],
    ['implement', 'spec-implementer'],
    ['verify', 'architecture-reviewer'],
    ['deliver', 'deliverer'],
    ['repair', 'spec-implementer'],
  ])('accepts a spawn request for the %s entry on the %s agent', (entry, agent) => {
    expect(validateHostRequest(spawnRequest({ entry, agent }))).toEqual({ ok: true });
  });

  it.each(['haiku', 'opus', 'opus[1m]', 'opencode-go/kimi-k3.1-pro', 'claude-opus-5-5'])(
    'accepts the stage model %s', (model) => {
      expect(validateHostRequest(spawnRequest({ model }))).toEqual({ ok: true });
    });

  it('accepts every worker effort and a null effort for the default', () => {
    for (const effort of [...WORKER_EFFORTS, null]) {
      expect(validateHostRequest(spawnRequest({ effort }))).toEqual({ ok: true });
    }
  });

  it('accepts every permission mode', () => {
    for (const permissionMode of WORKER_PERMISSION_MODES) {
      expect(validateHostRequest(spawnRequest({ permissionMode }))).toEqual({ ok: true });
    }
  });

  it('rejects a model that is neither an alias, a claude id, nor a provider id', () => {
    expect(validateHostRequest(spawnRequest({ model: 'not a model!' })))
      .toEqual({ ok: false, deny: 'nmg-sdlc: invalid host request: invalid model "not a model!"' });
  });

  it('rejects an effort outside the worker efforts and null', () => {
    expect(denialOf(spawnRequest({ effort: 'extreme' }))).toBe('nmg-sdlc: invalid host request: effort must be one of low, medium, high, xhigh, max or null');
    expect(denialOf(spawnRequest({ effort: 'default' }))).toContain('effort must be one of');
  });

  it('rejects a permission mode outside the five', () => {
    expect(denialOf(spawnRequest({ permissionMode: 'yolo' }))).toContain('permission mode must be one of default, acceptEdits, auto, dontAsk, bypassPermissions');
  });

  it('rejects an unknown stage agent and an unknown entry', () => {
    expect(denialOf(spawnRequest({ agent: 'reviewer' }))).toBe('nmg-sdlc: invalid host request: unknown agent "reviewer"');
    expect(denialOf(spawnRequest({ entry: 'review' }))).toBe('nmg-sdlc: invalid host request: unknown entry "review"');
  });

  it('rejects a session that is not a UUID', () => {
    expect(denialOf(spawnRequest({ session: 'not-a-uuid' }))).toBe('nmg-sdlc: invalid host request: session must be a UUID');
  });

  it('rejects an unknown request kind', () => {
    expect(denialOf({ schemaVersion: 1, session: SESSION, n: 2, kind: 'delete', agentId: 'a' }))
      .toBe('nmg-sdlc: invalid host request: unknown kind "delete"');
  });

  it('rejects input that is not an object, a wrong schema version, and a bad sequence number', () => {
    expect(denialOf(null)).toBe('nmg-sdlc: invalid host request: not an object');
    expect(denialOf(['spawn'])).toBe('nmg-sdlc: invalid host request: not an object');
    expect(denialOf(spawnRequest({ schemaVersion: 2 }))).toBe('nmg-sdlc: invalid host request: schemaVersion must be 1');
    expect(denialOf(spawnRequest({ n: 0 }))).toBe('nmg-sdlc: invalid host request: n must be a positive integer');
    expect(denialOf(spawnRequest({ n: 1.5 }))).toBe('nmg-sdlc: invalid host request: n must be a positive integer');
  });

  it('rejects a spawn without a positive issue, a name, a prompt file or a working directory', () => {
    expect(denialOf(spawnRequest({ issue: 0 }))).toContain('issue must be a positive integer');
    expect(denialOf(spawnRequest({ name: '' }))).toContain('name must be a non-empty string');
    expect(denialOf(spawnRequest({ promptFile: undefined }))).toContain('promptFile must name the instructions file');
    expect(denialOf(spawnRequest({ cwd: '' }))).toContain('cwd must be a non-empty string');
  });

  it('accepts append, send and stop with an agent id, and append and send only with non-empty text', () => {
    const base = { schemaVersion: 1, session: SESSION, n: 2, agentId: 'agent-1' };
    expect(validateHostRequest({ ...base, kind: 'append', text: 'guidance' })).toEqual({ ok: true });
    expect(validateHostRequest({ ...base, kind: 'send', text: 'resume' })).toEqual({ ok: true });
    expect(validateHostRequest({ ...base, kind: 'stop' })).toEqual({ ok: true });
    expect(denialOf({ ...base, kind: 'append', text: '' })).toBe('nmg-sdlc: invalid host request: append text must be non-empty');
    expect(denialOf({ ...base, kind: 'send', text: '  ' })).toBe('nmg-sdlc: invalid host request: send text must be non-empty');
    expect(denialOf({ ...base, kind: 'stop', agentId: '' })).toBe('nmg-sdlc: invalid host request: agentId must be a non-empty string');
  });
});

describe('hostResponse', () => {
  it('echoes the schema version, session and sequence number of the request it answers', () => {
    const request = { schemaVersion: 1, session: SESSION, n: 7, kind: 'spawn' };
    expect(hostResponse(request, { ok: true, agentId: 'agent-7' })).toEqual({
      schemaVersion: 1, session: SESSION, n: 7, ok: true, agentId: 'agent-7',
    });
    expect(hostResponse(request, { ok: false, deny: 'nmg-sdlc: refused' })).toEqual({
      schemaVersion: 1, session: SESSION, n: 7, ok: false, deny: 'nmg-sdlc: refused',
    });
  });
});

describe('summarizeToolCall', () => {
  it('summarizes a Bash call by its command', () => {
    expect(summarizeToolCall('Bash', { command: 'npm test -- --runInBand' })).toBe('npm test -- --runInBand');
  });

  it('summarizes a file tool by its file path, falling back to a path field', () => {
    expect(summarizeToolCall('Edit', { file_path: 'src/execute-host.mjs' })).toBe('src/execute-host.mjs');
    expect(summarizeToolCall('Read', { path: 'README.md' })).toBe('README.md');
  });

  it('falls back to the tool name when the input names no command or path', () => {
    expect(summarizeToolCall('Grep', { pattern: 'TODO' })).toBe('Grep');
    expect(summarizeToolCall('Bash', {})).toBe('Bash');
    expect(summarizeToolCall('', {})).toBe('tool');
    expect(summarizeToolCall(undefined)).toBe('tool');
  });

  it('truncates a summary to exactly 200 characters', () => {
    const summary = summarizeToolCall('Bash', { command: 'x'.repeat(250) });
    expect(summary).toHaveLength(200);
    expect(summary).toBe('x'.repeat(200));
    expect(summarizeToolCall('Bash', { command: 'y'.repeat(200) })).toHaveLength(200);
  });
});

describe('agent activity records', () => {
  it('starts an empty record pending at its first activity time', () => {
    expect(emptyAgentRecord('agent-1', 1000)).toEqual({
      schemaVersion: 1, agentId: 'agent-1', status: 'pending', toolCalls: [], latestText: '',
      lastActivityAt: 1000, turns: [], stopped: false, updatedAt: 1000,
    });
  });

  it('records tool calls, keeps only the newest ten, and moves the activity time forward', () => {
    const initial = emptyAgentRecord('agent-1', 0);
    let record = initial;
    for (let index = 1; index <= 12; index += 1) {
      record = recordToolCall(record, { tool: 'Bash', input: { command: `cmd ${index}` }, at: index * 1000 });
    }
    expect(record.toolCalls).toHaveLength(10);
    expect(record.toolCalls[0]).toEqual({ tool: 'Bash', summary: 'cmd 3', at: 3000 });
    expect(record.toolCalls.at(-1)).toEqual({ tool: 'Bash', summary: 'cmd 12', at: 12000 });
    expect(record).toMatchObject({ lastActivityAt: 12000, updatedAt: 12000 });
    expect(initial.toolCalls).toEqual([]);
  });

  it('records a turn end with its reason and status, and keeps the activity time', () => {
    const record = recordTurnEnd(emptyAgentRecord('agent-1', 0), { reason: 'end_turn', status: 'idle', at: 5000 });
    expect(record).toMatchObject({
      status: 'idle', turns: [{ reason: 'end_turn', at: 5000 }], lastActivityAt: 5000, updatedAt: 5000,
    });
    const unnamed = recordTurnEnd(record, { at: 6000 });
    expect(unnamed).toMatchObject({ status: 'idle', turns: expect.arrayContaining([{ reason: 'unknown', at: 6000 }]) });
  });

  it('reports the activity object in whole seconds since the last activity, capped in its lists', () => {
    const record = {
      status: 'running',
      toolCalls: Array.from({ length: 12 }, (_, index) => ({ tool: 'Read', summary: `f${index}`, at: index })),
      latestText: 'x'.repeat(2500),
      lastActivityAt: 1000,
    };
    const activity = activityRecord(record, 61_400);
    expect(activity).toEqual({
      status: 'running',
      toolCalls: record.toolCalls.slice(-10),
      latestText: 'x'.repeat(2000),
      lastActivitySecondsAgo: 60,
      background: null,
    });
    expect(Number.isInteger(activity.lastActivitySecondsAgo)).toBe(true);
    expect(activityRecord(record, 2_499).lastActivitySecondsAgo).toBe(1);
    expect(activityRecord(record, 2_500).lastActivitySecondsAgo).toBe(2);
  });

  it('reports an unknown, idle activity for a subagent with no record yet', () => {
    expect(activityRecord(undefined, 5000)).toEqual({
      status: 'unknown', toolCalls: [], latestText: '', lastActivitySecondsAgo: 0, background: null,
    });
  });

  it('tracks a backgrounded Bash command until the next turn after settling, and reports the oldest one', () => {
    const started = recordBackgroundStart(emptyAgentRecord('agent-1', 1000), {
      taskId: 'task-1', command: 'npm test -- --watch', at: 2000,
    });
    expect(started).toMatchObject({
      background: [{ taskId: 'task-1', command: 'npm test -- --watch', startedAt: 2000 }], updatedAt: 2000,
    });
    // The command's activity is not a new turn: the record's activity time is unchanged.
    expect(started.lastActivityAt).toBe(1000);
    const second = recordBackgroundStart(started, { taskId: 'task-2', command: `echo ${'y'.repeat(300)}`, at: 9000 });
    expect(second.background.map((entry) => entry.taskId)).toEqual(['task-1', 'task-2']);
    expect(second.background[1].command).toHaveLength(200);
    expect(activityRecord(second, 62_000).background).toEqual({ command: 'npm test -- --watch', elapsedSeconds: 60 });
    const cleared = clearBackground(second, 70_000);
    expect(cleared).toMatchObject({ background: [], updatedAt: 70_000 });
    expect(activityRecord(cleared, 70_000).background).toBeNull();
  });
});

describe('controller notices', () => {
  it('names the report sequence and the wait command that follows the previous report', () => {
    const text = checkInNotice({ session: SESSION, seq: 4, pluginRoot: '/opt/nmg' });
    expect(text).toContain('report 4 is waiting');
    expect(text).toContain(`wait --session ${SESSION} --after 3`);
    expect(text).toContain('/opt/nmg/scripts/sdlc-execute.mjs');
  });
});

describe('agentBody', () => {
  it('strips the YAML frontmatter and keeps the body', () => {
    expect(agentBody('---\nname: starter\ndescription: x\n---\n\n# Body\n\nText\n')).toBe('# Body\n\nText\n');
  });

  it('keeps a body with CRLF line endings after CRLF frontmatter', () => {
    expect(agentBody('---\r\nname: a\r\n---\r\nBody\r\n')).toBe('Body\r\n');
  });

  it('returns text without frontmatter unchanged', () => {
    expect(agentBody('# No frontmatter\n')).toBe('# No frontmatter\n');
  });

  it('removes the frontmatter of every stage agent file', () => {
    for (const agent of Object.values(STAGE_AGENTS)) {
      const source = fs.readFileSync(path.join(repoRoot, 'agents', `${agent}.md`), 'utf8');
      expect(source.startsWith('---\n')).toBe(true);
      const body = agentBody(source);
      expect(body.startsWith('---')).toBe(false);
      expect(body).not.toContain(`name: ${agent}`);
      expect(body.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('execute result answers', () => {
  const record = (overrides = {}) => ({
    schemaVersion: 1, claudeSessionId: SESSION, session: '11111111-1111-4111-8111-111111111111',
    status: 0, lines: ['#42: MERGED and CLOSED'], completedAt: '2026-11-08T00:00:00.000Z', ...overrides,
  });

  it('answers a valid record with its lines joined and its exit status', () => {
    expect(executeResultText(record())).toEqual({ text: '#42: MERGED and CLOSED', exitCode: 0 });
    expect(executeResultText(record({ status: 1, lines: ['/sdlc-execute stopped: gh auth status failed', 'more'] })))
      .toEqual({ text: '/sdlc-execute stopped: gh auth status failed\nmore', exitCode: 1 });
  });

  it('answers null for a record that is missing, from another schema, or malformed', () => {
    expect(executeResultText(null)).toBeNull();
    expect(executeResultText(undefined)).toBeNull();
    expect(executeResultText(record({ schemaVersion: 2 }))).toBeNull();
    expect(executeResultText(record({ status: '0' }))).toBeNull();
    expect(executeResultText(record({ lines: 'MERGED' }))).toBeNull();
    expect(executeResultText(record({ lines: ['ok', 3] }))).toBeNull();
  });

  it('answers a missing record with exit 2 naming the session', () => {
    expect(missingResultText(SESSION)).toEqual({
      text: `No /sdlc-execute result is recorded for session ${SESSION}.`,
      exitCode: 2,
    });
  });

  it('places the result record under the execute results directory, named by the Claude session', () => {
    expect(executeResultPath(SESSION)).toBe(`.nmg-sdlc/execute/results/${SESSION}.json`);
  });
});

describe('shared constants', () => {
  it('maps each stage to its plugin agent', () => {
    expect(STAGE_AGENTS).toEqual({
      start: 'starter',
      implement: 'spec-implementer',
      verify: 'architecture-reviewer',
      deliver: 'deliverer',
    });
  });

  it('lists the worker efforts, permission modes and active statuses', () => {
    expect(WORKER_EFFORTS).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(WORKER_PERMISSION_MODES).toEqual(['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions']);
    expect(ACTIVE_AGENT_STATUSES).toEqual(['pending', 'running', 'waiting']);
  });

  it('treats a supervising session as gone after 60 seconds without a heartbeat', () => {
    expect(HOST_HEARTBEAT_MS).toBe(60_000);
  });
});

describe('createFileHost spawn', () => {
  it('writes the spawn request and its prompt file, then returns the agent id the hooks module answered with', () => {
    const h = harness({ handler: (request) => (request.kind === 'spawn' ? { ok: true, agentId: 'agent-verify-1' } : { ok: true }) });
    expect(h.host.spawn(spawnArgs(h.root))).toEqual({ agentId: 'agent-verify-1' });

    const request = readJson(path.join(h.sessionDir, 'request-1.json'));
    expect(request).toMatchObject({
      schemaVersion: 1, session: SESSION, n: 1, kind: 'spawn', issue: 42, step: 'verify', entry: 'verify',
      agent: 'architecture-reviewer', name: 's42-verify-abcdef12', model: 'opus', effort: 'high',
      permissionMode: 'auto', promptFile: 'request-1.prompt.md', cwd: h.root,
    });
    expect(validateHostRequest(request)).toEqual({ ok: true });
    expect(fs.readFileSync(path.join(h.sessionDir, 'request-1.prompt.md'), 'utf8')).toBe(PROMPT);
    expect(readJson(path.join(h.sessionDir, 'worker.json'))).toEqual({ issue: 42, stage: 'verify', agentId: 'agent-verify-1' });
  });

  it('sends the default effort as null when the stage has none', () => {
    const h = harness({ handler: () => ({ ok: true, agentId: 'agent-1' }) });
    h.host.spawn(spawnArgs(h.root, { effort: undefined }));
    expect(readJson(path.join(h.sessionDir, 'request-1.json'))).toMatchObject({ effort: null });
    h.host.spawn(spawnArgs(h.root, { effort: null, name: 's42-verify-second' }));
    expect(readJson(path.join(h.sessionDir, 'request-2.json'))).toMatchObject({ effort: null, n: 2 });
  });

  it('numbers each request after any already in the session directory', () => {
    // The counter starts from the highest request already in the directory when the host is created.
    const h = harness({
      handler: (request) => (request.kind === 'spawn' ? { ok: true, agentId: 'agent-3' } : { ok: true }),
      seed: (dir) => writeJson(path.join(dir, 'request-2.json'),
        { schemaVersion: 1, session: SESSION, n: 2, kind: 'stop', agentId: 'agent-0' }),
    });
    expect(h.host.spawn(spawnArgs(h.root))).toEqual({ agentId: 'agent-3' });
    expect(readJson(path.join(h.sessionDir, 'request-3.json')).kind).toBe('spawn');
    expect(fs.existsSync(path.join(h.sessionDir, 'request-1.json'))).toBe(false);
  });

  it('throws worker_start_refused with the deny reason and records no running worker when the spawn is denied', () => {
    const h = harness({ handler: () => ({ ok: false, deny: 'nmg-sdlc: the stage model is not allowed for this session' }) });
    expect(() => h.host.spawn(spawnArgs(h.root)))
      .toThrow('worker_start_refused: nmg-sdlc: the stage model is not allowed for this session');
    expect(fs.existsSync(path.join(h.sessionDir, 'worker.json'))).toBe(false);
  });

  it('throws worker_start_refused when an accepted spawn returns no agent id', () => {
    const h = harness({ handler: () => ({ ok: true }) });
    expect(() => h.host.spawn(spawnArgs(h.root))).toThrow('worker_start_refused: no agent id returned');
  });

  it('answers a pre-written response for its request without waiting', () => {
    const h = harness();
    writeJson(path.join(h.sessionDir, 'response-1.json'), { schemaVersion: 1, session: SESSION, n: 1, ok: true, agentId: 'agent-pre' });
    expect(h.host.spawn(spawnArgs(h.root))).toEqual({ agentId: 'agent-pre' });
    expect(h.sleeps).toEqual([]);
  });
});

describe('createFileHost messages to a running subagent', () => {
  it('reports append and send as true when accepted and false when refused', () => {
    const h = harness({ handler: (request) => (request.text === 'accepted'
      ? { ok: true } : { ok: false, deny: 'nmg-sdlc: subagent busy' }) });
    expect(h.host.append({ agentId: 'agent-live', text: 'accepted' })).toBe(true);
    expect(h.host.append({ agentId: 'agent-live', text: 'refused' })).toBe(false);
    expect(h.host.send({ agentId: 'agent-live', text: 'accepted' })).toBe(true);
    expect(h.host.send({ agentId: 'agent-live', text: 'refused' })).toBe(false);
    expect(h.served.map(({ kind, agentId, text }) => ({ kind, agentId, text }))).toEqual([
      { kind: 'append', agentId: 'agent-live', text: 'accepted' },
      { kind: 'append', agentId: 'agent-live', text: 'refused' },
      { kind: 'send', agentId: 'agent-live', text: 'accepted' },
      { kind: 'send', agentId: 'agent-live', text: 'refused' },
    ]);
  });

  it('stops a subagent and reports true when the hooks module confirms the stop', () => {
    const h = harness({ handler: (request) => (request.agentId === 'agent-live'
      ? { ok: true } : { ok: false, deny: 'nmg-sdlc: stop not confirmed for agent-gone' }) });
    expect(h.host.stop('agent-live')).toBe(true);
    expect(h.served).toEqual([expect.objectContaining({ kind: 'stop', agentId: 'agent-live' })]);
  });

  it('throws worker_stop_failed with the deny reason when the stop is not confirmed', () => {
    const h = harness({ handler: () => ({ ok: false, deny: 'nmg-sdlc: stop not confirmed for agent-gone' }) });
    expect(() => h.host.stop('agent-gone')).toThrow('worker_stop_failed: nmg-sdlc: stop not confirmed for agent-gone');
  });

  it('throws worker_stop_failed with a generic reason when a refusal names none', () => {
    const h = harness({ handler: () => ({ ok: false }) });
    expect(() => h.host.stop('agent-gone')).toThrow('worker_stop_failed: stop not confirmed');
  });
});

describe('createFileHost waiting on a subagent', () => {
  it('wait until working returns once the subagent is running, polling in short slices', () => {
    let polls = 0;
    const h = harness({ onSleep: () => {
      polls += 1;
      if (polls === 2) h.writeAgent('agent-1', { status: 'running' });
    } });
    h.writeAgent('agent-1', { status: 'pending' });
    expect(h.host.wait({ agentId: 'agent-1', until: 'working' }))
      .toMatchObject({ timedOut: false, record: { status: 'running' } });
    expect(h.sleeps).toHaveLength(2);
    expect(h.sleeps.every((ms) => ms > 0 && ms <= 250)).toBe(true);
  });

  // Known source defect (#538): a subagent that has already settled never satisfies until: 'working', so the
  // controller's first wait after spawn does not return while the heartbeat stays fresh. The bound below makes the
  // test fail with a clear message instead of hanging.
  it('wait until working returns for a subagent that has already settled', () => {
    const h = harness({ onSleep: (count) => {
      if (count > 50) throw new Error('wait until working did not return for a settled subagent');
    } });
    h.writeAgent('agent-1', { status: 'idle' });
    expect(h.host.wait({ agentId: 'agent-1', until: 'working' })).toMatchObject({ timedOut: false, record: { status: 'idle' } });
    expect(h.sleeps).toHaveLength(0);
  });

  it('wait for a settled subagent treats a failed status as settled, and an absent record as not yet settled', () => {
    let polls = 0;
    const h = harness({ onSleep: () => {
      polls += 1;
      if (polls === 2) h.writeAgent('agent-1', { status: 'running' });
      if (polls === 3) h.writeAgent('agent-1', { status: 'failed' });
    } });
    expect(h.host.wait({ agentId: 'agent-1' })).toMatchObject({ timedOut: false, record: { status: 'failed' } });
    expect(h.sleeps).toHaveLength(3);
  });

  // A settled subagent is not started by a message until its turn does something: `until: 'started'` waits for an
  // active status or for activity recorded after the mark the controller took before its message.
  it('wait until started returns once a settled subagent records activity after the mark', () => {
    let polls = 0;
    const h = harness({ onSleep: () => {
      polls += 1;
      if (polls === 2) h.writeAgent('agent-1', { status: 'idle', lastActivityAt: NOW + 1 });
    } });
    h.writeAgent('agent-1', { status: 'idle', lastActivityAt: NOW });
    expect(h.host.wait({ agentId: 'agent-1', until: 'started', since: NOW, timeoutMs: 60_000 }))
      .toMatchObject({ timedOut: false, record: { status: 'idle', lastActivityAt: NOW + 1 } });
    expect(h.sleeps).toHaveLength(2);
  });

  it('wait until started times out for a settled subagent that does not start within its bound', () => {
    const h = harness();
    h.writeAgent('agent-1', { status: 'idle', lastActivityAt: NOW });
    expect(h.host.wait({ agentId: 'agent-1', until: 'started', since: NOW, timeoutMs: 1000 }))
      .toMatchObject({ timedOut: true, record: { status: 'idle' } });
  });

  it('wait with a timeout returns timedOut once the fake clock has passed the deadline', () => {
    const h = harness();
    h.writeAgent('agent-1', { status: 'running' });
    const response = h.host.wait({ agentId: 'agent-1', timeoutMs: 1000 });
    expect(response).toMatchObject({ timedOut: true, record: { status: 'running' } });
    expect(h.sleeps.reduce((sum, ms) => sum + ms, 0)).toBe(1000);
  });

  it('returns null from activity before the agent record exists and the record once it does', () => {
    const h = harness();
    expect(h.host.activity('agent-1')).toBeNull();
    h.writeAgent('agent-1', { status: 'running', toolCalls: [] });
    expect(h.host.activity('agent-1')).toMatchObject({ agentId: 'agent-1', status: 'running' });
  });
});

describe('createFileHost supervising session heartbeat', () => {
  it('reports the session alive while its heartbeat is at most 60 seconds old', () => {
    const h = harness();
    expect(h.host.hostAlive()).toBe(true);
    h.writeHeartbeat(NOW - HOST_HEARTBEAT_MS);
    expect(h.host.hostAlive()).toBe(true);
  });

  it('throws supervising_session_lost on a request when the heartbeat is older than 60 seconds', () => {
    const h = harness({ handler: () => ({ ok: true, agentId: 'agent-1' }) });
    h.writeHeartbeat(NOW - HOST_HEARTBEAT_MS - 1);
    expect(h.host.hostAlive()).toBe(false);
    let error;
    try {
      h.host.spawn(spawnArgs(h.root));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error.reasonCode).toBe('supervising_session_lost');
    expect(error.message).toBe('supervising_session_lost');
    expect(h.sleeps).toEqual([]);
    expect(fs.existsSync(path.join(h.sessionDir, 'worker.json'))).toBe(false);
  });

  it('throws supervising_session_lost while waiting when the heartbeat file is missing', () => {
    const h = harness();
    fs.rmSync(path.join(h.sessionDir, 'host.json'));
    expect(() => h.host.wait({ agentId: 'agent-1', until: 'working' })).toThrow('supervising_session_lost');
  });

  it('waits for the first heartbeat on a request made before the bridge has started', () => {
    const h = harness({ handler: () => ({ ok: true, agentId: 'agent-first' }) });
    // No heartbeat yet: the bridge answers the request after the controller has started waiting on it.
    fs.rmSync(path.join(h.sessionDir, 'host.json'));
    expect(h.host.spawn(spawnArgs(h.root))).toEqual({ agentId: 'agent-first' });
    expect(h.sleeps.length).toBeGreaterThan(0);
  });

  it('throws supervising_session_lost when no first heartbeat appears within one heartbeat window', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-host-'));
    roots.push(root);
    const sessionDir = path.join(root, SESSION);
    fs.mkdirSync(sessionDir);
    // No bridge: nothing answers the request and no heartbeat is ever written.
    const clock = { now: NOW };
    const host = createFileHost({ sessionDir, now: () => clock.now, sleep: (ms) => { clock.now += ms; } });
    expect(() => host.spawn(spawnArgs(root))).toThrow('supervising_session_lost');
    expect(clock.now - NOW).toBeGreaterThan(HOST_HEARTBEAT_MS);
    expect(fs.existsSync(path.join(sessionDir, 'worker.json'))).toBe(false);
  });

  it('still answers a request when the heartbeat is exactly 60 seconds old', () => {
    const h = harness({ handler: () => ({ ok: true, agentId: 'agent-edge' }) });
    h.writeHeartbeat(h.clock.now - HOST_HEARTBEAT_MS);
    expect(h.host.spawn(spawnArgs(h.root))).toEqual({ agentId: 'agent-edge' });
  });
});

describe('createFileHost finish', () => {
  it('removes the running-worker marker once its turn has been observed, and tolerates a repeat', () => {
    const h = harness({ handler: () => ({ ok: true, agentId: 'agent-1' }) });
    h.host.spawn(spawnArgs(h.root));
    expect(fs.existsSync(path.join(h.sessionDir, 'worker.json'))).toBe(true);
    h.host.finish();
    expect(fs.existsSync(path.join(h.sessionDir, 'worker.json'))).toBe(false);
    expect(() => h.host.finish()).not.toThrow();
  });
});
