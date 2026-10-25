import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

// #484 AC1: onboarding creates CHANGELOG.md when absent so prepare-version can deliver.
describe('onboarding creates the changelog (#484)', () => {
  test.each([
    'workflows/onboard-project/WORKFLOW.md',
    'workflows/onboard-project/references/greenfield.md',
    'workflows/onboard-project/references/brownfield.md',
  ])('%s creates CHANGELOG.md with the Unreleased heading only when it is absent', (relative) => {
    const text = read(relative);
    expect(text).toContain('CHANGELOG.md');
    expect(text).toContain('# Changelog');
    expect(text).toContain('## [Unreleased]');
    expect(text).toMatch(/absent|missing/);
    expect(text).toMatch(/never modify an existing/);
  });
});
