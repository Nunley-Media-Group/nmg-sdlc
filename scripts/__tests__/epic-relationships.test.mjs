import { describe, expect, it } from '@jest/globals';
import { classifyEpicRelationships } from '../epic-relationships.mjs';

describe('native epic relationship classification', () => {
  const epic = {
    number: 10,
    state: 'OPEN',
    labels: ['epic'],
    subIssues: [{ number: 11 }, { number: 12 }],
  };

  it('classifies a native child with the matching durable label without body evidence', () => {
    const result = classifyEpicRelationships({
      issues: [epic, { number: 11, state: 'OPEN', labels: ['epic-child-of-10'], parent: { number: 10 } }],
      activeIssueNumber: 11,
    });

    expect(result).toMatchObject({
      role: 'epic-child',
      parentNumber: 10,
      identity: 'durable',
      consistency: 'consistent',
    });
    expect(result.gaps).not.toEqual(expect.arrayContaining([
      expect.stringContaining('body relationship'),
    ]));
  });

  it('classifies an unlabeled native child as legacy without body evidence', () => {
    const result = classifyEpicRelationships({
      issues: [epic, { number: 12, state: 'OPEN', labels: [], parent: { number: 10 } }],
      activeIssueNumber: 12,
    });

    expect(result).toMatchObject({
      role: 'epic-child',
      parentNumber: 10,
      identity: 'legacy',
      consistency: 'legacy',
      degraded: true,
    });
    expect(result.gaps).toContain('issue #12 is missing label epic-child-of-10');
    expect(result.gaps).not.toEqual(expect.arrayContaining([
      expect.stringContaining('body relationship'),
    ]));
  });
});
