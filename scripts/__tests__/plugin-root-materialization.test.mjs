import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  materializePluginRootCommand,
  materializePluginRootPath,
  materializePluginRootToolInput,
} from '../../src/host-events.mjs';

const root = '/Volumes/Fast Brick/plugins/nmg-sdlc';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const itPosix = process.platform === 'win32' ? it.skip : it;

describe('@SCN001 single-quoted operands resolve', () => {
  it.each([
    ["ls '<plugin-root>/workflows'", "ls '/Volumes/Fast Brick/plugins/nmg-sdlc/workflows'"],
    ["cat '${NMG_SDLC_PLUGIN_ROOT}/references/a.md'", "cat '/Volumes/Fast Brick/plugins/nmg-sdlc/references/a.md'"],
  ])('rewrites %s inside its single quotes', (command, expected) => {
    expect(materializePluginRootCommand(command, root)).toBe(expected);
  });
});

describe('@SCN002 glob operands still expand', () => {
  it.each([
    ['ls <plugin-root>/workflows/draft-issue/references/*.md', 'ls "/Volumes/Fast Brick/plugins/nmg-sdlc"/workflows/draft-issue/references/*.md'],
    ['ls <plugin-root>/workflows/?.md', 'ls "/Volumes/Fast Brick/plugins/nmg-sdlc"/workflows/?.md'],
    ['ls <plugin-root>/workflows/[ab]*.md', 'ls "/Volumes/Fast Brick/plugins/nmg-sdlc"/workflows/[ab]*.md'],
  ])('keeps the glob characters of %s unquoted', (command, expected) => {
    expect(materializePluginRootCommand(command, root)).toBe(expected);
  });

  itPosix('expands the glob to real files under a plugin root that contains spaces', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin root '));
    try {
      const references = path.join(base, 'workflows', 'draft-issue', 'references');
      fs.mkdirSync(references, { recursive: true });
      fs.writeFileSync(path.join(references, 'a.md'), '');
      fs.writeFileSync(path.join(references, 'b.md'), '');
      const command = materializePluginRootCommand('ls <plugin-root>/workflows/draft-issue/references/*.md', base);
      const listed = spawnSync('/bin/sh', ['-c', command], { cwd: base, encoding: 'utf8' });
      expect(listed.status).toBe(0);
      expect(listed.stdout.trim().split('\n').map((file) => path.basename(file))).toEqual(['a.md', 'b.md']);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('@SCN003 Glob and Grep paths resolve', () => {
  it.each([
    ['Grep', { tool: 'Grep', path: '<plugin-root>/workflows', pattern: 'x' }],
    ['Glob', { tool: 'Glob', path: '<plugin-root>/workflows', pattern: '**/*.md' }],
  ])('gives a %s call the installed plugin path', (_tool, input) => {
    expect(materializePluginRootToolInput(input, root)).toEqual({ ...input, path: `${root}/workflows` });
  });

  it('returns other Glob and Grep inputs and other tools unchanged', () => {
    const grep = { tool: 'Grep', path: '/abs/workflows', pattern: 'x' };
    const bash = { tool: 'Bash', path: '<plugin-root>/workflows', command: 'ls' };
    expect(materializePluginRootToolInput(grep, root)).toBe(grep);
    expect(materializePluginRootToolInput(bash, root)).toBe(bash);
  });

  it('is applied by a tool.call handler of the hooks module', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'hooks', 'register.ts'), 'utf8');
    const call = 'materializePluginRootToolInput(e, $.plugin.root)';
    const index = source.indexOf(call);
    expect(index).toBeGreaterThan(-1);
    const handler = source.lastIndexOf("on('tool.call'", index);
    expect(handler).toBeGreaterThan(-1);
    expect(source.slice(handler + 1, index)).not.toMatch(/\bon\('/);
  });
});

describe('@SCN004 existing rewrites are preserved', () => {
  it.each([
    ['node "<plugin-root>/scripts/sdlc-status.mjs" --json', 'node "/Volumes/Fast Brick/plugins/nmg-sdlc/scripts/sdlc-status.mjs" --json'],
    ['node <plugin-root>/scripts/sdlc-status.mjs --json', 'node "/Volumes/Fast Brick/plugins/nmg-sdlc/scripts/sdlc-status.mjs" --json'],
    ['node "${NMG_SDLC_PLUGIN_ROOT}/scripts/exercise-claude.mjs" --cwd .', 'node "/Volumes/Fast Brick/plugins/nmg-sdlc/scripts/exercise-claude.mjs" --cwd .'],
    ['ls $NMG_SDLC_PLUGIN_ROOT/workflows', 'ls "/Volumes/Fast Brick/plugins/nmg-sdlc/workflows"'],
    ['cat <plugin-root>/references/claude-code-tooling.md', 'cat "/Volumes/Fast Brick/plugins/nmg-sdlc/references/claude-code-tooling.md"'],
  ])('rewrites the command %s as before', (command, expected) => {
    expect(materializePluginRootCommand(command, root)).toBe(expected);
  });

  it('rewrites a leading placeholder in a Read path as before', () => {
    expect(materializePluginRootPath('<plugin-root>/references/a.md', root)).toBe(`${root}/references/a.md`);
  });
});
