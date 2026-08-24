#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isCliEntry } from './plugin-controller-path.mjs';

export const MAX_VERIFICATION_REPORT_BYTES = 256 * 1024;

const ALLOWED_EVIDENCE_KINDS = new Set(['required_check', 'check_run', 'merge_blocking']);
const SUCCESS_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const BLOCKING_MERGE_STATES = new Set(['BLOCKED', 'UNSTABLE', 'DIRTY', 'BEHIND']);
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const SPEC_PATTERN = /^specs\/[a-z0-9][a-z0-9-]*$/;
const HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;
const IDENTIFIER_PATTERN = /^(?:AC|FR|T|SCN)\d+$/;
const IMPLEMENTATION_STATUS_PATTERN = /^#{1,6}\s+(?:\*\*)?Implementation Status(?:\*\*)?\s*:\s*(?:\*\*)?(PR Evidence Pending|Pass|Partial|Incomplete|Fail)(?:\*\*)?\s*$/gmi;
const SCOPE_MARKER_PATTERN = /^<!-- nmg-sdlc-issue-scope:\s*([^\r\n]*)$/gm;
const READINESS_MARKER_PATTERN = /^<!-- nmg-sdlc-pr-readiness:\s*([^\r\n]*)$/gm;
const DELIVERY_MARKER_PATTERN = /^<!-- nmg-sdlc-delivery-validation:\s*([^\r\n]*)$/gm;

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
  }
  return value;
}

function equalJson(left, right) {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return equalJson(Object.keys(value).sort(), [...expected].sort());
}

function markerPayloads(content, pattern) {
  const values = [];
  for (const match of String(content).matchAll(pattern)) {
    const raw = match[1].trim();
    values.push(raw.endsWith('-->') ? raw.slice(0, -3).trim() : '');
  }
  return values;
}

function parseSingleMarker(content, pattern, label, { required }) {
  const markers = markerPayloads(content, pattern);
  if (markers.length === 0) {
    return required
      ? { value: null, gap: `${label} marker is missing` }
      : { value: null, gap: null };
  }
  if (markers.length !== 1) return { value: null, gap: `${label} marker must appear exactly once` };
  try {
    return { value: JSON.parse(markers[0]), gap: null };
  } catch (error) {
    return { value: null, gap: `${label} marker is invalid JSON: ${error.message}` };
  }
}

function implementationStatus(content) {
  const matches = [...String(content).matchAll(IMPLEMENTATION_STATUS_PATTERN)];
  return {
    count: matches.length,
    value: matches.length === 1
      ? matches[0][1].toLowerCase().replaceAll(' ', '_')
      : null,
  };
}

function validIdentifierArray(value, prefix, { allowEmpty = true, max = 200 } = {}) {
  if (!Array.isArray(value) || value.length > max || (!allowEmpty && value.length === 0)) return false;
  if (!value.every((item) => typeof item === 'string' && IDENTIFIER_PATTERN.test(item) && item.startsWith(prefix))) return false;
  return new Set(value).size === value.length;
}

function scopeProjection(value) {
  if (!value || !exactKeys(value, ['issueNumber', 'specPath', 'status', 'delivery', 'regression'])) return null;
  if (!Number.isInteger(value.issueNumber) || value.issueNumber <= 0 || !SPEC_PATTERN.test(value.specPath)) return null;
  if (!['scoped', 'implicit_single_issue'].includes(value.status)) return null;
  if (!exactKeys(value.delivery, ['acceptanceCriteria', 'functionalRequirements', 'tasks', 'scenarios'])) return null;
  if (!exactKeys(value.regression, ['acceptanceCriteria', 'functionalRequirements', 'scenarios'])) return null;
  if (!validIdentifierArray(value.delivery.acceptanceCriteria, 'AC')) return null;
  if (!validIdentifierArray(value.delivery.functionalRequirements, 'FR')) return null;
  if (!validIdentifierArray(value.delivery.tasks, 'T')) return null;
  if (!validIdentifierArray(value.delivery.scenarios, 'SCN')) return null;
  if (!validIdentifierArray(value.regression.acceptanceCriteria, 'AC')) return null;
  if (!validIdentifierArray(value.regression.functionalRequirements, 'FR')) return null;
  if (!validIdentifierArray(value.regression.scenarios, 'SCN')) return null;
  return value;
}

function expectedProjection(scope) {
  if (!scope) return null;
  return scopeProjection({
    issueNumber: scope.issueNumber,
    specPath: scope.specPath,
    status: scope.status,
    delivery: scope.delivery,
    regression: scope.regression,
  });
}

