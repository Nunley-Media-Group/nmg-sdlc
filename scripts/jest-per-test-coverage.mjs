#!/usr/bin/env node
/** Per-test coverage command for this repository (declared by steering/test-coverage.json).
 *
 * Usage: node scripts/jest-per-test-coverage.mjs <repo-relative test file or directory>...
 *
 * A directory stands for the Jest test files under it (`.mjs` files under `__tests__/`, or named `*.test.mjs` or
 * `*.spec.mjs`, outside node_modules and __fixtures__), so a selected directory runs as its test files.
 *
 * Runs Jest once per test file, from scripts/, with V8 coverage rooted at the repository so src/ files count, and
 * prints one JSON report `{ version: 1, tests, executableLines }` (see validateCoverageReport in test-coverage.mjs).
 *
 * Derivation rules (V8 coverage converted by Jest to istanbul format, one statement per source line):
 * - `lines`: `path:N` for every statement whose count is above 0, keyed by its start line N (1-based). A statement
 *   spanning several lines counts for its start line only.
 * - `branches`: `path:N:K` for every branch location whose count is above 0, where N is the location's start line and
 *   K its 0-based start column. The column, unlike a branch's ordinal, stays stable across runs that compile a
 *   different set of functions.
 * - `executableLines`: the union over all runs of `path:N` for every statement start line, whatever its count.
 * - Lines that are empty or whitespace-only in the source are never executable or covered.
 * - Paths are repository-relative; files outside the repository, under node_modules, __tests__ or __fixtures__, or
 *   whose path holds a colon, are left out.
 * - `outcomes`: `<it title>:<status>` from Jest's --json results, where the title is the `it` block's own title without the
 *   file path or enclosing describe titles, so a moved `it` block keeps its outcome in another file; a suite that fails
 *   to run reports `(suite):failed`.
 *
 * Arguments are the selected test ids: each is read as a path with any `::` suffix, a leading `./`, `.` segments and a
 * trailing `/` removed. Exit status: 2 for a usage error (no arguments or a path that is not repository-relative); 1 when Jest produced no
 * results or coverage for a file, or when any test failed (the report is still printed when it can be built); 0
 * otherwise. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCliEntry } from './plugin-controller-path.mjs';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, '..');
const jestBin = path.join(scriptsDir, 'node_modules', 'jest', 'bin', 'jest.js');
const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const EXCLUDED_SEGMENTS = new Set(['node_modules', '__tests__', '__fixtures__']);

function usage(message) {
  process.stderr.write(`${message}\nusage: node scripts/jest-per-test-coverage.mjs <repo-relative test file>...\n`);
  process.exit(2);
}

/** Each repository-relative directory replaced by the sorted Jest test files under it; any other path is kept. */
function expandTestPaths(files, root = repoRoot) {
  const isTest = (relative) => relative.endsWith('.mjs')
    && (relative.split('/').includes('__tests__') || /\.(test|spec)\.mjs$/.test(relative));
  const walk = (relative) => fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .filter((entry) => !['node_modules', '__fixtures__'].includes(entry.name))
    .flatMap((entry) => {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) return walk(child);
      return entry.isFile() && isTest(child) ? [child] : [];
    });
  return files.flatMap((file) => {
    const relative = file.replace(/\/+$/, '');
    let stat = null;
    try {
      stat = fs.lstatSync(path.join(root, relative));
    } catch {
      // A missing path is reported by Jest like any other.
    }
    return stat?.isDirectory() ? walk(relative).sort() : [file];
  });
}

