import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  INTERACTIVE_COMMANDS,
  interactiveHeadlessMessage,
  isInteractiveHeadless,
  rewriteInteractiveInput,
  sessionModeFromEntries,
  withArguments,
  packageRoot,
} from "./sdlc-commands.mjs";
type ExtensionAPI = {
  setLabel(label: string): void;
  registerCommand(name: string, options: {
    description?: string;
    handler: (args: string, ctx: CommandContext) => void | Promise<void>;
  }): void;
  sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
  appendEntry(customType: string, data?: unknown): void;
  on(event: string, handler: (event: unknown, ctx: unknown) => unknown): void;
};

type CommandContext = {
  ui?: { notify?: (msg: string, kind?: string) => void };
  hasUI?: boolean;
  mode?: string;
  sessionManager?: { getEntries?: () => Array<{ type?: string; mode?: string }> };
};

function readRunState(): unknown | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), ".omp", "sdlc", "run.json"), "utf8"));
  } catch {
    return null;
  }
}

export default function nmgSdlc(pi: ExtensionAPI): void {
  process.env.NMG_SDLC_PLUGIN_ROOT = packageRoot;
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

  for (const [name, skill, description] of INTERACTIVE_COMMANDS) {
    pi.registerCommand(name, {
      description,
      handler: (args, ctx) => {
        if (isInteractiveHeadless(ctx)) {
          process.stderr.write(interactiveHeadlessMessage(name));
          return;
        }
        pi.sendUserMessage(`/plan\n\n${withArguments(workflowBody(skill), args)}`);
      },
    });
  }

  // Automated /sdlc-* are file commands in commands/*.md so print/RPC expand
  // them as the initial prompt. Do not registerCommand those names: extension
  // handlers win and sendUserMessage is dropped in print mode.

  pi.on("session_start", async (_event, ctx) => {
    const session = (ctx ?? {}) as CommandContext;
    if (process.env.HERDR_ENV === "1") {
      session.ui?.notify?.("NMG SDLC ready in Herdr");
    }

    const run = readRunState();
    if (run !== null) {
      pi.appendEntry("com.nmg-sdlc.run", run);
    }
  });
}