function validateIdentity(scope, options, gaps) {
  if (!scope) {
    gaps.push('issue-scope marker is malformed');
    return;
  }
  if (options.expectedIssueNumber !== undefined && scope.issueNumber !== options.expectedIssueNumber) {
    gaps.push('issue-scope marker issue does not match the active issue');
  }
  if (options.expectedSpecPath !== undefined && scope.specPath !== options.expectedSpecPath) {
    gaps.push('issue-scope marker spec does not match the active spec');
  }
  const live = expectedProjection(options.expectedScope);
  if (options.expectedScope && (!live || !equalJson(scope, live))) {
    gaps.push('issue-scope marker does not match the live normalized scope');
  }
}

function validateLocal(local, scope, gaps) {
  const keys = ['acceptanceCriteria', 'functionalRequirements', 'tasks', 'scenarios', 'regression', 'tests', 'steeringGates'];
  if (!exactKeys(local, keys)) {
    gaps.push('readiness local evidence has unknown or missing fields');
    return;
  }
  if (!exactKeys(local.regression, ['acceptanceCriteria', 'functionalRequirements', 'scenarios'])) {
    gaps.push('readiness regression evidence has unknown or missing fields');
    return;
  }
  const projected = {
    acceptanceCriteria: local.acceptanceCriteria,
    functionalRequirements: local.functionalRequirements,
    tasks: local.tasks,
    scenarios: local.scenarios,
  };
  if (!equalJson(projected, scope.delivery) || !equalJson(local.regression, scope.regression)) {
    gaps.push('readiness local evidence does not match the active issue scope');
  }
  if (local.tests !== 'pass') gaps.push('readiness requires all local tests to pass');
  if (local.steeringGates !== 'pass') gaps.push('readiness requires every applicable steering gate to pass');
}

function validateEvidenceIdentity(item, deliveryAcceptanceCriteria, gaps, index) {
  if (!ALLOWED_EVIDENCE_KINDS.has(item.kind)) {
    gaps.push(`evidence item ${index} has unsupported kind`);
    return;
  }
  if (typeof item.name !== 'string' || item.name.trim() !== item.name || item.name.length < 1 || item.name.length > 256) {
    gaps.push(`evidence item ${index} has an invalid name`);
  }
  if (['required_check', 'check_run'].includes(item.kind) && item.event !== 'pull_request') {
    gaps.push(`evidence item ${index} is not proven pull-request-only`);
  }
  if (!validIdentifierArray(item.acceptanceCriteria, 'AC', { allowEmpty: false, max: 100 })) {
    gaps.push(`evidence item ${index} has invalid acceptance-criterion mappings`);
  } else if (item.acceptanceCriteria.some((identifier) => !deliveryAcceptanceCriteria.includes(identifier))) {
    gaps.push(`evidence item ${index} maps outside the active delivery acceptance criteria`);
  }
}

function validateEvidenceArray(items, state, scope, gaps, options = {}) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    gaps.push(`${state} evidence must contain between 1 and 20 items`);
    return;
  }
  const identities = [];
  const satisfiedHeadShas = [];
  items.forEach((item, position) => {
    const index = position + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      gaps.push(`evidence item ${index} must be an object`);
      return;
    }
    const pendingKeys = ['kind', 'name', 'acceptanceCriteria'];
    const identityKeys = ['required_check', 'check_run'].includes(item.kind)
      ? [...pendingKeys, 'event']
      : pendingKeys;
    const satisfiedKeys = item.kind === 'merge_blocking'
      ? [...identityKeys, 'headSha', 'conclusion', 'url', 'observedStates']
      : [...identityKeys, 'headSha', 'conclusion', 'url'];
    if (!exactKeys(item, state === 'pending' ? identityKeys : satisfiedKeys)) {
      gaps.push(`evidence item ${index} has unknown or missing fields`);
      return;
    }
    validateEvidenceIdentity(item, scope.delivery.acceptanceCriteria, gaps, index);
    identities.push(`${item.kind}\u0000${item.name}`);
    if (state === 'pending') return;

    if (typeof item.headSha !== 'string' || !SHA_PATTERN.test(item.headSha)) {
      gaps.push(`evidence item ${index} has an invalid head SHA`);
    } else if (options.expectedHeadSha
      && item.headSha.toLowerCase() !== String(options.expectedHeadSha).toLowerCase()) {
      gaps.push(`evidence item ${index} does not match the expected head SHA`);
    } else {
      satisfiedHeadShas.push(item.headSha.toLowerCase());
    }
    if (!HTTP_URL_PATTERN.test(item.url) || item.url.length > 2048) {
      gaps.push(`evidence item ${index} has an invalid evidence URL`);
    }
    if (item.kind === 'merge_blocking') {
      if (item.conclusion !== 'OBSERVED') gaps.push(`evidence item ${index} has an invalid merge-blocking conclusion`);
      if (!Array.isArray(item.observedStates) || item.observedStates.length < 1 || item.observedStates.length > 8
        || new Set(item.observedStates).size !== item.observedStates.length
        || !item.observedStates.every((value) => typeof value === 'string' && /^[A-Z_]+$/.test(value))
        || !item.observedStates.some((value) => BLOCKING_MERGE_STATES.has(value))) {
        gaps.push(`evidence item ${index} lacks a bounded blocking merge-state observation`);
      }
    } else if (!SUCCESS_CONCLUSIONS.has(item.conclusion)) {
      gaps.push(`evidence item ${index} has a non-success conclusion`);
    }
  });
  if (new Set(identities).size !== identities.length) gaps.push(`${state} evidence identities must be unique`);
  if (state === 'satisfied' && satisfiedHeadShas.length === items.length
    && new Set(satisfiedHeadShas).size !== 1) {
    gaps.push('satisfied evidence must reference one exact head SHA');
  }
}

