/**
 * Deterministic upgrade-project epic repair exercises for issue #177.
 *
 * Inputs are normalized read-only snapshots. Applying a plan is simulated by
 * constructing the exact rehydrated snapshot expected after each approved
 * action, so no GitHub or consumer-project mutation occurs.
 */

import { describe, expect, test } from '@jest/globals';

import { buildEpicLifecycleRepairPlan } from '../epic-lifecycle-repair.mjs';

const sourceCommit = 'a'.repeat(40);
const aggregateTree = 'b'.repeat(40);

function evidence(overrides = {}) {
  return {
    epic: { number: 108, title: 'Route weather epic', state: 'OPEN', bodyDigest: 'sha256:body-v1' },
    nativeChildren: [122, 123],
    checklistChildren: [122, 123],
    identityFindings: [],
    specAuthority: { status: 'valid', reasonCode: 'epic_spec_authority_valid', epicIssue: 108 },
    completion: { status: 'eligible', gaps: [] },
    projectItems: [],
    legacyOwnership: null,
    sourceCommit,
    sourceTrees: { 'specs/epic-route-weather': aggregateTree },
    ...overrides,
  };
}

function projectItem(statusName) {
  return {
    itemId: 'ITEM',
    projectId: 'PROJECT',
    statusFieldId: 'STATUS',
    statusName,
    doneOptions: [{ id: 'DONE', name: 'Done' }],
    inProgressOptions: [{ id: 'PROGRESS', name: 'In Progress' }],
  };
}

