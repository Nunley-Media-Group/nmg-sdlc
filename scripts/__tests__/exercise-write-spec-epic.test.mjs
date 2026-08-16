/**
 * Deterministic aggregate/child write-spec exercises for issue #177.
 *
 * Every scenario uses disposable local Git repositories. No live GitHub or
 * consumer-project write is required.
 */

import { afterEach, describe, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { inspectEpicSpecAuthority } from '../epic-spec-authority.mjs';
import {
  aggregatePublicationBranchName,
  aggregatePublicationMarker,
} from '../umbrella-publication-status.mjs';
import { inspectUmbrellaSpec } from '../umbrella-spec-status.mjs';

const temporaryRoots = [];
const aggregatePath = 'specs/epic-route-weather';
const firstChildPath = 'specs/feature-sample-route-weather';
const laterChildPath = 'specs/feature-present-route-weather';

function temporary(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function write(root, relativePath, source) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function issueScope(issue) {
  return {
    schemaVersion: 1,
    issues: {
      [issue]: {
        owned: {
          acceptanceCriteria: ['AC1'],
          functionalRequirements: ['FR1'],
          tasks: ['T001'],
          scenarios: ['SCN001'],
        },
        adopted: {
          acceptanceCriteria: [],
          functionalRequirements: [],
          tasks: [],
          scenarios: [],
        },
        regression: {
          acceptanceCriteria: [],
          functionalRequirements: [],
          scenarios: [],
        },
      },
    },
  };
}

function seedChild(root, {
  issue,
  childPath,
  epic = 108,
  outcomes = ['EO001'],
} = {}) {
  write(root, `${childPath}/requirements.md`, [
    `# Requirements: Child ${issue}`,
    '',
    `**Issues**: #${issue}`,
    '',
    '### AC1: Child result',
    '',
    '**Given** context',
    '**When** action',
    '**Then** result',
    '',
    '| ID | Requirement | Priority |',
    '|----|-------------|----------|',
    '| FR1 | Implement child | Must |',
    '',
  ].join('\n'));
  write(root, `${childPath}/design.md`, `# Design: Child ${issue}\n\n**Issues**: #${issue}\n`);
  write(root, `${childPath}/tasks.md`, `# Tasks: Child ${issue}\n\n**Issues**: #${issue}\n\n### T001: Implement child\n`);
  write(root, `${childPath}/feature.gherkin`, '@SCN001\nFeature: Child\n  Scenario: Child result\n    Given context\n    When action\n    Then result\n');
  write(root, `${childPath}/issue-scope.json`, `${JSON.stringify(issueScope(issue), null, 2)}\n`);
  write(root, `${childPath}/epic-link.json`, `${JSON.stringify({
    schemaVersion: 1,
    epicIssue: epic,
    epicSpecPath: aggregatePath,
    childIssue: issue,
    childSpecPath: childPath,
    outcomes,
  }, null, 2)}\n`);
}

function seedAggregate(root, children) {
  write(root, `${aggregatePath}/requirements.md`, [
    '# Epic Aggregate Requirements: Route weather',
    '',
    '**Issue**: #108',
    '',
    '### EO001: Route result',
    '',
  ].join('\n'));
  write(root, `${aggregatePath}/design.md`, '# Epic Aggregate Design: Route weather\n\n**Issue**: #108\n');
  write(root, `${aggregatePath}/epic-scope.json`, `${JSON.stringify({
    schemaVersion: 1,
    epicIssue: 108,
    aggregatePath,
    outcomes: [{ id: 'EO001', childIssues: children.map((child) => child.issue) }],
    children,
    migrations: [],
  }, null, 2)}\n`);
}

function baseChildren({ laterState = 'planned' } = {}) {
  return [
    { issue: 109, specPath: firstChildPath, packageState: 'canonical', outcomes: ['EO001'] },
    { issue: 110, specPath: laterChildPath, packageState: laterState, outcomes: ['EO001'] },
  ];
}

function fixture() {
  const bare = temporary('nmg-epic-publication-origin-');
  const work = temporary('nmg-epic-publication-work-');
  git(bare, ['init', '--bare', '--initial-branch=main']);
  git(work, ['init', '--initial-branch=main']);
  git(work, ['config', 'user.name', 'Epic Exercise']);
  git(work, ['config', 'user.email', 'epic-exercise@example.invalid']);
  git(work, ['remote', 'add', 'origin', bare]);
  write(work, 'README.md', '# fixture\n');
  fs.mkdirSync(path.join(work, 'specs'));
  git(work, ['add', 'README.md']);
  git(work, ['commit', '-m', 'chore: initialize']);
  git(work, ['push', '-u', 'origin', 'main']);
  return { bare, work };
}

function authorFirstChild(work) {
  git(work, ['checkout', '-b', '109-first-child-spec']);
  seedAggregate(work, baseChildren());
  seedChild(work, { issue: 109, childPath: firstChildPath });
  git(work, ['add', aggregatePath, firstChildPath]);
  git(work, ['commit', '-m', 'docs: publish epic #108 aggregate and child #109 specs']);
  return git(work, ['rev-parse', 'HEAD']);
}

function publishPaths(work, source, paths, message) {
  git(work, ['checkout', 'main']);
  git(work, ['restore', `--source=${source}`, '--worktree', '--', ...paths]);
  git(work, ['add', ...paths]);
  git(work, ['commit', '-m', message]);
  git(work, ['push', 'origin', 'main']);
}

function inspectPair(work, childSpecPath, source) {
  return inspectUmbrellaSpec({
    project: work,
    mode: 'aggregate-child-publication',
    aggregatePath,
    childSpecPath,
    source,
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('exercise: first and later epic-child specification publication', () => {
  test('first child publishes exactly one aggregate plus one separate executable child package', () => {
    const { work } = fixture();
    const source = authorFirstChild(work);
    const authority = inspectEpicSpecAuthority({
      project: work,
      source,
      mode: 'child',
      issueNumber: 109,
      nativeChildren: [109, 110],
    });
    const pending = inspectPair(work, firstChildPath, source);

    expect(authority).toMatchObject({ status: 'valid', requestedChild: { issue: 109, status: 'valid' } });
    expect(pending).toMatchObject({
      status: 'stranded_recoverable',
      reasonCode: 'first_child_aggregate_pair_not_on_default',
      changedPaths: expect.arrayContaining([
        `${aggregatePath}/requirements.md`,
        `${aggregatePath}/design.md`,
        `${aggregatePath}/epic-scope.json`,
        `${firstChildPath}/epic-link.json`,
      ]),
    });
    expect(pending.changedPaths.every((entry) => entry.startsWith(`${aggregatePath}/`) || entry.startsWith(`${firstChildPath}/`))).toBe(true);
    expect(fs.existsSync(path.join(work, aggregatePath, 'tasks.md'))).toBe(false);
    expect(fs.existsSync(path.join(work, aggregatePath, 'feature.gherkin'))).toBe(false);

    const branch = aggregatePublicationBranchName({
      epicIssueNumber: 108,
      childIssueNumber: 109,
      aggregatePath,
      aggregateTree: pending.sourceTrees.aggregate,
      childSpecPath: firstChildPath,
      childTree: pending.sourceTrees.child,
    });
    const marker = aggregatePublicationMarker({
      epicIssueNumber: 108,
      childIssueNumber: 109,
      aggregatePath,
      aggregateTree: pending.sourceTrees.aggregate,
      childSpecPath: firstChildPath,
      childTree: pending.sourceTrees.child,
    });
    expect(branch).toMatch(/^nmg-sdlc\/spec-publication-108-109-[0-9a-f]{12}$/);
    expect(marker).toContain('epic: #108');
    expect(marker).toContain('child: #109');

    publishPaths(work, source, [aggregatePath, firstChildPath], 'docs: publish first epic child authority');
    const canonical = inspectPair(work, firstChildPath, source);
    expect(canonical).toMatchObject({ status: 'canonical_marker_lost' });
    expect(inspectPair(work, firstChildPath, source)).toEqual(canonical);
  });

  test('later child changes only its package and the aggregate manifest row while preserving its sibling', () => {
    const { work } = fixture();
    const firstSource = authorFirstChild(work);
    publishPaths(work, firstSource, [aggregatePath, firstChildPath], 'docs: publish first epic child authority');
    const siblingTree = git(work, ['rev-parse', `HEAD:${firstChildPath}`]);
    const aggregateRequirements = git(work, ['rev-parse', `HEAD:${aggregatePath}/requirements.md`]);
    const aggregateDesign = git(work, ['rev-parse', `HEAD:${aggregatePath}/design.md`]);

    git(work, ['checkout', '-b', '110-later-child-spec']);
    seedAggregate(work, baseChildren({ laterState: 'canonical' }));
    seedChild(work, { issue: 110, childPath: laterChildPath });
    git(work, ['add', aggregatePath, laterChildPath]);
    git(work, ['commit', '-m', 'docs: publish child #110 spec and manifest row']);
    const laterSource = git(work, ['rev-parse', 'HEAD']);
    const changed = git(work, ['diff', '--name-only', 'origin/main...HEAD']).split('\n').filter(Boolean);
    const pending = inspectPair(work, laterChildPath, laterSource);

    expect(changed).toEqual([
      `${aggregatePath}/epic-scope.json`,
      `${laterChildPath}/design.md`,
      `${laterChildPath}/epic-link.json`,
      `${laterChildPath}/feature.gherkin`,
      `${laterChildPath}/issue-scope.json`,
      `${laterChildPath}/requirements.md`,
      `${laterChildPath}/tasks.md`,
    ]);
    expect(git(work, ['rev-parse', `HEAD:${firstChildPath}`])).toBe(siblingTree);
    expect(git(work, ['rev-parse', `HEAD:${aggregatePath}/requirements.md`])).toBe(aggregateRequirements);
    expect(git(work, ['rev-parse', `HEAD:${aggregatePath}/design.md`])).toBe(aggregateDesign);
    expect(pending).toMatchObject({
      status: 'stranded_recoverable',
      reasonCode: 'later_child_and_manifest_amendment_not_on_default',
    });

    publishPaths(work, laterSource, [`${aggregatePath}/epic-scope.json`, laterChildPath], 'docs: publish later epic child authority');
    const authority = inspectEpicSpecAuthority({
      project: work,
      source: 'origin/main',
      mode: 'child',
      issueNumber: 110,
      nativeChildren: [109, 110],
    });
    expect(authority).toMatchObject({ status: 'valid', requestedChild: { issue: 110, status: 'valid' } });
    expect(inspectPair(work, laterChildPath, laterSource)).toMatchObject({ status: 'canonical_marker_lost' });
  });
});

describe('exercise: epic specification authority fails closed', () => {
  test('missing, duplicate, conflicting, ambiguous, and executable aggregate evidence cannot authorize code work', () => {
    const { work } = fixture();
    seedAggregate(work, baseChildren({ laterState: 'canonical' }));
    seedChild(work, { issue: 109, childPath: firstChildPath });

    const missing = inspectEpicSpecAuthority({ project: work, mode: 'child', issueNumber: 110, nativeChildren: [109, 110] });
    expect(missing).toMatchObject({ status: 'repair_required', reasonCode: 'child_link_missing' });

    seedChild(work, { issue: 110, childPath: laterChildPath, outcomes: ['EO999'] });
    const conflicting = inspectEpicSpecAuthority({ project: work, mode: 'child', issueNumber: 110, nativeChildren: [109, 110] });
    expect(conflicting.status).toBe('unverifiable');
    expect(conflicting.gaps.join('\n')).toContain('link outcomes do not match');

    seedChild(work, { issue: 109, childPath: 'specs/feature-duplicate-child' });
    const duplicate = inspectEpicSpecAuthority({ project: work, mode: 'child', issueNumber: 109, nativeChildren: [109, 110] });
    expect(duplicate).toMatchObject({ status: 'unverifiable', reasonCode: 'duplicate_child_link' });

    const secondAggregate = 'specs/epic-duplicate-route-weather';
    const manifest = JSON.parse(fs.readFileSync(path.join(work, aggregatePath, 'epic-scope.json'), 'utf8'));
    manifest.aggregatePath = secondAggregate;
    write(work, `${secondAggregate}/epic-scope.json`, `${JSON.stringify(manifest, null, 2)}\n`);
    write(work, `${secondAggregate}/requirements.md`, '# Epic\n\n**Issue**: #108\n\n### EO001: Route result\n');
    write(work, `${secondAggregate}/design.md`, '# Design\n\n**Issue**: #108\n');
    const ambiguous = inspectEpicSpecAuthority({ project: work, mode: 'epic', issueNumber: 108, nativeChildren: [109, 110] });
    expect(ambiguous).toMatchObject({ status: 'unverifiable', reasonCode: 'duplicate_epic_aggregate' });

    fs.rmSync(path.join(work, secondAggregate), { recursive: true, force: true });
    fs.rmSync(path.join(work, 'specs/feature-duplicate-child'), { recursive: true, force: true });
    seedChild(work, { issue: 110, childPath: laterChildPath });
    write(work, `${aggregatePath}/tasks.md`, '### T999: forbidden aggregate work\n');
    const executableAggregate = inspectEpicSpecAuthority({ project: work, mode: 'epic', issueNumber: 108, nativeChildren: [109, 110] });
    expect(executableAggregate.status).toBe('repair_required');
    expect(executableAggregate.gaps.join('\n')).toContain('gives executable ownership to an epic aggregate');
  });

  test('a noncanonical source remains publication evidence, never implementation authority', () => {
    const { work } = fixture();
    const source = authorFirstChild(work);
    const first = inspectPair(work, firstChildPath, source);
    const second = inspectPair(work, firstChildPath, source);
    expect(first).toEqual(second);
    expect(first.status).toBe('stranded_recoverable');
    expect(first.defaultTrees).toEqual({ aggregate: null, child: null });
  });
});
