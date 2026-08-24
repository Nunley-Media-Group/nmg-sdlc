import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
    expect(source).toContain('process.env.NMG_SDLC_PLUGIN_ROOT = packageRoot');
    expect(source).not.toMatch(/registerCommand\("(execute|draft-issue|write-spec)"/);
  });

  it('materializes controller paths in registered handlers and automated runtime prompts', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-extension-'));
    const target = path.join(fixture, 'target project');
    fs.mkdirSync(target);
    const extensionUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'extension.ts')).href}?test=${Date.now()}`;
    const probe = [
      `const { default: extension } = await import(${JSON.stringify(extensionUrl)});`,
      'const commands = new Map();',
      'const events = new Map();',
      'const sent = [];',
      'extension({',
      '  setLabel() {},',
      '  registerCommand(name, options) { commands.set(name, options.handler); },',
      '  sendUserMessage(content) { sent.push(content); },',
      '  appendEntry() {},',
      '  on(name, handler) { events.set(name, handler); },',
      '});',
      'await commands.get("sdlc-upgrade-project")("#252", { hasUI: true });',
      'const runtime = events.get("context")({ messages: [{ role: "user", content: [{ type: "text", text: "node <plugin-root>/scripts/sdlc-status.mjs --project ." }] }] });',
      'console.log(JSON.stringify({ interactive: sent[0], automated: runtime.messages[0].content[0].text }));',
    ].join('\n');
    try {
      const result = spawnSync('bun', ['--eval', probe], {
        cwd: target,
        encoding: 'utf8',
        env: { ...process.env },
      });
      expect(result.status).toBe(0);
      const prompts = JSON.parse(result.stdout.trim());
      const upgradeController = JSON.stringify(path.join(repoRoot, 'scripts', 'sdlc-upgrade.mjs'));
      const statusController = JSON.stringify(path.join(repoRoot, 'scripts', 'sdlc-status.mjs'));
      expect(prompts.interactive).toContain(`["node",${upgradeController},"apply"`);
      expect(prompts.interactive).not.toContain('<plugin-root>');
      expect(prompts.automated).toBe(`node ${statusController} --project .`);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
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

  it('ships no cwd-relative controller dispatch in public prompt surfaces', () => {
    const roots = ['commands', 'workflows'];
    const markdown = [];
    while (roots.length > 0) {
      const relative = roots.pop();
      const absolute = path.join(repoRoot, relative);
      for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        const child = path.join(relative, entry.name);
        if (entry.isDirectory()) roots.push(child);
        else if (entry.isFile() && entry.name.endsWith('.md')) markdown.push(child);
      }
    }
    for (const file of markdown) {
      expect(read(file)).not.toMatch(/node scripts\/[A-Za-z0-9._-]+\.mjs/);
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
