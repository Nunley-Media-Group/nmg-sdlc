import { describe, expect, test } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  isCliEntry,
  materializeControllerPaths,
  resolvePluginController,
  resolvePluginRoot,
} from "../plugin-controller-path.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const helperSource = path.join(repoRoot, "scripts", "plugin-controller-path.mjs");

function disposablePackage(parent, name = "installed plugin") {
  const root = path.join(parent, name);
  const scripts = path.join(root, "scripts");
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "nmg-sdlc", type: "module" }));
  fs.copyFileSync(helperSource, path.join(scripts, "plugin-controller-path.mjs"));
  fs.writeFileSync(path.join(scripts, "probe.mjs"), [
    'import fs from "node:fs";',
    'import { isCliEntry } from "./plugin-controller-path.mjs";',
    'if (isCliEntry(import.meta.url)) {',
    '  fs.appendFileSync(process.env.PROBE_FILE, `${process.cwd()}\\n`);',
    '}',
    '',
  ].join("\n"));
  return root;
}

function spawnProbe(controller, consumer, probeFile) {
  return spawnSync(process.execPath, [controller], {
    cwd: consumer,
    encoding: "utf8",
    env: { ...process.env, PROBE_FILE: probeFile },
  });
}

function expectSingleConsumerRun(result, probeFile, consumer) {
  expect(result.status).toBe(0);
  expect(result.stderr).not.toContain("MODULE_NOT_FOUND");
  expect(fs.readFileSync(probeFile, "utf8")).toBe(`${fs.realpathSync(consumer)}\n`);
}

describe("plugin controller path resolution", () => {
  test("rejects missing, relative, and foreign env roots without consulting cwd", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nmg-sdlc-controller-"));
    const consumer = path.join(fixture, "consumer");
    fs.mkdirSync(path.join(consumer, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(consumer, "scripts", "sdlc-execute.mjs"), "decoy\n");
    fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ name: "consumer" }));
    const originalCwd = process.cwd();
    process.chdir(consumer);
    try {
      for (const env of [{}, { NMG_SDLC_PLUGIN_ROOT: "relative" }, { NMG_SDLC_PLUGIN_ROOT: consumer }]) {
        expect(() => resolvePluginController("sdlc-execute.mjs", { env })).toThrow("controller unresolved");
        try {
          resolvePluginController("sdlc-execute.mjs", { env });
        } catch (error) {
          expect(error.reasonCode).toBe("controller_unresolved");
          expect(error.exitCode).toBe(2);
        }
      }
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("resolves validated env and scripts/importMetaUrl fallback roots", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nmg-sdlc-controller-"));
    try {
      const root = disposablePackage(fixture);
      const controller = path.join(root, "scripts", "probe.mjs");
      expect(resolvePluginRoot({ env: { NMG_SDLC_PLUGIN_ROOT: root } })).toBe(root);
      expect(resolvePluginController("probe.mjs", { env: { NMG_SDLC_PLUGIN_ROOT: root } })).toBe(controller);
      expect(resolvePluginRoot({ env: {}, importMetaUrl: pathToFileURL(controller).href })).toBe(root);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("resolves the delivery controller from an installed extension layout and rejects omission", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nmg-sdlc-controller-"));
    try {
      const root = disposablePackage(fixture);
      const sourceDir = path.join(root, "src");
      const extension = path.join(sourceDir, "extension.ts");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(extension, "export default function extension() {}\n");
      const options = { env: {}, importMetaUrl: pathToFileURL(extension).href };
      expect(() => resolvePluginController("sdlc-deliver.mjs", options))
        .toThrow("controller unresolved: sdlc-deliver.mjs");

      const controller = path.join(root, "scripts", "sdlc-deliver.mjs");
      fs.copyFileSync(path.join(repoRoot, "scripts", "sdlc-deliver.mjs"), controller);
      expect(resolvePluginController("sdlc-deliver.mjs", options)).toBe(controller);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("materializes explicit plugin dispatch and preserves project-local commands", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nmg-sdlc-controller-"));
    try {
      const root = disposablePackage(fixture, "plugin root");
      for (const scriptName of ["a.mjs", "c.mjs"]) {
        fs.writeFileSync(path.join(root, "scripts", scriptName), "");
      }
      const projectCommand = "node scripts/check-gate.mjs two";
      const output = materializeControllerPaths(
        [
          "node <plugin-root>/scripts/a.mjs one",
          projectCommand,
          '["node","<plugin-root>/scripts/c.mjs","apply"]',
        ].join("\n"),
        root,
      );
      expect(output).toContain(`node ${JSON.stringify(path.join(root, "scripts", "a.mjs"))} one`);
      expect(output).toContain(projectCommand);
      expect(output).toContain(`["node",${JSON.stringify(path.join(root, "scripts", "c.mjs"))},"apply"]`);
      expect(output).not.toContain("<plugin-root>");
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("fails explicitly before materializing a missing controller", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nmg-sdlc-controller-"));
    try {
      const root = disposablePackage(fixture);
      expect(() => materializeControllerPaths(
        "node <plugin-root>/scripts/missing.mjs",
        root,
      )).toThrow("controller unresolved: missing.mjs");
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("isCliEntry compares real paths and keeps imports inert", async () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nmg-sdlc-controller-"));
    try {
      const root = disposablePackage(fixture);
      const controller = path.join(root, "scripts", "probe.mjs");
      expect(isCliEntry(pathToFileURL(controller).href, controller)).toBe(true);
      const probeFile = path.join(fixture, "import-probe.txt");
      process.env.PROBE_FILE = probeFile;
      await import(`${pathToFileURL(controller).href}?inert=${Date.now()}`);
      expect(fs.existsSync(probeFile)).toBe(false);
      delete process.env.PROBE_FILE;
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("copied install runs the CLI once while preserving consumer cwd", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nmg-sdlc-copy-"));
    try {
      const consumer = path.join(fixture, "consumer");
      fs.mkdirSync(consumer);
      const root = disposablePackage(fixture);
      const probeFile = path.join(fixture, "probe.txt");
      expectSingleConsumerRun(spawnProbe(path.join(root, "scripts", "probe.mjs"), consumer, probeFile), probeFile, consumer);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  (process.platform === "win32" ? test.skip : test)("Unix symlink install runs the CLI once while preserving consumer cwd", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nmg-sdlc-link-"));
    try {
      const consumer = path.join(fixture, "consumer");
      fs.mkdirSync(consumer);
      const root = disposablePackage(fixture, "source");
      const linked = path.join(fixture, "linked plugin");
      fs.symlinkSync(root, linked, "dir");
      const probeFile = path.join(fixture, "probe.txt");
      expectSingleConsumerRun(spawnProbe(path.join(linked, "scripts", "probe.mjs"), consumer, probeFile), probeFile, consumer);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  (process.platform === "win32" ? test : test.skip)("Windows junction install runs the CLI once while preserving consumer cwd", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nmg-sdlc-junction-"));
    try {
      const consumer = path.join(fixture, "consumer");
      fs.mkdirSync(consumer);
      const root = disposablePackage(fixture, "source");
      const linked = path.join(fixture, "linked plugin");
      fs.symlinkSync(root, linked, "junction");
      const probeFile = path.join(fixture, "probe.txt");
      expectSingleConsumerRun(spawnProbe(path.join(linked, "scripts", "probe.mjs"), consumer, probeFile), probeFile, consumer);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
});
