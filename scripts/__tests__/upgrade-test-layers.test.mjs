// Scenario implementations for specs/572-…/feature.gherkin: the /sdlc-upgrade-project test-layer migration item.
import { afterEach, describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyUpgrade, detectUpgrade } from '../sdlc-upgrade.mjs';
import { TestCoverageError, validateCoverageReport, validateTestCoverageConfig } from '../test-coverage.mjs';

const upgradeScript = fileURLToPath(new URL('../sdlc-upgrade.mjs', import.meta.url));
const noNetworkRun = () => ({ status: 1, stdout: '', stderr: 'network disabled in test' });
const roots = [];

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

// The coverage command reads `TEST <id> lines=… branches=… outcomes=…` markers from every file under features/ and
// test/, so deleting a test file removes its tests and adding a marker to a feature adds a scenario test.
const COVERAGE_SCRIPT = `import fs from 'node:fs';
import path from 'node:path';
const tests = [];
const split = (value) => value.split(',').filter(Boolean);
const visit = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir).sort()) {
    const rel = path.posix.join(dir, name);
    if (fs.statSync(rel).isDirectory()) { visit(rel); continue; }
    const text = fs.readFileSync(rel, 'utf8');
    for (const m of text.matchAll(/TEST (\\S+) lines=(\\S*) branches=(\\S*) outcomes=(\\S*)/g)) {
      tests.push({ id: m[1], file: rel, lines: split(m[2]), branches: split(m[3]), outcomes: split(m[4]) });
    }
  }
};
visit('features');
visit('test');
process.stdout.write(JSON.stringify({ version: 1, tests }));
`;
const SUITE_SCRIPT = `import fs from 'node:fs';
process.exit(fs.existsSync('tools/suite-exit') ? Number(fs.readFileSync('tools/suite-exit', 'utf8')) : 0);
`;
const FEATURE = `Feature: Cart
  # TEST cart.feature:add lines=src/cart.js:1,src/cart.js:2 branches=src/cart.js:2:0 outcomes=adds-item
  Scenario Outline: change the cart
    Examples:
      | action |
      | add    |
`;
const FILES = {
  '.gitignore': '.nmg-sdlc/\n',
  'tools/coverage.mjs': COVERAGE_SCRIPT,
  'tools/suite.mjs': SUITE_SCRIPT,
  'src/cart.js': 'export const cart = [];\n',
  'features/cart.feature': FEATURE,
  'test/cart.test.js': [
    '// TEST cart.test.js:add lines=src/cart.js:1 branches= outcomes=adds-item',
    '// TEST cart.test.js:remove lines=src/cart.js:3 branches=src/cart.js:3:1 outcomes=removes-item',
    '',
  ].join('\n'),
  'test/pricing.test.js': '// TEST pricing.test.js:total lines=src/cart.js:2 branches=src/cart.js:2:0 outcomes=adds-item\n',
  'test/misc.test.js': '// TEST misc.test.js:misc lines=src/misc.js:1 branches= outcomes=misc-ok\n',
};
const COVERAGE_CONFIG = JSON.stringify({
  version: 1,
  suite: { program: process.execPath, args: ['tools/suite.mjs'] },
  coverage: { program: process.execPath, args: ['tools/coverage.mjs'] },
});

function write(root, rel, text) {
  const target = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}

function project({ files = FILES, kept, coverage = COVERAGE_CONFIG } = {}) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-test-layers-upgrade-')));
  roots.push(root);
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  if (kept) write(root, 'steering/test-layers.json', `${JSON.stringify({ version: 1, kept }, null, 2)}\n`);
  if (coverage !== null) write(root, 'steering/test-coverage.json', coverage);
  git(root, ['init', '-q']);
  git(root, ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '-A']);
  git(root, ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'fixture']);
  return root;
}

