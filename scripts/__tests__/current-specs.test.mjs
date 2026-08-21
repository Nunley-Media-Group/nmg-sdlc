import { describe, expect, test } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CURRENT_SPEC_DIRECTORIES, verifyCurrentSpecs } from '../verify-current-specs.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('current 3.0 specs and rewrite contract', () => {
  test('retain only genuinely owned specs and cover the complete current surface', () => {
    expect(CURRENT_SPEC_DIRECTORIES).toHaveLength(15);
    expect(verifyCurrentSpecs(repoRoot)).toEqual([]);
  });
});
