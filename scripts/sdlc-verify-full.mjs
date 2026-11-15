#!/usr/bin/env node

/** Full-tier verification, run on demand against a named ref (for example from a schedule) rather than before every
 * merge. `run` checks the ref out in a temporary worktree, runs the `full` validations there and records the result
 * for that commit; a failure lists the commits merged since the last green full run. `check` answers whether a
 * commit has a passed full record at or after it, for a downstream action steering lists in `fullGreen.actions`. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readManifestOptions } from '../src/sdlc-steering-runtime.mjs';
import { runSteeringValidations } from '../src/sdlc-verification-runtime.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import { gitCommonDir } from './sdlc-shared-state.mjs';
import { runWorktreeCommand } from './sdlc-worktree.mjs';

const USAGE = [
  'Usage: node scripts/sdlc-verify-full.mjs run [--ref REF] [--project DIR]',
  '       node scripts/sdlc-verify-full.mjs check --action NAME --commit REF [--project DIR]',
].join('\n');
const SHA = /^[0-9a-f]{40}$/;
export const FULL_RECORDS_ENV = 'NMG_SDLC_FULL_RECORDS_DIR';

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}
function ok(result) { return result && !result.error && result.status === 0; }
function fail(reasonCode, detail = '') {
  return Object.assign(new Error(detail ? `${reasonCode}: ${detail}` : reasonCode), { reasonCode });
}

/** Where full-run records live: `NMG_SDLC_FULL_RECORDS_DIR`, or `<git-common-dir>/nmg-sdlc/full-verification`. */
export function fullRecordsDir(projectRoot, { run = defaultRun, env = process.env } = {}) {
  const override = env?.[FULL_RECORDS_ENV];
  const dir = typeof override === 'string' && override.trim() ? resolve(override)
    : join(gitCommonDir(projectRoot, run), 'nmg-sdlc', 'full-verification');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readRecord(path) {
  try {
    const record = JSON.parse(readFileSync(path, 'utf8'));
    return record?.schemaVersion === 1 && SHA.test(record.commit ?? '') && ['passed', 'failed', 'incomplete'].includes(record.status)
      ? record : null;
  } catch { return null; }
}

/** Every recorded full run, in no particular order. */
export function listFullRecords(projectRoot, options = {}) {
  const dir = fullRecordsDir(projectRoot, options);
  let names = [];
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter((name) => /^[0-9a-f]{40}\.json$/.test(name)).map((name) => readRecord(join(dir, name))).filter(Boolean);
}

function resolveCommit(projectRoot, ref, run) {
  for (const candidate of [ref, `origin/${ref}`]) {
    const response = run('git', ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], { cwd: projectRoot });
    const sha = String(response?.stdout ?? '').trim();
    if (ok(response) && SHA.test(sha)) return sha;
  }
  throw fail('ref_unresolved', ref);
}
function isAncestor(projectRoot, ancestor, descendant, run) {
  return ancestor === descendant || ok(run('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: projectRoot }));
}

/** The nearest green full record that is an ancestor of `commit`, and the first-parent commits merged since it. */
export function commitsSinceLastGreen(projectRoot, commit, { run = defaultRun, env = process.env } = {}) {
  let nearest = null;
  for (const record of listFullRecords(projectRoot, { run, env })) {
    if (record.status !== 'passed' || record.commit === commit || !isAncestor(projectRoot, record.commit, commit, run)) continue;
    const count = Number(String(run('git', ['rev-list', '--count', `${record.commit}..${commit}`], { cwd: projectRoot })?.stdout ?? '').trim());
    if (Number.isSafeInteger(count) && (nearest === null || count < nearest.count)) nearest = { record, count };
  }
  if (!nearest) return null;
  const log = run('git', ['log', '--first-parent', '--format=%H%x09%s', `${nearest.record.commit}..${commit}`], { cwd: projectRoot });
  const commits = String(log?.stdout ?? '').split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, ...subject] = line.split('\t');
    return { sha, subject: subject.join('\t') };
  });
  return { lastGreen: nearest.record.commit, commits };
}

