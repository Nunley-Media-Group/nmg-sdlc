#!/usr/bin/env node

/**
 * Exercise a public /sdlc-* command against a project through headless Claude
 * Code with this checkout loaded as the plugin.
 *
 * The child is `claude -p --plugin-dir <repo root>` in stream-json mode, run
 * in the project directory. The command is sent as one stream-json user
 * message; the exercise ends at the first `result` message.
 *
 * Automated commands (`commands/*.md`) expand under `-p` and run to
 * completion. Interactive commands are registered by the hooks module and need
 * the TUI: under `-p` Claude Code answers `Run /<command> in the TUI.` without
 * a model turn (exit 2 in text mode). The exercise reports that faithfully as
 * reason `interactive_only` and exits 2. Native plan mode needs the TUI too;
 * this harness does not enter it.
 *
 * Usage:
 *   node scripts/exercise-claude.mjs --cwd <project> [--model <model>] -- /sdlc-status --json
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { terminateOwnedProcessGroup, terminateOwnedProcessGroupAfterLeaderLoss } from "../src/process-supervision.mjs";
import { interactiveHeadlessMessage, parseInteractiveSlash } from "../src/host-events.mjs";
import { isCliEntry } from "./plugin-controller-path.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Exit status for an interactive command that Claude Code refused under -p. */
export const INTERACTIVE_ONLY_EXIT = 2;

function exerciseError(reasonCode, message, extra = {}) {
  const error = new Error(message);
  error.reasonCode = reasonCode;
  Object.assign(error, extra);
  return error;
}

