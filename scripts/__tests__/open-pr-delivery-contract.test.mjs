import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('open-pr terminal delivery contract', () => {
  it('requires MERGED plus CLOSED and has no interactive gates', () => {
    const openPr = read('workflows/open-pr/WORKFLOW.md');
    expect(openPr).toMatch(/MERGED/);
    expect(openPr).toMatch(/CLOSED/);
    expect(openPr).toContain('major_bump_required');
    expect(openPr).not.toContain('request_user_input');
    expect(openPr).not.toContain('$nmg-sdlc:');
    expect(openPr).not.toContain('epic ancestor');
  });

  it('hard-removes commit-push from the OMP package surface', () => {
    const manifest = JSON.parse(read('package.json'));
    expect(manifest.omp.extensions).toEqual(['./src/extension.ts']);
    expect(fs.existsSync(path.join(repoRoot, 'workflows', 'commit-push'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, '.codex-plugin', 'plugin.json'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, '.claude-plugin'))).toBe(false);
  });
});
