import { describe, expect, it, afterEach, jest } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyIssueDependencyUpgrade,
  applyPublicationUpgrade,
  applyUpgrade,
  detectIssueDependencyUpgrade,
  detectPublicationUpgrade,
  detectUpgrade,
} from '../sdlc-upgrade.mjs';
import { parseDeliveryTaskFileLines } from '../sdlc-safe-recoveries.mjs';
import { applySteeringPlan, createInitializePlan, steeringSourceDigest } from '../sdlc-steering.mjs';
import { loadSteeringRuntime, projectPromptFragments } from '../../src/sdlc-steering-runtime.mjs';
const temporaryRoots = [];
const noNetworkRun = () => ({ status: 1, stdout: '', stderr: 'network disabled in test' });
const upgradeScript = fileURLToPath(new URL('../sdlc-upgrade.mjs', import.meta.url));

function makeRoot() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-upgrade-')));
  temporaryRoots.push(root);
  return root;
}

function write(root, relativePath, source) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function writeApprovedPackage(root, specDir, tasks, extras = {}) {
  const issue = /^specs\/([1-9]\d*)-/.exec(specDir)?.[1];
  if (!issue) throw new Error(`Invalid test spec directory: ${specDir}`);
  const frontmatter = `**Issue**: #${issue}\n**Status**: Approved\n`;
  write(root, `${specDir}/requirements.md`, `# Requirements\n\n${frontmatter}`);
  write(root, `${specDir}/design.md`, `# Design\n\n${frontmatter}`);
  write(root, `${specDir}/tasks.md`, `${frontmatter}\n${tasks}`);
  write(root, `${specDir}/feature.gherkin`, `${frontmatter}\nFeature: Test\n`);
  for (const [relativePath, source] of Object.entries(extras)) {
    write(root, `${specDir}/${relativePath}`, source);
  }
}

async function makeObsoleteCurrentSteering(root, { unknownKey = false } = {}) {
  await applySteeringPlan(root, createInitializePlan(root, {
    snippets: [
      {
        id: 'project.product',
        path: 'steering/snippets/project-product.md',
        consumers: ['sdlc-write-spec'],
        slot: 'body',
        order: 500,
        content: 'Keep product guidance.\n',
      },
      {
        id: 'project.custom',
        path: 'steering/snippets/project-custom.md',
        consumers: ['worker:implement'],
        slot: 'body',
        order: 600,
        content: 'Keep custom guidance.\n',
      },
    ],
  }));
  write(root, 'steering/extensions/custom.mjs', [
    'export const extension = Object.freeze({',
    '  schemaVersion: 1,',
    '  id: "project.custom",',
    '  providers: Object.freeze({ "project.custom-check": async (request) => ({ schemaVersion: 1, status: "passed", summary: "ok", identity: request.identity, evidence: [{ kind: "custom", summary: "ok", artifact: null }] }) }),',
    '});',
    '',
  ].join('\n'));
  const manifestPath = path.join(root, 'steering', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.extensions.push({
    id: 'project.custom',
    path: 'steering/extensions/custom.mjs',
    providers: ['project.custom-check'],
  });
  manifest.validations.push({
    id: 'custom.check',
    provider: 'project.custom-check',
    required: true,
    when: { kind: 'always' },
    config: {},
  });
  manifest.snippets[0].byteBound = 12000;
  manifest.snippets[1].byteBound = 8000;
  if (unknownKey) manifest.snippets[1].unexpected = true;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function dependencyRun(issues, blockers = {}) {
  const calls = [];
  const records = new Map(issues.map((issue) => [issue.number, {
    id: issue.id ?? issue.number * 100,
    number: issue.number,
    state: issue.state ?? 'open',
    title: issue.title ?? `Issue ${issue.number}`,
    body: issue.body ?? '',
    repository_url: 'https://api.github.com/repos/acme/widgets',
  }]));
  const run = (_command, args) => {
    calls.push(args);
    if (args[0] === 'repo') return { status: 0, stdout: JSON.stringify({ nameWithOwner: 'acme/widgets' }) };
    if (args.includes('--paginate') && args.includes('repos/acme/widgets/issues')) {
      return { status: 0, stdout: JSON.stringify([[...records.values()]]) };
    }
    if (args.includes('--paginate')) {
      const endpoint = args.find((arg) => /dependencies\/blocked_by$/.test(arg));
      const number = Number(endpoint.match(/issues\/(\d+)/)[1]);
      const blockedBy = (blockers[number] ?? []).map((target) => {
        const targetNumber = typeof target === 'number' ? target : target.number;
        const record = records.get(targetNumber);
        return target && typeof target === 'object' && Object.hasOwn(target, 'repository')
          ? { ...record, repository: target.repository }
          : record;
      });
      return { status: 0, stdout: JSON.stringify([blockedBy]) };
    }
    if (args[0] === 'api' && args.length === 2) {
      const number = Number(args[1].split('/').at(-1));
      const record = records.get(number);
      return record
        ? { status: 0, stdout: JSON.stringify(record) }
        : { status: 1, stdout: '', stderr: 'missing' };
    }
    if (args.includes('--method')) return { status: 0, stdout: '{}' };
    return { status: 1, stdout: '', stderr: 'unexpected call' };
  };
  return { run, calls };
}

describe('sdlc-upgrade flatten and split (SCN010–SCN011)', () => {
  it('flattens an epic package into the child directory', () => {
    const root = makeRoot();
    write(root, 'specs/epic-foo/requirements.md', [
      '# Epic Foo',
      '',
      '**Issue**: #10',
      '',
      '## Goal',
      '',
      'Ship bar.',
      '',
    ].join('\n'));
    write(root, 'specs/feature-bar/requirements.md', [
      '# Requirements: Bar',
      '',
      '**Issue**: #11',
      '',
    ].join('\n'));
    write(root, 'specs/feature-bar/epic-link.json', JSON.stringify({
      schemaVersion: 1,
      epicIssue: 10,
      epicSpecPath: 'specs/epic-foo',
      childIssue: 11,
      childSpecPath: 'specs/feature-bar',
      outcomes: ['EO001'],
    }, null, 2));
    write(root, 'specs/feature-bar/feature.gherkin', '**Issues**: #10, #11\nFeature: Bar\n');
    write(root, 'specs/epic-unapproved/requirements.md', '**Issue**: #12\n');



    const item = detectUpgrade(root).items.find((candidate) => (
      candidate.kind === 'epic-flatten' && candidate.from === 'specs/feature-bar'
    ));
    applyUpgrade(root, [item.id], noNetworkRun);
    expect(fs.existsSync(path.join(root, 'specs/11-bar/requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'specs/epic-foo'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'specs/epic-unapproved/requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'specs/11-bar/epic-link.json'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'specs/11-bar/requirements.md'), 'utf8')).toContain('**Issue**: #11');
    expect(fs.readFileSync(path.join(root, 'specs/11-bar/feature.gherkin'), 'utf8')).toContain('**Issue**: #11');
  });

  it('splits a cumulative feature spec with valid issue-scope.json', () => {
    const root = makeRoot();
    write(root, 'specs/feature-baz/requirements.md', [
      '# Requirements: Baz',
      '',
      '**Issues**: #2, #6',
      '',
      '### AC1: Two',
      '### AC2: Six',
      '',
    ].join('\n'));
    write(root, 'specs/feature-baz/design.md', '# Design\n\n**Issues**: #2, #6\n');
    write(root, 'specs/feature-baz/tasks.md', [
      '# Tasks',
      '',
      '**Issues**: #2, #6',
      '',
      '### T001: Change two',
      '**File(s)**: Create `src/two.ts`',
      '### T002: Change six',
      '**File(s)**: Create `src/six.ts`',
      '',
    ].join('\n'));
    write(root, 'specs/feature-baz/feature.gherkin', [
      'Feature: Baz',
      '@SCN1',
      'Scenario: Two',
      '  Given issue two',
      '@SCN2',
      'Scenario: Six',
      '  Given issue six',
      '',
    ].join('\n'));
    write(root, 'specs/feature-baz/issue-scope.json', JSON.stringify({
      schemaVersion: 1,
      issues: {
        '2': {
          owned: { acceptanceCriteria: ['AC1'], functionalRequirements: [], tasks: ['T001'], scenarios: ['SCN1'] },
          adopted: { acceptanceCriteria: [], functionalRequirements: [], tasks: [], scenarios: [] },
          regression: { acceptanceCriteria: [], functionalRequirements: [], scenarios: [] },
        },
        '6': {
          owned: { acceptanceCriteria: ['AC2'], functionalRequirements: [], tasks: ['T002'], scenarios: ['SCN2'] },
          adopted: { acceptanceCriteria: [], functionalRequirements: [], tasks: [], scenarios: [] },
          regression: { acceptanceCriteria: [], functionalRequirements: [], scenarios: [] },
        },
      },
    }, null, 2));

    const report = detectUpgrade(root);
    const publication = report.items.find((item) => item.kind === 'publication-files');
    expect(publication.packages).toContainEqual(expect.objectContaining({
      path: 'specs/feature-baz/tasks.md',
      projectedPaths: ['specs/2-baz/tasks.md', 'specs/6-baz/tasks.md'],
    }));
    const ids = report.items
      .filter((item) => ['publication-files', 'cumulative-split', 'directory-rename'].includes(item.kind))
      .map((item) => item.id);
    applyUpgrade(root, ids, noNetworkRun);

    expect(fs.existsSync(path.join(root, 'specs/2-baz/requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'specs/6-baz/requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'specs/feature-baz/issue-scope.json'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'specs/2-baz/requirements.md'), 'utf8')).toContain('**Issue**: #2');
    expect(fs.readFileSync(path.join(root, 'specs/6-baz/requirements.md'), 'utf8')).toContain('**Issue**: #6');
    expect(fs.readFileSync(path.join(root, 'specs/2-baz/requirements.md'), 'utf8')).not.toMatch(/\*\*Issues\*\*/);
    expect(fs.readFileSync(path.join(root, 'specs/2-baz/feature.gherkin'), 'utf8')).toContain('Scenario: Two');
    expect(fs.readFileSync(path.join(root, 'specs/2-baz/feature.gherkin'), 'utf8')).not.toContain('Scenario: Six');
    expect(fs.readFileSync(path.join(root, 'specs/6-baz/feature.gherkin'), 'utf8')).toContain('Scenario: Six');
    expect(fs.readFileSync(path.join(root, 'specs/2-baz/tasks.md'), 'utf8'))
      .toContain('**File(s)**: `src/two.ts`');
    expect(fs.readFileSync(path.join(root, 'specs/6-baz/tasks.md'), 'utf8'))
      .toContain('**File(s)**: `src/six.ts`');
  });
});

describe('sdlc-upgrade leftover spikes', () => {
  it('converts a spike ADR into an ordinary spec and marks the ADR migrated', () => {
    const root = makeRoot();
    write(root, 'docs/decisions/2026-08-01-evaluate-cache.md', [
      '# Spike: Evaluate cache',
      '',
      '**Issue**: #11',
      '',
      'Research notes.',
    ].join('\n'));

    const ids = detectUpgrade(root).items.filter((item) => item.kind === 'spike-flatten').map((item) => item.id);
    expect(ids).toEqual(['spike-flatten:docs/decisions/2026-08-01-evaluate-cache.md']);
    applyUpgrade(root, ids, noNetworkRun);

    expect(fs.existsSync(path.join(root, 'specs/11-evaluate-cache/requirements.md'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'specs/11-evaluate-cache/requirements.md'), 'utf8')).toContain('**Issue**: #11');
    expect(fs.readFileSync(path.join(root, 'specs/11-evaluate-cache/feature.gherkin'), 'utf8')).toContain('**Status**: Draft');
    expect(fs.readFileSync(path.join(root, 'docs/decisions/2026-08-01-evaluate-cache.md'), 'utf8')).toContain('**SDLC-Migrated**: specs/11-evaluate-cache');
    expect(detectUpgrade(root).items.filter((item) => item.kind === 'spike-flatten')).toEqual([]);
  });

  it('does not stamp an unrelated colliding directory', () => {
    const root = makeRoot();
    write(root, 'docs/decisions/2026-08-01-evaluate-cache.md', '# Spike\n\n**Issue**: #11\n');
    write(root, 'specs/11-evaluate-cache/requirements.md', '# Other\n\n**Issue**: #99\n');

    const item = detectUpgrade(root).items.find((entry) => entry.kind === 'spike-flatten');
    expect(item.actionable).toBe(false);
    const result = applyUpgrade(root, [item.id], noNetworkRun);
    expect(result.results[0].status).toBe('skipped:collision');
    expect(fs.readFileSync(path.join(root, 'docs/decisions/2026-08-01-evaluate-cache.md'), 'utf8')).not.toContain('**SDLC-Migrated**');
  });
});

describe('sdlc-upgrade AGENTS spike language', () => {
  it('removes exact spike wording while preserving managed content', () => {
    const root = makeRoot();
    write(root, 'AGENTS.md', [
      'agents/                       # OMP task agents (starter, spec-implementer, architecture-reviewer, deliverer, spike-researcher)',
      'docs/decisions/               # ADR directory (populated by write-spec for spikes)',
      '<!-- nmg-sdlc-managed: spec-context -->',
      '',
    ].join('\n'));

    expect(detectUpgrade(root).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'agents-spike-language', actionable: true }),
    ]));
    const result = applyUpgrade(root, ['agents-spike-language'], noNetworkRun);
    const updated = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');

    expect(result.results[0].status).toBe('applied');
    expect(updated).toContain('# OMP task agents (starter, spec-implementer, architecture-reviewer, deliverer)');
    expect(updated).toContain('# ADR directory');
    expect(updated).not.toMatch(/spike/i);
    expect(updated).toContain('<!-- nmg-sdlc-managed: spec-context -->');
    expect(detectUpgrade(root).items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'agents-spike-language' }),
    ]));
  });

  it('leaves AGENTS.md unchanged when spike wording remains unverifiable', () => {
    const root = makeRoot();
    const source = [
      'agents/                       # OMP task agents (starter, spec-implementer, architecture-reviewer, deliverer, spike-researcher)',
      'docs/decisions/               # ADR directory (populated by write-spec for spikes)',
      'spike leftover',
      '',
    ].join('\n');
    write(root, 'AGENTS.md', source);

    expect(detectUpgrade(root).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'agents-spike-language', actionable: true }),
    ]));
    const result = applyUpgrade(root, ['agents-spike-language'], noNetworkRun);

    expect(result.results[0].status).toBe('skipped:unverifiable');
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe(source);
  });
});

