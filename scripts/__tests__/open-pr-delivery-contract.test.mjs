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

describe('open-pr terminal delivery contract (issues #108, #148, #151, and #177)', () => {
  it('keeps exact-head merge and issue closure in open-pr and removes obsolete runtime assets', () => {
    expect(fs.existsSync(path.join(repoRoot, 'scripts', 'sdlc-runner.mjs'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'scripts', 'sdlc-config.example.json'))).toBe(false);
    const openPr = read('skills/open-pr/SKILL.md');
    expect(openPr).toContain('Deliver a verified issue through one exact pull request until its exact head is merged and the issue is closed');
    expect(openPr).toContain('PR creation is an intermediate state, never successful');
    expect(openPr).toContain('Success requires a fresh PR read proving `state: MERGED`');
  });

  it('keeps ordinary Pass creation unchanged and gates the controlled draft path', () => {
    const openPr = read('skills/open-pr/SKILL.md');
    const prBody = read('skills/open-pr/references/pr-body.md');
    const controlled = read('skills/open-pr/references/pr-dependent-delivery.md');

    expect(openPr).toContain('../../references/pr-dependent-verification.md');
    expect(openPr).toContain('Current valid `pr_evidence_pending` may select the controlled draft path');
    expect(openPr).toContain('current valid `pr_evidence_satisfied` may enter only its exact preserved-draft H2 retry');
    expect(openPr).toContain('gh pr create --title "[title]" --body "[body]"');
    expect(prBody).toContain('gh pr create --draft --title <title> --body-file <body-file>');
    expect(controlled).toContain('status: pr_evidence_pending');
    expect(controlled).toContain('Ordinary `pass` follows the unchanged ordinary PR path');
    expect(controlled).toContain('--delivery-body-file <fetched-body-file>');
    for (const blocker of ['Partial', 'Incomplete', 'Fail', 'blocked', 'unverifiable']) {
      expect(`${openPr}\n${controlled}`).toContain(blocker);
    }
  });

  it('orders exact draft H1, re-verification, H2, final marker, and readiness', () => {
    const controlled = read('skills/open-pr/references/pr-dependent-delivery.md');
    const h1 = controlled.indexOf('Record it as `H1`');
    const reverify = controlled.indexOf('Rerun `$nmg-sdlc:verify-code #N`');
    const h2 = controlled.indexOf('re-fetch `headRefOid` as `H2`');
    const finalMarker = controlled.indexOf('nmg-sdlc-delivery-validation');
    const ready = controlled.indexOf('gh pr ready <number>');

    expect(h1).toBeGreaterThan(-1);
    expect(reverify).toBeGreaterThan(h1);
    expect(h2).toBeGreaterThan(reverify);
    expect(finalMarker).toBeGreaterThan(h2);
    expect(ready).toBeGreaterThan(finalMarker);
    expect(controlled).toContain('H1 results cannot satisfy H2');
    expect(controlled).toContain('require `H2 != H1`');
    expect(controlled).toContain('Require the PR to remain open and draft');
  });

  it('preserves branch, draft, protections, and review/merge gates on failure', () => {
    const controlled = read('skills/open-pr/references/pr-dependent-delivery.md');
    const monitor = read('skills/open-pr/references/ci-monitoring.md');

    for (const token of ['missing', 'failed', 'timed-out', 'stale', 'conflicting', 'malformed', 'unknown']) {
      expect(controlled).toContain(token);
    }
    for (const forbidden of ['gh pr ready', 'merge', 'checkout', 'branch deletion', 'protection/ruleset mutation', 'false Pass']) {
      expect(controlled).toContain(forbidden);
    }
    expect(controlled).toContain('preserve the feature branch and controlled draft PR');
    expect(controlled).toContain('`mergeStateStatus: CLEAN`');
    expect(monitor).toContain('`isDraft: false`');
    expect(monitor).toContain('--match-head-commit');
    expect(monitor).toContain('require `state: CLOSED`');
  });

  it('open-pr delivery docs cover dirty, clean, non-rewriting base merge, safe-push, and push verification paths', () => {
    const openPr = read('skills/open-pr/SKILL.md');
    const preflight = read('skills/open-pr/references/preflight.md');
    const prBody = read('skills/open-pr/references/pr-body.md');

    expect(openPr).toContain('merges the base when needed without rewriting history');
    expect(preflight).toContain('compare every dirty path with the implementation/specification scope approved for this delivery');
    expect(preflight).not.toContain('git reset -- .codex/');
    expect(preflight).toContain('No additional commit needed');
    expect(preflight).toContain('git merge --no-edit origin/main');
    expect(preflight).not.toContain('git push --force-with-lease');
    expect(preflight).toContain('Never use `--force`, `--force-with-lease`');
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
