// Pure protocol for /sdlc-execute stage subagents, shared by the Node controller (scripts/sdlc-execute-host.mjs)
// and the hooks module (hooks/register.ts). Node-free: no imports, so Claude Code's plugin environment can load it.

import { isValidStageModel } from './stage-models.mjs';

/** Stage name → the plugin agent file (agents/<name>.md) whose body is that stage subagent's system prompt. */
export const STAGE_AGENTS = Object.freeze({
  start: 'starter',
  implement: 'spec-implementer',
  verify: 'architecture-reviewer',
  deliver: 'deliverer',
});
const STAGE_ENTRIES = Object.freeze(['start', 'implement', 'verify', 'deliver', 'repair']);
const AGENT_NAMES = Object.freeze(Object.values(STAGE_AGENTS));
export const WORKER_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
export const WORKER_PERMISSION_MODES = Object.freeze(['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions']);
export const REQUEST_KINDS = Object.freeze(['spawn', 'append', 'send', 'stop']);
/** A supervising session whose heartbeat is older than this is gone. */
export const HOST_HEARTBEAT_MS = 60_000;

/** Whether a supervising session's heartbeat record (`host.json`) was written within the heartbeat window. */
export function heartbeatFresh(record, now) {
  return Number.isSafeInteger(record?.at) && now() - record.at <= HOST_HEARTBEAT_MS;
}
/** Agent statuses that mean the subagent is still doing work. */
export const ACTIVE_AGENT_STATUSES = Object.freeze(['pending', 'running', 'waiting']);
/** Agent statuses that mean the subagent's turn has ended. */
export const SETTLED_AGENT_STATUSES = Object.freeze(['idle', 'completed', 'failed', 'killed']);
const RECENT_TOOL_CALLS = 10;
const LATEST_TEXT_CHARS = 2000;
const SUMMARY_CHARS = 200;
const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STOP_DENIAL = 'nmg-sdlc: this /sdlc-execute stage worker was stopped';

const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

/** `{ ok: true }`, or `{ ok: false, deny }` naming the first field the request breaks. */
export function validateHostRequest(request) {
  const deny = (reason) => ({ ok: false, deny: `nmg-sdlc: invalid host request: ${reason}` });
  if (!request || typeof request !== 'object' || Array.isArray(request)) return deny('not an object');
  if (request.schemaVersion !== 1) return deny('schemaVersion must be 1');
  if (!SESSION_RE.test(String(request.session ?? ''))) return deny('session must be a UUID');
  if (!isPositiveInteger(request.n)) return deny('n must be a positive integer');
  if (!REQUEST_KINDS.includes(request.kind)) return deny(`unknown kind ${JSON.stringify(request.kind)}`);
  if (request.kind === 'spawn') {
    if (!isPositiveInteger(request.issue)) return deny('issue must be a positive integer');
    if (!STAGE_ENTRIES.includes(request.entry)) return deny(`unknown entry ${JSON.stringify(request.entry)}`);
    if (!AGENT_NAMES.includes(request.agent)) return deny(`unknown agent ${JSON.stringify(request.agent)}`);
    if (!nonEmpty(request.name)) return deny('name must be a non-empty string');
    if (!isValidStageModel(request.model)) return deny(`invalid model ${JSON.stringify(request.model)}`);
    if (request.effort !== null && !WORKER_EFFORTS.includes(request.effort)) {
      return deny(`effort must be one of ${WORKER_EFFORTS.join(', ')} or null`);
    }
    if (!WORKER_PERMISSION_MODES.includes(request.permissionMode)) {
      return deny(`permission mode must be one of ${WORKER_PERMISSION_MODES.join(', ')}`);
    }
    if (!nonEmpty(request.promptFile)) return deny('promptFile must name the instructions file');
    if (!nonEmpty(request.cwd)) return deny('cwd must be a non-empty string');
    return { ok: true };
  }
  if (!nonEmpty(request.agentId)) return deny('agentId must be a non-empty string');
  if (request.kind === 'append' || request.kind === 'send') {
    if (!nonEmpty(request.text)) return deny(`${request.kind} text must be non-empty`);
  }
  return { ok: true };
}

/** The response the hooks module writes for request `n`. */
export function hostResponse(request, fields) {
  return { schemaVersion: 1, session: request.session, n: request.n, ...fields };
}

/** The denial text a refused stop or spawn returns to the controller. */
export function stoppedWorkerDenial() {
  return STOP_DENIAL;
}

/** A tool call's one-line summary: the Bash command, a file path, or the tool name; at most 200 characters. */
export function summarizeToolCall(tool, input = {}) {
  const name = typeof tool === 'string' && tool ? tool : 'tool';
  const detail = name === 'Bash' ? input?.command : (input?.file_path ?? input?.path);
  const text = typeof detail === 'string' && detail.length > 0 ? detail : name;
  return text.slice(0, SUMMARY_CHARS);
}

