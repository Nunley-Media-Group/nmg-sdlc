/**
 * verification-scope.mjs
 * The /sdlc-onboard-project and /sdlc-upgrade-project `verification-scope` item: a digest-bound detector for the
 * scoped pre-merge gate's configuration (top-level `selection`, `selection: true` opt-ins, `surfaces` and
 * steering/test-coverage.json) and the approved apply of a proposal for it.
 *
 * Detection is read-only and reads steering/manifest.json as raw JSON, so a manifest the runtime would reject (a
 * legacy command `selection`) is still reported. `unaccounted_paths` lists every tracked or untracked, non-ignored
 * path outside `.nmg-sdlc/` that no glob accounts for, even while `selection` or `surfaces` is missing, so a first
 * proposal sees every path; the list is capped at UNACCOUNTED_LIST_LIMIT with the full count in `unaccountedCount`.
 * Apply refuses a stale digest before any write, re-validates with the steering runtime and restores the original
 * bytes on any failure, including a proposal whose new files (steering/test-coverage.json, a coverage wrapper)
 * leave a path unaccounted.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { matches } from '../src/sdlc-glob.mjs';
import { loadSteeringRuntime } from '../src/sdlc-steering-runtime.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import { TEST_COVERAGE_PATH, loadTestCoverageConfig } from './test-coverage.mjs';

export const MANIFEST_PATH = 'steering/manifest.json';
export const PLUGIN_MANIFEST_PATH = '.claude-plugin/plugin.json';
export const VERIFICATION_SCOPE_FINDINGS = Object.freeze([
  'selection_missing',
  'doc_paths_missing',
  'selection_command_legacy',
  'test_coverage_missing',
  'test_coverage_invalid',
  'surfaces_missing',
  'unaccounted_paths',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function abs(root, rel) {
  return path.join(path.resolve(root), ...rel.split('/'));
}

/** The file's bytes, or null when it is absent (or not a regular file). */
function readBytes(root, rel) {
  try {
    const target = abs(root, rel);
    const stat = fs.lstatSync(target);
    return stat.isFile() && !stat.isSymbolicLink() ? fs.readFileSync(target) : null;
  } catch {
    return null;
  }
}

/** At most this many unaccounted paths are listed; `unaccountedCount` gives the full count. */
export const UNACCOUNTED_LIST_LIMIT = 200;

/**
 * Sorted `git ls-files` paths: the tracked ones, or with `untracked` also the untracked, non-ignored ones outside
 * the runtime `.nmg-sdlc/` directory. Empty when the root is not a git work tree.
 */
