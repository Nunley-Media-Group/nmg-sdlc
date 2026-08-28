#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { isCliEntry } from './plugin-controller-path.mjs';

const OID = /^[0-9a-f]{40}$/;
const ID = /^(?:AC|FR|T|SCN)\d+$/;
const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

function positive(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function repairEvidenceDigest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}

function uniqueNumbers(values, label, gaps) {
  if (!Array.isArray(values)) {
    gaps.push(`${label} must be an array`);
    return [];
  }
  const normalized = values.map(positive);
  if (normalized.some((value) => value === null)) gaps.push(`${label} contains an invalid issue number`);
  if (new Set(normalized.filter(Boolean)).size !== normalized.filter(Boolean).length) gaps.push(`${label} contains duplicates`);
  return normalized.filter(Boolean).sort((left, right) => left - right);
}

const OWNERSHIP_FIELDS = Object.freeze([
  ['acceptanceCriteria', 'AC'],
  ['functionalRequirements', 'FR'],
  ['tasks', 'T'],
  ['scenarios', 'SCN'],
]);

function normalizeIdentifiers(value, label, gaps) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    gaps.push(`${label} must be an object`);
    return Object.fromEntries(OWNERSHIP_FIELDS.map(([field]) => [field, []]));
  }
  const expected = OWNERSHIP_FIELDS.map(([field]) => field).sort();
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    gaps.push(`${label} must contain exactly ${expected.join(', ')}`);
  }
  const normalized = {};
  for (const [field, prefix] of OWNERSHIP_FIELDS) {
    const values = Array.isArray(value[field]) ? value[field] : [];
    if (!Array.isArray(value[field])) gaps.push(`${label}.${field} must be an array`);
    normalized[field] = [];
    for (const identifier of values) {
      if (typeof identifier !== 'string' || !ID.test(identifier) || !identifier.startsWith(prefix)) {
        gaps.push(`${label}.${field} contains invalid identifier ${String(identifier)}`);
        continue;
      }
      normalized[field].push(identifier);
    }
    if (new Set(normalized[field]).size !== normalized[field].length) {
      gaps.push(`${label}.${field} contains duplicates`);
    }
    normalized[field] = [...new Set(normalized[field])].sort();
  }
  return normalized;
}

function normalizeTransfer(transfer, seenByField, seenChildren, childPathByIssue, gaps) {
  const expectedKeys = ['childIssue', ...OWNERSHIP_FIELDS.map(([field]) => field)].sort();
  const actualKeys = transfer && typeof transfer === 'object' && !Array.isArray(transfer)
    ? Object.keys(transfer).sort()
    : [];
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    gaps.push(`legacy ownership transfer must contain exactly ${expectedKeys.join(', ')}`);
  }
  const childIssue = positive(transfer?.childIssue);
  if (!childIssue) gaps.push('legacy ownership transfer childIssue is invalid');
  else if (seenChildren.has(childIssue)) gaps.push(`legacy ownership repeats transfer child #${childIssue}`);
  else seenChildren.add(childIssue);
  if (childIssue && !childPathByIssue.has(childIssue)) {
    gaps.push(`legacy ownership transfer child #${childIssue} has no destination package`);
  }
  const normalized = { childIssue, acceptanceCriteria: [], functionalRequirements: [], tasks: [], scenarios: [] };
  for (const [field, prefix] of OWNERSHIP_FIELDS) {
    const values = Array.isArray(transfer?.[field]) ? transfer[field] : [];
    if (!Array.isArray(transfer?.[field])) gaps.push(`legacy ownership ${field} must be an array`);
    for (const value of values) {
      if (typeof value !== 'string' || !ID.test(value) || !value.startsWith(prefix)) {
        gaps.push(`legacy ownership ${field} contains invalid identifier ${String(value)}`);
        continue;
      }
      if (seenByField.get(field).has(value)) gaps.push(`legacy executable identifier ${value} is assigned more than once`);
      seenByField.get(field).add(value);
      normalized[field].push(value);
    }
    normalized[field] = [...new Set(normalized[field])].sort();
  }
  return normalized;
}

