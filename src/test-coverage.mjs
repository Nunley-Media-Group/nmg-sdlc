/** Per-project suite and per-test coverage commands from steering/test-coverage.json, plus the coverage report. A report
 * is v1 JSON on stdout, or v2 streamed from the file the command writes to NMG_SDLC_COVERAGE_OUTPUT. Either version is
 * held in one compact per-file range form: lines and branches as merged ranges per path, outcomes as a sorted array.
 * Zero-dependency: reads only that file, never follows a symlinked target, and runs the declared commands as argument
 * arrays with no shell. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TEST_COVERAGE_PATH = 'steering/test-coverage.json';
export const COVERAGE_OUTPUT_ENV = 'NMG_SDLC_COVERAGE_OUTPUT';
const TOP_LEVEL_KEYS = Object.freeze(['version', 'suite', 'coverage']);
const COMMAND_KEYS = Object.freeze(['program', 'args']);
const REPORT_KEYS = Object.freeze(['version', 'tests', 'executableLines']);
const REPORT_TEST_KEYS = Object.freeze(['id', 'file', 'lines', 'branches', 'outcomes']);
const HEADER_KEYS = Object.freeze(['version', 'executableLines']);
const LINE_RE = /^[^:\s][^:]*:[1-9]\d*$/;
const BRANCH_RE = /^[^:\s][^:]*:[1-9]\d*:\d+$/;
const PATH_RE = /^[^:\s][^:]*$/;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const READ_CHUNK_BYTES = 1024 * 1024;
const OUTPUT_FILE_NAME = 'report.ndjson';
const REPORT_HEADER = '{"version":2}';

/** Fail-closed diagnostic naming the file, the offending field, and the value. `message` replaces the default text. */
export class TestCoverageError extends Error {
  constructor(key, value, reason, { source = TEST_COVERAGE_PATH, reasonCode = 'test_coverage_config_invalid', message = null } = {}) {
    super(message ?? (key === '(file)' ? `${source}: ${reason}` : `${source}: ${key} = ${JSON.stringify(value)}: ${reason}`));
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

function isRepoRelativePath(file) {
  return typeof file === 'string' && file.length > 0 && !path.isAbsolute(file) && !file.includes('\\')
    && !file.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

function ownSet(object, key, value) {
  Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
}

/** Merges `[from, to]` intervals into sorted, non-overlapping, non-adjacent ones. */
function mergeIntervals(intervals) {
  const sorted = intervals.map(([from, to]) => [from, to]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [from, to] of sorted) {
    const last = merged.at(-1);
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

/** Merges `[line, from, to]` triples: index ranges join only on the same line. */
function mergeTriples(triples) {
  const sorted = triples.map(([line, from, to]) => [line, from, to]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [line, from, to] of sorted) {
    const last = merged.at(-1);
    if (last && last[0] === line && from <= last[2] + 1) last[2] = Math.max(last[2], to);
    else merged.push([line, from, to]);
  }
  return merged;
}

/** The canonical set of one kind: paths sorted, ranges merged, and a path without any entry dropped. */
function canonicalSet(kind, raw) {
  const set = {};
  for (const file of Object.keys(raw).sort()) {
    const ranges = kind === 'lines' ? mergeIntervals(raw[file]) : mergeTriples(raw[file]);
    if (ranges.length) ownSet(set, file, ranges);
  }
  return set;
}

/** The canonical set built from validated v1 entry strings: `path:N` for lines, `path:N:K` for branches. */
function setOfEntries(kind, entries) {
  const raw = new Map();
  for (const entry of entries) {
    const [file, line, index] = entry.split(':');
    if (!raw.has(file)) raw.set(file, []);
    raw.get(file).push(kind === 'lines' ? [Number(line), Number(line)] : [Number(line), Number(index), Number(index)]);
  }
  return canonicalSet(kind, Object.fromEntries(raw));
}

/** The compact form of one validated v1 test: the same id, file and entries held as ranges. Callers add their own keys. */
export function compactTest({ id, file, lines, branches, outcomes }) {
  return { id, file, lines: setOfEntries('lines', lines), branches: setOfEntries('branches', branches), outcomes: [...new Set(outcomes)].sort() };
}

/** Validates the coverage command's JSON output: `{ version: 1, tests: [{ id, file, lines, branches, outcomes }] }`,
 * plus an optional top-level `executableLines: ["path:N"]` naming the lines that hold code. Returns the same tests in
 * the compact range form, with `executableLines` as a lines set when present. */
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
    if (!isRepoRelativePath(test.file)) fail(`tests[${index}].file`, test.file, 'must be a repository-relative path');
    return compactTest({
      id: test.id,
      file: test.file,
      lines: validateEntries(test, 'lines', index, LINE_RE, 'path:N'),
      branches: validateEntries(test, 'branches', index, BRANCH_RE, 'path:N:K'),
      outcomes: validateEntries(test, 'outcomes', index, null),
    });
  });
  if (!Object.hasOwn(value, 'executableLines')) return { version: 1, tests };
  const executableLines = setOfEntries('lines', validateEntries(value, 'executableLines', null, LINE_RE, 'path:N'));
  return { version: 1, tests, executableLines };
}

/** A refusal whose message starts with the 1-based line of a coverage report file. */
function lineError(lineNumber, reason) {
  return new TestCoverageError('(line)', undefined, reason, {
    source: 'coverage output', reasonCode: 'test_layers_coverage_failed', message: `line ${lineNumber}: ${reason}`,
  });
}

function parseLine(text, lineNumber) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw lineError(lineNumber, `invalid JSON: ${error.message}`);
  }
}