/** A new agent record for a subagent the hooks module started. */
export function emptyAgentRecord(agentId, at) {
  return {
    schemaVersion: 1,
    agentId,
    status: 'pending',
    toolCalls: [],
    latestText: '',
    lastActivityAt: at,
    turns: [],
    stopped: false,
    updatedAt: at,
  };
}

/** The record with one more tool call (the newest ten kept) and its activity time. */
export function recordToolCall(record, { tool, input, at }) {
  const call = { tool: typeof tool === 'string' ? tool : 'tool', summary: summarizeToolCall(tool, input), at };
  const toolCalls = [...(record.toolCalls ?? []), call].slice(-RECENT_TOOL_CALLS);
  return { ...record, toolCalls, lastActivityAt: at, updatedAt: at };
}

/** The record after a turn ended: its reason and status, and the activity time. */
export function recordTurnEnd(record, { reason, status, at }) {
  const turns = [...(record.turns ?? []), { reason: typeof reason === 'string' ? reason : 'unknown', at }].slice(-RECENT_TOOL_CALLS);
  return { ...record, status: typeof status === 'string' ? status : record.status, turns, lastActivityAt: at, updatedAt: at };
}

/** The record with a backgrounded Bash command added: its task id, a command summary and its start time. */
export function recordBackgroundStart(record, { taskId, command, at }) {
  const entry = { taskId: String(taskId ?? ''), command: summarizeToolCall('Bash', { command }), startedAt: at };
  return { ...record, background: [...(Array.isArray(record.background) ? record.background : []), entry], updatedAt: at };
}

/** The record with its backgrounded commands dropped, once the worker has settled and started a new turn. */
export function clearBackground(record, at) {
  return { ...record, background: [], updatedAt: at };
}

/** The task id of a Bash call that the timeout or `run_in_background` moved to the background, or null. */
export function backgroundTaskOf(tool, result) {
  const taskId = result?.backgroundTaskId;
  return tool === 'Bash' && typeof taskId === 'string' && taskId.length > 0 ? taskId : null;
}

/** The record as one of the worker's model steps starts: running, and a settled worker's next turn ends the
 * background commands it was tracking. */
export function recordStepStart(record, at) {
  const kept = SETTLED_AGENT_STATUSES.includes(record.status) ? clearBackground(record, at) : record;
  return { ...kept, status: 'running', lastActivityAt: at, updatedAt: at };
}

/** The activity object a check-in report carries: the status, recent tool calls, latest text, seconds since activity,
 * and the oldest running background command with its elapsed seconds (or null). */
export function activityRecord(record, now) {
  const seconds = Math.max(0, Math.round((now - (record?.lastActivityAt ?? now)) / 1000));
  const oldest = Array.isArray(record?.background) ? record.background[0] : undefined;
  return {
    status: record?.status ?? 'unknown',
    toolCalls: (record?.toolCalls ?? []).slice(-RECENT_TOOL_CALLS),
    latestText: String(record?.latestText ?? '').slice(0, LATEST_TEXT_CHARS),
    lastActivitySecondsAgo: seconds,
    background: oldest ? {
      command: oldest.command,
      elapsedSeconds: Math.max(0, Math.round((now - (oldest.startedAt ?? now)) / 1000)),
    } : null,
  };
}

/** The prompt that tells the supervising session to fetch and answer a waiting report. */
export function checkInNotice({ session, seq, pluginRoot }) {
  return `nmg-sdlc /sdlc-execute report ${seq} is waiting. Run: node "${pluginRoot}/scripts/sdlc-execute.mjs" wait --session ${session} --after ${seq - 1}`;
}

/** Removes the leading YAML frontmatter from an agent file, leaving the system prompt body. */
export function agentBody(text) {
  const source = String(text ?? '');
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source);
  return (match ? source.slice(match[0].length) : source).replace(/^\r?\n/, '');
}

/** The `/sdlc-execute --result` answer: the recorded lines and exit status, or null when no record exists. */
export function executeResultText(record) {
  if (!record || record.schemaVersion !== 1 || !Number.isInteger(record.status)
    || !Array.isArray(record.lines) || !record.lines.every((line) => typeof line === 'string')) return null;
  return { text: record.lines.join('\n'), exitCode: record.status };
}

/** Repo-relative result record path for a Claude session. */
export function executeResultPath(claudeSessionId) {
  return `.nmg-sdlc/execute/results/${claudeSessionId}.json`;
}

/** The answer when no result record exists for a Claude session. */
export function missingResultText(claudeSessionId) {
  return { text: `No /sdlc-execute result is recorded for session ${claudeSessionId}.`, exitCode: 2 };
}
