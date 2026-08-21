import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('extension sdlc- commands', () => {
  it('registers only sdlc-prefixed public commands', () => {
    const source = read('src/extension.ts');
    const helpers = read('src/sdlc-commands.mjs');

    expect(helpers).toContain('["sdlc-draft-issue", "draft-issue"');
    expect(helpers).toContain('["sdlc-write-spec", "write-spec"');
    expect(helpers).toContain('["sdlc-onboard-project", "onboard-project"');
    expect(helpers).toContain('["sdlc-upgrade-project", "upgrade-project"');
    expect(helpers).toContain('["sdlc-run-retro", "run-retro"');
    expect(helpers).toContain('["sdlc-execute", "execute"');
    expect(helpers).toContain('["sdlc-status", "status"');
    expect(helpers).toContain('["sdlc-verify-code", "verify-code"');
    expect(helpers).toContain('["sdlc-open-pr", "open-pr"');
    expect(source).toContain('pi.registerCommand(name');
    expect(source).not.toMatch(/registerCommand\("(execute|draft-issue|write-spec)"/);
  });

  it('interactive commands enter /plan via TUI input rewrite and fail closed without UI', () => {
    const source = read('src/extension.ts');
    const helpers = read('src/sdlc-commands.mjs');

    expect(source).toContain('pi.on("input"');
    expect(source).toContain('rewriteInteractiveInput');
    expect(source).toContain('isInteractiveHeadless(ctx)');
    expect(source).toContain('interactiveHeadlessMessage(name)');
    expect(source).toContain('sendUserMessage(`/plan\\n\\n${withArguments(workflowBody(skill), args)}`)');
    expect(source).not.toContain('sendUserMessage(withArguments(workflowBody(skill), args))');
    expect(source).not.toContain('/skill:');
    expect(helpers).toContain('source !== "interactive"');
    expect(helpers).toContain('sessionMode === "plan"');
    expect(helpers).toContain('ctx?.hasUI !== true');
    expect(helpers).toContain('Run /${commandName} in the TUI.');
  });

  it('ships automated /sdlc-* as file commands synced to workflow bodies', async () => {
    const { AUTOMATED_COMMANDS, renderAutomatedCommandMarkdown } = await import('../../src/sdlc-commands.mjs');
    const source = read('src/extension.ts');
    expect(source).not.toMatch(/for \(const \[name, skill, description\] of AUTOMATED_COMMANDS\)/);
    expect(fs.existsSync(path.join(repoRoot, 'commands', 'sdlc-write-spec.md'))).toBe(false);
    for (const [name, skill, description] of AUTOMATED_COMMANDS) {
      expect(read(`commands/${name}.md`)).toBe(renderAutomatedCommandMarkdown(name, skill, description, repoRoot));
    }
  });

  it('package omp declares extensions and no skills key', () => {
    const manifest = JSON.parse(read('package.json'));
    expect(manifest.omp.extensions).toEqual(['./src/extension.ts']);
    expect(manifest.omp).not.toHaveProperty('skills');
    expect(fs.existsSync(path.join(repoRoot, 'skills'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, '.claude-plugin'))).toBe(false);
    expect(fs.existsSync(path.join(
      repoRoot,
      'workflows/address-pr-comments/references/fetch-threads.md;skills/address-pr-comments/references/fix-loop.md;skills/address-pr-comments/references/polling.md',
    ))).toBe(false);
    expect(fs.existsSync(path.join(
      repoRoot,
      'workflows/start-issue/references/milestone-selection.md;skills/start-issue/references/stale-remote-branch.md;skills/start-issue/references/project-status.md',
    ))).toBe(false);
  });
});
