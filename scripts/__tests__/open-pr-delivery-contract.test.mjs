import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function collectMarkdownFiles(dir) {
  const root = path.join(repoRoot, dir);
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectMarkdownFiles(relative);
    return entry.name.endsWith('.md') ? [relative] : [];
  });
}

describe('open-pr folded delivery contract (issues #108, #148, and #151)', () => {
  it('keeps delivery in open-pr and removes obsolete runtime assets', () => {
    expect(fs.existsSync(path.join(repoRoot, 'scripts', 'sdlc-runner.mjs'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'scripts', 'sdlc-config.example.json'))).toBe(false);
    expect(read('skills/open-pr/SKILL.md')).toContain('Stages eligible work, applies the version bump, commits, rebases safely, pushes, and creates the PR');
  });

  it('open-pr delivery docs cover dirty, clean, rebase, safe-push, and push verification paths', () => {
    const openPr = read('skills/open-pr/SKILL.md');
    const preflight = read('skills/open-pr/references/preflight.md');
    const prBody = read('skills/open-pr/references/pr-body.md');

    expect(openPr).toContain('Stages eligible work, applies the version bump, commits, rebases safely, pushes, and creates the PR');
    expect(preflight).toContain('compare every dirty path with the implementation/specification scope approved for this delivery');
    expect(preflight).not.toContain('git reset -- .codex/');
    expect(preflight).toContain('No additional commit needed');
    expect(preflight).toContain('git push --force-with-lease=HEAD:{EXPECTED_SHA}');
    expect(preflight).toContain('git log origin/{branch}..HEAD --oneline');
    expect(prBody).toContain('No additional commit needed');
  });

  it('hard-removes commit-push and scans the complete active skill tree', () => {
    const manifest = JSON.parse(read('.codex-plugin/plugin.json'));
    const publicFiles = [
      'README.md',
      ...collectMarkdownFiles('skills'),
      ...collectMarkdownFiles('references'),
    ];

    expect(manifest.skills).toBe('./skills/');
    expect(fs.existsSync(path.join(repoRoot, 'skills', 'commit-push'))).toBe(false);

    for (const file of publicFiles) {
      const source = read(file);
      expect(source).not.toContain('$nmg-sdlc:commit-push');
      expect(source).not.toContain('commitPush');
      expect(source).not.toContain('DIVERGED: re-run commit-push');
    }
  });
});
