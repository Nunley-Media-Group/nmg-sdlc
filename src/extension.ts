import { resolvePluginController } from "../scripts/plugin-controller-path.mjs";

import {
  INTERACTIVE_COMMANDS,
  interactiveHeadlessMessage,
  isInteractiveHeadless,
  materializeRuntimeMessages,
  packageRoot,
  renderWriteSpecContinuation,
  rewriteInteractiveInput,
  sessionModeFromEntries,
  writeSpecPlanReentry,
} from "./sdlc-commands.mjs";

type HostEditor = { submit(): void; disableSubmit?: boolean };

type ExtensionAPI = {
  setLabel(label: string): void;
  registerCommand(name: string, options: {
    description?: string;
    handler: (args: string, ctx: CommandContext) => void | Promise<void>;
  }): void;
  sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
  on(event: string, handler: (event: unknown, ctx: unknown) => unknown): void;
  pi?: { CustomEditor?: abstract new (...args: never[]) => HostEditor };
};

type CommandContext = {
  ui?: {
    notify?: (msg: string, kind?: string) => void;
    getEditorText?: () => string;
    setEditorText?: (text: string) => void;
    setEditorComponent?: (factory: (tui: { getFocused(): unknown }) => HostEditor) => void;
  };
  hasUI?: boolean;
  mode?: string;
  sessionManager?: {
    getEntries?: () => Array<{ type?: string; mode?: string }>;
    getSessionId?: () => string;
  };
};

type WriteSpecSession = {
  published: Array<{ issue: number; slug: string }>;
  pending: boolean;
};

const PENDING_CONTINUATION_NOTICE = "NMG SDLC: write-spec Continue is pending; it is submitted in plan mode after the next turn ends with an empty editor.";


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

  // A merged write-spec publication is recorded here; the Continue prompt is
  // submitted through the TUI editor on the next terminal agent_end so the
  // builtin /plan command runs and post-merge remediation finishes first.
  const recordedPublications = new Set<string>();
  const writeSpecSessions = new Map<string, WriteSpecSession>();

  pi.on("tool_result", (event, ctx) => {
    const toolResult = (event ?? {}) as { toolCallId?: string; [key: string]: unknown };
    const result = writeSpecPlanReentry(toolResult, packageRoot);
    if (!result || typeof toolResult.toolCallId !== "string") return;
    if (recordedPublications.has(toolResult.toolCallId)) return;
    recordedPublications.add(toolResult.toolCallId);
    const key = ((ctx ?? {}) as CommandContext).sessionManager?.getSessionId?.() ?? "";
    const state = writeSpecSessions.get(key) ?? { published: [], pending: false };
    writeSpecSessions.set(key, state);
    if (state.published.some(({ issue }) => issue === result.issue)) return;
    state.published.push({ issue: result.issue, slug: result.slug });
    state.pending = true;
  });

  pi.on("agent_end", (event, ctx) => {
    if ((event as { willContinue?: boolean } | undefined)?.willContinue === true) return;
    const session = (ctx ?? {}) as CommandContext;
    const state = writeSpecSessions.get(session.sessionManager?.getSessionId?.() ?? "");
    if (!state?.pending) return;
    const ui = session.ui;
    const CustomEditor = pi.pi?.CustomEditor;
    if (
      session.hasUI !== true
      || !ui?.getEditorText
      || !ui.setEditorText
      || !ui.setEditorComponent
      || typeof CustomEditor !== "function"
      || ui.getEditorText() !== ""
    ) {
      ui?.notify?.(PENDING_CONTINUATION_NOTICE, "warning");
      return;
    }
    let editor: HostEditor | undefined;
    try {
      ui.setEditorComponent((tui) => {
        const focused = tui.getFocused();
        if (!(focused instanceof CustomEditor)) throw new Error("focused component is not the TUI editor");
        editor = focused;
        return focused;
      });
    } catch {
      ui.notify?.(PENDING_CONTINUATION_NOTICE, "warning");
      return;
    }
    if (!editor || editor.disableSubmit === true) {
      ui.notify?.(PENDING_CONTINUATION_NOTICE, "warning");
      return;
    }
    const continuation = renderWriteSpecContinuation(packageRoot, process.cwd(), state.published);
    const inPlan = sessionModeFromEntries(session.sessionManager?.getEntries?.()) === "plan";
    state.pending = false;
    try {
      ui.setEditorText(inPlan ? continuation : `/plan\n\n${continuation}`);
      editor.submit();
    } catch {
      ui.setEditorText("");
      state.pending = true;
      ui.notify?.(PENDING_CONTINUATION_NOTICE, "warning");
    }
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

