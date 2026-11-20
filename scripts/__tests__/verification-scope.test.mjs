// @SCN012 (specs/584-…): onboard/upgrade detection and the digest-bound verification-scope apply.
import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { applyUpgrade, applyVerificationScopeItem, detectUpgrade } from '../sdlc-upgrade.mjs';
import { loadSteeringRuntime } from '../../src/sdlc-steering-runtime.mjs';
import { applyVerificationScope, detectVerificationScope } from '../verification-scope.mjs';

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
    expect(item.findings).toEqual(['selection_missing', 'selection_command_legacy', 'test_coverage_missing', 'surfaces_missing', 'unaccounted_paths']);
    // A first run lists every path the proposal must account for, though nothing is configured yet.
    expect(item.unaccountedPaths).toEqual(['.claude-plugin/plugin.json', '.gitignore', 'README.md', 'agents/helper.md', 'commands/hello.md',
      'hooks/hooks.json', 'steering/manifest.json', 'steering/modules/product.mjs', 'steering/modules/structure.mjs', 'steering/modules/tech.mjs',
      'steering/modules/verification.mjs']);
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
    expect(item.findings).toEqual(['selection_missing', 'surfaces_missing', 'unaccounted_paths']);
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

  it('restores the original manifest and removes the new coverage config when the written result does not load', async () => {
    const root = await project({ plugin: true });
    const before = bytes(root, 'steering/manifest.json');
    const invalid = proposal(root, { surfaces: [{ id: 'commands', sources: ['commands/**'], validations: ['nope'] }] });
    const result = await applyVerificationScope(root, detectVerificationScope(root), invalid);
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_apply_invalid', restored: ['steering/manifest.json', 'steering/test-coverage.json'] });
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
    expect(fs.existsSync(path.join(root, 'steering/test-coverage.json'))).toBe(false);
  });

  it.each([
    ['a selection glob that escapes the project', { selection: { docPaths: ['../x'] } }],
    ['a negated selection glob', { selection: { docPaths: ['README.md'], fallbackPaths: ['!src/**'] } }],
    ['an unknown selection key', { selection: { docs: ['docs/**'] } }],
    ['an empty surfaces map', { surfaces: [] }],
    ['a surface with an invalid id', { surfaces: [{ id: 'Commands', sources: ['commands/**'] }] }],
    ['duplicate surface ids', { surfaces: [{ id: 'commands', sources: ['commands/**'] }, { id: 'commands', sources: ['agents/**'] }] }],
    ['opt-ins without a top-level selection', { selection: undefined }],
  ])('restores the original files when the steering runtime rejects a proposal with %s', async (_name, overrides) => {
    const root = await project({ plugin: true });
    const before = bytes(root, 'steering/manifest.json');
    const result = await applyVerificationScope(root, detectVerificationScope(root), proposal(root, overrides));
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_apply_invalid' });
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
    expect(fs.existsSync(path.join(root, 'steering/test-coverage.json'))).toBe(false);
  });

  it('restores the original files when the proposal leaves a finding, so a repeat detect proposes the same item', async () => {
    const root = await project({ plugin: true });
    legacySelection(root);
    const item = detectVerificationScope(root);
    const before = bytes(root, 'steering/manifest.json');
    const result = await applyVerificationScope(root, item, proposal(root, { surfaces: [{ id: 'commands', sources: ['commands/**'] }] }));
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_proposal_incomplete', remainingFindings: ['unaccounted_paths'],
      unaccountedPaths: ['.claude-plugin/plugin.json', 'agents/helper.md', 'hooks/hooks.json'] });
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
    expect(fs.existsSync(path.join(root, 'steering/test-coverage.json'))).toBe(false);
    expect(detectVerificationScope(root).id).toBe(item.id);
    // A legacy command selection left out of optIn is never applied: the steering runtime rejects it.
    const legacyKept = await applyVerificationScope(root, item, proposal(root, { optIn: [] }));
    expect(legacyKept).toMatchObject({ ok: false, reasonCode: 'verification_scope_apply_invalid' });
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
  });

  it('refuses a proposal that opts in an unknown validation before any write', async () => {
    const root = await project({ plugin: true });
    const before = bytes(root, 'steering/manifest.json');
    const result = await applyVerificationScope(root, detectVerificationScope(root), proposal(root, { optIn: ['unit.tests', 'missing.tests'] }));
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_proposal_invalid' });
    expect(result.message).toContain('missing.tests');
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
    expect(fs.existsSync(path.join(root, 'steering/test-coverage.json'))).toBe(false);
  });

  (process.platform === 'win32' ? it.skip : it)('never writes the approved proposal through a symlinked coverage config', async () => {
    const root = await project({ plugin: true });
    const outside = path.join(root, 'outside.json');
    fs.writeFileSync(outside, '{}\n');
    fs.symlinkSync(outside, path.join(root, 'steering/test-coverage.json'));
    const before = bytes(root, 'steering/manifest.json');
    const result = await applyVerificationScope(root, detectVerificationScope(root), proposal(root));
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_target_invalid' });
    expect(fs.readFileSync(outside, 'utf8')).toBe('{}\n');
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
  });
});

