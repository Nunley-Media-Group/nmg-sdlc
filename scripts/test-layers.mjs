/** Per-project kept test types from steering/test-layers.json. Zero-dependency: reads and writes only that file and
 * never follows a symlinked target. The pure validation and rule text live in src/test-layers.mjs. */
import fs from 'node:fs';
import path from 'node:path';
import { TEST_LAYER_DEFAULTS, TEST_LAYERS_PATH, TestLayersError, validateTestLayers } from '../src/test-layers.mjs';

export {
  declaredTestType,
  TEST_LAYER_DEFAULTS,
  TEST_LAYER_TYPES,
  TEST_LAYERS_PATH,
  TestLayersError,
  testLayersRule,
  validateTestLayers,
} from '../src/test-layers.mjs';

/** `{ config, missing }`: a missing file resolves to BDD-only; an invalid file throws TestLayersError. */
export function loadTestLayers(root) {
  const target = path.join(path.resolve(root), TEST_LAYERS_PATH);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new TestLayersError('(file)', undefined, `unreadable: ${error.code ?? error.message}`);
    return { config: { version: 1, kept: [...TEST_LAYER_DEFAULTS.kept] }, missing: true };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new TestLayersError('(file)', undefined, 'must be a regular file, not a symlink or directory');
  }
  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch (error) {
    throw new TestLayersError('(file)', undefined, `unreadable: ${error.code ?? error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new TestLayersError('(file)', undefined, `invalid JSON: ${error.message}`);
  }
  return { config: validateTestLayers(parsed), missing: false };
}

/** The normalized config that writeTestLayers writes: `kept` (bdd always included) with the `paths` map of a valid
 * existing file. An invalid existing file throws its TestLayersError, so a caller that checks first writes nothing. */
export function testLayersWithKept(root, kept) {
  const list = Array.isArray(kept) ? kept : [kept];
  const recorded = loadTestLayers(root);
  const paths = recorded.missing ? undefined : recorded.config.paths;
  return validateTestLayers({
    version: 1,
    kept: list.includes('bdd') ? list : ['bdd', ...list],
    ...(paths ? { paths } : {}),
  });
}

/** Writes the config of testLayersWithKept, refusing a symlinked target, and re-validates the written file. Returns the
 * normalized config. */
export function writeTestLayers(root, kept) {
  const config = testLayersWithKept(root, kept);
  const target = path.join(path.resolve(root), TEST_LAYERS_PATH);
  let stat = null;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new TestLayersError('(file)', undefined, `unreadable: ${error.code ?? error.message}`);
  }
  if (stat && (stat.isSymbolicLink() || !stat.isFile())) {
    throw new TestLayersError('(file)', undefined, 'must be a regular file, not a symlink or directory');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
  const written = loadTestLayers(root);
  if (written.missing) throw new TestLayersError('(file)', undefined, 'was not written');
  return written.config;
}
