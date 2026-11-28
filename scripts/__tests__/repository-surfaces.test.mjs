// This repository's scoped-verification adoption: @SCN013 (repository adoption).
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSteeringRuntime } from '../../src/sdlc-steering-runtime.mjs';
import { matches } from '../../src/sdlc-glob.mjs';
import { requiredSurfaces } from '../../src/sdlc-test-selection.mjs';
import { expandEntries, loadTestCoverageConfig, validateCoverageReport } from '../test-coverage.mjs';
import { detectVerificationScope } from '../verification-scope.mjs';
import { jestArguments } from '../jest-per-test-coverage.mjs';

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

  it('directs the verify worker to select, exercise only the selected surfaces and provision only for execute, draft-issue or write-spec', () => {
    const snippet = fs.readFileSync(path.join(repoRoot, 'steering/snippets/project-smoke.md'), 'utf8');
    for (const required of [
      'scripts/sdlc-verify-steering.mjs --project . --issue N --spec specs/N-SLUG --base main --mode select',
      'When no smoke surface is selected, do nothing more here: the gate records `surface_not_selected`.',
      'Provision (steps 2–5) only when `execute`, `draft-issue` or `write-spec` is selected.',
      'When `draft-issue` or `write-spec` is selected, provision a fresh smoke issue',
      '.nmg-sdlc/smoke/surfaces/<surface>.json',
      'Surface records are bound to the head they were made at.',
    ]) {
      expect(snippet).toContain(required);
    }
    for (const heading of ['Select', 'Exercise surfaces']) {
      expect(snippet).toMatch(new RegExp(`^## \\d\\. ${heading}$`, 'm'));
    }
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
      suite: { program: 'npm', args: ['--prefix', 'scripts', 'test', '--'] },
      coverage: { program: 'node', args: ['scripts/jest-per-test-coverage.mjs'] } } });
  });

  it('prints a valid per-test report with repository-relative src/ coverage and executable lines for the ids the gate appends', () => {
    const run = runCoverage([`./${subjectTest}`]);
    expect(run.status).toBe(0);
    const report = validateCoverageReport(JSON.parse(run.stdout));
    expect(report.tests).toHaveLength(1);
    const [test] = report.tests;
    // The report is held in its compact range form; the assertions read its entries expanded.
    const lines = expandEntries('lines', test.lines);
    const branches = expandEntries('branches', test.branches);
    const executableLines = expandEntries('lines', report.executableLines);
    expect(test).toMatchObject({ id: subjectTest, file: subjectTest });
    expect(lines.some((line) => /^src\/stage-models\.mjs:\d+$/.test(line))).toBe(true);
    expect(lines.some((line) => /^scripts\/sdlc-models\.mjs:\d+$/.test(line))).toBe(true);
    expect([...lines, ...executableLines].some((line) => /node_modules|__tests__|__fixtures__/.test(line) || path.isAbsolute(line))).toBe(false);
    const executable = new Set(executableLines);
    expect(lines.filter((line) => !executable.has(line))).toEqual([]);
    // Only the statements this test file runs are hit: other executable statements of the covered modules are not.
    expect(executableLines.filter((line) => line.startsWith('scripts/sdlc-models.mjs:') && !lines.includes(line)).length).toBeGreaterThan(0);
    expect(branches.some((branch) => /^(src\/stage-models|scripts\/sdlc-models)\.mjs:\d+:\d+$/.test(branch))).toBe(true);
    for (const outcome of test.outcomes) expect(outcome).not.toContain(subjectTest);
    expect(test.outcomes.some((outcome) => outcome.endsWith(':passed'))).toBe(true);
  }, 120000);

  it('runs each selected test file by path, behind ./ when it would read as an option', () => {
    const tail = (file) => jestArguments(file, '/tmp/results.json', '/tmp/cov').slice(-2);
    expect(tail('scripts/__tests__/a.test.mjs')).toEqual(['--runTestsByPath', '__tests__/a.test.mjs']);
    expect(tail('scripts/--config=evil.json')).toEqual(['--runTestsByPath', './--config=evil.json']);
  });
});

