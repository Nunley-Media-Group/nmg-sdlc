#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { isCliEntry } from './plugin-controller-path.mjs';

export const OMP_SDLC_IGNORE_LINE = '.omp/sdlc/';

const defaultFs = { readFileSync, writeFileSync };

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

export function hasOmpSdlcIgnore(source) {
  return String(source ?? '')
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      return trimmed === OMP_SDLC_IGNORE_LINE || trimmed === '.omp/sdlc';
    });
}

export function writeOmpSdlcIgnore(root, { fs = defaultFs } = {}) {
  const gitignore = join(root, '.gitignore');
  let before = '';
  try {
    before = fs.readFileSync(gitignore, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      return {
        ok: false,
        changed: false,
        status: 'preserved (unmanaged)',
        reasonCode: 'gitignore_unwritable',
      };
    }
  }

  if (hasOmpSdlcIgnore(before)) {
    return { ok: true, changed: false, status: 'already present', reasonCode: null };
  }

  const separator = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
  try {
    fs.writeFileSync(gitignore, `${before}${separator}${OMP_SDLC_IGNORE_LINE}\n`);
    return { ok: true, changed: true, status: 'written', reasonCode: null };
  } catch {
    return {
      ok: false,
      changed: false,
      status: 'preserved (unmanaged)',
      reasonCode: 'gitignore_unwritable',
    };
  }
}

export function ensureOmpSdlcIgnore(root, options = {}) {
  return writeOmpSdlcIgnore(root, options);
}

export function isAuthorizedOmpSdlcUntrackTransition(status, untrack) {
  const paths = untrack?.untrackedPaths;
  if (!untrack?.changed || !Array.isArray(paths) || paths.length === 0) return false;

  const expected = new Set(paths);
  if (expected.size !== paths.length || paths.some((path) => !path.startsWith(OMP_SDLC_IGNORE_LINE))) {
    return false;
  }

  const porcelain = String(status ?? '');
  if (!porcelain.endsWith('\0')) return false;
  const records = porcelain.slice(0, -1).split('\0');
  if (records.length !== expected.size) return false;

  for (const record of records) {
    if (!record.startsWith('D  ') || !expected.delete(record.slice(3))) return false;
  }
  return expected.size === 0;
}

export function untrackOmpSdlcRuntime({
  cwd = process.cwd(),
  run = defaultRun,
  fs = defaultFs,
} = {}) {
  let gitignore;
  try {
    gitignore = fs.readFileSync(join(cwd, '.gitignore'), 'utf8');
  } catch {
    return { ok: true, changed: false, status: 'ignore absent', reasonCode: null };
  }
  if (!hasOmpSdlcIgnore(gitignore)) {
    return { ok: true, changed: false, status: 'ignore absent', reasonCode: null };
  }

  const listed = run('git', ['ls-files', '-z', '--', '.omp/sdlc'], { cwd });
  if (listed?.status !== 0) {
    return { ok: false, changed: false, status: 'failed', reasonCode: 'runtime_untrack_failed' };
  }
  const listedOutput = String(listed.stdout || '');
  if (!listedOutput) {
    return {
      ok: true,
      changed: false,
      status: 'already untracked',
      reasonCode: null,
      untrackedPaths: [],
    };
  }
  if (!listedOutput.endsWith('\0')) {
    return { ok: false, changed: false, status: 'failed', reasonCode: 'runtime_untrack_failed' };
  }
  const untrackedPaths = listedOutput.slice(0, -1).split('\0');
  if (new Set(untrackedPaths).size !== untrackedPaths.length
    || untrackedPaths.some((path) => !path.startsWith(OMP_SDLC_IGNORE_LINE))) {
    return { ok: false, changed: false, status: 'failed', reasonCode: 'runtime_untrack_failed' };
  }

  const removed = run('git', ['rm', '--cached', '-r', '--', '.omp/sdlc'], { cwd });
  if (removed?.status !== 0) {
    return { ok: false, changed: false, status: 'failed', reasonCode: 'runtime_untrack_failed' };
  }
  return {
    ok: true,
    changed: true,
    status: 'untracked',
    reasonCode: null,
    untrackedPaths,
  };
}

function runCli(argv = process.argv.slice(2)) {
  const rootIndex = argv.indexOf('--root');
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : null;
  if (argv[0] !== 'ensure' || !root || argv.length !== 3) {
    console.log(JSON.stringify({ ok: false, changed: false, status: 'invalid arguments', reasonCode: 'invalid_arguments' }));
    return 2;
  }
  const result = ensureOmpSdlcIgnore(root);
  console.log(JSON.stringify(result));
  return result.ok ? 0 : 1;
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli();
