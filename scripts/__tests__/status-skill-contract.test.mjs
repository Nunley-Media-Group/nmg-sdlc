import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillPath = path.join(repoRoot, 'skills', 'status', 'SKILL.md');
const source = fs.readFileSync(skillPath, 'utf8');

describe('status skill contract', () => {
  it('uses only name and description frontmatter', () => {
    const block = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const keys = block.split('\n')
      .filter((line) => /^[a-z][a-z0-9-]*:/.test(line))
      .map((line) => line.slice(0, line.indexOf(':')));
    expect(keys).toEqual(['name', 'description']);
  });

  it('documents /skill:status [--json] and execute/write-spec recommendations', () => {
    expect(source).toContain('Usage: /skill:status [--json]');
    expect(source).toContain('/skill:execute');
    expect(source).toContain('/plan /skill:write-spec #N');
    expect(source).not.toContain('request_user_input');
    expect(source).not.toContain('$nmg-sdlc:');
    expect(source).not.toContain('epicAuthority');
    expect(source).not.toContain('coordination-only');
  });

  it('is discoverable from the OMP package skills directory', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    expect(manifest.omp.skills).toEqual(['./skills']);
    expect(fs.existsSync(skillPath)).toBe(true);
  });
});
