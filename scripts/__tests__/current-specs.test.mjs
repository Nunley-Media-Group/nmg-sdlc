import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CURRENT_SPEC_DIRECTORIES, verifyCurrentSpecs, verifySpecArchive } from '../verify-current-specs.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function writeSpecPackage(specsRoot, directory, issue, gherkinIssue = `**Issue**: #${issue}`) {
  const directoryPath = path.join(specsRoot, directory);
  fs.mkdirSync(directoryPath, { recursive: true });
  for (const artifact of ['requirements.md', 'design.md', 'tasks.md']) {
    fs.writeFileSync(path.join(directoryPath, artifact), `# ${artifact}\n\n**Issue**: #${issue}\n**Status**: Approved\n`);
  }
  fs.writeFileSync(path.join(directoryPath, 'feature.gherkin'), `${gherkinIssue}\n**Status**: Approved\nFeature: Example\n`);
}

describe('current release specs and rewrite contract', () => {
  test('retain only genuinely owned specs and cover the complete current surface', () => {
    expect(CURRENT_SPEC_DIRECTORIES).toHaveLength(16);
    expect(verifyCurrentSpecs(repoRoot)).toEqual([]);
  });

  test('keeps historical rewrite release independent from current package version', () => {
    const rewriteContract = JSON.parse(fs.readFileSync(path.join(repoRoot, 'references/rewrite-contract.json'), 'utf8'));
    const packageVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;

    expect(rewriteContract.release).not.toBe(packageVersion);
    expect(verifyCurrentSpecs(repoRoot)).toEqual([]);
  });

  test('allows an extra well-formed approved spec package', () => {
    const specsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-specs-'));
    try {
      writeSpecPackage(specsRoot, '1-foo', 1);
      writeSpecPackage(specsRoot, '199-bar', 199);

      expect(verifySpecArchive(specsRoot, ['1-foo'])).toEqual([]);
    } finally {
      fs.rmSync(specsRoot, { recursive: true, force: true });
    }
  });

  test('rejects an incomplete extra spec package', () => {
    const specsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-specs-'));
    try {
      writeSpecPackage(specsRoot, '1-foo', 1);
      writeSpecPackage(specsRoot, '199-bar', 199);
      fs.rmSync(path.join(specsRoot, '199-bar', 'tasks.md'));

      expect(verifySpecArchive(specsRoot, ['1-foo'])).toContain('Missing 199-bar/tasks.md');
    } finally {
      fs.rmSync(specsRoot, { recursive: true, force: true });
    }
  });

  test('accepts legacy gherkin issue headings', () => {
    const specsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-specs-'));
    try {
      writeSpecPackage(specsRoot, '1-foo', 1, '# Issue: #1');

      expect(verifySpecArchive(specsRoot, ['1-foo'])).toEqual([]);
    } finally {
      fs.rmSync(specsRoot, { recursive: true, force: true });
    }
  });

  test('ignores stale-pattern examples inside fenced code', () => {
    const specsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-specs-'));
    try {
      writeSpecPackage(specsRoot, '2-code-sample', 2);
      fs.appendFileSync(
        path.join(specsRoot, '2-code-sample', 'design.md'),
        '\n```text\nCodex unattended mode under .codex/\n```\n',
      );

      expect(verifySpecArchive(specsRoot, ['2-code-sample'])).toEqual([]);
    } finally {
      fs.rmSync(specsRoot, { recursive: true, force: true });
    }
  });
});
