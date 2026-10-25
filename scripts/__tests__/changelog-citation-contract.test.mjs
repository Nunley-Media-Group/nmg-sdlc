import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

const citationRule = /end with the exact citation `\(#N\)`/;

// #514 AC1-AC4: each hand-written [Unreleased] bullet for issue #N must end with the exact citation (#N).
describe('hand-written CHANGELOG entries cite their issue (#514)', () => {
  test.each([
    'workflows/write-spec/templates/tasks.md',
    'references/versioning.md',
    'steering/snippets/project-tech.md',
  ])('%s states the end-with-(#N) citation rule', (relative) => {
    const text = read(relative);
    expect(text).toMatch(citationRule);
    expect(text).toContain('[Unreleased]');
  });

  test('references/versioning.md documents the generated-line roll', () => {
    const text = read('references/versioning.md');
    expect(text).toContain('`- <issue title> (#N)`');
    expect(text).toContain('without adding');
    expect(text).toContain('otherwise it adds the generated line');
  });

  test('CLAUDE.md states the rule inside the Commit & CHANGELOG Conventions section', () => {
    const text = read('CLAUDE.md');
    const heading = '## Commit & CHANGELOG Conventions';
    const start = text.indexOf(heading);
    expect(start).toBeGreaterThanOrEqual(0);
    const rest = text.slice(start + heading.length);
    const next = rest.search(/^## /m);
    const section = next < 0 ? rest : rest.slice(0, next);
    expect(section).toMatch(citationRule);
  });
});

// #514 AC5: the citation subsection must not change the Versioning mirror rows that delivery parses.
describe('version mirror discovery is preserved (#514)', () => {
  test('the ## Versioning section declares exactly VERSION, package.json, and plugin.json', () => {
    const text = read('steering/snippets/project-tech.md');
    const heading = text.match(/^## Versioning\s*$/m);
    expect(heading).not.toBeNull();
    const body = text.slice(heading.index + heading[0].length);
    const nextHeading = body.search(/^#{2,3}\s/m);
    const section = nextHeading < 0 ? body : body.slice(0, nextHeading);
    const rows = section
      .split('\n')
      .map((line) => line.match(/^\|\s*`([^`]+)`\s*\|\s*(?:`([^`]+)`|([^|]+?))\s*\|/))
      .filter(Boolean);
    expect(rows.map((row) => row[1].trim())).toEqual([
      'VERSION',
      'package.json',
      '.claude-plugin/plugin.json',
    ]);
    expect(rows[1][2]).toBe('version');
    expect(rows[2][2]).toBe('version');
  });
});
