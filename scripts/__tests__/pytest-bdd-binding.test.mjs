// Scenario implementations for specs/623-type-pytest-bdd-scenario-binding-files-as-bdd-in-the-test-layer-classifier/feature.gherkin.
import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyTestFile } from '../upgrade-test-layers.mjs';

const upgradeScript = fileURLToPath(new URL('../sdlc-upgrade.mjs', import.meta.url));
const roots = [];

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

// The coverage command reads `TEST <id> lines=… branches=… outcomes=…` markers from every file under test/ and prints
// a v1 report, so a pytest-bdd binding file reports its scenario tests under its own path.
const COVERAGE_SCRIPT = `import fs from 'node:fs';
import path from 'node:path';
const tests = [];
const split = (value) => value.split(',').filter(Boolean);
const visit = (dir) => {
  for (const name of fs.readdirSync(dir).sort()) {
    const rel = path.posix.join(dir, name);
    if (fs.statSync(rel).isDirectory()) { visit(rel); continue; }
    const text = fs.readFileSync(rel, 'utf8');
    for (const m of text.matchAll(/TEST (\\S+) lines=(\\S*) branches=(\\S*) outcomes=(\\S*)/g)) {
      tests.push({ id: m[1], file: rel, lines: split(m[2]), branches: split(m[3]), outcomes: split(m[4]) });
    }
  }
};
visit('test');
process.stdout.write(JSON.stringify({ version: 1, tests }));
`;
const SUITE_SCRIPT = 'process.exit(0);\n';
const COVERAGE_CONFIG = JSON.stringify({
  version: 1,
  suite: { program: process.execPath, args: ['tools/suite.mjs'] },
  coverage: { program: process.execPath, args: ['tools/coverage.mjs'] },
});
const BINDING_PATH = 'test/features/test_cart_bdd.py';
const BINDING_TEXT = [
  'from pytest_bdd import scenarios',
  '',
  'scenarios("cart.feature")',
  '# TEST test_cart_bdd.py:add_item lines=src/cart.py:1,src/cart.py:2 branches= outcomes=adds-item',
  '',
].join('\n');
const FILES = {
  '.gitignore': '.nmg-sdlc/\n',
  'tools/coverage.mjs': COVERAGE_SCRIPT,
  'tools/suite.mjs': SUITE_SCRIPT,
  'src/cart.py': 'CART = []\n',
  [BINDING_PATH]: BINDING_TEXT,
  'test/test_cart_unit.py': [
    '# TEST test_cart_unit.py:add lines=src/cart.py:1 branches= outcomes=adds-item',
    'def test_add():',
    '    pass',
    '',
  ].join('\n'),
};

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

function project({ kept }) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-pytest-bdd-binding-')));
  roots.push(root);
  for (const [rel, text] of Object.entries(FILES)) write(root, rel, text);
  write(root, 'steering/test-layers.json', `${JSON.stringify({ version: 1, kept }, null, 2)}\n`);
  write(root, 'steering/test-coverage.json', COVERAGE_CONFIG);
  git(root, ['init', '-q']);
  git(root, ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '-A']);
  git(root, ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'fixture']);
  return root;
}

function cli(root, ...args) {
  const result = spawnSync(process.execPath, [upgradeScript, ...args, '--root', root], { cwd: root, encoding: 'utf8' });
  return { status: result.status, out: result.stdout ? JSON.parse(result.stdout) : null, stderr: result.stderr };
}

describe('@SCN001 a scenarios() binding file is typed bdd', () => {
  it('types a file that imports pytest_bdd and calls scenarios("x.feature") as bdd', () => {
    expect(classifyTestFile('tests/features/test_cart_bdd.py', 'from pytest_bdd import scenarios\n\nscenarios("cart.feature")\n'))
      .toBe('bdd');
  });

  it('types a file that calls the pytest_bdd-qualified scenarios() as bdd', () => {
    expect(classifyTestFile('tests/features/test_cart_bdd.py', 'import pytest_bdd\n\npytest_bdd.scenarios("cart.feature")\n'))
      .toBe('bdd');
  });
});

describe('@SCN002 an @scenario binding file is typed bdd', () => {
  it('types a file that imports pytest_bdd and decorates a test with @scenario as bdd', () => {
    const text = [
      'from pytest_bdd import scenario',
      '',
      '@scenario("cart.feature", "add item")',
      'def test_add_item():',
      '    pass',
      '',
    ].join('\n');
    expect(classifyTestFile('tests/features/test_cart_bdd.py', text)).toBe('bdd');
  });

  it('types a file that uses the pytest_bdd-qualified @scenario decorator as bdd', () => {
    const text = 'import pytest_bdd\n\n@pytest_bdd.scenario("cart.feature", "add item")\ndef test_add_item():\n    pass\n';
    expect(classifyTestFile('tests/features/test_cart_bdd.py', text)).toBe('bdd');
  });
});

describe('@SCN003 the binding rule precedes the path-token rules', () => {
  it('types a binding file whose path contains contract as bdd, not doc', () => {
    const text = 'from pytest_bdd import scenarios\n\nscenarios("contract_rules.feature")\n';
    expect(classifyTestFile('tests/features/test_contract_rules_bdd.py', text)).toBe('bdd');
  });
});

describe('@SCN004 files that do not bind pytest-bdd scenarios keep their type', () => {
  it.each([
    ['tests/test_cart.py', 'def test_add(): pass', 'unit'],
    ['tests/contract/test_rules.py', 'def test_rule(): pass', 'doc'],
    ['tests/test_helpers.py', 'from pytest_bdd import given', 'unit'],
    ['tests/integration/test_api.py', 'import requests', 'integration'],
    ['tests/steps/cart_steps.py', 'from pytest_bdd import given', 'bdd'],
    ['tests/test_tagged.py', '# @SCN001 cart add', 'bdd'],
    ['features/cart.feature', 'Feature: Cart', 'bdd'],
  ])('classifies %s with content %j as %s', (rel, text, type) => {
    expect(classifyTestFile(rel, text)).toBe(type);
  });
});

describe('@SCN005 tests reported under a binding file count as kept BDD', () => {
  it('lists neither the binding tests nor their batches, and covers the unit subset by the binding test', () => {
    const root = project({ kept: ['bdd'] });
    const { status, out } = cli(root, 'test-layers-candidates');
    expect(status).toBe(0);

    const listedIds = [
      ...out.batches.flatMap((batch) => batch.tests.map((test) => test.id)),
      ...out.unmatched.map((entry) => entry.id),
    ];
    expect(listedIds.filter((id) => id.startsWith('test_cart_bdd.py:'))).toEqual([]);
    expect(out.batches).toEqual([
      expect.objectContaining({
        file: 'test/test_cart_unit.py',
        tests: [{ id: 'test_cart_unit.py:add', label: 'duplicate', coveredBy: ['test_cart_bdd.py:add_item'] }],
      }),
    ]);
    expect(out.unmatched).toEqual([]);
  });
});
