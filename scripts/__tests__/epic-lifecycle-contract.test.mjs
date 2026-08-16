import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function expectLifecycleSummary(source) {
  expect(source).toMatch(/epics? (?:are|is) coordination-only/i);
  expect(source).toMatch(/cannot be started|never (?:be )?(?:selectable|started)/i);
  expect(source).toMatch(/(?:normal|same) dependency/i);
  expect(source).toMatch(/informational lineage|lineage is informational|membership is informational/i);
}

describe('coordination-only epic lifecycle parity (issue #177)', () => {
  test('public and generated contribution guidance agree on selection, authority, terminal delivery, and repair', () => {
    for (const relativePath of ['README.md', 'CONTRIBUTING.md', 'references/contribution-guide.md']) {
      const source = read(relativePath);
      expectLifecycleSummary(source);
      expect(source).toMatch(/aggregate/i);
      expect(source).toMatch(/child(?:'s)? (?:separate |own |executable |normal )*(?:feature or bug )?package|package.*child/i);
      expect(source).toMatch(/exact-head merge/i);
      expect(source).toMatch(/eligible[^.\n]*epic|epic[^.\n]*eligible/i);
      expect(source).toMatch(/exact approval|explicit approval/i);
    }

    const gate = read('references/contribution-gate.md');
    expect(gate).toContain("const AGGREGATE_ARTIFACTS = ['requirements.md', 'design.md', 'epic-scope.json']");
    expect(gate).toContain('Epic aggregate evidence is coordination-only');
    expect(gate).toContain('include the active child `specs/feature-*` or `specs/bug-*` package');
    const embedded = gate.match(/```yaml\n([\s\S]*?)\n```/)?.[1];
    expect(embedded).toBeDefined();
    expect(read('.github/workflows/nmg-sdlc-contribution-gate.yml')).toBe(`${embedded}\n`);

    const issueForm = read('.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml');
    expect(issueForm).toContain('Epics are coordination-only: they cannot be started or own executable specs.');
    expect(issueForm).toContain('Their children use normal dependency rules.');
    expect(issueForm).toContain('eligible epic ancestors');
  });

  test('steering and onboard templates preserve the same aggregate and child boundary', () => {
    for (const relativePath of [
      'steering/product.md',
      'steering/structure.md',
      'steering/tech.md',
      'skills/onboard-project/templates/product.md',
      'skills/onboard-project/templates/structure.md',
      'skills/onboard-project/templates/tech.md',
    ]) {
      const source = read(relativePath);
      expect(source).toMatch(/coordination-only/i);
      expect(source).toMatch(/child/i);
      expect(source).toMatch(/epic|aggregate/i);
    }

    const structure = `${read('steering/structure.md')}\n${read('skills/onboard-project/templates/structure.md')}`;
    expect(structure).toContain('requirements.md');
    expect(structure).toContain('design.md');
    expect(structure).toContain('epic-scope.json');
    expect(structure).toMatch(/never.*tasks|no executable tasks/i);
  });

  test('every lifecycle consumer binds work to an executable child and keeps open-pr terminal', () => {
    const startIssue = read('skills/start-issue/SKILL.md');
    expect(startIssue).toContain('Classify issue roles first, remove confirmed epics from automatic discovery');
    expect(startIssue).toContain('Explicit Epic Guard');
    expect(startIssue).toContain('No branch or issue/Project state was changed');
    expect(startIssue).toContain('Do not require an aggregate or child spec here');

    const writeSpec = read('skills/write-spec/SKILL.md');
    expect(writeSpec).toContain('Epic #E is coordination-only and cannot own an executable spec');
    expect(writeSpec).toContain('one aggregate plus one separate child package');
    expect(writeSpec).toContain('it never starts or closes the epic or child');

    for (const relativePath of [
      'skills/write-code/SKILL.md',
      'skills/verify-code/SKILL.md',
      'skills/status/SKILL.md',
      'skills/open-pr/SKILL.md',
    ]) {
      const source = read(relativePath);
      expect(source).toContain('epic-spec-authority.mjs');
      expect(source).toMatch(/active child|child[\s\S]{0,40}package|requestedChild\.specPath/i);
    }

    const openPr = read('skills/open-pr/SKILL.md');
    expect(openPr).toContain('PR creation is an intermediate state, never successful');
    expect(openPr).toContain('Success requires a fresh PR read proving `state: MERGED`');
    expect(openPr).toContain('fresh issue read');
    expect(openPr).toContain('proving child `state: CLOSED`');
    expect(openPr).toContain('eligible epic ancestors');
  });

  test('upgrade owns exact drift-checked close, reopen, ownership, and no-op repair', () => {
    const upgrade = read('skills/upgrade-project/SKILL.md');
    const recovery = read('skills/upgrade-project/references/epic-lifecycle-recovery.md');
    const combined = `${upgrade}\n${recovery}`;
    expect(recovery).toContain('epic-spec-authority.mjs --project <path> --epic E');
    expect(recovery).toContain('--native-children <complete-list> --json');
    expect(combined).toMatch(/read-only.*audit/is);
    expect(combined).toContain('One epic approval never covers another');
    expect(combined).toMatch(/fresh.*digest/is);
    expect(combined).toContain('stale-complete epic close');
    expect(combined).toMatch(/reopen_epic|reopen/i);
    expect(combined).toMatch(/ownership transfer|split_legacy_spec/i);
    expect(combined).toMatch(/ambiguous.*preserv/is);
    expect(combined).toMatch(/(?:audit|run the audit)\s+a second time/i);
    expect(combined).toContain('no duplicate');
  });

  test('nested epics use recursive aggregate authority without executable packages', () => {
    const authority = read('references/epic-spec-authority.md');
    const publication = read('references/canonical-umbrella-spec.md');
    const writeSpecMode = read('skills/write-spec/references/umbrella-mode.md');

    expect(authority).toContain("parent manifest points to the\nchild epic's distinct `specs/epic-...` aggregate");
    expect(authority).toContain('has no `epic-link.json` and no executable package');
    expect(authority).toContain('fails closed on a repeated aggregate path');
    expect(authority).toContain('planned executable descendants remain the nested epic');
    expect(publication).toContain('distinct nested `specs/epic-*` child path');
    expect(publication).toContain('references both issues and closes neither');
    expect(writeSpecMode).toContain('### Nested lineage reconciliation');
    expect(writeSpecMode).toContain('walk the resolved lineage leaf-to-root');
    expect(writeSpecMode).toContain('never handed to `write-code`');
  });

  test('maintained workflow surfaces reject superseded executable-epic and PR-creation terminal instructions', () => {
    const startIssue = read('skills/start-issue/SKILL.md');
    const writeSpec = read('skills/write-spec/SKILL.md');
    const openPr = read('skills/open-pr/SKILL.md');
    const contribution = `${read('README.md')}\n${read('CONTRIBUTING.md')}\n${read('references/contribution-guide.md')}`;

    expect(startIssue).not.toMatch(/create (?:a )?(?:linked )?branch for (?:the )?epic/i);
    expect(writeSpec).not.toContain('#### 3b.2 Seal Exact Scope');
    expect(writeSpec).not.toContain('Seal and transition');
    expect(writeSpec).not.toMatch(/append (?:the )?child(?:'s)? (?:tasks|Gherkin) to (?:the )?(?:epic|aggregate)/i);
    expect(openPr).not.toContain('→  $nmg-sdlc:address-pr-comments');
    expect(contribution).not.toMatch(/delivery (?:is )?(?:complete|successful) (?:when|after) (?:the )?PR (?:is )?(?:created|opened)/i);
    expect(contribution).not.toContain('epic-requirements.md');
    expect(contribution).not.toContain('epic-design.md');
  });
});
