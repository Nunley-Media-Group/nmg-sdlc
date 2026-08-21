#!/usr/bin/env node

/**
 * Validate one explicitly selected nmg-sdlc plugin surface.
 *
 * Exit codes:
 *   0 - the selected surface is valid and contains no removed plugin exposure
 *   1 - the selected surface is readable but contains stale removed content
 *   2 - arguments or the selected plugin root are invalid
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const TEXT_EXTENSIONS = new Set(['.json', '.md', '.txt', '.yaml', '.yml', '.ts']);
const MANIFEST_PATH = 'package.json';
const VERSION_PATH = 'VERSION';
const INVENTORY_PATH = path.join('scripts', 'skill-inventory.baseline.json');
const REMOVED_SKILL_NAMES = new Set(['commit-push', 'end-loop', 'init-config', 'run-loop']);
const EXPECTED_EXTENSIONS = ['./src/extension.ts'];
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
];
const ACTIVE_TEXT_FILES = [
  'README.md',
  '.gitignore',
  'package.json',
  'src/extension.ts',
  '.claude-plugin/plugin.json',
  'steering/product.md',
  'steering/tech.md',
  'steering/structure.md',
  'steering/retrospective.md',
  '.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml',
  'scripts/package.json',
  'scripts/package-lock.json',
];
const ACTIVE_TEXT_DIRECTORIES = [
  'references',
  'agents',
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

function declaredSkillsPath(manifest) {
  const listed = manifest?.omp?.skills;
  if (Array.isArray(listed) && typeof listed[0] === 'string' && listed[0].trim() !== '') {
    return listed[0];
  }
  return './skills';
}

function resolveSkillsRoot(root, declaredPath) {
  if (typeof declaredPath !== 'string' || declaredPath.trim() === '') {
    throw new SurfaceInputError('manifest field omp.skills must be a non-empty relative path');
  }

  const portable = declaredPath.replaceAll('\\', '/');
  const segments = portable.split('/').filter((segment) => segment !== '' && segment !== '.');
  const hasWindowsDrive = /^[A-Za-z]:[\\/]/.test(declaredPath);

  if (!portable.startsWith('./')) {
    throw new SurfaceInputError(`manifest field "skills" must start with "./": ${declaredPath}`);
  }
  if (path.isAbsolute(declaredPath) || hasWindowsDrive) {
    throw new SurfaceInputError(`manifest field "skills" must not be absolute: ${declaredPath}`);
  }
  if (segments.length === 0 || segments.includes('..')) {
    throw new SurfaceInputError(`manifest field "skills" must not traverse outside the plugin root: ${declaredPath}`);
  }

  const skillsRoot = path.resolve(root, ...segments);
  const relative = path.relative(root, skillsRoot);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new SurfaceInputError(`manifest field "skills" resolves outside the plugin root: ${declaredPath}`);
  }

  requireReadableDirectory(skillsRoot, 'manifest-declared skills directory');

  let realRoot;
  let realSkillsRoot;
  try {
    realRoot = fs.realpathSync(root);
    realSkillsRoot = fs.realpathSync(skillsRoot);
  } catch (error) {
    throw new SurfaceInputError(`could not resolve the selected plugin surface: ${error.message}`);
  }

  const realRelative = path.relative(realRoot, realSkillsRoot);
  if (realRelative === '' || realRelative.startsWith(`..${path.sep}`) || realRelative === '..' || path.isAbsolute(realRelative)) {
    throw new SurfaceInputError(`manifest-declared skills directory resolves outside the plugin root: ${declaredPath}`);
  }

  return skillsRoot;
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
  return file === 'README.md' || file.startsWith('skills/upgrade-project/');
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

function walkSkillsTree(root, skillsRoot, violations) {
  function walk(directory) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      throw new SurfaceInputError(`could not inspect skills directory ${directory}: ${error.message}`);
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
        throw new SurfaceInputError(`could not read active skill file ${absolute}: ${error.message}`);
      }
      if (source.includes('\0')) continue;
      inspectLoaderFacingText(source, relative, violations);
    }
  }

  walk(skillsRoot);
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
    if (/skills[\\/](?:commit-push|end-loop|init-config|run-loop)(?:[\\/]|$)/i.test(value)
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

export function validatePluginSurface(rootArgument, label) {
  const root = path.resolve(rootArgument);
  requireReadableDirectory(root, 'plugin root');

  const manifestFile = path.join(root, MANIFEST_PATH);
  const manifestSource = readRequiredFile(manifestFile, 'plugin manifest');
  const manifest = parseJson(manifestSource, manifestFile, 'plugin manifest');
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new SurfaceInputError(`plugin manifest must contain a JSON object: ${manifestFile}`);
  }

  const versionSource = readRequiredFile(path.join(root, VERSION_PATH), 'VERSION').trim();
  if (manifest.version !== versionSource) {
    throw new SurfaceInputError(`plugin version ${JSON.stringify(manifest.version)} must equal VERSION ${JSON.stringify(versionSource)}`);
  }
  const extensions = manifest?.omp?.extensions;
  if (!Array.isArray(extensions)
    || extensions.length !== EXPECTED_EXTENSIONS.length
    || extensions.some((item, index) => item !== EXPECTED_EXTENSIONS[index])) {
    throw new SurfaceInputError(`package.json omp.extensions must equal ${JSON.stringify(EXPECTED_EXTENSIONS)}`);
  }

  const skillsRoot = resolveSkillsRoot(root, declaredSkillsPath(manifest));
  const openPrFile = path.join(skillsRoot, 'open-pr', 'SKILL.md');
  const openPrSource = readRequiredFile(openPrFile, 'open-pr skill definition');
  if (!/^name:\s*["']?open-pr["']?\s*$/im.test(readFrontmatter(openPrSource))) {
    throw new SurfaceInputError(`open-pr is not discoverable from ${relativePath(root, openPrFile)}: expected frontmatter name "open-pr"`);
  }

  const violations = [];
  inspectRemovedPaths(root, violations);
  inspectLoaderFacingText(manifestSource, toPortablePath(MANIFEST_PATH), violations);
  walkSkillsTree(root, skillsRoot, violations);
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

function parseCliArguments(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        root: { type: 'string' },
        label: { type: 'string' },
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

  return { root: values.root, label: values.label.trim() };
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

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  process.exitCode = run();
}
