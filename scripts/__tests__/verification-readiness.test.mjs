import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  canonicalCheckName,
  inspectDeliveryValidation,
  inspectVerificationReadiness,
  inspectVerificationArtifactRepair,
  inspectLegacyVerificationArtifactForRepair,
  resolveDeclaredCheck,
  runCli,
} from '../verification-readiness.mjs';
import { classifyIssueSpecScope } from '../issue-spec-scope.mjs';

const HEAD_1 = '1'.repeat(40);
const HEAD_2 = '2'.repeat(40);
const SPEC_PATH = 'specs/feature-readiness';
const SCOPE = {
  issueNumber: 42,
  specPath: SPEC_PATH,
  status: 'scoped',
  delivery: {
    acceptanceCriteria: ['AC1', 'AC2'],
    functionalRequirements: ['FR1'],
    tasks: ['T001'],
    scenarios: ['SCN001'],
  },
  regression: {
    acceptanceCriteria: ['AC9'],
    functionalRequirements: [],
    scenarios: ['SCN009'],
  },
};

function marker(name, value) {
  return `<!-- ${name}: ${JSON.stringify(value)} -->`;
}

function localEvidence(overrides = {}) {
  return {
    acceptanceCriteria: SCOPE.delivery.acceptanceCriteria,
    functionalRequirements: SCOPE.delivery.functionalRequirements,
    tasks: SCOPE.delivery.tasks,
    scenarios: SCOPE.delivery.scenarios,
    regression: SCOPE.regression,
    tests: 'pass',
    steeringGates: 'pass',
    ...overrides,
  };
}

function pendingItem(overrides = {}) {
  return {
    kind: 'required_check',
    name: 'contract-tests',
    event: 'pull_request',
    acceptanceCriteria: ['AC1'],
    ...overrides,
  };
}

function satisfiedItem(overrides = {}) {
  return {
    ...pendingItem(),
    headSha: HEAD_1,
    conclusion: 'SUCCESS',
    url: 'https://github.example/check/1',
    ...overrides,
  };
}

function report(status, readiness) {
  return [
    '# Verification Report',
    '',
    `### Implementation Status: ${status}`,
    '',
    marker('nmg-sdlc-issue-scope', SCOPE),
    readiness ? marker('nmg-sdlc-pr-readiness', readiness) : '',
    '',
  ].join('\n');
}

function verificationArtifact(results, overrides = {}) {
  const enriched = (Array.isArray(results) ? results : []).map((r) => {
    if (r && r.provider === 'builtin.command') return r;
    if (r && r.applicable && !r.request) {
      return {
        ...r,
        request: { validationId: r.id, identity: { headSha: HEAD_1 } },
        result: { schemaVersion: 1, status: r.effectiveStatus || 'failed', summary: 'x', identity: { headSha: HEAD_1 }, evidence: [] },
      };
    }
    return r;
  });
  const required = enriched.filter((result) => result.required && result.applicable);
  const ceiling = required.some(({ effectiveStatus }) => effectiveStatus === 'incomplete')
    ? 'Incomplete'
    : required.some(({ effectiveStatus }) => effectiveStatus !== 'passed')
      ? 'Fail'
      : null;
  return {
    schemaVersion: 1,
    issue: 42,
    identity: { headSha: HEAD_1 },
    ceiling,
    coverage: { complete: true, missing: [], duplicate: [], unknown: [] },
    results: enriched,
    ...overrides,
  };
}

function pendingReadiness(overrides = {}) {
  return {
    schemaVersion: 1,
    state: 'pr_evidence_pending',
    issueNumber: 42,
    specPath: SPEC_PATH,
    local: localEvidence(),
    pendingEvidence: [pendingItem()],
    ...overrides,
  };
}

function satisfiedReadiness(overrides = {}) {
  return {
    schemaVersion: 1,
    state: 'pr_evidence_satisfied',
    issueNumber: 42,
    specPath: SPEC_PATH,
    local: localEvidence(),
    evidence: [satisfiedItem()],
    ...overrides,
  };
}

