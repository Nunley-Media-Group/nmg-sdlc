#!/usr/bin/env node

/** Per-issue and per-spec git worktrees. Every `/sdlc-execute #N` and `/sdlc-write-spec #N` run works in its own
 * worktree created from the remote default branch, so the primary checkout is never switched and need not be clean.
 * Worktrees live beside the primary checkout in `<primary-parent>/<repo-name>-wt/` (or `NMG_SDLC_WORKTREES_DIR`):
 * `<N>` for issue N's code branch and `spec-<N>` for its spec branch. Names carry no slug, which keeps paths short. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readManifestOptions } from '../src/sdlc-steering-runtime.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';

export const WORKTREES_DIR_ENV = 'NMG_SDLC_WORKTREES_DIR';
const SAFE_ENV = ['HOME', 'PATH', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'CI', 'USERPROFILE', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA'];
const RECORD = join('.nmg-sdlc', 'worktree.json');
/** The branch namespace of spec work, so a spec branch never shares a name or pull request with the code branch `{N}-{slug}`. */
export const SPEC_BRANCH_PREFIX = 'spec/';
const SPEC_SETUP_SKIPPED = Object.freeze({ ran: false, ok: true, summary: 'spec worktree: setup not run' });

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}
function ok(result) { return result && !result.error && (result.status ?? 0) === 0; }
function fail(reasonCode, detail = '') {
  return Object.assign(new Error(detail ? `${reasonCode}: ${detail}` : reasonCode), { reasonCode });
}
function canonical(path) {
  try { return realpathSync(path); } catch { return resolve(path); }
}

/** The spec-namespace branch for an issue's code branch name: `spec/{N}-{slug}`. */
export function specBranchName(codeBranch) {
  return `${SPEC_BRANCH_PREFIX}${codeBranch}`;
}

/** Every worktree of the repository, primary first: `{ path, head, branch, detached, primary }` (branch without `refs/heads/`). */
export function listWorktrees(cwd, run = defaultRun) {
  const response = run('git', ['worktree', 'list', '--porcelain'], { cwd });
  if (!ok(response)) throw fail('worktree_list_unreadable');
  const worktrees = [];
  for (const block of String(response.stdout ?? '').split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const path = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length);
    if (!path) continue;
    const branch = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length) ?? null;
    worktrees.push({
      path: canonical(path),
      head: lines.find((line) => line.startsWith('HEAD '))?.slice('HEAD '.length) ?? null,
      branch: branch?.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : branch,
      detached: lines.includes('detached'),
      primary: worktrees.length === 0,
    });
  }
  if (!worktrees.length) throw fail('worktree_list_unreadable');
  return worktrees;
}

/** The primary checkout's path: the first worktree Git lists. */
export function primaryCheckout(cwd, run = defaultRun) {
  return listWorktrees(cwd, run)[0].path;
}

/** Whether `cwd` is a linked worktree rather than the primary checkout. */
export function isLinkedWorktree(cwd, run = defaultRun) {
  const top = run('git', ['rev-parse', '--show-toplevel'], { cwd });
  return ok(top) && canonical(String(top.stdout).trim()) !== primaryCheckout(cwd, run);
}

/** The directory that holds this repository's worktrees. */
export function worktreesRoot(cwd, { run = defaultRun, env = process.env } = {}) {
  const override = env?.[WORKTREES_DIR_ENV];
  if (typeof override === 'string' && override.trim()) return resolve(override);
  return `${primaryCheckout(cwd, run)}-wt`;
}

/** The directory name of a branch's worktree: `<N>` for `{N}-{slug}`, `spec-<N>` for `spec/{N}-{slug}`. */
export function worktreeDirName(branch) {
  const spec = branch.startsWith(SPEC_BRANCH_PREFIX);
  const issue = /^(\d+)-/.exec(spec ? branch.slice(SPEC_BRANCH_PREFIX.length) : branch)?.[1];
  return issue ? `${spec ? 'spec-' : ''}${issue}` : branch.replaceAll('/', '-');
}

/** The worktree checked out on `branch`, or on the first branch `match` accepts; null when there is none. */
export function findWorktree(cwd, match, run = defaultRun) {
  const accepts = typeof match === 'function' ? match : (branch) => branch === match;
  return listWorktrees(cwd, run).find((worktree) => worktree.branch !== null && accepts(worktree.branch)) ?? null;
}

function readRecord(path) {
  try { return JSON.parse(readFileSync(join(path, RECORD), 'utf8')); } catch { return null; }
}
function writeRecord(path, record) {
  mkdirSync(join(path, '.nmg-sdlc'), { recursive: true });
  writeFileSync(join(path, RECORD), `${JSON.stringify(record, null, 2)}\n`);
}

