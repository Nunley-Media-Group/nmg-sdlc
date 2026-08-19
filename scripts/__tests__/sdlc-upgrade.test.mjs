import { describe, expect, it, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyUpgrade, detectUpgrade } from '../sdlc-upgrade.mjs';
const temporaryRoots = [];

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
    applyUpgrade(root, ids);
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
    applyUpgrade(root, ids);

    expect(fs.existsSync(path.join(root, 'specs/2-baz/requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'specs/6-baz/requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'specs/feature-baz/issue-scope.json'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'specs/2-baz/requirements.md'), 'utf8')).toContain('**Issue**: #2');
    expect(fs.readFileSync(path.join(root, 'specs/6-baz/requirements.md'), 'utf8')).toContain('**Issue**: #6');
    expect(fs.readFileSync(path.join(root, 'specs/2-baz/requirements.md'), 'utf8')).not.toMatch(/\*\*Issues\*\*/);
  });
});