describe('check identity resolution', () => {
  const check = (name, workflow, state = 'SUCCESS') => ({ name, workflow, state });

  it('reconstructs workflow-qualified identities from authoritative fields', () => {
    expect(canonicalCheckName(' verify ', ' Python CI ')).toBe('Python CI / verify');
    expect(resolveDeclaredCheck('Python CI / verify', [
      check('verify', 'Python CI'),
    ])).toMatchObject({ status: 'matched', check: { name: 'verify', workflow: 'Python CI' } });
  });

  it('rejects a qualified declaration when authoritative workflow identity differs', () => {
    expect(resolveDeclaredCheck('Python CI / verify', [
      check('Python CI / verify', 'Other CI'),
    ])).toEqual({ status: 'mismatch', check: null });
  });

  it('fails closed on bare-name collisions across workflows', () => {
    expect(resolveDeclaredCheck('verify', [
      check('verify', 'Python CI'),
      check('verify', 'Node CI'),
    ])).toEqual({ status: 'mismatch', check: null });
  });

  it('matches one bare name with empty workflow metadata', () => {
    expect(canonicalCheckName(' contract-tests ', '  ')).toBe('contract-tests');
    expect(resolveDeclaredCheck('contract-tests', [
      check('contract-tests', ''),
    ])).toMatchObject({ status: 'matched' });
  });

  it('distinguishes pending absence from terminal identity mismatch', () => {
    expect(resolveDeclaredCheck('Python CI / verify', [])).toEqual({
      status: 'pending',
      check: null,
    });
    expect(resolveDeclaredCheck('Python CI / verify', [
      check('lint', 'Python CI', 'PENDING'),
    ])).toEqual({ status: 'pending', check: null });
    expect(resolveDeclaredCheck('Python CI / verify', [
      check('lint', 'Python CI', 'SUCCESS'),
    ])).toEqual({ status: 'mismatch', check: null });
  });

  it('never suffix-matches a differently qualified declaration', () => {
    expect(resolveDeclaredCheck('Other CI / verify', [
      check('verify', 'Python CI'),
    ])).toEqual({ status: 'mismatch', check: null });
  });
});

