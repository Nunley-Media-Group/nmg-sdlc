#!/usr/bin/env node

/**
 * Exercise a public /sdlc-* command against a project via OMP RPC.
 *
 * `omp --print` treats registered slash commands as locally handled and exits
 * before pi.sendUserMessage() drains. RPC waits for the nested prompt.
 * Native /plan still requires the TUI input path; this harness does not
 * enter plan mode.
 *
 * Usage:
 *   node scripts/exercise-omp.mjs --cwd <project> -- /sdlc-status --json
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { terminateOwnedProcessGroup } from "../src/process-supervision.mjs";
import { isCliEntry } from "./plugin-controller-path.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function exerciseError(reasonCode, message) {
  const error = new Error(message);
  error.reasonCode = reasonCode;
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
    if (token === "--help" || token === "-h") {
      values.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return values;
}

export function usage() {
  return "Usage: node scripts/exercise-omp.mjs --cwd <project> -- /sdlc-<command> [args]\n";
}

export function exerciseOmpArgs({ cwd }) {
  return [
    "--mode", "rpc",
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--extension", resolve(REPO_ROOT, "src/extension.ts"),
    "--plugin-dir", REPO_ROOT,
    "--add-dir", REPO_ROOT,
    "--cwd", resolve(cwd),
    "--auto-approve",
  ];
}

export async function runExercise(options) {
  const cwd = resolve(options.cwd);
  const message = options.message;
  const child = (options.spawnProcess ?? spawn)(
    "omp",
    exerciseOmpArgs({ cwd }),
    {
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  let nextId = 1;
  const pending = new Map();
  let resolveReady;
  let childClosed = false;
  let resolveAgentEnd;
  let resolveLoss;
  let intentionalStop = false;
  const ready = new Promise((resolvePromise) => { resolveReady = resolvePromise; });
  const agentEnded = new Promise((resolvePromise) => { resolveAgentEnd = resolvePromise; });
  const processLost = new Promise((resolvePromise) => { resolveLoss = resolvePromise; });
  const raceLoss = (promise) => Promise.race([
    promise,
    processLost.then((error) => { throw error; }),
  ]);

  const send = (frame) => {
    const id = String(nextId++);
    const response = new Promise((resolvePromise, reject) => {
      pending.set(id, { resolve: resolvePromise, reject });
    });
    child.stdin.write(`${JSON.stringify({ id, ...frame })}\n`, (error) => {
      if (error && pending.has(id)) {
        pending.get(id).reject(exerciseError("process_lost", `OMP RPC write failed: ${error.message}`));
        pending.delete(id);
      }
    });
    return raceLoss(response);
  };

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.type === "ready") {
      resolveReady();
      return;
    }
    if (msg.type === "agent_end") {
      resolveAgentEnd();
      return;
    }
    if (msg.type === "response" && pending.has(msg.id)) {
      const { resolve: resolvePromise, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.success === false) reject(new Error(msg.error || JSON.stringify(msg)));
      else resolvePromise(msg);
    }
  });

  child.once("error", (error) => {
    if (!intentionalStop) resolveLoss(exerciseError("launch_failed", `OMP RPC launch failed: ${error.message}`));
  });
  child.once("close", (code, signal) => {
    childClosed = true;
    if (!intentionalStop) {
      const reasonCode = (typeof code === "number" && code !== 0) || signal ? "process_failed" : "process_lost";
      resolveLoss(exerciseError(
        reasonCode,
        `OMP RPC process ${reasonCode === "process_failed" ? "failed" : "was lost"} before completion${typeof code === "number" ? ` (exit ${code})` : signal ? ` (${signal})` : ""}${stderr ? `\n${stderr}` : ""}`,
      ));
    }
  });
  let cancel;
  const cancelled = new Promise((_, reject) => {
    cancel = () => reject(exerciseError("cancelled", "OMP RPC exercise cancelled"));
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
  });
  const raceTerminal = (promise) => options.signal
    ? Promise.race([raceLoss(promise), cancelled])
    : raceLoss(promise);

  try {
    await raceTerminal(ready);
    await raceTerminal(send({ type: "prompt", message }));
    await raceTerminal(agentEnded);
    const last = await raceTerminal(send({ type: "get_last_assistant_text" }));
    return { text: last.data?.text || "", stderr };
  } finally {
    intentionalStop = true;
    options.signal?.removeEventListener("abort", cancel);
    for (const { reject } of pending.values()) reject(exerciseError("cancelled", "OMP RPC exercise stopped"));
    pending.clear();
    try { child.stdin.end(); } catch {}
    const cleanup = await terminateOwnedProcessGroup(child, {
      closed: childClosed,
    });
    if (!cleanup.ok) throw exerciseError("cleanup_failed", `OMP RPC cleanup failed: ${cleanup.error.message}`);
    rl.close();
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
