#!/usr/bin/env node

/**
 * Read-only classifier for coordination-only epic aggregates and executable
 * child specification packages.
 */

import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { classifyIssueSpecScope } from './issue-spec-scope.mjs';

const AGGREGATE_PATH = /^specs\/epic-[a-z0-9][a-z0-9-]*$/;
const CHILD_PATH = /^specs\/(?:feature|bug|spike)-[a-z0-9][a-z0-9-]*$/;
const ANY_SPEC_PATH = /^specs\/[a-z0-9][a-z0-9-]*$/;
const SOURCE = /^(?!-)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\/-]{1,200}$/;
const TREE_OID = /^[0-9a-f]{40}$/;
const OUTCOME_ID = /^EO0*[1-9]\d*$/;
const IDENTIFIER_PATTERNS = Object.freeze({
  acceptanceCriteria: /^AC[1-9]\d*$/,
  functionalRequirements: /^FR[1-9]\d*$/,
  tasks: /^T0*[1-9]\d*$/,
  scenarios: /^SCN0*[1-9]\d*$/,
});
const RELEVANT_FILES = new Set([
  'requirements.md',
  'design.md',
  'tasks.md',
  'feature.gherkin',
  'issue-scope.json',
  'epic-scope.json',
  'epic-link.json',
]);
const REQUIRED_CHILD_FILES = Object.freeze([
  'requirements.md',
  'design.md',
  'tasks.md',
  'feature.gherkin',
  'issue-scope.json',
  'epic-link.json',
]);
const FORBIDDEN_AGGREGATE_FILES = Object.freeze([
  'tasks.md',
  'feature.gherkin',
  'issue-scope.json',
  'epic-link.json',
]);
const MARKDOWN_LIMIT_BYTES = 256 * 1024;
const JSON_LIMIT_BYTES = 128 * 1024;
const MAX_TREE_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_SPEC_DIRECTORIES = 2_000;