function readinessResult(status, reasonCode, implementation, scope, readiness, gaps) {
  return {
    status,
    reasonCode,
    implementationStatus: implementation,
    issueScope: scope,
    readiness,
    gaps: [...new Set(gaps)],
  };
}

export function inspectVerificationReadiness(input) {
  const content = String(input?.content ?? '');
  const options = input?.options ?? {};
  if (Buffer.byteLength(content, 'utf8') > MAX_VERIFICATION_REPORT_BYTES) {
    return readinessResult('unverifiable', 'report_too_large', null, null, null, [
      `verification report exceeds ${MAX_VERIFICATION_REPORT_BYTES} bytes`,
    ]);
  }

  const parsedImplementation = implementationStatus(content);
  const implementation = parsedImplementation.value;
  if (!implementation) {
    const duplicate = parsedImplementation.count > 1;
    return readinessResult('unverifiable', duplicate ? 'implementation_status_ambiguous' : 'implementation_status_missing', null, null, null, [
      duplicate
        ? 'verification report must contain exactly one canonical Implementation Status heading'
        : 'verification report lacks one canonical supported Implementation Status heading',
    ]);
  }

  const scopeMarker = parseSingleMarker(content, SCOPE_MARKER_PATTERN, 'issue-scope', { required: true });
  const gaps = scopeMarker.gap ? [scopeMarker.gap] : [];
  const scope = scopeProjection(scopeMarker.value);
  validateIdentity(scope, options, gaps);

  const marker = parseSingleMarker(content, READINESS_MARKER_PATTERN, 'PR-readiness', {
    required: implementation === 'pr_evidence_pending',
  });
  if (marker.gap) gaps.push(marker.gap);

  if (['partial', 'incomplete', 'fail'].includes(implementation)) {
    if (marker.value) gaps.push('non-pass verification cannot carry a PR-readiness marker');
    return readinessResult('blocked', 'implementation_non_pass', implementation, scope, marker.value, gaps);
  }

  if (!marker.value) {
    if (gaps.length) return readinessResult('unverifiable', 'scope_evidence_invalid', implementation, scope, null, gaps);
    if (implementation === 'pass') return readinessResult('pass', 'ordinary_pass', implementation, scope, null, []);
    return readinessResult('unverifiable', 'readiness_marker_missing', implementation, scope, null, gaps);
  }

  const readiness = marker.value;
  const expectedTopKeys = readiness.state === 'pr_evidence_pending'
    ? ['schemaVersion', 'state', 'issueNumber', 'specPath', 'local', 'pendingEvidence']
    : ['schemaVersion', 'state', 'issueNumber', 'specPath', 'local', 'evidence'];
  if (!['pr_evidence_pending', 'pr_evidence_satisfied'].includes(readiness.state)
    || !exactKeys(readiness, expectedTopKeys)) {
    gaps.push('PR-readiness marker has an unsupported state or unknown fields');
  }
  if (readiness.schemaVersion !== 1) gaps.push('PR-readiness schemaVersion must be 1');
  if (!scope || readiness.issueNumber !== scope.issueNumber || readiness.specPath !== scope.specPath) {
    gaps.push('PR-readiness identity does not match the issue-scope marker');
  }
  if (scope) validateLocal(readiness.local, scope, gaps);

  if (readiness.state === 'pr_evidence_pending' && scope) {
    validateEvidenceArray(readiness.pendingEvidence, 'pending', scope, gaps, options);
  } else if (readiness.state === 'pr_evidence_satisfied' && scope) {
    validateEvidenceArray(readiness.evidence, 'satisfied', scope, gaps, options);
  }

  if (implementation === 'pr_evidence_pending' && readiness.state !== 'pr_evidence_pending') {
    gaps.push('PR Evidence Pending status requires a pending readiness marker');
  }
  if (implementation === 'pass' && readiness.state !== 'pr_evidence_satisfied') {
    gaps.push('Pass may carry only a satisfied readiness marker');
  }
  if (gaps.length) return readinessResult('unverifiable', 'readiness_evidence_invalid', implementation, scope, readiness, gaps);
  return readinessResult(readiness.state, readiness.state, implementation, scope, readiness, []);
}

