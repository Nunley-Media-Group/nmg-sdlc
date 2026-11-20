// This repository's scoped-verification adoption: @SCN012 (onboard/upgrade) and @SCN013 (repository adoption).
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadSteeringRuntime } from '../../src/sdlc-steering-runtime.mjs';
import { runsInTier } from '../../src/sdlc-verification-runtime.mjs';
import { collect } from '../jest-per-test-coverage.mjs';
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

  it('records only the hit statements and branch locations as covered, and every statement line as executable', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-jest-coverage-')));
    try {
      const source = path.join(root, 'src', 'demo.mjs');
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, ['const a = 1;', '', 'if (a) run();', 'else skip();', 'done();'].join('\n'));
      const coverage = { [source]: {
        path: source,
        statementMap: { 0: { start: { line: 1, column: 0 } }, 1: { start: { line: 2, column: 0 } }, 2: { start: { line: 3, column: 0 } },
          3: { start: { line: 4, column: 5 } }, 4: { start: { line: 5, column: 0 } } },
        s: { 0: 1, 1: 4, 2: 2, 3: 0, 4: 0 },
        branchMap: { 0: { locations: [{ start: { line: 3, column: 7 } }, { start: { line: 4, column: 5 } }] } },
        b: { 0: [2, 0] },
      } };
      const results = { success: true, testResults: [{ status: 'passed', assertionResults: [{ fullName: 'demo works', status: 'passed' }] }] };
      const executable = new Set();
      const { test, failed } = collect('scripts/__tests__/demo.test.mjs', results, coverage, executable, root);
      expect(failed).toBe(false);
      // Line 2 is blank, so it is neither executable nor covered, whatever its count.
      expect([...executable].sort()).toEqual(['src/demo.mjs:1', 'src/demo.mjs:3', 'src/demo.mjs:4', 'src/demo.mjs:5']);
      expect(test.lines).toEqual(['src/demo.mjs:1', 'src/demo.mjs:3']);
      expect(test.branches).toEqual(['src/demo.mjs:3:7']);
      expect(test.outcomes).toEqual(['scripts/__tests__/demo.test.mjs::demo works:passed']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('leaves out files outside the repository and reports a failed assertion or suite', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-jest-coverage-')));
    try {
      const outside = path.join(os.tmpdir(), 'nmg-outside-demo.mjs');
      const coverage = { [outside]: { path: outside, statementMap: { 0: { start: { line: 1, column: 0 } } }, s: { 0: 1 }, branchMap: {}, b: {} } };
      const executable = new Set();
      const results = { success: false, testResults: [{ status: 'failed', assertionResults: [] }, { status: 'failed', assertionResults: [{ fullName: 'x', status: 'failed' }] }] };
      const { test, failed } = collect('scripts/__tests__/demo.test.mjs', results, coverage, executable, root);
      expect(failed).toBe(true);
      expect(executable.size).toBe(0);
      expect(test.lines).toEqual([]);
      expect(test.outcomes).toEqual(['scripts/__tests__/demo.test.mjs::(suite):failed', 'scripts/__tests__/demo.test.mjs::x:failed']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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
    // Some executable statements of the covered modules are not run by this one test file.
    expect(report.executableLines.filter((line) => line.startsWith('scripts/sdlc-models.mjs:') && !test.lines.includes(line)).length).toBeGreaterThan(0);
    for (const outcome of test.outcomes) expect(outcome.startsWith(`${subjectTest}::`)).toBe(true);
    expect(test.outcomes.some((outcome) => outcome.endsWith(':passed'))).toBe(true);
  }, 120000);

  it('rejects missing and non-repository-relative arguments with a usage error', () => {
    expect(runCoverage([]).status).toBe(2);
    expect(runCoverage(['../outside.test.mjs']).status).toBe(2);
    expect(runCoverage([path.join(repoRoot, subjectTest)]).status).toBe(2);
    expect(runCoverage(['scripts\\__tests__\\x.test.mjs']).status).toBe(2);
  });
});