describe('sdlc-upgrade plugin runtime ignore', () => {
  it('detects, applies, preserves, and becomes non-actionable', () => {
    const root = makeRoot();
    write(root, '.gitignore', 'dist/\n');

    expect(detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false }).items).toContainEqual(
      expect.objectContaining({ id: 'omp-sdlc-ignore', kind: 'omp-sdlc-ignore', actionable: true }),
    );

    const result = applyUpgrade(root, ['omp-sdlc-ignore'], noNetworkRun, { includeIssueDependencies: false });

    expect(result.results).toContainEqual({ id: 'omp-sdlc-ignore', status: 'applied' });
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('dist/\n.omp/sdlc/\n');
    expect(detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false }).items)
      .not.toContainEqual(expect.objectContaining({ id: 'omp-sdlc-ignore' }));
  });

  it.each(['.omp/sdlc/\n', '.omp/sdlc\n'])('does not detect an existing rule: %s', (source) => {
    const root = makeRoot();
    write(root, '.gitignore', source);
    expect(detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false }).items)
      .not.toContainEqual(expect.objectContaining({ id: 'omp-sdlc-ignore' }));
  });
});

describe('sdlc-upgrade spec-created backfill', () => {
  it('backfills unique complete packages even when no upgrade items are approved', () => {
    const root = makeRoot();
    for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
      write(root, `specs/42-complete/${name}`, '**Issue**: #42\n**Status**: Draft\n');
    }
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === 'issue' && args[1] === 'view') {
        return { status: 0, stdout: '{"number":42,"labels":[]}', stderr: '' };
      }
      if (args[0] === 'label' && args[1] === 'list') {
        return { status: 0, stdout: '[{"name":"spec-created"}]', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };

    const result = applyUpgrade(root, [], run);

    expect(result.results).toContainEqual(expect.objectContaining({
      id: 'spec-created-backfill',
      status: 'applied',
      ok: true,
      labeled: [42],
    }));
    expect(calls).toContainEqual(['gh', 'issue', 'edit', '42', '--add-label', 'spec-created']);
    expect(calls.some((call) => call.includes('99'))).toBe(false);
  });
});

describe('official dependency upgrade reconciliation', () => {
  it('screens every issue and proposes only missing explicit official edges', () => {
    const fixture = dependencyRun([
      { number: 2, body: 'Depends on: #1\nPreserve this body.' },
      { number: 1, state: 'closed' },
      { number: 3, body: 'This may be related to #1.' },
    ]);

    const item = detectIssueDependencyUpgrade({ cwd: '/repo', run: fixture.run });

    expect(item.issueCount).toBe(3);
    expect(item.additions).toEqual([{ issue: 2, blockedBy: 1, source: 'Depends on: #1' }]);
    expect(fixture.calls.filter((args) => args.includes('--paginate') && args.some((arg) => /dependencies\/blocked_by$/.test(arg)))).toHaveLength(3);
    expect(fixture.calls.some((args) => args.includes('POST'))).toBe(false);
  });

  it('detects existing official edges with REST repository objects', () => {
    const fixture = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ], {
      2: [{ number: 1, repository: { full_name: 'acme/widgets' } }],
    });

    const item = detectIssueDependencyUpgrade({ cwd: '/repo', run: fixture.run });

    expect(item).toEqual(expect.objectContaining({
      actionable: false,
      issueCount: 2,
      additions: [],
    }));
  });

  it('rejects graph drift before applying an approved edge', () => {
    const initial = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ]);
    const approved = detectIssueDependencyUpgrade({ cwd: '/repo', run: initial.run });
    const changed = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'open' },
    ]);

    expect(() => applyIssueDependencyUpgrade(approved, { cwd: '/repo', run: changed.run }))
      .toThrow(expect.objectContaining({ reasonCode: 'dependency_plan_stale' }));
    expect(changed.calls.some((args) => args.includes('POST'))).toBe(false);
  });

  it('treats an approved edge that is already present as applied on retry', () => {
    const initial = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ]);
    const approved = detectIssueDependencyUpgrade({ cwd: '/repo', run: initial.run });
    const retried = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ], { 2: [1] });

    expect(applyIssueDependencyUpgrade(approved, { cwd: '/repo', run: retried.run })).toEqual({
      id: approved.id,
      status: 'applied',
      applied: [],
      alreadyPresent: approved.additions,
    });
    expect(retried.calls.some((args) => args.includes('POST'))).toBe(false);
  });

  it('accepts an applyUpgrade retry only when every encoded approved edge is present', () => {
    const root = makeRoot();
    const initial = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ]);
    const approved = detectUpgrade(root, {
      run: initial.run,
      includeIssueDependencies: true,
    }).items.find((item) => item.kind === 'issue-dependencies');
    const retried = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ], { 2: [1] });

    const result = applyUpgrade(root, [approved.id], retried.run, { includeIssueDependencies: true });

    expect(result.applied).toContainEqual({
      id: approved.id,
      status: 'applied',
      applied: [],
      alreadyPresent: [{ issue: 2, blockedBy: 1 }],
    });
    expect(retried.calls.some((args) => args.includes('POST'))).toBe(false);
  });

  it('rejects proposed edge drift even when the official graph is unchanged', () => {
    const initial = dependencyRun([
      { number: 1, state: 'closed' },
      { number: 2, body: 'Depends on: #1' },
      { number: 3, state: 'closed' },
    ]);

    const approved = detectIssueDependencyUpgrade({ cwd: '/repo', run: initial.run });
    const changed = dependencyRun([
      { number: 1, state: 'closed' },
      { number: 2, body: 'Depends on: #3' },
      { number: 3, state: 'closed' },
    ]);

    expect(() => applyIssueDependencyUpgrade(approved, { cwd: '/repo', run: changed.run }))
      .toThrow(expect.objectContaining({ reasonCode: 'dependency_plan_stale' }));
    expect(changed.calls.some((args) => args.includes('POST'))).toBe(false);
  });

  it('keeps post-apply detection usable with REST repository objects', () => {
    const root = makeRoot();
    const initial = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ]);
    const approved = detectUpgrade(root, {
      run: initial.run,
      includeIssueDependencies: true,
    }).items.find((item) => item.kind === 'issue-dependencies');
    const applied = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ], {
      2: [{ number: 1, repository: { full_name: 'acme/widgets' } }],
    });

    const result = applyUpgrade(root, [approved.id], applied.run, { includeIssueDependencies: true });

    expect(result.applied).toContainEqual(expect.objectContaining({
      id: approved.id,
      status: 'applied',
    }));
    expect(result.postDetectError).toBeUndefined();
    expect(result.postDetectItemCount).not.toBeNull();
  });

  it('binds approved helper item ids to the detected graph digest', () => {
    const root = makeRoot();
    const initial = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ]);
    const approved = detectUpgrade(root, {
      run: initial.run,
      includeIssueDependencies: true,
    }).items.find((item) => item.kind === 'issue-dependencies');
    const changed = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'open' },
    ]);

    expect(() => applyUpgrade(root, [approved.id], changed.run, { includeIssueDependencies: true }))
      .toThrow(expect.objectContaining({ reasonCode: 'dependency_plan_stale' }));
    expect(changed.calls.some((args) => args.includes('POST'))).toBe(false);
  });

  it('preserves successful dependency results when post-apply detection fails', () => {
    const root = makeRoot();
    const initial = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ]);
    const approved = detectUpgrade(root, {
      run: initial.run,
      includeIssueDependencies: true,
    }).items.find((item) => item.kind === 'issue-dependencies');
    const applying = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ]);
    let issueListReads = 0;
    const run = (command, args) => {
      if (args.includes('--paginate') && args.includes('repos/acme/widgets/issues')) {
        issueListReads += 1;
        if (issueListReads === 3) return { status: 1, stdout: '', stderr: 'temporary API failure' };
      }
      return applying.run(command, args);
    };

    const result = applyUpgrade(root, [approved.id], run, { includeIssueDependencies: true });

    expect(result.applied).toContainEqual(expect.objectContaining({
      id: approved.id,
      status: 'applied',
    }));
    expect(result.postDetectItemCount).toBeNull();
    expect(result.postDetectError).toEqual(expect.objectContaining({
      reasonCode: 'dependency_unreadable',
    }));
  });

  it('does not report already current while dependency additions remain', () => {
    const root = makeRoot();
    const fixture = dependencyRun([
      { number: 2, body: 'Depends on: #1' },
      { number: 1, state: 'closed' },
    ]);

    const report = detectUpgrade(root, {
      run: fixture.run,
      includeIssueDependencies: true,
    });

    expect(report.items).toContainEqual(expect.objectContaining({
      kind: 'issue-dependencies',
      actionable: true,
    }));
    expect(report.items.some((item) => item.kind === 'already-current')).toBe(false);
  });
});

