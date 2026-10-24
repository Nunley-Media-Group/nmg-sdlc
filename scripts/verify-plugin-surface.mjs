#!/usr/bin/env node

/**
 * Validate one explicitly selected nmg-sdlc Claude Code plugin surface:
 * `.claude-plugin/plugin.json`, `hooks/hooks.json` -> `hooks/register.ts`,
 * `src/host-events.mjs`, the automated `commands/*.md`, `agents/*.md`,
 * `workflows/<name>/WORKFLOW.md`, and an optional `.claude-plugin/marketplace.json`.
 * `--claude-validate` also runs `claude plugin validate` when the CLI is on PATH.
 *
 * Exit codes:
 *   0 - the selected surface is valid and contains no removed plugin exposure
 *   1 - the selected surface is readable but contains stale removed content
 *   2 - arguments or the selected plugin root are invalid
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { AUTOMATED_COMMANDS, renderAutomatedCommandMarkdown } from '../src/sdlc-commands.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';

const TEXT_EXTENSIONS = new Set(['.json', '.md', '.txt', '.yaml', '.yml', '.ts']);
const PLUGIN_NAME = 'nmg-sdlc';
const MANIFEST_PATH = '.claude-plugin/plugin.json';
const PACKAGE_PATH = 'package.json';
const VERSION_PATH = 'VERSION';
const MARKETPLACE_PATH = '.claude-plugin/marketplace.json';
const HOOKS_PATH = 'hooks/hooks.json';
const HOOKS_MODULE = './register.ts';
const HOOKS_MODULE_PATH = 'hooks/register.ts';
const HOST_EVENTS_PATH = 'src/host-events.mjs';
const AGENT_MODEL_PATTERN = /^(?:haiku|sonnet|opus|fable|inherit|claude-[a-z0-9.-]+)$/i;
const INVENTORY_PATH = path.join('scripts', 'skill-inventory.baseline.json');
const REMOVED_SKILL_NAMES = new Set(['commit-push', 'end-loop', 'init-config', 'run-loop']);
const REMOVED_PATHS = [
  'skills/commit-push',
  'skills/end-loop',
  'skills/init-config',
  'skills/run-loop',
  'references/unattended-mode.md',
  'scripts/sdlc-runner.mjs',
  'scripts/sdlc-config.example.json',
  'scripts/__tests__/sdlc-runner.test.mjs',
  'scripts/__tests__/runner-config-contract.test.mjs',
  'scripts/__tests__/select-next-issue-from-milestone.test.mjs',
  '.codex-plugin/plugin.json',
  'src/extension.ts',
];
const ACTIVE_TEXT_FILES = [
  'README.md',
  '.gitignore',
  'package.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'hooks/hooks.json',
  'hooks/register.ts',
  'src/host-events.mjs',
  'steering/manifest.json',
  'steering/modules/product.mjs',
  'steering/modules/tech.mjs',
  'steering/modules/structure.mjs',
  'steering/modules/verification.mjs',
  'steering/snippets/project-product.md',
  'steering/snippets/project-tech.md',
  'steering/snippets/project-structure.md',
  'steering/retrospective.md',
  '.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml',
  'scripts/package.json',
  'scripts/package-lock.json',
];
const ACTIVE_TEXT_DIRECTORIES = [
  'references',
  'agents',
  'commands',
  'scripts/__fixtures__/skill-exercise',
];
const REMOVED_COMMAND_PATTERN = /\$nmg-sdlc:(?:commit-push|end-loop|init-config|run-loop)\b/i;
const NMG_SDLC_ALIAS_PATTERN = /\$nmg-sdlc:/;
const REMOVED_FRONTMATTER_PATTERN = /\b(?:commit-push|end-loop|init-config|run-loop)\b/i;
const REMOVED_RUNTIME_PATTERN = /(?:\.codex\/(?:unattended-mode|sdlc-state\.json)|\bsdlc-config\.json\b|\bsdlc-runner\.mjs\b)/i;
const AUTOMATION_CONTRACT_PATTERN = /(?:\bautomatable\b|(?<![\/.-])\bunattended\b|Done\. Awaiting orchestrator\.)/i;

class SurfaceInputError extends Error {}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function relativePath(root, target) {
  const relative = path.relative(root, target);
  return relative === '' ? '.' : toPortablePath(relative);
}

function requireReadableDirectory(directory, description) {
  let stat;
  try {
    stat = fs.lstatSync(directory);
    fs.accessSync(directory, fs.constants.R_OK);
  } catch (error) {
    throw new SurfaceInputError(`${description} is not readable: ${directory} (${error.message})`);
  }

  if (stat.isSymbolicLink()) {
    throw new SurfaceInputError(`${description} must not be a symbolic link: ${directory}`);
  }
  if (!stat.isDirectory()) {
    throw new SurfaceInputError(`${description} is not a directory: ${directory}`);
  }
}

function readRequiredFile(filePath, description) {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      throw new SurfaceInputError(`${description} must not be a symbolic link: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new SurfaceInputError(`${description} is not a regular file: ${filePath}`);
    }
    fs.accessSync(filePath, fs.constants.R_OK);
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error instanceof SurfaceInputError) throw error;
    throw new SurfaceInputError(`${description} is not readable: ${filePath} (${error.message})`);
  }
}

function lstatOptional(filePath, description) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new SurfaceInputError(`${description} could not be inspected: ${filePath} (${error.message})`);
  }
}

function parseJson(source, filePath, description) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new SurfaceInputError(`${description} is malformed JSON: ${filePath} (${error.message})`);
  }
}


function readFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : '';
}

function addViolation(violations, kind, file, detail = '') {
  const key = `${kind}\0${file}\0${detail}`;
  if (violations.some((violation) => violation.key === key)) return;
  violations.push({ key, kind, file, detail });
}

function isMigrationDocumentation(file) {
  return file === 'README.md' || file.startsWith('workflows/upgrade-project/');
}

function allowsHistoricalAlias(file) {
  return file === 'CHANGELOG.md' || file.startsWith('specs/');
}

function activeInspectionSource(source, file) {
  if (file !== 'steering/retrospective.md') return source;

  return source.split(/\r?\n/).map((line) => {
    if (!line.startsWith('|')) return line;
    const pipes = [];
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] !== '|') continue;
      let backslashes = 0;
      while (line[index - backslashes - 1] === '\\') backslashes += 1;
      if (backslashes % 2 === 0) pipes.push(index);
    }
    if (pipes.length < 4) return line;
    const contentEnd = line.trimEnd().length - 1;
    const evidenceBoundary = pipes.at(pipes.at(-1) === contentEnd ? -2 : -1);
    return evidenceBoundary === undefined ? line : line.slice(0, evidenceBoundary + 1);
  }).join('\n');
}

function inspectLoaderFacingText(source, file, violations) {
  const frontmatter = readFrontmatter(source);
  if (/^name:\s*["']?(?:commit-push|end-loop|init-config|run-loop)["']?\s*$/im.test(frontmatter)) {
    addViolation(violations, 'frontmatter-name', file);
  }
  if (REMOVED_FRONTMATTER_PATTERN.test(frontmatter)
    || AUTOMATION_CONTRACT_PATTERN.test(frontmatter)
    || REMOVED_RUNTIME_PATTERN.test(frontmatter)) {
    addViolation(violations, 'frontmatter-token', file);
  }

  const loaderMetadata = Array.from(source.matchAll(
    /^[ \t]*(?:aliases?|redirect(?:s|[-_]to)?)[ \t]*:[ \t]*([^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*)/gim,
  ));
  if (loaderMetadata.some((match) => REMOVED_FRONTMATTER_PATTERN.test(match[1]))
    || /\b(?:alias|redirect)\b[^\n]{0,120}\b(?:commit-push|end-loop|init-config|run-loop)\b/i.test(source)) {
    addViolation(violations, 'alias-or-redirect', file);
  }

  if (/\b(?:deprecated|deprecation|compatibility stub)\b[^\n]{0,160}\b(?:commit-push|end-loop|init-config|run-loop)\b/i.test(source)
    || /\b(?:commit-push|end-loop|init-config|run-loop)\b[^\n]{0,160}\b(?:deprecated|deprecation|compatibility stub)\b/i.test(source)) {
    addViolation(violations, 'deprecation-token', file);
  }

  if (REMOVED_COMMAND_PATTERN.test(source)
    || /\bcommitPush\b/.test(source)
    || /DIVERGED:\s*re-run\s+commit-push\b/i.test(source)) {
    addViolation(violations, 'loader-workflow-token', file);
  }

  if (NMG_SDLC_ALIAS_PATTERN.test(source) && !allowsHistoricalAlias(file)) {
    addViolation(violations, 'nmg-sdlc-alias', file);
  }

  if (AUTOMATION_CONTRACT_PATTERN.test(source)) {
    addViolation(violations, 'automation-contract-token', file);
  }

  if (!isMigrationDocumentation(file) && REMOVED_RUNTIME_PATTERN.test(source)) {
    addViolation(violations, 'runtime-contract-token', file);
  }
}

function walkWorkflowsTree(root, workflowsRoot, violations) {
  function walk(directory) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      throw new SurfaceInputError(`could not inspect workflows directory ${directory}: ${error.message}`);
    }

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = relativePath(root, absolute);

      if (entry.isSymbolicLink()) {
        addViolation(violations, 'unsupported-symlink', relative);
        continue;
      }

      if (entry.isDirectory()) {
        if (REMOVED_SKILL_NAMES.has(entry.name.toLowerCase())) {
          addViolation(violations, 'skill-directory', relative);
        }
        walk(absolute);
        continue;
      }

      if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      let source;
      try {
        source = fs.readFileSync(absolute, 'utf8');
      } catch (error) {
        throw new SurfaceInputError(`could not read active workflow file ${absolute}: ${error.message}`);
      }
      if (source.includes('\0')) continue;
      inspectLoaderFacingText(source, relative, violations);
    }
  }

  walk(workflowsRoot);
}

function inspectOptionalActiveFile(root, portable, violations) {
  const absolute = path.join(root, ...portable.split('/'));
  const stat = lstatOptional(absolute, 'active surface path');
  if (stat === null) return;
  if (stat.isSymbolicLink()) {
    addViolation(violations, 'unsupported-symlink', portable);
    return;
  }
  if (!stat.isFile()) return;

  const source = readRequiredFile(absolute, 'active surface file');
  if (!source.includes('\0')) {
    inspectLoaderFacingText(activeInspectionSource(source, portable), portable, violations);
  }
}

function walkOptionalActiveDirectory(root, portable, violations) {
  const directory = path.join(root, ...portable.split('/'));
  const stat = lstatOptional(directory, 'active surface directory');
  if (stat === null) return;
  if (stat.isSymbolicLink()) {
    addViolation(violations, 'unsupported-symlink', portable);
    return;
  }
  if (!stat.isDirectory()) {
    throw new SurfaceInputError(`active surface directory is not a directory: ${directory}`);
  }

  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    throw new SurfaceInputError(`could not inspect active surface directory ${directory}: ${error.message}`);
  }

  for (const entry of entries) {
    const relative = `${portable}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      addViolation(violations, 'unsupported-symlink', relative);
    } else if (entry.isDirectory()) {
      walkOptionalActiveDirectory(root, relative, violations);
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      inspectOptionalActiveFile(root, relative, violations);
    }
  }
}

function inspectRemovedPaths(root, violations) {
  for (const portable of REMOVED_PATHS) {
    const absolute = path.join(root, ...portable.split('/'));
    if (lstatOptional(absolute, 'removed surface path') !== null) {
      addViolation(violations, 'removed-path', portable);
    }
  }
}

function inspectInventoryValue(value, jsonPath, file, violations) {
  if (typeof value === 'string') {
    if (/workflows[\\/](?:commit-push|end-loop|init-config|run-loop)(?:[\\/]|$)/i.test(value)
      || REMOVED_COMMAND_PATTERN.test(value)
      || /\bcommitPush\b/.test(value)
      || REMOVED_RUNTIME_PATTERN.test(value)
      || AUTOMATION_CONTRACT_PATTERN.test(value)) {
      addViolation(violations, 'inventory-entry', file, `${jsonPath}=${value}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectInventoryValue(item, `${jsonPath}[${index}]`, file, violations));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      inspectInventoryValue(item, jsonPath ? `${jsonPath}.${key}` : key, file, violations);
    }
  }
}

function readJsonObject(root, portable, description) {
  const file = path.join(root, ...portable.split('/'));
  const source = readRequiredFile(file, description);
  const value = parseJson(source, file, description);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SurfaceInputError(`${description} must contain a JSON object: ${file}`);
  }
  return { file, source, value };
}

let expectedCommandFrontmatter;
/** Frontmatter `renderAutomatedCommandMarkdown` writes for each automated command. */
function automatedCommandFrontmatter() {
  expectedCommandFrontmatter ??= new Map(AUTOMATED_COMMANDS.map(([name, skill, description]) => [
    name,
    readFrontmatter(renderAutomatedCommandMarkdown(name, skill, description)),
  ]));
  return expectedCommandFrontmatter;
}

