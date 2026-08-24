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
import { isCliEntry } from "./plugin-controller-path.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseExerciseArgs(argv) {
  const values = { cwd: process.cwd(), timeoutMs: 180_000, message: "" };
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
    if (token === "--timeout-ms") {
      values.timeoutMs = Number(argv[++i]);
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

export async function runExercise(options) {
  const cwd = resolve(options.cwd);
  const message = options.message;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const child = spawn("omp", [
    "--mode", "rpc",
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--extension", resolve(REPO_ROOT, "src/extension.ts"),
    "--plugin-dir", REPO_ROOT,
    "--add-dir", REPO_ROOT,
    "--cwd", cwd,
    "--auto-approve",
    "--max-time", String(Math.ceil(timeoutMs / 1000)),
  ], { stdio: ["pipe", "pipe", "pipe"] });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  let nextId = 1;
  const pending = new Map();
  const send = (frame) => {
    const id = String(nextId++);
    child.stdin.write(`${JSON.stringify({ id, ...frame })}\n`);
    return new Promise((resolvePromise, reject) => {
      pending.set(id, { resolve: resolvePromise, reject });
    });
  };

  let ready = false;
  let agentEnded = false;
  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.type === "ready") {
      ready = true;
      return;
    }
    if (msg.type === "agent_end") {
      agentEnded = true;
      return;
    }
    if (msg.type === "response" && pending.has(msg.id)) {
      const { resolve: resolvePromise, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.success === false) reject(new Error(msg.error || JSON.stringify(msg)));
      else resolvePromise(msg);
    }
  });

  const sleep = (ms) => new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
  const waitFor = async (pred, label) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (pred()) return;
      await sleep(40);
    }
    throw new Error(`timeout waiting for ${label}${stderr ? `\n${stderr}` : ""}`);
  };

  try {
    await waitFor(() => ready, "rpc ready");
    await send({ type: "prompt", message });
    await waitFor(() => agentEnded, "agent_end");
    await sleep(200);
    const last = await send({ type: "get_last_assistant_text" });
    return { text: last.data?.text || "", stderr };
  } finally {
    try { child.stdin.end(); } catch {}
    child.kill("SIGTERM");
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
  try {
    const result = await runExercise(values);
    if (result.text) process.stdout.write(result.text.endsWith("\n") ? result.text : `${result.text}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (isCliEntry(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