export function evidenceIdentity(item) {
  const identity = {
    kind: item.kind,
    name: item.name,
    acceptanceCriteria: item.acceptanceCriteria,
  };
  if (item.event !== undefined) identity.event = item.event;
  return identity;
}

export function inspectDeliveryValidation(input) {
  const content = String(input?.content ?? '');
  const options = input?.options ?? {};
  const marker = parseSingleMarker(content, DELIVERY_MARKER_PATTERN, 'delivery-validation', { required: true });
  const gaps = marker.gap ? [marker.gap] : [];
  const value = marker.value;
  const keys = ['schemaVersion', 'state', 'issueNumber', 'specPath', 'pullRequestNumber', 'headSha', 'evidence'];
  if (!exactKeys(value, keys)) gaps.push('delivery-validation marker has unknown or missing fields');
  if (value?.schemaVersion !== 1 || value?.state !== 'final_sha_validated') {
    gaps.push('delivery-validation marker has an unsupported schema or state');
  }
  if (!Number.isInteger(value?.issueNumber) || value.issueNumber <= 0
    || !SPEC_PATTERN.test(value?.specPath ?? '')
    || !Number.isInteger(value?.pullRequestNumber) || value.pullRequestNumber <= 0
    || !SHA_PATTERN.test(value?.headSha ?? '')) {
    gaps.push('delivery-validation marker identity is invalid');
  }
  if (options.expectedIssueNumber !== undefined && value?.issueNumber !== options.expectedIssueNumber) {
    gaps.push('delivery-validation issue does not match the active issue');
  }
  if (options.expectedSpecPath !== undefined && value?.specPath !== options.expectedSpecPath) {
    gaps.push('delivery-validation spec does not match the active spec');
  }
  if (options.expectedPullRequestNumber !== undefined && value?.pullRequestNumber !== options.expectedPullRequestNumber) {
    gaps.push('delivery-validation PR does not match the active pull request');
  }
  if (options.expectedHeadSha && typeof value?.headSha === 'string'
    && value.headSha.toLowerCase() !== String(options.expectedHeadSha).toLowerCase()) {
    gaps.push('delivery-validation head does not match the final pull-request head');
  }

  const scope = {
    delivery: {
      acceptanceCriteria: Array.isArray(options.deliveryAcceptanceCriteria)
        ? options.deliveryAcceptanceCriteria
        : [...new Set((value?.evidence ?? []).flatMap((item) => item?.acceptanceCriteria ?? []))],
    },
  };
  validateEvidenceArray(value?.evidence, 'satisfied', scope, gaps, {
    expectedHeadSha: options.expectedHeadSha ?? value?.headSha,
  });
  if (Array.isArray(options.expectedEvidenceIdentities)) {
    const actual = (value?.evidence ?? []).map(evidenceIdentity);
    if (!equalJson(actual, options.expectedEvidenceIdentities)) {
      gaps.push('delivery-validation evidence identities do not match the declared pending evidence');
    }
  }
  return {
    status: gaps.length ? 'unverifiable' : 'final_sha_validated',
    reasonCode: gaps.length ? 'delivery_validation_invalid' : 'final_sha_validated',
    deliveryValidation: value,
    gaps: [...new Set(gaps)],
  };
}

