import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('start-issue automatic selection contract', () => {
  const skill = read('skills/start-issue/SKILL.md');
  const selection = read('skills/start-issue/references/milestone-selection.md');
  const readme = read('README.md');
  const gherkin = read('specs/bug-fix-start-issue-shortlist-starvation/feature.gherkin');

  test('uses a bounded expanding window sized to the presentation surface', () => {
    expect(selection).toContain('PRESENTATION_TARGET = 4');
    expect(selection).toContain('INITIAL_LIMIT = 10');
    expect(selection).toContain('LIMIT_INCREMENT = 10');
    expect(selection).toContain('MAX_LIMIT = 100');
    expect(selection).toContain('expand by `LIMIT_INCREMENT`');
    expect(selection).toContain('repeat the issue fetch plus Step 1a evaluation from fresh evidence');
    expect(selection).toContain('Evaluate the expanded ordered prefix only until `PRESENTATION_TARGET` verified selectable candidates have been found');
    expect(selection).toContain('a trailing record is not an evaluated candidate');
    expect(skill).toContain('expand the fetch window in ten-issue increments up to 100');
    expect(skill).toContain('stop the evaluated prefix as soon as four selectable candidates exist');
    expect(skill).toContain('unneeded trailing records do not participate');
  });

  test('excludes confirmed epics before target counting and preserves child readiness', () => {
    expect(selection).toContain('Remove confirmed epics before');
    expect(selection).toContain('`PRESENTATION_TARGET` count');
    expect(selection).toContain('fewer than `PRESENTATION_TARGET` executable candidates remain after all three filters');
    expect(skill).toContain('### Coordination-Only Epic Filter');
    expect(skill).toContain('remove it before dependency, deliverable');
    expect(skill).toContain('shortlist-target, or topological-order calculations');
    expect(skill).toContain('Excluded E coordination-only epics from automatic discovery.');
    expect(skill).toContain('An epic is not counted as blocked or Done.');
  });

  test('refuses explicit epic starts before every branch and Project mutation', () => {
    expect(skill).toContain('### Explicit Epic Guard');
    expect(skill).toContain('do not ask whether to start it');
    expect(skill).toContain('do not continue to stale-branch, dirty-tree, branch, or');
    expect(skill).toContain('No branch or issue/Project state was changed.');
    expect(skill).toContain('Start a ready child with');
    expect(skill).toContain('return through the Explicit Epic Guard without mutation');
  });

  test('renders complete nested lineage without changing dependency semantics', () => {
    expect(skill).toContain('Call `deriveEpicLineage()`');
    expect(skill).toContain('root-to-direct-parent number/title list');
    expect(skill).toContain('(epic #R Root title > #P Direct parent title)');
    expect(skill).toContain('This suffix is informational only and does not change readiness.');
  });

  test('excludes only confirmed all-Done Project work from automatic discovery', () => {
    expect(selection).toContain('--json number,title,labels,projectItems');
    expect(selection).toContain('at least one readable status exists and every readable status equals `Done` case-insensitively');
    expect(selection).toContain('Mixed statuses such as `Done` plus `Backlog` do not prove completion');
    expect(selection).toContain('An explicit command argument or manual issue-number entry remains selectable');
    expect(skill).toContain('Do not count it as dependency-blocked');
    expect(skill).toContain('Project status is workflow evidence, not relationship evidence');
  });

  test('degrades safely when Project metadata is unavailable', () => {
    expect(selection).toContain('retry the same issue query once without `projectItems`');
    expect(selection).toContain('WARNING: GitHub Project status unavailable; automatic discovery cannot exclude Done items.');
    expect(selection).toContain('Project visibility is not a new hard prerequisite');
    expect(selection).toContain('Never treat an uninspected or trailing issue as ready, blocked, Done');
  });

  test('reports distinct filter counts and warns before explicitly reopening Done work', () => {
    expect(skill).toContain('Filtered N blocked issues from selection.');
    expect(skill).toContain('When it completed, emit the blocked-count line exactly once');
    expect(skill).toContain('do not emit a blocked count');
    expect(skill).toContain('Dependency blocking status unavailable.');
    expect(skill).toContain('Excluded M open issues already marked Done from automatic discovery.');
    expect(skill).toContain('Excluded E coordination-only epics from automatic discovery.');
    expect(skill).toContain('the two notes do not double-count one issue');
    expect(skill).toContain('gh issue view N --json number,title,body,labels,milestone,projectItems');
    expect(skill).toContain('at least one readable Project status exists');
    expect(skill).toContain('Empty or entirely unreadable Project statuses do not trigger this warning');
    expect(skill).toContain('confirming the start will move completed Project work back to In Progress');
  });

  test('keeps public documentation and stable BDD scenarios aligned', () => {
    expect(readme).toContain('expands its bounded candidate window after dependency filtering');
    expect(readme).toContain('readable Project statuses are all `Done`');
    expect(gherkin.match(/@SCN\d+ @regression/g)).toHaveLength(5);
    expect(gherkin.match(/^  Scenario:/gm)).toHaveLength(5);
  });
});
