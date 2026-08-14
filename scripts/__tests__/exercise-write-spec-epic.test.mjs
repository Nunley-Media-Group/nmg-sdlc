/**
 * Deterministic forward-publication exercise for issue #157.
 *
 * Uses distinct sealing, default, and child histories. No live Codex or GitHub
 * session is required.
 */

import { afterEach, describe, expect, test } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helper = path.join(repoRoot, 'scripts', 'umbrella-spec-status.mjs');
const temporaryRoots = [];
const specPath = 'specs/feature-forward-publication';

function temporary(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function write(root, relativePath, source) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function writeSpec(root) {
  write(root, `${specPath}/requirements.md`, [
    '# Requirements: Forward Publication',
    '',
    '**Issues**: #157',
    '',
    '| ID | Requirement | Priority |',
    '|----|-------------|----------|',
    '| FR1 | Deliver through multiple PRs | Must |',
    '',
  ].join('\n'));
  write(root, `${specPath}/design.md`, '# Design\n\n## Multi-PR Rollout\n\nTwo phases.\n');
  write(root, `${specPath}/tasks.md`, '# Tasks\n\n- T001\n');
  write(root, `${specPath}/feature.gherkin`, 'Feature: Forward publication\n');
}

function fixture() {
  const bare = temporary('nmg-forward-origin-');
  const work = temporary('nmg-forward-work-');
  git(bare, ['init', '--bare', '--initial-branch=main']);
  git(work, ['init', '--initial-branch=main']);
  git(work, ['config', 'user.name', 'Forward Test']);
  git(work, ['config', 'user.email', 'forward@example.test']);
  git(work, ['remote', 'add', 'origin', bare]);
  write(work, 'README.md', '# fixture\n');
  git(work, ['add', 'README.md']);
  git(work, ['commit', '-m', 'chore: initialize']);
  git(work, ['push', '-u', 'origin', 'main']);

  git(work, ['checkout', '-b', '157-seal']);
  writeSpec(work);
  git(work, ['add', specPath]);
  git(work, ['commit', '-m', 'docs: seal umbrella spec for #157']);
  const sourceCommit = git(work, ['rev-parse', 'HEAD']);
  git(work, ['push', '-u', 'origin', '157-seal']);
  return { bare, work, sourceCommit };
}

function inspect(root, args) {
  const result = spawnSync(process.execPath, [helper, '--project', root, ...args, '--json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('write-spec umbrella publication exercise', () => {
  test('an independently based child remains blocked while the parent spec is stranded', () => {
    const { work } = fixture();
    git(work, ['checkout', 'main']);
    git(work, ['checkout', '-b', '158-independent-child']);
    const headBefore = git(work, ['rev-parse', 'HEAD']);

    const result = inspect(work, ['--parent-issue', '157']);

    expect(fs.existsSync(path.join(work, specPath))).toBe(false);
    expect(result.status).toBe('stranded_recoverable');
    expect(result.specPath).toBe(specPath);
    expect(git(work, ['rev-parse', 'HEAD'])).toBe(headBefore);
  });

  test('a squash-shaped default publication unblocks a fresh child without the seal marker', () => {
    const { work, sourceCommit } = fixture();
    git(work, ['checkout', 'main']);
    git(work, ['restore', `--source=${sourceCommit}`, '--worktree', '--', specPath]);
    git(work, ['add', specPath]);
    git(work, ['commit', '-m', 'docs: publish approved umbrella spec']);
    git(work, ['push', 'origin', 'main']);
    git(work, ['checkout', '-b', '158-child-after-publication']);

    const first = inspect(work, ['--parent-issue', '157']);
    const second = inspect(work, ['--parent-issue', '157']);

    expect(fs.existsSync(path.join(work, specPath, 'requirements.md'))).toBe(true);
    expect(first.status).toBe('canonical_marker_lost');
    expect(second).toEqual(first);
  });

  test('publication mode compares the exact source and default trees', () => {
    const { work, sourceCommit } = fixture();
    const pending = inspect(work, ['--spec', specPath, '--source', sourceCommit]);
    expect(pending.status).toBe('stranded_recoverable');
    expect(pending.sourceTree).toMatch(/^[0-9a-f]{40}$/);

    git(work, ['checkout', 'main']);
    git(work, ['restore', `--source=${sourceCommit}`, '--worktree', '--', specPath]);
    git(work, ['add', specPath]);
    git(work, ['commit', '-m', 'docs: squash publication']);
    git(work, ['push', 'origin', 'main']);

    const merged = inspect(work, ['--spec', specPath, '--source', sourceCommit]);
    expect(merged.status).toBe('canonical_marker_lost');
    expect(merged.defaultTree).toBe(merged.sourceTree);
  });

  test('single-PR specs retain the existing trigger boundary', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'skills/write-spec/SKILL.md'), 'utf8');
    expect(source).toContain('The trigger fires if EITHER:');
    expect(source).toContain('`design.md` contains a `## Multi-PR Rollout` heading');
    expect(source).toContain('Any FR row\'s Requirement cell contains `multiple PRs` or `multi-PR`');
    expect(source).toContain('Run this flow only when the Canonical Parent-Spec Gate recorded no coordination parent');
    expect(source).toContain('when the Phase 3 Seal-Spec Flow runs');
  });
});
