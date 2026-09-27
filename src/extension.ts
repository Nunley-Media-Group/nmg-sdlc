import { resolvePluginController } from "../scripts/plugin-controller-path.mjs";

import {
  INTERACTIVE_COMMANDS,
  interactiveHeadlessMessage,
  isInteractiveHeadless,
  materializeRuntimeMessages,
  packageRoot,
  parseInteractiveSlash,
  renderWriteSpecContinuation,
  rewriteInteractiveInput,
  sessionModeFromEntries,
  writeSpecFinishedSelection,
  writeSpecPlanReentry,
} from "./sdlc-commands.mjs";

type HostEditor = {
  submit(): void;
  disableSubmit?: boolean;
  onSubmit?: (text: string) => void | Promise<void>;
};

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
  };
};

type WriteSpecContinuation = {
  published: Array<{ issue: number; slug: string }>;
  pending: boolean;
  // A write-spec session (the command or its continuation) is running.
  active: boolean;
  // A Finished picker selection awaits the next terminal agent_end.
  exitPending: boolean;
};

const PENDING_CONTINUATION_NOTICE = "NMG SDLC: write-spec Continue is pending; it is submitted in plan mode after the next turn ends with an empty editor.";
const FINISHED_EXIT_NOTICE = "NMG SDLC: write-spec finished, but plan mode is still active; /plan exits it.";


export default function nmgSdlc(pi: ExtensionAPI): void {
  process.env.NMG_SDLC_PLUGIN_ROOT = packageRoot;
  resolvePluginController("sdlc-deliver.mjs", {
    env: process.env,
    importMetaUrl: import.meta.url,
  });
  pi.setLabel("NMG SDLC");

  // One write-spec run per TUI process: plan approval ("Approve and execute")
  // clears into a new session, so published[] must outlive the session id.
  // Each new /sdlc-write-spec invocation starts a fresh list.
  const writeSpec: WriteSpecContinuation = { published: [], pending: false, active: false, exitPending: false };
  const recordedPublications = new Set<string>();

  pi.on("input", (event, ctx) => {
    const input = (event ?? {}) as { text?: string; source?: string };
    const session = (ctx ?? {}) as CommandContext;
    const rewritten = rewriteInteractiveInput(input.text ?? "", {
      source: input.source,
      sessionMode: sessionModeFromEntries(session.sessionManager?.getEntries?.()),
      headless: isInteractiveHeadless(session),
    });
    if (rewritten) startInteractiveCommand(parseInteractiveSlash(input.text)?.command);
    return rewritten;
  });

  // A merged write-spec publication is recorded here; the Continue prompt is
  // submitted through the TUI editor on the next terminal agent_end so the
  // builtin /plan command runs and post-merge remediation finishes first.
  pi.on("tool_result", (event) => {
    const toolResult = (event ?? {}) as { toolCallId?: string; [key: string]: unknown };
    const finished = writeSpecFinishedSelection(toolResult);
    if (finished !== null) {
      if (writeSpec.active) writeSpec.exitPending = finished;
      return;
    }
    const result = writeSpecPlanReentry(toolResult, packageRoot);
    if (!result || typeof toolResult.toolCallId !== "string") return;
    if (recordedPublications.has(toolResult.toolCallId)) return;
    recordedPublications.add(toolResult.toolCallId);
    if (writeSpec.published.some(({ issue }) => issue === result.issue)) return;
    writeSpec.published.push({ issue: result.issue, slug: result.slug });
    writeSpec.pending = true;
  });

  function startInteractiveCommand(command: string | undefined): void {
    if (command === "sdlc-write-spec") {
      Object.assign(writeSpec, { published: [], pending: false, active: true, exitPending: false });
    } else {
      Object.assign(writeSpec, { active: false, exitPending: false });
    }
  }

  // The focused TUI editor, only when the draft is empty and it can submit.
  function focusedEditor(session: CommandContext): HostEditor | undefined {
    const ui = session.ui;
    const CustomEditor = pi.pi?.CustomEditor;
    if (
      session.hasUI !== true
      || !ui?.getEditorText
      || !ui.setEditorComponent
      || typeof CustomEditor !== "function"
      || ui.getEditorText() !== ""
    ) {
      return undefined;
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
      return undefined;
    }
    return editor && editor.disableSubmit !== true ? editor : undefined;
  }

  function submitContinuation(session: CommandContext): void {
    const ui = session.ui;
    const editor = ui?.setEditorText ? focusedEditor(session) : undefined;
    if (!ui?.setEditorText || !editor) {
      ui?.notify?.(PENDING_CONTINUATION_NOTICE, "warning");
      return;
    }
    const continuation = renderWriteSpecContinuation(packageRoot, process.cwd(), writeSpec.published);
    const inPlan = sessionModeFromEntries(session.sessionManager?.getEntries?.()) === "plan";
    writeSpec.pending = false;
    try {
      ui.setEditorText(inPlan ? continuation : `/plan\n\n${continuation}`);
      editor.submit();
      writeSpec.active = true;
    } catch {
      ui.setEditorText("");
      writeSpec.pending = true;
      ui.notify?.(PENDING_CONTINUATION_NOTICE, "warning");
    }
  }

  // Bare /plan pauses an enabled plan and a second /plan from plan_paused
  // disables it. Each toggle is awaited through the editor's onSubmit handler
  // because submit() does not await it.
  function exitPlanMode(session: CommandContext): void {
    const currentMode = () => sessionModeFromEntries(session.sessionManager?.getEntries?.());
    const mode = currentMode();
    if (mode !== "plan" && mode !== "plan_paused") {
      writeSpec.active = false;
      return;
    }
    const editor = focusedEditor(session);
    const onSubmit = editor?.onSubmit;
    if (!editor || typeof onSubmit !== "function") {
      session.ui?.notify?.(FINISHED_EXIT_NOTICE, "warning");
      return;
    }
    void (async () => {
      try {
        for (let toggle = 0; toggle < 2; toggle++) {
          const before = currentMode();
          if (before !== "plan" && before !== "plan_paused") break;
          await onSubmit.call(editor, "/plan");
          if (currentMode() === before) break;
        }
      } catch {
        // Reported below: the mode is still plan or plan_paused.
      }
      if (currentMode() === "none") writeSpec.active = false;
      else session.ui?.notify?.(FINISHED_EXIT_NOTICE, "warning");
    })();
  }

  pi.on("agent_end", (event, ctx) => {
    if ((event as { willContinue?: boolean } | undefined)?.willContinue === true) return;
    const session = (ctx ?? {}) as CommandContext;
    if (writeSpec.pending) {
      writeSpec.exitPending = false;
      submitContinuation(session);
      return;
    }
    if (!writeSpec.exitPending) return;
    writeSpec.exitPending = false;
    exitPlanMode(session);
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
        startInteractiveCommand(name);
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