function projectPaths(root, { untracked = false } = {}) {
  const args = ['-c', 'core.quotePath=false', 'ls-files', '-z', ...(untracked ? ['--cached', '--others', '--exclude-standard'] : [])];
  const result = spawnSync('git', args, {
    cwd: path.resolve(root),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') return [];
  return [...new Set(result.stdout.split('\0').filter((rel) => rel && !rel.startsWith('.nmg-sdlc/')))].sort();
}

function coverageState(root) {
  try {
    return loadTestCoverageConfig(root).missing ? 'missing' : 'present';
  } catch {
    return 'invalid';
  }
}

function digestOf(manifestBytes, coverageBytes, tracked) {
  const hash = createHash('sha256');
  for (const [rel, bytes] of [[MANIFEST_PATH, manifestBytes], [TEST_COVERAGE_PATH, coverageBytes]]) {
    hash.update(bytes === null ? `${rel}\0absent\0` : `${rel}\0${sha256(bytes)}\0`);
  }
  for (const rel of tracked) hash.update(`${rel}\n`);
  return hash.digest('hex');
}

function globsOf(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

/**
 * The digest-bound `verification-scope:<sha256>` item, or null when the project has no steering manifest (or an
 * unparseable one, which the steering-runtime item owns) or every finding is clear.
 */
export function detectVerificationScope(root) {
  const manifestBytes = readBytes(root, MANIFEST_PATH);
  if (manifestBytes === null) return null;
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    return null;
  }
  if (!isPlainObject(manifest)) return null;
  const coverageBytes = readBytes(root, TEST_COVERAGE_PATH);
  const tracked = projectPaths(root);
  const validations = Array.isArray(manifest.validations) ? manifest.validations.filter(isPlainObject) : [];
  const selection = Object.hasOwn(manifest, 'selection') && isPlainObject(manifest.selection) ? manifest.selection : null;
  const surfaces = Array.isArray(manifest.surfaces) && manifest.surfaces.length > 0 ? manifest.surfaces : null;
  const commandValidations = validations.filter((v) => v.provider === 'builtin.command').map((v) => v.id);
  const legacySelections = validations.filter((v) => isPlainObject(v.selection)).map((v) => v.id);

  const findings = [];
  if (!selection) findings.push('selection_missing');
  else if (!Array.isArray(selection.docPaths)) findings.push('doc_paths_missing');
  if (legacySelections.length) findings.push('selection_command_legacy');
  const coverageConfig = coverageState(root);
  if (commandValidations.length && coverageConfig !== 'present') findings.push(`test_coverage_${coverageConfig}`);
  if (!surfaces) findings.push('surfaces_missing');
  // Listed whatever else is missing, so a first proposal sees every path it must account for. Untracked files count
  // too, so a file an apply writes (steering/test-coverage.json, a coverage wrapper) must be accounted for.
  const globs = [
    ...globsOf(selection?.coveragePaths),
    ...(surfaces ?? []).flatMap((surface) => globsOf(surface?.sources)),
    ...globsOf(selection?.docPaths),
    ...globsOf(selection?.fallbackPaths),
  ];
  const unaccounted = projectPaths(root, { untracked: true }).filter((rel) => !matches(rel, globs));
  if (unaccounted.length) findings.push('unaccounted_paths');
  if (!findings.length) return null;

  const digest = digestOf(manifestBytes, coverageBytes, tracked);
  const pluginProject = readBytes(root, PLUGIN_MANIFEST_PATH) !== null;
  return {
    id: `verification-scope:${digest}`,
    kind: 'verification-scope',
    description: `Configure scoped pre-merge verification in ${MANIFEST_PATH} (findings: ${findings.join(', ')}): `
      + `derive the top-level selection, a surface map from the ${pluginProject ? "plugin's commands, agents and hooks" : "project's features, entry points and non-code assets"}`
      + `, the selection: true opt-ins and a per-test coverage command in ${TEST_COVERAGE_PATH}.`,
    rel: MANIFEST_PATH,
    actionable: true,
    findings,
    unaccountedPaths: unaccounted.slice(0, UNACCOUNTED_LIST_LIMIT),
    unaccountedCount: unaccounted.length,
    pluginProject,
    commandValidations,
    legacySelections,
    coverageConfig,
    digest,
  };
}

function failure(reasonCode, message, extra = {}) {
  return { ok: false, reasonCode, message, ...extra };
}

/** Reads and shape-checks the proposal JSON `{ selection?, surfaces?, optIn?, testCoverage? }`. */
function readProposal(proposalPath) {
  if (typeof proposalPath !== 'string' || proposalPath.length === 0) {
    return failure('verification_scope_proposal_missing', 'an approved verification-scope item needs a proposal file');
  }
  let proposal;
  try {
    proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));
  } catch (error) {
    return failure('verification_scope_proposal_invalid', `proposal ${proposalPath} is unreadable or not JSON: ${error.message}`);
  }
  const allowed = ['selection', 'surfaces', 'optIn', 'testCoverage'];
  if (!isPlainObject(proposal) || Object.keys(proposal).some((key) => !allowed.includes(key))) {
    return failure('verification_scope_proposal_invalid', `proposal must be an object with only ${allowed.join(', ')}`);
  }
  if (Object.hasOwn(proposal, 'selection') && !isPlainObject(proposal.selection)) {
    return failure('verification_scope_proposal_invalid', 'proposal.selection must be an object');
  }
  if (Object.hasOwn(proposal, 'surfaces') && !Array.isArray(proposal.surfaces)) {
    return failure('verification_scope_proposal_invalid', 'proposal.surfaces must be an array');
  }
  const optIn = proposal.optIn ?? [];
  if (!Array.isArray(optIn) || !optIn.every((id) => typeof id === 'string' && id)) {
    return failure('verification_scope_proposal_invalid', 'proposal.optIn must be an array of validation ids');
  }
  if (Object.hasOwn(proposal, 'testCoverage') && !isPlainObject(proposal.testCoverage)) {
    return failure('verification_scope_proposal_invalid', 'proposal.testCoverage must be an object');
  }
  return { ok: true, proposal: { ...proposal, optIn } };
}

