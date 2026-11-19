/**
 * upgrade-test-layers.mjs
 * The /sdlc-upgrade-project `test-layers` item: a static test-file inventory and digest-bound detector, the
 * coverage-driven migration candidates, a temporary-index snapshot/restore, and the deterministic per-batch gate.
 *
 * Detection is read-only. Candidates, begin, gate and report run the commands declared in
 * steering/test-coverage.json as argument arrays and write only under .nmg-sdlc/upgrade/test-layers/. A refused
 * batch restores every non-ignored path to its pre-batch tree without touching the real index, HEAD or refs.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TEST_LAYER_TYPES, TEST_LAYERS_PATH, loadTestLayers, writeTestLayers } from './test-layers.mjs';
import {
  TEST_COVERAGE_PATH,
  loadTestCoverageConfig,
  runCommand,
  validateCoverageReport,
} from './test-coverage.mjs';

export const TEST_LAYERS_STATE_DIR = '.nmg-sdlc/upgrade/test-layers';
const SKIP_DIRS = new Set(['.git', '.nmg-sdlc', 'node_modules', 'vendor', 'dist', 'build']);
const TEST_DIRS = new Set(['__tests__', 'test', 'tests', 'spec']);
const SOURCE_EXTENSIONS = new Set([
  '.c', '.cc', '.cjs', '.clj', '.cpp', '.cs', '.dart', '.ex', '.exs', '.fs', '.go', '.groovy', '.h', '.hpp', '.java',
  '.js', '.jsx', '.kt', '.kts', '.lua', '.m', '.mjs', '.mm', '.php', '.pl', '.ps1', '.py', '.r', '.rb', '.rs',
  '.scala', '.sh', '.swift', '.ts', '.tsx', '.vb', '.zig',
]);
const TEST_BASENAME_RES = [/\.(test|spec)\.[^.]+$/, /_test\.[^.]+$/, /^test_.+\.[^.]+$/, /Tests?\.[^.]+$/];
const TYPE_TOKENS = [
  ['integration', new Set(['integration', 'component', 'e2e'])],
  ['property', new Set(['property', 'properties', 'fuzz'])],
  ['doc', new Set(['doc', 'docs', 'contract', 'steering'])],
];
const FILE_HEADER_RE = /^#[ \t]*File:[ \t]*(\S+)[ \t]*$/gm;
const BATCH_ID_RE = /^batch-\d{3,}$/;
const KINDS = ['lines', 'branches', 'outcomes'];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function toPosix(rel) {
  return rel.split(path.sep).join('/');
}

function isFeature(rel) {
  return rel.endsWith('.feature');
}

function isTestPath(rel) {
  if (isFeature(rel)) return true;
  const base = path.posix.basename(rel);
  if (TEST_BASENAME_RES.some((re) => re.test(base))) return true;
  const dirs = rel.split('/').slice(0, -1);
  return dirs.some((dir) => TEST_DIRS.has(dir)) && SOURCE_EXTENSIONS.has(path.posix.extname(base).toLowerCase());
}

function walk(root) {
  const files = [];
  const visit = (dirAbs, relDir) => {
    let entries;
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (entry.isSymbolicLink()) continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(path.join(dirAbs, entry.name), rel);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  };
  visit(path.resolve(root), '');
  return files;
}

function readBytes(root, rel) {
  try {
    return fs.readFileSync(path.join(path.resolve(root), ...rel.split('/')));
  } catch {
    return null;
  }
}

function tokensOf(rel) {
  const segments = rel.toLowerCase().split('/');
  const base = path.posix.basename(rel).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return new Set([...segments, ...base.split(/[^a-z0-9]+/).filter(Boolean)]);
}

/** First matching type in vocabulary priority: bdd, integration, property, doc, then unit. */
export function classifyTestFile(rel, text = '', featureFileRefs = new Set()) {
  const segments = rel.split('/');
  if (isFeature(rel)
    || segments.slice(0, -1).some((dir) => dir === 'steps' || dir === 'step_definitions')
    || /@SCN\d+/.test(text ?? '')
    || featureFileRefs.has(rel)) return 'bdd';
  const tokens = tokensOf(rel);
  for (const [type, words] of TYPE_TOKENS) {
    if ([...words].some((word) => tokens.has(word))) return type;
  }
  return 'unit';
}