describe('exercise: exact approved epic backlog repair', () => {
  test('stale-complete closure and a no-op second audit are deterministic', () => {
    const before = evidence({ projectItems: [projectItem('Backlog')] });
    const plan = buildEpicLifecycleRepairPlan(before);
    expect(plan).toMatchObject({ status: 'repair_proposed', reasonCode: 'exact_epic_repair_available' });
    expect(plan.actions).toEqual([
      expect.objectContaining({ kind: 'set_project_status', from: 'Backlog', to: 'Done' }),
      { kind: 'close_epic', epicIssue: 108 },
    ]);

    const after = evidence({
      epic: { ...before.epic, state: 'CLOSED' },
      projectItems: [projectItem('Done')],
    });
    const proof = buildEpicLifecycleRepairPlan(after);
    const secondAudit = buildEpicLifecycleRepairPlan(after);
    expect(proof).toMatchObject({ status: 'clean', actions: [] });
    expect(secondAudit).toEqual(proof);
  });

  test('premature closure repairs both issue and Project state then becomes clean', () => {
    const before = evidence({
      epic: { number: 108, title: 'Route weather epic', state: 'CLOSED', bodyDigest: 'sha256:body-v1' },
      completion: { status: 'incomplete', gaps: ['child #123 is open'] },
      projectItems: [projectItem('Done')],
    });
    const plan = buildEpicLifecycleRepairPlan(before);
    expect(plan.actions).toEqual([
      { kind: 'reopen_epic', epicIssue: 108 },
      expect.objectContaining({ kind: 'set_project_status', from: 'Done', to: 'In Progress' }),
    ]);

    const after = evidence({
      epic: { ...before.epic, state: 'OPEN' },
      completion: before.completion,
      projectItems: [projectItem('In Progress')],
    });
    expect(buildEpicLifecycleRepairPlan(after)).toMatchObject({ status: 'clean', actions: [] });
  });

  test('exact legacy ownership transfer is proposed while ambiguous ownership is preserved', () => {
    const legacyAuthority = {
      status: 'repair_required',
      reasonCode: 'legacy_cumulative_epic_spec',
      legacySpecPath: 'specs/feature-legacy-route-weather',
    };
    const exact = evidence({
      specAuthority: legacyAuthority,
      completion: { status: 'repair_required', gaps: ['legacy cumulative authority'] },
      legacyOwnership: {
        status: 'exact',
        sourceTree: 'c'.repeat(40),
        aggregatePath: 'specs/epic-route-weather',
        childPackages: [
          { childIssue: 122, specPath: 'specs/feature-sample-route-weather' },
          { childIssue: 123, specPath: 'specs/feature-present-route-weather' },
        ],
        sourceIdentifiers: {
          acceptanceCriteria: ['AC1', 'AC2'], functionalRequirements: ['FR1', 'FR2'],
          tasks: ['T001', 'T002'], scenarios: ['SCN001', 'SCN002'],
        },
        transfers: [
          { childIssue: 122, acceptanceCriteria: ['AC1'], functionalRequirements: ['FR1'], tasks: ['T001'], scenarios: ['SCN001'] },
          { childIssue: 123, acceptanceCriteria: ['AC2'], functionalRequirements: ['FR2'], tasks: ['T002'], scenarios: ['SCN002'] },
        ],
      },
      sourceTrees: { 'specs/feature-legacy-route-weather': 'c'.repeat(40) },
    });
    expect(buildEpicLifecycleRepairPlan(exact).actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'split_legacy_spec', sourceSpecPath: 'specs/feature-legacy-route-weather' }),
    ]));

    const ambiguous = evidence({
      specAuthority: legacyAuthority,
      completion: { status: 'repair_required', gaps: ['ownership unresolved'] },
      legacyOwnership: { status: 'ambiguous' },
    });
    const preserved = buildEpicLifecycleRepairPlan(ambiguous);
    expect(preserved).toMatchObject({ status: 'preserved_ambiguous', reasonCode: 'manual_decision_required' });
    expect(preserved.actions.some((action) => action.kind === 'split_legacy_spec')).toBe(false);
    expect(preserved.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'ambiguous_legacy_ownership_preserved',
        recovery: expect.stringContaining('draft or select the missing child'),
      }),
    ]));
  });

  test('digest drift aborts the approved snapshot and a partial apply resumes with only remaining actions', () => {
    const before = evidence({ projectItems: [projectItem('Backlog')] });
    const approved = buildEpicLifecycleRepairPlan(before);
    const drifted = buildEpicLifecycleRepairPlan(evidence({
      epic: { ...before.epic, bodyDigest: 'sha256:body-v2' },
      projectItems: [projectItem('Backlog')],
    }));
    expect(drifted.evidenceDigest).not.toBe(approved.evidenceDigest);
    expect(drifted.actions).toEqual(approved.actions);

    const afterProjectWrite = evidence({ projectItems: [projectItem('Done')] });
    const resumed = buildEpicLifecycleRepairPlan(afterProjectWrite);
    expect(resumed).toMatchObject({ status: 'repair_proposed' });
    expect(resumed.actions).toEqual([{ kind: 'close_epic', epicIssue: 108 }]);

    const afterClose = evidence({
      epic: { ...before.epic, state: 'CLOSED' },
      projectItems: [projectItem('Done')],
    });
    expect(buildEpicLifecycleRepairPlan(afterClose)).toMatchObject({ status: 'clean', actions: [] });
  });

  test('malformed or duplicate transfer evidence is never an executable proposal', () => {
    const plan = buildEpicLifecycleRepairPlan(evidence({
      specAuthority: {
        status: 'repair_required',
        reasonCode: 'legacy_cumulative_epic_spec',
        legacySpecPath: 'specs/feature-legacy-route-weather',
      },
      completion: { status: 'repair_required', gaps: [] },
      legacyOwnership: {
        status: 'exact',
        sourceTree: 'c'.repeat(40),
        aggregatePath: 'specs/epic-route-weather',
        childPackages: [
          { childIssue: 122, specPath: 'specs/feature-a' },
          { childIssue: 123, specPath: 'specs/feature-b' },
        ],
        sourceIdentifiers: {
          acceptanceCriteria: ['AC1', 'AC2'], functionalRequirements: [],
          tasks: ['T001'], scenarios: [],
        },
        transfers: [
          { childIssue: 122, acceptanceCriteria: ['AC1'], functionalRequirements: [], tasks: ['T001'], scenarios: [] },
          { childIssue: 123, acceptanceCriteria: ['AC2'], functionalRequirements: [], tasks: ['T001'], scenarios: [] },
        ],
      },
      sourceTrees: { 'specs/feature-legacy-route-weather': 'c'.repeat(40) },
    }));
    expect(plan).toMatchObject({ status: 'unverifiable', reasonCode: 'repair_proposal_ambiguous', actions: [] });
    expect(plan.gaps.join('\n')).toContain('legacy executable identifier T001 is assigned more than once');
  });
});
