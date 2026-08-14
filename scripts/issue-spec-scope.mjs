#!/usr/bin/env node

/**
 * Read-only issue-scope classifier for cumulative nmg-sdlc specifications.
 *
 * The classifier validates a spec-local issue-scope.json manifest against the
 * AC, FR, task, and stable scenario identifiers in the canonical spec files.
 */

import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const SPEC_PATH = /^specs\/[a-z0-9][a-z0-9-]*$/;
const MARKDOWN_LIMIT_BYTES = 256 * 1024;
const MANIFEST_LIMIT_BYTES = 128 * 1024;
const GROUP_CATEGORIES = Object.freeze({
  owned: Object.freeze(['acceptanceCriteria', 'functionalRequirements', 'tasks', 'scenarios']),
  adopted: Object.freeze(['acceptanceCriteria', 'functionalRequirements', 'tasks', 'scenarios']),
  regression: Object.freeze(['acceptanceCriteria', 'functionalRequirements', 'scenarios']),
});
const INVENTORY_CATEGORIES = Object.freeze(['acceptanceCriteria', 'functionalRequirements', 'tasks', 'scenarios']);
const ID_PATTERNS = Object.freeze({
  acceptanceCriteria: /^AC[1-9]\d*$/,
  functionalRequirements: /^FR[1-9]\d*$/,
  tasks: /^T0*[1-9]\d*$/,
  scenarios: /^SCN0*[1-9]\d*$/,
});

function emptyInventory() {
  return {
    acceptanceCriteria: [],
    functionalRequirements: [],
    tasks: [],
    scenarios: [],
  };
}

function emptyRegression() {
  return {
    acceptanceCriteria: [],
    functionalRequirements: [],
    scenarios: [],
  };
}

function emptyActive() {
  return {
    owned: emptyInventory(),
    adopted: emptyInventory(),
  };
}

function emptyOwnership() {
  return {
    acceptanceCriteria: {},
    functionalRequirements: {},
    tasks: {},
    scenarios: {},
  };
}

function compareIds(left, right) {
  const leftMatch = String(left).match(/^([A-Z]+)(\d+)$/);
  const rightMatch = String(right).match(/^([A-Z]+)(\d+)$/);
  if (leftMatch && rightMatch && leftMatch[1] === rightMatch[1]) {
    return Number(leftMatch[2]) - Number(rightMatch[2]);
  }
  if (leftMatch && rightMatch) return leftMatch[1].localeCompare(rightMatch[1]);
  if (leftMatch) return -1;
  if (rightMatch) return 1;
  return String(left).localeCompare(String(right));
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareIds);
}

