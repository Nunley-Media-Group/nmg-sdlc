/** Per-project suite and per-test coverage commands from steering/test-coverage.json, plus the coverage command's
 * output format. Zero-dependency: reads only that file, never follows a symlinked target, and runs the declared
 * commands as argument arrays with no shell. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const TEST_COVERAGE_PATH = 'steering/test-coverage.json';
const TOP_LEVEL_KEYS = Object.freeze(['version', 'suite', 'coverage']);
const COMMAND_KEYS = Object.freeze(['program', 'args']);
const REPORT_KEYS = Object.freeze(['version', 'tests', 'executableLines']);
const REPORT_TEST_KEYS = Object.freeze(['id', 'file', 'lines', 'branches', 'outcomes']);
const LINE_RE = /^[^:\s][^:]*:[1-9]\d*$/;
const BRANCH_RE = /^[^:\s][^:]*:[1-9]\d*:\d+$/;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

/** Fail-closed diagnostic naming the file, the offending field, and the value. */
export class TestCoverageError extends Error {
  constructor(key, value, reason, { source = TEST_COVERAGE_PATH, reasonCode = 'test_coverage_config_invalid' } = {}) {
    super(key === '(file)' ? `${source}: ${reason}` : `${source}: ${key} = ${JSON.stringify(value)}: ${reason}`);
    this.name = 'TestCoverageError';
    this.reasonCode = reasonCode;
    this.path = source;
    this.key = key;
    this.value = value;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowed, prefix, fail) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${prefix}${key}`, value[key], 'unknown key');
  }
}

function validateCommand(value, name) {
  const fail = (key, actual, reason) => { throw new TestCoverageError(key, actual, reason); };
  if (!isPlainObject(value)) fail(name, value, 'must be an object { program, args }');
  rejectUnknownKeys(value, COMMAND_KEYS, `${name}.`, fail);
  if (typeof value.program !== 'string' || value.program.length === 0) {
    fail(`${name}.program`, value.program, 'must be a non-empty string');
  }
  if (!Array.isArray(value.args)) fail(`${name}.args`, value.args, 'must be an array of strings');
  value.args.forEach((arg, index) => {
    if (typeof arg !== 'string') fail(`${name}.args[${index}]`, arg, 'must be a string');
  });
  return { program: value.program, args: [...value.args] };
}

/** Returns the normalized config or throws TestCoverageError. */
export function validateTestCoverageConfig(value) {
  if (!isPlainObject(value)) throw new TestCoverageError('(root)', value, 'must be a JSON object');
  rejectUnknownKeys(value, TOP_LEVEL_KEYS, '', (key, actual, reason) => { throw new TestCoverageError(key, actual, reason); });
  if (value.version !== 1) throw new TestCoverageError('version', value.version, 'must be 1');
  return { version: 1, suite: validateCommand(value.suite, 'suite'), coverage: validateCommand(value.coverage, 'coverage') };
}

/** `{ config }` for a valid file, `{ missing: true }` for an absent one; anything else throws TestCoverageError. */
export function loadTestCoverageConfig(root) {
  const target = path.join(path.resolve(root), TEST_COVERAGE_PATH);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return { missing: true };
    throw new TestCoverageError('(file)', undefined, `unreadable: ${error.code ?? error.message}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new TestCoverageError('(file)', undefined, 'must be a regular file, not a symlink or directory');
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    throw new TestCoverageError('(file)', undefined, `invalid JSON: ${error.message}`);
  }
  return { config: validateTestCoverageConfig(parsed) };
}

function validateEntries(test, field, index, pattern, shape) {
  const fail = (key, actual, reason) => {
    throw new TestCoverageError(key, actual, reason, { source: 'coverage output', reasonCode: 'test_layers_coverage_failed' });
  };
  // `index` null names a top-level field.
  const name = index === null ? field : `tests[${index}].${field}`;
  const entries = test[field];
  if (!Array.isArray(entries)) fail(name, entries, 'must be an array of strings');
  entries.forEach((entry, position) => {
    if (typeof entry !== 'string' || (pattern && !pattern.test(entry))) {
      fail(`${name}[${position}]`, entry, pattern ? `must match ${shape}` : 'must be a string');
    }
  });
  return [...new Set(entries)].sort();
}

/** Validates the coverage command's JSON output: `{ version: 1, tests: [{ id, file, lines, branches, outcomes }] }`,
 * plus an optional top-level `executableLines: ["path:N"]` naming the lines that hold code. */
export function validateCoverageReport(value) {
  const fail = (key, actual, reason) => {
    throw new TestCoverageError(key, actual, reason, { source: 'coverage output', reasonCode: 'test_layers_coverage_failed' });
  };
  if (!isPlainObject(value)) fail('(root)', value, 'must be a JSON object');
  rejectUnknownKeys(value, REPORT_KEYS, '', fail);
  if (value.version !== 1) fail('version', value.version, 'must be 1');
  if (!Array.isArray(value.tests)) fail('tests', value.tests, 'must be an array');
  const ids = new Set();
  const tests = value.tests.map((test, index) => {
    if (!isPlainObject(test)) fail(`tests[${index}]`, test, 'must be an object');
    rejectUnknownKeys(test, REPORT_TEST_KEYS, `tests[${index}].`, fail);
    if (typeof test.id !== 'string' || test.id.length === 0) fail(`tests[${index}].id`, test.id, 'must be a non-empty string');
    if (ids.has(test.id)) fail(`tests[${index}].id`, test.id, 'duplicate test id');
    ids.add(test.id);
    const file = test.file;
    if (typeof file !== 'string' || file.length === 0 || path.isAbsolute(file) || file.includes('\\')
      || file.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
      fail(`tests[${index}].file`, file, 'must be a repository-relative path');
    }
    return {
      id: test.id,
      file,
      lines: validateEntries(test, 'lines', index, LINE_RE, 'path:N'),
      branches: validateEntries(test, 'branches', index, BRANCH_RE, 'path:N:K'),
      outcomes: validateEntries(test, 'outcomes', index, null),
    };
  });
  if (!Object.hasOwn(value, 'executableLines')) return { version: 1, tests };
  const executableLines = validateEntries(value, 'executableLines', null, LINE_RE, 'path:N');
  return { version: 1, tests, executableLines };
}

/** Runs `{ program, args }` in `root` with no shell; `wallMs` is measured around the call. */
export function runCommand(root, { program, args }) {
  const started = process.hrtime.bigint();
  const result = spawnSync(program, args, { cwd: root, encoding: 'utf8', shell: false, maxBuffer: MAX_OUTPUT_BYTES });
  const wallMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
  return {
    status: result.error ? null : result.status,
    stdout: result.stdout ?? '',
    stderr: result.error ? String(result.error.message) : (result.stderr ?? ''),
    wallMs,
  };
}
