import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const SMOKE_REPO = "https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git";
function waitForClose(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("close", resolve));
}

function terminateOwnedProcessGroup(child) {
  const pid = child?.pid;
  if (child?.exitCode !== null || child?.signalCode !== null || !Number.isInteger(pid) || pid <= 0) {
    return Promise.resolve({ ok: true, alreadyExited: true });
  }
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (error?.code === "ESRCH") return Promise.resolve({ ok: true, alreadyExited: true });
      return Promise.resolve({ ok: false, error });
    }
    return waitForClose(child).then(() => ({ ok: true, alreadyExited: false }));
  }
  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", (error) => {
      resolve(error?.code === "ESRCH" ? { ok: true, alreadyExited: true } : { ok: false, error });
    });
    killer.once("close", async (code) => {
      if (code !== 0) {
        if (child.exitCode !== null || child.signalCode !== null) resolve({ ok: true, alreadyExited: true });
        else resolve({ ok: false, error: new Error(`taskkill exited ${code}`) });
        return;
      }
      await waitForClose(child);
      resolve({ ok: true, alreadyExited: false });
    });
  });
}

function envelope(status, summary, identity, evidence = []) {
  return { schemaVersion: 1, status, summary, identity, evidence };
}

function bounded(value, size = 8000) {
  const text = String(value ?? "");
  return text.length <= size ? text : `${text.slice(0, size)}\n[truncated]`;
}

function runCommand(program, args, { cwd, env, signal } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ status: null, signal: null, stdout: "", stderr: "", reasonCode: "cancelled" });
    let child;
    let stdout = "";
    let stderr = "";
    let settled = false;
    let terminalOverride = null;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      resolve({ stdout, stderr, ...result });
    };
    const cancel = async () => {
      if (settled || terminalOverride) return;
      terminalOverride = "cancelled";
      const cleanup = await terminateOwnedProcessGroup(child);
      settle({ status: null, signal: null, reasonCode: cleanup.ok ? "cancelled" : "cleanup_failed", error: cleanup.error });
    };
    try {
      child = spawn(program, args, {
        cwd,
        env,
        detached: process.platform !== "win32",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      return settle({ status: null, signal: null, reasonCode: "launch_failed", error });
    }
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      if (!terminalOverride) settle({ status: null, signal: null, reasonCode: "launch_failed", error });
    });
    child.once("close", (code, childSignal) => {
      if (terminalOverride || settled) return;
      if (typeof code === "number") settle({ status: code, signal: childSignal, reasonCode: code === 0 ? null : "failed" });
      else if (childSignal) settle({ status: null, signal: childSignal, reasonCode: "failed" });
      else settle({ status: null, signal: null, reasonCode: "process_lost" });
    });
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) void cancel();
  });
}

async function runSmoke(request) {
  const identity = request.identity;
  const pluginRoot = request.projectRoot;
  const work = mkdtempSync(join(tmpdir(), "nmg-sdlc-smoke-"));
  try {
    const clone = await runCommand("git", ["clone", "--depth", "1", "--single-branch", SMOKE_REPO, work], { signal: request.signal });
    if (clone.reasonCode || clone.status !== 0) {
      return envelope("incomplete", `nmg-sdlc-smoke clone ${clone.reasonCode ?? `exited ${clone.status}`}`, identity, [{
        kind: "command",
        summary: "git clone https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git",
        artifact: null,
        stdout: bounded(clone.stdout, 4000),
        stderr: bounded(clone.error?.message ?? clone.stderr, 4000),
      }]);
    }

    const exercise = join(pluginRoot, "scripts", "exercise-omp.mjs");
    const run = await runCommand(process.execPath, [
      exercise,
      "--cwd",
      work,
      "--",
      "/sdlc-status",
      "--json",
    ], {
      env: process.env,
      signal: request.signal,
    });
    const evidence = [{
      kind: "command",
      summary: "exercise-omp /sdlc-status --json against nmg-sdlc-smoke",
      artifact: "https://github.com/Nunley-Media-Group/nmg-sdlc-smoke",
      stdout: bounded(run.stdout),
      stderr: bounded(run.error?.message ?? run.stderr, 4000),
    }];
    if (run.reasonCode === "cancelled" || run.reasonCode === "process_lost" || run.reasonCode === "cleanup_failed" || run.reasonCode === "launch_failed") {
      return envelope("incomplete", `nmg-sdlc-smoke status exercise ${run.reasonCode}`, identity, evidence);
    }
    if (run.status !== 0) {
      return envelope("failed", `nmg-sdlc-smoke status exercise exited ${run.status}${run.signal ? ` (${run.signal})` : ""}`, identity, evidence);
    }

    const stdout = String(run.stdout ?? "");
    const jsonStart = stdout.indexOf("{");
    const jsonEnd = stdout.lastIndexOf("}");
    let parsed;
    try {
      parsed = JSON.parse(jsonStart >= 0 && jsonEnd > jsonStart ? stdout.slice(jsonStart, jsonEnd + 1) : stdout);
    } catch {
      return envelope("failed", "nmg-sdlc-smoke status exercise did not emit JSON", identity, evidence);
    }
    const command = parsed?.nextAction?.command;
    if (typeof command !== "string" || !command.startsWith("/sdlc-")) {
      return envelope("failed", "nmg-sdlc-smoke status JSON missing nextAction.command", identity, evidence);
    }
    return envelope("passed", `nmg-sdlc-smoke status next ${command}`, identity, evidence);
  } catch (error) {
    return envelope("incomplete", error instanceof Error ? error.message : String(error), identity);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export const extension = Object.freeze({
  schemaVersion: 1,
  id: "project.nmg-sdlc-smoke",
  providers: Object.freeze({
    "project.nmg-sdlc-smoke": runSmoke,
  }),
});
