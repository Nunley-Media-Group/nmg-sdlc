#!/usr/bin/env node
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
  return options;
}

export async function main(argv = process.argv.slice(2), { signal } = {}) {
  const options = parse(argv);
  const leaseContext = enterControllerLease({
    projectRoot: resolve(options.project),
    runId: options["controller-run-id"],
  });
  try {
    const artifact = await runSteeringValidations({
      projectRoot: resolve(options.project),
      issue: Number(options.issue),
      specDir: resolve(options.project, options.spec),
      baseRef: options.base ?? "main",
      signal,
    });
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
    process.stdout.write(`${JSON.stringify({ ok: false, ceiling: "Incomplete", reasonCode: error.reasonCode ?? error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }).finally(() => {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    if (controller.signal.aborted) process.exitCode = 130;
  });
}
