// Scenario implementations for specs/635-…/feature.gherkin: the technology-agnostic e2e test type that projects
// identify by declared path globs.
import { afterEach, describe, expect, it } from '@jest/globals';
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