export function isRepoRelative(file) {
  return typeof file === 'string' && file.length > 0 && !path.isAbsolute(file) && !file.includes('\\')
    && !file.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

/** Repository-relative POSIX path for an absolute file, or null when it must be left out. */
function reportPath(absolute, root = repoRoot) {
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const posix = relative.split(path.sep).join('/');
  if (posix.includes(':') || posix.split('/').some((segment) => EXCLUDED_SEGMENTS.has(segment))) return null;
  return posix;
}

const sourceLinesCache = new Map();
function blankLines(absolute) {
  if (!sourceLinesCache.has(absolute)) {
    let blank = new Set();
    try {
      const lines = fs.readFileSync(absolute, 'utf8').split('\n');
      blank = new Set(lines.flatMap((text, index) => (text.trim() === '' ? [index + 1] : [])));
    } catch {
      // An unreadable source keeps every reported line.
    }
    sourceLinesCache.set(absolute, blank);
  }
  return sourceLinesCache.get(absolute);
}

/** The test path relative to scripts/; one that would start with `-` keeps a leading `./`, so Jest never reads it as an option. */
function testPathArg(file) {
  const relative = path.relative(scriptsDir, path.join(repoRoot, file)).split(path.sep).join('/');
  return relative.startsWith('-') ? `./${relative}` : relative;
}

/** The node argv that runs one test file under Jest with V8 coverage, by path. */
export function jestArguments(file, resultsFile, coverageDir) {
  return [
    '--experimental-vm-modules', jestBin,
    `--rootDir=${repoRoot}`, `--roots=${scriptsDir}`,
    '--runInBand', '--ci', '--coverage', '--coverageProvider=v8', '--coverageReporters=json',
    '--json', `--outputFile=${resultsFile}`, `--coverageDirectory=${coverageDir}`,
    '--runTestsByPath', testPathArg(file),
  ];
}

function runJest(file, tmp) {
  const env = { ...process.env };
  delete env.JEST_WORKER_ID;
  const resultsFile = path.join(tmp, 'results.json');
  const coverageDir = path.join(tmp, 'cov');
  const args = jestArguments(file, resultsFile, coverageDir);
  const run = spawnSync(process.execPath, args, {
    cwd: scriptsDir, env, shell: false, encoding: 'utf8', timeout: RUN_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const read = (target) => {
    try {
      return JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch {
      return null;
    }
  };
  return { run, results: read(resultsFile), coverage: read(path.join(coverageDir, 'coverage-final.json')) };
}

/**
 * Derives one test's report entry from Jest's --json results and istanbul-format coverage. Adds every statement start
 * line to `executable`; returns `{ test, failed }`. `root` is the repository the reported paths are relative to.
 */
export function collect(file, results, coverage, executable, root = repoRoot) {
  const lines = new Set();
  const branches = new Set();
  for (const [absolute, data] of Object.entries(coverage)) {
    const relative = reportPath(data.path ?? absolute, root);
    if (!relative) continue;
    const blank = blankLines(data.path ?? absolute);
    for (const [id, location] of Object.entries(data.statementMap ?? {})) {
      const line = location.start.line;
      if (!(line >= 1) || blank.has(line)) continue;
      executable.add(`${relative}:${line}`);
      if (data.s?.[id] > 0) lines.add(`${relative}:${line}`);
    }
    for (const [id, branch] of Object.entries(data.branchMap ?? {})) {
      (branch.locations ?? []).forEach((location, index) => {
        const line = location.start.line;
        if (!(line >= 1) || blank.has(line) || !(data.b?.[id]?.[index] > 0)) return;
        branches.add(`${relative}:${line}:${Math.max(0, location.start.column ?? 0)}`);
      });
    }
  }
  const outcomes = new Set();
  let failed = !results.success;
  for (const suite of results.testResults ?? []) {
    if (suite.testExecError || (suite.status === 'failed' && (suite.assertionResults ?? []).length === 0)) {
      outcomes.add('(suite):failed');
      failed = true;
    }
    for (const assertion of suite.assertionResults ?? []) {
      outcomes.add(`${assertion.title}:${assertion.status}`);
      if (assertion.status === 'failed') failed = true;
    }
  }
  return {
    test: { id: file, file, lines: [...lines].sort(), branches: [...branches].sort(), outcomes: [...outcomes].sort() },
    failed,
  };
}

/**
 * The repository-relative path a selected test id names, in the form the gate compares: without a `::` node suffix
 * (Jest runs whole files), a leading `./`, `.` segments or a trailing `/`. Null when it is no repository-relative path.
 */
function testFileArgument(id) {
  const target = String(id).split('::')[0];
  if (target.includes('\\') || path.posix.isAbsolute(target)) return null;
  const normalized = path.posix.normalize(target).replace(/^\.\//, '').replace(/\/+$/, '');
  return isRepoRelative(normalized) ? normalized : null;
}

export function main(ids) {
  if (ids.length === 0) usage('jest-per-test-coverage: no test files given');
  const files = ids.map((id) => {
    const file = testFileArgument(id);
    if (file === null) usage(`jest-per-test-coverage: not a repository-relative path: ${JSON.stringify(id)}`);
    return file;
  });
  const unique = [...new Set(expandTestPaths(files))];
  if (unique.length === 0) {
    process.stderr.write('jest-per-test-coverage: the given directories hold no test files\n');
    process.exitCode = 1;
    return;
  }
  const executable = new Set();
  const tests = [];
  let status = 0;
  for (const file of unique) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-jest-coverage-'));
    try {
      const { run, results, coverage } = runJest(file, tmp);
      if (!results || !coverage || (results.testResults ?? []).length === 0) {
        process.stderr.write(`jest-per-test-coverage: Jest produced no results or coverage for ${file}`
          + ` (exit ${run.status ?? run.signal ?? run.error?.message})\n${(run.stderr ?? '').slice(-4000)}\n`);
        status = 1;
        continue;
      }
      const { test, failed } = collect(file, results, coverage, executable);
      if (failed) {
        process.stderr.write(`jest-per-test-coverage: tests failed in ${file}\n${(run.stderr ?? '').slice(-4000)}\n`);
        status = 1;
      }
      tests.push(test);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  process.stdout.write(`${JSON.stringify({ version: 1, tests, executableLines: [...executable].sort() })}\n`);
  process.exitCode = status;
}

if (isCliEntry(import.meta.url)) main(process.argv.slice(2));