function scan(root) {
  const all = walk(root);
  const refs = new Set();
  for (const rel of all) {
    if (!isFeature(rel) && path.posix.basename(rel) !== 'feature.gherkin') continue;
    const text = readBytes(root, rel)?.toString('utf8') ?? '';
    for (const match of text.matchAll(FILE_HEADER_RE)) refs.add(match[1].replace(/^\.\//, ''));
  }
  const files = [];
  for (const rel of all.filter(isTestPath)) {
    const bytes = readBytes(root, rel);
    if (!bytes) continue;
    files.push({ path: rel, type: classifyTestFile(rel, isFeature(rel) ? '' : bytes.toString('utf8'), refs), sha256: sha256(bytes) });
  }
  return { files, refs };
}

/** Sorted `[{ path, type, sha256 }]` for every test file under `root`. */
export function inventoryTestFiles(root) {
  return scan(root).files;
}

/** Basename without the extension and test markers, lower-cased, with `-`, `_` and case boundaries folded to `-`. */
export function normalizedStem(rel) {
  let stem = path.posix.basename(rel);
  stem = stem.slice(0, stem.length - path.posix.extname(stem).length);
  stem = stem.replace(/\.(test|spec)$/, '').replace(/_test$/, '').replace(/^test_/, '').replace(/Tests?$/, '');
  return stem.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[-_.\s]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

/** Each non-bdd test file whose normalized stem equals a `.feature` file's, with that feature. */
export function pairWithFeatures(inventory) {
  const features = new Map();
  for (const file of inventory) {
    if (!isFeature(file.path)) continue;
    const stem = normalizedStem(file.path);
    if (stem && !features.has(stem)) features.set(stem, file.path);
  }
  return inventory
    .filter((file) => file.type !== 'bdd' && features.has(normalizedStem(file.path)))
    .map((file) => ({ path: file.path, type: file.type, feature: features.get(normalizedStem(file.path)) }));
}

function recordedKept(root) {
  try {
    const recorded = loadTestLayers(root);
    return recorded.missing ? null : recorded.config.kept;
  } catch {
    return null;
  }
}

function coverageConfigState(root) {
  try {
    return loadTestCoverageConfig(root).missing ? 'missing' : 'present';
  } catch {
    return 'invalid';
  }
}

function steeringBytesDigest(hash, root, rel) {
  const target = path.join(path.resolve(root), ...rel.split('/'));
  let stat = null;
  try {
    stat = fs.lstatSync(target);
  } catch {
    // absent
  }
  if (!stat) {
    hash.update(`${rel}\0absent\0`);
  } else if (stat.isSymbolicLink() || !stat.isFile()) {
    hash.update(`${rel}\0not-a-file\0`);
  } else {
    hash.update(`${rel}\0${sha256(fs.readFileSync(target))}\0`);
  }
}

/** The digest-bound `test-layers:<sha256>` upgrade item, or null when the project has no test file. */
export function detectTestLayers(root) {
  const inventory = inventoryTestFiles(root);
  if (inventory.length === 0) return null;
  const hash = createHash('sha256');
  for (const file of inventory) hash.update(`${file.path}\0${file.type}\0${file.sha256}\n`);
  steeringBytesDigest(hash, root, TEST_LAYERS_PATH);
  steeringBytesDigest(hash, root, TEST_COVERAGE_PATH);
  const detectedTypes = {};
  for (const type of TEST_LAYER_TYPES) {
    const count = inventory.filter((file) => file.type === type).length;
    if (count) detectedTypes[type] = count;
  }
  const kept = recordedKept(root);
  const coverageConfig = coverageConfigState(root);
  return {
    id: `test-layers:${hash.digest('hex')}`,
    kind: 'test-layers',
    description: `Record the kept test types in ${TEST_LAYERS_PATH} (detected: ${Object.entries(detectedTypes).map(([type, count]) => `${type} ${count}`).join(', ')}; recorded: ${kept ? kept.join(', ') : 'none'}), then migrate tests of non-kept types into BDD scenarios under the ${TEST_COVERAGE_PATH} coverage gate (${coverageConfig}).`,
    rel: TEST_LAYERS_PATH,
    actionable: true,
    detectedTypes,
    recordedKept: kept,
    pairs: pairWithFeatures(inventory),
    coverageConfig,
  };
}

function coverageGap(root) {
  try {
    if (loadTestCoverageConfig(root).missing) return { reasonCode: 'test_coverage_command_missing', path: TEST_COVERAGE_PATH };
    return null;
  } catch (error) {
    return { reasonCode: 'test_coverage_config_invalid', path: TEST_COVERAGE_PATH, key: error.key, message: error.message };
  }
}

function stateFile(root, ...parts) {
  return path.join(path.resolve(root), ...TEST_LAYERS_STATE_DIR.split('/'), ...parts);
}

function writeState(root, parts, value) {
  const target = stateFile(root, ...parts);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return toPosix(path.relative(path.resolve(root), target));
}

function readState(root, ...parts) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(root, ...parts), 'utf8'));
  } catch {
    return null;
  }
}

