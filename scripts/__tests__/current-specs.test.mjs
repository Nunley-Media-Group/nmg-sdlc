import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CURRENT_SPEC_DIRECTORIES, verifyCurrentSpecs } from '../verify-current-specs.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('current release specs and rewrite contract', () => {
  test('retain only genuinely owned specs and cover the complete current surface', () => {
    expect(CURRENT_SPEC_DIRECTORIES).toHaveLength(16);
    expect(verifyCurrentSpecs(repoRoot)).toEqual([]);
  });

  test('keeps historical rewrite release independent from current package version', () => {
    const rewriteContract = JSON.parse(fs.readFileSync(path.join(repoRoot, 'references/rewrite-contract.json'), 'utf8'));
    const packageVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;

    expect(rewriteContract.release).not.toBe(packageVersion);
    expect(verifyCurrentSpecs(repoRoot)).toEqual([]);
  });
});