function normalizeProjectActions(epicNumber, projectItems, direction, gaps) {
  if (!Array.isArray(projectItems)) {
    gaps.push('projectItems must be an array');
    return [];
  }
  const actions = [];
  for (const [index, item] of projectItems.entries()) {
    const itemId = typeof item?.itemId === 'string' && item.itemId ? item.itemId : null;
    const projectId = typeof item?.projectId === 'string' && item.projectId ? item.projectId : null;
    const statusFieldId = typeof item?.statusFieldId === 'string' && item.statusFieldId ? item.statusFieldId : null;
    const statusName = typeof item?.statusName === 'string' && item.statusName ? item.statusName : null;
    const options = direction === 'done' ? item?.doneOptions : item?.inProgressOptions;
    const targetName = direction === 'done' ? 'done' : 'in progress';
    const matches = Array.isArray(options)
      ? options.filter((option) => typeof option?.id === 'string'
        && String(option?.name ?? '').toLowerCase() === targetName)
      : [];
    if (!itemId || !projectId || !statusFieldId || !statusName || matches.length !== 1) {
      gaps.push(`projectItems[${index}] cannot prove one ${targetName} mutation target`);
      continue;
    }
    if (statusName.toLowerCase() !== targetName) {
      actions.push({
        kind: 'set_project_status',
        epicIssue: epicNumber,
        projectId,
        itemId,
        statusFieldId,
        optionId: matches[0].id,
        from: statusName,
        to: matches[0].name,
      });
    }
  }
  return actions;
}

function proposalResult(evidence, status, reasonCode, actions, findings, gaps) {
  return {
    schemaVersion: 1,
    status,
    reasonCode,
    epicIssue: evidence.epic.number,
    evidenceDigest: repairEvidenceDigest(evidence),
    actions,
    findings,
    gaps: [...new Set(gaps)].sort(),
  };
}