/** Applies an approved item: records `kept` (or keeps the recorded set) and the inventory; reports a coverage gap. */
export function applyTestLayers(root, item, kept) {
  let config;
  const updated = [];
  try {
    if (kept) {
      config = writeTestLayers(root, kept);
      updated.push(TEST_LAYERS_PATH);
    } else {
      const recorded = loadTestLayers(root);
      if (recorded.missing) return { id: item.id, status: 'skipped:kept_types_unrecorded' };
      config = recorded.config;
    }
  } catch (error) {
    return { id: item.id, status: `failed:${error.message}` };
  }
  const { files, refs } = scan(root);
  const inventory = writeState(root, ['inventory.json'], {
    version: 1,
    kept: config.kept,
    files,
    featureFileRefs: [...refs].sort(),
    pairs: pairWithFeatures(files),
  });
  const gap = coverageGap(root);
  return { id: item.id, status: 'applied', kept: config.kept, updated, inventory, ...(gap ? { gap } : {}) };
}

function typeResolver(root) {
  const { files, refs } = scan(root);
  const byPath = new Map(files.map((file) => [file.path, file.type]));
  return (rel) => byPath.get(rel)
    ?? classifyTestFile(rel, isFeature(rel) ? '' : readBytes(root, rel)?.toString('utf8') ?? '', refs);
}

function collectCoverage(root, config) {
  const run = runCommand(root, config.coverage);
  if (run.status !== 0) {
    return { error: { reasonCode: 'test_layers_coverage_failed', status: run.status, message: run.stderr.trim().slice(0, 2000) } };
  }
  try {
    const report = validateCoverageReport(JSON.parse(run.stdout));
    const typeOf = typeResolver(root);
    return { tests: report.tests.map((test) => ({ ...test, type: typeOf(test.file) })) };
  } catch (error) {
    return { error: { reasonCode: 'test_layers_coverage_failed', message: String(error.message) } };
  }
}

function isSubset(small, big) {
  const set = new Set(big);
  return small.every((entry) => set.has(entry));
}

function covers(big, small) {
  return KINDS.every((kind) => isSubset(small[kind], big[kind]));
}

/** Labels each non-kept test `duplicate`, `convert` or `unmatched` and groups the first two into per-file batches. */
export function computeCandidates(inventory, kept, coverage) {
  const keptSet = new Set(kept);
  const pairs = new Map(pairWithFeatures(inventory).map((pair) => [pair.path, pair.feature]));
  const bdd = coverage.filter((test) => test.type === 'bdd');
  const byFile = new Map();
  const unmatched = [];
  for (const test of coverage) {
    if (keptSet.has(test.type)) continue;
    const coveredBy = bdd.filter((candidate) => covers(candidate, test)).map((candidate) => candidate.id);
    const feature = pairs.get(test.file) ?? null;
    let entry;
    if (coveredBy.length) entry = { id: test.id, label: 'duplicate', coveredBy };
    else if (feature) entry = { id: test.id, label: 'convert', target: feature };
    else {
      unmatched.push({ id: test.id, file: test.file, type: test.type });
      continue;
    }
    if (!byFile.has(test.file)) byFile.set(test.file, { file: test.file, type: test.type, feature, tests: [] });
    byFile.get(test.file).tests.push(entry);
  }
  const batches = [...byFile.values()]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map((batch, index) => ({ id: `batch-${String(index + 1).padStart(3, '0')}`, ...batch }));
  return { batches, unmatched };
}

function unionOf(tests) {
  const sets = Object.fromEntries(KINDS.map((kind) => [kind, new Set()]));
  for (const test of tests) for (const kind of KINDS) for (const entry of test[kind]) sets[kind].add(entry);
  return sets;
}

