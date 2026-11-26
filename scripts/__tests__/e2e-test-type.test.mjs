// Scenario implementations for specs/635-…/feature.gherkin: the technology-agnostic e2e test type that projects
// identify by declared path globs.
import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compactTest } from '../../src/test-coverage.mjs';
import { checkTestLayers } from '../check-test-layers.mjs';
import { validateHandoff } from '../sdlc-execute.mjs';
import { TestLayersError, loadTestLayers, testLayersRule, validateTestLayers } from '../test-layers.mjs';
import {
  applyTestLayers,
  classifyTestFile,
  computeCandidates,
  detectTestLayers,
  gateBatch,
  inventoryTestFiles,
  pairWithFeatures,
} from '../upgrade-test-layers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const readJson = (root, relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const roots = [];

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

/** A disposable project: `files` maps repository-relative paths to their text. */
function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-e2e-type-'));
  roots.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

const steering = (config) => `${JSON.stringify(config, null, 2)}\n`;

const upgradeScript = path.join(repoRoot, 'scripts/sdlc-upgrade.mjs');

// The coverage command reads `TEST <id> lines=… outcomes=…` markers from every file under features/, cypress/ and
// test/, so deleting a test file removes its tests.
const MARKER_COVERAGE_SCRIPT = `import fs from 'node:fs';
import path from 'node:path';
const tests = [];
const split = (value) => value.split(',').filter(Boolean);
const visit = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir).sort()) {
    const rel = path.posix.join(dir, name);
    if (fs.statSync(rel).isDirectory()) { visit(rel); continue; }
    for (const m of fs.readFileSync(rel, 'utf8').matchAll(/TEST (\\S+) lines=(\\S*) outcomes=(\\S*)/g)) {
      tests.push({ id: m[1], file: rel, lines: split(m[2]), branches: [], outcomes: split(m[3]) });
    }
  }
};
['features', 'cypress', 'test'].forEach(visit);
process.stdout.write(JSON.stringify({ version: 1, tests }));
`;

/** A committed Git project with a kept, glob-declared e2e suite, a paired unit test, and the coverage gate config. */
function gateProject() {
  const root = fs.realpathSync.native(project({
    '.gitignore': '.nmg-sdlc/\n',
    'steering/test-layers.json': steering({ version: 1, kept: ['bdd', 'e2e'], paths: { e2e: ['cypress/**'] } }),
    'steering/test-coverage.json': steering({
      version: 1,
      suite: { program: process.execPath, args: ['-e', ''] },
      coverage: { program: process.execPath, args: ['tools/coverage.mjs'] },
    }),
    'tools/coverage.mjs': MARKER_COVERAGE_SCRIPT,
    'src/cart.js': 'export const cart = [];\n',
    'features/cart.feature': 'Feature: Cart\n  # TEST cart.feature:view lines=src/cart.js:9 outcomes=views-cart\n',
    'cypress/cart.cy.js': '// TEST cart.e2e:add lines=src/cart.js:1 outcomes=adds-item\n',
    'test/cart.test.js': '// TEST cart.unit:add lines=src/cart.js:1 outcomes=adds-item\n',
  }));
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  };
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');
  return root;
}

/** Runs one test-layers gate CLI subcommand of scripts/sdlc-upgrade.mjs in `root`. */
function gateCli(root, ...args) {
  const result = spawnSync(process.execPath, [upgradeScript, ...args, '--root', root], { cwd: root, encoding: 'utf8' });
  return { status: result.status, out: result.stdout ? JSON.parse(result.stdout) : null, stderr: result.stderr };
}

/** A compact coverage test with its file's type, as the migration gate sees it. */
const coverageTest = (id, file, type, lines, outcomes = []) => ({
  ...compactTest({ id, file, lines, branches: [], outcomes }),
  type,
});

// The sentences the workflow documents must carry. Each is asserted verbatim in the documents below.
const E2E_TASKS_SENTENCE = 'When `e2e` is kept, a scenario\'s implementation may be an e2e test that cites its `@SCN` tag, for behavior only observable through the running app or UI.';
const E2E_IMPLEMENTATION_LINE = 'An `e2e` test that cites a scenario\'s `@SCN` tag is that scenario\'s implementation. Use one when the acceptance criterion\'s behavior is only observable through the running app or UI.';
const E2E_VERIFY_SENTENCE = 'A kept `e2e` test that cites a scenario\'s `@SCN` tag is listed in that AC\'s Implementation column marked `(e2e)`, and is neither a Duplicate nor a Non-kept type finding.';