function bounded(value) {
  const message = String(value ?? '').replace(/\s+/g, ' ').trim();
  return message.length > 300 ? `${message.slice(0, 297)}...` : message;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parsePositiveInteger(value) {
  const normalized = typeof value === 'number' ? String(value) : String(value ?? '');
  if (!/^[1-9]\d*$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function normalizeAggregatePath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replaceAll('\\', '/').replace(/\/$/, '');
  return AGGREGATE_PATH.test(normalized) && path.posix.normalize(normalized) === normalized
    ? normalized
    : null;
}

export function normalizeChildPath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replaceAll('\\', '/').replace(/\/$/, '');
  return CHILD_PATH.test(normalized) && path.posix.normalize(normalized) === normalized
    ? normalized
    : null;
}

function compareIds(left, right) {
  const leftMatch = String(left).match(/^([A-Z]+)(\d+)$/);
  const rightMatch = String(right).match(/^([A-Z]+)(\d+)$/);
  if (leftMatch && rightMatch && leftMatch[1] === rightMatch[1]) {
    return Number(leftMatch[2]) - Number(rightMatch[2]);
  }
  return String(left).localeCompare(String(right));
}

function uniqueSorted(values, compare = compareIds) {
  return [...new Set(values)].sort(compare);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function evidenceDigest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

function exactKeys(value, expected, label, gaps) {
  if (!isPlainObject(value)) {
    gaps.push(`${label} must be an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const extra = actual.filter((key) => !wanted.includes(key));
  const missing = wanted.filter((key) => !actual.includes(key));
  if (extra.length > 0) gaps.push(`${label} has unexpected keys: ${extra.join(', ')}`);
  if (missing.length > 0) gaps.push(`${label} is missing keys: ${missing.join(', ')}`);
  return extra.length === 0 && missing.length === 0;
}

function parseJson(content, label) {
  try {
    return { value: JSON.parse(content), gaps: [] };
  } catch (error) {
    return { value: null, gaps: [`${label} is invalid JSON: ${bounded(error.message)}`] };
  }
}

function parseStringArray(value, pattern, label, gaps) {
  if (!Array.isArray(value)) {
    gaps.push(`${label} must be an array`);
    return [];
  }
  const parsed = [];
  for (const item of value) {
    if (typeof item !== 'string' || !pattern.test(item)) {
      gaps.push(`${label} contains invalid identifier ${JSON.stringify(item)}`);
      continue;
    }
    parsed.push(item);
  }
  if (new Set(parsed).size !== parsed.length) gaps.push(`${label} repeats an identifier`);
  return uniqueSorted(parsed);
}

function parseNumberArray(value, label, gaps) {
  if (!Array.isArray(value)) {
    gaps.push(`${label} must be an array`);
    return [];
  }
  const parsed = [];
  for (const item of value) {
    const issue = parsePositiveInteger(item);
    if (!issue) gaps.push(`${label} contains invalid issue ${JSON.stringify(item)}`);
    else parsed.push(issue);
  }
  if (new Set(parsed).size !== parsed.length) gaps.push(`${label} repeats an issue`);
  return uniqueSorted(parsed, (left, right) => left - right);
}

function parseMigration(value, index, gaps) {
  const label = `migrations[${index}]`;
  exactKeys(value, ['sourceSpecPath', 'sourceTree', 'recordedAt', 'transfers'], label, gaps);
  const sourceSpecPath = typeof value?.sourceSpecPath === 'string'
    && ANY_SPEC_PATH.test(value.sourceSpecPath)
    && path.posix.normalize(value.sourceSpecPath) === value.sourceSpecPath
    ? value.sourceSpecPath
    : null;
  if (!sourceSpecPath) gaps.push(`${label}.sourceSpecPath must be a normalized specs/<slug> path`);
  const sourceTree = typeof value?.sourceTree === 'string' && TREE_OID.test(value.sourceTree)
    ? value.sourceTree
    : null;
  if (!sourceTree) gaps.push(`${label}.sourceTree must be a full lower-case Git tree OID`);
  const recordedAt = typeof value?.recordedAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.recordedAt)
    && !Number.isNaN(Date.parse(value.recordedAt))
    ? value.recordedAt
    : null;
  if (!recordedAt) gaps.push(`${label}.recordedAt must be an ISO-8601 UTC timestamp`);
  if (!Array.isArray(value?.transfers) || value.transfers.length === 0) {
    gaps.push(`${label}.transfers must be a non-empty array`);
  }
  const transfers = [];
  const issues = new Set();
  const identifiers = new Map(Object.keys(IDENTIFIER_PATTERNS).map((key) => [key, new Set()]));
  for (const [transferIndex, transfer] of (Array.isArray(value?.transfers) ? value.transfers : []).entries()) {
    const transferLabel = `${label}.transfers[${transferIndex}]`;
    exactKeys(transfer, ['childIssue', ...Object.keys(IDENTIFIER_PATTERNS)], transferLabel, gaps);
    const childIssue = parsePositiveInteger(transfer?.childIssue);
    if (!childIssue) gaps.push(`${transferLabel}.childIssue must be a positive integer`);
    else if (issues.has(childIssue)) gaps.push(`${label} repeats transfer child #${childIssue}`);
    else issues.add(childIssue);
    const normalized = { childIssue };
    for (const [category, pattern] of Object.entries(IDENTIFIER_PATTERNS)) {
      normalized[category] = parseStringArray(transfer?.[category], pattern, `${transferLabel}.${category}`, gaps);
      for (const identifier of normalized[category]) {
        if (identifiers.get(category).has(identifier)) {
          gaps.push(`${label} transfers ${category} identifier ${identifier} more than once`);
        }
        identifiers.get(category).add(identifier);
      }
    }
    transfers.push(normalized);
  }
  return { sourceSpecPath, sourceTree, recordedAt, transfers };
}

export function normalizeEpicScope(value, expectedPath) {
  const gaps = [];
  exactKeys(value, ['schemaVersion', 'epicIssue', 'aggregatePath', 'outcomes', 'children', 'migrations'], 'epic-scope.json', gaps);
  if (value?.schemaVersion !== 1) gaps.push('epic-scope.json schemaVersion must equal 1');
  const epicIssue = parsePositiveInteger(value?.epicIssue);
  if (!epicIssue) gaps.push('epic-scope.json epicIssue must be a positive integer');
  const aggregatePath = normalizeAggregatePath(value?.aggregatePath);
  if (!aggregatePath) gaps.push('epic-scope.json aggregatePath must be a normalized specs/epic-<slug> path');
  if (aggregatePath && expectedPath && aggregatePath !== expectedPath) {
    gaps.push(`epic-scope.json aggregatePath ${aggregatePath} does not match ${expectedPath}`);
  }

  if (!Array.isArray(value?.outcomes) || value.outcomes.length === 0) {
    gaps.push('epic-scope.json outcomes must be a non-empty array');
  }
  const outcomes = [];
  const outcomeIds = new Set();
  for (const [index, outcome] of (Array.isArray(value?.outcomes) ? value.outcomes : []).entries()) {
    const label = `outcomes[${index}]`;
    exactKeys(outcome, ['id', 'childIssues'], label, gaps);
    const id = typeof outcome?.id === 'string' && OUTCOME_ID.test(outcome.id) ? outcome.id : null;
    if (!id) gaps.push(`${label}.id must be an EO### identifier`);
    else if (outcomeIds.has(id)) gaps.push(`epic-scope.json repeats outcome ${id}`);
    else outcomeIds.add(id);
    const childIssues = parseNumberArray(outcome?.childIssues, `${label}.childIssues`, gaps);
    if (childIssues.length === 0) gaps.push(`${label}.childIssues must not be empty`);
    outcomes.push({ id, childIssues });
  }

  if (!Array.isArray(value?.children) || value.children.length === 0) {
    gaps.push('epic-scope.json children must be a non-empty array');
  }
  const children = [];
  const childIssues = new Set();
  const childPaths = new Set();
  for (const [index, child] of (Array.isArray(value?.children) ? value.children : []).entries()) {
    const label = `children[${index}]`;
    exactKeys(child, ['issue', 'specPath', 'packageState', 'outcomes'], label, gaps);
    const issue = parsePositiveInteger(child?.issue);
    if (!issue) gaps.push(`${label}.issue must be a positive integer`);
    else if (childIssues.has(issue)) gaps.push(`epic-scope.json repeats child #${issue}`);
    else childIssues.add(issue);
    const specPath = normalizeChildPath(child?.specPath) ?? normalizeAggregatePath(child?.specPath);
    if (!specPath) gaps.push(`${label}.specPath must be a normalized executable child or nested epic aggregate path`);
    else if (childPaths.has(specPath)) gaps.push(`epic-scope.json repeats child path ${specPath}`);
    else childPaths.add(specPath);
    const packageState = ['planned', 'canonical'].includes(child?.packageState)
      ? child.packageState
      : null;
    if (!packageState) gaps.push(`${label}.packageState must be planned or canonical`);
    const childOutcomes = parseStringArray(child?.outcomes, OUTCOME_ID, `${label}.outcomes`, gaps);
    if (childOutcomes.length === 0) gaps.push(`${label}.outcomes must not be empty`);
    for (const id of childOutcomes) {
      if (!outcomeIds.has(id)) gaps.push(`${label}.outcomes references unknown outcome ${id}`);
    }
    children.push({ issue, specPath, packageState, outcomes: childOutcomes });
  }

  for (const outcome of outcomes) {
    if (!outcome.id) continue;
    const declared = children.filter((child) => child.outcomes.includes(outcome.id)).map((child) => child.issue);
    if (JSON.stringify(uniqueSorted(declared, (left, right) => left - right)) !== JSON.stringify(outcome.childIssues)) {
      gaps.push(`outcome ${outcome.id} childIssues do not match children that declare it`);
    }
  }

  if (!Array.isArray(value?.migrations)) gaps.push('epic-scope.json migrations must be an array');
  const migrations = (Array.isArray(value?.migrations) ? value.migrations : [])
    .map((migration, index) => parseMigration(migration, index, gaps));
  const migrationTrees = migrations.map((migration) => migration.sourceTree).filter(Boolean);
  if (new Set(migrationTrees).size !== migrationTrees.length) gaps.push('epic-scope.json repeats a migration sourceTree');

  return {
    value: { schemaVersion: 1, epicIssue, aggregatePath, outcomes, children, migrations },
    gaps: uniqueSorted(gaps, (left, right) => left.localeCompare(right)),
  };
}

export function normalizeEpicLink(value, expectedPath) {
  const gaps = [];
  exactKeys(value, ['schemaVersion', 'epicIssue', 'epicSpecPath', 'childIssue', 'childSpecPath', 'outcomes'], 'epic-link.json', gaps);
  if (value?.schemaVersion !== 1) gaps.push('epic-link.json schemaVersion must equal 1');
  const epicIssue = parsePositiveInteger(value?.epicIssue);
  const childIssue = parsePositiveInteger(value?.childIssue);
  const epicSpecPath = normalizeAggregatePath(value?.epicSpecPath);
  const childSpecPath = normalizeChildPath(value?.childSpecPath);
  const outcomes = parseStringArray(value?.outcomes, OUTCOME_ID, 'epic-link.json outcomes', gaps);
  if (!epicIssue) gaps.push('epic-link.json epicIssue must be a positive integer');
  if (!childIssue) gaps.push('epic-link.json childIssue must be a positive integer');
  if (!epicSpecPath) gaps.push('epic-link.json epicSpecPath must be a normalized aggregate path');
  if (!childSpecPath) gaps.push('epic-link.json childSpecPath must be a normalized child path');
  if (childSpecPath && expectedPath && childSpecPath !== expectedPath) {
    gaps.push(`epic-link.json childSpecPath ${childSpecPath} does not match ${expectedPath}`);
  }
  if (outcomes.length === 0) gaps.push('epic-link.json outcomes must not be empty');
  return {
    value: { schemaVersion: 1, epicIssue, epicSpecPath, childIssue, childSpecPath, outcomes },
    gaps: uniqueSorted(gaps, (left, right) => left.localeCompare(right)),
  };
}

function run(command, args, cwd, maxBuffer = MAX_TREE_OUTPUT_BYTES) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer,
    env: process.env,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.error?.message ?? result.stderr ?? '',
  };
}

function assertProjectRoot(project) {
  const root = realpathSync(path.resolve(project));
  const top = run('git', ['rev-parse', '--show-toplevel'], root);
  if (!top.ok) throw new Error(`not a Git repository: ${bounded(top.stderr || top.stdout)}`);
  if (realpathSync(top.stdout.trim()) !== root) throw new Error('project must be the Git repository root');
  return root;
}

function createWorktreeSnapshot(project) {
  const root = assertProjectRoot(project);
  const specsRoot = path.join(root, 'specs');
  const realSpecsRoot = realpathSync(specsRoot);
  const directories = readdirSync(specsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => `specs/${entry.name}`)
    .filter((entry) => ANY_SPEC_PATH.test(entry))
    .sort();
  if (directories.length > MAX_SPEC_DIRECTORIES) throw new Error(`spec directory count exceeds ${MAX_SPEC_DIRECTORIES}`);
  const fileCache = new Map();
  return {
    source: 'worktree',
    directories,
    files(specPath) {
      if (fileCache.has(specPath)) return fileCache.get(specPath);
      const directory = path.join(root, specPath);
      const stat = lstatSync(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${specPath} must be a regular directory`);
      const realDirectory = realpathSync(directory);
      const relative = path.relative(realSpecsRoot, realDirectory);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${specPath} resolves outside specs/`);
      const files = readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() || entry.isSymbolicLink())
        .map((entry) => entry.name)
        .sort();
      fileCache.set(specPath, files);
      return files;
    },
    read(relativePath) {
      const normalized = relativePath.replaceAll('\\', '/');
      const specPath = path.posix.dirname(normalized);
      const fileName = path.posix.basename(normalized);
      if (!ANY_SPEC_PATH.test(specPath) || !RELEVANT_FILES.has(fileName)) throw new Error(`unsupported spec artifact ${normalized}`);
      const filePath = path.join(root, normalized);
      const stat = lstatSync(filePath);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${normalized} must be a regular non-symlink file`);
      const limit = fileName.endsWith('.json') ? JSON_LIMIT_BYTES : MARKDOWN_LIMIT_BYTES;
      if (stat.size > limit) throw new Error(`${normalized} exceeds the ${limit}-byte inspection limit`);
      const realFile = realpathSync(filePath);
      const relative = path.relative(realSpecsRoot, realFile);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${normalized} resolves outside specs/`);
      return readFileSync(realFile, 'utf8');
    },
  };
}

