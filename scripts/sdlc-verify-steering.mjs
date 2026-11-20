#!/usr/bin/env node
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { isCliEntry } from "./plugin-controller-path.mjs";
import { runSteeringValidations } from "../src/sdlc-verification-runtime.mjs";
import {
  enterControllerLease,
  releaseControllerLease,
} from "./sdlc-controller-lease.mjs";

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith("--") || argv[index + 1] === undefined) throw new Error("invalid_arguments");
    options[key.slice(2)] = argv[index + 1];
  }
  if (!options.project || !/^\d+$/.test(options.issue ?? "") || !options.spec) throw new Error("invalid_arguments");
  if (options.tier !== undefined && !["pre-merge", "full"].includes(options.tier)) throw new Error("invalid_arguments");
  // `--mode select` resolves and stores the change selection without running any validation.
  if (options.mode !== undefined && (options.mode !== "select" || options.tier === "full")) throw new Error("invalid_arguments");
  return options;
}

export async function main(argv = process.argv.slice(2), { signal, runSelection, models } = {}) {
  const options = parse(argv);
  const projectRoot = realpathSync(resolve(options.project));
  const issue = Number(options.issue);
  const specPath = options.spec.split("\\").join("/");
  const headResult = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false,
  });
  const head = String(headResult.stdout ?? "").trim();
  if (headResult.status !== 0 || !/^[0-9a-f]{40}$/i.test(head)) {
    throw new Error("verification_identity_unavailable");
  }
  const verificationRunId = options["controller-run-id"] ?? `verification-${createHash("sha256")
    .update(`${projectRoot}\0${issue}\0${specPath}\0${head}`)
    .digest("hex")}`;
  const leaseContext = enterControllerLease({
    projectRoot,
    runId: verificationRunId,
  });
  try {
    const artifact = await runSteeringValidations({
      projectRoot,
      issue,
      specDir: resolve(projectRoot, specPath),
      baseRef: options.base ?? "main",
      verificationRunId,
      tier: options.tier ?? "pre-merge",
      signal,
      runSelection,
      models,
      selectOnly: options.mode === "select",
    });
    if (options.mode === "select") {
      process.stdout.write(`${JSON.stringify({ ok: true, selection: artifact.selection }, null, 2)}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({ ok: artifact.ceiling === null, ceiling: artifact.ceiling, issue: artifact.issue, coverage: artifact.coverage ?? null }, null, 2)}\n`);
    if (artifact.ceiling) process.exitCode = 1;
  } finally {
    if (leaseContext.owned) releaseControllerLease(leaseContext.lease);
  }
}

if (isCliEntry(import.meta.url)) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  main(process.argv.slice(2), { signal: controller.signal }).catch((error) => {
    // A coded failure keeps its diagnostic (for example the steering/sdlc-models.json message) beside the code.
    const summary = error.reasonCode && error.message && error.message !== error.reasonCode ? { summary: error.message } : {};
    process.stdout.write(`${JSON.stringify({ ok: false, ceiling: "Incomplete", reasonCode: error.reasonCode ?? error.message, ...summary }, null, 2)}\n`);
    process.exitCode = 1;
  }).finally(() => {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    if (controller.signal.aborted) process.exitCode = 130;
  });
}
