import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillPath = path.join(repoRoot, 'skills', 'status', 'SKILL.md');
const manifestPath = path.join(repoRoot, '.codex-plugin', 'plugin.json');
const source = fs.readFileSync(skillPath, 'utf8');

function frontmatterKeys(markdown) {
  const block = markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return block.split('\n')
    .filter((line) => /^[a-z][a-z0-9-]*:/.test(line))
    .map((line) => line.slice(0, line.indexOf(':')));
}

describe('status skill contract', () => {
  it('uses only name and a trigger-complete description in frontmatter', () => {
    expect(frontmatterKeys(source)).toEqual(['name', 'description']);
    for (const trigger of ['SDLC status', 'current issue', 'next SDLC command', 'session context recovery', 'machine-readable']) {
      expect(source).toContain(trigger);
    }
  });

  it('accepts only empty arguments or --json and never prompts', () => {
    expect(source).toContain('only when it is empty or exactly `--json`');
    expect(source).toContain('Usage: $nmg-sdlc:status [--json]');
    expect(source).toContain('never presents a `request_user_input` gate');
  });

  it('resolves the current project and its own installed plugin root', () => {
    expect(source).toContain('git rev-parse --show-toplevel');
    expect(source).toContain("this loaded skill's own source path");
    expect(source).toContain('two parent directories above `skills/status/SKILL.md`');
    expect(source).toContain('<plugin-root>/scripts/sdlc-status.mjs');
    expect(source).not.toContain('sdlc-config.json');
  });

  it('delegates with distinct process arguments and preserves JSON stdout', () => {
    expect(source).toContain('process.execPath, [statusCli, "--project", projectRoot]');
    expect(source).toContain('process.execPath, [statusCli, "--project", projectRoot, "--json"]');
    expect(source).toContain('Pass the resolved paths as distinct arguments');
    expect(source).toContain("stdout must contain only the CLI's JSON document");
  });

  it('states the complete read-only boundary and workflow integration', () => {
    for (const prohibited of ['write', 'delete', 'stage', 'commit', 'checkout', 'push', 'signal', 'verify', 'deliver', 'merge']) {
      expect(source).toMatch(new RegExp(`\\b${prohibited}\\b`, 'i'));
    }
    expect(source).toContain('## Integration with SDLC Workflow');
    expect(source.split('\n').length).toBeLessThan(300);
  });

  it('makes automated-loop integration explicitly out of scope', () => {
    expect(source).toContain('Automated-loop integration is out of scope');
    expect(source).toContain('milestone-2 removal');
    expect(source).toContain('Do not inspect runner source, state, sentinels, logs, configuration, or PIDs');
    expect(source).toContain('do not recommend resume, cleanup, or `$nmg-sdlc:end-loop` actions');
  });

  it('is auto-discovered by the plugin manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.skills).toBe('./skills/');
    expect(fs.existsSync(skillPath)).toBe(true);
  });
});