function createGitSnapshot(project, source) {
  const root = assertProjectRoot(project);
  if (!SOURCE.test(source ?? '')) throw new Error('source must be a bounded commit-ish without traversal');
  const resolved = run('git', ['rev-parse', '--verify', `${source}^{commit}`], root);
  if (!resolved.ok || !TREE_OID.test(resolved.stdout.trim())) {
    throw new Error(`source could not be resolved: ${bounded(resolved.stderr || resolved.stdout)}`);
  }
  const commit = resolved.stdout.trim();
  const listed = run('git', ['ls-tree', '-r', '--name-only', '-z', commit, '--', 'specs'], root);
  if (!listed.ok) throw new Error(`source tree could not be listed: ${bounded(listed.stderr || listed.stdout)}`);
  const paths = listed.stdout.split('\0').filter(Boolean).map((entry) => entry.replaceAll('\\', '/'));
  const directories = uniqueSorted(paths
    .map((entry) => path.posix.dirname(entry))
    .filter((entry) => ANY_SPEC_PATH.test(entry)), (left, right) => left.localeCompare(right));
  if (directories.length > MAX_SPEC_DIRECTORIES) throw new Error(`spec directory count exceeds ${MAX_SPEC_DIRECTORIES}`);
  const filesByDirectory = new Map(directories.map((directory) => [directory, []]));
  for (const entry of paths) {
    const directory = path.posix.dirname(entry);
    if (filesByDirectory.has(directory)) filesByDirectory.get(directory).push(path.posix.basename(entry));
  }
  return {
    source: commit,
    directories,
    files(specPath) {
      return uniqueSorted(filesByDirectory.get(specPath) ?? [], (left, right) => left.localeCompare(right));
    },
    read(relativePath) {
      const normalized = relativePath.replaceAll('\\', '/');
      const specPath = path.posix.dirname(normalized);
      const fileName = path.posix.basename(normalized);
      if (!ANY_SPEC_PATH.test(specPath) || !RELEVANT_FILES.has(fileName)) throw new Error(`unsupported spec artifact ${normalized}`);
      if (!paths.includes(normalized)) {
        const error = new Error(`${normalized} does not exist in ${commit}`);
        error.code = 'ENOENT';
        throw error;
      }
      const shown = run('git', ['show', `${commit}:${normalized}`], root, MARKDOWN_LIMIT_BYTES + 1_024);
      if (!shown.ok) throw new Error(`${normalized} could not be read: ${bounded(shown.stderr || shown.stdout)}`);
      const limit = fileName.endsWith('.json') ? JSON_LIMIT_BYTES : MARKDOWN_LIMIT_BYTES;
      if (Buffer.byteLength(shown.stdout) > limit) throw new Error(`${normalized} exceeds the ${limit}-byte inspection limit`);
      return shown.stdout;
    },
  };
}

