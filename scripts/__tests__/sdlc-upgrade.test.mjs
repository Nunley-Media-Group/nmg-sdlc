import { describe, expect, it, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyIssueDependencyUpgrade,
  applyUpgrade,
  detectIssueDependencyUpgrade,
  detectUpgrade,
} from '../sdlc-upgrade.mjs';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
const temporaryRoots = [];
const noNetworkRun = () => ({ status: 1, stdout: '', stderr: 'network disabled in test' });

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-upgrade-'));
  temporaryRoots.push(root);
  return root;
}

function write(root, relativePath, source) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
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
    write(root, 'specs/feature-baz/tasks.md', '# Tasks\n\n**Issues**: #2, #6\n');
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
          owned: { acceptanceCriteria: ['AC1'], functionalRequirements: [], tasks: [], scenarios: ['SCN1'] },
          adopted: { acceptanceCriteria: [], functionalRequirements: [], tasks: [], scenarios: [] },
          regression: { acceptanceCriteria: [], functionalRequirements: [], scenarios: [] },
        },
        '6': {
          owned: { acceptanceCriteria: ['AC2'], functionalRequirements: [], tasks: [], scenarios: ['SCN2'] },
          adopted: { acceptanceCriteria: [], functionalRequirements: [], tasks: [], scenarios: [] },
          regression: { acceptanceCriteria: [], functionalRequirements: [], scenarios: [] },
        },
      },
    }, null, 2));

    const ids = detectUpgrade(root).items
      .filter((item) => ['cumulative-split', 'directory-rename'].includes(item.kind))
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
        byteBound: 1024,
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
    manifest.validations.push({ id: 'custom.check', provider: 'project.custom-check', required: true, when: { kind: 'always' }, timeoutMs: 1000, config: {} });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    write(root, 'steering/product.md', '# Migrated Product\n');

    const item = detectUpgrade(root, { run: noNetworkRun, includeIssueDependencies: false })
      .items.find((candidate) => candidate.kind === 'steering-runtime');
    expect(item.plan.mode).toBe('update');
    const result = applyUpgrade(root, [item.id], noNetworkRun, { includeIssueDependencies: false });
    expect(result.applied).toContainEqual(expect.objectContaining({ id: item.id, status: 'applied' }));

    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(updated.snippets.map(({ id }) => id)).toEqual(['project.custom', 'project.product']);
    expect(updated.extensions).toEqual(manifest.extensions);
    expect(updated.validations).toEqual(manifest.validations);
    expect(fs.readFileSync(path.join(root, 'steering', 'snippets', 'project-custom.md'), 'utf8')).toBe('Keep custom guidance.\n');
    expect(fs.existsSync(path.join(root, 'steering', 'product.md'))).toBe(false);
  });
});
