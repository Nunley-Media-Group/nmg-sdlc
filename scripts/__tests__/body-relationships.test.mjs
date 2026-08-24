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

  it('keeps unrelated prose inert', () => {
    expect(parseLegacyDependencyEvidence('This is related to #9.')).toEqual({
      edges: [],
      findings: [],
    });
  });
});
