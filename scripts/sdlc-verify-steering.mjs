#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runSteeringValidations } from "../src/sdlc-verification-runtime.mjs";

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

export async function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  const artifact = await runSteeringValidations({
    projectRoot: resolve(options.project),
    issue: Number(options.issue),
    specDir: resolve(options.project, options.spec),
    baseRef: options.base ?? "main",
  });
  process.stdout.write(`${JSON.stringify({ ok: artifact.ceiling === null, ceiling: artifact.ceiling, issue: artifact.issue }, null, 2)}\n`);
  if (artifact.ceiling) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({ ok: false, ceiling: "Incomplete", reasonCode: error.reasonCode ?? error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