/** Checks a v2 `lines` or `branches` object (or the header's `executableLines`) and returns it. */
function checkV2Set(kind, label, value, fail) {
  const shape = kind === 'lines' ? '[from, to] range' : '[line, fromIndex, toIndex] triple';
  if (!isPlainObject(value)) fail(`${label} must be an object mapping each path to an array of ${shape}s`);
  for (const file of Object.keys(value)) {
    if (!PATH_RE.test(file)) fail(`${label} path ${JSON.stringify(file)} must not contain ":" or start with whitespace`);
    if (!Array.isArray(value[file])) fail(`${label}[${JSON.stringify(file)}] must be an array of ${shape}s`);
    for (const range of value[file]) {
      const valid = Array.isArray(range) && range.every((number) => Number.isSafeInteger(number))
        && (kind === 'lines'
          ? range.length === 2 && range[0] >= 1 && range[0] <= range[1]
          : range.length === 3 && range[0] >= 1 && range[1] >= 0 && range[1] <= range[2]);
      if (!valid) fail(`${label}[${JSON.stringify(file)}] has an invalid ${shape} ${JSON.stringify(range)}`);
    }
  }
  return value;
}

function readV2Header(text) {
  const fail = (reason) => { throw lineError(1, reason); };
  const headerMessage = `must be the version 2 header ${REPORT_HEADER}, with an optional executableLines`;
  if (text.trim() === '') fail(headerMessage);
  const value = parseLine(text, 1);
  if (!isPlainObject(value) || value.version !== 2 || Object.keys(value).some((key) => !HEADER_KEYS.includes(key))) {
    fail(headerMessage);
  }
  if (!Object.hasOwn(value, 'executableLines')) return undefined;
  return canonicalSet('lines', checkV2Set('lines', 'executableLines', value.executableLines, fail));
}

function readV2Test(value, lineNumber, ids) {
  const fail = (reason) => { throw lineError(lineNumber, reason); };
  if (!isPlainObject(value)) fail('must be a test object');
  for (const key of Object.keys(value)) {
    if (!REPORT_TEST_KEYS.includes(key)) fail(`unknown key ${JSON.stringify(key)}`);
  }
  if (typeof value.id !== 'string' || value.id.length === 0) fail('id must be a non-empty string');
  if (ids.has(value.id)) fail(`duplicate test id ${JSON.stringify(value.id)}`);
  ids.add(value.id);
  if (!isRepoRelativePath(value.file)) fail('file must be a repository-relative path');
  const lines = checkV2Set('lines', 'lines', value.lines, fail);
  const branches = checkV2Set('branches', 'branches', value.branches, fail);
  if (!Array.isArray(value.outcomes) || value.outcomes.some((outcome) => typeof outcome !== 'string')) {
    fail('outcomes must be an array of strings');
  }
  return {
    id: value.id,
    file: value.file,
    lines: canonicalSet('lines', lines),
    branches: canonicalSet('branches', branches),
    outcomes: [...new Set(value.outcomes)].sort(),
  };
}

