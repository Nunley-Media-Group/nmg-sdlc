import { afterEach, describe, expect, test } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helper = path.join(repoRoot, 'scripts', 'umbrella-spec-status.mjs');
const temporaryRoots = [];

function temporary(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function git(cwd, args, options = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: options.stdio ?? 'pipe' }).trim();
}

function write(root, relativePath, source) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function createFixture() {
  const bare = temporary('nmg-umbrella-origin-');
  const work = temporary('nmg-umbrella-work-');
  git(bare, ['init', '--bare', '--initial-branch=main']);
  git(work, ['init', '--initial-branch=main']);
  git(work, ['config', 'user.name', 'Umbrella Test']);
  git(work, ['config', 'user.email', 'umbrella@example.test']);
  git(work, ['remote', 'add', 'origin', bare]);
  write(work, 'README.md', '# fixture\n');
  git(work, ['add', 'README.md']);
  git(work, ['commit', '-m', 'chore: initialize fixture']);
  git(work, ['push', '-u', 'origin', 'main']);
  return { bare, work };
}

function writeSpec(root, {
  specPath = 'specs/feature-umbrella',
  issue = 42,
  revision = 'one',
  verificationReport = null,
  duplicateIssueFrontmatter = false,
} = {}) {
  write(root, `${specPath}/requirements.md`, [
    '# Requirements: Umbrella',
    '',
    `**Issues**: #${issue}`,
    '',
    '## Functional Requirements',
    '',
    '| ID | Requirement | Priority |',
    '|----|-------------|----------|',
    '| FR1 | Deliver through multiple PRs | Must |',
    '',
    `Revision: ${revision}`,
    '',
  ].join('\n'));
  write(root, `${specPath}/design.md`, [
    '# Design: Umbrella',
    '',
    '## Multi-PR Rollout',
    '',
    `Revision: ${revision}`,
    '',
  ].join('\n'));
  write(root, `${specPath}/tasks.md`, `# Tasks\n\n- ${revision}\n`);
  write(root, `${specPath}/feature.gherkin`, `Feature: Umbrella ${revision}\n`);
  if (verificationReport !== null) {
    write(root, `${specPath}/verification-report.md`, `# Verification Report\n\n${verificationReport}\n`);
  }
  if (duplicateIssueFrontmatter) {
    fs.appendFileSync(path.join(root, specPath, 'requirements.md'), `**Issue**: #${issue}\n`);
  }
}

function commitSpec(root, {
  specPath = 'specs/feature-umbrella',
  issue = 42,
  subject,
  revision = 'one',
  verificationReport = null,
  duplicateIssueFrontmatter = false,
} = {}) {
  writeSpec(root, {
    specPath,
    issue,
    revision,
    verificationReport,
    duplicateIssueFrontmatter,
  });
  git(root, ['add', specPath]);
  git(root, ['commit', '-m', subject ?? `docs: seal umbrella spec for #${issue}`]);
  return git(root, ['rev-parse', 'HEAD']);
}