describe('managed current steering repair', () => {
  it('detects a manifest-only byteBound repair without mutating project files', async () => {
    const root = makeRoot();
    const { manifest, manifestPath } = await makeObsoleteCurrentSteering(root);
    const before = {
      manifest: fs.readFileSync(manifestPath, 'utf8'),
      product: fs.readFileSync(path.join(root, 'steering/snippets/project-product.md'), 'utf8'),
      custom: fs.readFileSync(path.join(root, 'steering/snippets/project-custom.md'), 'utf8'),
      extension: fs.readFileSync(path.join(root, 'steering/extensions/custom.mjs'), 'utf8'),
    };

    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find((candidate) => candidate.kind === 'steering-runtime');

    expect(item).toEqual(expect.objectContaining({
      actionable: true,
      plan: expect.objectContaining({
        mode: 'update',
        sourceDigest: steeringSourceDigest(root),
        actions: [expect.objectContaining({ op: 'write', path: 'steering/manifest.json' })],
      }),
    }));
    expect(item.plan.actions).toHaveLength(1);
    const candidate = JSON.parse(item.plan.actions[0].content);
    const expected = structuredClone(manifest);
    for (const snippet of expected.snippets) delete snippet.byteBound;
    expect(candidate).toEqual(expected);
    expect({
      manifest: fs.readFileSync(manifestPath, 'utf8'),
      product: fs.readFileSync(path.join(root, 'steering/snippets/project-product.md'), 'utf8'),
      custom: fs.readFileSync(path.join(root, 'steering/snippets/project-custom.md'), 'utf8'),
      extension: fs.readFileSync(path.join(root, 'steering/extensions/custom.mjs'), 'utf8'),
    }).toEqual(before);
  });

  it('applies the approved repair, preserves registrations and bodies, and restores runtime loading', async () => {
    const root = makeRoot();
    const { manifest, manifestPath } = await makeObsoleteCurrentSteering(root);
    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find((candidate) => candidate.kind === 'steering-runtime');

    const result = applyUpgrade(root, [item.id], noNetworkRun, { includeIssueDependencies: false });

    expect(result.applied).toContainEqual(expect.objectContaining({ id: item.id, status: 'applied' }));
    const repaired = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const expected = structuredClone(manifest);
    for (const snippet of expected.snippets) delete snippet.byteBound;
    expect(repaired).toEqual(expected);
    expect(fs.readFileSync(path.join(root, 'steering/snippets/project-product.md'), 'utf8')).toBe('Keep product guidance.\n');
    expect(fs.readFileSync(path.join(root, 'steering/snippets/project-custom.md'), 'utf8')).toBe('Keep custom guidance.\n');
    const runtime = await loadSteeringRuntime(root);
    expect(projectPromptFragments(runtime).map(({ id }) => id)).toEqual(['project.product', 'project.custom']);
    const repeat = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false });
    expect(repeat.items.some((candidate) => candidate.kind === 'steering-runtime')).toBe(false);
  });

  it('rejects additional unknown snippet fields without mutation', async () => {
    const root = makeRoot();
    const { manifestPath } = await makeObsoleteCurrentSteering(root, { unknownKey: true });
    const before = fs.readFileSync(manifestPath, 'utf8');

    expect(() => detectUpgrade(root, {
      run: noNetworkRun,
      includeIssueDependencies: false,
    })).toThrow('steering_manifest_unknown_key');
    await expect(loadSteeringRuntime(root)).rejects.toMatchObject({ reasonCode: 'steering_manifest_unknown_key' });
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(before);
  });

  it('rejects an approved repair when its complete steering digest becomes stale', async () => {
    const root = makeRoot();
    const { manifestPath } = await makeObsoleteCurrentSteering(root);
    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find((candidate) => candidate.kind === 'steering-runtime');
    const approvedManifest = fs.readFileSync(manifestPath, 'utf8');
    write(root, 'steering/snippets/project-custom.md', 'Changed after approval.\n');

    await expect(applySteeringPlan(root, item.plan)).rejects.toMatchObject({ reasonCode: 'steering_plan_stale' });
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(approvedManifest);
  });
});