function readOptional(snapshot, relativePath) {
  try {
    return snapshot.read(relativePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function issueFrontmatter(content) {
  const matches = [...String(content ?? '').matchAll(/^\*\*(Issues?)\*\*:\s*(.*?)\s*$/gm)];
  if (matches.length !== 1) return [];
  return matches[0][2].split(',').map((entry) => entry.trim()).map((entry) => {
    const match = entry.match(/^#([1-9]\d*)$/);
    return match ? parsePositiveInteger(match[1]) : null;
  }).filter(Boolean);
}

function aggregateOutcomeIds(requirements) {
  return uniqueSorted([...String(requirements ?? '').matchAll(/^###\s+(EO0*[1-9]\d*):/gm)].map((match) => match[1]));
}

function classifyChild(snapshot, aggregate, child, visitedAggregatePaths) {
  const gaps = [];
  const invalid = [];
  const files = snapshot.directories.includes(child.specPath) ? snapshot.files(child.specPath) : [];
  const packageKind = normalizeAggregatePath(child.specPath) ? 'epic' : 'executable';
  if (child.packageState === 'planned') {
    if (files.some((file) => RELEVANT_FILES.has(file))) {
      gaps.push(`planned child #${child.issue} already has spec artifacts at ${child.specPath}`);
    }
    return {
      status: gaps.length > 0 ? 'repair_required' : 'planned',
      issue: child.issue,
      specPath: child.specPath,
      packageKind,
      packageState: child.packageState,
      outcomes: child.outcomes,
      scope: null,
      gaps,
    };
  }
  if (packageKind === 'epic') {
    if (visitedAggregatePaths.has(child.specPath)) {
      return {
        status: 'unverifiable',
        issue: child.issue,
        specPath: child.specPath,
        packageKind,
        packageState: child.packageState,
        outcomes: child.outcomes,
        scope: null,
        gaps: [`aggregate reference cycle reaches ${child.specPath}`],
      };
    }
    if (!files.includes('epic-scope.json')) {
      return {
        status: 'repair_required',
        issue: child.issue,
        specPath: child.specPath,
        packageKind,
        packageState: child.packageState,
        outcomes: child.outcomes,
        scope: null,
        gaps: [`${child.specPath}/epic-scope.json is required for canonical nested epic #${child.issue}`],
      };
    }
    const nested = classifyAggregateSnapshot(snapshot, child.specPath, {
      mode: 'nested',
      requestedIssue: child.issue,
      nativeChildren: null,
      visitedAggregatePaths,
    });
    if (nested.epicIssue !== child.issue) {
      return {
        status: 'unverifiable',
        issue: child.issue,
        specPath: child.specPath,
        packageKind,
        packageState: child.packageState,
        outcomes: child.outcomes,
        scope: null,
        nestedAuthorityDigest: nested.evidenceDigest,
        gaps: [`nested aggregate ${child.specPath} identifies epic #${nested.epicIssue ?? 'invalid'}, expected #${child.issue}`],
      };
    }
    return {
      status: nested.status === 'planned' ? 'valid' : nested.status,
      issue: child.issue,
      specPath: child.specPath,
      packageKind,
      packageState: child.packageState,
      outcomes: child.outcomes,
      scope: null,
      nestedStatus: nested.status,
      nestedAuthorityDigest: nested.evidenceDigest,
      gaps: nested.gaps,
    };
  }
  for (const required of REQUIRED_CHILD_FILES) {
    if (!files.includes(required)) gaps.push(`${child.specPath}/${required} is required for canonical child #${child.issue}`);
  }
  if (gaps.length > 0) {
    return { status: 'repair_required', issue: child.issue, specPath: child.specPath, packageKind, packageState: child.packageState, outcomes: child.outcomes, scope: null, gaps };
  }

  let linkContent;
  const documents = {};
  try {
    linkContent = snapshot.read(`${child.specPath}/epic-link.json`);
    documents.requirements = snapshot.read(`${child.specPath}/requirements.md`);
    documents.design = snapshot.read(`${child.specPath}/design.md`);
    documents.tasks = snapshot.read(`${child.specPath}/tasks.md`);
    documents.gherkin = snapshot.read(`${child.specPath}/feature.gherkin`);
    documents.manifest = snapshot.read(`${child.specPath}/issue-scope.json`);
  } catch (error) {
    invalid.push(bounded(error.message));
  }
  if (invalid.length > 0) {
    return { status: 'unverifiable', issue: child.issue, specPath: child.specPath, packageKind, packageState: child.packageState, outcomes: child.outcomes, scope: null, gaps: invalid };
  }
  const parsedLink = parseJson(linkContent, `${child.specPath}/epic-link.json`);
  invalid.push(...parsedLink.gaps);
  let link = null;
  if (parsedLink.value) {
    const normalizedLink = normalizeEpicLink(parsedLink.value, child.specPath);
    invalid.push(...normalizedLink.gaps);
    link = normalizedLink.value;
    if (link.epicIssue !== aggregate.epicIssue) invalid.push(`child #${child.issue} link epicIssue does not match #${aggregate.epicIssue}`);
    if (link.epicSpecPath !== aggregate.aggregatePath) invalid.push(`child #${child.issue} link epicSpecPath does not match ${aggregate.aggregatePath}`);
    if (link.childIssue !== child.issue) invalid.push(`child link issue #${link.childIssue ?? 'invalid'} does not match #${child.issue}`);
    if (JSON.stringify(link.outcomes) !== JSON.stringify(child.outcomes)) invalid.push(`child #${child.issue} link outcomes do not match epic-scope.json`);
  }
  const scope = classifyIssueSpecScope({ issueNumber: child.issue, specPath: child.specPath }, documents);
  if (scope.status !== 'scoped') {
    const target = scope.status === 'repair_required' ? gaps : invalid;
    target.push(`child #${child.issue} issue scope is ${scope.status}: ${scope.reasonCode}`);
    target.push(...scope.gaps);
  } else if (scope.contributingIssues.length !== 1 || scope.contributingIssues[0] !== child.issue) {
    invalid.push(`child #${child.issue} package must have exactly one contributing issue`);
  }
  return {
    status: invalid.length > 0 ? 'unverifiable' : gaps.length > 0 ? 'repair_required' : 'valid',
    issue: child.issue,
    specPath: child.specPath,
    packageKind,
    packageState: child.packageState,
    outcomes: child.outcomes,
    scope: { status: scope.status, reasonCode: scope.reasonCode, delivery: scope.delivery },
    gaps: uniqueSorted([...invalid, ...gaps], (left, right) => left.localeCompare(right)),
  };
}

function resultWithDigest(result) {
  const evidence = { ...result };
  delete evidence.evidenceDigest;
  return { ...result, evidenceDigest: evidenceDigest(evidence) };
}

export function classifyAggregateSnapshot(snapshot, aggregatePath, options = {}) {
  const base = {
    mode: options.mode ?? 'epic',
    requestedIssue: options.requestedIssue ?? null,
    source: snapshot.source,
    aggregatePath,
    epicIssue: null,
    outcomes: [],
    children: [],
    nativeChildren: options.nativeChildren ?? null,
    migrations: [],
    gaps: [],
  };
  const visitedAggregatePaths = new Set(options.visitedAggregatePaths ?? []);
  if (visitedAggregatePaths.has(aggregatePath)) {
    return resultWithDigest({
      ...base,
      status: 'unverifiable',
      reasonCode: 'aggregate_reference_cycle',
      gaps: [`aggregate reference cycle reaches ${aggregatePath}`],
    });
  }
  visitedAggregatePaths.add(aggregatePath);
  let scopeContent;
  try {
    scopeContent = snapshot.read(`${aggregatePath}/epic-scope.json`);
  } catch (error) {
    return resultWithDigest({ ...base, status: 'unverifiable', reasonCode: 'aggregate_manifest_read_failed', gaps: [bounded(error.message)] });
  }
  const parsed = parseJson(scopeContent, `${aggregatePath}/epic-scope.json`);
  if (!parsed.value) return resultWithDigest({ ...base, status: 'unverifiable', reasonCode: 'aggregate_manifest_invalid', gaps: parsed.gaps });
  const normalized = normalizeEpicScope(parsed.value, aggregatePath);
  if (normalized.gaps.length > 0) {
    return resultWithDigest({
      ...base,
      epicIssue: normalized.value.epicIssue,
      outcomes: normalized.value.outcomes,
      children: normalized.value.children,
      migrations: normalized.value.migrations,
      status: 'unverifiable',
      reasonCode: 'aggregate_manifest_invalid',
      gaps: normalized.gaps,
    });
  }
  const aggregate = normalized.value;
  const repairGaps = [];
  const invalidGaps = [];
  const files = snapshot.files(aggregatePath);
  for (const required of ['requirements.md', 'design.md', 'epic-scope.json']) {
    if (!files.includes(required)) repairGaps.push(`${aggregatePath}/${required} is required`);
  }
  for (const forbidden of FORBIDDEN_AGGREGATE_FILES) {
    if (files.includes(forbidden)) repairGaps.push(`${aggregatePath}/${forbidden} gives executable ownership to an epic aggregate`);
  }
  let requirements = '';
  let design = '';
  if (repairGaps.length === 0) {
    try {
      requirements = snapshot.read(`${aggregatePath}/requirements.md`);
      design = snapshot.read(`${aggregatePath}/design.md`);
    } catch (error) {
      invalidGaps.push(bounded(error.message));
    }
  }
  if (requirements) {
    for (const [label, content] of [['requirements.md', requirements], ['design.md', design]]) {
      const issues = issueFrontmatter(content);
      if (issues.length !== 1 || issues[0] !== aggregate.epicIssue) {
        invalidGaps.push(`${aggregatePath}/${label} must identify only epic #${aggregate.epicIssue}`);
      }
    }
    if (/^###\s+AC[1-9]\d*:/m.test(requirements) || /^\|\s*FR[1-9]\d*\s*\|/m.test(requirements)) {
      repairGaps.push(`${aggregatePath}/requirements.md contains executable AC or FR identifiers`);
    }
    const documentOutcomes = aggregateOutcomeIds(requirements);
    const manifestOutcomes = aggregate.outcomes.map((outcome) => outcome.id).sort(compareIds);
    if (JSON.stringify(documentOutcomes) !== JSON.stringify(manifestOutcomes)) {
      repairGaps.push(`${aggregatePath}/requirements.md EO headings do not match epic-scope.json outcomes`);
    }
  }

  if (options.nativeChildren !== null && options.nativeChildren !== undefined) {
    const nativeGaps = [];
    const normalizedNative = parseNumberArray(options.nativeChildren, 'native children', nativeGaps);
    if (nativeGaps.length > 0) invalidGaps.push(...nativeGaps);
    else {
      const manifestChildren = aggregate.children.map((child) => child.issue).sort((left, right) => left - right);
      if (JSON.stringify(normalizedNative) !== JSON.stringify(manifestChildren)) {
        repairGaps.push(`epic #${aggregate.epicIssue} native children do not match epic-scope.json`);
      }
    }
  }

  const children = aggregate.children.map((child) => classifyChild(snapshot, aggregate, child, visitedAggregatePaths));
  const requested = options.requestedChild
    ? children.find((child) => child.issue === options.requestedChild)
    : null;
  if (options.requestedChild && !requested) repairGaps.push(`child #${options.requestedChild} is not declared by epic #${aggregate.epicIssue}`);
  for (const child of children) {
    (child.status === 'unverifiable' ? invalidGaps : child.status === 'repair_required' ? repairGaps : []).push(...child.gaps);
  }

  for (const directory of snapshot.directories) {
    if (directory === aggregatePath || !snapshot.files(directory).includes('epic-link.json')) continue;
    try {
      const linkJson = parseJson(snapshot.read(`${directory}/epic-link.json`), `${directory}/epic-link.json`);
      if (!linkJson.value) continue;
      const link = normalizeEpicLink(linkJson.value, directory);
      if (link.gaps.length === 0 && link.value.epicIssue === aggregate.epicIssue
        && !aggregate.children.some((child) => child.issue === link.value.childIssue && child.specPath === directory)) {
        repairGaps.push(`${directory}/epic-link.json is not declared by epic #${aggregate.epicIssue}`);
      }
    } catch (error) {
      invalidGaps.push(bounded(error.message));
    }
  }

  let status = 'valid';
  let reasonCode = 'epic_spec_authority_valid';
  if (invalidGaps.length > 0) {
    status = 'unverifiable';
    reasonCode = 'epic_spec_authority_invalid';
  } else if (repairGaps.length > 0) {
    status = 'repair_required';
    reasonCode = 'epic_spec_authority_repair_required';
  } else if ((requested?.status ?? null) === 'planned' || (!options.requestedChild && children.some((child) => child.status === 'planned'))) {
    status = 'planned';
    reasonCode = options.requestedChild ? 'child_spec_planned' : 'epic_has_planned_children';
  }
  return resultWithDigest({
    ...base,
    status,
    reasonCode,
    epicIssue: aggregate.epicIssue,
    outcomes: aggregate.outcomes,
    children,
    migrations: aggregate.migrations,
    requestedChild: requested ?? null,
    gaps: uniqueSorted([...invalidGaps, ...repairGaps], (left, right) => left.localeCompare(right)),
  });
}

function manifestDirectories(snapshot, fileName) {
  return snapshot.directories.filter((directory) => snapshot.files(directory).includes(fileName));
}

function rawMentionsIssue(content, field, issueNumber) {
  return new RegExp(`"${field}"\\s*:\\s*${issueNumber}(?:\\D|$)`).test(String(content ?? ''));
}

function legacyCandidates(snapshot, epicIssue) {
  const candidates = [];
  for (const directory of snapshot.directories.filter((entry) => !entry.startsWith('specs/epic-'))) {
    const files = snapshot.files(directory);
    if (!files.includes('requirements.md')) continue;
    try {
      const requirements = snapshot.read(`${directory}/requirements.md`);
      if (issueFrontmatter(requirements).includes(epicIssue)
        && files.includes('tasks.md') && files.includes('feature.gherkin')) candidates.push(directory);
    } catch {
      // A read failure is surfaced if this becomes the selected candidate.
    }
  }
  return candidates.sort();
}

export function inspectEpicSpecAuthority(options = {}) {
  const mode = options.mode;
  const requestedIssue = parsePositiveInteger(options.issueNumber);
  if (!['epic', 'child', 'all'].includes(mode)) {
    return resultWithDigest({ status: 'unverifiable', reasonCode: 'mode_invalid', mode: mode ?? null, requestedIssue, source: options.source ?? 'worktree', aggregatePath: null, epicIssue: null, outcomes: [], children: [], nativeChildren: options.nativeChildren ?? null, migrations: [], gaps: ['mode must be epic, child, or all'] });
  }
  if (mode !== 'all' && requestedIssue === null) {
    return resultWithDigest({ status: 'unverifiable', reasonCode: 'requested_issue_invalid', mode, requestedIssue, source: options.source ?? 'worktree', aggregatePath: null, epicIssue: null, outcomes: [], children: [], nativeChildren: options.nativeChildren ?? null, migrations: [], gaps: ['issueNumber must be a positive integer'] });
  }
  let snapshot;
  try {
    snapshot = options.source
      ? createGitSnapshot(options.project, options.source)
      : createWorktreeSnapshot(options.project);
  } catch (error) {
    return resultWithDigest({ status: 'unverifiable', reasonCode: 'snapshot_unavailable', mode, requestedIssue, source: options.source ?? 'worktree', aggregatePath: null, epicIssue: null, outcomes: [], children: [], nativeChildren: options.nativeChildren ?? null, migrations: [], gaps: [bounded(error.message)] });
  }

  const aggregateDirectories = manifestDirectories(snapshot, 'epic-scope.json');
  if (mode === 'epic') {
    const matches = [];
    const malformed = [];
    for (const directory of aggregateDirectories) {
      try {
        const content = snapshot.read(`${directory}/epic-scope.json`);
        const parsed = parseJson(content, `${directory}/epic-scope.json`);
        if (parsed.value && parsePositiveInteger(parsed.value.epicIssue) === requestedIssue) matches.push(directory);
        else if (!parsed.value && rawMentionsIssue(content, 'epicIssue', requestedIssue)) malformed.push(...parsed.gaps);
      } catch (error) {
        malformed.push(bounded(error.message));
      }
    }
    if (matches.length > 1) {
      return resultWithDigest({ status: 'unverifiable', reasonCode: 'duplicate_epic_aggregate', mode, requestedIssue, source: snapshot.source, aggregatePath: null, epicIssue: requestedIssue, outcomes: [], children: [], nativeChildren: options.nativeChildren ?? null, migrations: [], gaps: [`epic #${requestedIssue} has multiple aggregate paths: ${matches.join(', ')}`] });
    }
    if (matches.length === 1) return classifyAggregateSnapshot(snapshot, matches[0], {
      mode,
      requestedIssue,
      requestedChild: options.requestedChild,
      nativeChildren: options.nativeChildren,
    });
    if (malformed.length > 0) {
      return resultWithDigest({ status: 'unverifiable', reasonCode: 'aggregate_manifest_invalid', mode, requestedIssue, source: snapshot.source, aggregatePath: null, epicIssue: requestedIssue, outcomes: [], children: [], nativeChildren: options.nativeChildren ?? null, migrations: [], gaps: malformed });
    }
    const legacy = legacyCandidates(snapshot, requestedIssue);
    if (legacy.length > 1) {
      return resultWithDigest({ status: 'unverifiable', reasonCode: 'legacy_epic_spec_ambiguous', mode, requestedIssue, source: snapshot.source, aggregatePath: null, epicIssue: requestedIssue, outcomes: [], children: [], nativeChildren: options.nativeChildren ?? null, migrations: [], gaps: [`epic #${requestedIssue} appears in multiple executable legacy specs: ${legacy.join(', ')}`] });
    }
    if (legacy.length === 1) {
      return resultWithDigest({ status: 'repair_required', reasonCode: 'legacy_cumulative_epic_spec', mode, requestedIssue, source: snapshot.source, aggregatePath: null, epicIssue: requestedIssue, outcomes: [], children: [], nativeChildren: options.nativeChildren ?? null, migrations: [], legacySpecPath: legacy[0], gaps: [`${legacy[0]} gives executable spec authority to epic #${requestedIssue}`] });
    }
    return resultWithDigest({ status: 'planned', reasonCode: 'aggregate_not_authored', mode, requestedIssue, source: snapshot.source, aggregatePath: null, epicIssue: requestedIssue, outcomes: [], children: [], nativeChildren: options.nativeChildren ?? null, migrations: [], gaps: [] });
  }

  if (mode === 'child') {
    const matches = [];
    const malformed = [];
    for (const directory of manifestDirectories(snapshot, 'epic-link.json')) {
      try {
        const content = snapshot.read(`${directory}/epic-link.json`);
        const parsed = parseJson(content, `${directory}/epic-link.json`);
        if (parsed.value && parsePositiveInteger(parsed.value.childIssue) === requestedIssue) {
          const link = normalizeEpicLink(parsed.value, directory);
          if (link.gaps.length > 0) malformed.push(...link.gaps);
          else matches.push(link.value);
        } else if (!parsed.value && rawMentionsIssue(content, 'childIssue', requestedIssue)) malformed.push(...parsed.gaps);
      } catch (error) {
        malformed.push(bounded(error.message));
      }
    }
    if (matches.length > 1) {
      return resultWithDigest({ status: 'unverifiable', reasonCode: 'duplicate_child_link', mode, requestedIssue, source: snapshot.source, aggregatePath: null, epicIssue: null, outcomes: [], children: [], nativeChildren: options.nativeChildren ?? null, migrations: [], gaps: [`child #${requestedIssue} has multiple epic links`] });
    }
    if (matches.length === 0) {
      return resultWithDigest({ status: malformed.length > 0 ? 'unverifiable' : 'repair_required', reasonCode: malformed.length > 0 ? 'child_link_invalid' : 'child_link_missing', mode, requestedIssue, source: snapshot.source, aggregatePath: null, epicIssue: null, outcomes: [], children: [], nativeChildren: options.nativeChildren ?? null, migrations: [], gaps: malformed.length > 0 ? malformed : [`child #${requestedIssue} has no epic-link.json`] });
    }
    const link = matches[0];
    if (!aggregateDirectories.includes(link.epicSpecPath)) {
      return resultWithDigest({ status: 'repair_required', reasonCode: 'aggregate_manifest_missing', mode, requestedIssue, source: snapshot.source, aggregatePath: link.epicSpecPath, epicIssue: link.epicIssue, outcomes: link.outcomes, children: [], nativeChildren: options.nativeChildren ?? null, migrations: [], gaps: [`${link.epicSpecPath}/epic-scope.json is missing`] });
    }
    return classifyAggregateSnapshot(snapshot, link.epicSpecPath, { mode, requestedIssue, requestedChild: requestedIssue, nativeChildren: options.nativeChildren });
  }

  const findings = aggregateDirectories.map((directory) => classifyAggregateSnapshot(snapshot, directory, {
    mode: 'all',
    nativeChildren: null,
  }));
  const orphanLinks = [];
  for (const directory of manifestDirectories(snapshot, 'epic-link.json')) {
    if (findings.some((finding) => finding.children.some((child) => child.specPath === directory))) continue;
    orphanLinks.push(`${directory}/epic-link.json is not owned by a discovered aggregate`);
  }
  let status = 'valid';
  let reasonCode = 'all_epic_spec_authority_valid';
  if (findings.some((finding) => finding.status === 'unverifiable')) {
    status = 'unverifiable';
    reasonCode = 'epic_spec_audit_unverifiable';
  } else if (orphanLinks.length > 0 || findings.some((finding) => finding.status === 'repair_required')) {
    status = 'repair_required';
    reasonCode = 'epic_spec_audit_repair_required';
  } else if (findings.some((finding) => finding.status === 'planned')) {
    status = 'planned';
    reasonCode = 'epic_spec_audit_has_planned_children';
  }
  return resultWithDigest({ status, reasonCode, mode, requestedIssue: null, source: snapshot.source, aggregatePath: null, epicIssue: null, outcomes: [], children: [], nativeChildren: null, migrations: [], findings, gaps: orphanLinks });
}

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: 'string' },
      epic: { type: 'string' },
      child: { type: 'string' },
      all: { type: 'boolean', default: false },
      source: { type: 'string' },
      'native-children': { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  if (!values.project) throw new Error('--project is required');
  if (!values.json) throw new Error('--json is required');
  const modes = [Boolean(values.epic), Boolean(values.child), values.all].filter(Boolean).length;
  if (modes !== 1) throw new Error('choose exactly one mode: --epic, --child, or --all');
  const issueNumber = values.epic
    ? parsePositiveInteger(values.epic)
    : values.child ? parsePositiveInteger(values.child) : null;
  if ((values.epic || values.child) && !issueNumber) throw new Error('issue mode value must be a positive integer');
  let nativeChildren = null;
  if (values['native-children'] !== undefined) {
    if (!values.epic && !values.child) throw new Error('--native-children is valid only with --epic or --child');
    const raw = values['native-children'].trim();
    nativeChildren = raw === '' ? [] : raw.split(',').map((entry) => parsePositiveInteger(entry.trim()));
    if (nativeChildren.some((entry) => !entry) || new Set(nativeChildren).size !== nativeChildren.length) {
      throw new Error('--native-children must be a unique comma-separated list of positive integers');
    }
  }
  return {
    project: path.resolve(values.project),
    mode: values.epic ? 'epic' : values.child ? 'child' : 'all',
    issueNumber,
    source: values.source,
    nativeChildren,
  };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/epic-spec-authority.mjs --project <path> --epic <N> [--source <commit-ish>] [--native-children <N,...>] --json',
    '  node scripts/epic-spec-authority.mjs --project <path> --child <N> [--source <commit-ish>] [--native-children <N,...>] --json',
    '  node scripts/epic-spec-authority.mjs --project <path> --all [--source <commit-ish>] --json',
  ].join('\n');
}

function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Argument error: ${error.message}\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(inspectEpicSpecAuthority(options), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