/** Calls `visit(text, lineNumber)` for each line of `file` (1-based). The file is read in fixed-size chunks and split on
 * LF, so it is never held as one string; each line is decoded whole, so no multi-byte character is split. */
export function forEachLine(file, visit) {
  const fd = fs.openSync(file, 'r');
  try {
    const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    let pending = [];
    let lineNumber = 0;
    for (;;) {
      const bytes = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (bytes === 0) break;
      let start = 0;
      let at = chunk.indexOf(0x0a);
      while (at !== -1 && at < bytes) {
        pending.push(chunk.subarray(start, at));
        lineNumber += 1;
        visit(Buffer.concat(pending).toString('utf8'), lineNumber);
        pending = [];
        start = at + 1;
        at = chunk.indexOf(0x0a, start);
      }
      if (start < bytes) pending.push(Buffer.from(chunk.subarray(start, bytes)));
    }
    if (pending.length) {
      lineNumber += 1;
      visit(Buffer.concat(pending).toString('utf8'), lineNumber);
    }
  } finally {
    fs.closeSync(fd);
  }
}

/** Reads a v2 report from `file` line by line. Line 1 is the header `{"version":2}` with an optional `executableLines`;
 * every later non-empty line is one test `{ id, file, lines, branches, outcomes }`. A malformed line refuses with
 * `test_layers_coverage_failed` and a message beginning `line <N>: `. Returns `{ version: 2, tests, executableLines? }`. */
export function readCoverageReportFile(file) {
  const tests = [];
  const ids = new Set();
  let header = null;
  forEachLine(file, (text, lineNumber) => {
    if (lineNumber === 1) {
      header = { executableLines: readV2Header(text) };
      return;
    }
    if (text.trim() === '') return;
    tests.push(readV2Test(parseLine(text, lineNumber), lineNumber, ids));
  });
  if (!header) throw lineError(1, `must be the version 2 header ${REPORT_HEADER}, with an optional executableLines`);
  return header.executableLines ? { version: 2, tests, executableLines: header.executableLines } : { version: 2, tests };
}

function outputExists(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (!stat.isFile()) {
    throw new TestCoverageError('(file)', undefined, 'must be a regular file, not a symlink or directory', {
      source: 'coverage output', reasonCode: 'test_layers_coverage_failed',
    });
  }
  return true;
}

/** The report one coverage run produced: the v2 file it wrote at NMG_SDLC_COVERAGE_OUTPUT when it exists, otherwise its
 * stdout parsed as v1. A command that writes no file keeps the v1 stdout behavior. */
export function readCoverageRun({ outputFile, stdout }) {
  if (outputFile && outputExists(outputFile)) return readCoverageReportFile(outputFile);
  return validateCoverageReport(JSON.parse(stdout));
}

/** A fresh plugin-created directory for one coverage run, and the report file the command may write in it. */
export function createCoverageOutput() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-coverage-'));
  return { dir, file: path.join(dir, OUTPUT_FILE_NAME) };
}

/** Removes the directory of one coverage run with everything the command left in it. */
export function removeCoverageOutput({ dir }) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Groups a set into `key -> [from, to]` intervals: lines key by path, branches by `path:line`. */
function groupsOf(kind, set) {
  const groups = new Map();
  const add = (key, interval) => {
    if (groups.has(key)) groups.get(key).push(interval);
    else groups.set(key, [interval]);
  };
  for (const file of Object.keys(set)) {
    for (const range of set[file]) {
      if (kind === 'lines') add(file, [range[0], range[1]]);
      else add(`${file}:${range[0]}`, [range[1], range[2]]);
    }
  }
  return groups;
}

/** The canonical set built from `key -> intervals` groups, the inverse of groupsOf. */
function setOfGroups(kind, groups) {
  const raw = new Map();
  for (const [key, intervals] of groups) {
    if (kind === 'lines') {
      raw.set(key, intervals);
      continue;
    }
    const at = key.indexOf(':');
    const file = key.slice(0, at);
    const line = Number(key.slice(at + 1));
    if (!raw.has(file)) raw.set(file, []);
    for (const [from, to] of intervals) raw.get(file).push([line, from, to]);
  }
  return canonicalSet(kind, Object.fromEntries(raw));
}

