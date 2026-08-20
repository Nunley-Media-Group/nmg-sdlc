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

const INTERACTIVE_COMMANDS = [
  ["sdlc-draft-issue", "draft-issue", "Draft a groomed GitHub issue"],
  ["sdlc-write-spec", "write-spec", "Write an approved spec for an issue"],
  ["sdlc-onboard-project", "onboard-project", "Initialize or reconcile a project"],
  ["sdlc-upgrade-project", "upgrade-project", "Propose contract and layout upgrades"],
  ["sdlc-run-retro", "run-retro", "Update steering retrospective from defect specs"],
] as const;

const AUTOMATED_COMMANDS = [
  ["sdlc-execute", "execute", "Run automated SDLC delivery"],
  ["sdlc-status", "status", "Report read-only SDLC status"],
  ["sdlc-verify-code", "verify-code", "Verify implementation against the approved spec"],
  ["sdlc-open-pr", "open-pr", "Deliver verified work through exact-head PR merge"],
] as const;

function readRunState(): unknown | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), ".omp", "sdlc", "run.json"), "utf8"));
  } catch {
    return null;
  }
}

export default function nmgSdlc(pi: ExtensionAPI): void {
  pi.setLabel("NMG SDLC");

  for (const [name, skill, description] of INTERACTIVE_COMMANDS) {
    pi.registerCommand(name, {
      description,
      handler: (args) => {
        const suffix = typeof args === "string" && args.trim() ? ` ${args.trim()}` : "";
        pi.sendUserMessage(`/plan /skill:${skill}${suffix}`);
      },
    });
  }

  for (const [name, skill, description] of AUTOMATED_COMMANDS) {
    pi.registerCommand(name, {
      description,
      handler: (args) => {
        const suffix = typeof args === "string" && args.trim() ? ` ${args.trim()}` : "";
        pi.sendUserMessage(`/skill:${skill}${suffix}`);
      },
    });
  }

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
