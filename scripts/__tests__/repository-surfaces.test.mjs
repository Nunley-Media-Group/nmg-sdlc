// This repository's scoped-verification adoption: @SCN013 (repository adoption).
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSteeringRuntime } from '../../src/sdlc-steering-runtime.mjs';
import { matches } from '../../src/sdlc-glob.mjs';
import { requiredSurfaces } from '../../src/sdlc-test-selection.mjs';
import { loadTestCoverageConfig, validateCoverageReport } from '../test-coverage.mjs';
import { detectVerificationScope } from '../verification-scope.mjs';
import { expandTestPaths, testFileArgument } from '../jest-per-test-coverage.mjs';
import os from 'node:os';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLUGIN_DIRS = ['workflows/', 'agents/', 'references/', 'commands/', 'hooks/', '.claude-plugin/'];

/** Tracked files plus untracked, non-ignored ones, so a file added on a branch is checked before its commit. */
function repositoryFiles() {
  const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return [...new Set(result.stdout.split('\0').filter(Boolean))].filter((file) => fs.existsSync(path.join(repoRoot, file)));
}

describe('@SCN013 This repository adopts scoped verification', () => {
  it('maps every tracked plugin file to at least one surface', async () => {
    const runtime = await loadSteeringRuntime(repoRoot, { metadataOnly: true });
    const pluginFiles = repositoryFiles().filter((file) => PLUGIN_DIRS.some((dir) => file.startsWith(dir)));
    expect(pluginFiles.length).toBeGreaterThan(50);
    const unmapped = pluginFiles.filter((file) => !runtime.surfaces.some((surface) => matches(file, surface.sources)));
    expect(unmapped).toEqual([]);
  });

  it('opts repository.tests into the selection and binds the smoke to its seven surfaces', async () => {
    const runtime = await loadSteeringRuntime(repoRoot, { metadataOnly: true });
    expect(runtime.validations.find((validation) => validation.id === 'repository.tests')).toMatchObject({ tier: 'change', selection: true });
    expect(runtime.selection.docPaths).toEqual(expect.arrayContaining(['README.md', 'CHANGELOG.md', 'specs/**']));
    expect(runtime.selection.fallbackPaths).toEqual(['hooks/**', 'tsconfig.json', '.gitignore', 'scripts/package.json', 'scripts/package-lock.json',
      'steering/manifest.json', 'steering/extensions/**', 'src/*.d.mts']);
    // Delivery's version commit changes only doc paths, so it forces no full run and requires no surface.
    expect(runtime.selection.docPaths).toEqual(expect.arrayContaining(['VERSION', 'CHANGELOG.md', 'package.json', '.claude-plugin/plugin.json']));
    expect(requiredSurfaces(runtime.surfaces, ['VERSION', 'CHANGELOG.md', 'package.json', '.claude-plugin/plugin.json'], runtime.selection.docPaths)).toEqual([]);
    expect(runtime.selection.coveragePaths).toEqual(expect.arrayContaining(['src/**/*.mjs', 'scripts/*.mjs']));
    expect(runtime.surfaces.filter((surface) => surface.validations.includes('repository.nmg-sdlc-smoke')).map(({ id }) => id))
      .toEqual(['draft-issue', 'write-spec', 'onboard-project', 'upgrade-project', 'steering', 'run-retro', 'execute']);
  });

  it.each(['references/steering-schema.md', 'README.md', 'steering/snippets/project-tech.md'])('documents the selection, its escalation and surface skips in %s', (rel) => {
    const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    for (const term of ['gate:selection', 'selection_escalation', 'surface_not_selected']) expect(text).toContain(term);
  });

  it('leaves nothing for verification-scope detection to propose', () => {
    expect(detectVerificationScope(repoRoot)).toBeNull();
  });
});

const coverageScript = path.join(repoRoot, 'scripts', 'jest-per-test-coverage.mjs');
const subjectTest = 'scripts/__tests__/sdlc-models.test.mjs';
function runCoverage(args) {
  const env = { ...process.env };
  delete env.JEST_WORKER_ID;
  return spawnSync(process.execPath, [coverageScript, ...args], { cwd: repoRoot, env, shell: false, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

describe('@SCN013 This repository adopts scoped verification: the Jest per-test coverage command', () => {
  it('declares the suite and the per-test coverage command in steering/test-coverage.json', () => {
    expect(loadTestCoverageConfig(repoRoot)).toEqual({ config: { version: 1,
      suite: { program: 'npm', args: ['--prefix', 'scripts', 'test', '--', '--runInBand'] },
      coverage: { program: 'node', args: ['scripts/jest-per-test-coverage.mjs'] } } });
  });

  it('prints a valid per-test report with repository-relative src/ coverage and executable lines for the ids the gate appends', () => {
    // The gate appends selected ids as the selection call wrote them: a `./` prefix, a `::` suffix or a directory.
    expect(['./scripts/__tests__/', 'scripts/__tests__/./', 'scripts//__tests__', `${subjectTest}::adds`].map(testFileArgument))
      .toEqual(['scripts/__tests__', 'scripts/__tests__', 'scripts/__tests__', subjectTest]);
    expect(['./', '../x', '/abs/a.test.mjs', 'a/../../x', 'a\\b.test.mjs'].map(testFileArgument)).toEqual([null, null, null, null, null]);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-584-expand-'));
    try {
      for (const file of ['t/__tests__/a.test.mjs', 't/__tests__/helper.mjs', 't/b.spec.mjs', 't/c.mjs', 't/__tests__/notes.md',
        't/__fixtures__/d.test.mjs', 't/node_modules/e.test.mjs']) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), '');
      }
      expect(expandTestPaths(['t/', 'x/one.test.mjs'], root)).toEqual(['t/__tests__/a.test.mjs', 't/__tests__/helper.mjs', 't/b.spec.mjs', 'x/one.test.mjs']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
    const run = runCoverage([`./${subjectTest}`]);
    expect(run.status).toBe(0);
    const report = validateCoverageReport(JSON.parse(run.stdout));
    expect(report.tests).toHaveLength(1);
    const [test] = report.tests;
    expect(test).toMatchObject({ id: subjectTest, file: subjectTest });
    expect(test.lines.some((line) => /^src\/stage-models\.mjs:\d+$/.test(line))).toBe(true);
    expect(test.lines.some((line) => /^scripts\/sdlc-models\.mjs:\d+$/.test(line))).toBe(true);
    expect([...test.lines, ...report.executableLines].some((line) => /node_modules|__tests__|__fixtures__/.test(line) || path.isAbsolute(line))).toBe(false);
    const executable = new Set(report.executableLines);
    expect(test.lines.filter((line) => !executable.has(line))).toEqual([]);
    // Only the statements this test file runs are hit: other executable statements of the covered modules are not.
    expect(report.executableLines.filter((line) => line.startsWith('scripts/sdlc-models.mjs:') && !test.lines.includes(line)).length).toBeGreaterThan(0);
    expect(test.branches.some((branch) => /^(src\/stage-models|scripts\/sdlc-models)\.mjs:\d+:\d+$/.test(branch))).toBe(true);
    for (const outcome of test.outcomes) expect(outcome.startsWith(`${subjectTest}::`)).toBe(true);
    expect(test.outcomes.some((outcome) => outcome.endsWith(':passed'))).toBe(true);
  }, 120000);
});
