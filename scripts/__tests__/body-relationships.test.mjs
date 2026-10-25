import { describe, expect, it } from '@jest/globals';
import { parseLegacyDependencyEvidence } from '../issue-dependencies.mjs';

describe('legacy dependency migration evidence', () => {
  it('parses closed legacy fields only for upgrade reconciliation', () => {
    expect(parseLegacyDependencyEvidence([
      'Depends on: #12, #8',
      'Blocks: #20',
    ].join('\n'))).toEqual({
      edges: [
        { relation: 'blockedBy', issue: 12, source: 'Depends on: #12, #8' },
        { relation: 'blockedBy', issue: 8, source: 'Depends on: #12, #8' },
        { relation: 'blocks', issue: 20, source: 'Blocks: #20' },
      ],
      findings: [],
    });
  });

  it('ignores table rows and pull-request, other-project, and other-repository references', () => {
    expect(parseLegacyDependencyEvidence([
      '| **Version / Commit** | Main after merged PR #307 |',
      'requires the fix after PR #307',
      'PennyScan issue #102 therefore fails',
      'depends on Other-Org/other-repo#12',
    ].join('\n'))).toEqual({ edges: [], findings: [] });
  });

  it('preserves genuine sequencing clauses and field lines', () => {
    expect(parseLegacyDependencyEvidence([
      'After issue #394 resumes a consumed dispatch',
      'Depends on: #10, #11',
      'Requires #10 and #11',
    ].join('\n'))).toEqual({
      edges: [
        { relation: 'blockedBy', issue: 394, source: 'After issue #394 resumes a consumed dispatch' },
        { relation: 'blockedBy', issue: 10, source: 'Depends on: #10, #11' },
        { relation: 'blockedBy', issue: 11, source: 'Depends on: #10, #11' },
      ],
      findings: [{ line: 'Requires #10 and #11', reason: 'ambiguous_dependency_evidence' }],
    });
  });

  it('keeps unrelated prose inert', () => {
    expect(parseLegacyDependencyEvidence('This is related to #9.')).toEqual({
      edges: [],
      findings: [],
    });
  });
});
