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
import {
  TEST_LAYER_TYPES,
  TEST_LAYERS_PATH,
  declaredTestType,
  loadTestLayers,
  testLayersWithKept,
  writeTestLayers,
} from './test-layers.mjs';
import {
  COVERAGE_OUTPUT_ENV,
  TEST_COVERAGE_PATH,
  compactTest,
  createCoverageOutput,
  expandEntries,
  forEachLine,
  loadTestCoverageConfig,
  rangeCount,
  rangesContain,
  rangesIntersect,
  readCoverageRun,
  removeCoverageOutput,
  runCommand,
  subtractRanges,
  unionRanges,
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
  ['e2e', new Set(['e2e'])],
  ['integration', new Set(['integration', 'component'])],
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

// A pytest-bdd import at line start, bare or qualified: `from pytest_bdd[.sub] import …` or `import pytest_bdd[.sub]`.
const PYTEST_BDD_IMPORT_RE = /^[ \t]*(?:from[ \t]+pytest_bdd(?:\.\w+)*[ \t]+import\b|import[ \t]+pytest_bdd(?:\.\w+)*(?![\w.]))/m;
// A scenario binding: a `scenarios(` call or an `@scenario(` decorator, bare or `pytest_bdd.`-qualified.
const PYTEST_BDD_BINDING_RE = /(?<![\w.])(?:pytest_bdd\.)?scenarios\(|@(?:pytest_bdd\.)?scenario\(/;

/** True when a Python file binds Gherkin scenarios through pytest-bdd, so pytest reports its scenario tests under it. */
function isPytestBddBindingFile(rel, text) {
  return path.posix.extname(rel) === '.py' && PYTEST_BDD_IMPORT_RE.test(text) && PYTEST_BDD_BINDING_RE.test(text);
}

/**
 * The type of a declared path glob (steering/test-layers.json `paths`) when one matches `rel`, otherwise the first
 * matching built-in type in vocabulary priority: bdd (feature files, step directories, @SCN tags, feature `# File:`
 * headers and pytest-bdd binding files), e2e (the `e2e` path token), integration, property, doc, then unit.
 */
export function classifyTestFile(rel, text = '', featureFileRefs = new Set(), config = undefined) {
  const declared = declaredTestType(config, rel);
  if (declared) return declared;
  const segments = rel.split('/');
  const body = text ?? '';
  if (isFeature(rel)
    || segments.slice(0, -1).some((dir) => dir === 'steps' || dir === 'step_definitions')
    || /@SCN\d+/.test(body)
    || featureFileRefs.has(rel)
    || isPytestBddBindingFile(rel, body)) return 'bdd';
  const tokens = tokensOf(rel);
  for (const [type, words] of TYPE_TOKENS) {
    if ([...words].some((word) => tokens.has(word))) return type;
  }
  return 'unit';
}

const byWalkOrder = (a, b) => {
  const x = a.split('/');
  const y = b.split('/');
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
};

// In a Git work tree, Git lists tracked plus untracked non-ignored files and prunes ignored directories
// (.venv/, target/, coverage/, …) without descending them; outside one, walk() is the fallback.
function listFiles(root) {
  const rootAbs = path.resolve(root);
  const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'], {
    cwd: rootAbs,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return walk(root);
  const files = new Set();
  for (const rel of result.stdout.split('\0')) {
    if (!rel || rel.split('/').some((segment) => SKIP_DIRS.has(segment))) continue;
    try {
      if (fs.lstatSync(path.join(rootAbs, ...rel.split('/'))).isFile()) files.add(rel);
    } catch {
      // Tracked but deleted from the work tree.
    }
  }
  return [...files].sort(byWalkOrder);
}

// A file joins the inventory when a declared glob types it or the built-in test-path rules match it. A path matching
// the globs of two types throws the declaredTestType diagnostic.
function scan(root, config) {
  const all = listFiles(root);
  const refs = new Set();
  for (const rel of all) {
    if (!isFeature(rel) && path.posix.basename(rel) !== 'feature.gherkin') continue;
    const text = readBytes(root, rel)?.toString('utf8') ?? '';
    for (const match of text.matchAll(FILE_HEADER_RE)) refs.add(match[1].replace(/^\.\//, ''));
  }
  const files = [];
  for (const rel of all) {
    if (!declaredTestType(config, rel) && !isTestPath(rel)) continue;
    const bytes = readBytes(root, rel);
    if (!bytes) continue;
    files.push({
      path: rel,
      type: classifyTestFile(rel, isFeature(rel) ? '' : bytes.toString('utf8'), refs, config),
      sha256: sha256(bytes),
    });
  }
  return { files, refs };
}

/** Sorted `[{ path, type, sha256 }]` for every test file under `root`, typed with the declared globs of `config` when
 * it is given. */
export function inventoryTestFiles(root, config = undefined) {
  return scan(root, config).files;
}

/** Basename without the extension and test markers, lower-cased, with `-`, `_` and case boundaries folded to `-`. */
export function normalizedStem(rel) {
  let stem = path.posix.basename(rel);
  stem = stem.slice(0, stem.length - path.posix.extname(stem).length);
  stem = stem.replace(/\.(test|spec)$/, '').replace(/_test$/, '').replace(/^test_/, '').replace(/Tests?$/, '');
  return stem.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[-_.\s]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

/** Each non-bdd test file whose normalized stem equals a `.feature` file's, with that feature. Files of a kept `e2e`
 * type are not paired: they are never migration candidates. */
export function pairWithFeatures(inventory, kept = ['bdd']) {
  const features = new Map();
  for (const file of inventory) {
    if (!isFeature(file.path)) continue;
    const stem = normalizedStem(file.path);
    if (stem && !features.has(stem)) features.set(stem, file.path);
  }
  const e2eKept = kept.includes('e2e');
  return inventory
    .filter((file) => file.type !== 'bdd' && !(e2eKept && file.type === 'e2e') && features.has(normalizedStem(file.path)))
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

/** The recorded steering config, or null with the diagnostic when the file is invalid. */
function recordedLayers(root) {
  try {
    return { config: loadTestLayers(root).config };
  } catch (error) {
    return { config: undefined, configError: error.message };
  }
}

/** The digest-bound `test-layers:<sha256>` upgrade item, or null when the project has no test file. Detection is
 * read-only and tolerant: an invalid steering file or a declared-glob conflict is reported as `configError`, and the
 * inventory then uses the built-in classification. */
export function detectTestLayers(root) {
  const recorded = recordedLayers(root);
  let configError = recorded.configError;
  let inventory;
  try {
    inventory = inventoryTestFiles(root, recorded.config);
  } catch (error) {
    configError ??= error.message;
    inventory = inventoryTestFiles(root);
  }
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
  // An invalid file or a declared-glob conflict records no usable kept set.
  const kept = configError ? null : recordedKept(root);
  const coverageConfig = coverageConfigState(root);
  return {
    id: `test-layers:${hash.digest('hex')}`,
    kind: 'test-layers',
    description: `Record the kept test types in ${TEST_LAYERS_PATH} (detected: ${Object.entries(detectedTypes).map(([type, count]) => `${type} ${count}`).join(', ')}; recorded: ${kept ? kept.join(', ') : 'none'}), then migrate tests of non-kept types into BDD scenarios under the ${TEST_COVERAGE_PATH} coverage gate (${coverageConfig}).`,
    rel: TEST_LAYERS_PATH,
    actionable: true,
    detectedTypes,
    recordedKept: kept,
    pairs: pairWithFeatures(inventory, kept ?? ['bdd']),
    coverageConfig,
    ...(configError ? { configError } : {}),
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
  let scanned;
  const updated = [];
  try {
    if (kept) {
      // The inventory is scanned with the config that will be written, so a declared-glob conflict fails before any write.
      const next = testLayersWithKept(root, kept);
      scanned = scan(root, next);
      config = writeTestLayers(root, kept);
      updated.push(TEST_LAYERS_PATH);
    } else {
      const recorded = loadTestLayers(root);
      if (recorded.missing) return { id: item.id, status: 'skipped:kept_types_unrecorded' };
      config = recorded.config;
      scanned = scan(root, config);
    }
  } catch (error) {
    return { id: item.id, status: `failed:${error.message}` };
  }
  const { files, refs } = scanned;
  const inventory = writeState(root, ['inventory.json'], {
    version: 1,
    kept: config.kept,
    files,
    featureFileRefs: [...refs].sort(),
    pairs: pairWithFeatures(files, config.kept),
  });
  const gap = coverageGap(root);
  return { id: item.id, status: 'applied', kept: config.kept, updated, inventory, ...(gap ? { gap } : {}) };
}

function typeResolver(root, layers) {
  const { files, refs } = scan(root, layers);
  const byPath = new Map(files.map((file) => [file.path, file.type]));
  return (rel) => byPath.get(rel)
    ?? classifyTestFile(rel, isFeature(rel) ? '' : readBytes(root, rel)?.toString('utf8') ?? '', refs, layers);
}

/** Runs the coverage command with a fresh NMG_SDLC_COVERAGE_OUTPUT file and reads its report: the v2 file when the
 * command wrote one, otherwise its v1 stdout. Tests come back in the compact form with their file's `type`. */
function collectCoverage(root, config, layers) {
  const output = createCoverageOutput();
  try {
    const run = runCommand(root, config.coverage, { [COVERAGE_OUTPUT_ENV]: output.file });
    if (run.status !== 0) {
      return { error: { reasonCode: 'test_layers_coverage_failed', status: run.status, message: run.stderr.trim().slice(0, 2000) } };
    }
    try {
      const report = readCoverageRun({ outputFile: output.file, stdout: run.stdout });
      const typeOf = typeResolver(root, layers);
      return { tests: report.tests.map((test) => ({ ...test, type: typeOf(test.file) })) };
    } catch (error) {
      return { error: { reasonCode: 'test_layers_coverage_failed', message: String(error.message) } };
    }
  } finally {
    removeCoverageOutput(output);
  }
}

function covers(big, small) {
  return KINDS.every((kind) => rangesContain(kind, big[kind], small[kind]));
}

/** Labels each non-kept test `duplicate`, `convert` or `unmatched` and groups the first two into per-file batches.
 * `priorIds` maps a file to the batch id an earlier run gave it, so ids stay stable across reruns; other files take
 * the next number above every id in `priorIds` and `usedIds` (ids already spent, such as accepted batches). */
export function computeCandidates(inventory, kept, coverage, priorIds = new Map(), usedIds = []) {
  const keptSet = new Set(kept);
  const pairs = new Map(pairWithFeatures(inventory, kept).map((pair) => [pair.path, pair.feature]));
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
  let next = Math.max(0, ...[...priorIds.values(), ...usedIds].map((id) => Number(id.slice('batch-'.length))));
  const batches = [...byFile.values()]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map((batch) => ({ id: priorIds.get(batch.file) ?? `batch-${String(++next).padStart(3, '0')}`, ...batch }));
  return { batches, unmatched };
}

/** The union of every test's compact entries, per kind. */
function unionOf(tests) {
  return Object.fromEntries(KINDS.map((kind) => [kind, unionRanges(kind, tests.map((test) => test[kind]))]));
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
  // The gap is computed on ranges; only its missing entries are expanded into the reported strings.
  const gap = {};
  for (const kind of KINDS) {
    const missing = unionRanges(kind, [
      subtractRanges(kind, removedUnion[kind], keptUnion[kind]),
      subtractRanges(kind, beforeUnion[kind], afterUnion[kind]),
    ]);
    gap[kind] = expandEntries(kind, missing);
  }
  if (KINDS.some((kind) => gap[kind].length)) return { status: 'refused', reasonCode: 'test_layers_coverage_gap', gap };
  const bddAfter = keptAfter.filter((test) => test.type === 'bdd');
  const deleted = removed.map((test) => {
    let coveredBy = bddAfter.filter((candidate) => covers(candidate, test));
    if (!coveredBy.length) {
      coveredBy = keptAfter.filter((candidate) => KINDS.some((kind) => rangesIntersect(kind, candidate[kind], test[kind])));
    }
    return { id: test.id, file: test.file, coveredBy: coveredBy.map((candidate) => candidate.id), lines: expandEntries('lines', test.lines) };
  });
  return { status: 'accepted', deleted };
}

function git(root, args, indexFile, { input, allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: path.resolve(root),
    encoding: 'utf8',
    shell: false,
    input,
    maxBuffer: 256 * 1024 * 1024,
    env: indexFile ? { ...process.env, GIT_INDEX_FILE: indexFile } : process.env,
  });
  if (result.error || (result.status !== 0 && !allowFailure)) {
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

/** Stages every non-ignored path into a temporary index and returns its tree id; the real index is untouched.
 * The temporary index starts as a copy of the real one, so Git re-hashes only files whose stat data changed. */
export function snapshot(root, batchId) {
  requireGitWorkTree(root);
  const indexFile = stateFile(root, `index-${batchId}`);
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  fs.rmSync(indexFile, { force: true });
  const realIndex = path.resolve(root, git(root, ['rev-parse', '--git-path', 'index']).trim());
  if (fs.existsSync(realIndex)) {
    fs.copyFileSync(realIndex, indexFile);
    // assume-unchanged (lower-case tag) and skip-worktree (S) entries would hide work-tree edits: start empty.
    const flagged = git(root, ['ls-files', '-v', '-z'], indexFile).split('\0').some((entry) => /^[a-zS]/.test(entry));
    if (flagged) fs.rmSync(indexFile, { force: true });
    else git(root, ['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', '.nmg-sdlc'], indexFile);
  }
  git(root, ['add', '-A', ...worktreePathspec(root)], indexFile);
  return git(root, ['write-tree'], indexFile).trim();
}

/** Returns every non-ignored path to `tree`, deleting non-ignored paths absent from it, and rewrites only the
 * paths that differ from it. HEAD, refs and the real index are never changed. */
export function restore(root, tree, batchId) {
  const rootAbs = path.resolve(root);
  const indexFile = stateFile(root, `index-${batchId}`);
  const intact = fs.existsSync(indexFile)
    && git(root, ['write-tree'], indexFile, { allowFailure: true }).trim() === tree;
  if (intact) {
    // The snapshot index still holds `tree` with its stat data: check out only the paths changed since begin.
    // Scoped and relative to the project root, which may sit below the work-tree top: checkout-index resolves
    // paths against cwd, and paths outside the root (the user's own edits) are never touched.
    git(root, ['update-index', '-q', '--refresh'], indexFile, { allowFailure: true });
    const changed = git(root, ['diff-files', '--name-only', '-z', '--relative', '--', '.'], indexFile);
    if (changed) git(root, ['checkout-index', '-f', '-z', '--stdin'], indexFile, { input: changed });
  } else {
    git(root, ['read-tree', tree], indexFile);
    git(root, ['checkout-index', '-a', '-f'], indexFile);
  }
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
  return {
    testCount: tests.length,
    lines: rangeCount('lines', union.lines),
    branches: rangeCount('branches', union.branches),
    outcomes: rangeCount('outcomes', union.outcomes),
  };
}

function preconditions(root) {
  let layers;
  try {
    const recorded = loadTestLayers(root);
    if (recorded.missing) return { refusal: { reasonCode: 'kept_types_unrecorded', path: TEST_LAYERS_PATH } };
    layers = recorded.config;
  } catch (error) {
    return { refusal: { reasonCode: 'test_layers_invalid', path: TEST_LAYERS_PATH, key: error.key, message: error.message } };
  }
  const gap = coverageGap(root);
  if (gap) return { refusal: gap };
  try {
    // A declared-glob conflict is reported here, before any suite or coverage run.
    inventoryTestFiles(root, layers);
  } catch (error) {
    return { refusal: { reasonCode: 'test_layers_invalid', path: TEST_LAYERS_PATH, key: error.key, message: error.message } };
  }
  return { kept: layers.kept, layers, config: loadTestCoverageConfig(root).config };
}

function measure(root, config, layers) {
  const suite = runCommand(root, config.suite);
  if (suite.status !== 0) return { suite, error: { reasonCode: 'test_layers_suite_failed', suiteStatus: suite.status } };
  const coverage = collectCoverage(root, config, layers);
  return { suite, ...coverage };
}

function batchRecordNames(root) {
  const dir = stateFile(root, 'batches');
  return (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((name) => name.endsWith('.json')).sort();
}

// File → batch id from the previous candidates and every begun or refused batch record, plus every id already
// spent. An accepted batch's id is retired: a file it leaves with candidate tests is listed again under a new id,
// so the accepted record is kept and the remaining tests can still be migrated.
function priorBatchIds(root) {
  const ids = new Map();
  const used = new Set();
  const accepted = new Set();
  const records = batchRecordNames(root).map((name) => readState(root, 'batches', name)).filter(Boolean);
  for (const record of records) {
    const id = typeof record.batch === 'string' ? record.batch : record.batch?.id;
    if (!BATCH_ID_RE.test(id ?? '')) continue;
    used.add(id);
    if (record.status === 'accepted') accepted.add(id);
  }
  const remember = (file, id) => {
    if (typeof file === 'string' && BATCH_ID_RE.test(id ?? '') && !accepted.has(id) && !ids.has(file)) ids.set(file, id);
  };
  for (const record of records) {
    remember(record.file ?? record.batch?.file, typeof record.batch === 'string' ? record.batch : record.batch?.id);
  }
  for (const batch of readState(root, 'candidates.json')?.batches ?? []) {
    if (BATCH_ID_RE.test(batch.id ?? '')) used.add(batch.id);
    remember(batch.file, batch.id);
  }
  return { ids, used: [...used] };
}

/** Runs the suite and coverage, records the baseline on the first run only, and returns the migration batches.
 * Reruns keep the original baseline and each file's batch id, so earlier batch records are never overwritten. */
export function testLayersCandidates(root) {
  const pre = preconditions(root);
  if (pre.refusal) return { ok: true, batches: [], unmatched: [], refused: [pre.refusal] };
  const measured = measure(root, pre.config, pre.layers);
  if (measured.error) return { ok: false, ...measured.error };
  const inventory = inventoryTestFiles(root, pre.layers);
  const prior = priorBatchIds(root);
  const { batches, unmatched } = computeCandidates(inventory, pre.kept, measured.tests, prior.ids, prior.used);
  let baseline = readState(root, 'baseline.json')?.before;
  if (!baseline) {
    baseline = { ...counts(measured.tests), wallMs: measured.suite.wallMs };
    writeState(root, ['baseline.json'], { version: 1, kept: pre.kept, before: baseline });
  }
  writeState(root, ['candidates.json'], { version: 1, kept: pre.kept, batches, unmatched });
  return { ok: true, kept: pre.kept, batches, unmatched, baseline };
}

function loadBatch(root, batchId) {
  const candidates = readState(root, 'candidates.json');
  return candidates?.batches?.find((batch) => batch.id === batchId) ?? null;
}

/** Snapshots the pre-batch tree and records the pre-batch coverage. A batch that is begun and not yet gated, or
 * already accepted, is refused so its recorded pre-batch snapshot is never replaced by an edited tree. */
export function beginTestLayersBatch(root, batchId) {
  const pre = preconditions(root);
  if (pre.refusal) return { ok: false, batch: batchId, ...pre.refusal };
  const batch = loadBatch(root, batchId);
  if (!batch) return { ok: false, batch: batchId, reasonCode: 'test_layers_batch_unknown' };
  if (readState(root, 'batches', `${batchId}.begin.json`)) {
    return { ok: false, batch: batchId, reasonCode: 'test_layers_batch_already_begun' };
  }
  if (readState(root, 'batches', `${batchId}.json`)?.status === 'accepted') {
    return { ok: false, batch: batchId, reasonCode: 'test_layers_batch_already_accepted' };
  }
  let tree;
  try {
    tree = snapshot(root, batchId);
  } catch (error) {
    return { ok: false, batch: batchId, reasonCode: error.reasonCode ?? 'test_layers_snapshot_failed', message: error.message };
  }
  const coverage = collectCoverage(root, pre.config, pre.layers);
  if (coverage.error) return { ok: false, batch: batchId, ...coverage.error };
  writeBeginTests(root, batchId, coverage.tests);
  // The record keeps the batch's identity only: its candidate test list grows with the suite.
  writeState(root, ['batches', `${batchId}.begin.json`], {
    version: 2,
    batch: { id: batch.id, file: batch.file, type: batch.type, feature: batch.feature },
    tree,
    testsFile: beginTestsName(batchId),
  });
  return { ok: true, batch: batchId, status: 'begun', file: batch.file, tests: batch.tests };
}

/** The sidecar of a begun batch: its pre-batch tests, one compact test per line. */
function beginTestsName(batchId) {
  return `${batchId}.begin.tests.ndjson`;
}

/** Writes the begun tests one line per `fs.writeSync`, so no string holds the whole pre-batch coverage. */
function writeBeginTests(root, batchId, tests) {
  const target = stateFile(root, 'batches', beginTestsName(batchId));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const fd = fs.openSync(target, 'w');
  try {
    for (const test of tests) {
      const line = Buffer.from(`${JSON.stringify(test)}\n`);
      for (let offset = 0; offset < line.length;) offset += fs.writeSync(fd, line, offset, line.length - offset);
    }
  } finally {
    fs.closeSync(fd);
  }
}

/** The pre-batch tests of a begun batch, read back from the sidecar; a version 1 record keeps its inline tests, which
 * are converted from the v1 entry form. */
function beginTests(root, batchId, begun) {
  if (begun.version === 1) return (begun.tests ?? []).map((test) => ({ ...compactTest(test), type: test.type }));
  const tests = [];
  forEachLine(stateFile(root, 'batches', beginTestsName(batchId)), (text) => {
    if (text.trim() !== '') tests.push(JSON.parse(text));
  });
  return tests;
}

/** Runs the suite and coverage after the batch's edits, gates them, and restores the snapshot on any refusal,
 * including a steering precondition that no longer holds. Gating ends the batch: its begin record is removed. */
export function gateTestLayersBatch(root, batchId) {
  const begun = readState(root, 'batches', `${batchId}.begin.json`);
  if (!begun) return { ok: false, batch: batchId, reasonCode: 'test_layers_batch_not_begun' };
  const pre = preconditions(root);
  let decision;
  if (pre.refusal) {
    decision = { status: 'refused', ...pre.refusal };
  } else {
    const before = { tests: beginTests(root, batchId, begun) };
    const suite = runCommand(root, pre.config.suite);
    const after = suite.status === 0 ? collectCoverage(root, pre.config, pre.layers) : { tests: [] };
    decision = gateBatch(before, after, suite, begun.batch, pre.kept);
  }
  if (decision.status === 'refused') restore(root, begun.tree, batchId);
  const record = { batch: batchId, file: begun.batch.file, ...decision };
  writeState(root, ['batches', `${batchId}.json`], { version: 1, ...record });
  fs.rmSync(stateFile(root, `index-${batchId}`), { force: true });
  fs.rmSync(stateFile(root, 'batches', `${batchId}.begin.json`), { force: true });
  fs.rmSync(stateFile(root, 'batches', beginTestsName(batchId)), { force: true });
  return { ok: decision.status === 'accepted', ...record };
}

/** Before/after counts, wall time and coverage, accepted evidence and refused gaps. */
export function testLayersReport(root) {
  const pre = preconditions(root);
  if (pre.refusal) return { ok: false, ...pre.refusal };
  const baseline = readState(root, 'baseline.json');
  if (!baseline?.before) return { ok: false, reasonCode: 'test_layers_baseline_missing', path: `${TEST_LAYERS_STATE_DIR}/baseline.json` };
  const measured = measure(root, pre.config, pre.layers);
  if (measured.error) return { ok: false, ...measured.error };
  const after = { ...counts(measured.tests), wallMs: measured.suite.wallMs };
  const records = batchRecordNames(root)
    .filter((name) => !name.endsWith('.begin.json'))
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