function markdownFiles(root, portable, description) {
  const directory = path.join(root, portable);
  requireReadableDirectory(directory, description);
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith('.md'))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function inspectCommands(root, violations) {
  const expected = automatedCommandFrontmatter();
  const entries = markdownFiles(root, 'commands', 'commands directory');
  for (const entry of entries) {
    const portable = `commands/${entry.name}`;
    const name = entry.name.slice(0, -'.md'.length);
    if (!expected.has(name)) {
      addViolation(violations, 'unexpected-command', portable);
      continue;
    }
    if (!entry.isFile()) {
      addViolation(violations, 'unsupported-symlink', portable);
      continue;
    }
    const source = readRequiredFile(path.join(root, 'commands', entry.name), 'command file');
    if (readFrontmatter(source) !== expected.get(name)) {
      addViolation(violations, 'command-frontmatter', portable, 'expected renderAutomatedCommandMarkdown frontmatter');
    }
    if (source.includes('<plugin-root>')) {
      addViolation(violations, 'command-plugin-root', portable, 'use ${CLAUDE_PLUGIN_ROOT}');
    }
  }
  for (const name of expected.keys()) {
    if (!entries.some((entry) => entry.name === `${name}.md`)) {
      throw new SurfaceInputError(`automated command file is missing: commands/${name}.md`);
    }
  }
}