export function parseExerciseArgs(argv) {
  const values = { cwd: process.cwd(), message: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      values.message = argv.slice(i + 1).join(" ").trim();
      break;
    }
    if (token === "--cwd") {
      values.cwd = argv[++i];
      continue;
    }
    if (token === "--model") {
      values.model = argv[++i];
      if (!values.model) throw new Error("--model requires a value");
      continue;
    }
    if (token === "--help" || token === "-h") {
      values.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return values;
}

export function usage() {
  return "Usage: node scripts/exercise-claude.mjs --cwd <project> [--model <model>] -- /sdlc-<command> [args]\n";
}

/**
 * `claude` arguments for one exercise. The project directory is the child's
 * working directory (Claude Code has no --cwd flag); `--add-dir` grants tool
 * access to this checkout, as the OMP harness did.
 */
export function exerciseClaudeArgs({ model } = {}) {
  return [
    "-p",
    "--plugin-dir", REPO_ROOT,
    "--add-dir", REPO_ROOT,
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--no-session-persistence",
    "--permission-mode", "bypassPermissions",
    ...(model ? ["--model", model] : []),
  ];
}

/** The stream-json user frame that submits `message` as the person's prompt. */
export function userMessageFrame(message) {
  return { type: "user", message: { role: "user", content: [{ type: "text", text: message }] } };
}

/** Last assistant text block in a stream-json `assistant` frame, or "". */
function assistantText(frame) {
  const content = frame?.message?.content;
  if (!Array.isArray(content)) return "";
  const texts = content.filter((block) => block?.type === "text" && typeof block.text === "string");
  return texts.length > 0 ? texts.map((block) => block.text).join("") : "";
}

/**
 * True when `text` is the hooks module's headless refusal for the interactive
 * command `message` invoked. Claude Code may prefix it with the plugin name
 * (`nmg-sdlc: Run /sdlc-draft-issue in the TUI.`).
 */
export function isInteractiveRefusal(message, text) {
  const slash = parseInteractiveSlash(message);
  if (!slash || typeof text !== "string") return false;
  return text.trim().endsWith(interactiveHeadlessMessage(slash.command).trim());
}

export async function runExercise(options) {
  const cwd = resolve(options.cwd);
  const message = options.message;
  const child = (options.spawnProcess ?? spawn)(
    "claude",
    exerciseClaudeArgs({ model: options.model }),
    {
      cwd,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  let lastAssistantText = "";
  let resolveResult;
  let resolveLoss;
  let intentionalStop = false;
  let cleanupPromise;
  const cleanup = (leaderLost = false) => cleanupPromise ??= (
    leaderLost ? terminateOwnedProcessGroupAfterLeaderLoss : terminateOwnedProcessGroup
  )(child);
  const resultReceived = new Promise((resolvePromise) => { resolveResult = resolvePromise; });
  const processLost = new Promise((resolvePromise) => { resolveLoss = resolvePromise; });
  const raceLoss = (promise) => Promise.race([
    promise,
    processLost.then((error) => { throw error; }),
  ]);

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg?.type === "assistant" && !msg.parent_tool_use_id) {
      const text = assistantText(msg);
      if (text) lastAssistantText = text;
      return;
    }
    if (msg?.type === "result") resolveResult(msg);
  });

  child.once("error", (error) => {
    if (!intentionalStop) resolveLoss(exerciseError("launch_failed", `Claude Code launch failed: ${error.message}`));
  });
  const lost = async (code, signal) => {
    if (intentionalStop) return;
    const result = await cleanup(true);
    if (!intentionalStop) {
      if (!result.ok) {
        resolveLoss(exerciseError("cleanup_failed", `Claude Code cleanup failed: ${result.error.message}`));
        return;
      }
      const reasonCode = (typeof code === "number" && code !== 0) || signal ? "process_failed" : "process_lost";
      resolveLoss(exerciseError(
        reasonCode,
        `Claude Code process ${reasonCode === "process_failed" ? "failed" : "was lost"} before completion${typeof code === "number" ? ` (exit ${code})` : signal ? ` (${signal})` : ""}${stderr ? `\n${stderr}` : ""}`,
      ));
    }
  };
  // Start cleanup at leader exit; inherited pipes may keep close from arriving.
  child.once("exit", lost);
  child.once("close", lost);
  let cancel;
  const cancelled = new Promise((_, reject) => {
    cancel = () => reject(exerciseError("cancelled", "Claude Code exercise cancelled"));
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
  });
  const raceTerminal = (promise) => options.signal
    ? Promise.race([raceLoss(promise), cancelled])
    : raceLoss(promise);

  const write = (frame) => new Promise((resolvePromise, reject) => {
    child.stdin.write(`${JSON.stringify(frame)}\n`, (error) => {
      if (error) reject(exerciseError("process_lost", `Claude Code stream-json write failed: ${error.message}`));
      else resolvePromise();
    });
  });

  try {
    // Claude Code emits its init frame only after the first user message, so
    // there is no ready handshake: submit the command immediately.
    if (options.signal?.aborted) await cancelled;
    await raceTerminal(write(userMessageFrame(message)));
    const result = await raceTerminal(resultReceived);
    const text = typeof result.result === "string" && result.result.length > 0 ? result.result : lastAssistantText;
    if (isInteractiveRefusal(message, text)) {
      throw exerciseError("interactive_only", text.trim(), { exitCode: INTERACTIVE_ONLY_EXIT, text, stderr });
    }
    if (result.is_error) {
      const detail = text || (Array.isArray(result.errors) ? result.errors.join("\n") : "") || result.subtype || "error";
      throw exerciseError("command_failed", `Claude Code reported ${result.subtype ?? "an error"}: ${detail}`, { text, stderr });
    }
    return { text, stderr };
  } finally {
    intentionalStop = true;
    options.signal?.removeEventListener("abort", cancel);
    try { child.stdin.end(); } catch {}
    const result = await cleanup();
    rl.close();
    if (!result.ok) {
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref?.();
      throw exerciseError("cleanup_failed", `Claude Code cleanup failed: ${result.error.message}`);
    }
  }
}

async function main(argv) {
  let values;
  try {
    values = parseExerciseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}`);
    return 2;
  }
  if (values.help || !values.message) {
    process.stdout.write(usage());
    return values.help ? 0 : 2;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const result = await runExercise({ ...values, signal: controller.signal });
    if (result.text) process.stdout.write(result.text.endsWith("\n") ? result.text : `${result.text}\n`);
    return 0;
  } catch (error) {
    if (error?.reasonCode === "interactive_only") {
      // Mirror `claude -p`: the refusal on stdout, exit 2.
      process.stdout.write(`${error.message}\n`);
      return INTERACTIVE_ONLY_EXIT;
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return error?.reasonCode === "cancelled" ? 130 : 1;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

if (isCliEntry(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