function tree(root) {
  const out = {};
  const visit = (dir, rel) => {
    for (const name of fs.readdirSync(dir).sort()) {
      if (name === '.git' || name === '.nmg-sdlc') continue;
      const full = path.join(dir, name);
      const key = rel ? `${rel}/${name}` : name;
      if (fs.statSync(full).isDirectory()) visit(full, key);
      else out[key] = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  visit(root, '');
  return out;
}

function gitState(root) {
  return {
    head: git(root, ['rev-parse', 'HEAD']).trim(),
    refs: git(root, ['for-each-ref']),
    index: createHash('sha256').update(fs.readFileSync(path.join(root, '.git', 'index'))).digest('hex'),
  };
}

function cli(root, ...args) {
  const result = spawnSync(process.execPath, [upgradeScript, ...args, '--root', root], { cwd: root, encoding: 'utf8' });
  return { status: result.status, out: result.stdout ? JSON.parse(result.stdout) : null, stderr: result.stderr };
}

function item(root) {
  return detectUpgrade(root, { run: noNetworkRun }).items.find((candidate) => candidate.kind === 'test-layers');
}

function apply(root, kept) {
  const live = item(root);
  return applyUpgrade(root, [live.id], noNetworkRun, { kept }).results.find((result) => result.id === live.id);
}

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8'));
}

describe('@SCN001 operator chooses kept test types', () => {
  it('detects only bdd and unit, and the approved apply --kept bdd,unit writes the kept set', () => {
    const root = project({ coverage: null });
    expect(item(root).detectedTypes).toEqual({ bdd: 1, unit: 3 });
    const result = apply(root, ['bdd', 'unit']);
    expect(result).toMatchObject({ status: 'applied', kept: ['bdd', 'unit'], updated: ['steering/test-layers.json'] });
    expect(fs.readFileSync(path.join(root, 'steering/test-layers.json'), 'utf8')).toBe('{\n  "version": 1,\n  "kept": [\n    "bdd",\n    "unit"\n  ]\n}\n');
    expect(readJson(root, 'steering/test-layers.json')).toEqual({ version: 1, kept: ['bdd', 'unit'] });
  });

  it('adds bdd when the answer omits it, and rejects unknown kept types with exit 2', () => {
    const root = project({ coverage: null });
    expect(apply(root, ['unit']).kept).toEqual(['bdd', 'unit']);
    const bad = cli(root, 'apply', '--approve', item(root).id, '--kept', 'bdd,e2e');
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('test_layers_cli_invalid');
  });
});

describe('@SCN002 non-interactive run without a recorded choice changes nothing', () => {
  it('lists the item as a proposal and skips apply without --kept, changing no file', () => {
    const root = project();
    const before = tree(root);
    const live = item(root);
    expect(live).toMatchObject({ kind: 'test-layers', actionable: true, recordedKept: null, coverageConfig: 'present' });
    expect(live.id).toMatch(/^test-layers:[0-9a-f]{64}$/);
    expect(live.pairs).toEqual([{ path: 'test/cart.test.js', type: 'unit', feature: 'features/cart.feature' }]);
    applyUpgrade(root, [], noNetworkRun);
    expect(apply(root, null)).toEqual({ id: live.id, status: 'skipped:kept_types_unrecorded' });
    expect(tree(root)).toEqual(before);
    expect(fs.existsSync(path.join(root, '.nmg-sdlc/upgrade/test-layers/inventory.json'))).toBe(false);
  });

  it('fails a stale digest with test_layers_plan_stale before any mutation', () => {
    const root = project();
    const stale = item(root).id;
    write(root, 'test/misc.test.js', '// changed\n');
    const before = tree(root);
    expect(() => applyUpgrade(root, [stale], noNetworkRun, { kept: ['bdd'] })).toThrow(expect.objectContaining({ reasonCode: 'test_layers_plan_stale' }));
    expect(tree(root)).toEqual(before);
  });
});

describe('@SCN003 duplicate layers are detected only for non-kept types', () => {
  it('lists the paired unit file and the coverage-subset unit test when only bdd is kept', () => {
    const root = project({ kept: ['bdd'] });
    const { status, out } = cli(root, 'test-layers-candidates');
    expect(status).toBe(0);
    expect(out.batches).toEqual([
      {
        id: 'batch-001',
        file: 'test/cart.test.js',
        type: 'unit',
        feature: 'features/cart.feature',
        tests: [
          { id: 'cart.test.js:add', label: 'duplicate', coveredBy: ['cart.feature:add'] },
          { id: 'cart.test.js:remove', label: 'convert', target: 'features/cart.feature' },
        ],
      },
      {
        id: 'batch-002',
        file: 'test/pricing.test.js',
        type: 'unit',
        feature: null,
        tests: [{ id: 'pricing.test.js:total', label: 'duplicate', coveredBy: ['cart.feature:add'] }],
      },
    ]);
    expect(out.unmatched).toEqual([{ id: 'misc.test.js:misc', file: 'test/misc.test.js', type: 'unit' }]);
  });

  it('never lists a unit test when unit is kept', () => {
    const root = project({ kept: ['bdd', 'unit'] });
    const { status, out } = cli(root, 'test-layers-candidates');
    expect(status).toBe(0);
    expect(out.batches).toEqual([]);
    expect(out.unmatched).toEqual([]);
  });
});

describe('@SCN004 fully duplicated tests are deleted with evidence', () => {
  it('accepts the batch and records the test, the covering bdd test and the covered lines', () => {
    const root = project({ kept: ['bdd'] });
    cli(root, 'test-layers-candidates');
    expect(cli(root, 'test-layers-batch', 'begin', '--batch', 'batch-002')).toMatchObject({ status: 0, out: { ok: true, status: 'begun' } });
    fs.rmSync(path.join(root, 'test/pricing.test.js'));
    const gate = cli(root, 'test-layers-batch', 'gate', '--batch', 'batch-002');
    expect(gate.status).toBe(0);
    expect(gate.out).toEqual({
      ok: true,
      batch: 'batch-002',
      file: 'test/pricing.test.js',
      status: 'accepted',
      deleted: [{ id: 'pricing.test.js:total', file: 'test/pricing.test.js', coveredBy: ['cart.feature:add'], lines: ['src/cart.js:2'] }],
    });
    expect(fs.existsSync(path.join(root, 'test/pricing.test.js'))).toBe(false);
  });
});

describe('@SCN005 uncovered behavior is converted before deletion', () => {
  it('accepts a batch whose new Examples row covers the converted test', () => {
    const root = project({ kept: ['bdd'] });
    cli(root, 'test-layers-candidates');
    cli(root, 'test-layers-batch', 'begin', '--batch', 'batch-001');
    write(root, 'features/cart.feature', `${FEATURE}      | remove |\n  # TEST cart.feature:remove lines=src/cart.js:3 branches=src/cart.js:3:1 outcomes=removes-item\n`);
    fs.rmSync(path.join(root, 'test/cart.test.js'));
    const gate = cli(root, 'test-layers-batch', 'gate', '--batch', 'batch-001');
    expect(gate.status).toBe(0);
    expect(gate.out.status).toBe('accepted');
    expect(gate.out.deleted.map((entry) => [entry.id, entry.coveredBy])).toEqual([
      ['cart.test.js:add', ['cart.feature:add']],
      ['cart.test.js:remove', ['cart.feature:remove']],
    ]);
  });
});

describe('@SCN006 coverage gap refuses the batch', () => {
  it('refuses with the uncovered lines, branches and outcomes and restores the pre-batch tree', () => {
    const root = project({ kept: ['bdd'] });
    cli(root, 'test-layers-candidates');
    cli(root, 'test-layers-batch', 'begin', '--batch', 'batch-001');
    const before = tree(root);
    const state = gitState(root);
    fs.rmSync(path.join(root, 'test/cart.test.js'));
    write(root, 'features/extra.feature', 'Feature: extra\n');
    write(root, 'src/cart.js', 'changed\n');
    const gate = cli(root, 'test-layers-batch', 'gate', '--batch', 'batch-001');
    expect(gate.status).toBe(1);
    expect(gate.out).toMatchObject({
      ok: false,
      status: 'refused',
      reasonCode: 'test_layers_coverage_gap',
      gap: { lines: ['src/cart.js:3'], branches: ['src/cart.js:3:1'], outcomes: ['removes-item'] },
    });
    expect(tree(root)).toEqual(before);
    expect(gitState(root)).toEqual(state);
  });

  it('refuses removing a test outside the batch file', () => {
    const root = project({ kept: ['bdd'] });
    cli(root, 'test-layers-candidates');
    cli(root, 'test-layers-batch', 'begin', '--batch', 'batch-002');
    fs.rmSync(path.join(root, 'test/misc.test.js'));
    const gate = cli(root, 'test-layers-batch', 'gate', '--batch', 'batch-002');
    expect(gate.out).toMatchObject({ status: 'refused', reasonCode: 'test_layers_removal_out_of_batch' });
    expect(fs.existsSync(path.join(root, 'test/misc.test.js'))).toBe(true);
  });
});

describe('@SCN007 red suite refuses the batch', () => {
  it('refuses with test_layers_suite_failed and restores the pre-batch tree', () => {
    const root = project({ kept: ['bdd'] });
    cli(root, 'test-layers-candidates');
    cli(root, 'test-layers-batch', 'begin', '--batch', 'batch-002');
    const before = tree(root);
    const state = gitState(root);
    fs.rmSync(path.join(root, 'test/pricing.test.js'));
    write(root, 'tools/suite-exit', '1');
    const gate = cli(root, 'test-layers-batch', 'gate', '--batch', 'batch-002');
    expect(gate.status).toBe(1);
    expect(gate.out).toMatchObject({ ok: false, status: 'refused', reasonCode: 'test_layers_suite_failed' });
    expect(tree(root)).toEqual(before);
    expect(gitState(root)).toEqual(state);
  });
});

describe('@SCN008 missing coverage command refuses deletion', () => {
  it.each([
    ['missing', null, 'test_coverage_command_missing', undefined],
    ['{"version":2}', '{"version":2}', 'test_coverage_config_invalid', 'version'],
  ])('records the choice and inventory and refuses every batch when the config is %s', (_state, coverage, reasonCode, key) => {
    const root = project({ coverage });
    const result = apply(root, ['bdd']);
    expect(result).toMatchObject({ status: 'applied', kept: ['bdd'], gap: { reasonCode, path: 'steering/test-coverage.json' } });
    if (key) expect(result.gap.key).toBe(key);
    expect(readJson(root, 'steering/test-layers.json')).toEqual({ version: 1, kept: ['bdd'] });
    expect(readJson(root, '.nmg-sdlc/upgrade/test-layers/inventory.json').files.map((file) => file.path)).toContain('test/cart.test.js');
    const { status, out } = cli(root, 'test-layers-candidates');
    expect(status).toBe(0);
    expect(out).toMatchObject({ ok: true, batches: [], refused: [{ reasonCode, path: 'steering/test-coverage.json' }] });
  });

  it('names the offending field for each invalid config and coverage output shape', () => {
    const command = { program: 'node', args: [] };
    for (const [value, key] of [
      [{ version: 1, suite: command, coverage: command, extra: 1 }, 'extra'],
      [{ version: 1, suite: { program: '', args: [] }, coverage: command }, 'suite.program'],
      [{ version: 1, suite: command, coverage: { program: 'node', args: [1] } }, 'coverage.args[0]'],
    ]) {
      expect(() => validateTestCoverageConfig(value)).toThrow(TestCoverageError);
      try { validateTestCoverageConfig(value); } catch (error) { expect(error.key).toBe(key); expect(error.message).toContain('steering/test-coverage.json'); }
    }
    const test = { id: 'a', file: 'x.js', lines: ['x.js:1'], branches: ['x.js:1:0'], outcomes: ['ok'] };
    expect(validateCoverageReport({ version: 1, tests: [test] }).tests).toHaveLength(1);
    expect(() => validateCoverageReport({ version: 1, tests: [test, test] })).toThrow(/duplicate test id/);
    expect(() => validateCoverageReport({ version: 1, tests: [{ ...test, lines: ['x.js'] }] })).toThrow(/path:N/);
    expect(() => validateCoverageReport({ version: 1, tests: [{ ...test, branches: ['x.js:1'] }] })).toThrow(/path:N:K/);
  });
});

describe('@SCN009 before/after report', () => {
  it('prints before/after counts, wall time and coverage, with the accepted evidence and the refused gap', () => {
    const root = project({ kept: ['bdd'] });
    cli(root, 'test-layers-candidates');
    cli(root, 'test-layers-batch', 'begin', '--batch', 'batch-001');
    fs.rmSync(path.join(root, 'test/cart.test.js'));
    cli(root, 'test-layers-batch', 'gate', '--batch', 'batch-001');
    cli(root, 'test-layers-batch', 'begin', '--batch', 'batch-002');
    fs.rmSync(path.join(root, 'test/pricing.test.js'));
    cli(root, 'test-layers-batch', 'gate', '--batch', 'batch-002');
    const { status, out } = cli(root, 'test-layers-report');
    expect(status).toBe(0);
    for (const side of ['before', 'after']) {
      expect(Object.keys(out[side]).sort()).toEqual(['branches', 'lines', 'outcomes', 'testCount', 'wallMs']);
      expect(typeof out[side].wallMs).toBe('number');
    }
    expect(out.before.testCount).toBe(5);
    expect(out.after.testCount).toBe(4);
    for (const kind of ['lines', 'branches', 'outcomes']) expect(out.after[kind]).toBeGreaterThanOrEqual(out.before[kind]);
    expect(out.accepted.map((record) => record.batch)).toEqual(['batch-002']);
    expect(out.refused).toEqual([expect.objectContaining({ batch: 'batch-001', reasonCode: 'test_layers_coverage_gap', gap: expect.objectContaining({ outcomes: ['removes-item'] }) })]);
  });
});

describe('@SCN010 choice can be changed by rerunning', () => {
  it('rewrites the file with the new set and makes unit tests candidates', () => {
    const root = project({ kept: ['bdd', 'unit'] });
    expect(cli(root, 'test-layers-candidates').out.batches).toEqual([]);
    expect(apply(root, ['bdd'])).toMatchObject({ status: 'applied', kept: ['bdd'] });
    expect(readJson(root, 'steering/test-layers.json')).toEqual({ version: 1, kept: ['bdd'] });
    expect(cli(root, 'test-layers-candidates').out.batches.map((batch) => batch.file)).toEqual(['test/cart.test.js', 'test/pricing.test.js']);
  });

  it('rejects malformed subcommand arguments with exit 2', () => {
    const root = project({ kept: ['bdd'] });
    expect(cli(root, 'test-layers-batch', 'begin').status).toBe(2);
    expect(cli(root, 'test-layers-batch', 'begin', '--batch', 'nope').status).toBe(2);
    expect(cli(root, 'test-layers-report', '--bogus').status).toBe(2);
  });
});
