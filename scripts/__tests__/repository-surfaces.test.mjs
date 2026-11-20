// This repository's scoped-verification adoption: @SCN012 (onboard/upgrade) and @SCN013 (repository adoption).
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSteeringRuntime } from '../../src/sdlc-steering-runtime.mjs';
import { runsInTier } from '../../src/sdlc-verification-runtime.mjs';
import { matches } from '../../src/sdlc-glob.mjs';
import { loadTestCoverageConfig, validateCoverageReport } from '../test-coverage.mjs';
import { detectVerificationScope } from '../verification-scope.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');
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
    expect(runtime.selection.fallbackPaths).toEqual(expect.arrayContaining(['hooks/**', '.claude-plugin/**', 'steering/manifest.json']));
    expect(runtime.selection.coveragePaths).toEqual(expect.arrayContaining(['src/**/*.mjs', 'scripts/*.mjs']));
    expect(runtime.surfaces.filter((surface) => surface.validations.includes('repository.nmg-sdlc-smoke')).map(({ id }) => id))
      .toEqual(['draft-issue', 'write-spec', 'onboard-project', 'upgrade-project', 'steering', 'run-retro', 'execute']);
  });

  it('keeps a full-tier copy of the suite and the smoke, so /sdlc-verify-full still runs both', async () => {
    const runtime = await loadSteeringRuntime(repoRoot, { metadataOnly: true });
    expect(runtime.tiered).toBe(true);
    const ids = (tier) => runtime.validations.filter((validation) => runsInTier(runtime.tiered, validation, tier)).map(({ id }) => id);
    expect(ids('full')).toEqual(['repository.tests.full', 'repository.nmg-sdlc-smoke.full']);
    expect(ids('change')).toEqual(['repository.tests', 'repository.nmg-sdlc-smoke']);
    const byId = Object.fromEntries(runtime.validations.map((validation) => [validation.id, validation]));
    expect(byId['repository.tests.full']).toMatchObject({ provider: 'builtin.command', required: true, tier: 'full', config: byId['repository.tests'].config });
    expect(byId['repository.tests.full'].selection).toBeUndefined();
    expect(byId['repository.nmg-sdlc-smoke.full']).toMatchObject({ provider: 'project.nmg-sdlc-smoke', required: true, tier: 'full', config: byId['repository.nmg-sdlc-smoke'].config });
    expect(runtime.surfaces.some((surface) => surface.validations.some((id) => id.endsWith('.full')))).toBe(false);
  });

  it('routes the repository-relative test id convention to the selection prompt', async () => {
    const runtime = await loadSteeringRuntime(repoRoot, { metadataOnly: true });
    expect(runtime.manifest.snippets).toContainEqual({ id: 'project.selection', path: 'steering/snippets/project-selection.md',
      consumers: ['gate:selection'], slot: 'body', order: 500 });
    expect(read('steering/snippets/project-selection.md')).toContain('`scripts/__tests__/<name>.test.mjs`');
  });

  it('leaves nothing for verification-scope detection to propose', () => {
    expect(detectVerificationScope(repoRoot)).toBeNull();
  });

  it.each(['references/steering-schema.md', 'README.md', 'steering/snippets/project-tech.md'])('documents scoped selection in %s', (file) => {
    const text = read(file);
    for (const term of ['gate:selection', 'selection_escalation', 'surface_not_selected', 'selection_uncovered', 'selection_unaccounted']) {
      expect(text).toContain(term);
    }
  });

  it('documents the select mode, the checks and escalation in the verify and execute workflows', () => {
    const verify = read('workflows/verify-code/WORKFLOW.md');
    expect(verify).toContain('--mode select');
    expect(verify).toContain('selection_escalation');
    expect(verify).not.toContain('selection_data_stale');
    expect(read('commands/sdlc-verify-code.md')).toContain('--mode select');
    const execute = read('workflows/execute/WORKFLOW.md');
    expect(execute).toContain('selection_escalation');
    expect(execute).toContain('redispatch --text');
  });
});

describe('@SCN012 Onboard and upgrade enforce the configuration', () => {
  it.each(['workflows/onboard-project/WORKFLOW.md', 'workflows/upgrade-project/WORKFLOW.md', 'references/verification-scope.md'])(
    '%s runs verification-scope detect and apply', (file) => {
      const text = read(file);
      expect(text).toContain('scripts/verification-scope.mjs" detect --root .');
      expect(text).toMatch(/verification-scope\.mjs"?,?\s*"?apply/);
      if (file.startsWith('workflows/')) expect(text).toContain('../../references/verification-scope.md');
    });

  it('derives plugin and non-plugin surface maps and applies only after approval', () => {
    const text = read('references/verification-scope.md');
    expect(text).toContain('one surface per command, per agent and per hooks module');
    expect(text).toContain('per feature or user-facing area, per entry point');
    expect(text).toContain('After approval');
    expect(text).toContain('verification_scope_plan_stale');
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

  it('prints a valid per-test report with repository-relative src/ coverage and executable lines', () => {
    const run = runCoverage([subjectTest]);
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