// @SCN001 (AC1): e2e is a valid kept type.
describe('@SCN001 e2e is a valid kept type', () => {
  it('normalizes kept to the vocabulary order and renders the e2e description', () => {
    const config = validateTestLayers({ version: 1, kept: ['e2e', 'bdd'] });
    expect(config).toEqual({ version: 1, kept: ['bdd', 'e2e'] });
    expect(testLayersRule(config)).toContain(
      '- `e2e`: automated tests that drive the running app or UI through a device, emulator, simulator or browser.',
    );
  });
});

// @SCN002 (AC2): declared globs classify files regardless of stack.
describe('@SCN002 declared globs classify files regardless of stack', () => {
  const paths = { e2e: ['mobile/integration_test/**'] };
  const config = validateTestLayers({ version: 1, kept: ['bdd', 'e2e'], paths });

  it('inventories both robot files as e2e, including a copy that cites an @SCN tag', () => {
    const root = project({
      'steering/test-layers.json': steering({ version: 1, kept: ['bdd', 'e2e'], paths }),
      'mobile/integration_test/offline_banner_test.dart': 'void main() {}\n',
      'mobile/integration_test/robots/home_robot.dart': 'class HomeRobot {}\n',
      'mobile/integration_test/scenario_copy_test.dart': '// @SCN002\nvoid main() {}\n',
    });
    const typed = inventoryTestFiles(root, config).map((file) => [file.path, file.type]);
    expect(typed).toEqual(expect.arrayContaining([
      ['mobile/integration_test/offline_banner_test.dart', 'e2e'],
      ['mobile/integration_test/robots/home_robot.dart', 'e2e'],
      ['mobile/integration_test/scenario_copy_test.dart', 'e2e'],
    ]));
    expect(typed).toHaveLength(3);
  });

  it('keeps the robot out of the built-in inventory when no glob declares it', () => {
    const root = project({ 'mobile/integration_test/robots/home_robot.dart': 'class HomeRobot {}\n' });
    expect(inventoryTestFiles(root).map((file) => file.path)).not.toContain('mobile/integration_test/robots/home_robot.dart');
    expect(classifyTestFile('mobile/integration_test/offline_banner_test.dart', '')).toBe('unit');
  });
});

// @SCN003 (AC3): undeclared files keep their classification and a two-type match is rejected.
describe('@SCN003 undeclared files keep their classification and a two-type match is rejected', () => {
  const config = validateTestLayers({ version: 1, kept: ['bdd', 'e2e'], paths: { e2e: ['cypress/**'] } });

  it.each([
    ['test/e2e/login.test.js', 'e2e'],
    ['test/integration/api.test.js', 'integration'],
    ['test/component/button.test.js', 'integration'],
    ['test/cart.test.js', 'unit'],
    ['test/steps/cart_steps.js', 'bdd'],
    ['features/cart.feature', 'bdd'],
  ])('types %s as %s', (rel, type) => {
    expect(classifyTestFile(rel, '', new Set(), config)).toBe(type);
  });

  it('fails check-test-layers with test_layers_invalid naming the file and both types', () => {
    const root = project({
      'steering/test-layers.json': steering({
        version: 1,
        kept: ['bdd', 'e2e'],
        paths: { e2e: ['test/e2e/**'], unit: ['test/**/*.test.js'] },
      }),
      'test/e2e/login.test.js': "it('logs in', () => {});\n",
    });
    const result = checkTestLayers(root);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([expect.objectContaining({ reasonCode: 'test_layers_invalid' })]);
    expect(result.violations[0].message).toContain('test/e2e/login.test.js');
    expect(result.violations[0].message).toMatch(/both e2e and unit/);

    const item = detectTestLayers(root);
    expect(item.configError).toContain('steering/test-layers.json');
    expect(item.configError).toContain('test/e2e/login.test.js');
    expect(item.configError).toMatch(/both e2e and unit/);
    expect(item.recordedKept).toBeNull();
    expect(item.detectedTypes).toEqual({ e2e: 1 });
  });
});

