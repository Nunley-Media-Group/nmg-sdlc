export const STAGE_AGENTS: Readonly<Record<"start" | "implement" | "verify" | "deliver", string>>;
export const WORKER_EFFORTS: readonly ["low", "medium", "high", "xhigh", "max"];
export const WORKER_PERMISSION_MODES: readonly ["default", "acceptEdits", "auto", "dontAsk", "bypassPermissions"];
export const REQUEST_KINDS: readonly ["spawn", "append", "send", "stop"];
export const HOST_HEARTBEAT_MS: number;
export function heartbeatFresh(record: { at?: unknown } | null | undefined, now: () => number): boolean;
export const ACTIVE_AGENT_STATUSES: readonly ["pending", "running", "waiting"];

export type HostRequestCheck = { ok: true } | { ok: false; deny: string };

export function validateHostRequest(request: unknown): HostRequestCheck;
export function hostResponse(
  request: { session: string; n: number },
  fields: Record<string, unknown>,
): Record<string, unknown> & { schemaVersion: 1; session: string; n: number };
export function stoppedWorkerDenial(): string;
export function summarizeToolCall(tool: string, input?: Record<string, unknown>): string;

export type ToolCallRecord = { tool: string; summary: string; at: number };
export type TurnRecord = { reason: string; at: number };
export type AgentRecord = {
  schemaVersion: 1;
  agentId: string;
  status: string;
  toolCalls: ToolCallRecord[];
  latestText: string;
  lastActivityAt: number;
  turns: TurnRecord[];
  stopped: boolean;
  updatedAt: number;
};

export function emptyAgentRecord(agentId: string, at: number): AgentRecord;
export function recordToolCall(
  record: AgentRecord,
  call: { tool: string; input?: Record<string, unknown>; at: number },
): AgentRecord;
export function recordTurnEnd(
  record: AgentRecord,
  turn: { reason: string; status?: string; at: number },
): AgentRecord;
export function activityRecord(
  record: Partial<AgentRecord> | null | undefined,
  now: number,
): { status: string; toolCalls: ToolCallRecord[]; latestText: string; lastActivitySecondsAgo: number };

export function checkInNotice(args: { session: string; seq: number; pluginRoot: string }): string;
export function headlessPlanPreamble(name: string): string;
export function agentBody(text: string): string;
export type ExecuteResult = { text: string; exitCode: number };
export function executeResultText(record: unknown): ExecuteResult | null;
export function executeResultPath(claudeSessionId: string): string;
export function missingResultText(claudeSessionId: string): ExecuteResult;
