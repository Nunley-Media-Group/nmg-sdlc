// Scenario implementations for the workflow and documentation contract of the #572 test-layer migration item.
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const workflow = read('workflows/upgrade-project/WORKFLOW.md');
const reference = read('workflows/upgrade-project/references/test-layer-migration.md');
const readme = read('README.md');

describe('@SCN001 operator chooses kept test types (workflow question)', () => {
  it('asks one multi-select question over only the detected types with bdd first and recommended', () => {
    expect(workflow).toMatch(/^15\. Test layers: .*`test-layers:<sha256>`/m);
    expect(workflow).toContain('Kept test types (`test-layers`) is one multi-select question, asked before any change');
    expect(workflow).toContain('`bdd (Recommended)` first');
    expect(workflow).toContain('list only detected types');
    expect(workflow).toContain('When a fourth non-`bdd` type is detected, the question paragraph names it and says to type it in Other.');
    expect(workflow).toContain('Skip the question when `bdd` is the only detected type');
    expect(workflow).toContain('"--approve","test-layers:<digest>","--kept","bdd,unit"');
    expect(workflow).toContain('references/test-layer-migration.md');
  });
});

describe('@SCN005 uncovered behavior is converted before deletion (reference procedure)', () => {
  it('orders candidates, begin, conversion reusing step definitions, deletion, gate and report', () => {
    const order = [
      'test-layers-candidates',
      'test-layers-batch begin',
      'Scenario Outline Examples row',
      'reusing existing step definitions',
      'Delete a converted test only in the same batch as its conversion',
      'test-layers-batch gate',
      'test-layers-report',
    ].map((text) => reference.indexOf(text));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(reference).toContain('A refused batch is recorded and not retried unchanged');
  });
});

describe('@SCN009 before/after report (documentation)', () => {
  it('documents the item, its gate, refusal codes, report and the test-coverage.json formats in the README', () => {
    for (const text of [
      '#### Test-layer migration',
      'test_layers_suite_failed',
      'test_layers_coverage_gap',
      'test_layers_removal_out_of_batch',
      'test_coverage_command_missing',
      'test_coverage_config_invalid',
      'test-layers-report --root .',
      '| `steering/test-coverage.json` |',
      '"coverage": { "program": "node"',
      '"branches": ["src/cart.js:12:0"]',
    ]) expect(readme).toContain(text);
  });
});
