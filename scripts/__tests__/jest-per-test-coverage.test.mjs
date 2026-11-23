// Scenario implementations for specs/590-…/feature.gherkin: file-independent per-test outcome ids for the test-layer gate.
import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { collect } from '../jest-per-test-coverage.mjs';
import { computeCandidates, gateBatch } from '../upgrade-test-layers.mjs';

const DOC = 'scripts/__tests__/pick-doc.test.mjs';
const BDD = 'scripts/__tests__/pick-bdd.test.mjs';
const SOURCE = 'src/pick.mjs';
const SOURCE_TEXT = [
  'export function pick(flag) {',
  "  if (flag) return 'a';",
  "  return 'b';",
  '}',
  '',
].join('\n');
const roots = [];

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

// A temporary repository holding the covered source file, so collect() can read its blank lines.
function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-per-test-coverage-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, SOURCE), SOURCE_TEXT);
  return root;
}

// Istanbul-format coverage for the source file: both statements and both branches of `pick` run.
function coverageFor(root) {
  const absolute = path.join(root, SOURCE);
  return {
    [absolute]: {
      path: absolute,
      statementMap: {
        0: { start: { line: 2, column: 2 }, end: { line: 2, column: 22 } },
        1: { start: { line: 3, column: 2 }, end: { line: 3, column: 14 } },
      },
      s: { 0: 1, 1: 1 },
      branchMap: {
        0: {
          type: 'if',
          locations: [{ start: { line: 2, column: 2 }, end: { line: 2, column: 22 } }, { start: { line: 3, column: 2 }, end: { line: 3, column: 14 } }],
        },
      },
      b: { 0: [1, 1] },
    },
  };
}

function assertion(describeTitle, title, status = 'passed') {
  return { title, fullName: `${describeTitle} ${title}`, status, ancestorTitles: [describeTitle] };
}

function jestRun(assertions) {
  return { success: assertions.every((item) => item.status !== 'failed'), testResults: [{ status: 'passed', assertionResults: assertions }] };
}

const DOC_RUN = jestRun([
  assertion('pick (doc)', 'returns a for a truthy flag'),
  assertion('pick (doc)', 'returns b for a falsy flag'),
]);

const BDD_RUN = jestRun([
  assertion('@SCN002 pick (bdd)', 'returns a for a truthy flag'),
  assertion('@SCN002 pick (bdd)', 'returns b for a falsy flag'),
]);

describe('@SCN001 Outcome ids do not depend on the test file', () => {
  it('gives an it under different describes and files the identical <title>:<status> outcome', () => {
    const root = tempRoot();
    const coverage = coverageFor(root);
    const alpha = collect(
      'scripts/__tests__/alpha.test.mjs',
      jestRun([assertion('alpha block', 'returns b for a falsy flag')]),
      coverage,
      new Set(),
      root,
    );
    const beta = collect(
      'scripts/__tests__/beta.test.mjs',
      jestRun([assertion('beta block', 'returns b for a falsy flag')]),
      coverage,
      new Set(),
      root,
    );
    expect(alpha.test.outcomes).toEqual(['returns b for a falsy flag:passed']);
    expect(beta.test.outcomes).toEqual(alpha.test.outcomes);
  });

  it('keeps every test file path and describe title out of the reported outcomes', () => {
    const root = tempRoot();
    const { test } = collect(DOC, DOC_RUN, coverageFor(root), new Set(), root);
    expect(test.outcomes).toEqual(['returns a for a truthy flag:passed', 'returns b for a falsy flag:passed']);
    for (const outcome of test.outcomes) {
      expect(outcome).not.toContain(DOC);
      expect(outcome).not.toContain('pick (doc)');
    }
  });

  it('reports a suite that fails to run as (suite):failed and marks the run failed', () => {
    const root = tempRoot();
    const failedSuite = {
      success: false,
      testResults: [{ status: 'failed', testExecError: { message: 'SyntaxError: unexpected token' }, assertionResults: [] }],
    };
    const { test, failed } = collect(DOC, failedSuite, coverageFor(root), new Set(), root);
    expect(test.outcomes).toEqual(['(suite):failed']);
    expect(failed).toBe(true);
  });
});

describe('@SCN002 A cross-file doc to bdd conversion passes the gate', () => {
  it('accepts deleting the doc file whose it blocks moved into the covering bdd test', () => {
    const root = tempRoot();
    const coverage = coverageFor(root);
    const doc = collect(DOC, DOC_RUN, coverage, new Set(), root).test;
    const bdd = collect(BDD, BDD_RUN, coverage, new Set(), root).test;
    const before = { tests: [{ ...doc, type: 'doc' }, { ...bdd, type: 'bdd' }] };
    const after = { tests: [{ ...bdd, type: 'bdd' }] };

    const result = gateBatch(before, after, { status: 0 }, { file: DOC }, ['bdd']);

    expect(result.status).toBe('accepted');
    expect(result.deleted).toEqual([
      { id: DOC, file: DOC, coveredBy: [BDD], lines: [`${SOURCE}:2`, `${SOURCE}:3`] },
    ]);
  });
});

describe('@SCN003 Dropping an asserted outcome is still refused', () => {
  it('refuses the batch with test_layers_coverage_gap naming only the missing outcome', () => {
    const root = tempRoot();
    const coverage = coverageFor(root);
    const doc = collect(DOC, DOC_RUN, coverage, new Set(), root).test;
    const bddWithoutOneBlock = collect(
      BDD,
      jestRun([assertion('@SCN003 pick (bdd)', 'returns a for a truthy flag')]),
      coverage,
      new Set(),
      root,
    ).test;
    const before = { tests: [{ ...doc, type: 'doc' }, { ...bddWithoutOneBlock, type: 'bdd' }] };
    const after = { tests: [{ ...bddWithoutOneBlock, type: 'bdd' }] };

    const result = gateBatch(before, after, { status: 0 }, { file: DOC }, ['bdd']);

    expect(result.status).toBe('refused');
    expect(result.reasonCode).toBe('test_layers_coverage_gap');
    expect(result.gap.outcomes).toEqual(['returns b for a falsy flag:passed']);
  });
});

describe('@SCN004 Candidates label a cross-file covered test as duplicate', () => {
  it('labels the doc test duplicate with the bdd test id in coveredBy, not unmatched', () => {
    const root = tempRoot();
    const coverage = coverageFor(root);
    const doc = collect(DOC, DOC_RUN, coverage, new Set(), root).test;
    const bdd = collect(BDD, BDD_RUN, coverage, new Set(), root).test;

    const result = computeCandidates([], ['bdd'], [{ ...doc, type: 'doc' }, { ...bdd, type: 'bdd' }]);

    expect(result.unmatched).toEqual([]);
    const entries = result.batches.flatMap((batch) => batch.tests);
    expect(entries).toEqual([{ id: DOC, label: 'duplicate', coveredBy: [BDD] }]);
  });
});
