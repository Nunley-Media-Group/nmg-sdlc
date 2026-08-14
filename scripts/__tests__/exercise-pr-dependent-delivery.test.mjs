import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evidenceIdentity,
  inspectDeliveryValidation,
  inspectVerificationReadiness,
} from '../verification-readiness.mjs';

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../__fixtures__/pr-dependent-verification',
);
const H1 = '1'.repeat(40);
const H2 = '2'.repeat(40);
const ISSUE = 122;
const SPEC = 'specs/feature-pathcast-guardrail';
const DELIVERY_ACS = ['AC1', 'AC2'];

function fixture(name) {
  return fs.readFileSync(path.join(fixtureRoot, name), 'utf8');
}

function readiness(content, headSha) {
  return inspectVerificationReadiness({
    content,
    options: {
      expectedIssueNumber: ISSUE,
      expectedSpecPath: SPEC,
      expectedHeadSha: headSha,
    },
  });
}

function exercise(options = {}) {
  const commands = [];
  const initial = readiness(fixture(options.report ?? 'qualified-pending.md'));
  if (initial.status === 'pass') {
    commands.push('gh pr create --title <title> --body <body>');
    return { status: 'ordinary', commands, initial };
  }
  if (initial.status !== 'pr_evidence_pending') {
    return { status: 'blocked', commands, initial };
  }

  commands.push('gh pr create --draft --title <title> --body-file <file>');
  commands.push('gh pr view 200 --json headRefOid,isDraft');
  commands.push('gh pr checks 200 --required --json name,state,bucket,link');
  if ((options.h1State ?? 'SUCCESS') !== 'SUCCESS') {
    return { status: 'draft-preserved', commands, gap: `H1 ${options.h1State}` };
  }

  commands.push('$nmg-sdlc:verify-code #122');
  const h1 = readiness(
    fixture('qualified-satisfied-h1.md'),
    options.expectedH1 ?? H1,
  );
  if (h1.status !== 'pr_evidence_satisfied') {
    return { status: 'draft-preserved', commands, h1 };
  }

  commands.push('git commit -m docs:record-pr-verification-evidence');
  commands.push('git push --force-with-lease=HEAD:<expected>');
  commands.push('gh pr view 200 --json headRefOid,isDraft');
  commands.push('gh pr checks 200 --required --json name,state,bucket,link');
  if ((options.h2State ?? 'SUCCESS') !== 'SUCCESS') {
    return { status: 'draft-preserved', commands, gap: `H2 ${options.h2State}` };
  }

  const body = options.finalBody ?? fixture('final-pr-body-h2.md');
  const expectedEvidenceIdentities = initial.readiness.pendingEvidence.map(evidenceIdentity);
  const final = inspectDeliveryValidation({
    content: body,
    options: {
      expectedIssueNumber: ISSUE,
      expectedSpecPath: SPEC,
      expectedPullRequestNumber: 200,
      expectedHeadSha: H2,
      deliveryAcceptanceCriteria: DELIVERY_ACS,
      expectedEvidenceIdentities,
    },
  });
  if (final.status !== 'final_sha_validated') {
    return { status: 'draft-preserved', commands, final };
  }

  commands.push('gh pr edit 200 --body-file <file>');
  commands.push('gh pr ready 200');
  return { status: 'ready', commands, initial, h1, final };
}

function expectPreserved(result) {
  expect(result.status).toBe('draft-preserved');
  const joined = result.commands.join('\n');
  for (const forbidden of [
    'gh pr ready',
    'gh pr merge',
    'git checkout',
    'git branch -d',
    'ruleset',
    'protection mutation',
  ]) {
    expect(joined).not.toContain(forbidden);
  }
}

describe('PR-dependent delivery exercise', () => {
  it('reproduces the PathCast #122 boundary and advances only after H1 and H2 validation', () => {
    const result = exercise();
    expect(result.status).toBe('ready');
    expect(result.initial).toMatchObject({ status: 'pr_evidence_pending', gaps: [] });
    expect(result.h1).toMatchObject({ status: 'pr_evidence_satisfied', gaps: [] });
    expect(result.final).toMatchObject({ status: 'final_sha_validated', gaps: [] });
    expect(result.commands).toEqual([
      'gh pr create --draft --title <title> --body-file <file>',
      'gh pr view 200 --json headRefOid,isDraft',
      'gh pr checks 200 --required --json name,state,bucket,link',
      '$nmg-sdlc:verify-code #122',
      'git commit -m docs:record-pr-verification-evidence',
      'git push --force-with-lease=HEAD:<expected>',
      'gh pr view 200 --json headRefOid,isDraft',
      'gh pr checks 200 --required --json name,state,bucket,link',
      'gh pr edit 200 --body-file <file>',
      'gh pr ready 200',
    ]);
  });

  it('preserves ordinary Pass creation without selecting draft delivery', () => {
    expect(exercise({ report: 'ordinary-pass.md' })).toMatchObject({
      status: 'ordinary',
      commands: ['gh pr create --title <title> --body <body>'],
    });
  });

  test.each([
    ['generic Partial', 'partial.md'],
    ['failed local gate', 'failed-gate.md'],
    ['stale scope', 'stale-scope.md'],
    ['malformed marker', 'malformed-marker.md'],
    ['unknown evidence kind', 'unknown-kind.md'],
  ])('blocks %s before draft creation', (_label, report) => {
    const result = exercise({ report });
    expect(result.status).toBe('blocked');
    expect(result.commands).toEqual([]);
    expect(result.initial.status).toMatch(/blocked|unverifiable/);
  });

  test.each([
    ['missing H1 check', { h1State: 'MISSING' }],
    ['failed H1 check', { h1State: 'FAILURE' }],
    ['cancelled H1 check', { h1State: 'CANCELLED' }],
    ['timed-out H1 check', { h1State: 'TIMED_OUT' }],
    ['failed H2 check', { h2State: 'FAILURE' }],
    ['cancelled H2 check', { h2State: 'CANCELLED' }],
    ['timed-out H2 check', { h2State: 'TIMED_OUT' }],
    ['stale H1 evidence', { expectedH1: H2 }],
    ['malformed final marker', { finalBody: '<!-- nmg-sdlc-delivery-validation: {bad} -->' }],
    ['duplicate final marker', {
      finalBody: `${fixture('final-pr-body-h2.md')}\n${fixture('final-pr-body-h2.md').match(/<!-- nmg-sdlc-delivery-validation: .* -->/)[0]}\n`,
    }],
  ])('preserves the draft and branch for %s', (_label, options) => {
    expectPreserved(exercise(options));
  });
});