/** Pure gate decision for one batch. `after` is `{ tests }` or `{ error }`; tests carry their file `type`. */
export function gateBatch(before, after, suite, batch, kept) {
  if (suite.status !== 0) {
    return { status: 'refused', reasonCode: 'test_layers_suite_failed', suiteStatus: suite.status };
  }
  if (after.error) return { status: 'refused', reasonCode: 'test_layers_coverage_failed', message: after.error.message };
  const keptSet = new Set(kept);
  const afterIds = new Set(after.tests.map((test) => test.id));
  const removed = before.tests.filter((test) => !afterIds.has(test.id));
  const outOfBatch = removed.filter((test) => keptSet.has(test.type) || test.file !== batch.file);
  if (outOfBatch.length) {
    return {
      status: 'refused',
      reasonCode: 'test_layers_removal_out_of_batch',
      tests: outOfBatch.map((test) => ({ id: test.id, file: test.file, type: test.type })),
    };
  }
  const removedUnion = unionOf(removed);
  const keptAfter = after.tests.filter((test) => keptSet.has(test.type));
  const keptUnion = unionOf(keptAfter);
  const beforeUnion = unionOf(before.tests);
  const afterUnion = unionOf(after.tests);
  const gap = {};
  for (const kind of KINDS) {
    const missing = new Set([...removedUnion[kind]].filter((entry) => !keptUnion[kind].has(entry)));
    for (const entry of beforeUnion[kind]) if (!afterUnion[kind].has(entry)) missing.add(entry);
    gap[kind] = [...missing].sort();
  }
  if (KINDS.some((kind) => gap[kind].length)) return { status: 'refused', reasonCode: 'test_layers_coverage_gap', gap };
  const bddAfter = keptAfter.filter((test) => test.type === 'bdd');
  const deleted = removed.map((test) => {
    let coveredBy = bddAfter.filter((candidate) => covers(candidate, test));
    if (!coveredBy.length) {
      coveredBy = keptAfter.filter((candidate) => KINDS.some((kind) => candidate[kind].some((entry) => test[kind].includes(entry))));
    }
    return { id: test.id, file: test.file, coveredBy: coveredBy.map((candidate) => candidate.id), lines: test.lines };
  });
  return { status: 'accepted', deleted };
}

function git(root, args, indexFile) {
  const result = spawnSync('git', args, {
    cwd: path.resolve(root),
    encoding: 'utf8',
    shell: false,
    maxBuffer: 256 * 1024 * 1024,
    env: indexFile ? { ...process.env, GIT_INDEX_FILE: indexFile } : process.env,
  });
  if (result.error || result.status !== 0) {
    const error = new Error(`git ${args[0]} failed: ${(result.stderr || result.error?.message || '').trim()}`);
    error.reasonCode = 'test_layers_snapshot_failed';
    throw error;
  }
  return result.stdout;
}

// Runtime state never enters a snapshot. Naming an already-ignored directory in a pathspec makes `git add` fail.
function worktreePathspec(root) {
  const ignored = spawnSync('git', ['check-ignore', '-q', '.nmg-sdlc'], { cwd: path.resolve(root), shell: false }).status === 0;
  return ignored ? ['--', '.'] : ['--', '.', ':(exclude).nmg-sdlc'];
}

function requireGitWorkTree(root) {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: path.resolve(root), encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0 || result.stdout.trim() !== 'true') {
    const error = new Error('test-layer batches require a Git work tree to snapshot and restore');
    error.reasonCode = 'test_layers_git_required';
    throw error;
  }
}

/** Stages every non-ignored path into a temporary index and returns its tree id; the real index is untouched. */
export function snapshot(root, batchId) {
  requireGitWorkTree(root);
  const indexFile = stateFile(root, `index-${batchId}`);
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  fs.rmSync(indexFile, { force: true });
  git(root, ['add', '-A', ...worktreePathspec(root)], indexFile);
  return git(root, ['write-tree'], indexFile).trim();
}

/** Returns every non-ignored path to `tree`, deleting non-ignored paths absent from it. HEAD, refs and the real
 * index are never changed. */