describe('@SCN012 the files an apply adds and the paths it lists', () => {
  it('fails a proposal that leaves the new coverage config unaccounted, so committing it never reopens the item', async () => {
    const root = await project({ plugin: true });
    const item = detectVerificationScope(root);
    const before = bytes(root, 'steering/manifest.json');
    const result = await applyVerificationScope(root, item, proposal(root, {
      selection: { docPaths: ['README.md'], fallbackPaths: ['.gitignore', 'steering/manifest.json', 'steering/modules/**', 'steering/snippets/**', 'steering/extensions/**', 'steering/*.md'], coveragePaths: ['src/**'] },
    }));
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_proposal_incomplete', remainingFindings: ['unaccounted_paths'] });
    expect(result.unaccountedPaths).toContain('steering/test-coverage.json');
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
    expect(fs.existsSync(path.join(root, 'steering/test-coverage.json'))).toBe(false);
  });

  it('lists at most 200 unaccounted tracked paths with the full count', async () => {
    const root = await project();
    for (let index = 0; index < 205; index += 1) write(root, `extra/f${String(index).padStart(3, '0')}.txt`, 'x\n');
    git(root, 'add', 'extra');
    const item = detectVerificationScope(root);
    expect(item.unaccountedPaths).toHaveLength(200);
    expect(item.unaccountedPaths).toContain('extra/f000.txt');
    expect(item.unaccountedCount).toBeGreaterThan(205);
  });

  it('never lists runtime state under .nmg-sdlc/, even when it is tracked', async () => {
    const root = await project();
    write(root, '.nmg-sdlc/handoffs/42-implement.json', '{}\n');
    git(root, 'add', '-f', '.nmg-sdlc/handoffs/42-implement.json');
    const item = detectVerificationScope(root);
    expect((item?.unaccountedPaths ?? []).filter((rel) => rel.startsWith('.nmg-sdlc/'))).toEqual([]);
  });

  it('accounts for the untracked coverage wrapper the config names, but not other untracked files', async () => {
    const root = await project({ plugin: true });
    // Untracked files another approved upgrade item creates, or a scratch file, never fail the apply.
    write(root, 'steering/sdlc-models.json', '{}\n');
    write(root, 'notes.txt', 'scratch\n');
    write(root, 'tools/cov.mjs', 'process.exit(0);\n');
    const item = detectVerificationScope(root);
    expect(item.unaccountedPaths).not.toContain('notes.txt');
    expect(item.unaccountedPaths).not.toContain('steering/sdlc-models.json');
    const wrapper = { ...COVERAGE, coverage: { program: 'node', args: ['tools/cov.mjs'] } };
    const missed = await applyVerificationScope(root, item, proposal(root, {
      selection: { docPaths: ['README.md'], fallbackPaths: ['.gitignore', 'steering/manifest.json', 'steering/modules/**', 'steering/test-coverage.json'], coveragePaths: ['src/**'] },
      testCoverage: wrapper,
    }));
    expect(missed).toMatchObject({ ok: false, reasonCode: 'verification_scope_proposal_incomplete', unaccountedPaths: ['tools/cov.mjs'] });
    const applied = await applyVerificationScope(root, item, proposal(root, {
      selection: { docPaths: ['README.md'], fallbackPaths: ['.gitignore', 'steering/manifest.json', 'steering/modules/**', 'steering/test-coverage.json', 'tools/cov.mjs'], coveragePaths: ['src/**'] },
      testCoverage: wrapper,
    }));
    expect(applied).toMatchObject({ ok: true, status: 'applied' });
    git(root, 'add', 'steering/manifest.json', 'steering/test-coverage.json', 'tools/cov.mjs');
    git(root, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'apply');
    expect(detectVerificationScope(root)).toBeNull();
  });

  (process.platform === 'win32' ? it.skip : it)('never writes through a symlinked steering directory', async () => {
    const root = await project({ plugin: true });
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-verification-scope-out-')));
    roots.push(outside);
    fs.cpSync(path.join(root, 'steering'), outside, { recursive: true });
    fs.rmSync(path.join(root, 'steering'), { recursive: true });
    fs.symlinkSync(outside, path.join(root, 'steering'));
    const item = detectVerificationScope(root);
    const result = await applyVerificationScope(root, item, proposal(root));
    expect(result).toMatchObject({ ok: false, reasonCode: 'verification_scope_target_invalid' });
    expect(fs.existsSync(path.join(outside, 'test-coverage.json'))).toBe(false);
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
    for (const bad of [['scan', '--root', root], ['detect', '--approve', 'verification-scope:x'], ['apply', '--root', root, '--proposal', 'p.json']]) {
      expect(cli(...bad)).toMatchObject({ status: 2, out: { ok: false, reasonCode: 'verification_scope_cli_invalid' } });
    }
  });

});

