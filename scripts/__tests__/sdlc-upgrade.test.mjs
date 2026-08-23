import { describe, expect, it, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyUpgrade, detectUpgrade } from '../sdlc-upgrade.mjs';
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


    const ids = detectUpgrade(root).items.filter((item) => item.kind === 'epic-flatten').map((item) => item.id);
    applyUpgrade(root, ids, noNetworkRun);
    expect(fs.existsSync(path.join(root, 'specs/11-bar/requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'specs/epic-foo'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'specs/feature-bar/epic-link.json'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'specs/11-bar/requirements.md'), 'utf8')).toContain('**Issue**: #11');
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
    write(root, 'specs/feature-baz/feature.gherkin', 'Feature: Baz\n');
    write(root, 'specs/feature-baz/issue-scope.json', JSON.stringify({
      schemaVersion: 1,
      issues: {
        '2': {
          owned: { acceptanceCriteria: ['AC1'], functionalRequirements: [], tasks: [], scenarios: [] },
          adopted: { acceptanceCriteria: [], functionalRequirements: [], tasks: [], scenarios: [] },
          regression: { acceptanceCriteria: [], functionalRequirements: [], scenarios: [] },
        },
        '6': {
          owned: { acceptanceCriteria: ['AC2'], functionalRequirements: [], tasks: [], scenarios: [] },
          adopted: { acceptanceCriteria: [], functionalRequirements: [], tasks: [], scenarios: [] },
          regression: { acceptanceCriteria: [], functionalRequirements: [], scenarios: [] },
        },
      },
    }, null, 2));

    const ids = detectUpgrade(root).items.filter((item) => item.kind === 'cumulative-split').map((item) => item.id);
    applyUpgrade(root, ids, noNetworkRun);

    expect(fs.existsSync(path.join(root, 'specs/2-baz/requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'specs/6-baz/requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'specs/feature-baz/issue-scope.json'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'specs/2-baz/requirements.md'), 'utf8')).toContain('**Issue**: #2');
    expect(fs.readFileSync(path.join(root, 'specs/6-baz/requirements.md'), 'utf8')).toContain('**Issue**: #6');
    expect(fs.readFileSync(path.join(root, 'specs/2-baz/requirements.md'), 'utf8')).not.toMatch(/\*\*Issues\*\*/);
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
