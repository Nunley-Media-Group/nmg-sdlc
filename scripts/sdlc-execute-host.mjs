#!/usr/bin/env node

/** The controller's worker transport: a file host over the execute session directory. The hooks module
 * services each request (spawn, append, send, stop) and writes its response, agent record and heartbeat.
 * Synchronous, so the detached controller can wait on a worker while the supervising session's turn has ended. */
import { randomBytes } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ACTIVE_AGENT_STATUSES, HOST_HEARTBEAT_MS, heartbeatFresh } from '../src/execute-host.mjs';

const POLL_MS = 250;

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readJson(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeAtomic(path, value) {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temporary, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function requestNumbers(dir) {
  try {
    return readdirSync(dir)
      .map((name) => Number(/^request-([1-9]\d*)\.json$/.exec(name)?.[1]))
      .filter(Number.isSafeInteger);
  } catch {
    return [];
  }
}

function supervisingSessionLost() {
  const error = new Error('supervising_session_lost');
  error.reasonCode = 'supervising_session_lost';
  return error;
}

/** `{ spawn, activity, append, send, stop, wait, hostAlive, finish }` over `sessionDir`. */
export function createFileHost({ sessionDir, now = Date.now, sleep = pause } = {}) {
  const session = basename(sessionDir);
  const hostPath = join(sessionDir, 'host.json');
  const workerPath = join(sessionDir, 'worker.json');
  let counter = Math.max(0, ...requestNumbers(sessionDir));

  // Set once a fresh heartbeat has been read: from then on a missing or stale one means the session is gone.
  let heartbeatSeen = false;
  const hostAlive = () => {
    const alive = heartbeatFresh(readJson(hostPath), now);
    if (alive) heartbeatSeen = true;
    return alive;
  };
  const assertAlive = () => {
    if (!hostAlive()) throw supervisingSessionLost();
  };
  // The hooks module starts its bridge, and so the heartbeat, only once the supervise call has returned, and that
  // call returns when it sees this request waiting. Until a first heartbeat appears, a request waits for it for
  // one heartbeat window; a heartbeat that is present but stale still fails at once.
  const assertAliveOrStarting = (since) => {
    if (hostAlive()) return;
    const starting = !heartbeatSeen && readJson(hostPath) === null && now() - since <= HOST_HEARTBEAT_MS;
    if (!starting) throw supervisingSessionLost();
  };

  /** Writes one request (and its prompt file, when given) and waits for the hooks module's response. */
  const request = (fields, prompt) => {
    counter += 1;
    const n = counter;
    const base = { schemaVersion: 1, session, n, ...fields };
    if (prompt !== undefined) {
      const promptFile = `request-${n}.prompt.md`;
      writeAtomic(join(sessionDir, promptFile), prompt);
      base.promptFile = promptFile;
    }
    writeAtomic(join(sessionDir, `request-${n}.json`), base);
    const responsePath = join(sessionDir, `response-${n}.json`);
    const since = now();
    for (;;) {
      const response = readJson(responsePath);
      if (response && response.n === n && response.session === session) return response;
      assertAliveOrStarting(since);
      sleep(POLL_MS);
    }
  };

  const agentRecord = (agentId) => readJson(join(sessionDir, `agent-${agentId}.json`));

  return {
    session,
    hostAlive,

    /** Starts a stage subagent. Returns `{ agentId }`; throws `worker_start_refused` when the spawn is denied. */
    spawn({ issue, step, entry, agent, name, model, effort, permissionMode, prompt, cwd }) {
      if (typeof prompt !== 'string') throw new Error('worker_start_refused: the worker prompt is missing');
      const response = request({
        kind: 'spawn', issue, step, entry, agent, name, model,
        effort: effort ?? null, permissionMode, cwd,
      }, prompt);
      if (response.ok !== true || typeof response.agentId !== 'string') {
        throw new Error(`worker_start_refused: ${response.deny ?? 'no agent id returned'}`);
      }
      writeAtomic(workerPath, { issue, stage: step, agentId: response.agentId });
      return { agentId: response.agentId };
    },

    /** The subagent's record (status, tool calls, latest text, activity time), or null before it exists. */
    activity(agentId) {
      return agentRecord(agentId);
    },

    /** Adds guidance to a running subagent's conversation. False when the hooks module refused it. */
    append({ agentId, text }) {
      return request({ kind: 'append', agentId, text }).ok === true;
    },

    /** Resumes a subagent with a message. False when the hooks module refused it. */
    send({ agentId, text }) {
      return request({ kind: 'send', agentId, text }).ok === true;
    },

    /** Stops a subagent. Throws `worker_stop_failed` unless the hooks module confirms the stop. */
    stop(agentId) {
      const response = request({ kind: 'stop', agentId });
      if (response.ok !== true) throw new Error(`worker_stop_failed: ${response.deny ?? 'stop not confirmed'}`);
      return true;
    },

    /**
     * Waits until the subagent is working (`until: 'working'`), has started a turn (`until: 'started'`: an active
     * status, or activity recorded after `since`), or has settled (no active status). Returns `{ timedOut }`; with
     * no `timeoutMs` the wait has no deadline. `changed`, when given, is checked at every poll and ends the wait
     * when it returns true. A stale heartbeat throws.
     */
    wait({ agentId, until, timeoutMs, since, changed } = {}) {
      const deadline = timeoutMs === undefined ? Infinity : now() + timeoutMs;
      for (;;) {
        const record = agentRecord(agentId);
        const status = record?.status ?? null;
        const advanced = Number.isSafeInteger(since) && Number.isSafeInteger(record?.lastActivityAt)
          && record.lastActivityAt > since;
        // A subagent that is pending has not started; running, waiting, or any settled status counts as working.
        const done = until === 'started'
          ? ACTIVE_AGENT_STATUSES.includes(status) || advanced
          : until === 'working'
            ? status !== null && status !== 'pending'
            : status !== null && !ACTIVE_AGENT_STATUSES.includes(status);
        if (done || (typeof changed === 'function' && changed())) return { timedOut: false, record };
        if (now() >= deadline) return { timedOut: true, record };
        assertAlive();
        sleep(Math.max(1, Math.min(POLL_MS, deadline - now())));
      }
    },

    /** Removes the running-worker marker once its turn has been observed. */
    finish() {
      rmSync(workerPath, { force: true });
    },
  };
}
