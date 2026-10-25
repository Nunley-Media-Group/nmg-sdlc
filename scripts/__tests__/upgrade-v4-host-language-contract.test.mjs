import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const UPGRADE_DOCS = [
  'workflows/upgrade-project/WORKFLOW.md',
  'workflows/upgrade-project/references/v3-detectors.md',
  'workflows/upgrade-project/references/detection.md',
  'workflows/upgrade-project/references/upgrade-procedures.md',
  'README.md',
];
const GROUP_IDS = ['steering-v4-host-language', 'contributing-v4-host-language', 'agents-to-claude-md'];

describe('v4 host-language upgrade contract', () => {
  test.each(UPGRADE_DOCS)('%s names all three upgrade groups', (doc) => {
    const source = read(doc);
    for (const id of GROUP_IDS) expect(source).toContain(id);
  });

  test('upgrade procedures document the fail-closed reason codes', () => {
    const source = read('workflows/upgrade-project/references/upgrade-procedures.md');
    for (const code of ['steering_host_language_unsafe_path', 'contributing_unsafe_path', 'skipped:collision']) {
      expect(source).toContain(code);
    }
  });

  test('steering host-language contract reports prose findings without the prose substitution', () => {
    for (const doc of ['workflows/upgrade-project/WORKFLOW.md', 'workflows/upgrade-project/references/v3-detectors.md']) {
      const source = read(doc);
      expect(source).toContain('proseFindings');
      expect(source).toContain('report-only prose');
      expect(source).not.toMatch(/`Oh My Pi`[^\n]*to `Claude Code`|whole-word `OMP`[^\n]*to `Claude Code`/);
    }
  });

  test('contribution guide marks the v3 sentence stale', () => {
    const source = read('references/contribution-guide.md');
    expect(source).toContain('Stale v3 wording');
    expect(source).toContain('exact v3 worker-pane sentence');
    expect(source).toContain('contributing-v4-host-language');
    expect(source).toContain('`CLAUDE.md`');
  });

  test('project instructions contract and onboarding name CLAUDE.md', () => {
    expect(read('references/project-agents.md')).toContain('root `CLAUDE.md`');
    expect(read('workflows/onboard-project/WORKFLOW.md')).toContain('CLAUDE.md');
  });

  test('this repository uses CLAUDE.md and drops the legacy ignore rule', () => {
    expect(fs.existsSync(path.join(repoRoot, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'AGENTS.md'))).toBe(false);
    expect(read('CLAUDE.md').startsWith('# CLAUDE.md')).toBe(true);
    const gitignore = read('.gitignore');
    expect(gitignore).not.toMatch(/\.omp\/sdlc/);
    expect(gitignore).toContain('.nmg-sdlc/');
  });
});
