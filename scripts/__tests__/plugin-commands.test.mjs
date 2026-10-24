import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  AUTOMATED_COMMANDS,
  DIRECT_COMMANDS,
  INTERACTIVE_COMMANDS,
  renderAutomatedCommandMarkdown,
} from '../../src/sdlc-commands.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const claudeAvailable = spawnSync('claude', ['--version'], { encoding: 'utf8' }).status === 0;

describe('Claude Code plugin commands', () => {
  it('declares only sdlc-prefixed public commands', () => {
    expect(INTERACTIVE_COMMANDS.map(([name]) => name)).toEqual([
      'sdlc-draft-issue', 'sdlc-write-spec', 'sdlc-onboard-project',
      'sdlc-upgrade-project', 'sdlc-steering', 'sdlc-run-retro', 'sdlc-execute',
    ]);
    expect(AUTOMATED_COMMANDS.map(([name]) => name)).toEqual([
      'sdlc-status', 'sdlc-verify-code', 'sdlc-open-pr',
    ]);
    expect(DIRECT_COMMANDS).toEqual(['sdlc-execute']);
  });

  it('serves interactive commands from the hooks module and automated ones from command files', () => {
    const hooks = JSON.parse(read('hooks/hooks.json'));
    expect(hooks).toEqual({ modules: ['./register.ts'] });
    const source = read('hooks/register.ts');
    expect(source).toContain("from '../src/host-events.mjs'");
    expect(source).toContain('for (const [name, , description] of INTERACTIVE_COMMANDS)');
    expect(source).toContain("$.command.run({ command: 'plan', args: '' })");
    expect(source).toContain('await $.prompt.submit({ text, asUser: true })');
    expect(source).toContain("'sdlc-execute': '[--retain-worker] [#N ...]'");
    expect(source).toContain('if (DIRECT_COMMANDS.includes(name)) {');
    expect(source).toContain('$.prompt.submit({ text: rendered.text, asUser: true })');
    expect(source).toContain('scripts/sdlc-render-prompt.mjs');
    for (const [name] of INTERACTIVE_COMMANDS) {
      expect(fs.existsSync(path.join(repoRoot, 'commands', `${name}.md`))).toBe(false);
    }
    for (const [name, skill, description] of AUTOMATED_COMMANDS) {
      expect(read(`commands/${name}.md`)).toBe(renderAutomatedCommandMarkdown(name, skill, description, repoRoot));
    }
  });

  it('writes command files that Claude Code materializes under -p and in the TUI', () => {
    const markdown = renderAutomatedCommandMarkdown('sdlc-status', 'status', 'Report read-only SDLC status', repoRoot);
    expect(markdown.startsWith('---\ndescription: "Report read-only SDLC status"\nargument-hint: "[--json]"\n---\n\n')).toBe(true);
    expect(markdown).not.toContain('<plugin-root>');
    expect(markdown).toContain('${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-status.mjs');
  });

  it('ships a Claude Code manifest and no OMP extension surface', () => {
    const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
    const manifest = JSON.parse(read('package.json'));
    expect(plugin.name).toBe('nmg-sdlc');
    expect(plugin.version).toBe(manifest.version);
    expect(read('VERSION').trim()).toBe(manifest.version);
    expect(manifest).not.toHaveProperty('omp');
    expect(fs.existsSync(path.join(repoRoot, 'src', 'extension.ts'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'skills'))).toBe(false);
    expect(fs.existsSync(path.join(
      repoRoot,
      'workflows/address-pr-comments/references/fetch-threads.md;skills/address-pr-comments/references/fix-loop.md;skills/address-pr-comments/references/polling.md',
    ))).toBe(false);
    expect(fs.existsSync(path.join(
      repoRoot,
      'workflows/start-issue/references/milestone-selection.md;skills/start-issue/references/stale-remote-branch.md;skills/start-issue/references/project-status.md',
    ))).toBe(false);
  });

  it('keeps the hooks module free of Node imports', () => {
    for (const file of ['hooks/register.ts', 'src/host-events.mjs']) {
      expect(`${file}\n${read(file)}`).not.toMatch(/from ['"]node:|require\(|import\(/);
    }
  });

  (claudeAvailable ? it : it.skip)('passes claude plugin validate and the hooks module tests', () => {
    const validate = spawnSync('claude', ['plugin', 'validate', repoRoot], { encoding: 'utf8' });
    expect(`${validate.stdout}${validate.stderr}`).toContain('Validation passed');
    const tested = spawnSync('claude', ['plugin', 'test', repoRoot], { encoding: 'utf8' });
    const output = `${tested.stdout}${tested.stderr}`;
    expect(output).toMatch(/\b0 fail\b/);
    expect(tested.status).toBe(0);
  }, 120_000);
});
