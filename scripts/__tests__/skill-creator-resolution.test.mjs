import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contractPaths = [
  'agents/spec-implementer.md',
  'steering/product.md',
  'steering/structure.md',
  'steering/tech.md',
  'workflows/write-code/WORKFLOW.md',
  'workflows/write-code/references/plan-mode.md',
  'workflows/verify-code/WORKFLOW.md',
  'workflows/verify-code/references/autofix-loop.md',
];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('skill creator resolution contract', () => {
  test.each(contractPaths)('%s resolves the installed skill instead of a repository-local file', (relativePath) => {
    const source = read(relativePath);
    expect(source).toContain('skill://skill-creator');
    expect(source).not.toContain('skills/skill-creator/SKILL.md');
  });

  test('write-code no longer fails solely because a repository-local creator is absent', () => {
    const source = read('workflows/write-code/WORKFLOW.md');
    expect(source).not.toContain('skill_creator_missing');
    expect(source).not.toContain('Check if the skill-creator file is present on disk');
    expect(source).toContain('Resolve and read `skill://skill-creator`');
  });
});