/** Runs the manifest's worktree `setup` or `teardown` command in `path`. `{ ran, ok, summary }`; a project that declares none runs nothing. */
export function runWorktreeCommand(kind, path, { run = defaultRun, env = process.env } = {}) {
  let command;
  try { command = readManifestOptions(path).worktree?.[kind] ?? null; } catch (error) {
    return { ran: false, ok: false, summary: error.reasonCode ?? error.message };
  }
  if (!command) return { ran: false, ok: true, summary: `no worktree ${kind} command declared` };
  const childEnv = Object.fromEntries(SAFE_ENV.filter((key) => env[key] !== undefined).map((key) => [key, env[key]]));
  for (const key of command.env ?? []) if (env[key] !== undefined) childEnv[key] = env[key];
  const response = run(command.program, command.args, { cwd: resolve(path, command.cwd || '.'), env: childEnv, shell: false });
  const text = `${command.program} ${command.args.join(' ')}`.trim();
  if (ok(response)) return { ran: true, ok: true, summary: `${text} exited 0` };
  const detail = String(response?.stderr || response?.stdout || response?.error?.message || '').trim().split(/\r?\n/).slice(-5).join(' | ');
  return { ran: true, ok: false, summary: `${text} exited ${response?.status ?? 'without a status'}${detail ? `: ${detail}` : ''}` };
}

/** A setup command in the form the record stores: its JSON text is the command's identity, so a change to any field changes it. */
function normalizedCommand({ program, args, cwd, env }) {
  return { program, args, cwd: cwd || '.', env: env ?? [] };
}

/** Runs the declared setup command in `path`; a command that ran is returned with its normalized `command`. */
function runSetup(path, { run, env }) {
  const result = runWorktreeCommand('setup', path, { run, env });
  if (!result.ran) return result;
  return { ...result, command: normalizedCommand(readManifestOptions(path).worktree.setup) };
}

/**
 * Whether a reused issue worktree whose record shows a successful setup runs the declared setup again: a command is
 * declared that no run recorded (`ran` not true, or no `command`), or one that differs from the recorded command. An
 * unreadable manifest also runs it, so `runWorktreeCommand` reports the failure.
 */
function setupRerunNeeded(record, path) {
  let declared;
  try { declared = readManifestOptions(path).worktree?.setup ?? null; } catch { return true; }
  if (!declared) return false;
  return record.setup.ran !== true || !record.setup.command
    || JSON.stringify(normalizedCommand(record.setup.command)) !== JSON.stringify(normalizedCommand(declared));
}

/**
 * Creates, or reuses, the worktree for `branch`. A new worktree starts from the remote branch when it exists,
 * otherwise from the freshly fetched remote default branch `base`; the invoking checkout is never switched. The
 * manifest's worktree setup command runs in a new issue worktree, and on reuse again when the recorded setup failed,
 * ran no command while one is now declared, or ran a different command than the one now declared. A spec worktree
 * (`spec/` branch) runs none.
 * Returns `{ path, branch, created, setup }`; throws with a `reasonCode` on failure.
 */
