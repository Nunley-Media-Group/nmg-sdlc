import { afterEach, describe, expect, test } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helper = path.join(repoRoot, 'scripts', 'umbrella-spec-status.mjs');
const temporaryRoots = [];
const specPath = 'specs/feature-recoverable-umbrella';

function temporary(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function write(root, relativePath, source) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function specSources(revision) {
  return new Map([
    ['requirements.md', `# Requirements\n\n**Issues**: #157\n\n| FR1 | multiple PRs | Must |\n\n${revision}\n`],
    ['design.md', `# Design\n\n## Multi-PR Rollout\n\n${revision}\n`],
    ['tasks.md', `# Tasks\n\n${revision}\n`],
    ['feature.gherkin', `Feature: ${revision}\n`],
  ]);
}

function writeSpec(root, revision) {
  for (const [name, source] of specSources(revision)) write(root, `${specPath}/${name}`, source);
}

function fixture() {
  const bare = temporary('nmg-recovery-origin-');
  const work = temporary('nmg-recovery-work-');
  git(bare, ['init', '--bare', '--initial-branch=main']);
  git(work, ['init', '--initial-branch=main']);
  git(work, ['config', 'user.name', 'Recovery Test']);
  git(work, ['config', 'user.email', 'recovery@example.test']);
  git(work, ['remote', 'add', 'origin', bare]);
  write(work, 'README.md', '# fixture\n');
  write(work, 'notes/keep.txt', 'original\n');
  git(work, ['add', 'README.md', 'notes/keep.txt']);
  git(work, ['commit', '-m', 'chore: initialize']);
  git(work, ['push', '-u', 'origin', 'main']);
  return { bare, work };
}

function addSourceBranch(work, branch, revision) {
  git(work, ['checkout', 'main']);
  git(work, ['checkout', '-b', branch]);
  writeSpec(work, revision);
  git(work, ['add', specPath]);
  git(work, ['commit', '-m', 'docs: seal umbrella spec for #157']);
  const commit = git(work, ['rev-parse', 'HEAD']).trim();
  git(work, ['push', '-u', 'origin', branch]);
  git(work, ['checkout', 'main']);
  return commit;
}

function inspect(work) {
  const result = spawnSync(process.execPath, [helper, '--project', work, '--all', '--json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function finding(result) {
  return result.findings.find(({ path: findingPath }) => findingPath === specPath);
}

function snapshotSpec(root) {
  if (!fs.existsSync(path.join(root, specPath))) return null;
  return [...specSources('unused').keys()].map((name) => [
    name,
    fs.readFileSync(path.join(root, specPath, name), 'utf8'),
  ]);
}

function matchesCommit(root, commit) {
  for (const name of specSources('unused').keys()) {
    const expected = git(root, ['show', `${commit}:${specPath}/${name}`]);
    const actual = fs.readFileSync(path.join(root, specPath, name), 'utf8');
    if (actual !== expected) return false;
  }
  return true;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('upgrade sealed-spec recovery exercise', () => {
  test('prepares one exact stranded tree without changing the index, refs, or unrelated dirt', () => {
    const { work } = fixture();
    const sourceCommit = addSourceBranch(work, 'sealed-source', 'approved');
    write(work, 'notes/keep.txt', 'dirty but preserved\n');
    write(work, 'notes/untracked.txt', 'also preserved\n');
    const indexBefore = git(work, ['ls-files', '--stage', '-z']);
    const refsBefore = git(work, ['show-ref']);
    const keepBefore = fs.readFileSync(path.join(work, 'notes/keep.txt'), 'utf8');
    const approved = finding(inspect(work));
    expect(approved.status).toBe('stranded_recoverable');
    expect(approved.candidates[0].sourceCommits).toContain(sourceCommit);

    git(work, ['restore', `--source=${sourceCommit}`, '--worktree', '--', specPath]);

    expect(matchesCommit(work, sourceCommit)).toBe(true);
    expect(git(work, ['ls-files', '--stage', '-z'])).toBe(indexBefore);
    expect(git(work, ['show-ref'])).toBe(refsBefore);
    expect(fs.readFileSync(path.join(work, 'notes/keep.txt'), 'utf8')).toBe(keepBefore);
    expect(fs.readFileSync(path.join(work, 'notes/untracked.txt'), 'utf8')).toBe('also preserved\n');

    const afterFirst = snapshotSpec(work);
    expect(matchesCommit(work, sourceCommit)).toBe(true);
    const afterSecond = snapshotSpec(work);
    expect(afterSecond).toEqual(afterFirst);
  });

  test('preserves a divergent default tree and reports the noncanonical source', () => {
    const { work } = fixture();
    writeSpec(work, 'default wins');
    git(work, ['add', specPath]);
    git(work, ['commit', '-m', 'docs: canonical default spec']);
    git(work, ['push', 'origin', 'main']);
    addSourceBranch(work, 'different-source', 'must not overwrite');
    const before = snapshotSpec(work);

    const result = finding(inspect(work));

    expect(result.status).toBe('divergent');
    expect(result.defaultTree).toMatch(/^[0-9a-f]{40}$/);
    expect(result.candidates[0].tree).not.toBe(result.defaultTree);
    expect(snapshotSpec(work)).toEqual(before);
  });

  test('preserves ambiguous source identities without preparing a destination', () => {
    const { work } = fixture();
    addSourceBranch(work, 'source-one', 'one');
    addSourceBranch(work, 'source-two', 'two');

    const result = finding(inspect(work));

    expect(result.status).toBe('ambiguous');
    expect(result.candidates).toHaveLength(2);
    expect(fs.existsSync(path.join(work, specPath))).toBe(false);
  });

  test('stops when an approved stranded finding becomes divergent before apply', () => {
    const { bare, work } = fixture();
    addSourceBranch(work, 'approved-source', 'approved');
    const approved = finding(inspect(work));
    expect(approved.status).toBe('stranded_recoverable');

    const publisher = temporary('nmg-recovery-publisher-');
    git(publisher, ['clone', bare, '.']);
    git(publisher, ['config', 'user.name', 'Publisher']);
    git(publisher, ['config', 'user.email', 'publisher@example.test']);
    writeSpec(publisher, 'different default');
    git(publisher, ['add', specPath]);
    git(publisher, ['commit', '-m', 'docs: competing default publication']);
    git(publisher, ['push', 'origin', 'main']);

    const revalidated = finding(inspect(work));
    expect(revalidated.status).toBe('divergent');
    expect(revalidated.defaultTree).not.toBe(approved.candidates[0].tree);
    expect(fs.existsSync(path.join(work, specPath))).toBe(false);
  });

  test('preserves a symlink collision instead of following it', () => {
    const { work } = fixture();
    addSourceBranch(work, 'approved-source', 'approved');
    const outside = temporary('nmg-recovery-outside-');
    fs.mkdirSync(path.dirname(path.join(work, specPath)), { recursive: true });
    fs.symlinkSync(outside, path.join(work, specPath));

    const stat = fs.lstatSync(path.join(work, specPath));

    expect(stat.isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(path.join(work, specPath))).toBe(fs.realpathSync(outside));
    expect(fs.readdirSync(outside)).toEqual([]);
  });
});