/**
 * Whether `rel` is absent or a regular file under real directories: a symlink, at the target or at any directory
 * between the root and it, or any other entry is never written through.
 */
function writableTarget(root, rel) {
  const segments = rel.split('/');
  for (let depth = 1; depth < segments.length; depth += 1) {
    try {
      const stat = fs.lstatSync(abs(root, segments.slice(0, depth).join('/')));
      if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
    } catch (error) {
      return error?.code === 'ENOENT';
    }
  }
  try {
    const stat = fs.lstatSync(abs(root, rel));
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    return error?.code === 'ENOENT';
  }
}

/** Writes through a temporary sibling and a rename, so the target entry itself is replaced, never followed. */
function writeAtomic(root, rel, data) {
  const target = abs(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, data, { flag: 'wx' });
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function restore(root, rel, bytes) {
  if (bytes === null) fs.rmSync(abs(root, rel), { force: true });
  else writeAtomic(root, rel, bytes);
}

/**
 * Applies an approved proposal. Returns `{ ok: true, id, status: 'applied', updated }` or
 * `{ ok: false, reasonCode, message }`; a stale digest (`verification_scope_plan_stale`) and an invalid proposal fail
 * before any write, and a result the steering runtime or the test-coverage loader rejects, or one that detection
 * would still report (`verification_scope_proposal_incomplete`), restores the original bytes.
 */
export async function applyVerificationScope(root, item, proposalPath) {
  const id = typeof item === 'string' ? item : item?.id;
  const live = detectVerificationScope(root);
  if (!live || typeof id !== 'string' || live.id !== id) {
    return failure('verification_scope_plan_stale', 'steering/manifest.json, steering/test-coverage.json or the tracked files changed after plan approval', {
      approved: id ?? null,
      live: live?.id ?? null,
    });
  }
  const read = readProposal(proposalPath);
  if (!read.ok) return read;
  const { proposal } = read;
  const targets = [MANIFEST_PATH, ...(Object.hasOwn(proposal, 'testCoverage') ? [TEST_COVERAGE_PATH] : [])];
  const unsafe = targets.filter((rel) => !writableTarget(root, rel));
  if (unsafe.length) {
    return failure('verification_scope_target_invalid', `not a regular file: ${unsafe.join(', ')}`);
  }
  const manifestBytes = readBytes(root, MANIFEST_PATH);
  const coverageBytes = readBytes(root, TEST_COVERAGE_PATH);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const validations = Array.isArray(manifest.validations) ? manifest.validations : [];
  const unknown = proposal.optIn.filter((optId) => !validations.some((v) => isPlainObject(v) && v.id === optId));
  if (unknown.length) {
    return failure('verification_scope_proposal_invalid', `proposal.optIn names unknown validations: ${unknown.join(', ')}`);
  }

  for (const validation of validations) {
    if (!isPlainObject(validation) || !proposal.optIn.includes(validation.id)) continue;
    validation.selection = true; // replaces a legacy command in place, keeping key order
    if (!Object.hasOwn(validation, 'tier')) validation.tier = 'change';
  }
  if (Object.hasOwn(proposal, 'selection')) manifest.selection = proposal.selection;
  if (Object.hasOwn(proposal, 'surfaces')) manifest.surfaces = proposal.surfaces;
  const updated = [MANIFEST_PATH];
  try {
    writeAtomic(root, MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    if (Object.hasOwn(proposal, 'testCoverage')) {
      writeAtomic(root, TEST_COVERAGE_PATH, `${JSON.stringify(proposal.testCoverage, null, 2)}\n`);
      updated.push(TEST_COVERAGE_PATH);
    }
    await loadSteeringRuntime(root);
    if (Object.hasOwn(proposal, 'testCoverage')) loadTestCoverageConfig(root);
  } catch (error) {
    for (const rel of updated) restore(root, rel, rel === MANIFEST_PATH ? manifestBytes : coverageBytes);
    return failure('verification_scope_apply_invalid', String(error?.message ?? error), {
      cause: error?.reasonCode ?? error?.code ?? null,
      restored: updated,
    });
  }
  // An applied proposal leaves nothing to propose, so a repeat detection returns no item.
  const remaining = detectVerificationScope(root);
  if (remaining) {
    for (const rel of updated) restore(root, rel, rel === MANIFEST_PATH ? manifestBytes : coverageBytes);
    return failure('verification_scope_proposal_incomplete', `the proposal leaves findings: ${remaining.findings.join(', ')}`, {
      remainingFindings: remaining.findings,
      unaccountedPaths: remaining.unaccountedPaths,
      unaccountedCount: remaining.unaccountedCount,
      restored: updated,
    });
  }
  return { ok: true, id, status: 'applied', updated, remainingFindings: [] };
}

function cliError(message) {
  const error = new Error(message);
  error.reasonCode = 'verification_scope_cli_invalid';
  return error;
}

/** Parses `detect --root <dir>` or `apply --root <dir> --approve <id> --proposal <file>`; throws on bad arguments. */
export function parseVerificationScopeCli(tokens) {
  const [command, ...rest] = tokens;
  if (command !== 'detect' && command !== 'apply') throw cliError(`unknown verification-scope command: ${command ?? '(none)'}`);
  const args = { command, root: process.cwd(), approve: null, proposal: null };
  const keys = { '--root': 'root', '-r': 'root', '--approve': 'approve', '-a': 'approve', '--proposal': 'proposal' };
  const allowed = command === 'detect' ? new Set(['root']) : new Set(['root', 'approve', 'proposal']);
  const seen = new Set();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const match = /^(--root|--approve|--proposal)=(.*)$/.exec(token);
    const key = match ? keys[match[1]] : keys[token];
    if (!key || !allowed.has(key)) throw cliError(`unexpected argument: ${token}`);
    const value = match ? match[2] : rest[++index];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('-')) throw cliError(`--${key} requires a value`);
    if (seen.has(key)) throw cliError(`--${key} may occur only once`);
    seen.add(key);
    args[key] = value;
  }
  if (command === 'apply' && (!args.approve || !args.approve.startsWith('verification-scope:'))) {
    throw cliError('apply requires --approve verification-scope:<sha256>');
  }
  if (command === 'apply' && !args.proposal) throw cliError('apply requires --proposal <file>');
  return args;
}

/** Runs one subcommand: `{ exitCode, output }` (0 on ok:true, 1 on failure, 2 on bad arguments). */
export async function runVerificationScopeCli(tokens) {
  let args;
  try {
    args = parseVerificationScopeCli(tokens);
  } catch (error) {
    return { exitCode: 2, output: { ok: false, reasonCode: error.reasonCode, message: error.message } };
  }
  let output;
  try {
    output = args.command === 'detect'
      ? { ok: true, item: detectVerificationScope(args.root) }
      : await applyVerificationScope(args.root, args.approve, path.resolve(args.proposal));
  } catch (error) {
    output = failure(error?.reasonCode ?? 'verification_scope_failed', String(error?.message ?? error));
  }
  return { exitCode: output.ok ? 0 : 1, output };
}

if (isCliEntry(import.meta.url)) {
  const { exitCode, output } = await runVerificationScopeCli(process.argv.slice(2));
  console.log(JSON.stringify(output, null, 2));
  process.exit(exitCode);
}