/** Runs the full tier at `ref` and records the result for its commit. Returns `{ ok, commit, status, ... }`. */
export async function runFullVerification({ projectRoot = process.cwd(), ref, run = defaultRun, env = process.env,
  signal, validate = runSteeringValidations, now = () => new Date() } = {}) {
  const root = resolve(projectRoot);
  const named = typeof ref === 'string' && ref ? ref : defaultRef(root, run);
  const commit = resolveCommit(root, named, run);
  const checkout = mkdtempSync(join(tmpdir(), 'nmg-sdlc-full-'));
  rmSync(checkout, { recursive: true, force: true });
  if (!ok(run('git', ['worktree', 'add', '--detach', '--quiet', checkout, commit], { cwd: root }))) throw fail('full_checkout_failed', commit);
  let artifact;
  let setup;
  try {
    setup = runWorktreeCommand('setup', checkout, { run, env });
    if (!setup.ok) throw fail('worktree_setup_failed', setup.summary);
    artifact = await validate({ projectRoot: checkout, tier: 'full', signal });
  } finally {
    runWorktreeCommand('teardown', checkout, { run, env });
    if (!ok(run('git', ['worktree', 'remove', '--force', checkout], { cwd: root }))) rmSync(checkout, { recursive: true, force: true });
    run('git', ['worktree', 'prune'], { cwd: root });
  }
  const ran = artifact.results.filter((result) => result.applicable);
  const failing = ran.filter((result) => result.required && result.effectiveStatus !== 'passed');
  const status = artifact.ceiling === null ? 'passed' : artifact.ceiling === 'Fail' ? 'failed' : 'incomplete';
  const since = status === 'passed' ? null : commitsSinceLastGreen(root, commit, { run, env });
  const record = {
    schemaVersion: 1, commit, ref: named, status, generatedAt: now().toISOString(),
    ...(artifact.runtimeError ? { runtimeError: artifact.runtimeError } : {}),
    results: ran.map((result) => ({ id: result.id, required: result.required, status: result.effectiveStatus,
      summary: String(result.result?.summary ?? '').slice(0, 2000), tier: result.tier ?? null, ...(result.heavy ? { heavy: result.heavy } : {}) })),
    ...(status === 'passed' ? {} : { lastGreen: since?.lastGreen ?? null, sinceLastGreen: since?.commits ?? null,
      ...(since ? {} : { reason: 'no_green_record' }) }),
  };
  const dir = fullRecordsDir(root, { run, env });
  const path = join(dir, `${commit}.json`);
  writeFileSync(`${path}.${process.pid}.tmp`, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(`${path}.${process.pid}.tmp`, path);
  return {
    ok: status === 'passed', commit, ref: named, status, record: path, validations: record.results.length,
    failing: failing.map((result) => ({ id: result.id, status: result.effectiveStatus, summary: String(result.result?.summary ?? '').slice(0, 500) })),
    ...(artifact.runtimeError ? { runtimeError: artifact.runtimeError } : {}),
    ...(status === 'passed' ? {} : { lastGreen: record.lastGreen, sinceLastGreen: record.sinceLastGreen,
      ...(record.reason ? { reason: record.reason } : {}) }),
  };
}

/** The ref a run verifies when none is named: the remote default branch. */
function defaultRef(projectRoot, run) {
  const head = run('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: projectRoot });
  const name = ok(head) ? String(head.stdout ?? '').trim() : '';
  if (name) return name;
  const viewed = run('gh', ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'], { cwd: projectRoot });
  const branch = ok(viewed) ? String(viewed.stdout ?? '').trim() : '';
  if (!branch) throw fail('ref_unresolved', 'the default branch');
  return `origin/${branch}`;
}

/**
 * Whether `commit` is full-green for `action`: a passed full record exists for it or for a descendant of it.
 * An action that steering does not list in `fullGreen.actions` throws `full_green_action_unknown`.
 */
export function checkFullGreen({ projectRoot = process.cwd(), commit: ref, action, run = defaultRun, env = process.env } = {}) {
  const root = resolve(projectRoot);
  if (!readManifestOptions(root).fullGreenActions.includes(action)) throw fail('full_green_action_unknown', String(action));
  const commit = resolveCommit(root, ref, run);
  const covering = listFullRecords(root, { run, env })
    .filter((record) => record.status === 'passed' && isAncestor(root, commit, record.commit, run))
    .sort((left, right) => String(right.generatedAt).localeCompare(String(left.generatedAt)))[0] ?? null;
  return { action, commit, green: covering !== null,
    record: covering ? { commit: covering.commit, ref: covering.ref, generatedAt: covering.generatedAt } : null };
}

export function parseVerifyFullCli(argv) {
  const [sub, ...rest] = argv;
  if (!['run', 'check'].includes(sub)) throw new Error(USAGE);
  const allowed = sub === 'run' ? ['ref', 'project'] : ['commit', 'action', 'project'];
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index]?.startsWith('--') ? rest[index].slice(2) : null;
    if (!allowed.includes(name) || rest[index + 1] === undefined || Object.hasOwn(options, name)) throw new Error(USAGE);
    options[name] = rest[index + 1];
  }
  if (sub === 'check' && (!options.commit || !options.action)) throw new Error(USAGE);
  return { command: sub, ...options };
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseVerifyFullCli(argv); } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  const projectRoot = resolve(options.project ?? process.cwd());
  try {
    if (options.command === 'check') {
      const answer = checkFullGreen({ projectRoot, commit: options.commit, action: options.action });
      process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
      process.exitCode = answer.green ? 0 : 1;
      return;
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    const result = await runFullVerification({ projectRoot, ref: options.ref, signal: controller.signal });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, reasonCode: error.reasonCode ?? 'full_verification_failed', summary: error.message }, null, 2)}\n`);
    process.exitCode = error.reasonCode === 'full_green_action_unknown' ? 2 : 1;
  }
}
if (isCliEntry(import.meta.url)) main();
