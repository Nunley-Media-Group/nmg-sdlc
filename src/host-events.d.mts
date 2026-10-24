export const INTERACTIVE_COMMANDS: ReadonlyArray<readonly [string, string, string]>;
export const AUTOMATED_COMMANDS: ReadonlyArray<readonly [string, string, string]>;
export const WRITE_SPEC_FINISHED_LABELS: readonly string[];
export const PLAN_ENABLED_TEXT: string;
export function isInteractiveCommand(name: unknown): boolean;
export function parseInteractiveSlash(text: unknown): { command: string; skill: string; args: string } | null;
export function withArguments(body: string, args: unknown): string;
export function interactiveHeadlessMessage(commandName: string): string;
export function writeSpecMergeCommand(command: unknown, root: string): { issue: number; slug: string } | null;
export function soleJsonObject(text: unknown): Record<string, unknown> | null;
export function writeSpecPublication(
  call: { toolUseId: unknown; command: unknown; stdout: unknown },
  root: string,
): { issue: number; slug: string; pr: number } | null;
export function writeSpecFinishedSelection(answers: Record<string, unknown> | null | undefined): boolean;
export function recommendedAnswers(questions: unknown, options?: { prefer?: readonly string[] }): Record<string, string>;
export function materializePluginRootCommand(command: string, root: string): string;
export function materializePluginRootPath<T extends string | undefined>(path: T, root: string): T;