// @SCN004 (AC4): kept e2e tests are never migration candidates or check violations.
describe('@SCN004 kept e2e tests are never migration candidates or check violations', () => {
  it('omits the kept e2e file from pairs, candidates and check violations', () => {
    const files = {
      'steering/test-layers.json': steering({
        version: 1,
        kept: ['bdd', 'e2e'],
        paths: { e2e: ['mobile/integration_test/**'] },
      }),
      'features/checkout.feature': 'Feature: Checkout\n',
      'mobile/integration_test/checkout_test.dart': 'void main() {}\n',
    };
    const root = project(files);
    const item = detectTestLayers(root);
    expect(item.detectedTypes).toEqual({ bdd: 1, e2e: 1 });
    expect(item.pairs).toEqual([]);

    const applied = applyTestLayers(root, item, ['bdd', 'e2e']);
    expect(applied.status).toBe('applied');
    expect(readJson(root, '.nmg-sdlc/upgrade/test-layers/inventory.json').pairs).toEqual([]);

    const config = loadTestLayers(root).config;
    const inventory = inventoryTestFiles(root, config);
    expect(pairWithFeatures(inventory, ['bdd', 'e2e'])).toEqual([]);
    expect(pairWithFeatures(inventory, ['bdd']).map((pair) => pair.path)).toEqual(['mobile/integration_test/checkout_test.dart']);

    const coverage = [coverageTest('checkout.e2e', 'mobile/integration_test/checkout_test.dart', 'e2e', ['src/checkout.js:1'])];
    const candidates = computeCandidates(inventory, ['bdd', 'e2e'], coverage);
    expect(candidates.batches).toEqual([]);
    expect(candidates.unmatched).toEqual([]);
    expect(checkTestLayers(root)).toMatchObject({ ok: true });
  });

  it('lists only the non-kept unit file through the test-layers-candidates CLI', () => {
    const root = gateProject();
    const { status, out } = gateCli(root, 'test-layers-candidates');
    expect(status).toBe(0);
    expect(out.batches).toEqual([expect.objectContaining({
      id: 'batch-001',
      file: 'test/cart.test.js',
      type: 'unit',
      tests: [{ id: 'cart.unit:add', label: 'convert', target: 'features/cart.feature' }],
    })]);
    expect(out.unmatched).toEqual([]);
  });
});

// @SCN005 (AC5): an e2e test that cites a scenario counts as that scenario's implementation.
describe('@SCN005 an e2e test that cites a scenario counts as that scenario\'s implementation', () => {
  const config = validateTestLayers({ version: 1, kept: ['bdd', 'e2e'], paths: { e2e: ['cypress/**'] } });

  it('types a glob-declared file that cites an @SCN tag as e2e, not bdd', () => {
    expect(classifyTestFile('cypress/checkout.cy.js', "// @SCN005\nit('checkout', () => {});\n", new Set(), config)).toBe('e2e');
  });

  it('accepts removing a unit test whose lines and outcomes only a kept e2e test covers', () => {
    const before = { tests: [coverageTest('cart.unit', 'test/cart.test.js', 'unit', ['src/cart.js:1'], ['adds-item:passed'])] };
    const after = { tests: [coverageTest('checkout.e2e', 'cypress/checkout.cy.js', 'e2e', ['src/cart.js:1'], ['adds-item:passed'])] };
    const result = gateBatch(before, after, { status: 0 }, { file: 'test/cart.test.js' }, ['bdd', 'e2e']);
    expect(result.status).toBe('accepted');
    expect(result.deleted).toEqual([expect.objectContaining({ id: 'cart.unit', coveredBy: ['checkout.e2e'] })]);
  });

  it('accepts the same removal through the test-layers-batch begin and gate CLI', () => {
    const root = gateProject();
    expect(gateCli(root, 'test-layers-candidates').status).toBe(0);
    expect(gateCli(root, 'test-layers-batch', 'begin', '--batch', 'batch-001')).toMatchObject({ status: 0, out: { status: 'begun' } });
    fs.rmSync(path.join(root, 'test/cart.test.js'));
    const gate = gateCli(root, 'test-layers-batch', 'gate', '--batch', 'batch-001');
    expect(gate.status).toBe(0);
    expect(gate.out).toMatchObject({ ok: true, status: 'accepted' });
    expect(gate.out.deleted).toEqual([expect.objectContaining({ id: 'cart.unit:add', coveredBy: ['cart.e2e:add'] })]);
  });

  it('gives the verify report format and template the e2e implementation rule', () => {
    expect(read('workflows/verify-code/references/report-format.md')).toContain(E2E_VERIFY_SENTENCE);
    expect(read('workflows/verify-code/checklists/report-template.md')).toContain(E2E_VERIFY_SENTENCE);
  });
});