export function ensureWorktree({ cwd = process.cwd(), branch, base, run = defaultRun, env = process.env, now = Date.now } = {}) {
  if (typeof branch !== 'string' || !branch || typeof base !== 'string' || !base) throw fail('worktree_arguments_invalid');
  let worktree = findWorktree(cwd, branch, run);
  let created = false;
  if (!worktree) {
    const path = join(worktreesRoot(cwd, { run, env }), worktreeDirName(branch));
    if (existsSync(path)) throw fail('worktree_path_occupied', path);
    mkdirSync(dirname(path), { recursive: true });
    const baseRef = `refs/remotes/origin/${base}`;
    if (!ok(run('git', ['fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${base}:${baseRef}`], { cwd }))) {
      throw fail('default_branch_unreadable', base);
    }
    const remoteRef = `refs/remotes/origin/${branch}`;
    let add;
    if (ok(run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd }))) {
      add = run('git', ['worktree', 'add', path, branch], { cwd });
    } else if (ok(run('git', ['fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${branch}:${remoteRef}`], { cwd }))) {
      const track = ['worktree', 'add', '--track', '-b', branch, path, `origin/${branch}`];
      add = run('git', track, { cwd });
      // A single-branch clone has no fetch refspec for the branch, so Git refuses to track it until one is registered.
      const mapped = String(run('git', ['config', '--get-all', 'remote.origin.fetch'], { cwd })?.stdout ?? '').split(/\r?\n/)
        .some((refspec) => [remoteRef, 'refs/remotes/origin/*'].includes(refspec.slice(refspec.indexOf(':') + 1)));
      if (!ok(add) && !mapped && ok(run('git', ['config', '--add', 'remote.origin.fetch', `refs/heads/${branch}:${remoteRef}`], { cwd }))) {
        add = run('git', track, { cwd });
      }
    } else {
      add = run('git', ['worktree', 'add', '--no-track', '-b', branch, path, baseRef], { cwd });
    }
    if (!ok(add)) throw fail('worktree_create_failed', String(add?.stderr ?? '').trim().split(/\r?\n/).at(-1) ?? '');
    worktree = { path: canonical(path), branch };
    created = true;
  }
  const record = readRecord(worktree.path);
  let setup = record?.setup ?? null;
  // A spec worktree holds only the spec's Markdown files, so the project's setup is not run for it.
  const spec = branch.startsWith(SPEC_BRANCH_PREFIX);
  if (!setup?.ok || (!spec && setupRerunNeeded(record, worktree.path))) {
    setup = spec ? SPEC_SETUP_SKIPPED : runSetup(worktree.path, { run, env });
    writeRecord(worktree.path, { schemaVersion: 1, branch, createdAt: record?.createdAt ?? now(), setup });
    if (!setup.ok) throw fail('worktree_setup_failed', setup.summary);
  }
  return { path: worktree.path, branch, created, setup };
}

/**
 * Removes the worktree for `branch` and, with `deleteBranch`, its local branch. The teardown command runs first,
 * except for a spec worktree.
 * Never throws: returns `{ removed, lines }` where each line names a step that was skipped or failed.
 */
export function removeWorktree({ cwd = process.cwd(), branch, deleteBranch = true, run = defaultRun, env = process.env } = {}) {
  const lines = [];
  let worktree = null;
  let primary = null;
  try {
    worktree = findWorktree(cwd, branch, run);
    primary = primaryCheckout(cwd, run);
  } catch { return { removed: false, lines: ['worktree cleanup skipped: worktree_list_unreadable'] }; }
  let removed = false;
  if (worktree?.primary) return { removed: false, lines: ['worktree cleanup skipped: branch is checked out in the primary checkout'] };
  if (worktree) {
    const teardown = branch.startsWith(SPEC_BRANCH_PREFIX) ? { ran: false, ok: true } : runWorktreeCommand('teardown', worktree.path, { run, env });
    if (teardown.ran && !teardown.ok) lines.push(`worktree teardown failed: ${teardown.summary}`);
    // Git runs from the primary checkout, so a worktree is never removed from inside itself.
    removed = ok(run('git', ['worktree', 'remove', '--force', worktree.path], { cwd: primary }));
    if (!removed) lines.push(`worktree cleanup skipped: could not remove ${worktree.path}`);
  }
  if (deleteBranch && (removed || !worktree)
    && ok(run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: primary }))
    && !ok(run('git', ['branch', '-D', branch], { cwd: primary }))) lines.push(`local branch ${branch} was not deleted`);
  run('git', ['worktree', 'prune'], { cwd: primary });
  return { removed, lines, path: worktree?.path ?? null };
}

/** Best-effort fast-forward of the primary checkout when it is on the default branch. Never a failure: returns whether it moved. */
export function fastForwardPrimary({ cwd = process.cwd(), base, run = defaultRun } = {}) {
  try {
    const primary = listWorktrees(cwd, run)[0];
    if (primary.branch !== base) return false;
    const before = primary.head;
    if (!ok(run('git', ['fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${base}:refs/remotes/origin/${base}`], { cwd: primary.path }))) return false;
    if (!ok(run('git', ['merge', '--ff-only', '--quiet', `refs/remotes/origin/${base}`], { cwd: primary.path }))) return false;
    const after = run('git', ['rev-parse', 'HEAD'], { cwd: primary.path });
    return ok(after) && String(after.stdout).trim() !== before;
  } catch { return false; }
}

function defaultBranch(cwd, run) {
  const response = run('gh', ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'], { cwd });
  const name = ok(response) ? String(response.stdout ?? '').trim() : '';
  if (!name) throw fail('default_branch_unreadable');
  return name;
}

const USAGE = 'Usage: node scripts/sdlc-worktree.mjs ensure --branch B [--base BRANCH] | remove --branch B [--keep-branch] | list';

function runCli(argv = process.argv.slice(2)) {
  const [sub, ...rest] = argv;
  const option = (name) => (rest.includes(`--${name}`) ? rest[rest.indexOf(`--${name}`) + 1] : undefined);
  try {
    if (sub === 'list') {
      console.log(JSON.stringify({ ok: true, worktrees: listWorktrees(process.cwd()) }, null, 2));
    } else if (sub === 'ensure' && option('branch')) {
      const result = ensureWorktree({ branch: option('branch'), base: option('base') ?? defaultBranch(process.cwd(), defaultRun) });
      console.log(JSON.stringify({ ok: true, ...result }));
    } else if (sub === 'remove' && option('branch')) {
      const result = removeWorktree({ branch: option('branch'), deleteBranch: !rest.includes('--keep-branch') });
      console.log(JSON.stringify({ ok: result.removed, ...result }));
      if (!result.removed) process.exitCode = 1;
    } else {
      console.error(USAGE);
      process.exitCode = 2;
    }
  } catch (error) {
    console.log(JSON.stringify({ ok: false, reasonCode: error.reasonCode ?? 'worktree_failed', summary: error.message }));
    process.exitCode = 1;
  }
}

if (isCliEntry(import.meta.url)) runCli();
