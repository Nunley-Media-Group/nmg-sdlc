// This repository's scoped-verification adoption (#584 AC11, AC12, FR12-FR14).
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSteeringRuntime } from '../../src/sdlc-steering-runtime.mjs';
import { matches } from '../../src/sdlc-glob.mjs';
import { loadTestCoverageConfig } from '../test-coverage.mjs';
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

describe('repository scoped verification (#584 AC12)', () => {
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

  it('declares the Jest per-test coverage command', () => {
    expect(loadTestCoverageConfig(repoRoot)).toEqual({ config: { version: 1,
      suite: { program: 'npm', args: ['--prefix', 'scripts', 'test', '--', '--runInBand'] },
      coverage: { program: 'node', args: ['scripts/jest-per-test-coverage.mjs'] } } });
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

describe('onboard and upgrade enforce the configuration (#584 AC11)', () => {
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
