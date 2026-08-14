import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  inspectDeliveryValidation,
  inspectVerificationReadiness,
  runCli,
} from '../verification-readiness.mjs';

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

describe('verification readiness contract', () => {
  it('preserves ordinary Pass delivery without a readiness marker', () => {
    expect(inspectVerificationReadiness({
      content: report('Pass'),
      options: { expectedScope: SCOPE },
    })).toMatchObject({ status: 'pass', reasonCode: 'ordinary_pass', gaps: [] });
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

  test.each(['Partial', 'Incomplete', 'Fail'])(
    'keeps generic %s reports blocked',
    (status) => {
      expect(inspectVerificationReadiness({
        content: report(status),
        options: { expectedScope: SCOPE },
      })).toMatchObject({ status: 'blocked', reasonCode: 'implementation_non_pass' });
    },
  );

  it('rejects unknown evidence kinds, fields, and local omissions', () => {
    const unknownKind = pendingReadiness({
      pendingEvidence: [pendingItem({ kind: 'manual_exception' })],
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
      evidence: [satisfiedItem({
        kind: 'merge_blocking',
        conclusion: 'OBSERVED',
        observedStates: ['CLEAN'],
      })],
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
});