describe('publication File(s) upgrade', () => {
  it('rewrites recoverable prose once and emits canonical declarations', () => {
    const root = makeRoot();
    write(root, 'specs/42-add-x/tasks.md', [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Create code',
      '',
      '**Files**: Create `src/a.ts`',
      '',
    ].join('\n'));
    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');

    expect(item).toMatchObject({
      id: expect.stringMatching(/^publication-files:[0-9a-f]{64}$/),
      actionable: true,
      packages: [expect.objectContaining({
        path: 'specs/42-add-x/tasks.md',
        rewrites: [expect.objectContaining({ line: 6, entry: 'Create `src/a.ts`' })],
      })],
    });
    applyUpgrade(root, [item.id], noNetworkRun, { includeIssueDependencies: false });
    expect(fs.readFileSync(path.join(root, 'specs/42-add-x/tasks.md'), 'utf8'))
      .toContain('**File(s)**: `src/a.ts`');
    expect(detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false }).items)
      .not.toContainEqual(expect.objectContaining({ kind: 'publication-files' }));
  });

  it('repairs the PathCast #108 four-task shape without widening publication authority', () => {
    const root = makeRoot();
    const relativePath = 'specs/108-coordinate-the-pathcast-to-miledar-prelaunch-rebrand/tasks.md';
    const source = [
      '**Issue**: #108',
      '**Status**: Approved',
      '',
      '### T001: Inventory exact merged guardrail deliverables',
      '**Files**: `api/src/services/ip-guardrails/types.ts` (Modify), `api/src/services/ip-guardrails/semantic.ts` (Modify), `api/src/services/ip-guardrails/service.ts` (Modify), `api/src/__tests__/unit/ip-guardrails/reconciliation.test.ts` (Create), `docs/release/miledar-ip-product-safety.md` (Modify)',
      '**Type**: Create / Modify',
      '',
      '### T002: Bind every issue outcome bidirectionally',
      '**Files**: `api/src/services/ip-guardrails/types.ts` (Modify), `api/src/services/ip-guardrails/semantic.ts` (Modify), `api/src/services/ip-guardrails/service.ts` (Modify), `api/src/scripts/capture-miledar-ip-evidence.ts` (Create), `api/src/scripts/reconcile-miledar-ip-guardrails.ts` (Create), `api/package.json` (Modify), `.github/workflows/miledar-ip-guardrails.yml` (Modify), `docs/release/miledar-ip-guardrails.json` (Modify), `api/src/__tests__/unit/ip-guardrails/reconciliation.test.ts` (Modify)',
      '**Type**: Create / Modify / Test',
      '',
      '### T003: Implement cross-layer guardrail BDD',
      '**Files**: `api/src/__tests__/features/miledar_ip_guardrails.feature` (Create), `api/src/__tests__/steps/miledar_ip_guardrails.steps.ts` (Create)',
      '**Type**: Create',
      '',
      '### T004: Reconcile exact revision and live enforcement',
      '**Files**: `api/.artifacts/miledar-ip-guardrails/evidence.json` (Download untracked), `artifacts/issue-108/merged-inputs.json` (Generate untracked), `artifacts/issue-108/hosted-check.json` (Generate untracked), `artifacts/issue-108/live-ruleset.json` (Generate untracked), `artifacts/issue-108/local-results.json` (Generate untracked), `artifacts/issue-108/reconciliation.json` (Generate untracked)',
      '**Type**: Generate / Create / Verify',
      '',
    ].join('\n');
    const taskIds = ['T001', 'T002', 'T003', 'T004'];
    const intendedPaths = [
      '.github/workflows/miledar-ip-guardrails.yml',
      'api/.artifacts/miledar-ip-guardrails/evidence.json',
      'api/package.json',
      'api/src/__tests__/features/miledar_ip_guardrails.feature',
      'api/src/__tests__/steps/miledar_ip_guardrails.steps.ts',
      'api/src/__tests__/unit/ip-guardrails/reconciliation.test.ts',
      'api/src/scripts/capture-miledar-ip-evidence.ts',
      'api/src/scripts/reconcile-miledar-ip-guardrails.ts',
      'api/src/services/ip-guardrails/semantic.ts',
      'api/src/services/ip-guardrails/service.ts',
      'api/src/services/ip-guardrails/types.ts',
      'artifacts/issue-108/hosted-check.json',
      'artifacts/issue-108/live-ruleset.json',
      'artifacts/issue-108/local-results.json',
      'artifacts/issue-108/merged-inputs.json',
      'artifacts/issue-108/reconciliation.json',
      'docs/release/miledar-ip-guardrails.json',
      'docs/release/miledar-ip-product-safety.md',
    ];
    write(root, relativePath, source);

    expect(() => parseDeliveryTaskFileLines(source, { spec: relativePath, taskIds }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_scope_unproven', taskId: 'T001', line: 5 }));

    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');
    expect(item).toMatchObject({
      id: expect.stringMatching(/^publication-files:[0-9a-f]{64}$/),
      actionable: true,
      packages: [{
        path: relativePath,
        sourceDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        findings: [],
        rewrites: [
          expect.objectContaining({ line: 5, before: expect.stringMatching(/^\*\*Files\*\*:/), after: expect.stringMatching(/^\*\*File\(s\)\*\*:/) }),
          expect.objectContaining({ line: 9, before: expect.stringMatching(/^\*\*Files\*\*:/), after: expect.stringMatching(/^\*\*File\(s\)\*\*:/) }),
          expect.objectContaining({ line: 13, before: expect.stringMatching(/^\*\*Files\*\*:/), after: expect.stringMatching(/^\*\*File\(s\)\*\*:/) }),
          expect.objectContaining({ line: 17, before: expect.stringMatching(/^\*\*Files\*\*:/), after: expect.stringMatching(/^\*\*File\(s\)\*\*:/) }),
        ],
      }],
    });

    applyUpgrade(root, [item.id], noNetworkRun, { includeIssueDependencies: false });
    const updated = fs.readFileSync(path.join(root, relativePath), 'utf8');
    expect(updated.replaceAll('**File(s)**:', '**Files**:')).toBe(source);
    expect(updated.match(/^\*\*File\(s\)\*\*:/gm)).toHaveLength(4);
    expect([...new Set(parseDeliveryTaskFileLines(updated, { spec: relativePath, taskIds }))].sort())
      .toEqual(intendedPaths);
    expect(detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false }).items)
      .not.toContainEqual(expect.objectContaining({ kind: 'publication-files' }));
  });

  it('preserves supported annotations and CRLF while canonicalizing', () => {
    const root = makeRoot();
    const source = [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Create code',
      '**File(s)**: Create `src/a.ts` (delivery-owner only)',
      '',
    ].join('\r\n');
    write(root, 'specs/42-add-x/tasks.md', source);
    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');

    applyUpgrade(root, [item.id], noNetworkRun, { includeIssueDependencies: false });

    const updated = fs.readFileSync(path.join(root, 'specs/42-add-x/tasks.md'), 'utf8');
    expect(updated).toContain('**File(s)**: `src/a.ts` (delivery-owner only)');
    expect(updated.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('preserves mixed line endings while changing only the approved label', () => {
    const root = makeRoot();
    const relativePath = 'specs/42-add-x/tasks.md';
    const source = '**Issue**: #42\r\n**Status**: Approved\n\r\n### T001: Create code\n**Files**: `src/a.ts`\r\n**Type**: Modify\n';
    write(root, relativePath, source);
    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');

    applyUpgrade(root, [item.id], noNetworkRun, { includeIssueDependencies: false });

    const updated = fs.readFileSync(path.join(root, relativePath), 'utf8');
    expect(updated).toBe(source.replace('**Files**:', '**File(s)**:'));
    expect(updated.replace('**File(s)**:', '**Files**:')).toBe(source);
  });

  it.each([
    'Create `src/a.ts` or `src/b.ts`',
    'Create `src/a.ts` and src/b.ts',
  ])('keeps ambiguous declaration as a finding: %s', (declaration) => {
    const root = makeRoot();
    write(root, 'specs/42-add-x/tasks.md', `### T001: Create code\n**File(s)**: ${declaration}\n`);
    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');

    expect(item.actionable).toBe(false);
    expect(item.packages[0].rewrites).toEqual([]);
    expect(item.packages[0].findings).toEqual([
      expect.objectContaining({ entry: declaration }),
    ]);
  });

  it.each([
    ['trailing', '**Files**: `src/a.ts` <!-- retain this note -->'],
    ['inline', '**Files**: `src/a.ts` <!-- retain this note -->, `src/b.ts`'],
    ['leading hidden', '<!-- retain this note -->**Files**: `src/a.ts`'],
  ])('refuses a %s HTML-comment near miss without changing bytes', (_name, declaration) => {
    const root = makeRoot();
    const relativePath = 'specs/42-add-x/tasks.md';
    const source = `### T001: Create code\n${declaration}\n`;
    write(root, relativePath, source);

    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');

    expect(item).toMatchObject({
      actionable: false,
      packages: [{
        path: relativePath,
        rewrites: [],
        findings: [expect.objectContaining({
          line: 2,
          taskId: 'T001',
          rawEntry: declaration,
        })],
      }],
    });
    const result = applyUpgrade(root, [item.id], noNetworkRun, { includeIssueDependencies: false });
    expect(result.applied).toContainEqual(expect.objectContaining({ id: item.id }));
    expect(fs.readFileSync(path.join(root, relativePath), 'utf8')).toBe(source);
  });

  it('never establishes authority from missing, duplicate, mixed, unsupported, malformed, or hidden declarations', () => {
    const root = makeRoot();
    const fixtures = {
      '43-missing': '### T001: Missing\n**Type**: Modify\n',
      '44-duplicate': '### T001: Duplicate\n**Files**: `src/a.ts`\n**Files**: `src/b.ts`\n',
      '44-duplicate-canonical': '### T001: Duplicate canonical\n**File(s)**: `src/a.ts`\n**File(s)**: `src/b.ts`\n',
      '45-mixed': '### T001: Mixed\n**File(s)**: `src/a.ts`\n**Files**: `src/b.ts`\n',
      '46-unsupported': '### T001: Unsupported\n**File**: `src/a.ts`\n',
      '47-malformed': '### T001: Malformed\n**Files**: Create src/a.ts\n',
      '48-ambiguous': '### T001: Ambiguous\n**Files**: Create `src/a.ts` or `src/b.ts`\n',
      '49-hidden': [
        '### T001: Valid',
        '**File(s)**: `src/a.ts`',
        '```markdown',
        '**Files**: `src/hidden-fence.ts`',
        '```',
        '<!--',
        '**Files**: `src/hidden-comment.ts`',
        '-->',
        '',
      ].join('\n'),
    };
    for (const [name, contents] of Object.entries(fixtures)) {
      write(root, `specs/${name}/tasks.md`, contents);
    }

    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');

    expect(item.actionable).toBe(false);
    expect(item.packages.map(({ path: packagePath }) => packagePath)).toEqual([
      'specs/44-duplicate/tasks.md',
      'specs/44-duplicate-canonical/tasks.md',
      'specs/45-mixed/tasks.md',
      'specs/46-unsupported/tasks.md',
      'specs/47-malformed/tasks.md',
      'specs/48-ambiguous/tasks.md',
    ]);
    expect(item.packages.every(({ rewrites }) => rewrites.length === 0)).toBe(true);
    expect(item.packages.every(({ findings }) => findings.length === 1)).toBe(true);
  });

  it('canonicalizes an unambiguous prose-prefixed path list', () => {
    const root = makeRoot();
    write(root, 'specs/42-add-x/tasks.md', '### T001: Create code\n**File(s)**: Modify `src/a.ts`, `src/b.ts`\n');
    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');

    expect(item.packages[0].findings).toEqual([]);
    expect(item.packages[0].rewrites).toEqual([
      expect.objectContaining({ after: '**File(s)**: `src/a.ts`, `src/b.ts`' }),
    ]);
  });

  it('keeps mixed unsafe quotes and prose-only declarations as findings', () => {
    const root = makeRoot();
    write(root, 'specs/42-add-x/tasks.md', [
      '### T001: Unsafe quoted path',
      '**File(s)**: Create `src/a.ts` and `../escape.ts`',
      '### T002: Prose only',
      '**File(s)**: Create src/b.ts',
      '### T003: Quoted note is not authority',
      '**File(s)**: Create `src/c.ts` (see `notes.txt`; not authority)',
      '',
    ].join('\n'));
    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');

    expect(item.actionable).toBe(false);
    expect(item.packages[0].rewrites).toEqual([]);
    expect(item.packages[0].findings).toHaveLength(3);
  });

  it('rewrites a package at its approved directory-rename source before migration', () => {
    const root = makeRoot();
    for (const name of ['requirements.md', 'design.md', 'feature.gherkin']) {
      write(root, `specs/feature-add-x/${name}`, '**Issue**: #42\n**Status**: Approved\n');
    }
    write(root, 'specs/feature-add-x/tasks.md', '**Issue**: #42\n**Status**: Approved\n\n### T001: Create code\n**File(s)**: Create `src/a.ts`\n');
    const report = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false });
    const rename = report.items.find(({ kind }) => kind === 'directory-rename');
    const publication = report.items.find(({ kind }) => kind === 'publication-files');

    expect(publication.packages).toContainEqual(expect.objectContaining({
      path: 'specs/feature-add-x/tasks.md',
      projectedPath: 'specs/42-add-x/tasks.md',
    }));
    applyUpgrade(root, [rename.id, publication.id], noNetworkRun, { includeIssueDependencies: false });

    expect(fs.readFileSync(path.join(root, 'specs/42-add-x/tasks.md'), 'utf8'))
      .toContain('**File(s)**: `src/a.ts`');
    expect(detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false }).items)
      .not.toContainEqual(expect.objectContaining({ kind: 'publication-files' }));
  });

  it('rewrites a nested epic child at its approved source before flattening', () => {
    const root = makeRoot();
    write(root, 'specs/epic-parent/requirements.md', '**Issue**: #41\n**Status**: Approved\n');
    for (const name of ['requirements.md', 'design.md', 'feature.gherkin']) {
      write(root, `specs/epic-parent/feature-add-x/${name}`, '**Issue**: #42\n**Status**: Approved\n');
    }
    write(root, 'specs/epic-parent/feature-add-x/tasks.md', '**Issue**: #42\n**Status**: Approved\n\n### T001: Create code\n**File(s)**: Create `src/a.ts`\n');
    write(root, 'specs/epic-parent/feature-add-x/epic-link.json', JSON.stringify({
      schemaVersion: 1,
      epicIssue: 41,
      epicSpecPath: 'specs/epic-parent',
      childIssue: 42,
      childSpecPath: 'specs/epic-parent/feature-add-x',
      outcomes: ['EO001'],
    }, null, 2));
    const report = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false });
    const flatten = report.items.find(({ kind, from }) => (
      kind === 'epic-flatten' && from === 'specs/epic-parent/feature-add-x'
    ));
    const publication = report.items.find(({ kind }) => kind === 'publication-files');

    expect(publication.packages).toContainEqual(expect.objectContaining({
      path: 'specs/epic-parent/feature-add-x/tasks.md',
      projectedPath: 'specs/42-add-x/tasks.md',
    }));
    applyUpgrade(root, [flatten.id, publication.id], noNetworkRun, { includeIssueDependencies: false });

    expect(fs.readFileSync(path.join(root, 'specs/42-add-x/tasks.md'), 'utf8'))
      .toContain('**File(s)**: `src/a.ts`');
    expect(detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false }).items)
      .not.toContainEqual(expect.objectContaining({ kind: 'publication-files' }));
  });

  it('does not backfill a transformed package with invalid publication declarations', () => {
    const root = makeRoot();
    for (const name of ['requirements.md', 'design.md', 'feature.gherkin']) {
      write(root, `specs/feature-add-x/${name}`, '**Issue**: #42\n**Status**: Approved\n');
    }
    write(root, 'specs/feature-add-x/tasks.md', '**Issue**: #42\n**Status**: Approved\n\n### T001: Create code\n**File(s)**: Create src/a.ts\n');
    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'directory-rename');
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: args[0] === 'issue' && args[1] === 'view' ? '{"number":42,"labels":[]}' : '', stderr: '' };
    };

    const result = applyUpgrade(root, [item.id], run, { includeIssueDependencies: false });

    expect(fs.existsSync(path.join(root, 'specs/42-add-x/tasks.md'))).toBe(true);
    expect(result.results).toContainEqual(expect.objectContaining({
      id: 'spec-created-backfill',
      skipped: [42],
      labeled: [],
    }));
    expect(calls.some((call) => call.includes('--add-label'))).toBe(false);
  });

  it('does not backfill spec-created while publication findings remain unapproved', () => {
    const root = makeRoot();
    for (const name of ['requirements.md', 'design.md', 'feature.gherkin']) {
      write(root, `specs/42-add-x/${name}`, '**Issue**: #42\n**Status**: Approved\n');
    }
    write(root, 'specs/42-add-x/tasks.md', '**Issue**: #42\n**Status**: Approved\n\n### T001: Create code\n**File(s)**: Create src/a.ts\n');
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: args[0] === 'issue' && args[1] === 'view' ? '{"number":42,"labels":[]}' : '', stderr: '' };
    };

    const result = applyUpgrade(root, [], run, { includeIssueDependencies: false });

    expect(result.results).toContainEqual(expect.objectContaining({
      id: 'spec-created-backfill',
      skipped: [42],
      labeled: [],
    }));
    expect(calls.some((call) => call.includes('--add-label'))).toBe(false);
  });

  it('does not backfill spec-created when an approved rewrite leaves findings', () => {
    const root = makeRoot();
    for (const name of ['requirements.md', 'design.md', 'feature.gherkin']) {
      write(root, `specs/42-add-x/${name}`, '**Issue**: #42\n**Status**: Approved\n');
    }
    write(root, 'specs/42-add-x/tasks.md', [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Recoverable',
      '**File(s)**: Create `src/a.ts`',
      '### T002: Unrecoverable',
      '**File(s)**: Create src/b.ts',
      '',
    ].join('\n'));
    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: args[0] === 'issue' && args[1] === 'view' ? '{"number":42,"labels":[]}' : '', stderr: '' };
    };

    const result = applyUpgrade(root, [item.id], run, { includeIssueDependencies: false });

    expect(fs.readFileSync(path.join(root, 'specs/42-add-x/tasks.md'), 'utf8'))
      .toContain('**File(s)**: `src/a.ts`');
    expect(result.results).toContainEqual(expect.objectContaining({
      id: 'spec-created-backfill',
      skipped: [42],
      labeled: [],
    }));
    expect(calls.some((call) => call.includes('--add-label'))).toBe(false);
  });

  it('rejects an approved rewrite when tasks change after detection', () => {
    const root = makeRoot();
    write(root, 'specs/42-add-x/tasks.md', '### T001: Create code\n**File(s)**: Create `src/a.ts`\n');
    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');
    const changed = '### T001: Create code\n**File(s)**: Create `src/b.ts`\n';
    write(root, 'specs/42-add-x/tasks.md', changed);

    expect(() => applyUpgrade(root, [item.id], noNetworkRun, { includeIssueDependencies: false }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_files_plan_stale' }));
    expect(fs.readFileSync(path.join(root, 'specs/42-add-x/tasks.md'), 'utf8')).toBe(changed);
  });
});

