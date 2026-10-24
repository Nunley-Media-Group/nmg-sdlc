import {
  defaultPromptRegistry,
  renderPrompt,
  writePromptProvenance,
} from "./sdlc-prompt-snippets.mjs";
import { packageRoot } from "./sdlc-workflows.mjs";
import { materializeControllerPaths } from "../scripts/plugin-controller-path.mjs";
import { SDLC_EFFORTS, SDLC_MODELS } from "./host-events.mjs";

export { packageRoot, workflowBody } from "./sdlc-workflows.mjs";
export { materializeControllerPaths } from "../scripts/plugin-controller-path.mjs";
export {
  AUTOMATED_COMMANDS,
  DIRECT_COMMANDS,
  INTERACTIVE_COMMANDS,
  WRITE_SPEC_FINISHED_LABELS,
  interactiveHeadlessMessage,
  isInteractiveCommand,
  parseInteractiveSlash,
  recommendedAnswers,
  withArguments,
  writeSpecFinishedSelection,
  writeSpecMergeIssue,
  writeSpecMergeResult,
  writeSpecPublication,
} from "./host-events.mjs";

export const AUTOMATED_ARGUMENT_HINTS = Object.freeze({
  "sdlc-status": "[--json]",
  "sdlc-verify-code": "[#N]",
  "sdlc-open-pr": "[#N]",
});

const REPAIR_COMMANDS = new Set(["sdlc-onboard-project", "sdlc-upgrade-project", "sdlc-steering"]);

export function renderInteractiveWorkflow(command, root, provenanceRoot) {
  const pluginRoot = root ?? packageRoot;
  const projectRoot = provenanceRoot === undefined ? process.cwd() : provenanceRoot;
  const { text, provenance } = renderPrompt(
    defaultPromptRegistry(pluginRoot, {
      projectRoot,
      pluginOnly: REPAIR_COMMANDS.has(command),
    }),
    { consumer: command, vars: {} },
  );
  if (typeof projectRoot === "string" && projectRoot.length > 0) {
    writePromptProvenance(projectRoot, provenance);
  }
  return materializeControllerPaths(text, pluginRoot);
}

/**
 * Post-publication Continue prompt: the complete write-spec workflow, entered
 * at its Continue loop with every issue published in this session.
 * `published` is the ordered `[{ issue, slug }]` list recorded from merged
 * helper results.
 */
export function renderWriteSpecContinuation(root, projectRoot, published) {
  const numbers = published.map(({ issue }) => issue).join(", ");
  const names = published.map(({ issue, slug }) => `${issue}-${slug}`).join(", ");
  const header = `Post-publication continuation. published[] = [${numbers}] (N-slug names: ${names}). Skip Initial issue selection and start ## Continue loop.`;
  return `${header}\n\n${renderInteractiveWorkflow("sdlc-write-spec", root, projectRoot)}`;
}


export function renderAutomatedCommandMarkdown(name, skill, description, root = packageRoot) {
  const { text } = renderPrompt(defaultPromptRegistry(root), { consumer: name, vars: {} });
  // Claude Code substitutes ${CLAUDE_PLUGIN_ROOT} in plugin command files, in
  // the TUI and under `claude -p` alike.
  const body = text.replaceAll("<plugin-root>", "${CLAUDE_PLUGIN_ROOT}").replace(/\s*$/, "\n");
  const effort = SDLC_EFFORTS.commands[name];
  return `---\ndescription: ${JSON.stringify(description)}\nargument-hint: ${JSON.stringify(AUTOMATED_ARGUMENT_HINTS[name] ?? "")}\nmodel: ${SDLC_MODELS.commands[name]}\n${effort ? `effort: ${effort}\n` : ""}---\n\n${body}`;
}