function bounded(value) {
  const message = String(value ?? '').replace(/\s+/g, ' ').trim();
  return message.length > 300 ? `${message.slice(0, 297)}...` : message;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parsePositiveInteger(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function normalizeSpecPath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replaceAll('\\', '/').replace(/\/$/, '');
  if (!SPEC_PATH.test(normalized) || path.posix.normalize(normalized) !== normalized) return null;
  return normalized;
}

function normalizeExpected(options) {
  const issueNumber = typeof options?.issueNumber === 'number'
    ? options.issueNumber
    : parsePositiveInteger(String(options?.issueNumber ?? ''));
  return {
    issueNumber,
    specPath: normalizeSpecPath(options?.specPath),
  };
}

function baseResult(expected) {
  return {
    status: 'unverifiable',
    reasonCode: 'unclassified',
    issueNumber: expected.issueNumber ?? null,
    specPath: expected.specPath ?? null,
    manifestPath: expected.specPath ? `${expected.specPath}/issue-scope.json` : null,
    manifestPresent: false,
    contributingIssues: [],
    inventory: emptyInventory(),
    active: emptyActive(),
    delivery: emptyInventory(),
    regression: emptyRegression(),
    ownership: emptyOwnership(),
    gaps: [],
  };
}

function result(status, reasonCode, expected, evidence = {}) {
  return {
    ...baseResult(expected),
    ...evidence,
    status,
    reasonCode,
    gaps: evidence.gaps ?? [],
  };
}

function parseIssueField(content, label, gaps) {
  const matches = [...String(content ?? '').matchAll(/^\*\*(Issues?)\*\*:\s*(.*?)\s*$/gm)];
  if (matches.length !== 1) {
    gaps.push(`${label} must contain exactly one Issues or Issue frontmatter field`);
    return null;
  }
  const kind = matches[0][1] === 'Issues' ? 'plural' : 'singular';
  const values = matches[0][2].split(',').map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) {
    gaps.push(`${label} issue frontmatter is empty`);
    return null;
  }
  const issues = [];
  for (const value of values) {
    const match = value.match(/^#([1-9]\d*)$/);
    const issue = match ? parsePositiveInteger(match[1]) : null;
    if (!issue) {
      gaps.push(`${label} has invalid issue reference ${value || '(empty)'}`);
      continue;
    }
    issues.push(issue);
  }
  if (new Set(issues).size !== issues.length) gaps.push(`${label} repeats an issue reference`);
  if (kind === 'singular' && issues.length !== 1) gaps.push(`${label} singular Issue field must contain one issue`);
  return { kind, issues: [...new Set(issues)].sort((left, right) => left - right) };
}

function extractHeadingIds(content, pattern, label, gaps) {
  const values = [];
  for (const line of String(content ?? '').split(/\r?\n/)) {
    const match = line.match(pattern);
    if (match) values.push(match[1]);
  }
  if (new Set(values).size !== values.length) gaps.push(`${label} contains duplicate identifiers`);
  return sortedUnique(values);
}

function extractScenarios(content, gaps) {
  const scenarios = [];
  let pendingTags = [];
  for (const line of String(content ?? '').split(/\r?\n/)) {
    const tags = [...line.matchAll(/(?:^|\s)@(SCN0*[1-9]\d*)(?=\s|$)/g)].map((match) => match[1]);
    if (tags.length > 0) pendingTags.push(...tags);
    const scenario = line.match(/^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/);
    if (!scenario) continue;
    if (pendingTags.length > 1) gaps.push(`scenario ${scenario[1]} has multiple stable SCN tags`);
    scenarios.push(pendingTags[0] ?? `SCENARIO:${scenario[1]}`);
    pendingTags = [];
  }
  if (new Set(scenarios).size !== scenarios.length) gaps.push('feature.gherkin contains duplicate scenario identifiers or names');
  return sortedUnique(scenarios);
}

function extractInventory(documents, gaps) {
  return {
    acceptanceCriteria: extractHeadingIds(
      documents.requirements,
      /^###\s+(AC[1-9]\d*):/,
      'requirements.md acceptance criteria',
      gaps,
    ),
    functionalRequirements: extractHeadingIds(
      documents.requirements,
      /^\|\s*(FR[1-9]\d*)\s*\|/,
      'requirements.md functional requirements',
      gaps,
    ),
    tasks: extractHeadingIds(
      documents.tasks,
      /^#{2,3}\s+(T0*[1-9]\d*):/,
      'tasks.md tasks',
      gaps,
    ),
    scenarios: extractScenarios(documents.gherkin, gaps),
  };
}

function exactKeys(value, expectedKeys, label, invalidGaps) {
  if (!isPlainObject(value)) {
    invalidGaps.push(`${label} must be an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  const extras = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (extras.length > 0) invalidGaps.push(`${label} has unexpected keys: ${extras.join(', ')}`);
  if (missing.length > 0) invalidGaps.push(`${label} is missing keys: ${missing.join(', ')}`);
  return extras.length === 0 && missing.length === 0;
}

function parseCategory(value, category, label, invalidGaps) {
  if (!Array.isArray(value)) {
    invalidGaps.push(`${label}.${category} must be an array`);
    return [];
  }
  const parsed = [];
  for (const item of value) {
    if (typeof item !== 'string' || !ID_PATTERNS[category].test(item)) {
      invalidGaps.push(`${label}.${category} has invalid identifier ${JSON.stringify(item)}`);
      continue;
    }
    parsed.push(item);
  }
  if (new Set(parsed).size !== parsed.length) invalidGaps.push(`${label}.${category} repeats an identifier`);
  return sortedUnique(parsed);
}

function parseGroup(entry, group, invalidGaps) {
  const categories = GROUP_CATEGORIES[group];
  const value = entry?.[group];
  exactKeys(value, categories, group, invalidGaps);
  const parsed = {};
  for (const category of categories) {
    parsed[category] = parseCategory(value?.[category], category, group, invalidGaps);
  }
  return parsed;
}

function normalizeManifest(manifest, contributors, inventory) {
  const invalidGaps = [];
  const repairGaps = [];
  exactKeys(manifest, ['schemaVersion', 'issues'], 'issue-scope.json', invalidGaps);
  if (manifest?.schemaVersion !== 1) invalidGaps.push('issue-scope.json schemaVersion must equal 1');
  if (!isPlainObject(manifest?.issues)) invalidGaps.push('issue-scope.json issues must be an object');

  const entries = {};
  for (const [issueKey, entry] of Object.entries(isPlainObject(manifest?.issues) ? manifest.issues : {})) {
    if (!/^[1-9]\d*$/.test(issueKey) || !Number.isSafeInteger(Number(issueKey))) {
      invalidGaps.push(`issue-scope.json has invalid issue key ${issueKey}`);
      continue;
    }
    const issueNumber = Number(issueKey);
    exactKeys(entry, Object.keys(GROUP_CATEGORIES), `issue ${issueKey}`, invalidGaps);
    entries[issueNumber] = {
      owned: parseGroup(entry, 'owned', invalidGaps),
      adopted: parseGroup(entry, 'adopted', invalidGaps),
      regression: parseGroup(entry, 'regression', invalidGaps),
    };
  }

  const contributorSet = new Set(contributors);
  for (const issueNumber of contributors) {
    if (!entries[issueNumber]) repairGaps.push(`contributing issue #${issueNumber} has no scope entry`);
  }
  for (const issueNumber of Object.keys(entries).map(Number)) {
    if (!contributorSet.has(issueNumber)) invalidGaps.push(`scope entry #${issueNumber} is not in spec frontmatter`);
  }

  const inventorySets = Object.fromEntries(
    INVENTORY_CATEGORIES.map((category) => [category, new Set(inventory[category])]),
  );
  const owners = Object.fromEntries(INVENTORY_CATEGORIES.map((category) => [category, new Map()]));

  for (const [issueKey, entry] of Object.entries(entries)) {
    const issueNumber = Number(issueKey);
    for (const category of INVENTORY_CATEGORIES) {
      for (const identifier of entry.owned[category]) {
        if (!inventorySets[category].has(identifier)) {
          invalidGaps.push(`issue #${issueNumber} owns unknown ${category} identifier ${identifier}`);
          continue;
        }
        const existing = owners[category].get(identifier) ?? [];
        owners[category].set(identifier, [...existing, issueNumber]);
      }
    }
  }

  for (const category of INVENTORY_CATEGORIES) {
    for (const identifier of inventory[category]) {
      if (category === 'scenarios' && identifier.startsWith('SCENARIO:')) {
        repairGaps.push(`${identifier} is missing a stable @SCN tag`);
        continue;
      }
      const identifierOwners = owners[category].get(identifier) ?? [];
      if (identifierOwners.length === 0) repairGaps.push(`${category} identifier ${identifier} has no owner`);
      if (identifierOwners.length > 1) {
        invalidGaps.push(`${category} identifier ${identifier} has multiple owners: ${identifierOwners.map((value) => `#${value}`).join(', ')}`);
      }
    }
  }

  for (const [issueKey, entry] of Object.entries(entries)) {
    const issueNumber = Number(issueKey);
    for (const category of INVENTORY_CATEGORIES) {
      const deliverySeen = new Set(entry.owned[category]);
      for (const identifier of entry.adopted[category]) {
        if (deliverySeen.has(identifier)) {
          invalidGaps.push(`issue #${issueNumber} both owns and adopts ${category} identifier ${identifier}`);
        }
        deliverySeen.add(identifier);
        if (!inventorySets[category].has(identifier)) {
          invalidGaps.push(`issue #${issueNumber} adopts unknown ${category} identifier ${identifier}`);
          continue;
        }
        const identifierOwners = owners[category].get(identifier) ?? [];
        if (identifierOwners.length === 0) repairGaps.push(`adopted ${category} identifier ${identifier} has no owner`);
        if (identifierOwners.includes(issueNumber)) {
          invalidGaps.push(`issue #${issueNumber} cannot adopt its own ${category} identifier ${identifier}`);
        }
      }
      if (!GROUP_CATEGORIES.regression.includes(category)) continue;
      for (const identifier of entry.regression[category]) {
        if (deliverySeen.has(identifier)) {
          invalidGaps.push(`issue #${issueNumber} uses ${category} identifier ${identifier} for both delivery and regression`);
        }
        if (!inventorySets[category].has(identifier)) {
          invalidGaps.push(`issue #${issueNumber} declares unknown regression ${category} identifier ${identifier}`);
          continue;
        }
        const identifierOwners = owners[category].get(identifier) ?? [];
        if (identifierOwners.length === 0) repairGaps.push(`regression ${category} identifier ${identifier} has no owner`);
        if (identifierOwners.includes(issueNumber)) {
          invalidGaps.push(`issue #${issueNumber} cannot declare its own ${category} identifier ${identifier} as prior regression`);
        }
      }
    }
  }

  const ownership = {};
  for (const category of INVENTORY_CATEGORIES) {
    ownership[category] = {};
    for (const identifier of inventory[category]) {
      const identifierOwners = owners[category].get(identifier) ?? [];
      if (identifierOwners.length === 1) ownership[category][identifier] = identifierOwners[0];
    }
  }

  return { entries, ownership, invalidGaps: sortedUnique(invalidGaps), repairGaps: sortedUnique(repairGaps) };
}

function implicitEvidence(expected, contributors, inventory, frontmatterKind) {
  const ownership = {};
  for (const category of INVENTORY_CATEGORIES) {
    ownership[category] = Object.fromEntries(inventory[category].map((identifier) => [identifier, expected.issueNumber]));
  }
  return {
    manifestPresent: false,
    contributingIssues: contributors,
    frontmatterKind,
    inventory,
    active: { owned: structuredClone(inventory), adopted: emptyInventory() },
    delivery: structuredClone(inventory),
    regression: emptyRegression(),
    ownership,
    gaps: [],
  };
}

export function classifyIssueSpecScope(options, documents) {
  const expected = normalizeExpected(options);
  const inputGaps = [];
  if (!Number.isSafeInteger(expected.issueNumber) || expected.issueNumber <= 0) {
    inputGaps.push('issue must be a positive integer');
  }
  if (!expected.specPath) inputGaps.push('spec must be a normalized specs/<slug> path');
  if (inputGaps.length > 0) return result('unverifiable', 'invalid_input', expected, { gaps: inputGaps });

  const gaps = [];
  for (const name of ['requirements', 'design', 'tasks', 'gherkin']) {
    if (typeof documents?.[name] !== 'string') gaps.push(`${name} content is missing`);
  }
  if (gaps.length > 0) return result('unverifiable', 'spec_files_missing', expected, { gaps });

  const fields = [
    parseIssueField(documents.requirements, 'requirements.md', gaps),
    parseIssueField(documents.design, 'design.md', gaps),
    parseIssueField(documents.tasks, 'tasks.md', gaps),
  ].filter(Boolean);
  const primary = fields[0];
  for (const field of fields.slice(1)) {
    if (field.kind !== primary?.kind || field.issues.join(',') !== primary?.issues.join(',')) {
      gaps.push('requirements.md, design.md, and tasks.md issue frontmatter does not match');
    }
  }
  const inventory = extractInventory(documents, gaps);
  const contributors = primary?.issues ?? [];
  if (!contributors.includes(expected.issueNumber)) {
    gaps.push(`active issue #${expected.issueNumber} is not listed in spec frontmatter`);
  }
  if (gaps.length > 0) {
    return result('unverifiable', 'spec_inventory_invalid', expected, {
      contributingIssues: contributors,
      inventory,
      gaps: sortedUnique(gaps),
    });
  }

  if (documents.manifest === null || documents.manifest === undefined) {
    if (contributors.length === 1) {
      return result(
        'implicit_single_issue',
        primary.kind === 'singular' ? 'singular_defect_scope' : 'single_contributor_scope',
        expected,
        implicitEvidence(expected, contributors, inventory, primary.kind),
      );
    }
    return result('repair_required', 'cumulative_manifest_missing', expected, {
      manifestPresent: false,
      contributingIssues: contributors,
      frontmatterKind: primary.kind,
      inventory,
      gaps: [`${expected.specPath}/issue-scope.json is required for a multi-issue spec`],
    });
  }

  let manifest;
  try {
    manifest = JSON.parse(documents.manifest);
  } catch (error) {
    return result('unverifiable', 'manifest_json_invalid', expected, {
      manifestPresent: true,
      contributingIssues: contributors,
      frontmatterKind: primary.kind,
      inventory,
      gaps: [bounded(error.message)],
    });
  }

  const normalized = normalizeManifest(manifest, contributors, inventory);
  const commonEvidence = {
    manifestPresent: true,
    contributingIssues: contributors,
    frontmatterKind: primary.kind,
    inventory,
    ownership: normalized.ownership,
  };
  if (normalized.invalidGaps.length > 0) {
    return result('unverifiable', 'scope_mapping_invalid', expected, {
      ...commonEvidence,
      gaps: normalized.invalidGaps,
    });
  }
  if (!normalized.entries[expected.issueNumber]) {
    normalized.repairGaps.push(`active issue #${expected.issueNumber} has no scope entry`);
  }
  if (normalized.repairGaps.length > 0) {
    return result('repair_required', 'scope_mapping_incomplete', expected, {
      ...commonEvidence,
      gaps: sortedUnique(normalized.repairGaps),
    });
  }

  const active = normalized.entries[expected.issueNumber];
  const delivery = {};
  for (const category of INVENTORY_CATEGORIES) {
    delivery[category] = sortedUnique([...active.owned[category], ...active.adopted[category]]);
  }
  return result('scoped', 'active_issue_scope_resolved', expected, {
    ...commonEvidence,
    active: {
      owned: structuredClone(active.owned),
      adopted: structuredClone(active.adopted),
    },
    delivery,
    regression: structuredClone(active.regression),
    gaps: [],
  });
}

export function inspectIssueSpecScope(options, adapters = {}) {
  const expected = normalizeExpected(options);
  if (!Number.isSafeInteger(expected.issueNumber) || expected.issueNumber <= 0 || !expected.specPath) {
    return classifyIssueSpecScope(expected, {});
  }
  const projectRoot = path.resolve(options.projectRoot ?? '.');
  const specRoot = path.resolve(projectRoot, expected.specPath);
  const lstat = adapters.lstat ?? ((filePath) => lstatSync(filePath));
  const realpath = adapters.realpath ?? ((filePath) => realpathSync(filePath));
  let realProjectRoot;
  let realSpecRoot;
  try {
    realProjectRoot = realpath(projectRoot);
    const specStat = lstat(specRoot);
    if (specStat.isSymbolicLink() || !specStat.isDirectory()) {
      return result('unverifiable', 'spec_path_invalid', expected, {
        gaps: ['spec path must resolve to a regular directory without a symbolic link'],
      });
    }
    realSpecRoot = realpath(specRoot);
  } catch (error) {
    return result('unverifiable', 'spec_path_invalid', expected, {
      gaps: [`${expected.specPath}: ${bounded(error.message)}`],
    });
  }
  const relative = path.relative(realProjectRoot, realSpecRoot);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return result('unverifiable', 'spec_path_outside_project', expected, {
      gaps: ['spec path resolves outside the project root'],
    });
  }
  const readFile = adapters.readFile ?? ((filePath) => readFileSync(filePath, 'utf8'));
  const documents = {};
  const files = {
    requirements: 'requirements.md',
    design: 'design.md',
    tasks: 'tasks.md',
    gherkin: 'feature.gherkin',
  };
  for (const [key, fileName] of Object.entries(files)) {
    try {
      const filePath = path.join(specRoot, fileName);
      const fileStat = lstat(filePath);
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
        throw new Error('must be a regular file and not a symbolic link');
      }
      if (fileStat.size > MARKDOWN_LIMIT_BYTES) {
        throw new Error(`exceeds the ${MARKDOWN_LIMIT_BYTES}-byte inspection limit`);
      }
      documents[key] = readFile(filePath);
    } catch (error) {
      return result('unverifiable', 'spec_read_failed', expected, {
        gaps: [`${expected.specPath}/${fileName}: ${bounded(error.message)}`],
      });
    }
  }
  try {
    const manifestPath = path.join(specRoot, 'issue-scope.json');
    const manifestStat = lstat(manifestPath);
    if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) {
      throw new Error('must be a regular file and not a symbolic link');
    }
    if (manifestStat.size > MANIFEST_LIMIT_BYTES) {
      throw new Error(`exceeds the ${MANIFEST_LIMIT_BYTES}-byte inspection limit`);
    }
    documents.manifest = readFile(manifestPath);
  } catch (error) {
    if (error?.code === 'ENOENT') documents.manifest = null;
    else {
      return result('unverifiable', 'manifest_read_failed', expected, {
        gaps: [`${expected.specPath}/issue-scope.json: ${bounded(error.message)}`],
      });
    }
  }
  return classifyIssueSpecScope(expected, documents);
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: 'string' },
      spec: { type: 'string' },
      issue: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  for (const key of ['project', 'spec', 'issue']) {
    if (!values[key]) throw new Error(`--${key} is required`);
  }
  if (!values.json) throw new Error('--json is required');
  return {
    projectRoot: path.resolve(values.project),
    specPath: values.spec,
    issueNumber: parsePositiveInteger(values.issue),
  };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/issue-spec-scope.mjs --project <path> --spec specs/<slug> --issue <N> --json',
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
  process.stdout.write(`${JSON.stringify(inspectIssueSpecScope(options), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