describe('verification readiness contract', () => {
  it('preserves ordinary Pass delivery without a readiness marker', () => {
    expect(inspectVerificationReadiness({
      content: report('Pass'),
      options: { expectedScope: SCOPE },
    })).toMatchObject({ status: 'pass', reasonCode: 'ordinary_pass', gaps: [] });
  });

  it('accepts resolver-produced named scenarios without losing exact scope matching', () => {
    const metadata = '**Issue**: #42\n';
    const resolved = classifyIssueSpecScope({ issueNumber: 42, specPath: 'specs/42-fixture' }, {
      requirements: `${metadata}\n### AC1: Count greeting words\n`,
      design: metadata,
      tasks: `${metadata}\n### T001: Add the helper\n`,
      gherkin: `${metadata}\nFeature: Greeting words\n  @AC1\n  Scenario: Count greeting words\n    Given a valid name\n    Then the word count is correct\n`,
    });
    expect(resolved.status).toBe('implicit_single_issue');
    expect(resolved.delivery.scenarios).toEqual(['SCENARIO:Count greeting words']);
    const { issueNumber, specPath, status, delivery, regression } = resolved;
    const scope = { issueNumber, specPath, status, delivery, regression };
    const content = `### Implementation Status: Pass\n\n${marker('nmg-sdlc-issue-scope', scope)}\n`;
    expect(inspectVerificationReadiness({ content, options: { expectedScope: resolved } }))
      .toMatchObject({ status: 'pass', reasonCode: 'ordinary_pass', gaps: [] });
    expect(inspectVerificationReadiness({
      content,
      options: { expectedScope: { ...resolved, delivery: { ...delivery, scenarios: ['SCENARIO:A different obligation'] } } },
    })).toMatchObject({ status: 'unverifiable', reasonCode: 'scope_evidence_invalid' });
  });

  it.each([
    ['explicit manifest', 'scoped', ['SCENARIO:Count greeting words']],
    ['empty name', 'implicit_single_issue', ['SCENARIO:']],
    ['multiline name', 'implicit_single_issue', ['SCENARIO:Count\nwords']],
    ['duplicate identity', 'implicit_single_issue', ['SCENARIO:Count words', 'SCENARIO:Count words']],
  ])('rejects invalid named scenario evidence: %s', (_case, status, scenarios) => {
    const scope = {
      ...SCOPE,
      status,
      delivery: { ...SCOPE.delivery, scenarios },
      regression: { ...SCOPE.regression, scenarios: [] },
    };
    const content = report('Pass').replace(marker('nmg-sdlc-issue-scope', SCOPE), marker('nmg-sdlc-issue-scope', scope));
    expect(inspectVerificationReadiness({ content }))
      .toMatchObject({ status: 'unverifiable', reasonCode: 'scope_evidence_invalid' });
  });

  it('rejects a malformed optional readiness marker instead of treating it as an ordinary pass', () => {
    const malformed = report('Pass').replace(
      '\n\n',
      '\n\n<!-- nmg-sdlc-pr-readiness: {"state": -->\n\n',
    );
    const result = inspectVerificationReadiness({
      content: malformed,
      options: { expectedScope: SCOPE },
    });
    expect(result).toMatchObject({ status: 'unverifiable' });
    expect(result.gaps.join('\n')).toContain('PR-readiness marker is invalid JSON');
  });

  it('ignores misleading prose and rejects duplicate canonical status headings', () => {
    const misleading = report('Partial').replace(
      '# Verification Report',
      '# Verification Report\n\nNarrative text says Implementation Status: Pass, but it is not the canonical field.',
    );
    expect(inspectVerificationReadiness({
      content: misleading,
      options: { expectedScope: SCOPE },
    })).toMatchObject({ status: 'blocked', implementationStatus: 'partial' });

    const duplicate = report('Pass').replace(
      '### Implementation Status: Pass',
      '### Implementation Status: Pass\n\n### Implementation Status: Partial',
    );
    expect(inspectVerificationReadiness({
      content: duplicate,
      options: { expectedScope: SCOPE },
    })).toMatchObject({
      status: 'unverifiable',
      reasonCode: 'implementation_status_ambiguous',
      gaps: ['verification report must contain exactly one canonical Implementation Status heading'],
    });
  });


  it('accepts exact scoped local completion with allowlisted pending evidence', () => {
    expect(inspectVerificationReadiness({
      content: report('PR Evidence Pending', pendingReadiness()),
      options: { expectedScope: SCOPE },
    })).toMatchObject({
      status: 'pr_evidence_pending',
      implementationStatus: 'pr_evidence_pending',
      gaps: [],
    });
  });

  it('rejects an allowlisted check that is available before pull-request creation', () => {
    const result = inspectVerificationReadiness({
      content: report('PR Evidence Pending', pendingReadiness({
        pendingEvidence: [pendingItem({ event: 'push' })],
      })),
      options: { expectedScope: SCOPE },
    });
    expect(result).toMatchObject({ status: 'unverifiable' });
    expect(result.gaps).toContain('evidence item 1 is not proven pull-request-only');
  });

  it('accepts satisfied evidence only for the expected head SHA', () => {
    const valid = inspectVerificationReadiness({
      content: report('Pass', satisfiedReadiness()),
      options: { expectedScope: SCOPE, expectedHeadSha: HEAD_1 },
    });
    expect(valid).toMatchObject({ status: 'pr_evidence_satisfied', gaps: [] });

    const stale = inspectVerificationReadiness({
      content: report('Pass', satisfiedReadiness()),
      options: { expectedScope: SCOPE, expectedHeadSha: HEAD_2 },
    });
    expect(stale).toMatchObject({ status: 'unverifiable' });
    expect(stale.gaps).toContain('evidence item 1 does not match the expected head SHA');
  });

  it('rejects a non-string satisfied head SHA without throwing', () => {
    const content = report('Pass', satisfiedReadiness({
      evidence: [satisfiedItem({ headSha: 123 })],
    }));
    expect(() => inspectVerificationReadiness({
      content,
      options: { expectedScope: SCOPE, expectedHeadSha: HEAD_1 },
    })).not.toThrow();
    expect(inspectVerificationReadiness({
      content,
      options: { expectedScope: SCOPE, expectedHeadSha: HEAD_1 },
    }).gaps).toContain('evidence item 1 has an invalid head SHA');
  });

  it('requires every satisfied item to reference one exact recorded head', () => {
    const result = inspectVerificationReadiness({
      content: report('Pass', satisfiedReadiness({
        evidence: [
          satisfiedItem(),
          {
            kind: 'merge_blocking',
            name: 'merge-blocking-contract',
            acceptanceCriteria: ['AC2'],
            headSha: HEAD_2,
            conclusion: 'OBSERVED',
            url: 'https://github.example/pull/50',
            observedStates: ['BLOCKED', 'CLEAN'],
          },
        ],
      })),
      options: { expectedScope: SCOPE },
    });
    expect(result).toMatchObject({ status: 'unverifiable' });
    expect(result.gaps).toContain('satisfied evidence must reference one exact head SHA');
  });

  test.each(['Partial', 'Incomplete', 'Fail'])(
    'keeps generic %s reports blocked',
    (status) => {
      expect(inspectVerificationReadiness({
        content: report(status),
        options: { expectedScope: SCOPE },
      })).toMatchObject({ status: 'blocked', reasonCode: 'implementation_non_pass' });
    },
  );

  it('separates exact-head local failures from external incomplete evidence', () => {
    const result = inspectVerificationArtifactRepair(verificationArtifact([
      {
        id: 'repository.api-tests', provider: 'builtin.command',
        required: true, applicable: true, effectiveStatus: 'failed',
      },
      {
        id: 'repository.robot-integration', provider: 'project.robot-integration',
        required: true, applicable: true, effectiveStatus: 'incomplete',
      },
      {
        id: 'repository.flutter-tests', provider: 'builtin.command',
        required: true, applicable: true, effectiveStatus: 'passed',
      },
    ]), { expectedIssueNumber: 42, expectedHeadSha: HEAD_1 });
    expect(result).toEqual({
      status: 'repairable',
      reasonCode: 'required_local_validation_failed',
      gaps: [],
      failedLocal: ['repository.api-tests'],
      failedExternal: [],
      incomplete: ['repository.robot-integration'],
    });
  });

  it('keeps incomplete-only and external failures as intervention', () => {
    expect(inspectVerificationArtifactRepair(verificationArtifact([
      {
        id: 'repository.robot-integration', provider: 'project.robot-integration',
        required: true, applicable: true, effectiveStatus: 'incomplete',
      },
    ]), { expectedIssueNumber: 42, expectedHeadSha: HEAD_1 })).toMatchObject({
      status: 'intervention',
      failedLocal: [],
      incomplete: ['repository.robot-integration'],
    });
    expect(inspectVerificationArtifactRepair(verificationArtifact([
      {
        id: 'repository.remote-policy', provider: 'project.remote-policy',
        required: true, applicable: true, effectiveStatus: 'failed',
      },
    ]), { expectedIssueNumber: 42, expectedHeadSha: HEAD_1 })).toMatchObject({
      status: 'intervention',
      failedLocal: [],
      failedExternal: ['repository.remote-policy'],
    });
  });
  it('routes a registered failed local project command while retaining the failed gate', () => {
    const command = {
      kind: 'command', program: 'flutter', args: ['test', 'integration_test/app_test.dart'],
      cwd: 'mobile', exitCode: 1,
    };
    const identity = {
      headSha: HEAD_1, steeringHash: 'sha256:steering', specHash: 'sha256:spec',
      validationConfigHash: 'sha256:validation',
    };
    const project = {
      id: 'repository.robot-integration', provider: 'project.robot-integration',
      required: true, applicable: true, effectiveStatus: 'failed',
      request: { validationId: 'repository.robot-integration', identity },
      result: {
        schemaVersion: 1, status: 'failed', summary: 'robot tests exited 1',
        identity, evidence: [command], repairable: true,
      },
    };
    const artifact = verificationArtifact([project], {
      identity: { headSha: HEAD_1, steeringHash: identity.steeringHash, specHash: identity.specHash },
      coverage: { declared: 1, recorded: 1, complete: true, missing: [], duplicate: [], unknown: [] },
    });
    expect(inspectVerificationArtifactRepair(artifact, {
      expectedIssueNumber: 42, expectedHeadSha: HEAD_1,
    })).toMatchObject({
      status: 'repairable', failedLocal: ['repository.robot-integration'],
      failedExternal: [], incomplete: [],
    });
    expect(artifact.ceiling).toBe('Fail');

    for (const mutate of [
      (copy) => { delete copy.results[0].result.repairable; },
      (copy) => { copy.results[0].result.repairable = false; },
      (copy) => { copy.results[0].result.evidence[0].exitCode = undefined; },
      (copy) => { copy.results[0].result.evidence[0].program = ''; },
      (copy) => { copy.results[0].request.identity.headSha = HEAD_2; },
      (copy) => { copy.coverage.recorded = 0; },
      (copy) => { copy.identity.headSha = HEAD_2; },
      (copy) => { copy.results[0].result.unknownField = true; },
    ]) {
      const copy = structuredClone(artifact);
      mutate(copy);
      expect(inspectVerificationArtifactRepair(copy, {
        expectedIssueNumber: 42, expectedHeadSha: HEAD_1,
      }).status).not.toBe('repairable');
    }
  });

  it('keeps external prerequisites and absent local project execution blocked', () => {
    const identity = { headSha: HEAD_1, steeringHash: 'steering', specHash: 'spec' };
    const result = {
      id: 'repository.robot-integration', provider: 'project.robot-integration',
      required: true, applicable: true, effectiveStatus: 'failed',
      request: { validationId: 'repository.robot-integration', identity },
      result: {
        schemaVersion: 1, status: 'failed', summary: 'device unavailable',
        identity, evidence: [], repairable: true,
      },
    };
    const makeArtifact = (results) => verificationArtifact(results, {
      identity, coverage: {
        declared: results.length, recorded: results.length, complete: true,
        missing: [], duplicate: [], unknown: [],
      },
    });
    expect(inspectVerificationArtifactRepair(makeArtifact([result]), {
      expectedIssueNumber: 42, expectedHeadSha: HEAD_1,
    }).status).not.toBe('repairable');
    result.result.evidence = [{
      kind: 'command', program: 'flutter', args: ['test'], cwd: 'mobile', exitCode: 1,
    }];
    const incomplete = {
      id: 'repository.device', provider: 'project.device', required: true,
      applicable: true, effectiveStatus: 'incomplete',
    };
    expect(inspectVerificationArtifactRepair(makeArtifact([result, incomplete]), {
      expectedIssueNumber: 42, expectedHeadSha: HEAD_1,
    }).status).toBe('intervention');
  });

  it('requires an owner-bound original envelope for legacy local command recovery', () => {
    const requestIdentity = {
      headSha: HEAD_1, steeringHash: 'steering', specHash: 'spec',
      validationConfigHash: 'config', treeState: 'dirty', dirtyDiffHash: 'diff',
    };
    const result = {
      id: 'repository.robot-integration', provider: 'project.robot-integration',
      required: true, applicable: true, effectiveStatus: 'failed',
      request: {
        validationId: 'repository.robot-integration', identity: requestIdentity,
        verification: { runId: 'original-run', issue: 42, specPath: SPEC_PATH },
      },
      result: {
        schemaVersion: 1, status: 'failed', summary: 'test exited 1',
        identity: requestIdentity, evidence: [{ kind: 'command', summary: 'test exited 1' }],
      },
    };
    const legacy = verificationArtifact([result], {
      identity: { headSha: HEAD_1, steeringHash: 'steering', specHash: 'spec' },
      coverage: { declared: 1, recorded: 1, complete: true, missing: [], duplicate: [], unknown: [] },
    });
    const expected = {
      expectedIssueNumber: 42, expectedHeadSha: HEAD_1,
      expectedRunId: 'original-run', expectedSpecPath: SPEC_PATH,
    };
    expect(inspectVerificationArtifactRepair(legacy, expected).status).toBe('intervention');
    expect(inspectLegacyVerificationArtifactForRepair(legacy, expected)).toMatchObject({
      status: 'repairable', failedLocal: ['repository.robot-integration'],
    });
    for (const mutate of [
      (copy) => { copy.results[0].request.verification.runId = 'foreign'; },
      (copy) => {
        copy.results[0].result.identity = {
          ...copy.results[0].result.identity, validationConfigHash: 'foreign',
        };
      },
      (copy) => { copy.results[0].result.repairable = true; },
      (copy) => { copy.results[0].result.evidence = []; },
      (copy) => { copy.results.push({ ...copy.results[0], id: 'duplicate' }); },
      (copy) => { copy.coverage.complete = false; },
      (copy) => { copy.ceiling = 'Incomplete'; },
    ]) {
      const copy = structuredClone(legacy);
      mutate(copy);
      expect(inspectLegacyVerificationArtifactForRepair(copy, expected).status).not.toBe('repairable');
    }
  });

  it.each([
    ['stale head', (artifact) => { artifact.identity.headSha = HEAD_2; }],
    ['wrong issue', (artifact) => { artifact.issue = 7; }],
    ['incomplete coverage', (artifact) => { artifact.coverage.complete = false; }],
    ['duplicate result', (artifact) => { artifact.results.push({ ...artifact.results[0] }); }],
    ['ceiling mismatch', (artifact) => { artifact.ceiling = 'Fail'; }],
  ])('rejects %s verification artifact evidence', (_label, mutate) => {
    const artifact = verificationArtifact([{
      id: 'repository.api-tests', provider: 'builtin.command',
      required: true, applicable: true, effectiveStatus: 'incomplete',
    }]);
    mutate(artifact);
    expect(inspectVerificationArtifactRepair(artifact, {
      expectedIssueNumber: 42,
      expectedHeadSha: HEAD_1,
    })).toMatchObject({ status: 'unverifiable', reasonCode: 'verification_artifact_invalid' });
  });

  it('rejects unknown evidence kinds, fields, and local omissions', () => {
    const unknownKind = pendingReadiness({
      pendingEvidence: [{
        kind: 'manual_exception',
        name: 'contract-tests',
        acceptanceCriteria: ['AC1'],
      }],
    });
    expect(inspectVerificationReadiness({
      content: report('PR Evidence Pending', unknownKind),
      options: { expectedScope: SCOPE },
    }).gaps).toContain('evidence item 1 has unsupported kind');

    const extraField = pendingReadiness({ bypass: true });
    expect(inspectVerificationReadiness({
      content: report('PR Evidence Pending', extraField),
      options: { expectedScope: SCOPE },
    }).gaps).toContain('PR-readiness marker has an unsupported state or unknown fields');

    const incompleteLocal = pendingReadiness({
      local: localEvidence({ tasks: [], steeringGates: 'incomplete' }),
    });
    const result = inspectVerificationReadiness({
      content: report('PR Evidence Pending', incompleteLocal),
      options: { expectedScope: SCOPE },
    });
    expect(result.gaps).toEqual(expect.arrayContaining([
      'readiness local evidence does not match the active issue scope',
      'readiness requires every applicable steering gate to pass',
    ]));
  });

  it('rejects scope mismatches, duplicate markers, and invalid merge evidence', () => {
    const mismatched = structuredClone(SCOPE);
    mismatched.issueNumber = 41;
    const mismatchReport = report('PR Evidence Pending', pendingReadiness())
      .replace(marker('nmg-sdlc-issue-scope', SCOPE), marker('nmg-sdlc-issue-scope', mismatched));
    expect(inspectVerificationReadiness({
      content: mismatchReport,
      options: { expectedScope: SCOPE },
    }).gaps).toEqual(expect.arrayContaining([
      'issue-scope marker does not match the live normalized scope',
      'PR-readiness identity does not match the issue-scope marker',
    ]));

    const duplicate = `${report('PR Evidence Pending', pendingReadiness())}\n${marker('nmg-sdlc-pr-readiness', pendingReadiness())}`;
    expect(inspectVerificationReadiness({
      content: duplicate,
      options: { expectedScope: SCOPE },
    }).gaps).toContain('PR-readiness marker must appear exactly once');

    const invalidMerge = satisfiedReadiness({
      evidence: [{
        kind: 'merge_blocking',
        name: 'contract-tests',
        acceptanceCriteria: ['AC1'],
        headSha: HEAD_1,
        conclusion: 'OBSERVED',
        url: 'https://github.example/pull/50',
        observedStates: ['CLEAN'],
      }],
    });
    expect(inspectVerificationReadiness({
      content: report('Pass', invalidMerge),
      options: { expectedScope: SCOPE, expectedHeadSha: HEAD_1 },
    }).gaps).toContain('evidence item 1 lacks a bounded blocking merge-state observation');
  });
});

