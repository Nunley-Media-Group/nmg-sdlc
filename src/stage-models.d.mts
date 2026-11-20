export const STAGE_MODELS_PATH: "steering/sdlc-models.json";
export const STAGE_NAMES: readonly ["start", "implement", "verify", "deliver", "repair"];
export const TOP_LEVEL_KEYS: readonly string[];
export const OPTIONAL_TOP_LEVEL_KEYS: readonly ["selection"];

export type StageName = (typeof STAGE_NAMES)[number];
export type StageEffort = "low" | "medium" | "high" | "xhigh" | "max" | "default";
export type StageEntry = { model: string; effort: StageEffort };

export const STAGE_MODEL_DEFAULTS: {
  readonly version: 1;
  readonly start: StageEntry;
  readonly implement: StageEntry;
  readonly verify: StageEntry;
  readonly deliver: StageEntry;
  readonly repair: StageEntry;
};

export const SELECTION_MODEL_DEFAULT: StageEntry;

export const SUPERSEDED_STAGE_MODEL_DEFAULTS: { readonly [stage in StageName]?: readonly StageEntry[] };

export class StageModelsError extends Error {
  readonly key: string;
  readonly value: unknown;
  constructor(key: string, value: unknown, reason: string);
}

export function isValidStageModel(model: unknown): boolean;
export function validateStageModels(value: unknown): { missing: string[] };
export function stageModelsWarning(
  result: { missing?: boolean; missingKeys?: readonly string[] } | null | undefined,
): string | null;
export function selectionModel(config: { selection?: Partial<StageEntry> } | null | undefined): StageEntry;
