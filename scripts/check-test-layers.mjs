#!/usr/bin/env node
/** CI check for the kept test types in steering/test-layers.json.
 *
 * Usage: node scripts/check-test-layers.mjs [--root <dir>]
 *
 * Classifies every test file with the upgrade inventory (`inventoryTestFiles` in upgrade-test-layers.mjs) and fails
 * when steering/test-layers.json is invalid, when a test file of a type the project does not keep is not listed in
 * scripts/test-layers-allowlist.json, or when the allowlist names a file that is missing or now of a kept type. The
 * allowlist only shrinks: it holds the non-kept tests that predate the kept-types choice and are still to be converted.
 *
 * Prints one JSON object. Exit status: 0 when the check passes, 1 when it fails, 2 for a usage error. */
import fs from 'node:fs';
import path from 'node:path';
import { isCliEntry } from './plugin-controller-path.mjs';
import { loadTestLayers } from './test-layers.mjs';
import { inventoryTestFiles } from './upgrade-test-layers.mjs';

export const TEST_LAYERS_ALLOWLIST_PATH = 'scripts/test-layers-allowlist.json';

function loadAllowlist(root) {
  const target = path.join(path.resolve(root), TEST_LAYERS_ALLOWLIST_PATH);
  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { files: [] };
    return { error: `unreadable: ${error.code ?? error.message}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `invalid JSON: ${error.message}` };
  }
  const files = parsed?.files;
  if (parsed?.version !== 1 || !Array.isArray(files) || files.some((file) => typeof file !== 'string' || !file)) {
    return { error: 'expected { "version": 1, "files": [repository-relative test paths] }' };
  }
  if (new Set(files).size !== files.length) return { error: 'files must be unique' };
  return { files };
}

/** `{ ok, kept, violations }`; each violation is `{ reasonCode, path?, type?, message }`. */
export function checkTestLayers(root) {
  let kept;
  try {
    kept = loadTestLayers(root).config.kept;
  } catch (error) {
    return { ok: false, violations: [{ reasonCode: 'test_layers_invalid', path: 'steering/test-layers.json', message: error.message }] };
  }
  const allowlist = loadAllowlist(root);
  if (allowlist.error) {
    return {
      ok: false,
      kept,
      violations: [{ reasonCode: 'test_layers_allowlist_invalid', path: TEST_LAYERS_ALLOWLIST_PATH, message: allowlist.error }],
    };
  }
  const keptSet = new Set(kept);
  const allowed = new Set(allowlist.files);
  const inventory = new Map(inventoryTestFiles(root).map((file) => [file.path, file.type]));
  const violations = [];
  for (const [file, type] of inventory) {
    if (keptSet.has(type) || allowed.has(file)) continue;
    violations.push({
      reasonCode: 'test_layers_type_not_kept',
      path: file,
      type,
      message: `${file} is a ${type} test, which steering/test-layers.json does not keep; write it as a bdd scenario`,
    });
  }
  for (const file of allowlist.files) {
    const type = inventory.get(file);
    if (type === undefined) {
      violations.push({
        reasonCode: 'test_layers_allowlist_stale',
        path: file,
        message: `${TEST_LAYERS_ALLOWLIST_PATH} lists ${file}, which is not a test file; remove the entry`,
      });
    } else if (keptSet.has(type)) {
      violations.push({
        reasonCode: 'test_layers_allowlist_stale',
        path: file,
        type,
        message: `${TEST_LAYERS_ALLOWLIST_PATH} lists ${file}, which is now a kept ${type} test; remove the entry`,
      });
    }
  }
  return { ok: violations.length === 0, kept, violations };
}

function main(argv) {
  let root = '.';
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root' && argv[index + 1]) {
      root = argv[index + 1];
      index += 1;
    } else {
      console.error('Usage: node scripts/check-test-layers.mjs [--root <dir>]');
      return 2;
    }
  }
  const result = checkTestLayers(root);
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

if (isCliEntry(import.meta.url)) process.exitCode = main(process.argv.slice(2));