export function buildEpicLifecycleRepairPlan(input) {
  const gaps = [];
  const epicNumber = positive(input?.epic?.number);
  const epicState = String(input?.epic?.state ?? '').toUpperCase();
  const nativeChildren = uniqueNumbers(input?.nativeChildren, 'nativeChildren', gaps);
  const checklistChildren = uniqueNumbers(input?.checklistChildren ?? [], 'checklistChildren', gaps);
  const sourceCommit = String(input?.sourceCommit ?? '').toLowerCase();
  const sourceTrees = input?.sourceTrees && typeof input.sourceTrees === 'object' ? stable(input.sourceTrees) : {};
  if (!epicNumber) gaps.push('epic number is invalid');
  if (!['OPEN', 'CLOSED'].includes(epicState)) gaps.push('epic state is invalid');
  if (!OID.test(sourceCommit)) gaps.push('sourceCommit must be a full lower-case Git OID');
  for (const [specPath, tree] of Object.entries(sourceTrees)) {
    if (!/^specs\/[a-z0-9][a-z0-9-]*$/.test(specPath) || !OID.test(String(tree))) {
      gaps.push(`source tree identity is invalid for ${specPath}`);
    }
  }
  const completion = input?.completion;
  if (!completion || !['eligible', 'incomplete', 'repair_required', 'unverifiable'].includes(completion.status)) {
    gaps.push('completion classification is missing or invalid');
  }
  const evidence = {
    epic: {
      number: epicNumber,
      state: epicState,
      title: typeof input?.epic?.title === 'string' ? input.epic.title : null,
      bodyDigest: typeof input?.epic?.bodyDigest === 'string' ? input.epic.bodyDigest : null,
    },
    nativeChildren,
    checklistChildren,
    identityFindings: Array.isArray(input?.identityFindings) ? stable(input.identityFindings) : [],
    specAuthority: stable(input?.specAuthority ?? null),
    completion: stable(completion ?? null),
    projectItems: stable(input?.projectItems ?? []),
    legacyOwnership: stable(input?.legacyOwnership ?? null),
    sourceCommit,
    sourceTrees,
  };
  if (gaps.length > 0) return proposalResult(evidence, 'unverifiable', 'repair_evidence_invalid', [], [], gaps);

  const actions = [];
  const findings = [];
  for (const finding of evidence.identityFindings) {
    const childIssue = positive(finding?.childIssue);
    if (!childIssue || !['legacy', 'durable', 'inconsistent', 'ambiguous', 'unverifiable'].includes(finding?.status)) {
      gaps.push('identity finding is malformed');
      continue;
    }
    if (finding.status === 'legacy') {
      if (finding.addLabel) actions.push({ kind: 'add_child_label', childIssue, label: `epic-child-of-${epicNumber}` });
      if (finding.addNativeParent) actions.push({ kind: 'add_native_parent', childIssue, epicIssue: epicNumber });
    } else if (finding.status !== 'durable') {
      findings.push({ kind: 'identity_preserved', childIssue, status: finding.status });
    }
  }

  if (JSON.stringify(nativeChildren) !== JSON.stringify(checklistChildren)) {
    actions.push({ kind: 'replace_child_checklist', epicIssue: epicNumber, childIssues: nativeChildren });
  }

  const specAuthority = evidence.specAuthority;
  if (specAuthority?.reasonCode === 'legacy_cumulative_epic_spec') {
    const ownership = evidence.legacyOwnership;
    if (ownership?.status !== 'exact' || !Array.isArray(ownership.transfers)) {
      findings.push({
        kind: 'ambiguous_legacy_ownership_preserved',
        sourceSpecPath: specAuthority.legacySpecPath ?? null,
        recovery: 'draft or select the missing child, then approve exact identifier ownership',
      });
    } else {
      const transferGaps = [];
      if (!OID.test(String(ownership.sourceTree ?? ''))) transferGaps.push('legacy ownership sourceTree must be a full lower-case Git OID');
      const legacySpecPath = specAuthority.legacySpecPath;
      if (!/^specs\/(?!epic-)[a-z0-9][a-z0-9-]*$/.test(String(legacySpecPath ?? ''))) {
        transferGaps.push('legacy spec authority source path is invalid');
      } else if (sourceTrees[legacySpecPath] !== ownership.sourceTree) {
        transferGaps.push('legacy ownership sourceTree does not match the audited source path tree');
      }
      if (!/^specs\/epic-[a-z0-9][a-z0-9-]*$/.test(String(ownership.aggregatePath ?? ''))) {
        transferGaps.push('legacy ownership aggregatePath is invalid');
      }
      const childPackages = [];
      const childPathByIssue = new Map();
      const childPaths = new Set();
      for (const [index, childPackage] of (Array.isArray(ownership.childPackages) ? ownership.childPackages : []).entries()) {
        const childIssue = positive(childPackage?.childIssue);
        const specPath = typeof childPackage?.specPath === 'string' ? childPackage.specPath : null;
        const exactKeys = childPackage && typeof childPackage === 'object' && !Array.isArray(childPackage)
          && JSON.stringify(Object.keys(childPackage).sort()) === JSON.stringify(['childIssue', 'specPath']);
        if (!exactKeys || !childIssue || !/^specs\/(?!epic-)[a-z0-9][a-z0-9-]*$/.test(String(specPath))) {
          transferGaps.push(`legacy ownership childPackages[${index}] must bind one childIssue to one normalized non-aggregate specPath`);
          continue;
        }
        if (specPath === legacySpecPath) {
          transferGaps.push(`legacy ownership child package path ${specPath} would overwrite the source spec`);
        }
        if (childPathByIssue.has(childIssue)) transferGaps.push(`legacy ownership repeats child package issue #${childIssue}`);
        if (childPaths.has(specPath)) transferGaps.push(`legacy ownership repeats child package path ${specPath}`);
        childPathByIssue.set(childIssue, specPath);
        childPaths.add(specPath);
        childPackages.push({ childIssue, specPath });
      }
      if (childPackages.length === 0) transferGaps.push('legacy ownership childPackages must not be empty');
      if (JSON.stringify([...childPathByIssue.keys()].sort((left, right) => left - right)) !== JSON.stringify(nativeChildren)) {
        transferGaps.push('legacy ownership child packages must match the complete native child set');
      }
      const sourceIdentifiers = normalizeIdentifiers(ownership.sourceIdentifiers, 'legacy ownership sourceIdentifiers', transferGaps);
      const seenByField = new Map(OWNERSHIP_FIELDS.map(([field]) => [field, new Set()]));
      const seenChildren = new Set();
      const transfers = ownership.transfers.map((transfer) => normalizeTransfer(
        transfer,
        seenByField,
        seenChildren,
        childPathByIssue,
        transferGaps,
      ));
      if (JSON.stringify([...seenChildren].sort((left, right) => left - right)) !== JSON.stringify(nativeChildren)) {
        transferGaps.push('legacy ownership transfers must match the complete native child set');
      }
      for (const [field] of OWNERSHIP_FIELDS) {
        const transferred = [...seenByField.get(field)].sort();
        if (JSON.stringify(transferred) !== JSON.stringify(sourceIdentifiers[field])) {
          transferGaps.push(`legacy ownership ${field} transfers do not exactly cover the audited source identifiers`);
        }
      }
      if (transferGaps.length > 0 || transfers.some((transfer) => !transfer.childIssue)) gaps.push(...transferGaps);
      else actions.push({
        kind: 'split_legacy_spec',
        sourceSpecPath: specAuthority.legacySpecPath,
        sourceTree: ownership.sourceTree,
        aggregatePath: ownership.aggregatePath,
        childPackages,
        sourceIdentifiers,
        transfers,
      });
    }
  } else if (specAuthority?.status === 'repair_required') {
    findings.push({ kind: 'spec_authority_repair_preserved', reasonCode: specAuthority.reasonCode, gaps: specAuthority.gaps ?? [] });
  }

  if (completion.status === 'eligible') {
    actions.push(...normalizeProjectActions(epicNumber, evidence.projectItems, 'done', gaps));
    if (epicState === 'OPEN') actions.push({ kind: 'close_epic', epicIssue: epicNumber });
  } else if (completion.status === 'incomplete' && epicState === 'CLOSED') {
    actions.push({ kind: 'reopen_epic', epicIssue: epicNumber });
    actions.push(...normalizeProjectActions(epicNumber, evidence.projectItems, 'in_progress', gaps));
  } else if (completion.status === 'repair_required') {
    findings.push({ kind: 'completion_repair_preserved', gaps: completion.gaps ?? [] });
  } else if (completion.status === 'unverifiable') {
    findings.push({ kind: 'completion_unverifiable_preserved', gaps: completion.gaps ?? [] });
  }

  if (gaps.length > 0) return proposalResult(evidence, 'unverifiable', 'repair_proposal_ambiguous', [], findings, gaps);
  if (findings.some((finding) => finding.kind.includes('ambiguous') || finding.kind.includes('unverifiable'))) {
    return proposalResult(evidence, 'preserved_ambiguous', 'manual_decision_required', [], findings, []);
  }
  return actions.length > 0
    ? proposalResult(evidence, 'repair_proposed', 'exact_epic_repair_available', actions, findings, [])
    : proposalResult(evidence, 'clean', 'epic_lifecycle_consistent', [], findings, []);
}

function readEvidence(filePath) {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_EVIDENCE_BYTES) {
    throw new Error('evidence must be a bounded regular non-symlink file');
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      evidence: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  if (!values.evidence || !values.json) throw new Error('--evidence and --json are required');
  return { evidence: values.evidence };
}

function usage() {
  return 'Usage: node scripts/epic-lifecycle-repair.mjs --evidence <snapshot.json> --json';
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
  try {
    process.stdout.write(`${JSON.stringify(buildEpicLifecycleRepairPlan(readEvidence(options.evidence)), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Evidence error: ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (isCliEntry(import.meta.url)) main();
