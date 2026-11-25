import {
  defaultPromptRegistry,
  renderPrompt,
  writePromptProvenance,
} from "./sdlc-prompt-snippets.mjs";
import { packageRoot } from "./sdlc-workflows.mjs";
import { materializeControllerPaths } from "../scripts/plugin-controller-path.mjs";
import { SDLC_EFFORTS, SDLC_MODELS, materializePluginRootCommand } from "./host-events.mjs";

export { packageRoot, workflowBody } from "./sdlc-workflows.mjs";
export { materializeControllerPaths } from "../scripts/plugin-controller-path.mjs";
export {
  AUTOMATED_COMMANDS,
  DIRECT_COMMANDS,
  INTERACTIVE_COMMANDS,
  WRITE_SPEC_FINISHED_LABELS,
  executeModelRefusal,
  interactiveHeadlessMessage,
  isInteractiveCommand,
  parseInteractiveSlash,
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
  "sdlc-verify-full": "[REF] | check --action NAME --commit REF",
});

const REPAIR_COMMANDS = new Set(["sdlc-onboard-project", "sdlc-upgrade-project", "sdlc-steering"]);

export function renderInteractiveWorkflow(command, root, provenanceRoot) {
  const pluginRoot = root ?? packageRoot;
  const projectRoot = provenanceRoot === undefined ? process.cwd() : provenanceRoot;
  const { text, provenance } = renderPrompt(
    defaultPromptRegistry(pluginRoot, {
      projectRoot,
      pluginOnly: REPAIR_COMMANDS.has(command),
      consumer: command,
    }),
    { consumer: command, vars: {} },
  );
  if (typeof projectRoot === "string" && projectRoot.length > 0) {
    writePromptProvenance(projectRoot, provenance);
  }
  return materializeRenderedPluginRoot(materializeControllerPaths(text, pluginRoot), pluginRoot);
}

const PLUGIN_ROOT_PLACEHOLDER = "<plugin-root>";
// A fenced code block: an opening run of three or more backticks (whose info
// string holds no backtick), its body, and the matching closing fence, or the
// end of the text when the fence is never closed.
const FENCED_BLOCK_RE = /^ {0,3}(`{3,})[^`\n]*\n[\s\S]*?(?:^ {0,3}\1`*[ \t]*$|(?![\s\S]))/gm;
// An inline code span on one line, or a bare placeholder in prose.
const PROSE_PLACEHOLDER_RE = /`([^`\n]*)`|<plugin-root>/g;

function materializeProseRoot(text, bareRoot) {
  return text.replace(PROSE_PLACEHOLDER_RE, (match, span) => {
    if (span === undefined) return bareRoot;
    if (!span.includes(PLUGIN_ROOT_PLACEHOLDER)) return match;
    // A span with whitespace is a command; a single path or token takes the bare root unquoted.
    const content = /\s/.test(span)
      ? materializePluginRootCommand(span, bareRoot)
      : span.replaceAll(PLUGIN_ROOT_PLACEHOLDER, bareRoot);
    return `\`${content}\``;
  });
}

/**
 * Substitutes the absolute plugin root for every `<plugin-root>` in rendered
 * Markdown. Fenced code blocks and command-like inline spans pass through
 * `materializePluginRootCommand`, so an unquoted shell operand becomes one
 * quoted word and a glob tail stays unquoted. Prose and single-token spans take
 * the bare root. Text without the placeholder, or without a root, is returned unchanged.
 */
export function materializeRenderedPluginRoot(text, root) {
  if (typeof text !== "string" || !text.includes(PLUGIN_ROOT_PLACEHOLDER)) return text;
  if (typeof root !== "string" || root.length === 0) return text;
  const bareRoot = root.replace(/[\\/]+$/, "");
  let rewritten = "";
  let last = 0;
  for (const block of text.matchAll(FENCED_BLOCK_RE)) {
    rewritten += materializeProseRoot(text.slice(last, block.index), bareRoot);
    rewritten += materializePluginRootCommand(block[0], bareRoot);
    last = block.index + block[0].length;
  }
  return rewritten + materializeProseRoot(text.slice(last), bareRoot);
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
