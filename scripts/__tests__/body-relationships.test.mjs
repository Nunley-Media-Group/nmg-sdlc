import { describe, expect, it } from '@jest/globals';
import { parseBodyRelationships } from '../epic-relationships.mjs';

describe('parseBodyRelationships', () => {
  it('parses unique Depends on and Blocks issue numbers', () => {
    expect(parseBodyRelationships([
      'Depends on: #12, #8',
      'Blocks: #20',
      'Depends on: #12',
    ].join('\n'))).toEqual({
      dependsOn: [12, 8],
      blocks: [20],
    });
  });

  it('ignores prose that is not a field line', () => {
    expect(parseBodyRelationships('This depends on: #9 in narrative')).toEqual({
      dependsOn: [],
      blocks: [],
    });
  });
});