function usage() {
  return [
    'Usage:',
    '  node verification-readiness.mjs --project <repo-root> --spec specs/<slug> --issue <N> [--head <sha>] --json',
    '  node verification-readiness.mjs --project <repo-root> --spec specs/<slug> --issue <N> --pr <N> --head <sha> --delivery-body-file <path> --json',
    '',
  ].join('\n');
}

function positiveIssue(value) {
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function readReport(projectRoot, specPath) {
  const reportPath = path.join(projectRoot, ...specPath.split('/'), 'verification-report.md');
  const projectReal = fs.realpathSync(projectRoot);
  const originalStat = fs.lstatSync(reportPath);
  if (!originalStat.isFile() || originalStat.isSymbolicLink()) {
    throw new Error('verification report must be a regular non-symlink file');
  }
  const reportReal = fs.realpathSync(reportPath);
  const relative = path.relative(projectReal, reportReal);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('verification report escapes the project root');
  if (originalStat.size > MAX_VERIFICATION_REPORT_BYTES) {
    throw new Error(`verification report exceeds ${MAX_VERIFICATION_REPORT_BYTES} bytes`);
  }
  return fs.readFileSync(reportReal, 'utf8');
}

function readRegularFile(filePath, label) {
  const absolute = path.resolve(filePath);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  if (stat.size > MAX_VERIFICATION_REPORT_BYTES) {
    throw new Error(`${label} exceeds ${MAX_VERIFICATION_REPORT_BYTES} bytes`);
  }
  return fs.readFileSync(absolute, 'utf8');
}

export function runCli(argv, streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const stderr = streams.stderr ?? process.stderr;
  let values;
  try {
    values = parseArgs({
      args: argv,
      options: {
        project: { type: 'string' },
        spec: { type: 'string' },
        issue: { type: 'string' },
        pr: { type: 'string' },
        head: { type: 'string' },
        'delivery-body-file': { type: 'string' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    stderr.write(`Argument error: ${error.message}\n`);
    return 2;
  }
  if (values.help) {
    stdout.write(usage());
    return 0;
  }
  const issueNumber = positiveIssue(values.issue);
  const pullRequestNumber = positiveIssue(values.pr);
  const deliveryBodyFile = values['delivery-body-file'];
  const deliveryMode = deliveryBodyFile !== undefined || values.pr !== undefined;
  if (!values.project || !SPEC_PATTERN.test(values.spec ?? '') || !issueNumber || !values.json
    || (values.head && !SHA_PATTERN.test(values.head))
    || (deliveryMode && (!deliveryBodyFile || !pullRequestNumber || !values.head))
    || (!deliveryMode && values.pr !== undefined)) {
    stderr.write(usage());
    return 2;
  }
  try {
    const projectRoot = path.resolve(values.project);
    const content = readReport(projectRoot, values.spec);
    if (deliveryMode) {
      const reportResult = inspectVerificationReadiness({
        content,
        options: {
          expectedIssueNumber: issueNumber,
          expectedSpecPath: values.spec,
        },
      });
      if (reportResult.status !== 'pr_evidence_satisfied') {
        const result = {
          status: 'unverifiable',
          reasonCode: 'delivery_report_not_satisfied',
          deliveryValidation: null,
          gaps: [
            'delivery validation requires a satisfied PR-readiness report',
            ...reportResult.gaps,
          ],
        };
        stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return 2;
      }
      const result = inspectDeliveryValidation({
        content: readRegularFile(deliveryBodyFile, 'delivery body'),
        options: {
          expectedIssueNumber: issueNumber,
          expectedSpecPath: values.spec,
          expectedPullRequestNumber: pullRequestNumber,
          expectedHeadSha: values.head,
          deliveryAcceptanceCriteria: reportResult.issueScope.delivery.acceptanceCriteria,
          expectedEvidenceIdentities: reportResult.readiness.evidence.map(evidenceIdentity),
        },
      });
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return result.status === 'final_sha_validated' ? 0 : 2;
    }
    const result = inspectVerificationReadiness({
      content,
      options: {
        expectedIssueNumber: issueNumber,
        expectedSpecPath: values.spec,
        expectedHeadSha: values.head,
      },
    });
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (['pass', 'pr_evidence_pending', 'pr_evidence_satisfied'].includes(result.status)) return 0;
    return result.status === 'blocked' ? 1 : 2;
  } catch (error) {
    stderr.write(`Verification readiness unavailable: ${error.message}\n`);
    return 2;
  }
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli(process.argv.slice(2));
