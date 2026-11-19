/** Per-project kept test types from steering/test-layers.json. Zero-dependency: reads only that file and never
 * follows a symlinked target. The pure validation and rule text live in src/test-layers.mjs. */
import fs from 'node:fs';
import path from 'node:path';
import { TEST_LAYER_DEFAULTS, TEST_LAYERS_PATH, TestLayersError, validateTestLayers } from '../src/test-layers.mjs';

export {
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