function frontmatterField(frontmatter, name) {
  const match = frontmatter.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
}

function inspectAgents(root, violations) {
  const entries = markdownFiles(root, 'agents', 'agents directory');
  if (entries.length === 0) throw new SurfaceInputError(`agents directory has no subagent files: ${path.join(root, 'agents')}`);
  for (const entry of entries) {
    const portable = `agents/${entry.name}`;
    if (!entry.isFile()) continue;
    const frontmatter = readFrontmatter(readRequiredFile(path.join(root, 'agents', entry.name), 'subagent file'));
    const name = frontmatterField(frontmatter, 'name');
    const description = frontmatterField(frontmatter, 'description');
    const model = frontmatterField(frontmatter, 'model');
    if (name !== entry.name.slice(0, -'.md'.length) || description === '') {
      addViolation(violations, 'agent-frontmatter', portable, 'expected name matching the file and a description');
    }
    if (model !== '' && !AGENT_MODEL_PATTERN.test(model)) {
      addViolation(violations, 'agent-model', portable, model);
    }
  }
}

function inspectWorkflowEntrypoints(root, workflowsRoot, violations) {
  for (const entry of fs.readdirSync(workflowsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const portable = `workflows/${entry.name}/WORKFLOW.md`;
    const file = path.join(workflowsRoot, entry.name, 'WORKFLOW.md');
    const stat = lstatOptional(file, 'workflow entrypoint');
    if (stat === null || !stat.isFile()) {
      addViolation(violations, 'workflow-entrypoint', portable, 'missing');
      continue;
    }
    if (frontmatterField(readFrontmatter(readRequiredFile(file, 'workflow entrypoint')), 'name') !== entry.name) {
      addViolation(violations, 'workflow-entrypoint', portable, `expected frontmatter name "${entry.name}"`);
    }
  }
}

function inspectMarketplace(root, violations) {
  if (lstatOptional(path.join(root, ...MARKETPLACE_PATH.split('/')), 'marketplace manifest') === null) return;
  const { value } = readJsonObject(root, MARKETPLACE_PATH, 'marketplace manifest');
  const entry = Array.isArray(value.plugins) ? value.plugins.find((plugin) => plugin?.name === PLUGIN_NAME) : null;
  if (!entry || entry.source !== './') {
    addViolation(violations, 'marketplace-entry', MARKETPLACE_PATH, `expected plugin "${PLUGIN_NAME}" with source "./"`);
  }
}

export function validatePluginSurface(rootArgument, label) {
  const root = path.resolve(rootArgument);
  requireReadableDirectory(root, 'plugin root');

  const { source: manifestSource, value: manifest } = readJsonObject(root, MANIFEST_PATH, 'plugin manifest');
  if (manifest.name !== PLUGIN_NAME) {
    throw new SurfaceInputError(`plugin manifest name ${JSON.stringify(manifest.name)} must equal ${JSON.stringify(PLUGIN_NAME)}`);
  }

  const versionSource = readRequiredFile(path.join(root, VERSION_PATH), 'VERSION').trim();
  if (manifest.version !== versionSource) {
    throw new SurfaceInputError(`plugin version ${JSON.stringify(manifest.version)} must equal VERSION ${JSON.stringify(versionSource)}`);
  }

  const violations = [];
  let packageSource = null;
  if (lstatOptional(path.join(root, PACKAGE_PATH), 'package manifest') !== null) {
    const pkg = readJsonObject(root, PACKAGE_PATH, 'package manifest');
    packageSource = pkg.source;
    if (pkg.value.name !== PLUGIN_NAME) {
      throw new SurfaceInputError(`package.json name ${JSON.stringify(pkg.value.name)} must equal ${JSON.stringify(PLUGIN_NAME)}`);
    }
    if (pkg.value.version !== versionSource) {
      throw new SurfaceInputError(`package.json version ${JSON.stringify(pkg.value.version)} must equal VERSION ${JSON.stringify(versionSource)}`);
    }
    if (Object.hasOwn(pkg.value, 'omp')) {
      addViolation(violations, 'omp-manifest-declared', PACKAGE_PATH);
    }
  }

  const { value: hooks } = readJsonObject(root, HOOKS_PATH, 'hooks manifest');
  if (!Array.isArray(hooks.modules) || !hooks.modules.includes(HOOKS_MODULE)) {
    throw new SurfaceInputError(`hooks/hooks.json modules must name ${JSON.stringify(HOOKS_MODULE)}`);
  }
  readRequiredFile(path.join(root, ...HOOKS_MODULE_PATH.split('/')), 'hooks module');
  readRequiredFile(path.join(root, ...HOST_EVENTS_PATH.split('/')), 'host events module');

  const leftoverSkills = lstatOptional(path.join(root, 'skills'), 'leftover skills directory');
  if (leftoverSkills?.isDirectory()) {
    addViolation(violations, 'leftover-skills-directory', 'skills');
  }

  const workflowsRoot = path.join(root, 'workflows');
  requireReadableDirectory(workflowsRoot, 'workflows directory');
  const openPrFile = path.join(workflowsRoot, 'open-pr', 'WORKFLOW.md');
  const openPrSource = readRequiredFile(openPrFile, 'open-pr workflow');
  if (!/^name:\s*["']?open-pr["']?\s*$/im.test(readFrontmatter(openPrSource))) {
    throw new SurfaceInputError(`open-pr is not present at ${relativePath(root, openPrFile)}: expected frontmatter name "open-pr"`);
  }

  inspectCommands(root, violations);
  inspectAgents(root, violations);
  inspectWorkflowEntrypoints(root, workflowsRoot, violations);
  inspectMarketplace(root, violations);
  inspectRemovedPaths(root, violations);
  inspectLoaderFacingText(manifestSource, MANIFEST_PATH, violations);
  if (packageSource !== null) inspectLoaderFacingText(packageSource, PACKAGE_PATH, violations);
  walkWorkflowsTree(root, workflowsRoot, violations);
  ACTIVE_TEXT_FILES.forEach((file) => inspectOptionalActiveFile(root, file, violations));
  ACTIVE_TEXT_DIRECTORIES.forEach((directory) => walkOptionalActiveDirectory(root, directory, violations));

  const inventoryFile = path.join(root, INVENTORY_PATH);
  if (lstatOptional(inventoryFile, 'skill inventory baseline') !== null) {
    const inventorySource = readRequiredFile(inventoryFile, 'skill inventory baseline');
    const inventory = parseJson(inventorySource, inventoryFile, 'skill inventory baseline');
    inspectInventoryValue(inventory, '', toPortablePath(INVENTORY_PATH), violations);
  }

  violations.sort((left, right) => {
    return left.file.localeCompare(right.file)
      || left.kind.localeCompare(right.kind)
      || left.detail.localeCompare(right.detail);
  });

  return { root, label, violations };
}

/**
 * Optional extra check: `claude plugin validate <root>` when the Claude Code
 * CLI is on PATH. CI has no `claude`, so absence is a clean skip, not a failure.
 */
export function runClaudePluginValidate(root, { spawn = spawnSync } = {}) {
  const result = spawn('claude', ['plugin', 'validate', root], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') return { status: 'skipped', detail: 'claude CLI not on PATH' };
  if (result.error) return { status: 'fail', detail: result.error.message };
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return result.status === 0
    ? { status: 'pass', detail: '' }
    : { status: 'fail', detail: output.split('\n').slice(-20).join('\n') };
}

function parseCliArguments(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        root: { type: 'string' },
        label: { type: 'string' },
        'claude-validate': { type: 'boolean', default: false },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (error) {
    throw new SurfaceInputError(`invalid arguments: ${error.message}`);
  }

  if (typeof values.root !== 'string' || values.root.trim() === '') {
    throw new SurfaceInputError('invalid arguments: --root <plugin-root> is required');
  }
  if (typeof values.label !== 'string' || values.label.trim() === '') {
    throw new SurfaceInputError('invalid arguments: --label <surface> is required');
  }

  return { root: values.root, label: values.label.trim(), claudeValidate: values['claude-validate'] };
}

export function run(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseCliArguments(argv);
    const result = validatePluginSurface(parsed.root, parsed.label);

    if (result.violations.length > 0) {
      console.error(`Plugin surface validation failed: ${result.label} (${result.root})`);
      for (const violation of result.violations) {
        const detail = violation.detail === '' ? '' : ` [${violation.detail}]`;
        console.error(`- ${violation.kind}: ${violation.file}${detail}`);
      }
      return 1;
    }

    if (parsed.claudeValidate) {
      const claude = runClaudePluginValidate(result.root);
      if (claude.status === 'skipped') {
        console.log(`claude plugin validate skipped: ${claude.detail}`);
      } else if (claude.status === 'fail') {
        console.error(`Plugin surface validation failed: ${result.label} (${result.root})`);
        console.error(`- claude-plugin-validate: ${MANIFEST_PATH}${claude.detail ? `\n${claude.detail}` : ''}`);
        return 1;
      } else {
        console.log('claude plugin validate passed');
      }
    }

    console.log(`Plugin surface validation passed: ${result.label} (${result.root})`);
    return 0;
  } catch (error) {
    const label = parsed?.label ?? 'unselected-surface';
    const root = parsed?.root ? path.resolve(parsed.root) : 'unselected-root';
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Plugin surface validation error: ${label} (${root}): ${message}`);
    return 2;
  }
}

if (isCliEntry(import.meta.url)) {
  process.exitCode = run();
}