export function restore(root, tree, batchId) {
  const rootAbs = path.resolve(root);
  const indexFile = stateFile(root, `index-${batchId}`);
  git(root, ['read-tree', tree], indexFile);
  git(root, ['checkout-index', '-a', '-f'], indexFile);
  const extra = git(root, ['ls-files', '-z', '--others', '--exclude-standard', ...worktreePathspec(root)], indexFile)
    .split('\0').filter(Boolean);
  for (const rel of extra) {
    const target = path.join(rootAbs, ...rel.split('/'));
    fs.rmSync(target, { force: true });
    let dir = path.dirname(target);
    while (dir.startsWith(rootAbs + path.sep)) {
      try {
        fs.rmdirSync(dir);
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
  }
}

function counts(tests) {
  const union = unionOf(tests);
  return { testCount: tests.length, lines: union.lines.size, branches: union.branches.size, outcomes: union.outcomes.size };
}

function preconditions(root) {
  let kept;
  try {
    const recorded = loadTestLayers(root);
    if (recorded.missing) return { refusal: { reasonCode: 'kept_types_unrecorded', path: TEST_LAYERS_PATH } };
    kept = recorded.config.kept;
  } catch (error) {
    return { refusal: { reasonCode: 'test_layers_invalid', path: TEST_LAYERS_PATH, key: error.key, message: error.message } };
  }
  const gap = coverageGap(root);
  if (gap) return { refusal: gap };
  return { kept, config: loadTestCoverageConfig(root).config };
}

function measure(root, config) {
  const suite = runCommand(root, config.suite);
  if (suite.status !== 0) return { suite, error: { reasonCode: 'test_layers_suite_failed', suiteStatus: suite.status } };
  const coverage = collectCoverage(root, config);
  return { suite, ...coverage };
}

/** Runs the suite and coverage, records the baseline, and returns the migration batches. */
export function testLayersCandidates(root) {
  const pre = preconditions(root);
  if (pre.refusal) return { ok: true, batches: [], unmatched: [], refused: [pre.refusal] };
  const measured = measure(root, pre.config);
  if (measured.error) return { ok: false, ...measured.error };
  const inventory = inventoryTestFiles(root);
  const { batches, unmatched } = computeCandidates(inventory, pre.kept, measured.tests);
  const baseline = { ...counts(measured.tests), wallMs: measured.suite.wallMs };
  writeState(root, ['baseline.json'], { version: 1, kept: pre.kept, before: baseline });
  writeState(root, ['candidates.json'], { version: 1, kept: pre.kept, batches, unmatched });
  return { ok: true, kept: pre.kept, batches, unmatched, baseline };
}

function loadBatch(root, batchId) {
  const candidates = readState(root, 'candidates.json');
  return candidates?.batches?.find((batch) => batch.id === batchId) ?? null;
}

/** Snapshots the pre-batch tree and records the pre-batch coverage. */
export function beginTestLayersBatch(root, batchId) {
  const pre = preconditions(root);
  if (pre.refusal) return { ok: false, batch: batchId, ...pre.refusal };
  const batch = loadBatch(root, batchId);
  if (!batch) return { ok: false, batch: batchId, reasonCode: 'test_layers_batch_unknown' };
  let tree;
  try {
    tree = snapshot(root, batchId);
  } catch (error) {
    return { ok: false, batch: batchId, reasonCode: error.reasonCode ?? 'test_layers_snapshot_failed', message: error.message };
  }
  const coverage = collectCoverage(root, pre.config);
  if (coverage.error) return { ok: false, batch: batchId, ...coverage.error };
  writeState(root, ['batches', `${batchId}.begin.json`], { version: 1, batch, tree, tests: coverage.tests });
  return { ok: true, batch: batchId, status: 'begun', file: batch.file, tests: batch.tests };
}

/** Runs the suite and coverage after the batch's edits, gates them, and restores the snapshot on refusal. */
export function gateTestLayersBatch(root, batchId) {
  const pre = preconditions(root);
  if (pre.refusal) return { ok: false, batch: batchId, ...pre.refusal };
  const begun = readState(root, 'batches', `${batchId}.begin.json`);
  if (!begun) return { ok: false, batch: batchId, reasonCode: 'test_layers_batch_not_begun' };
  const suite = runCommand(root, pre.config.suite);
  const after = suite.status === 0 ? collectCoverage(root, pre.config) : { tests: [] };
  const decision = gateBatch({ tests: begun.tests }, after, suite, begun.batch, pre.kept);
  if (decision.status === 'refused') restore(root, begun.tree, batchId);
  const record = { batch: batchId, file: begun.batch.file, ...decision };
  writeState(root, ['batches', `${batchId}.json`], { version: 1, ...record });
  fs.rmSync(stateFile(root, `index-${batchId}`), { force: true });
  return { ok: decision.status === 'accepted', ...record };
}

/** Before/after counts, wall time and coverage, accepted evidence and refused gaps. */
export function testLayersReport(root) {
  const pre = preconditions(root);
  if (pre.refusal) return { ok: false, ...pre.refusal };
  const baseline = readState(root, 'baseline.json');
  if (!baseline?.before) return { ok: false, reasonCode: 'test_layers_baseline_missing', path: `${TEST_LAYERS_STATE_DIR}/baseline.json` };
  const measured = measure(root, pre.config);
  if (measured.error) return { ok: false, ...measured.error };
  const after = { ...counts(measured.tests), wallMs: measured.suite.wallMs };
  const dir = stateFile(root, 'batches');
  const records = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter((name) => name.endsWith('.json') && !name.endsWith('.begin.json'))
    .sort()
    .map((name) => readState(root, 'batches', name))
    .filter(Boolean);
  const accepted = records.filter((record) => record.status === 'accepted')
    .map(({ batch, file, deleted }) => ({ batch, file, deleted }));
  const refused = records.filter((record) => record.status === 'refused')
    .map(({ version, status, ...rest }) => rest);
  const regressed = KINDS.filter((kind) => after[kind] < baseline.before[kind]);
  return {
    ok: regressed.length === 0,
    ...(regressed.length ? { reasonCode: 'test_layers_coverage_regressed', regressed } : {}),
    before: baseline.before,
    after,
    accepted,
    refused,
  };
}

function cliError(message) {
  const error = new Error(message);
  error.reasonCode = 'test_layers_cli_invalid';
  error.exitCode = 2;
  return error;
}

export const TEST_LAYERS_COMMANDS = new Set(['test-layers-candidates', 'test-layers-batch', 'test-layers-report']);

/** Parses `<command> [begin|gate] --root <dir> [--batch <id>]`; throws exit-2 errors for bad arguments. */
export function parseTestLayersCli(tokens) {
  const [command, ...rest] = tokens;
  if (!TEST_LAYERS_COMMANDS.has(command)) throw cliError(`unknown test-layers command: ${command}`);
  const args = { command, root: process.cwd(), action: null, batch: null };
  const seen = new Set();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const match = /^(--root|--batch)=(.*)$/.exec(token);
    const option = match ? match[1] : (token === '--root' || token === '-r' ? '--root' : token === '--batch' ? '--batch' : null);
    if (option) {
      const value = match ? match[2] : rest[++index];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('-')) throw cliError(`${option} requires a value`);
      if (seen.has(option)) throw cliError(`${option} may occur only once`);
      seen.add(option);
      if (option === '--root') args.root = value;
      else args.batch = value;
    } else if (command === 'test-layers-batch' && !args.action && (token === 'begin' || token === 'gate')) {
      args.action = token;
    } else {
      throw cliError(`unexpected argument: ${token}`);
    }
  }
  if (command === 'test-layers-batch') {
    if (!args.action) throw cliError('test-layers-batch requires begin or gate');
    if (!args.batch || !BATCH_ID_RE.test(args.batch)) throw cliError('test-layers-batch requires --batch batch-NNN');
  } else if (args.batch) {
    throw cliError(`${command} takes no --batch`);
  }
  return args;
}

/** Runs one test-layers subcommand: `{ exitCode, output }` (0 on ok:true, 1 on refusal, 2 on bad arguments). */
export function runTestLayersCli(tokens) {
  let args;
  try {
    args = parseTestLayersCli(tokens);
  } catch (error) {
    return { exitCode: 2, output: { ok: false, reasonCode: error.reasonCode, message: error.message } };
  }
  let output;
  try {
    if (args.command === 'test-layers-candidates') output = testLayersCandidates(args.root);
    else if (args.command === 'test-layers-report') output = testLayersReport(args.root);
    else if (args.action === 'begin') output = beginTestLayersBatch(args.root, args.batch);
    else output = gateTestLayersBatch(args.root, args.batch);
  } catch (error) {
    output = { ok: false, reasonCode: error.reasonCode ?? 'test_layers_failed', message: String(error.message ?? error) };
  }
  return { exitCode: output.ok ? 0 : 1, output };
}