describe('final delivery validation marker', () => {
  it('pins final evidence to issue, PR, spec, head, and declared identities', () => {
    const evidence = [satisfiedItem({ headSha: HEAD_2 })];
    const body = marker('nmg-sdlc-delivery-validation', {
      schemaVersion: 1,
      state: 'final_sha_validated',
      issueNumber: 42,
      specPath: SPEC_PATH,
      pullRequestNumber: 50,
      headSha: HEAD_2,
      evidence,
    });
    expect(inspectDeliveryValidation({
      content: body,
      options: {
        expectedIssueNumber: 42,
        expectedSpecPath: SPEC_PATH,
        expectedPullRequestNumber: 50,
        expectedHeadSha: HEAD_2,
        deliveryAcceptanceCriteria: SCOPE.delivery.acceptanceCriteria,
        expectedEvidenceIdentities: [pendingItem()],
      },
    })).toMatchObject({ status: 'final_sha_validated', gaps: [] });
  });
});

describe('verification readiness CLI', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-readiness-'));
    fs.mkdirSync(path.join(root, 'specs', 'feature-readiness'), { recursive: true });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('emits JSON and stable exit codes for pending and blocked reports', () => {
    const reportPath = path.join(root, 'specs', 'feature-readiness', 'verification-report.md');
    fs.writeFileSync(reportPath, report('PR Evidence Pending', pendingReadiness()));
    let stdout = '';
    let stderr = '';
    expect(runCli([
      '--project', root,
      '--spec', SPEC_PATH,
      '--issue', '42',
      '--json',
    ], {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    })).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ status: 'pr_evidence_pending' });
    expect(stderr).toBe('');

    fs.writeFileSync(reportPath, report('Partial'));
    stdout = '';
    expect(runCli([
      '--project', root,
      '--spec', SPEC_PATH,
      '--issue', '42',
      '--json',
    ], {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: () => {} },
    })).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({ status: 'blocked' });
  });

  it('validates a fetched PR body against a satisfied report before ready transition', () => {
    const reportPath = path.join(root, 'specs', 'feature-readiness', 'verification-report.md');
    const bodyPath = path.join(root, 'pr-body.md');
    fs.writeFileSync(reportPath, report('Pass', satisfiedReadiness()));
    fs.writeFileSync(bodyPath, marker('nmg-sdlc-delivery-validation', {
      schemaVersion: 1,
      state: 'final_sha_validated',
      issueNumber: 42,
      specPath: SPEC_PATH,
      pullRequestNumber: 50,
      headSha: HEAD_2,
      evidence: [satisfiedItem({ headSha: HEAD_2 })],
    }));

    let stdout = '';
    let stderr = '';
    expect(runCli([
      '--project', root,
      '--spec', SPEC_PATH,
      '--issue', '42',
      '--pr', '50',
      '--head', HEAD_2,
      '--delivery-body-file', bodyPath,
      '--json',
    ], {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    })).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ status: 'final_sha_validated', gaps: [] });
    expect(stderr).toBe('');

    fs.writeFileSync(bodyPath, marker('nmg-sdlc-delivery-validation', {
      schemaVersion: 1,
      state: 'final_sha_validated',
      issueNumber: 42,
      specPath: SPEC_PATH,
      pullRequestNumber: 50,
      headSha: HEAD_1,
      evidence: [satisfiedItem({ headSha: HEAD_1 })],
    }));
    stdout = '';
    expect(runCli([
      '--project', root,
      '--spec', SPEC_PATH,
      '--issue', '42',
      '--pr', '50',
      '--head', HEAD_2,
      '--delivery-body-file', bodyPath,
      '--json',
    ], {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: () => {} },
    })).toBe(2);
    expect(JSON.parse(stdout)).toMatchObject({ status: 'unverifiable' });
  });
});