function runHelper(root, args) {
  const result = spawnSync(process.execPath, [helper, '--project', root, ...args, '--json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function createStranded({ issue = 42, specPath = 'specs/feature-umbrella', revision = 'one' } = {}) {
  const fixture = createFixture();
  git(fixture.work, ['checkout', '-b', 'seal']);
  const sourceCommit = commitSpec(fixture.work, { issue, specPath, revision });
  git(fixture.work, ['push', '-u', 'origin', 'seal']);
  git(fixture.work, ['checkout', 'main']);
  return { ...fixture, issue, specPath, sourceCommit };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('umbrella-spec-status', () => {
  test('accepts a lifecycle verification report in parent, publication, and audit modes', () => {
    const { work } = createFixture();
    const sourceCommit = commitSpec(work, { issue: 42, verificationReport: 'All checks passed.' });
    git(work, ['push', 'origin', 'main']);

    const parent = runHelper(work, ['--parent-issue', '42']);
    const publication = runHelper(work, ['--spec', 'specs/feature-umbrella', '--source', sourceCommit]);
    const audit = runHelper(work, ['--all']);

    expect(parent.status).toBe('canonical');
    expect(publication.status).toBe('canonical');
    expect(publication.sourceTree).toBe(publication.defaultTree);
    expect(audit.status).toBe('canonical');
    expect(audit.gaps).toEqual([]);
    expect(audit.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'specs/feature-umbrella', status: 'canonical' }),
    ]));
  });

  test('includes verification report content in exact publication identity', () => {
    const { work } = createFixture();
    commitSpec(work, { issue: 42, verificationReport: 'Default evidence.' });
    git(work, ['push', 'origin', 'main']);
    git(work, ['checkout', '-b', 'changed-verification']);
    write(work, 'specs/feature-umbrella/verification-report.md', '# Verification Report\n\nChanged evidence.\n');
    git(work, ['add', 'specs/feature-umbrella/verification-report.md']);
    git(work, ['commit', '-m', 'docs: update verification evidence']);
    const sourceCommit = git(work, ['rev-parse', 'HEAD']);

    const publication = runHelper(work, ['--spec', 'specs/feature-umbrella', '--source', sourceCommit]);

    expect(publication.status).toBe('divergent');
    expect(publication.sourceTree).not.toBe(publication.defaultTree);
  });

  test('recognizes a canonical default tree with its seal marker retained', () => {
    const { work } = createFixture();
    commitSpec(work, { issue: 42 });
    git(work, ['push', 'origin', 'main']);

    const result = runHelper(work, ['--parent-issue', '42']);

    expect(result.status).toBe('canonical');
    expect(result.reasonCode).toBe('default_tree_and_marker_present');
    expect(result.specPath).toBe('specs/feature-umbrella');
    expect(result.defaultTree).toMatch(/^[0-9a-f]{40}$/);
  });

  test('recognizes an exact squash-shaped publication when the marker is lost', () => {
    const { work, sourceCommit, specPath } = createStranded();
    git(work, ['restore', `--source=${sourceCommit}`, '--worktree', '--', specPath]);
    git(work, ['add', specPath]);
    git(work, ['commit', '-m', 'docs: publish umbrella spec']);
    git(work, ['push', 'origin', 'main']);

    const parent = runHelper(work, ['--parent-issue', '42']);
    const publication = runHelper(work, ['--spec', specPath, '--source', sourceCommit]);

    expect(parent.status).toBe('canonical_marker_lost');
    expect(publication.status).toBe('canonical_marker_lost');
    expect(publication.defaultTree).toBe(publication.sourceTree);
  });

  test('classifies one missing-default source tree as stranded and recoverable', () => {
    const { work, sourceCommit, specPath } = createStranded();

    const publication = runHelper(work, ['--spec', specPath, '--source', sourceCommit]);
    const audit = runHelper(work, ['--all']);

    expect(publication.status).toBe('stranded_recoverable');
    expect(publication.defaultTree).toBeNull();
    const finding = audit.findings.find(({ path: findingPath }) => findingPath === specPath);
    expect(finding.status).toBe('stranded_recoverable');
    expect(finding.candidates).toHaveLength(1);
    expect(finding.candidates[0].sourceCommits).toContain(sourceCommit);
  });

  test('preserves default as canonical when the source tree diverges', () => {
    const { work } = createFixture();
    commitSpec(work, { issue: 42, revision: 'default' });
    git(work, ['push', 'origin', 'main']);
    git(work, ['checkout', '-b', 'different-seal']);
    const sourceCommit = commitSpec(work, { issue: 42, revision: 'different' });

    const result = runHelper(work, ['--spec', 'specs/feature-umbrella', '--source', sourceCommit]);

    expect(result.status).toBe('divergent');
    expect(result.defaultTree).not.toBe(result.sourceTree);
  });

  test('reports multiple source identities for one absent path as ambiguous', () => {
    const { work } = createFixture();
    git(work, ['checkout', '-b', 'seal-one']);
    commitSpec(work, { issue: 42, revision: 'one' });
    git(work, ['checkout', 'main']);
    git(work, ['checkout', '-b', 'seal-two']);
    commitSpec(work, { issue: 42, revision: 'two' });
    git(work, ['checkout', 'main']);

    const audit = runHelper(work, ['--all']);
    const finding = audit.findings.find(({ path: findingPath }) => findingPath === 'specs/feature-umbrella');

    expect(finding.status).toBe('ambiguous');
    expect(finding.reasonCode).toBe('default_path_missing_multiple_trees');
    expect(finding.candidates).toHaveLength(2);
  });

  test('fails closed when origin cannot be discovered', () => {
    const work = temporary('nmg-umbrella-no-origin-');
    git(work, ['init', '--initial-branch=main']);
    git(work, ['config', 'user.name', 'Umbrella Test']);
    git(work, ['config', 'user.email', 'umbrella@example.test']);
    write(work, 'README.md', '# fixture\n');
    git(work, ['add', 'README.md']);
    git(work, ['commit', '-m', 'chore: initialize']);

    const result = runHelper(work, ['--all']);

    expect(result.status).toBe('unverifiable');
    expect(result.reasonCode).toBe('origin_unavailable');
    expect(result.gaps[0]).toBeTruthy();
  });

  test('refreshes remote objects without changing local refs', () => {
    const { bare, work } = createFixture();
    const publisher = temporary('nmg-umbrella-publisher-');
    git(publisher, ['clone', bare, '.']);
    git(publisher, ['config', 'user.name', 'Publisher']);
    git(publisher, ['config', 'user.email', 'publisher@example.test']);
    commitSpec(publisher, { issue: 42 });
    git(publisher, ['push', 'origin', 'main']);
    const refsBefore = git(work, ['show-ref']);

    const result = runHelper(work, ['--parent-issue', '42']);

    expect(result.status).toBe('canonical');
    expect(git(work, ['show-ref'])).toBe(refsBefore);
    expect(git(work, ['rev-parse', 'refs/remotes/origin/main'])).not.toBe(result.defaultCommit);
  });

  test('includes the freshly fetched default tree in audit without updating its tracking ref', () => {
    const { bare, work } = createFixture();
    const publisher = temporary('nmg-umbrella-audit-publisher-');
    git(publisher, ['clone', bare, '.']);
    git(publisher, ['config', 'user.name', 'Publisher']);
    git(publisher, ['config', 'user.email', 'publisher@example.test']);
    commitSpec(publisher, { issue: 42 });
    git(publisher, ['push', 'origin', 'main']);
    const trackingBefore = git(work, ['rev-parse', 'refs/remotes/origin/main']);

    const result = runHelper(work, ['--all']);
    const finding = result.findings.find(({ path: findingPath }) => findingPath === 'specs/feature-umbrella');

    expect(finding.status).toBe('canonical');
    expect(git(work, ['rev-parse', 'refs/remotes/origin/main'])).toBe(trackingBefore);
  });

  test('rejects a committed symlink anywhere inside the source spec tree', () => {
    const { work } = createFixture();
    git(work, ['checkout', '-b', 'symlink-seal']);
    writeSpec(work, { issue: 42 });
    fs.unlinkSync(path.join(work, 'specs/feature-umbrella/tasks.md'));
    fs.symlinkSync('../../outside', path.join(work, 'specs/feature-umbrella/tasks.md'));
    git(work, ['add', 'specs/feature-umbrella']);
    git(work, ['commit', '-m', 'docs: seal umbrella spec for #42']);
    const sourceCommit = git(work, ['rev-parse', 'HEAD']);

    const result = runHelper(work, ['--spec', 'specs/feature-umbrella', '--source', sourceCommit]);

    expect(result.status).toBe('unverifiable');
    expect(result.reasonCode).toBe('source_spec_invalid');
    expect(result.gaps[0]).toContain('symlink_not_allowed');
  });

  test('fails closed on a committed symlink in a canonical parent tree', () => {
    const { work } = createFixture();
    writeSpec(work, { issue: 42 });
    fs.unlinkSync(path.join(work, 'specs/feature-umbrella/tasks.md'));
    fs.symlinkSync('../../outside', path.join(work, 'specs/feature-umbrella/tasks.md'));
    git(work, ['add', 'specs/feature-umbrella']);
    git(work, ['commit', '-m', 'docs: seal umbrella spec for #42']);
    git(work, ['push', 'origin', 'main']);

    const result = runHelper(work, ['--parent-issue', '42']);

    expect(result.status).toBe('unverifiable');
    expect(result.reasonCode).toBe('default_spec_invalid');
    expect(result.gaps[0]).toContain('symlink_not_allowed');
  });

  test('fails closed when a source tree is missing a required spec file', () => {
    const { work } = createFixture();
    git(work, ['checkout', '-b', 'incomplete-seal']);
    writeSpec(work, { issue: 42 });
    fs.unlinkSync(path.join(work, 'specs/feature-umbrella/tasks.md'));
    git(work, ['add', 'specs/feature-umbrella']);
    git(work, ['commit', '-m', 'docs: seal umbrella spec for #42']);
    const sourceCommit = git(work, ['rev-parse', 'HEAD']);

    const result = runHelper(work, ['--spec', 'specs/feature-umbrella', '--source', sourceCommit]);

    expect(result.status).toBe('unverifiable');
    expect(result.reasonCode).toBe('source_spec_invalid');
    expect(result.gaps[0]).toContain('missing_spec_entry:specs/feature-umbrella/tasks.md');

    const audit = runHelper(work, ['--all']);

    expect(audit.status).toBe('findings');
    expect(audit.reasonCode).toBe('audit_complete');
    expect(audit.gaps[0]).toContain('missing_spec_entry:specs/feature-umbrella/tasks.md');
  });

  test('fails closed when a source tree contains a fifth spec artifact', () => {
    const { work } = createFixture();
    git(work, ['checkout', '-b', 'extra-file-seal']);
    writeSpec(work, { issue: 42 });
    write(work, 'specs/feature-umbrella/seal.json', '{}\n');
    git(work, ['add', 'specs/feature-umbrella']);
    git(work, ['commit', '-m', 'docs: seal umbrella spec for #42']);
    const sourceCommit = git(work, ['rev-parse', 'HEAD']);

    const result = runHelper(work, ['--spec', 'specs/feature-umbrella', '--source', sourceCommit]);

    expect(result.status).toBe('unverifiable');
    expect(result.reasonCode).toBe('source_spec_invalid');
    expect(result.gaps[0]).toContain('unexpected_spec_entry:specs/feature-umbrella/seal.json');
  });

  test('isolates an unrelated invalid candidate from a targeted parent lookup', () => {
    const { work } = createFixture();
    git(work, ['checkout', '-b', 'a-invalid-unrelated']);
    commitSpec(work, {
      issue: 99,
      specPath: 'specs/feature-invalid',
      duplicateIssueFrontmatter: true,
    });
    git(work, ['rm', 'specs/feature-invalid/design.md']);
    write(work, 'specs/feature-invalid/seal.json', '{}\n');
    git(work, ['add', 'specs/feature-invalid/seal.json']);
    git(work, ['commit', '-m', 'docs: make unrelated candidate invalid']);
    git(work, ['checkout', 'main']);
    git(work, ['checkout', '-b', 'z-valid-target']);
    const sourceCommit = commitSpec(work, {
      issue: 42,
      specPath: 'specs/feature-target',
    });
    git(work, ['checkout', 'main']);

    const result = runHelper(work, ['--parent-issue', '42']);

    expect(result.status).toBe('stranded_recoverable');
    expect(result.specPath).toBe('specs/feature-target');
    expect(result.candidates[0].sourceCommits).toContain(sourceCommit);
  });

  test('fails closed when malformed frontmatter claims the targeted parent', () => {
    const { work } = createFixture();
    git(work, ['checkout', '-b', 'invalid-target']);
    commitSpec(work, { issue: 42, duplicateIssueFrontmatter: true });
    git(work, ['checkout', 'main']);

    const result = runHelper(work, ['--parent-issue', '42']);

    expect(result.status).toBe('unverifiable');
    expect(result.reasonCode).toBe('candidate_scan_failed');
    expect(result.gaps[0]).toContain('invalid_issue_frontmatter');
  });

  test('fails closed when malformed default-branch frontmatter claims the targeted parent', () => {
    const { work } = createFixture();
    commitSpec(work, { issue: 42, duplicateIssueFrontmatter: true });
    git(work, ['push', 'origin', 'main']);

    const result = runHelper(work, ['--parent-issue', '42']);

    expect(result.status).toBe('unverifiable');
    expect(result.reasonCode).toBe('default_spec_invalid');
    expect(result.specPath).toBe('specs/feature-umbrella');
    expect(result.gaps[0]).toContain('invalid_issue_frontmatter');
  });

  test('retains valid audit findings alongside candidate-specific validation gaps', () => {
    const { work } = createFixture();
    git(work, ['checkout', '-b', 'a-invalid-audit']);
    commitSpec(work, {
      issue: 99,
      specPath: 'specs/feature-invalid',
      duplicateIssueFrontmatter: true,
    });
    git(work, ['checkout', 'main']);
    git(work, ['checkout', '-b', 'z-valid-audit']);
    commitSpec(work, {
      issue: 42,
      specPath: 'specs/feature-valid',
      verificationReport: 'Verified.',
    });
    git(work, ['checkout', 'main']);

    const audit = runHelper(work, ['--all']);

    expect(audit.status).toBe('findings');
    expect(audit.reasonCode).toBe('audit_complete');
    expect(audit.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'specs/feature-valid',
        status: 'stranded_recoverable',
      }),
    ]));
    expect(audit.gaps).toHaveLength(1);
    expect(audit.gaps[0]).toContain('refs/heads/a-invalid-audit:specs/feature-invalid: invalid_issue_frontmatter');
  });

  test('is deterministic across repeated read-only runs', () => {
    const { work } = createStranded();
    const statusBefore = git(work, ['status', '--porcelain=v1', '--untracked-files=all']);
    const refsBefore = git(work, ['show-ref']);

    const first = runHelper(work, ['--all']);
    const second = runHelper(work, ['--all']);

    expect(second).toEqual(first);
    expect(git(work, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe(statusBefore);
    expect(git(work, ['show-ref'])).toBe(refsBefore);
  });

  test('rejects traversal before inspecting Git state', () => {
    const { work } = createFixture();
    const result = spawnSync(process.execPath, [
      helper,
      '--project', work,
      '--spec', 'specs/../outside',
      '--source', 'HEAD',
      '--json',
    ], { encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--spec must be a normalized path below specs/');
  });
});