describe('package-scoped publication-only upgrade (#388)', () => {
  it('repairs exactly four selected PathCast-shaped tokens and leaves other packages byte-identical', () => {
    const root = makeRoot();
    const selected = 'specs/108-coordinate-the-pathcast-to-miledar-prelaunch-rebrand';
    const selectedTasks = [
      '### T001: Inventory guardrails',
      '**Files**: `api/src/services/ip-guardrails/types.ts` (Modify)',
      '### T002: Bind outcomes',
      '**Files**: `api/src/scripts/reconcile-miledar-ip-guardrails.ts` (Create)',
      '### T003: Add BDD',
      '**Files**: `api/src/__tests__/features/miledar_ip_guardrails.feature` (Create)',
      '### T004: Reconcile evidence',
      '**Files**: `artifacts/issue-108/reconciliation.json` (Generate untracked)',
      '',
    ].join('\n');
    writeApprovedPackage(root, selected, selectedTasks, {
      'verification-report.md': 'selected evidence\r\npreserve\n',
    });
    writeApprovedPackage(
      root,
      'specs/110-unrelated-rewrite',
      '### T001: Other rewrite\n**Files**: `src/unrelated.ts`\n',
    );
    writeApprovedPackage(
      root,
      'specs/4-unrelated-finding',
      '### T001: Unsafe\n**File(s)**: Create src/unsafe.ts\n',
    );
    const beforeSelectedTasks = fs.readFileSync(path.join(root, selected, 'tasks.md'), 'utf8');
    const unrelatedPaths = [
      'specs/110-unrelated-rewrite/tasks.md',
      'specs/4-unrelated-finding/tasks.md',
      `${selected}/verification-report.md`,
    ];
    const before = new Map(unrelatedPaths.map((relativePath) => [
      relativePath,
      fs.readFileSync(path.join(root, relativePath)),
    ]));
    const fullPublication = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find(({ kind }) => kind === 'publication-files');
    expect(fullPublication.packages).toHaveLength(3);

    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    expect(report).toMatchObject({
      mode: 'publication-only',
      specDirs: [selected],
      writeCount: 4,
      findingCount: 0,
      item: {
        id: expect.stringMatching(/^publication-files:[0-9a-f]{64}$/),
        actionable: true,
        packages: [{ path: `${selected}/tasks.md` }],
      },
    });
    const outcome = applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] });
    expect(outcome.results).toEqual([
      expect.objectContaining({ id: report.item.id, status: 'applied', packages: [`${selected}/tasks.md`] }),
    ]);
    expect(outcome.results).not.toContainEqual(expect.objectContaining({ id: 'spec-created-backfill' }));
    const updated = fs.readFileSync(path.join(root, selected, 'tasks.md'), 'utf8');
    expect(updated.match(/^\*\*File\(s\)\*\*:.*$/gm)).toEqual([
      '**File(s)**: `api/src/services/ip-guardrails/types.ts` (Modify)',
      '**File(s)**: `api/src/scripts/reconcile-miledar-ip-guardrails.ts` (Create)',
      '**File(s)**: `api/src/__tests__/features/miledar_ip_guardrails.feature` (Create)',
      '**File(s)**: `artifacts/issue-108/reconciliation.json` (Generate untracked)',
    ]);
    expect(updated).not.toMatch(/^\*\*Files\*\*:/m);
    expect(updated.replaceAll('**File(s)**:', '**Files**:')).toBe(beforeSelectedTasks);
    for (const [relativePath, source] of before) {
      expect(fs.readFileSync(path.join(root, relativePath))).toEqual(source);
    }
    const repeated = detectPublicationUpgrade(root, { specDirs: [selected] });
    expect(repeated.writeCount).toBe(0);
    expect(repeated.item.actionable).toBe(false);
  });

  it('binds one complete deterministic inventory, rewrites, and findings into approval', () => {
    const root = makeRoot();
    const selected = 'specs/42-add-x';
    writeApprovedPackage(root, selected, [
      '### T001: Rewrite',
      '**Files**: `src/a.ts`',
      '### T002: Finding',
      '**File(s)**: Create src/y.ts',
      '',
    ].join('\n'), {
      'notes/evidence.txt': 'bound bytes\n',
      'a.txt': 'flat\n',
      'a/child': 'nested\n',
    });

    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    expect(report.specDirs).toEqual([selected]);
    expect(report.selectedInventory.map(({ path: filePath }) => filePath)).toEqual([
      `${selected}/a.txt`,
      `${selected}/a/child`,
      `${selected}/design.md`,
      `${selected}/feature.gherkin`,
      `${selected}/notes/evidence.txt`,
      `${selected}/requirements.md`,
      `${selected}/tasks.md`,
    ]);
    const tasksIdentity = report.selectedInventory
      .find(({ path: filePath }) => filePath === `${selected}/tasks.md`).identity;
    expect(report.item.packages[0].targetIdentity).toEqual(tasksIdentity);
    expect(report.writeCount).toBe(1);
    expect(report.findingCount).toBe(1);
  });

  it('rejects stale bytes, extra package content, different roots, selections, and reports before mutation', () => {
    const root = makeRoot();
    const selected = 'specs/42-add-x';
    const tasks = '### T001: Rewrite\n**Files**: `src/a.ts`\n';
    writeApprovedPackage(root, selected, tasks);
    writeApprovedPackage(root, 'specs/43-add-y', '### T001: Rewrite\n**Files**: `src/y.ts`\n');
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    const originalTasks = fs.readFileSync(path.join(root, selected, 'tasks.md'));

    write(root, `${selected}/notes.txt`, 'added after approval\n');
    expect(() => applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_files_plan_stale' }));
    expect(fs.readFileSync(path.join(root, selected, 'tasks.md'))).toEqual(originalTasks);
    fs.rmSync(path.join(root, selected, 'notes.txt'));

    write(root, `${selected}/requirements.md`, '**Issue**: #42\n**Status**: Approved\nchanged\n');
    expect(() => applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_files_plan_stale' }));
    expect(fs.readFileSync(path.join(root, selected, 'tasks.md'))).toEqual(originalTasks);

    writeApprovedPackage(root, selected, tasks);
    expect(() => applyPublicationUpgrade(root, report.item.id, { specDirs: ['specs/43-add-y'] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_files_plan_stale' }));
    const foreignId = `${report.item.id.slice(0, -1)}${report.item.id.endsWith('0') ? '1' : '0'}`;
    expect(() => applyPublicationUpgrade(root, foreignId, { specDirs: [selected] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_files_plan_stale' }));

    const otherRoot = makeRoot();
    writeApprovedPackage(otherRoot, selected, tasks);
    expect(() => applyPublicationUpgrade(otherRoot, report.item.id, { specDirs: [selected] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_files_plan_stale' }));
  });

  it('rejects invalid selected package authority with stable reason codes', () => {
    const root = makeRoot();
    writeApprovedPackage(root, 'specs/42-valid', '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    expect(() => detectPublicationUpgrade(root, { specDirs: [] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_spec_selection_required' }));
    expect(() => detectPublicationUpgrade(root, { specDirs: ['specs/42-valid', 'specs\\42-valid'] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_spec_selection_multiple' }));
    for (const invalid of ['/tmp/specs/42-valid', '../specs/42-valid', 'outside/42-valid', 'specs/42-missing']) {
      expect(() => detectPublicationUpgrade(root, { specDirs: [invalid] }))
        .toThrow(expect.objectContaining({
          reasonCode: invalid === 'specs/42-missing'
            ? 'publication_spec_missing'
            : 'publication_spec_selection_invalid',
        }));
    }

    write(root, 'specs/43-incomplete/tasks.md', '**Issue**: #43\n**Status**: Approved\n');
    expect(() => detectPublicationUpgrade(root, { specDirs: ['specs/43-incomplete'] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_spec_incomplete' }));
    writeApprovedPackage(root, 'specs/44-not-approved', '### T001: Valid\n**File(s)**: `src/a.ts`\n');
    write(root, 'specs/44-not-approved/design.md', '**Issue**: #44\n**Status**: Draft\n');
    expect(() => detectPublicationUpgrade(root, { specDirs: ['specs/44-not-approved'] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_spec_not_approved' }));
    writeApprovedPackage(root, 'specs/45-mismatch', '### T001: Valid\n**File(s)**: `src/a.ts`\n');
    write(root, 'specs/45-mismatch/requirements.md', '**Issue**: #46\n**Status**: Approved\n');
    expect(() => detectPublicationUpgrade(root, { specDirs: ['specs/45-mismatch'] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_spec_issue_invalid' }));
    const realPackage = path.join(root, 'specs', '42-valid');
    fs.symlinkSync(realPackage, path.join(root, 'specs', '46-symlink'), 'junction');
    expect(() => detectPublicationUpgrade(root, { specDirs: ['specs/46-symlink'] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_spec_symlink' }));

    const rootLink = `${root}-link`;
    fs.symlinkSync(root, rootLink, 'junction');
    temporaryRoots.push(rootLink);
    expect(() => detectPublicationUpgrade(rootLink, { specDirs: ['specs/42-valid'] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_root_symlink' }));

    const ancestorRoot = makeRoot();
    const nestedRoot = path.join(ancestorRoot, 'real-parent', 'repository');
    fs.mkdirSync(nestedRoot, { recursive: true });
    writeApprovedPackage(nestedRoot, 'specs/42-valid', '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const ancestorLink = path.join(ancestorRoot, 'linked-parent');
    fs.symlinkSync(path.join(ancestorRoot, 'real-parent'), ancestorLink, 'junction');
    expect(() => detectPublicationUpgrade(path.join(ancestorLink, 'repository'), {
      specDirs: ['specs/42-valid'],
    })).toThrow(expect.objectContaining({ reasonCode: 'publication_root_symlink' }));
    const lexicalLink = path.join(root, 'lexical-link');
    fs.symlinkSync(root, lexicalLink, 'junction');
    const lexicalTraversal = `${root}${path.sep}lexical-link${path.sep}..`;
    expect(() => detectPublicationUpgrade(lexicalTraversal, { specDirs: ['specs/42-valid'] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_root_symlink' }));
    const missingThenSymlink = `${ancestorRoot}${path.sep}missing${path.sep}..${path.sep}linked-parent${path.sep}repository`;
    expect(() => detectPublicationUpgrade(missingThenSymlink, { specDirs: ['specs/42-valid'] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_root_symlink' }));
  });


  it('revalidates complete selected inventory after staging and preserves targets on change', () => {
    const root = makeRoot();
    const selected = 'specs/42-final-inventory';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const tasksPath = path.join(root, selected, 'tasks.md');
    const before = fs.readFileSync(tasksPath);
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    const originalWrite = fs.writeFileSync.bind(fs);
    const originalOpen = fs.openSync.bind(fs);
    let injected = false;
    const spy = jest.spyOn(fs, 'openSync').mockImplementation((target, ...args) => {
      const descriptor = originalOpen(target, ...args);
      if (!injected && String(target).endsWith('.staged')) {
        injected = true;
        originalWrite(path.join(root, selected, 'late-file.bin'), Buffer.from([0xff]));
      }
      return descriptor;
    });
    try {
      expect(() => applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] }))
        .toThrow(expect.objectContaining({ reasonCode: 'publication_files_plan_stale' }));
    } finally {
      spy.mockRestore();
    }
    expect(fs.readFileSync(tasksPath)).toEqual(before);
  });

  it('rejects a same-byte target identity swap after staging', () => {
    const root = makeRoot();
    const selected = 'specs/42-final-identity';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const tasksPath = path.join(root, selected, 'tasks.md');
    const before = fs.readFileSync(tasksPath);
    const beforeIdentity = fs.lstatSync(tasksPath).ino;
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    const originalWrite = fs.writeFileSync.bind(fs);
    const originalOpen = fs.openSync.bind(fs);
    let injected = false;
    const spy = jest.spyOn(fs, 'openSync').mockImplementation((target, ...args) => {
      const descriptor = originalOpen(target, ...args);
      if (!injected && String(target).endsWith('.staged')) {
        injected = true;
        const replacement = path.join(root, 'same-bytes-replacement');
        originalWrite(replacement, before);
        fs.renameSync(replacement, tasksPath);
      }
      return descriptor;
    });
    try {
      expect(() => applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] }))
        .toThrow(expect.objectContaining({ reasonCode: 'publication_files_plan_stale' }));
    } finally {
      spy.mockRestore();
    }
    expect(fs.readFileSync(tasksPath)).toEqual(before);
    expect(fs.lstatSync(tasksPath).ino).not.toBe(beforeIdentity);
    expect(fs.existsSync(path.join(root, '.nmg-sdlc-publication.lock'))).toBe(false);
  });

  it.each(['replacement', 'byte mutation'])(
    'rejects staged %s before installing unapproved bytes',
    (mutation) => {
      const root = makeRoot();
      const selected = `specs/42-stage-${mutation.replace(' ', '-')}`;
      writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
      const tasksPath = path.join(root, selected, 'tasks.md');
      const before = fs.readFileSync(tasksPath);
      const beforeIdentity = fs.lstatSync(tasksPath).ino;
      const report = detectPublicationUpgrade(root, { specDirs: [selected] });
      const originalRead = fs.readFileSync.bind(fs);
      const originalWrite = fs.writeFileSync.bind(fs);
      let injected = false;
      let stagedPath;
      const spy = jest.spyOn(fs, 'readFileSync').mockImplementation((target, ...args) => {
        if (!injected && String(target).endsWith('.staged')) {
          injected = true;
          stagedPath = String(target);
          const malicious = Buffer.alloc(originalRead(target).length, 0x78);
          if (mutation === 'replacement') {
            fs.unlinkSync(target);
            originalWrite(target, malicious);
          } else {
            originalWrite(target, malicious);
          }
        }
        return originalRead(target, ...args);
      });
      let failure;
      try {
        applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] });
      } catch (error) {
        failure = error;
      } finally {
        spy.mockRestore();
      }
      expect(failure).toMatchObject({ reasonCode: 'publication_files_plan_stale' });
      expect(failure.applied ?? false).toBe(false);
      expect(fs.readFileSync(tasksPath)).toEqual(before);
      expect(fs.lstatSync(tasksPath).ino).toBe(beforeIdentity);
      if (mutation === 'replacement') {
        expect(fs.existsSync(stagedPath)).toBe(true);
        expect(fs.existsSync(path.join(root, '.nmg-sdlc-publication.lock'))).toBe(true);
      } else {
        expect(fs.existsSync(stagedPath)).toBe(false);
        expect(fs.existsSync(path.join(root, '.nmg-sdlc-publication.lock'))).toBe(false);
      }
    },
  );

  it('leaves the original target byte- and identity-equal when atomic rename fails', () => {
    const root = makeRoot();
    const selected = 'specs/42-rename-failure';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const tasksPath = path.join(root, selected, 'tasks.md');
    const before = fs.readFileSync(tasksPath);
    const beforeIdentity = fs.lstatSync(tasksPath).ino;
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    const originalRename = fs.renameSync.bind(fs);
    const spy = jest.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (String(source).endsWith('.staged')) {
        expect(fs.existsSync(tasksPath)).toBe(true);
        throw Object.assign(new Error('injected atomic rename failure'), { code: 'EACCES' });
      }
      return originalRename(source, target);
    });
    try {
      expect(() => applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] }))
        .toThrow(expect.objectContaining({
          reasonCode: 'publication_files_commit_failed',
          state: 'commit_failed',
          applied: false,
        }));
    } finally {
      spy.mockRestore();
    }
    expect(fs.readFileSync(tasksPath)).toEqual(before);
    expect(fs.lstatSync(tasksPath).ino).toBe(beforeIdentity);
    expect(fs.existsSync(path.join(root, '.nmg-sdlc-publication.lock'))).toBe(false);
  });

  it('does not overwrite or remove a pre-existing foreign lock file', () => {
    const root = makeRoot();
    const selected = 'specs/42-locked';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    const lockPath = path.join(root, '.nmg-sdlc-publication.lock');
    const foreign = Buffer.from('{"token":"another-owner"}\n');
    fs.writeFileSync(lockPath, foreign);
    expect(() => applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_mutation_locked' }));
    expect(fs.readFileSync(lockPath)).toEqual(foreign);
  });

  it('never follows or mutates a symlinked foreign lock target', () => {
    const root = makeRoot();
    const selected = 'specs/42-symlinked-lock';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    const lockPath = path.join(root, '.nmg-sdlc-publication.lock');
    const externalPath = path.join(root, 'foreign-lock-target');
    const foreign = Buffer.from('foreign lock target\n');
    fs.writeFileSync(externalPath, foreign);
    fs.symlinkSync(externalPath, lockPath);
    const originalOpen = fs.openSync.bind(fs);
    const lockOpens = [];
    const spy = jest.spyOn(fs, 'openSync').mockImplementation((target, ...args) => {
      if (target === lockPath) lockOpens.push(args[0]);
      return originalOpen(target, ...args);
    });
    try {
      expect(() => applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] }))
        .toThrow(expect.objectContaining({ reasonCode: 'publication_mutation_locked' }));
    } finally {
      spy.mockRestore();
    }
    expect(lockOpens).toHaveLength(1);
    expect(fs.lstatSync(lockPath).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(externalPath)).toEqual(foreign);
  });

  it.each([
    ['partial', (data) => data.subarray(0, Math.max(1, Math.floor(data.length / 2)))],
    ['wrong-byte', () => Buffer.from('foreign-partial-lock\n')],
  ])('retains a %s lock when owner writing fails before exact bytes exist', (_name, injectedBytes) => {
    const root = makeRoot();
    const selected = 'specs/42-owner-write-failure';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const tasksPath = path.join(root, selected, 'tasks.md');
    const before = fs.readFileSync(tasksPath);
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    const lockPath = path.join(root, '.nmg-sdlc-publication.lock');
    const originalWrite = fs.writeFileSync.bind(fs);
    let retained;
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation((target, data, ...args) => {
      if (typeof target === 'number' && String(data).startsWith('{"token":"')) {
        retained = injectedBytes(Buffer.from(data));
        originalWrite(target, retained, ...args);
        throw Object.assign(new Error('injected owner metadata failure'), { code: 'EIO' });
      }
      return originalWrite(target, data, ...args);
    });
    try {
      expect(() => applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] }))
        .toThrow(expect.objectContaining({
          reasonCode: 'publication_lock_setup_failed',
          state: 'lock_setup_failed',
          applied: false,
        }));
    } finally {
      spy.mockRestore();
    }
    expect(fs.readFileSync(tasksPath)).toEqual(before);
    expect(fs.readFileSync(lockPath)).toEqual(retained);
  });

  it('reports applied=true and retains the lock when post-commit unlink fails', () => {
    const root = makeRoot();
    const selected = 'specs/42-cleanup-failure';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const target = path.join(root, selected, 'tasks.md');
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    const lockPath = path.join(root, '.nmg-sdlc-publication.lock');
    const originalUnlink = fs.unlinkSync.bind(fs);
    const spy = jest.spyOn(fs, 'unlinkSync').mockImplementation((candidate, ...args) => {
      if (candidate === lockPath) {
        throw Object.assign(new Error('injected cleanup EACCES'), { code: 'EACCES' });
      }
      return originalUnlink(candidate, ...args);
    });
    let failure;
    try {
      applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] });
    } catch (error) {
      failure = error;
    } finally {
      spy.mockRestore();
    }
    expect(failure).toMatchObject({
      reasonCode: 'publication_files_cleanup_failed',
      state: 'applied_cleanup_failed',
      applied: true,
      retainPublicationLock: true,
    });
    expect(fs.readFileSync(target, 'utf8')).toContain('**File(s)**: `src/a.ts`');
    expect(JSON.parse(fs.readFileSync(lockPath, 'utf8')))
      .toEqual(expect.objectContaining({ token: failure.transactionId }));
  });

  it('performs no writes or deletes after same-token foreign lock replacement', () => {
    const root = makeRoot();
    const selected = 'specs/42-foreign-owner-replacement';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const target = path.join(root, selected, 'tasks.md');
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    const lockPath = path.join(root, '.nmg-sdlc-publication.lock');
    const originalWrite = fs.writeFileSync.bind(fs);
    const originalRename = fs.renameSync.bind(fs);
    const originalUnlink = fs.unlinkSync.bind(fs);
    let replaced = false;
    let writesAfterReplacement = 0;
    let deletesAfterReplacement = 0;
    let foreignLock;
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation((...args) => {
      if (replaced) writesAfterReplacement += 1;
      return originalWrite(...args);
    });
    const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation((...args) => {
      if (replaced) deletesAfterReplacement += 1;
      return originalUnlink(...args);
    });
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      const result = originalRename(source, destination);
      if (!replaced && String(source).endsWith('.staged')) {
        foreignLock = fs.readFileSync(lockPath);
        originalUnlink(lockPath);
        originalWrite(lockPath, foreignLock);
        replaced = true;
      }
      return result;
    });
    let failure;
    try {
      applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] });
    } catch (error) {
      failure = error;
    } finally {
      renameSpy.mockRestore();
      unlinkSpy.mockRestore();
      writeSpy.mockRestore();
    }
    expect(failure).toMatchObject({
      reasonCode: 'publication_files_cleanup_failed',
      state: 'applied_cleanup_failed',
      applied: true,
    });
    expect(failure.cleanupError).toContain('ownership changed');
    expect(writesAfterReplacement).toBe(0);
    expect(deletesAfterReplacement).toBe(0);
    expect(fs.readFileSync(lockPath)).toEqual(foreignLock);
    expect(fs.readFileSync(target, 'utf8')).toContain('**File(s)**: `src/a.ts`');
  });

  it('sorts the complete recursive inventory globally with a locale-independent comparator', () => {
    const root = makeRoot();
    const selected = 'specs/42-inventory-order';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n', {
      'a.txt': 'flat\n',
      'a/child': 'nested\n',
    });
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    expect(report.selections[0].files.map((file) => file.path)).toEqual([
      `${selected}/a.txt`,
      `${selected}/a/child`,
      `${selected}/design.md`,
      `${selected}/feature.gherkin`,
      `${selected}/requirements.md`,
      `${selected}/tasks.md`,
    ]);
  });

  it('compares issue digits exactly beyond Number safe-integer precision', () => {
    const root = makeRoot();
    const selected = 'specs/9007199254740993-large-issue';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    write(
      root,
      `${selected}/requirements.md`,
      '# Requirements\n\n**Issue**: #9007199254740992\n**Status**: Approved\n',
    );
    expect(() => detectPublicationUpgrade(root, { specDirs: [selected] }))
      .toThrow(expect.objectContaining({ reasonCode: 'publication_spec_issue_invalid' }));
  });

  it('keeps duplicate recoverable declarations byte-identical as a blocking finding', () => {
    const root = makeRoot();
    const selected = 'specs/42-duplicate-declarations';
    writeApprovedPackage(root, selected, [
      '### T001: Duplicate',
      '**Files**: `src/a.ts`',
      '**Files**: `src/b.ts`',
      '',
    ].join('\n'));
    const tasksPath = path.join(root, selected, 'tasks.md');
    const before = fs.readFileSync(tasksPath);
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    expect(report.writeCount).toBe(0);
    expect(report.findingCount).toBe(1);
    expect(report.item.packages).toEqual([
      expect.objectContaining({
        rewrites: [],
        findings: [expect.objectContaining({ taskId: 'T001' })],
      }),
    ]);
    const outcome = applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] });
    expect(outcome.results).toEqual([
      { id: report.item.id, status: 'already-current', packages: [] },
    ]);
    expect(fs.readFileSync(tasksPath)).toEqual(before);
  });

  it('preserves invalid UTF-8 and every byte except four ASCII label-token rewrites', () => {
    const root = makeRoot();
    const selected = 'specs/42-byte-preservation';
    const tasks = [
      '### T001: First',
      '**Files**: `src/a.ts`',
      '### T002: Second',
      '**Files**: `src/b.ts`',
      '### T003: Third',
      '**Files**: `src/c.ts`',
      '### T004: Fourth',
      '**Files**: `src/d.ts`',
      '',
    ].join('\r\n');
    writeApprovedPackage(root, selected, tasks);
    const tasksPath = path.join(root, selected, 'tasks.md');
    const initial = fs.readFileSync(tasksPath);
    const marker = Buffer.from('**Files**: `src/a.ts`\r\n');
    const insertion = initial.indexOf(marker) + marker.length - 2;
    const before = Buffer.concat([initial.subarray(0, insertion), Buffer.from([0xff]), initial.subarray(insertion)]);
    fs.writeFileSync(tasksPath, before);
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });

    applyPublicationUpgrade(root, report.item.id, { specDirs: [selected] });

    const after = fs.readFileSync(tasksPath);
    const expected = Buffer.from(
      before.toString('latin1').replaceAll('**Files**:', '**File(s)**:'),
      'latin1',
    );
    expect(after).toEqual(expected);
    expect(after.filter((byte) => byte === 0xff)).toHaveLength(1);
    expect(report.writeCount).toBe(4);
  });

  it('prints only exact single-spec publication usage', () => {
    const result = spawnSync(process.execPath, [upgradeScript], {
      encoding: 'utf8',
      shell: false,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      'detect-publication --root <dir> --spec specs/N-slug',
    );
    expect(result.stderr).toContain(
      'apply-publication --root <dir> --spec specs/N-slug --approve publication-files:<digest>',
    );
    expect(result.stderr).not.toContain('[--spec');
    expect(result.stderr).not.toContain('specs/N-slug ...');
  });

  it.each([
    ['separate approval flags', (id) => ['--approve', id, '--approve', id], 'publication_files_approval_invalid'],
    ['comma-separated approvals', (id) => ['--approve', `${id},${id}`], 'publication_files_approval_invalid'],
    ['empty then valid approval flags', (id) => ['--approve', '', '--approve', id], 'publication_files_approval_invalid'],
  ])('rejects %s without applying any approval', (_name, approvalArgs, reasonCode) => {
    const root = makeRoot();
    const selected = 'specs/42-cli-approval';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    const tasksPath = path.join(root, selected, 'tasks.md');
    const before = fs.readFileSync(tasksPath);

    const result = spawnSync(process.execPath, [
      upgradeScript,
      'apply-publication',
      '--root',
      root,
      '--spec',
      selected,
      ...approvalArgs(report.item.id),
    ], {
      encoding: 'utf8',
      shell: false,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(reasonCode);
    expect(fs.readFileSync(tasksPath)).toEqual(before);
  });

  it('rejects an empty spec option even when followed by a valid selection', () => {
    const root = makeRoot();
    const selected = 'specs/42-cli-selection';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const tasksPath = path.join(root, selected, 'tasks.md');
    const before = fs.readFileSync(tasksPath);

    const result = spawnSync(process.execPath, [
      upgradeScript,
      'detect-publication',
      '--root',
      root,
      '--spec',
      '',
      '--spec',
      selected,
    ], {
      encoding: 'utf8',
      shell: false,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('publication_cli_invalid');
    expect(fs.readFileSync(tasksPath)).toEqual(before);
  });

  it.each([
    ['unknown option', ['--unknown', 'value']],
    ['unexpected positional', ['unexpected']],
    ['duplicate singleton option', ['--root', 'ROOT']],
    ['missing option value', ['--root']],
    ['option-like value', ['--spec', '--unknown']],
    ['extra legacy command token', ['detect']],
    ['extra publication command token', ['detect-publication']],
    ['duplicate spec option', ['--spec', 'SELECTED']],
  ])('rejects an ambiguous %s before process-level mutation', (_name, extraArgs) => {
    const root = makeRoot();
    const selected = 'specs/42-cli-ambiguous';
    writeApprovedPackage(root, selected, '### T001: Rewrite\n**Files**: `src/a.ts`\n');
    const report = detectPublicationUpgrade(root, { specDirs: [selected] });
    const tasksPath = path.join(root, selected, 'tasks.md');
    const before = fs.readFileSync(tasksPath);
    const args = extraArgs.map((value) => (
      value === 'ROOT' ? root : value === 'SELECTED' ? selected : value
    ));
    const result = spawnSync(process.execPath, [
      upgradeScript,
      'apply-publication',
      '--root',
      root,
      '--spec',
      selected,
      '--approve',
      report.item.id,
      ...args,
    ], {
      encoding: 'utf8',
      shell: false,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('publication_cli_invalid');
    expect(fs.readFileSync(tasksPath)).toEqual(before);
  });

  it('preserves legacy parsing of ignored forms and command-named option values', () => {
    const root = makeRoot();
    const fakeBin = path.join(root, 'bin');
    const fakeGh = path.join(fakeBin, 'gh');
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(fakeGh, [
      '#!/bin/sh',
      'if [ "$1" = "repo" ]; then',
      '  printf \'{\"nameWithOwner\":\"owner/repository\"}\\n\'',
      'else',
      '  printf "[[]]\\n"',
      'fi',
      '',
    ].join('\n'));
    fs.chmodSync(fakeGh, 0o755);
    const cases = [
      ['detect command-named approval', [
        'ignored-positional',
        'detect',
        '--unknown',
        'ignored-value',
        '--approve',
        'apply-publication',
        '--root',
        root,
      ]],
      ['apply command-named approval', [
        'apply',
        '--approve',
        'detect-publication',
        '--root',
        root,
      ]],
    ];
    for (const [name, args] of cases) {
      const result = spawnSync(process.execPath, [upgradeScript, ...args], {
        encoding: 'utf8',
        shell: false,
        env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` },
      });
      expect({ name, status: result.status, stderr: result.stderr }).toEqual({
        name,
        status: 0,
        stderr: '',
      });
      expect(JSON.parse(result.stdout).root).toBe(root);
    }
  });
});

describe('managed steering migration', () => {
  it('uses the shared writer and removes legacy authority only after validation', () => {
    const root = makeRoot();
    write(root, 'steering/product.md', '# Product\n');
    write(root, 'steering/tech.md', '# Tech\n');
    write(root, 'steering/structure.md', '# Structure\n');
    write(root, 'steering/retrospective.md', '# Keep\n');
    write(root, 'steering/unknown.txt', 'keep\n');

    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find((candidate) => candidate.kind === 'steering-runtime');
    expect(item).toEqual(expect.objectContaining({ actionable: true, plan: expect.objectContaining({ mode: 'migrate' }) }));

    const result = applyUpgrade(root, [item.id], noNetworkRun, { includeIssueDependencies: false });
    expect(result.applied).toContainEqual(expect.objectContaining({ id: item.id, status: 'applied' }));
    expect(fs.existsSync(path.join(root, 'steering', 'manifest.json'))).toBe(true);
    const migratedManifest = JSON.parse(fs.readFileSync(path.join(root, 'steering', 'manifest.json'), 'utf8'));
    expect(migratedManifest.snippets.every((snippet) => !Object.hasOwn(snippet, 'byteBound'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'steering', 'product.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'steering', 'tech.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'steering', 'structure.md'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'steering', 'snippets', 'project-tech.md'), 'utf8')).toBe('# Tech\n');
    expect(fs.readFileSync(path.join(root, 'steering', 'retrospective.md'), 'utf8')).toBe('# Keep\n');
    expect(fs.readFileSync(path.join(root, 'steering', 'unknown.txt'), 'utf8')).toBe('keep\n');
  });

  it('updates an existing manifest without discarding runtime registrations', async () => {
    const root = makeRoot();
    await applySteeringPlan(root, createInitializePlan(root, {
      snippets: [{
        id: 'project.custom',
        path: 'steering/snippets/project-custom.md',
        consumers: ['worker:implement'],
        slot: 'body',
        order: 600,
        content: 'Keep custom guidance.\n',
      }],
    }));
    write(root, 'steering/extensions/custom.mjs', [
      'export const extension = Object.freeze({',
      '  schemaVersion: 1,',
      '  id: "project.custom",',
      '  providers: Object.freeze({ "project.custom-check": async (request) => ({ schemaVersion: 1, status: "passed", summary: "ok", identity: request.identity, evidence: [{ kind: "custom", summary: "ok", artifact: null }] }) }),',
      '});',
      '',
    ].join('\n'));
    const manifestPath = path.join(root, 'steering', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.extensions.push({ id: 'project.custom', path: 'steering/extensions/custom.mjs', providers: ['project.custom-check'] });
    manifest.validations.push({ id: 'custom.check', provider: 'project.custom-check', required: true, when: { kind: 'always' }, config: {} });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    write(root, 'steering/product.md', '# Migrated Product\n');

    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find((candidate) => candidate.kind === 'steering-runtime');
    expect(item.plan.mode).toBe('update');
    const result = applyUpgrade(root, [item.id], noNetworkRun, { includeIssueDependencies: false });
    expect(result.applied).toContainEqual(expect.objectContaining({ id: item.id, status: 'applied' }));

    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(updated.snippets.map(({ id }) => id)).toEqual(['project.custom', 'project.product']);
    expect(updated.snippets.find(({ id }) => id === 'project.custom')).not.toHaveProperty('byteBound');
    expect(updated.extensions).toEqual(manifest.extensions);
    expect(updated.validations).toEqual(manifest.validations);
    expect(fs.readFileSync(path.join(root, 'steering', 'snippets', 'project-custom.md'), 'utf8')).toBe('Keep custom guidance.\n');
    expect(fs.existsSync(path.join(root, 'steering', 'product.md'))).toBe(false);
  });

  it('rejects migration byteBound input before producing actions or mutating steering', async () => {
    const root = makeRoot();
    await applySteeringPlan(root, createInitializePlan(root, {
      snippets: [{
        id: 'project.custom',
        path: 'steering/snippets/project-custom.md',
        consumers: ['worker:implement'],
        slot: 'body',
        order: 600,
        content: 'Keep custom guidance.\n',
      }],
    }));
    const manifestPath = path.join(root, 'steering', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.snippets[0].byteBound = 1;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    write(root, 'steering/product.md', '# Migrated Product\n');
    const originalManifest = fs.readFileSync(manifestPath, 'utf8');
    const originalLegacy = fs.readFileSync(path.join(root, 'steering', 'product.md'), 'utf8');
    let producedReport;

    expect(() => {
      producedReport = detectUpgrade(root, {
        run: noNetworkRun,
        includeIssueDependencies: false,
      });
    }).toThrow('steering_manifest_unknown_key');

    expect(producedReport).toBeUndefined();
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(originalManifest);
    expect(fs.readFileSync(path.join(root, 'steering', 'product.md'), 'utf8')).toBe(originalLegacy);
    expect(fs.existsSync(path.join(root, 'steering', 'snippets', 'project-product.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.omp', 'sdlc'))).toBe(false);
  });
});
