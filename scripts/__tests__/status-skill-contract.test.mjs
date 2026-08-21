import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillPath = path.join(repoRoot, 'workflows', 'status', 'WORKFLOW.md');
const source = fs.readFileSync(skillPath, 'utf8');
const statusScript = fs.readFileSync(path.join(repoRoot, 'scripts', 'sdlc-status.mjs'), 'utf8');
const body = source.replace(/^---\n[\s\S]*?\n---\n/, '');

describe('status skill contract', () => {
  it('uses only name and description frontmatter', () => {
    const block = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const keys = block.split('\n')
      .filter((line) => /^[a-z][a-z0-9-]*:/.test(line))
      .map((line) => line.slice(0, line.indexOf(':')));
    expect(keys).toEqual(['name', 'description']);
  });

  it('keeps the compact execution contract and script-owned recommendations', () => {
    expect(source).toContain('Usage: /sdlc-status [--json]');
    expect(source).toContain('git rev-parse --show-toplevel');
    expect(source).toContain('Pass output through unchanged.');
    expect(source).not.toContain('## Integration with SDLC Workflow');
    expect(source).not.toContain('## JSON Contract');
    expect(source).not.toContain('## Recommendations (from evidence)');
    expect(body).not.toContain('/sdlc-execute');
    expect(body).not.toContain('/sdlc-write-spec #N');
    expect(statusScript).toContain('/sdlc-execute');
    expect(statusScript).toContain('/sdlc-write-spec');
    expect(source).not.toContain('request_user_input');
    expect(source).not.toContain('$nmg-sdlc:');
    expect(source).not.toContain('epicAuthority');
    expect(source).not.toContain('coordination-only');
  });

  it('is bundled as a workflow file the extension reads', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    expect(manifest.omp).not.toHaveProperty('skills');
    expect(fs.existsSync(skillPath)).toBe(true);
  });
});