// @SCN006 (AC6): write-spec may task an e2e test, and implement workers may add one.
describe('@SCN006 write-spec may task an e2e test and implement workers may add one', () => {
  it('renders the e2e implementation line and the declared globs into the kept-types rule', () => {
    const rule = testLayersRule({ version: 1, kept: ['bdd', 'e2e'], paths: { e2e: ['cypress/**'] } });
    expect(rule).toContain(E2E_IMPLEMENTATION_LINE);
    expect(rule).toContain('`cypress/**`');
  });

  it('gives the write-spec tasks template and the write-code workflow the e2e sentence', () => {
    expect(read('workflows/write-spec/templates/tasks.md')).toContain(E2E_TASKS_SENTENCE);
    expect(read('workflows/write-code/WORKFLOW.md')).toContain(E2E_TASKS_SENTENCE);
  });

  it('accepts a justifiedTests entry of type e2e in the handoff', () => {
    const handoff = { schemaVersion: 1, issue: 635, step: 'implement', status: 'passed', intervention: false,
      summary: 'done', artifacts: [], next: 'verify', reasonCode: null };
    const justifiedTests = [{ path: 'cypress/checkout.cy.js', type: 'e2e', justification: 'checkout flow no scenario covers' }];
    expect(validateHandoff({ ...handoff, justifiedTests }).justifiedTests).toEqual(justifiedTests);
  });
});

// @SCN007 (AC7): invalid paths declarations fail closed.
describe('@SCN007 invalid paths declarations fail closed', () => {
  it.each([
    [['cypress/**'], 'paths'],
    [{ smoke: ['smoke/**'] }, 'paths.smoke'],
    [{ e2e: 'cypress/**' }, 'paths.e2e'],
    [{ e2e: [7] }, 'paths.e2e[0]'],
    [{ e2e: [''] }, 'paths.e2e[0]'],
    [{ e2e: ['/abs/cypress/**'] }, 'paths.e2e[0]'],
    [{ e2e: ['cypress/../unit/**'] }, 'paths.e2e[0]'],
    [{ e2e: ['./cypress/**'] }, 'paths.e2e[0]'],
    [{ e2e: ['cypress/'] }, 'paths.e2e[0]'],
    [{ e2e: ['cypress//**'] }, 'paths.e2e[0]'],
    [{ e2e: ['cypress/**', 'cypress/**'] }, 'paths.e2e[1]'],
    [{ e2e: ['a/**'], unit: ['a/**'] }, 'paths.unit[0]'],
  ])('rejects paths %j naming the field %s', (paths, field) => {
    let error;
    try {
      validateTestLayers({ version: 1, kept: ['bdd'], paths });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(TestLayersError);
    expect(error).toMatchObject({ reasonCode: 'test_layers_invalid', key: field });
    expect(error.message.startsWith('steering/test-layers.json: ')).toBe(true);
    expect(error.message).toContain(field);
  });

  it('fails the steering load instead of falling back to the BDD-only default', () => {
    const root = project({ 'steering/test-layers.json': steering({ version: 1, kept: ['bdd'], paths: ['cypress/**'] }) });
    expect(() => loadTestLayers(root)).toThrow(/steering\/test-layers\.json: paths = \["cypress\/\*\*"\]/);
  });
});

// @SCN008 (AC8): upgrade proposes e2e when globs are declared.
describe('@SCN008 upgrade proposes e2e when globs are declared', () => {
  const paths = { e2e: ['cypress/**'] };

  it('detects an e2e count, records kept while preserving paths, and leaves an invalid file unchanged', () => {
    const root = project({
      'steering/test-layers.json': steering({ version: 1, kept: ['bdd'], paths }),
      'cypress/login.cy.js': "it('logs in', () => {});\n",
      'test/cart.test.js': "it('adds', () => {});\n",
    });
    const item = detectTestLayers(root);
    expect(item.detectedTypes.e2e).toBe(1);

    expect(applyTestLayers(root, item, ['bdd', 'e2e'])).toMatchObject({ status: 'applied', kept: ['bdd', 'e2e'] });
    expect(readJson(root, 'steering/test-layers.json')).toEqual({ version: 1, kept: ['bdd', 'e2e'], paths });

    const invalid = '{"version":1,"kept":["bdd"],"paths":{"smoke":["x/**"]}}\n';
    fs.writeFileSync(path.join(root, 'steering/test-layers.json'), invalid);
    const broken = detectTestLayers(root);
    expect(broken.configError).toMatch(/paths\.smoke/);
    expect(applyTestLayers(root, broken, ['bdd', 'e2e']).status).toMatch(/^failed:steering\/test-layers\.json: paths\.smoke/);
    expect(fs.readFileSync(path.join(root, 'steering/test-layers.json'), 'utf8')).toBe(invalid);
  });

  it('names e2e first among the non-bdd options in the upgrade workflow', () => {
    expect(read('workflows/upgrade-project/WORKFLOW.md')).toContain(
      'then the detected non-`bdd` types in vocabulary order (`e2e`, `unit`, `integration`, `property`, `doc`)',
    );
  });
});
