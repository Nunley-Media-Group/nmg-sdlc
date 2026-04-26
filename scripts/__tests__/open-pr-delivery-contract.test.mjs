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

describe('open-pr folded delivery contract (issue #108)', () => {
  it('runner configuration no longer exposes a commitPush step', () => {
    const runner = read('scripts/sdlc-runner.mjs');
    const config = read('scripts/sdlc-config.example.json');

    expect(runner).not.toContain("'commitPush'");
    expect(config).not.toContain('"commitPush"');
    expect(runner).toContain('open-pr delivery step owns staging eligible non-runner work');
  });

  it('open-pr delivery docs cover dirty, clean, rebase, safe-push, and push verification paths', () => {
    const openPr = read('skills/open-pr/SKILL.md');
    const preflight = read('skills/open-pr/references/preflight.md');
    const prBody = read('skills/open-pr/references/pr-body.md');

    expect(openPr).toContain('Stages eligible work, applies the version bump, commits, rebases safely, pushes, and creates the PR');
    expect(preflight).toContain('git reset -- .codex/sdlc-state.json .codex/unattended-mode');
    expect(preflight).toContain('No additional commit needed');
    expect(preflight).toContain('git push --force-with-lease=HEAD:{EXPECTED_SHA}');
    expect(preflight).toContain('git log origin/{branch}..HEAD --oneline');
    expect(prBody).toContain('No additional commit needed');
  });

  it('public workflow docs do not advertise commit-push as a pipeline step', () => {
    const publicFiles = [
      'README.md',
      ...collectMarkdownFiles('skills').filter((file) => !file.startsWith('skills/commit-push/')),
      ...collectMarkdownFiles('references'),
    ];

    for (const file of publicFiles) {
      const source = read(file);
      expect(source).not.toContain('$nmg-sdlc:commit-push');
      expect(source).not.toContain('commitPush');
      expect(source).not.toContain('DIVERGED: re-run commit-push');
    }
  });
});
