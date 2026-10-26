export const INTERACTIVE_COMMANDS: ReadonlyArray<readonly [string, string, string]>;
export const AUTOMATED_COMMANDS: ReadonlyArray<readonly [string, string, string]>;
export const DIRECT_COMMANDS: readonly string[];
export type SdlcModel = "haiku" | "sonnet" | "opus";
export const SDLC_MODELS: {
  readonly stages: { readonly start: SdlcModel; readonly implement: SdlcModel; readonly verify: SdlcModel; readonly deliver: SdlcModel };
  readonly repair: SdlcModel;
  readonly commands: { readonly [command: string]: SdlcModel };
};
export type SdlcEffort = "low" | "medium" | "high" | "xhigh" | "max";
export const SDLC_EFFORTS: {
  readonly stages: { readonly [step: string]: SdlcEffort };
  readonly commands: { readonly [command: string]: SdlcEffort };
};
export const WRITE_SPEC_FINISHED_LABELS: readonly string[];
export const PLAN_ENABLED_TEXT: string;
export function isInteractiveCommand(name: unknown): boolean;
export function parseInteractiveSlash(text: unknown): { command: string; skill: string; args: string } | null;
export function withArguments(body: string, args: unknown): string;
export function interactiveHeadlessMessage(commandName: string): string;
export function executeModelRefusal(model: unknown): string | null;
export const EXECUTE_GOAL_MAX_ISSUES: number;
export function executeGoalCondition(issues: unknown): string | null;
export function executeGoalRequest(call?: { command?: unknown; stdout?: unknown }): number[] | null;
export function isExecuteSuperviseCommand(command: unknown): boolean;
export function executeGoalStoppedLine(reason: unknown): string;
export function writeSpecMergeIssue(command: unknown): number | null;
export function writeSpecMergeResult(text: unknown): { issue: number; slug: string; pr: number } | null;
export function soleJsonObject(text: unknown): Record<string, unknown> | null;
export function writeSpecPublication(
  call: { toolUseId: unknown; command: unknown; stdout: unknown },
): { issue: number; slug: string; pr: number } | null;
export function writeSpecFinishedSelection(answers: Record<string, unknown> | null | undefined): boolean;
export function recommendedAnswers(questions: unknown, options?: { prefer?: readonly string[] }): Record<string, string>;
export function materializePluginRootCommand(command: string, root: string): string;
export function materializePluginRootPath<T extends string | undefined>(path: T, root: string): T;
