import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTestCoverageConfig, validateCoverageReport } from '../test-coverage.mjs';

const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(scriptsDir, '..');
const script = path.join(scriptsDir, 'jest-per-test-coverage.mjs');
const subjectTest = 'scripts/__tests__/sdlc-models.test.mjs';

function runCoverage(args) {
  const env = { ...process.env };
  delete env.JEST_WORKER_ID;
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot, env, shell: false, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
}

describe('jest-per-test-coverage (#584 T013)', () => {
  it('declares the suite and this coverage command in steering/test-coverage.json', () => {
    expect(loadTestCoverageConfig(repoRoot)).toEqual({
      config: {
        version: 1,
        suite: { program: 'npm', args: ['--prefix', 'scripts', 'test', '--', '--runInBand'] },
        coverage: { program: 'node', args: ['scripts/jest-per-test-coverage.mjs'] },
      },
    });
  });

  it('prints a valid per-test report with repository-relative src/ coverage and executable lines', () => {
    const run = runCoverage([subjectTest]);
    expect(run.status).toBe(0);
    const report = validateCoverageReport(JSON.parse(run.stdout));
    expect(report.tests).toHaveLength(1);
    const [test] = report.tests;
    expect(test.id).toBe(subjectTest);
    expect(test.file).toBe(subjectTest);
    expect(test.lines.some((line) => /^src\/stage-models\.mjs:\d+$/.test(line))).toBe(true);
    expect(test.lines.some((line) => /^scripts\/sdlc-models\.mjs:\d+$/.test(line))).toBe(true);
    const all = [...test.lines, ...report.executableLines];
    expect(all.some((line) => /node_modules|__tests__|__fixtures__/.test(line) || path.isAbsolute(line))).toBe(false);
    expect(report.executableLines.length).toBeGreaterThan(0);
    const executable = new Set(report.executableLines);
    expect(test.lines.filter((line) => !executable.has(line))).toEqual([]);
    expect(test.outcomes.length).toBeGreaterThan(0);
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
