// @SCN012 (specs/584-…): onboard/upgrade detection and the digest-bound verification-scope apply.
import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { applyUpgrade, detectUpgrade } from '../sdlc-upgrade.mjs';
import { loadSteeringRuntime } from '../../src/sdlc-steering-runtime.mjs';
import { applyVerificationScope, detectVerificationScope, runVerificationScopeCli } from '../verification-scope.mjs';

const SCRIPT = fileURLToPath(new URL('../verification-scope.mjs', import.meta.url));
const noNetworkRun = () => ({ status: 1, stdout: '', stderr: 'network disabled in test' });
const roots = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true }); });

const git = (root, ...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
};
const write = (root, rel, text) => {
  const target = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
};
const bytes = (root, rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel)) : null);
const manifestOf = (root) => JSON.parse(fs.readFileSync(path.join(root, 'steering/manifest.json'), 'utf8'));
const editManifest = (root, edit) => {
  const manifest = manifestOf(root);
  edit(manifest);
  write(root, 'steering/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
};
const tests = { id: 'unit.tests', provider: 'builtin.command', required: true, when: { kind: 'always' },
  config: { program: process.execPath, args: ['-e', 'process.exit(0)'], cwd: '.', env: [] } };
const COVERAGE = { version: 1, suite: { program: 'npm', args: ['test'] }, coverage: { program: 'node', args: ['cov.mjs'] } };

/** A committed project with a valid steering runtime, one builtin.command validation and the given extra files. */
async function project({ plugin = false, files = {}, validations = [tests] } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-verification-scope-')));
  roots.push(root);
  write(root, '.gitignore', '.nmg-sdlc/\n');
  if (plugin) {
    write(root, '.claude-plugin/plugin.json', '{"name":"demo","version":"1.0.0"}\n');
    write(root, 'commands/hello.md', '# hello\n');
    write(root, 'agents/helper.md', '# helper\n');
    write(root, 'hooks/hooks.json', '{}\n');
  } else {
    write(root, 'src/app.js', 'export const app = 1;\n');
    write(root, 'assets/logo.svg', '<svg/>\n');
  }
  write(root, 'README.md', '# demo\n');
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  await applySteeringPlan(root, createInitializePlan(root, { validations }));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'fixture');
  return root;
}

const legacySelection = (root) => editManifest(root, (manifest) => {
  manifest.validations[0].tier = 'change';
  manifest.validations[0].selection = { program: 'node', args: ['select.mjs'] };
});

