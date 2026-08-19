import { readFileSync } from "node:fs";
import { join } from "node:path";

type ExtensionAPI = {
  setLabel(label: string): void;
  registerCommand(name: string, options: {
    description?: string;
    handler: (args: string, ctx: { ui?: { notify?: (msg: string, kind?: string) => void } }) => void | Promise<void>;
  }): void;
  sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
  appendEntry(customType: string, data?: unknown): void;
  on(event: string, handler: (event: unknown, ctx: unknown) => unknown): void;
};

type CommandContext = {
  ui?: { notify?: (msg: string, kind?: string) => void };
};

function readRunState(): unknown | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), ".omp", "sdlc", "run.json"), "utf8"));
  } catch {
    return null;
  }
}

export default function nmgSdlc(pi: ExtensionAPI): void {
  pi.setLabel("NMG SDLC");

  pi.registerCommand("execute", {
    description: "Run automated SDLC delivery",
    handler: (args) => {
      const suffix = typeof args === "string" && args.trim() ? ` ${args.trim()}` : "";
      pi.sendUserMessage(`/skill:execute${suffix}`);
    },
  });

  pi.registerCommand("draft-issue", {
    description: "Print the native /plan invocation for draft-issue",
    handler: (args, ctx: CommandContext) => {
      const suffix = typeof args === "string" && args.trim() ? ` ${args.trim()}` : "";
      const line = `Run /plan /skill:draft-issue${suffix}`;
      ctx?.ui?.notify?.(line);
      return line;
    },
  });

  pi.registerCommand("write-spec", {
    description: "Print the native /plan invocation for write-spec",
    handler: (args, ctx: CommandContext) => {
      const suffix = typeof args === "string" && args.trim() ? ` ${args.trim()}` : "";
      const line = `Run /plan /skill:write-spec${suffix}`;
      ctx?.ui?.notify?.(line);
      return line;
    },
  });

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
