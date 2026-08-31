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
const SUCCESS_EQUIVALENT = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

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

function isSuccessEquivalent(state) {
  return SUCCESS_EQUIVALENT.has(state);
}

function exercise(options = {}) {
  const commands = [];
  const observedH1 = options.observedH1 ?? H1;
  const observedH2 = options.observedH2 ?? H2;
  const reportContent = fixture(options.report ?? 'qualified-pending.md').replaceAll(H1, observedH1);
  const initial = readiness(reportContent);
  if (initial.status === 'pass') {
    commands.push('gh pr create --title <title> --body <body>');
    return { status: 'ordinary', commands, initial };
  }
  const resumingSatisfiedDraft = initial.status === 'pr_evidence_satisfied'
    && options.resumeDraft === true;
  if (initial.status !== 'pr_evidence_pending' && !resumingSatisfiedDraft) {
    return { status: 'blocked', commands, initial };
  }

  let h1 = null;
  let expectedEvidenceIdentities;
  if (resumingSatisfiedDraft) {
    commands.push('gh pr view 200 --json headRefOid,isDraft,baseRefName,headRefName,closingIssuesReferences');
    expectedEvidenceIdentities = initial.readiness.evidence.map(evidenceIdentity);
  } else {
    commands.push('gh pr create --draft --title <title> --body-file <file>');
    commands.push('gh pr view 200 --json headRefOid,isDraft');
    commands.push('gh pr checks 200 --required --json name,state,bucket,link,event,workflow');
    if (!isSuccessEquivalent(options.h1State ?? 'SUCCESS')) {
      return { status: 'draft-preserved', commands, gap: `H1 ${options.h1State}` };
    }

    commands.push('$nmg-sdlc:verify-code #122');
    h1 = readiness(
      fixture('qualified-satisfied-h1.md').replaceAll(H1, observedH1),
      options.expectedH1 ?? observedH1,
    );
    if (h1.status !== 'pr_evidence_satisfied') {
      return { status: 'draft-preserved', commands, h1 };
    }

    commands.push('git commit -m docs:record-pr-verification-evidence');
    commands.push('git push --force-with-lease=HEAD:<expected>');
    commands.push('gh pr view 200 --json headRefOid,isDraft');
    if (observedH2 === observedH1) {
      return { status: 'draft-preserved', commands, gap: 'H2 did not advance after the report commit' };
    }
    expectedEvidenceIdentities = initial.readiness.pendingEvidence.map(evidenceIdentity);
  }

  commands.push('gh pr checks 200 --required --json name,state,bucket,link,event,workflow');
  if (!isSuccessEquivalent(options.h2State ?? 'SUCCESS')) {
    return { status: 'draft-preserved', commands, gap: `H2 ${options.h2State}` };
  }

  const body = (options.finalBody ?? fixture('final-pr-body-h2.md')).replaceAll(H2, observedH2);
  commands.push('gh pr edit 200 --body-file <file>');
  commands.push('gh pr view 200 --json body,headRefOid,isDraft --jq .body > <refetched-body-file>');
  const fetched = {
    body: options.fetchedBody ?? body,
    headRefOid: options.fetchedHeadSha ?? observedH2,
    isDraft: options.fetchedIsDraft ?? true,
  };
  const final = inspectDeliveryValidation({
    content: fetched.body,
    options: {
      expectedIssueNumber: ISSUE,
      expectedSpecPath: SPEC,
      expectedPullRequestNumber: 200,
      expectedHeadSha: observedH2,
      deliveryAcceptanceCriteria: DELIVERY_ACS,
      expectedEvidenceIdentities,
    },
  });
  if (final.status !== 'final_sha_validated') {
    return { status: 'draft-preserved', commands, fetched, final };
  }
  if (fetched.headRefOid !== observedH2 || fetched.isDraft !== true) {
    return {
      status: 'draft-preserved',
      commands,
      fetched,
      gap: fetched.headRefOid !== observedH2
        ? 'remote head changed before final validation'
        : 'remote pull request is no longer draft',
    };
  }

  commands.push('node <plugin-root>/scripts/verification-readiness.mjs --project <project-root> --spec specs/feature-pathcast-guardrail --issue 122 --pr 200 --head <H2> --delivery-body-file <refetched-body-file> --json');
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
      'gh pr checks 200 --required --json name,state,bucket,link,event,workflow',
      '$nmg-sdlc:verify-code #122',
      'git commit -m docs:record-pr-verification-evidence',
      'git push --force-with-lease=HEAD:<expected>',
      'gh pr view 200 --json headRefOid,isDraft',
      'gh pr checks 200 --required --json name,state,bucket,link,event,workflow',
      'gh pr edit 200 --body-file <file>',
      'gh pr view 200 --json body,headRefOid,isDraft --jq .body > <refetched-body-file>',
      'node <plugin-root>/scripts/verification-readiness.mjs --project <project-root> --spec specs/feature-pathcast-guardrail --issue 122 --pr 200 --head <H2> --delivery-body-file <refetched-body-file> --json',
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
    ['pre-PR check evidence', 'pre-pr-check.md'],
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
    ['unchanged H2 after report commit', { observedH2: H1 }],
    ['malformed final marker', { finalBody: '<!-- nmg-sdlc-delivery-validation: {bad} -->' }],
    ['duplicate final marker', {
      finalBody: `${fixture('final-pr-body-h2.md')}\n${fixture('final-pr-body-h2.md').match(/<!-- nmg-sdlc-delivery-validation: .* -->/)[0]}\n`,
    }],
  ])('preserves the draft and branch for %s', (_label, options) => {
    expectPreserved(exercise(options));
  });

  it('supports distinct observed H1 and H2 identities', () => {
    expect(exercise({ observedH1: '3'.repeat(40), observedH2: '4'.repeat(40) }))
      .toMatchObject({ status: 'ready' });
  });

  test.each([
    ['H1 NEUTRAL', { h1State: 'NEUTRAL' }],
    ['H1 SKIPPED', { h1State: 'SKIPPED' }],
    ['H2 NEUTRAL', { h2State: 'NEUTRAL' }],
    ['H2 SKIPPED', { h2State: 'SKIPPED' }],
  ])('accepts documented success-equivalent %s evidence', (_label, options) => {
    expect(exercise(options)).toMatchObject({ status: 'ready' });
  });

  test.each([
    ['stale persisted body', { fetchedBody: fixture('final-pr-body-h2.md').replaceAll(H2, H1) }],
    ['changed remote head', { fetchedHeadSha: H1 }],
    ['ready-state race', { fetchedIsDraft: false }],
  ])('preserves the draft boundary when fetched remote state has %s', (_label, options) => {
    expectPreserved(exercise(options));
  });

  it('resumes the exact satisfied draft at H2 after an H2 failure', () => {
    expectPreserved(exercise({ h2State: 'FAILURE' }));
    const retry = exercise({
      report: 'qualified-satisfied-h1.md',
      resumeDraft: true,
    });
    expect(retry.status).toBe('ready');
    expect(retry.commands[0]).toContain('gh pr view 200');
    expect(retry.commands).not.toContain('gh pr create --draft --title <title> --body-file <file>');
    expect(retry.commands).not.toContain('$nmg-sdlc:verify-code #122');
    expect(retry.commands).toContain('gh pr ready 200');
  });
});
