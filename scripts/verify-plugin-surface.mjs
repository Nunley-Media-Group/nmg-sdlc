#!/usr/bin/env node

/**
 * Validate one explicitly selected nmg-sdlc plugin surface.
 *
 * Exit codes:
 *   0 - the selected surface is valid and contains no commit-push exposure
 *   1 - the selected surface is readable but contains stale commit-push content
 *   2 - arguments or the selected plugin root are invalid
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const TEXT_EXTENSIONS = new Set(['.json', '.md', '.txt', '.yaml', '.yml']);
const MANIFEST_PATH = path.join('.codex-plugin', 'plugin.json');
const INVENTORY_PATH = path.join('scripts', 'skill-inventory.baseline.json');

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
    stat = fs.statSync(directory);
    fs.accessSync(directory, fs.constants.R_OK);
  } catch (error) {
    throw new SurfaceInputError(`${description} is not readable: ${directory} (${error.message})`);
  }

  if (!stat.isDirectory()) {
    throw new SurfaceInputError(`${description} is not a directory: ${directory}`);
  }
}

function readRequiredFile(filePath, description) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new SurfaceInputError(`${description} is not readable: ${filePath} (${error.message})`);
  }
}

function parseJson(source, filePath, description) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new SurfaceInputError(`${description} is malformed JSON: ${filePath} (${error.message})`);
  }
}

function resolveSkillsRoot(root, declaredPath) {
  if (typeof declaredPath !== 'string' || declaredPath.trim() === '') {
    throw new SurfaceInputError(`manifest field "skills" must be a non-empty relative path`);
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

function inspectLoaderFacingText(source, file, violations) {
  const frontmatter = readFrontmatter(source);
  if (/^name:\s*["']?commit-push["']?\s*$/im.test(frontmatter)) {
    addViolation(violations, 'frontmatter-name', file);
  }
  if (/\bcommit-push\b/i.test(frontmatter)) {
    addViolation(violations, 'frontmatter-token', file);
  }

  const loaderMetadata = Array.from(source.matchAll(
    /^[ \t]*(?:aliases?|redirect(?:s|[-_]to)?)[ \t]*:[ \t]*([^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*)/gim,
  ));
  if (loaderMetadata.some((match) => /\bcommit-push\b/i.test(match[1]))
    || /\b(?:alias|redirect)\b[^\n]{0,120}\bcommit-push\b/i.test(source)) {
    addViolation(violations, 'alias-or-redirect', file);
  }

  if (/\b(?:deprecated|deprecation|compatibility stub)\b[^\n]{0,160}\bcommit-push\b/i.test(source)
    || /\bcommit-push\b[^\n]{0,160}\b(?:deprecated|deprecation|compatibility stub)\b/i.test(source)) {
    addViolation(violations, 'deprecation-token', file);
  }

  if (/\$nmg-sdlc:commit-push\b/.test(source)
    || /\bcommitPush\b/.test(source)
    || /DIVERGED:\s*re-run\s+commit-push\b/i.test(source)) {
    addViolation(violations, 'loader-workflow-token', file);
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
        if (entry.name.toLowerCase() === 'commit-push') {
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

function inspectInventoryValue(value, jsonPath, file, violations) {
  if (typeof value === 'string') {
    if (/skills[\\/]commit-push(?:[\\/]|$)/i.test(value)
      || /\$nmg-sdlc:commit-push\b/.test(value)
      || /\bcommitPush\b/.test(value)) {
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

  const skillsRoot = resolveSkillsRoot(root, manifest.skills);
  const openPrFile = path.join(skillsRoot, 'open-pr', 'SKILL.md');
  const openPrSource = readRequiredFile(openPrFile, 'open-pr skill definition');
  if (!/^name:\s*["']?open-pr["']?\s*$/im.test(readFrontmatter(openPrSource))) {
    throw new SurfaceInputError(`open-pr is not discoverable from ${relativePath(root, openPrFile)}: expected frontmatter name "open-pr"`);
  }

  const violations = [];
  inspectLoaderFacingText(manifestSource, toPortablePath(MANIFEST_PATH), violations);
  walkSkillsTree(root, skillsRoot, violations);

  const inventoryFile = path.join(root, INVENTORY_PATH);
  if (fs.existsSync(inventoryFile)) {
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
