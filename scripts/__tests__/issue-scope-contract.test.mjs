import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function expectFragments(relativePath, fragments) {
  const content = read(relativePath);
  for (const fragment of fragments) expect(content).toContain(fragment);
}

describe('active issue scope prompt contract', () => {
  test('defines one shared fail-closed resolver authority', () => {
    expectFragments('references/issue-spec-scope.md', [
      'scripts/issue-spec-scope.mjs',
      '`scoped`',
      '`implicit_single_issue`',
      '`repair_required`',
      '`unverifiable`',
      '`delivery.tasks` only',
      '`nmg-sdlc-issue-scope`',
      'regular non-symlink paths',
      'limited to 256 KiB',
      '$nmg-sdlc:write-spec #N',
    ]);
  });

  test('write-spec authors and reviews stable ownership, adoption, and regression mappings', () => {
    expectFragments('skills/write-spec/SKILL.md', [
      '../../references/issue-spec-scope.md',
      'templates/issue-scope.json',
      'one unique stable `@SCN...` tag',
      'scripts/issue-spec-scope.mjs',
      '`repair_required`',
    ]);
    expectFragments('skills/write-spec/references/amendment-mode.md', [
      '`issue-scope.json` amendment',
      'Preserve all existing issue entries and `owned` assignments',
      '`adopted`',
      '`regression`',
      'require `scoped`',
    ]);
    expectFragments('skills/write-spec/references/review-gates.md', [
      '**Issue scope**',
      'Owned by #N',
      'Adopted by #N',
      'Regression for #N',
    ]);
  });

  test('write-code plans and resumes only mapped delivery tasks', () => {
    expectFragments('skills/write-code/SKILL.md', [
      '../../references/issue-spec-scope.md',
      '`delivery.tasks`',
      '`repair_required`',
      'Never fall back to all tasks in a multi-issue spec',
    ]);
    expectFragments('skills/write-code/references/plan-mode.md', [
      "resolver's `delivery.tasks`",
      'normalized active delivery task identifiers are exactly [delivery.tasks IDs]',
      'Do not execute any other task in the cumulative tasks.md',
      'unmapped earlier and future tasks must not appear',
      'never as implementation work',
    ]);
    expectFragments('skills/write-code/references/resumption.md', [
      'including explicitly adopted tasks',
      'subtract completed mapped tasks from `delivery.tasks`',
      'start from the first identifier in `delivery.tasks`',
      'Earlier or future tasks outside the active delivery set are ignored',
    ]);
  });

  test('verify-code separates current completion from declared regression evidence', () => {
    expectFragments('skills/verify-code/SKILL.md', [
      '../../references/issue-spec-scope.md',
      '`delivery.acceptanceCriteria`',
      '`regression.acceptanceCriteria`',
      'Exclude all other cumulative elements',
    ]);
    expectFragments('skills/verify-code/references/report-format.md', [
      '### Issue Scope',
      '### Regression Obligations',
      'nmg-sdlc-issue-scope',
      'exact normalized resolver values',
    ]);
  });

  test('status imports the resolver and blocks later lifecycle evidence on invalid scope', () => {
    expectFragments('skills/status/SKILL.md', [
      '../../references/issue-spec-scope.md',
      '`spec.scope`',
      '`repair_required` or `unverifiable`',
      '$nmg-sdlc:write-spec #N',
    ]);
    expectFragments('scripts/sdlc-status.mjs', [
      'inspectIssueSpecScope,',
      'ISSUE_SPEC_MARKDOWN_LIMIT_BYTES,',
      "from './issue-spec-scope.mjs';",
      "['repair_required', 'unverifiable']",
      'verification report issue scope does not match the active issue',
      '`Scope: ${scope}`',
    ]);
  });

  test('open-pr filters current claims, verifies the marker, links the manifest, and closes only the active issue', () => {
    expectFragments('skills/open-pr/SKILL.md', [
      '../../references/issue-spec-scope.md',
      'Use only `delivery`',
      '`nmg-sdlc-issue-scope` JSON marker',
      'Never build a cumulative whole-spec PR body',
    ]);
    expectFragments('skills/open-pr/references/pr-body.md', [
      '## Regression Evidence',
      'Issue scope: `specs/{feature}/issue-scope.json`',
      'exactly one closing keyword for active issue `#N`',
      'never copy all cumulative ACs or tasks',
    ]);
  });
});