/** Subtracts sorted, merged `b` intervals from sorted, merged `a` intervals. */
function subtractIntervals(a, b) {
  const out = [];
  let j = 0;
  for (const [from, to] of a) {
    while (j < b.length && b[j][1] < from) j += 1;
    let cur = from;
    for (let k = j; k < b.length && b[k][0] <= to && cur <= to; k += 1) {
      if (b[k][0] > cur) out.push([cur, b[k][0] - 1]);
      cur = Math.max(cur, b[k][1] + 1);
    }
    if (cur <= to) out.push([cur, to]);
  }
  return out;
}

/** Whether two sorted, merged interval lists share a value. */
function intervalsOverlap(a, b) {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i][1] < b[j][0]) i += 1;
    else if (b[j][1] < a[i][0]) j += 1;
    else return true;
  }
  return false;
}

/** The union of sets of one kind. */
export function unionRanges(kind, sets) {
  if (kind === 'outcomes') return [...new Set(sets.flat())].sort();
  const groups = new Map();
  for (const set of sets) {
    for (const [key, intervals] of groupsOf(kind, set)) {
      if (!groups.has(key)) groups.set(key, []);
      const target = groups.get(key);
      for (const interval of intervals) target.push(interval);
    }
  }
  return setOfGroups(kind, groups);
}

/** The entries of `set` that are not entries of `other`, both of one kind. */
export function subtractRanges(kind, set, other) {
  if (kind === 'outcomes') {
    const excluded = new Set(other);
    return set.filter((entry) => !excluded.has(entry));
  }
  const excluded = groupsOf(kind, other);
  const groups = new Map();
  for (const [key, intervals] of groupsOf(kind, set)) {
    const rest = subtractIntervals(mergeIntervals(intervals), mergeIntervals(excluded.get(key) ?? []));
    if (rest.length) groups.set(key, rest);
  }
  return setOfGroups(kind, groups);
}

/** Whether every entry of `small` is an entry of `big`, both of one kind. */
export function rangesContain(kind, big, small) {
  const rest = subtractRanges(kind, small, big);
  return kind === 'outcomes' ? rest.length === 0 : Object.keys(rest).length === 0;
}

/** Whether `a` and `b` share at least one entry, both of one kind. */
export function rangesIntersect(kind, a, b) {
  if (kind === 'outcomes') {
    const other = new Set(b);
    return a.some((entry) => other.has(entry));
  }
  const other = groupsOf(kind, b);
  for (const [key, intervals] of groupsOf(kind, a)) {
    if (other.has(key) && intervalsOverlap(mergeIntervals(intervals), mergeIntervals(other.get(key)))) return true;
  }
  return false;
}

/** The number of entries a set stands for: outcomes, lines or branch indexes. */
export function rangeCount(kind, set) {
  if (kind === 'outcomes') return set.length;
  let total = 0;
  for (const file of Object.keys(set)) {
    for (const range of set[file]) total += kind === 'lines' ? range[1] - range[0] + 1 : range[2] - range[1] + 1;
  }
  return total;
}

/** Whether the lines set holds line `n` of `file`. */
export function hasLine(lines, file, n) {
  return Object.hasOwn(lines, file) && lines[file].some(([from, to]) => from <= n && n <= to);
}

/** The `path:N` (lines), `path:N:K` (branches) or outcome strings a set stands for, sorted. Used only for bounded output. */
export function expandEntries(kind, set) {
  if (kind === 'outcomes') return [...set].sort();
  const entries = [];
  for (const file of Object.keys(set)) {
    for (const range of set[file]) {
      if (kind === 'lines') {
        for (let n = range[0]; n <= range[1]; n += 1) entries.push(`${file}:${n}`);
      } else {
        for (let k = range[1]; k <= range[2]; k += 1) entries.push(`${file}:${range[0]}:${k}`);
      }
    }
  }
  return entries.sort();
}

/** Runs `{ program, args }` in `root` with no shell. `env`, when given, is merged over the process environment.
 * `wallMs` is measured around the call. */
export function runCommand(root, { program, args }, env = null) {
  const started = process.hrtime.bigint();
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    maxBuffer: MAX_OUTPUT_BYTES,
    env: env ? { ...process.env, ...env } : process.env,
  });
  const wallMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
  return {
    status: result.error ? null : result.status,
    stdout: result.stdout ?? '',
    stderr: result.error ? String(result.error.message) : (result.stderr ?? ''),
    wallMs,
  };
}