describe('@SCN012 onboard and upgrade run the detection and the approved apply', () => {
  const read = (rel) => fs.readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
  it.each(['workflows/onboard-project/WORKFLOW.md', 'workflows/upgrade-project/WORKFLOW.md'])('%s runs verification-scope detect and apply', (rel) => {
    const text = read(rel);
    expect(text).toContain('scripts/verification-scope.mjs" detect --root .');
    expect(text).toMatch(/verification-scope\.mjs"?,?\s*"?apply"?/);
    expect(text).toContain('.nmg-sdlc/plans/verification-scope.json');
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

  it('reports already-current without running the apply when detection finds nothing left to configure', async () => {
    const root = await project({ plugin: true });
    await applyVerificationScope(root, detectVerificationScope(root), proposal(root));
    const before = bytes(root, 'steering/manifest.json');
    expect(applyVerificationScopeItem(root, { id: 'verification-scope:stale' }, proposal(root))).toEqual({ id: 'verification-scope:stale', status: 'already-current' });
    expect(bytes(root, 'steering/manifest.json').equals(before)).toBe(true);
  });

  it('applies the approved proposal after an earlier approved item of the same run moved a tracked file', async () => {
    const root = await project({ plugin: true, files: { 'AGENTS.md': '# Agents\n' } });
    legacySelection(root);
    const approved = detectUpgrade(root, { run: noNetworkRun }).items
      .filter((item) => ['agents-to-claude-md', 'verification-scope'].includes(item.kind)).map((item) => item.id);
    expect(approved).toHaveLength(2);
    const report = applyUpgrade(root, approved, noNetworkRun, { scopeProposal: proposal(root, {
      selection: { docPaths: ['README.md', 'CLAUDE.md', 'AGENTS.md'], fallbackPaths: ['.gitignore', 'steering/**'], coveragePaths: ['src/**'] } }) });
    expect(approved.map((id) => report.results.find((result) => result.id === id)?.status)).toEqual(['applied', 'applied']);
    expect(manifestOf(root).validations[0].selection).toBe(true);
  });
});
