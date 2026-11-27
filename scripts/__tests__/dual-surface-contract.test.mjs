import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { packageRoot } from '../../src/sdlc-workflows.mjs';

// #638 AC9, FR6 and FR7: CLAUDE.md and the product steering state the Desktop-and-CLI rule. These tests fail when any of
// those statements is removed, so the rule cannot silently drift out of the project's instructions.
const read = (file) => fs.readFileSync(path.join(packageRoot, file), 'utf8');

// The body of a level-2 section: from its heading to the next level-2 heading, or to the end of the file.
function section(markdown, heading) {
  const marker = `\n## ${heading}\n`;
  const start = markdown.indexOf(marker);
  if (start < 0) return '';
  const body = markdown.slice(start + marker.length);
  const next = body.search(/\n## /);
  return next < 0 ? body : body.slice(0, next);
}

// The table rows whose first cell is the given name.
const rows = (markdown, name) => markdown.split(/\r?\n/).filter((line) => line.startsWith(`| ${name} |`));

describe('@SCN009 the Desktop-and-CLI rule is stated in project instructions and steering (#638 AC9)', () => {
  it('CLAUDE.md has a Desktop and CLI section that states both surfaces, the richer Desktop UI, and the CLI fallback', () => {
    const body = section(read('CLAUDE.md'), 'Desktop and CLI');
    expect(body).toContain('nmg-sdlc must work in both Claude Desktop and the Claude Code CLI');
    expect(body).toContain('Desktop may offer richer UI than the CLI');
    expect(body).toContain('every behavior must degrade gracefully on the CLI');
  });

  it('keeps the Desktop and CLI section outside the managed spec-context section', () => {
    const claude = read('CLAUDE.md');
    expect(claude.indexOf('\n## Desktop and CLI\n')).toBeGreaterThan(-1);
    expect(claude.indexOf('\n## Desktop and CLI\n')).toBeLessThan(claude.indexOf('\n## nmg-sdlc Spec Context\n'));
  });

  it('gives the Product Principles table a Desktop and CLI row', () => {
    const principles = section(read('steering/snippets/project-product.md'), 'Product Principles');
    const matching = rows(principles, 'Desktop and CLI');
    expect(matching).toHaveLength(1);
    expect(matching[0]).toContain('Every command works in Claude Desktop and the CLI');
    expect(matching[0]).toContain('the CLI always gets a graceful fallback with the same outcome');
  });

  it('gives the Intent Verification table a Desktop and CLI row that names the hooks-module surface matrix', () => {
    const intent = section(read('steering/snippets/project-product.md'), 'Intent Verification');
    const matching = rows(intent, 'Desktop and CLI');
    expect(matching).toHaveLength(1);
    expect(matching[0]).toContain('Every hooks-module command reaches the same outcome on terminal-only and Desktop surface rosters');
    expect(matching[0]).toContain('hooks/register.test.ts');
  });

  it('lists Claude Desktop beside the CLI for the primary user', () => {
    expect(section(read('steering/snippets/project-product.md'), 'Target Users'))
      .toContain('Uses Claude Code daily, in the CLI or Claude Desktop');
  });
});

// #638 AC8 / FR9: the hooks module shows UI only through `$.ui.toast` and `$.ui.log`, which every surface renders. A static
// scan keeps any other `$.ui` member, which needs a roster-aware fallback, from landing without one. The hooks test kit
// forbids Node built-ins in its own files, so the scan runs here.
describe('@SCN008 the hooks module calls no $.ui member other than toast and log (#638 AC8)', () => {
  it('finds only toast and log among the $.ui members the hooks module calls', () => {
    const members = new Set([...read('hooks/register.ts').matchAll(/\$\.ui\.(\w+)/g)].map((match) => match[1]));
    expect(members.size).toBeGreaterThan(0);
    expect([...members].filter((member) => member !== 'toast' && member !== 'log')).toEqual([]);
  });
});