describe('this repository runs its contract suite in parallel and checks it before the implement handoff (#642)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'steering', 'manifest.json'), 'utf8'));
  it.each(['repository.tests', 'repository.tests.full'])('@SCN004 %s runs Jest with its parallel workers in a heavy-job slot', (id) => {
    const validation = manifest.validations.find((entry) => entry.id === id);
    expect(validation.config).toMatchObject({ program: 'npm', args: ['test', '--'], cwd: 'scripts' });
    expect(validation.heavy).toBe(true);
  });

  it('@SCN004 the coverage suite command runs Jest with its parallel workers', () => {
    expect(loadTestCoverageConfig(repoRoot).config.suite).toEqual({ program: 'npm', args: ['--prefix', 'scripts', 'test', '--'] });
  });

  it('@SCN006 technical steering requires the whole contract suite before a passed implement handoff', () => {
    const tech = fs.readFileSync(path.join(repoRoot, 'steering', 'snippets', 'project-tech.md'), 'utf8');
    const start = tech.indexOf('### Checks Before the Implement Handoff');
    expect(start).toBeGreaterThanOrEqual(0);
    const section = tech.slice(start, tech.indexOf('\n## ', start));
    for (const required of ['Before writing a passed implement handoff', 'npm --prefix scripts test', 'sdlc-heavy-pool.mjs run',
      'claude plugin test .', 'scripts/verify-plugin-surface.mjs', 'scripts/check-test-layers.mjs', 'Repair every failure before the handoff']) {
      expect(section).toContain(required);
    }
  });
});

describe('this repository scopes fallback surfaces and keeps its suite parallel (#643)', () => {
  const INTERACTIVE = ['draft-issue', 'write-spec', 'onboard-project', 'upgrade-project', 'steering', 'run-retro'];
  const SMOKE = [...INTERACTIVE, 'execute'];

  it('@SCN006 a change to the hooks module or the smoke provider requires every surface it serves', async () => {
    const runtime = await loadSteeringRuntime(repoRoot, { metadataOnly: true });
    const docPaths = runtime.selection.docPaths;
    const bound = (paths) => requiredSurfaces(runtime.surfaces, paths, docPaths).filter((id) => SMOKE.includes(id));
    expect(bound(['hooks/register.ts'])).toEqual(SMOKE);
    expect(bound(['hooks/hooks.json'])).toEqual(SMOKE);
    expect(bound(['steering/extensions/nmg-sdlc-smoke.mjs'])).toEqual(['execute']);
    // Fallback paths that no live command reads require no smoke surface of their own.
    for (const file of ['.gitignore', 'tsconfig.json', 'scripts/package.json', 'scripts/package-lock.json', 'steering/manifest.json',
      'hooks/register.test.ts', 'src/host-events.d.mts']) {
      expect(matches(file, runtime.selection.fallbackPaths)).toBe(true);
      expect(bound([file])).toEqual([]);
    }
  });

  it('@SCN006 smoke steering tells the verify worker which earlier surface records still count', () => {
    const smoke = fs.readFileSync(path.join(repoRoot, 'steering', 'snippets', 'project-smoke.md'), 'utf8');
    for (const required of ['A record made at an earlier head still proves its surface', 'git diff --name-only <record head> <head>',
      'scripts/__tests__/', 'only its `"version"` line changed', 'do not exercise that surface again', 'Any other changed path makes the record stale']) {
      expect(smoke).toContain(required);
    }
  });

  it('@SCN007 the /sdlc-execute controller tests are spread over four files that share one fixture module', () => {
    const files = ['sdlc-execute.test.mjs', 'sdlc-execute-dispatch.test.mjs', 'sdlc-execute-supervision.test.mjs', 'sdlc-execute-queue.test.mjs'];
    let cases = 0;
    for (const file of files) {
      const text = fs.readFileSync(path.join(repoRoot, 'scripts', '__tests__', file), 'utf8');
      expect(text).toContain("from '../__fixtures__/sdlc-execute-fixture.mjs'");
      expect(text.split('\n').length).toBeLessThan(900);
      cases += (text.match(/^\s*(?:\(process\.platform[^\n]*\)|it|it\.each\([^\n]*)\(/gm) ?? []).length;
    }
    expect(cases).toBeGreaterThanOrEqual(120);
    // The fixture module is no test file: Jest collects only files under a __tests__ directory or named *.test.mjs.
    expect(fs.existsSync(path.join(repoRoot, 'scripts', '__fixtures__', 'sdlc-execute-fixture.mjs'))).toBe(true);
  });

  it('@SCN007 CI runs no job that selects tests by a name no test has', () => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'nmg-sdlc-verify.yml'), 'utf8');
    expect(workflow).not.toContain('--testNamePattern');
    expect(workflow).not.toContain('checkpoint-portability');
    expect(workflow).toContain('npm test');
  });
});
