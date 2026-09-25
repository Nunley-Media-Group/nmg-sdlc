import { resolvePluginController } from "../scripts/plugin-controller-path.mjs";

import {
  INTERACTIVE_COMMANDS,
  interactiveHeadlessMessage,
  isInteractiveHeadless,
  materializeRuntimeMessages,
  packageRoot,
  rewriteInteractiveInput,
  sessionModeFromEntries,
  writeSpecPlanReentry,
} from "./sdlc-commands.mjs";
type ExtensionAPI = {
  setLabel(label: string): void;
  registerCommand(name: string, options: {
    description?: string;
    handler: (args: string, ctx: CommandContext) => void | Promise<void>;
  }): void;
  sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
  on(event: string, handler: (event: unknown, ctx: unknown) => unknown): void;
};

type CommandContext = {
  ui?: { notify?: (msg: string, kind?: string) => void };
  hasUI?: boolean;
  mode?: string;
  sessionManager?: { getEntries?: () => Array<{ type?: string; mode?: string }> };
};


export default function nmgSdlc(pi: ExtensionAPI): void {
  process.env.NMG_SDLC_PLUGIN_ROOT = packageRoot;
  resolvePluginController("sdlc-deliver.mjs", {
    env: process.env,
    importMetaUrl: import.meta.url,
  });
  pi.setLabel("NMG SDLC");

  pi.on("input", (event, ctx) => {
    const input = (event ?? {}) as { text?: string; source?: string };
    const session = (ctx ?? {}) as CommandContext;
    return rewriteInteractiveInput(input.text ?? "", {
      source: input.source,
      sessionMode: sessionModeFromEntries(session.sessionManager?.getEntries?.()),
      headless: isInteractiveHeadless(session),
    });
  });

  const completedWriteSpecPublications = new Set<string>();
  pi.on("tool_result", (event) => {
    const toolResult = (event ?? {}) as { toolCallId?: string; [key: string]: unknown };
    const result = writeSpecPlanReentry(toolResult, packageRoot);
    if (!result || typeof toolResult.toolCallId !== "string") return;
    if (completedWriteSpecPublications.has(toolResult.toolCallId)) return;
    completedWriteSpecPublications.add(toolResult.toolCallId);
    pi.sendUserMessage(result.prompt, { deliverAs: "followUp" });
  });

  pi.on("context", (event) => {
    const context = (event ?? {}) as { messages?: unknown[] };
    const messages = materializeRuntimeMessages(context.messages, packageRoot);
    return messages === context.messages ? undefined : { messages };
  });

  for (const [name, skill, description] of INTERACTIVE_COMMANDS) {
    pi.registerCommand(name, {
      description,
      handler: (args, ctx) => {
        if (isInteractiveHeadless(ctx)) {
          process.stderr.write(interactiveHeadlessMessage(name));
          return;
        }
        const rewritten = rewriteInteractiveInput(`/${name}${args ? ` ${args}` : ""}`, {
          source: "interactive",
          headless: false,
          sessionMode: "none",
        });
        if (!rewritten?.text) return;
        pi.sendUserMessage(rewritten.text);
      },
    });
  }

  // Automated /sdlc-* are file commands in commands/*.md so print/RPC expand
  // them as the initial prompt. Do not registerCommand those names: extension
  // handlers win and sendUserMessage is dropped in print mode.

  pi.on("session_start", (_event, ctx) => {
    const session = (ctx ?? {}) as CommandContext;
    if (process.env.HERDR_ENV === "1") {
      session.ui?.notify?.("NMG SDLC ready in Herdr");
    }
  });
}