/** A proposal that accounts for every tracked path of the fixture. */
const proposal = (root, overrides = {}) => {
  const file = path.join(root, '.nmg-sdlc', 'plans', 'verification-scope.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    selection: { docPaths: ['README.md'], fallbackPaths: ['.gitignore', 'steering/**'], coveragePaths: ['src/**'] },
    surfaces: [
      { id: 'commands', sources: ['commands/**'] },
      { id: 'agents', sources: ['agents/**'] },
      { id: 'hooks', sources: ['hooks/**', '.claude-plugin/**'] },
      { id: 'assets', sources: ['assets/**'] },
    ],
    optIn: ['unit.tests'],
    testCoverage: COVERAGE,
    ...overrides,
  }));
  return file;
};

describe('@SCN012 detectVerificationScope', () => {
  it('reports the plugin project findings, including a legacy command selection and the missing coverage config', async () => {
    const root = await project({ plugin: true });
    legacySelection(root);
    const item = detectVerificationScope(root);
    expect(item).toMatchObject({ kind: 'verification-scope', actionable: true, pluginProject: true, rel: 'steering/manifest.json' });
    expect(item.id).toBe(`verification-scope:${item.digest}`);
    expect(item.id).toMatch(/^verification-scope:[0-9a-f]{64}$/);
    expect(item.findings).toEqual(['selection_missing', 'selection_command_legacy', 'test_coverage_missing', 'surfaces_missing']);
    expect(item.legacySelections).toEqual(['unit.tests']);
    expect(item.commandValidations).toEqual(['unit.tests']);
  });

  it('reports doc_paths_missing and the unaccounted tracked paths for a non-plugin project', async () => {
    const root = await project();
    editManifest(root, (manifest) => {
      manifest.selection = { coveragePaths: ['src/**'], fallbackPaths: ['steering/**', '.gitignore'] };
      manifest.surfaces = [{ id: 'app', sources: ['src/app.js'] }];
    });
    write(root, 'steering/test-coverage.json', `${JSON.stringify(COVERAGE)}\n`);
    const item = detectVerificationScope(root);
    expect(item.pluginProject).toBe(false);
    expect(item.findings).toEqual(['doc_paths_missing', 'unaccounted_paths']);
    expect(item.unaccountedPaths).toEqual(['README.md', 'assets/logo.svg']);
  });

  it('reports test_coverage_invalid for an invalid config, and nothing for a project without command validations', async () => {
    const root = await project();
    write(root, 'steering/test-coverage.json', '{"version":2}\n');
    expect(detectVerificationScope(root).findings).toContain('test_coverage_invalid');

    const artifactOnly = await project({ validations: [] });
    const item = detectVerificationScope(artifactOnly);
    expect(item.findings).toEqual(['selection_missing', 'surfaces_missing']);
  });

  it('returns null without a steering manifest', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-verification-scope-')));
    roots.push(root);
    expect(detectVerificationScope(root)).toBeNull();
  });

  it('binds the digest to the manifest, the coverage config and the tracked paths', async () => {
    const root = await project();
    const first = detectVerificationScope(root).id;
    write(root, 'steering/test-coverage.json', `${JSON.stringify(COVERAGE)}\n`);
    const second = detectVerificationScope(root).id;
    expect(second).not.toBe(first);
    write(root, 'src/more.js', '1;\n');
    git(root, 'add', 'src/more.js');
    expect(detectVerificationScope(root).id).not.toBe(second);
  });
});

describe('@SCN012 applyVerificationScope', () => {
  it('refuses a stale digest with verification_scope_plan_stale and writes nothing', async () => {
    const root = await project({ plugin: true });
    const item = detectVerificationScope(root);
    write(root, 'README.md', '# changed\n');
    git(root, 'add', 'README.md');
    write(root, 'commands/new.md', '# new\n');
    git(root, 'add', 'commands/new.md');
    const before = bytes(root, 'steering/manifest.json');
    const result = await applyVerificationScope(root, item, proposal(root));
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_plan_stale' });
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
    expect(fs.existsSync(path.join(root, 'steering/test-coverage.json'))).toBe(false);
  });

  it('converts a legacy command selection, writes selection, surfaces and the coverage config, and a repeat detect proposes nothing', async () => {
    const root = await project({ plugin: true });
    legacySelection(root);
    const item = detectVerificationScope(root);
    const result = await applyVerificationScope(root, item, proposal(root));
    expect(result).toMatchObject({ ok: true, status: 'applied', id: item.id, remainingFindings: [] });
    expect(result.updated).toEqual(['steering/manifest.json', 'steering/test-coverage.json']);
    const manifest = manifestOf(root);
    expect(manifest.validations[0]).toMatchObject({ selection: true, tier: 'change' });
    expect(manifest.selection.docPaths).toEqual(['README.md']);
    expect(manifest.surfaces.map((surface) => surface.id)).toEqual(['commands', 'agents', 'hooks', 'assets']);
    expect(Object.keys(manifest).slice(0, 2)).toEqual(['schemaVersion', 'runtimeVersion']);
    expect(fs.readFileSync(path.join(root, 'steering/test-coverage.json'), 'utf8')).toBe(`${JSON.stringify(COVERAGE, null, 2)}\n`);
    const runtime = await loadSteeringRuntime(root);
    expect(runtime.selection.docPaths).toEqual(['README.md']);
    expect(detectVerificationScope(root)).toBeNull();
  });

  it('restores the original bytes when the proposal makes the manifest invalid', async () => {
    const root = await project();
    const item = detectVerificationScope(root);
    const before = bytes(root, 'steering/manifest.json');
    const result = await applyVerificationScope(root, item, proposal(root, { surfaces: [{ id: 'app', sources: ['/abs/**'] }] }));
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_apply_invalid' });
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
    expect(fs.existsSync(path.join(root, 'steering/test-coverage.json'))).toBe(false);
  });

  it('restores the original bytes when the coverage config is invalid', async () => {
    const root = await project();
    const item = detectVerificationScope(root);
    const before = bytes(root, 'steering/manifest.json');
    const result = await applyVerificationScope(root, item, proposal(root, { testCoverage: { version: 3 } }));
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_apply_invalid' });
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
    expect(fs.existsSync(path.join(root, 'steering/test-coverage.json'))).toBe(false);
  });

  it('refuses a symlinked coverage config before any write and leaves the link and its outside target untouched', async () => {
    const root = await project();
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-verification-scope-outside-')));
    roots.push(outside);
    const target = path.join(outside, 'coverage.json');
    fs.writeFileSync(target, 'outside\n');
    fs.symlinkSync(target, path.join(root, 'steering', 'test-coverage.json'));
    const item = detectVerificationScope(root);
    const before = bytes(root, 'steering/manifest.json');
    const result = await applyVerificationScope(root, item, proposal(root));
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_target_invalid' });
    expect(result.message).toContain('steering/test-coverage.json');
    expect(fs.readFileSync(target, 'utf8')).toBe('outside\n');
    expect(fs.lstatSync(path.join(root, 'steering', 'test-coverage.json')).isSymbolicLink()).toBe(true);
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
  });

  it('rejects an opt-in naming an unknown validation before writing', async () => {
    const root = await project();
    const item = detectVerificationScope(root);
    const before = bytes(root, 'steering/manifest.json');
    const result = await applyVerificationScope(root, item, proposal(root, { optIn: ['missing.validation'] }));
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_proposal_invalid' });
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
  });
});

describe('@SCN012 verification-scope CLI', () => {
  it('detects and applies through argument arrays with stable exit codes', async () => {
    const root = await project({ plugin: true });
    const cli = (...args) => {
      const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });
      return { status: result.status, out: JSON.parse(result.stdout) };
    };
    const detected = cli('detect', '--root', root);
    expect(detected.status).toBe(0);
    expect(detected.out.ok).toBe(true);
    expect(detected.out.item.kind).toBe('verification-scope');
    const applied = cli('apply', '--root', root, '--approve', detected.out.item.id, '--proposal', proposal(root));
    expect(applied).toMatchObject({ status: 0, out: { ok: true, status: 'applied' } });
    expect(cli('detect', '--root', root)).toEqual({ status: 0, out: { ok: true, item: null } });
    expect(cli('apply', '--root', root, '--approve', detected.out.item.id, '--proposal', proposal(root)))
      .toMatchObject({ status: 1, out: { ok: false, reasonCode: 'verification_scope_plan_stale' } });
  });

  it('rejects malformed arguments with exit code 2', async () => {
    expect(await runVerificationScopeCli(['apply', '--root', '.'])).toMatchObject({ exitCode: 2, output: { reasonCode: 'verification_scope_cli_invalid' } });
    expect(await runVerificationScopeCli(['detect', '--proposal', 'x.json'])).toMatchObject({ exitCode: 2 });
    expect(await runVerificationScopeCli(['bogus'])).toMatchObject({ exitCode: 2 });
  });
});

describe('@SCN012 sdlc-upgrade wiring', () => {
  it('detectUpgrade lists the item and applyUpgrade applies it from --scope-proposal', async () => {
    const root = await project({ plugin: true });
    legacySelection(root);
    const live = detectUpgrade(root, { run: noNetworkRun }).items.find((item) => item.kind === 'verification-scope');
    expect(live).toMatchObject({ actionable: true, pluginProject: true });
    expect(() => applyUpgrade(root, [live.id], noNetworkRun)).toThrow(expect.objectContaining({ reasonCode: 'verification_scope_proposal_missing' }));
    expect(() => applyUpgrade(root, ['verification-scope:0000'], noNetworkRun, { scopeProposal: proposal(root) }))
      .toThrow(expect.objectContaining({ reasonCode: 'verification_scope_plan_stale' }));
    const report = applyUpgrade(root, [live.id], noNetworkRun, { scopeProposal: proposal(root) });
    expect(report.results.find((result) => result.id === live.id)).toMatchObject({ status: 'applied' });
    expect(detectUpgrade(root, { run: noNetworkRun }).items.some((item) => item.kind === 'verification-scope')).toBe(false);
  });
});
