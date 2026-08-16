import { describe, expect, test } from '@jest/globals';

import { buildEpicLifecycleRepairPlan, repairEvidenceDigest } from '../epic-lifecycle-repair.mjs';

const oid = 'a'.repeat(40);

function evidence(overrides = {}) {
  return {
    epic: { number: 108, title: 'Epic', state: 'OPEN', bodyDigest: 'sha256:body' },
    nativeChildren: [122, 123],
    checklistChildren: [122, 123],
    identityFindings: [],
    specAuthority: { status: 'valid', reasonCode: 'epic_spec_authority_valid', epicIssue: 108 },
    completion: { status: 'eligible', gaps: [] },
    projectItems: [],
    legacyOwnership: null,
    sourceCommit: oid,
    sourceTrees: { 'specs/epic-route-weather': 'b'.repeat(40) },
    ...overrides,
  };
}

describe('epic lifecycle repair planner', () => {
  test('proposes stale-complete closure and checklist/identity repair exactly once', () => {
    const input = evidence({
      checklistChildren: [122],
      identityFindings: [{ childIssue: 123, status: 'legacy', addLabel: true, addNativeParent: false, addBodyMembership: false }],
      projectItems: [{
        itemId: 'ITEM', projectId: 'PROJECT', statusFieldId: 'STATUS', statusName: 'Backlog',
        doneOptions: [{ id: 'DONE', name: 'Done' }], inProgressOptions: [{ id: 'PROGRESS', name: 'In Progress' }],
      }],
    });
    const plan = buildEpicLifecycleRepairPlan(input);
    expect(plan.status).toBe('repair_proposed');
    expect(plan.actions).toEqual(expect.arrayContaining([
      { kind: 'add_child_label', childIssue: 123, label: 'epic-child-of-108' },
      { kind: 'replace_child_checklist', epicIssue: 108, childIssues: [122, 123] },
      expect.objectContaining({ kind: 'set_project_status', to: 'Done' }),
      { kind: 'close_epic', epicIssue: 108 },
    ]));
    expect(buildEpicLifecycleRepairPlan(input).evidenceDigest).toBe(plan.evidenceDigest);
  });

  test('proposes premature-state reopen in both issue and Project directions', () => {
    const plan = buildEpicLifecycleRepairPlan(evidence({
      epic: { number: 108, title: 'Epic', state: 'CLOSED', bodyDigest: 'sha256:body' },
      completion: { status: 'incomplete', gaps: ['child #123 is open'] },
      projectItems: [{
        itemId: 'ITEM', projectId: 'PROJECT', statusFieldId: 'STATUS', statusName: 'Done',
        doneOptions: [{ id: 'DONE', name: 'Done' }], inProgressOptions: [{ id: 'PROGRESS', name: 'In Progress' }],
      }],
    }));
    expect(plan.actions).toEqual(expect.arrayContaining([
      { kind: 'reopen_epic', epicIssue: 108 },
      expect.objectContaining({ kind: 'set_project_status', to: 'In Progress' }),
    ]));
  });

  test('preserves ambiguous legacy ownership and requests a child decision', () => {
    const plan = buildEpicLifecycleRepairPlan(evidence({
      specAuthority: { status: 'repair_required', reasonCode: 'legacy_cumulative_epic_spec', legacySpecPath: 'specs/feature-legacy' },
      legacyOwnership: { status: 'ambiguous' },
      completion: { status: 'repair_required', gaps: ['legacy ownership'] },
    }));
    expect(plan.status).toBe('preserved_ambiguous');
    expect(plan.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'ambiguous_legacy_ownership_preserved', recovery: expect.stringContaining('draft or select the missing child') }),
    ]));
    expect(plan.actions.some((action) => action.kind === 'split_legacy_spec')).toBe(false);
  });

  test('accepts only unique exact legacy identifier transfers', () => {
    const exact = {
      status: 'exact', sourceTree: 'c'.repeat(40), aggregatePath: 'specs/epic-route-weather',
      childPackages: [
        { childIssue: 122, specPath: 'specs/feature-a' },
        { childIssue: 123, specPath: 'specs/feature-b' },
      ],
      sourceIdentifiers: {
        acceptanceCriteria: ['AC1', 'AC2'], functionalRequirements: ['FR1', 'FR2'],
        tasks: ['T001', 'T002'], scenarios: ['SCN001', 'SCN002'],
      },
      transfers: [
        { childIssue: 122, acceptanceCriteria: ['AC1'], functionalRequirements: ['FR1'], tasks: ['T001'], scenarios: ['SCN001'] },
        { childIssue: 123, acceptanceCriteria: ['AC2'], functionalRequirements: ['FR2'], tasks: ['T002'], scenarios: ['SCN002'] },
      ],
    };
    const plan = buildEpicLifecycleRepairPlan(evidence({
      specAuthority: { status: 'repair_required', reasonCode: 'legacy_cumulative_epic_spec', legacySpecPath: 'specs/feature-legacy' },
      legacyOwnership: exact,
      completion: { status: 'repair_required', gaps: ['legacy ownership'] },
      sourceTrees: { 'specs/feature-legacy': 'c'.repeat(40) },
    }));
    expect(plan.actions).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'split_legacy_spec', transfers: exact.transfers })]));

    const duplicate = structuredClone(exact);
    duplicate.transfers[1].tasks = ['T001'];
    expect(buildEpicLifecycleRepairPlan(evidence({
      specAuthority: { status: 'repair_required', reasonCode: 'legacy_cumulative_epic_spec', legacySpecPath: 'specs/feature-legacy' },
      legacyOwnership: duplicate,
      completion: { status: 'repair_required', gaps: [] },
      sourceTrees: { 'specs/feature-legacy': 'c'.repeat(40) },
    })).status).toBe('unverifiable');

    const incomplete = structuredClone(exact);
    incomplete.sourceIdentifiers.tasks.push('T003');
    expect(buildEpicLifecycleRepairPlan(evidence({
      specAuthority: { status: 'repair_required', reasonCode: 'legacy_cumulative_epic_spec', legacySpecPath: 'specs/feature-legacy' },
      legacyOwnership: incomplete,
      completion: { status: 'repair_required', gaps: [] },
      sourceTrees: { 'specs/feature-legacy': 'c'.repeat(40) },
    })).gaps.join('\n')).toContain('tasks transfers do not exactly cover');
  });

  test('stable digests ignore object key order', () => {
    expect(repairEvidenceDigest({ b: 2, a: 1 })).toBe(repairEvidenceDigest({ a: 1, b: 2 }));
  });
});
