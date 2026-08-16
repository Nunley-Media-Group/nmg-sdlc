import { afterEach, describe, expect, test } from '@jest/globals';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  evidenceDigest,
  inspectEpicSpecAuthority,
  normalizeEpicLink,
  normalizeEpicScope,
  parseCli,
} from '../epic-spec-authority.mjs';

const projects = [];

afterEach(() => {
  for (const project of projects.splice(0)) rmSync(project, { recursive: true, force: true });
});

function run(project, args) {
  const result = spawnSync('git', args, { cwd: project, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function write(project, relativePath, content) {
  const target = path.join(project, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function project() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nmg-epic-authority-'));
  projects.push(root);
  run(root, ['init', '-q']);
  run(root, ['config', 'user.email', 'test@example.com']);
  run(root, ['config', 'user.name', 'Test']);
  mkdirSync(path.join(root, 'specs'));
  return root;
}

function scopeManifest(issue) {
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
  epic = 108,
  issue = 109,
  aggregatePath = 'specs/epic-route-weather',
  childPath = 'specs/feature-sample-route-weather',
  outcomes = ['EO001'],
} = {}) {
  write(root, `${childPath}/requirements.md`, [
    '# Requirements: Child',
    '',
    `**Issue**: #${issue}`,
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
  ].join('\n'));
  write(root, `${childPath}/design.md`, `# Design: Child\n\n**Issue**: #${issue}\n`);
  write(root, `${childPath}/tasks.md`, `# Tasks: Child\n\n**Issue**: #${issue}\n\n### T001: Implement child\n`);
  write(root, `${childPath}/feature.gherkin`, '@SCN001\nFeature: Child\n  Scenario: Child result\n    Given context\n    When action\n    Then result\n');
  write(root, `${childPath}/issue-scope.json`, `${JSON.stringify(scopeManifest(issue), null, 2)}\n`);
  write(root, `${childPath}/epic-link.json`, `${JSON.stringify({
    schemaVersion: 1,
    epicIssue: epic,
    epicSpecPath: aggregatePath,
    childIssue: issue,
    childSpecPath: childPath,
    outcomes,
  }, null, 2)}\n`);
}

function seedAggregate(root, {
  epic = 108,
  aggregatePath = 'specs/epic-route-weather',
  children = [
    { issue: 109, specPath: 'specs/feature-sample-route-weather', packageState: 'canonical', outcomes: ['EO001'] },
    { issue: 110, specPath: 'specs/feature-present-route-weather', packageState: 'planned', outcomes: ['EO001'] },
  ],
  migrations = [],
} = {}) {
  write(root, `${aggregatePath}/requirements.md`, `# Epic Aggregate Requirements: Route weather\n\n**Issue**: #${epic}\n\n### EO001: Route result\n`);
  write(root, `${aggregatePath}/design.md`, `# Epic Aggregate Design: Route weather\n\n**Issue**: #${epic}\n`);
  write(root, `${aggregatePath}/epic-scope.json`, `${JSON.stringify({
    schemaVersion: 1,
    epicIssue: epic,
    aggregatePath,
    outcomes: [{ id: 'EO001', childIssues: children.map((child) => child.issue) }],
    children,
    migrations,
  }, null, 2)}\n`);
}

describe('epic spec schema normalization', () => {
  test('accepts exact aggregate and child link schemas', () => {
    const aggregate = normalizeEpicScope({
      schemaVersion: 1,
      epicIssue: 108,
      aggregatePath: 'specs/epic-route-weather',
      outcomes: [{ id: 'EO001', childIssues: [109] }],
      children: [{ issue: 109, specPath: 'specs/feature-child', packageState: 'planned', outcomes: ['EO001'] }],
      migrations: [],
    }, 'specs/epic-route-weather');
    expect(aggregate.gaps).toEqual([]);
    expect(normalizeEpicLink({
      schemaVersion: 1,
      epicIssue: 108,
      epicSpecPath: 'specs/epic-route-weather',
      childIssue: 109,
      childSpecPath: 'specs/feature-child',
      outcomes: ['EO001'],
    }, 'specs/feature-child').gaps).toEqual([]);

    const nested = normalizeEpicScope({
      schemaVersion: 1,
      epicIssue: 200,
      aggregatePath: 'specs/epic-root',
      outcomes: [{ id: 'EO001', childIssues: [108] }],
      children: [{ issue: 108, specPath: 'specs/epic-route-weather', packageState: 'canonical', outcomes: ['EO001'] }],
      migrations: [],
    }, 'specs/epic-root');
    expect(nested.gaps).toEqual([]);
  });

  test('rejects duplicate ownership, unknown outcomes, and unexpected keys', () => {
    const result = normalizeEpicScope({
      schemaVersion: 1,
      epicIssue: 108,
      aggregatePath: 'specs/epic-route-weather',
      outcomes: [{ id: 'EO001', childIssues: [109] }],
      children: [
        { issue: 109, specPath: 'specs/feature-child', packageState: 'planned', outcomes: ['EO999'] },
        { issue: 109, specPath: 'specs/feature-other', packageState: 'planned', outcomes: ['EO001'], extra: true },
      ],
      migrations: [],
    }, 'specs/epic-route-weather');
    expect(result.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('repeats child #109'),
      expect.stringContaining('unknown outcome EO999'),
      expect.stringContaining('unexpected keys: extra'),
    ]));
  });

  test('evidence digests are deterministic across object key order', () => {
    expect(evidenceDigest({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(evidenceDigest({ a: { c: 3, d: 4 }, b: 2 }));
  });
});

describe('epic spec authority inspection', () => {
  test('rejects invalid programmatic modes and issue numbers before scanning', () => {
    const root = project();
    seedAggregate(root);
    write(root, 'specs/epic-route-weather/epic-scope.json', '{"epicIssue":"invalid"}\n');

    expect(inspectEpicSpecAuthority({ project: root, mode: 'typo', issueNumber: 108 }))
      .toMatchObject({ status: 'unverifiable', reasonCode: 'mode_invalid' });
    expect(inspectEpicSpecAuthority({ project: root, mode: 'epic', issueNumber: null }))
      .toMatchObject({ status: 'unverifiable', reasonCode: 'requested_issue_invalid' });
    expect(inspectEpicSpecAuthority({ project: root, mode: 'child', issueNumber: 'invalid' }))
      .toMatchObject({ status: 'unverifiable', reasonCode: 'requested_issue_invalid' });
  });

  test('resolves a canonical child while the aggregate still has a planned child', () => {
    const root = project();
    seedAggregate(root);
    seedChild(root);
    const child = inspectEpicSpecAuthority({ project: root, mode: 'child', issueNumber: 109, nativeChildren: [109, 110] });
    expect(child).toMatchObject({
      status: 'valid',
      reasonCode: 'epic_spec_authority_valid',
      epicIssue: 108,
      aggregatePath: 'specs/epic-route-weather',
      requestedChild: { issue: 109, status: 'valid' },
      gaps: [],
    });
    const epic = inspectEpicSpecAuthority({ project: root, mode: 'epic', issueNumber: 108, nativeChildren: [109, 110] });
    expect(epic).toMatchObject({ status: 'planned', reasonCode: 'epic_has_planned_children' });
  });

  test('requires exact native child agreement and forbids executable aggregate files', () => {
    const root = project();
    seedAggregate(root);
    seedChild(root);
    write(root, 'specs/epic-route-weather/tasks.md', '### T001: forbidden\n');
    const result = inspectEpicSpecAuthority({ project: root, mode: 'epic', issueNumber: 108, nativeChildren: [109] });
    expect(result).toMatchObject({ status: 'repair_required' });
    expect(result.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('gives executable ownership'),
      expect.stringContaining('native children do not match'),
    ]));
  });

  test('fails closed for a symlinked child artifact', () => {
    const root = project();
    seedAggregate(root, { children: [{ issue: 109, specPath: 'specs/feature-sample-route-weather', packageState: 'canonical', outcomes: ['EO001'] }] });
    seedChild(root);
    rmSync(path.join(root, 'specs/feature-sample-route-weather/epic-link.json'));
    symlinkSync(path.join(root, 'specs/feature-sample-route-weather/issue-scope.json'), path.join(root, 'specs/feature-sample-route-weather/epic-link.json'));
    const result = inspectEpicSpecAuthority({ project: root, mode: 'child', issueNumber: 109, nativeChildren: [109] });
    expect(result.status).toBe('unverifiable');
    expect(result.gaps.join(' ')).toContain('regular non-symlink file');
  });

  test('classifies one legacy cumulative epic spec as repair required', () => {
    const root = project();
    write(root, 'specs/feature-legacy/requirements.md', '# Requirements\n\n**Issue**: #108\n');
    write(root, 'specs/feature-legacy/tasks.md', '### T001: Legacy\n');
    write(root, 'specs/feature-legacy/feature.gherkin', 'Feature: Legacy\n');
    const result = inspectEpicSpecAuthority({ project: root, mode: 'epic', issueNumber: 108, nativeChildren: [109] });
    expect(result).toMatchObject({
      status: 'repair_required',
      reasonCode: 'legacy_cumulative_epic_spec',
      legacySpecPath: 'specs/feature-legacy',
    });
  });

  test('inspects an exact committed source without checking it out', () => {
    const root = project();
    seedAggregate(root, { children: [{ issue: 109, specPath: 'specs/feature-sample-route-weather', packageState: 'canonical', outcomes: ['EO001'] }] });
    seedChild(root);
    run(root, ['add', 'specs']);
    run(root, ['commit', '-qm', 'seed specs']);
    const head = run(root, ['rev-parse', 'HEAD']);
    rmSync(path.join(root, 'specs'), { recursive: true });
    mkdirSync(path.join(root, 'specs'));
    const result = inspectEpicSpecAuthority({ project: root, mode: 'child', issueNumber: 109, source: head, nativeChildren: [109] });
    expect(result).toMatchObject({ status: 'valid', source: head });
  });

  test('returns the same digest on a repeated no-change audit', () => {
    const root = project();
    seedAggregate(root);
    seedChild(root);
    const first = inspectEpicSpecAuthority({ project: root, mode: 'all' });
    const second = inspectEpicSpecAuthority({ project: root, mode: 'all' });
    expect(second).toEqual(first);
  });

  test('validates a nested epic as coordination authority rather than an executable child package', () => {
    const root = project();
    seedAggregate(root, {
      epic: 200,
      aggregatePath: 'specs/epic-root',
      children: [{ issue: 108, specPath: 'specs/epic-route-weather', packageState: 'canonical', outcomes: ['EO001'] }],
    });
    seedAggregate(root, {
      epic: 108,
      aggregatePath: 'specs/epic-route-weather',
      children: [{ issue: 109, specPath: 'specs/feature-sample-route-weather', packageState: 'canonical', outcomes: ['EO001'] }],
    });
    seedChild(root);

    const result = inspectEpicSpecAuthority({ project: root, mode: 'epic', issueNumber: 200, nativeChildren: [108] });

    expect(result).toMatchObject({
      status: 'valid',
      epicIssue: 200,
      children: [{ issue: 108, packageKind: 'epic', status: 'valid' }],
      gaps: [],
    });
  });

  test('keeps a canonical nested aggregate valid for its parent while nested executable work is planned', () => {
    const root = project();
    seedAggregate(root, {
      epic: 200,
      aggregatePath: 'specs/epic-root',
      children: [{ issue: 108, specPath: 'specs/epic-route-weather', packageState: 'canonical', outcomes: ['EO001'] }],
    });
    seedAggregate(root, {
      epic: 108,
      aggregatePath: 'specs/epic-route-weather',
      children: [{ issue: 109, specPath: 'specs/feature-sample-route-weather', packageState: 'planned', outcomes: ['EO001'] }],
    });

    const result = inspectEpicSpecAuthority({ project: root, mode: 'epic', issueNumber: 200, nativeChildren: [108] });

    expect(result).toMatchObject({
      status: 'valid',
      children: [{ issue: 108, packageKind: 'epic', status: 'valid', nestedStatus: 'planned' }],
    });
  });

  test('fails closed on a cycle between nested aggregate paths', () => {
    const root = project();
    seedAggregate(root, {
      epic: 200,
      aggregatePath: 'specs/epic-root',
      children: [{ issue: 108, specPath: 'specs/epic-route-weather', packageState: 'canonical', outcomes: ['EO001'] }],
    });
    seedAggregate(root, {
      epic: 108,
      aggregatePath: 'specs/epic-route-weather',
      children: [{ issue: 200, specPath: 'specs/epic-root', packageState: 'canonical', outcomes: ['EO001'] }],
    });

    const result = inspectEpicSpecAuthority({ project: root, mode: 'epic', issueNumber: 200, nativeChildren: [108] });

    expect(result.status).toBe('unverifiable');
    expect(result.gaps.join(' ')).toContain('aggregate reference cycle');
  });
});

describe('CLI parsing', () => {
  test('requires one mode and validates native child input', () => {
    expect(parseCli(['--project', '.', '--epic', '108', '--native-children', '109,110', '--json']))
      .toMatchObject({ mode: 'epic', issueNumber: 108, nativeChildren: [109, 110] });
    expect(() => parseCli(['--project', '.', '--all', '--native-children', '109', '--json']))
      .toThrow('--native-children is valid only');
  });
});
