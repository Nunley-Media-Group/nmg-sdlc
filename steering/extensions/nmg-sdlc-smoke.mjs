import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SMOKE_REPO = "https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git";
const EXERCISE_MS = 240000;

function envelope(status, summary, identity, evidence = []) {
  return { schemaVersion: 1, status, summary, identity, evidence };
}

function bounded(value, size = 8000) {
  const text = String(value ?? "");
  return text.length <= size ? text : `${text.slice(0, size)}\n[truncated]`;
}

async function runSmoke(request) {
  const identity = request.identity;
  const pluginRoot = request.projectRoot;
  const work = mkdtempSync(join(tmpdir(), "nmg-sdlc-smoke-"));
  try {
    const clone = spawnSync("git", ["clone", "--depth", "1", "--single-branch", SMOKE_REPO, work], {
      encoding: "utf8",
      timeout: 60000,
    });
    if (clone.error || clone.status !== 0) {
      return envelope("incomplete", "nmg-sdlc-smoke clone failed", identity, [{
        kind: "command",
        summary: "git clone https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git",
        artifact: null,
        stdout: bounded(clone.stdout, 4000),
        stderr: bounded(clone.error?.message ?? clone.stderr, 4000),
      }]);
    }

    const exercise = join(pluginRoot, "scripts", "exercise-omp.mjs");
    const run = spawnSync(process.execPath, [
      exercise,
      "--cwd",
      work,
      "--timeout-ms",
      String(EXERCISE_MS),
      "--",
      "/sdlc-status",
      "--json",
    ], {
      encoding: "utf8",
      timeout: EXERCISE_MS + 15000,
      env: process.env,
    });
    const evidence = [{
      kind: "command",
      summary: "exercise-omp /sdlc-status --json against nmg-sdlc-smoke",
      artifact: "https://github.com/Nunley-Media-Group/nmg-sdlc-smoke",
      stdout: bounded(run.stdout),
      stderr: bounded(run.error?.message ?? run.stderr, 4000),
    }];
    if (run.error) {
      return envelope("incomplete", `nmg-sdlc-smoke status exercise launch failed: ${run.error.message}`, identity, evidence);
    }
    if (run.status !== 0) {
      return envelope("failed", `nmg-sdlc-smoke status exercise exited ${run.status}`, identity, evidence);
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
