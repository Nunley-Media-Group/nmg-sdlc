// The v2 per-test coverage report read from NMG_SDLC_COVERAGE_OUTPUT (#615 AC1-AC6), and the v1 stdout form kept
// unchanged. Each fixture is a disposable Git project whose coverage command prints the plan's v1 report on stdout,
// or writes its v2 report to the file the plugin names. Test ids cite their @SCN tag in each describe title.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { runSteeringValidations } from '../../src/sdlc-verification-runtime.mjs';
import { beginTestLayersBatch, gateTestLayersBatch, testLayersCandidates, testLayersReport } from '../upgrade-test-layers.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const STATE = path.join('.nmg-sdlc', 'upgrade', 'test-layers');
const MiB = 1024 * 1024;
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

// The fixture coverage command. It prints the plan's tests as v1 JSON on stdout, or streams them as v2 to the file in
// NMG_SDLC_COVERAGE_OUTPUT. A test whose file is gone from the tree drops out, as a deleted test would.
const COVERAGE_SCRIPT = `import fs from 'node:fs';
const plan = JSON.parse(fs.readFileSync('tools/coverage-plan.json', 'utf8'));
const present = plan.tests.filter((test) => fs.existsSync(test.file));
const toV2 = (test) => {
  const lines = {};
  const branches = {};
  for (const entry of test.lines) {
    const [file, line] = entry.split(':');
    (lines[file] ??= []).push([Number(line), Number(line)]);
  }
  for (const entry of test.branches) {
    const [file, line, index] = entry.split(':');
    (branches[file] ??= []).push([Number(line), Number(index), Number(index)]);
  }
  return { id: test.id, file: test.file, lines, branches, outcomes: test.outcomes };
};
if (plan.format === 'v1') {
  process.stdout.write(JSON.stringify({ version: 1, tests: present }));
} else {
  const output = process.env.NMG_SDLC_COVERAGE_OUTPUT;
  if (!output) { process.stderr.write('NMG_SDLC_COVERAGE_OUTPUT is not set'); process.exit(4); }
  const fd = fs.openSync(output, 'w');
  const write = (text) => {
    const bytes = Buffer.from(text);
    for (let offset = 0; offset < bytes.length;) offset += fs.writeSync(fd, bytes, offset, bytes.length - offset);
  };
  if (plan.raw) {
    write(plan.raw.join('\\n') + '\\n');
  } else {
    write('{"version":2}\\n');
    for (const test of present) {
      const text = JSON.stringify(toV2(test));
      write((plan.padBytes ? text.slice(0, -1) + ' '.repeat(plan.padBytes) + '}' : text) + '\\n');
    }
  }
  fs.closeSync(fd);
  if (plan.requireBytes && fs.statSync(output).size <= plan.requireBytes) { process.stderr.write('report too small'); process.exit(3); }
}
`;

const write = (root, rel, text) => {
  const target = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
};

const git = (root, ...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};

const CART_FILES = {
  'features/cart.feature': 'Feature: Cart\n',
  'test/cart.test.js': '// fixture\n',
  'src/cart.js': 'export const cart = [];\n',
};

// A committed project whose coverage command reports `plan`. `files` adds or replaces fixture files.
function project({ plan, files = {}, kept = ['bdd'] }) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-615-v2-')));
  roots.push(root);
  const all = {
    '.gitignore': '.nmg-sdlc/\n',
    ...CART_FILES,
    ...files,
    'tools/suite.mjs': 'process.exit(0);\n',
    'tools/coverage.mjs': COVERAGE_SCRIPT,
    'tools/coverage-plan.json': `${JSON.stringify(plan)}\n`,
    'steering/test-layers.json': `${JSON.stringify({ version: 1, kept }, null, 2)}\n`,
    'steering/test-coverage.json': `${JSON.stringify({ version: 1,
      suite: { program: process.execPath, args: ['tools/suite.mjs'] },
      coverage: { program: process.execPath, args: ['tools/coverage.mjs'] } }, null, 2)}\n`,
  };
  for (const [rel, text] of Object.entries(all)) write(root, rel, text);
  git(root, 'init', '-q');
  git(root, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '-A');
  git(root, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'fixture');
  return root;
}

// The cart fixture: a bdd scenario, a unit test it covers entirely (duplicate) and a unit test it does not (convert).
const CART = [
  { id: 'cart.feature:add', file: 'features/cart.feature', lines: ['src/cart.js:1', 'src/cart.js:2'], branches: ['src/cart.js:2:0'], outcomes: ['adds-item'] },
  { id: 'cart.test.js:remove', file: 'test/cart.test.js', lines: ['src/cart.js:3'], branches: ['src/cart.js:3:1'], outcomes: ['removes-item'] },
];
const PRICING = { id: 'pricing.test.js:total', file: 'test/pricing.test.js', lines: ['src/cart.js:1'], branches: [], outcomes: ['adds-item'] };
const PRICING_FILES = { 'test/pricing.test.js': '// fixture\n' };

// Runs the batch loop over the cart and pricing fixture: the pricing batch is accepted, the cart batch is refused.
function batchFlow(root) {
  const candidates = testLayersCandidates(root);
  const begunPricing = beginTestLayersBatch(root, 'batch-002');
  fs.rmSync(path.join(root, 'test/pricing.test.js'));
  const accepted = gateTestLayersBatch(root, 'batch-002');
  const begunCart = beginTestLayersBatch(root, 'batch-001');
  fs.rmSync(path.join(root, 'test/cart.test.js'));
  const refused = gateTestLayersBatch(root, 'batch-001');
  return { candidates, begunPricing, accepted, begunCart, refused, report: testLayersReport(root) };
}

const pricingProject = (format) => project({
  plan: { format, tests: [...CART, PRICING] },
  files: PRICING_FILES,
});

describe('@SCN001 A v2 report larger than 256 MiB is read from the provided path', () => {
  it('records the baseline and lists the migration batch', () => {
    const padded = Array.from({ length: 260 }, (_, index) => ({
      id: `cart.test.js:pad-${index}`, file: 'test/cart.test.js', lines: [], branches: [], outcomes: [`pad-${index}`],
    }));
    const root = project({ plan: { format: 'v2', padBytes: MiB, requireBytes: 256 * MiB, tests: [...CART, ...padded] } });

    const result = testLayersCandidates(root);

    expect(result).toMatchObject({ ok: true, unmatched: [] });
    expect(result.batches.map((batch) => batch.file)).toEqual(['test/cart.test.js']);
    expect(result.batches[0].tests).toHaveLength(261);
    const baseline = JSON.parse(fs.readFileSync(path.join(root, STATE, 'baseline.json'), 'utf8'));
    expect(baseline.before).toMatchObject({ testCount: 262, lines: 3 });
  }, 120000);
});

describe('@SCN002 A v1 report on stdout keeps working unchanged', () => {
  it('lists the candidates the v1 run lists', () => {
    const root = pricingProject('v1');
    const result = testLayersCandidates(root);
    expect(result).toMatchObject({ ok: true, kept: ['bdd'], unmatched: [] });
    expect(result.batches).toEqual([
      { id: 'batch-001', file: 'test/cart.test.js', type: 'unit', feature: 'features/cart.feature',
        tests: [{ id: 'cart.test.js:remove', label: 'convert', target: 'features/cart.feature' }] },
      { id: 'batch-002', file: 'test/pricing.test.js', type: 'unit', feature: null,
        tests: [{ id: 'pricing.test.js:total', label: 'duplicate', coveredBy: ['cart.feature:add'] }] },
    ]);
    expect(result.baseline).toMatchObject({ testCount: 3, lines: 3, branches: 2, outcomes: 2 });
  });

  it('begins the batch and accepts the duplicate with its evidence, then refuses the convert batch with its gap', () => {
    const flow = batchFlow(pricingProject('v1'));
    expect(flow.begunPricing).toEqual({ ok: true, batch: 'batch-002', status: 'begun', file: 'test/pricing.test.js',
      tests: [{ id: 'pricing.test.js:total', label: 'duplicate', coveredBy: ['cart.feature:add'] }] });
    expect(flow.accepted).toEqual({ ok: true, batch: 'batch-002', file: 'test/pricing.test.js', status: 'accepted',
      deleted: [{ id: 'pricing.test.js:total', file: 'test/pricing.test.js', coveredBy: ['cart.feature:add'], lines: ['src/cart.js:1'] }] });
    expect(flow.refused).toMatchObject({ ok: false, batch: 'batch-001', status: 'refused', reasonCode: 'test_layers_coverage_gap',
      gap: { lines: ['src/cart.js:3'], branches: ['src/cart.js:3:1'], outcomes: ['removes-item'] } });
    expect(flow.report).toMatchObject({ ok: true, accepted: [{ batch: 'batch-002', file: 'test/pricing.test.js' }],
      refused: [{ batch: 'batch-001', file: 'test/cart.test.js', reasonCode: 'test_layers_coverage_gap' }] });
  });

  it('gates a v1 report the verification gate reads from stdout as it did before, with no output file', async () => {
    const root = await gateProject();
    const runCoverage = async (program, args, { env }) => {
      expect(env.NMG_SDLC_COVERAGE_OUTPUT).toMatch(/report\.ndjson$/);
      return { status: 0, stdout: JSON.stringify({ version: 1, tests: [{ id: 'tests/app.test.js', file: 'tests/app.test.js',
        lines: ['src/app.js:1'], branches: [], outcomes: [] }] }) };
    };
    const artifact = await verifyGate(root, { runCoverage });
    expect(byId(artifact)['unit.tests']).toMatchObject({ effectiveStatus: 'passed', coverage: {
      changedLines: ['src/app.js:1'], hitLines: ['src/app.js:1'], uncovered: [], counts: { changedLines: 1, hitLines: 1, uncovered: 0 } } });
  });
});

describe('@SCN003 A malformed v2 line refuses with its line number', () => {
  const header = '{"version":2}';
  const testLine = (id, file = 'test/cart.test.js', lines = { 'src/cart.js': [[1, 1]] }) => JSON.stringify({
    id, file, lines, branches: {}, outcomes: [id],
  });

  it.each([
    ['invalid JSON', 3, [header, testLine('a'), '{"id":', testLine('b')]],
    ['missing the v2 header', 1, [testLine('a'), testLine('b')]],
  ])('refuses the candidates run naming line %s, which holds %s', (_defect, line, raw) => {
    const root = project({ plan: { format: 'v2', tests: [], raw } });
    const result = testLayersCandidates(root);
    expect(result).toMatchObject({ ok: false, reasonCode: 'test_layers_coverage_failed' });
    expect(result.message).toMatch(new RegExp(`^line ${line}: `));
  });

  it.each([
    ['a reversed range [5,2]', 2, [header, testLine('a', 'tests/app.test.js', { 'src/app.js': [[5, 2]] }), testLine('b', 'tests/app.test.js')]],
    ['a duplicate test id', 4, [header, testLine('a', 'tests/app.test.js'), testLine('b', 'tests/app.test.js'), testLine('a', 'tests/app.test.js')]],
  ])('fails the verification gate coverage check naming line %s, which holds %s', async (_defect, line, raw) => {
    const root = await gateProject();
    const artifact = await verifyGate(root, { runCoverage: rawCoverage(raw) });
    expect(byId(artifact)['unit.tests']).toMatchObject({ effectiveStatus: 'failed', selection: { reason: 'coverage_failed' } });
    expect(byId(artifact)['unit.tests'].result.summary).toMatch(new RegExp(`^coverage_failed: coverage report invalid: line ${line}: `));
  });
});

describe('@SCN004 v1 and v2 forms of the same coverage classify identically', () => {
  it('gives identical candidates and identical batch gate decisions', () => {
    const v1 = batchFlow(pricingProject('v1'));
    const v2 = batchFlow(pricingProject('v2'));
    const comparable = (candidates) => ({ ok: candidates.ok, kept: candidates.kept, batches: candidates.batches, unmatched: candidates.unmatched });
    expect(comparable(v2.candidates)).toEqual(comparable(v1.candidates));
    expect(v2.accepted).toEqual(v1.accepted);
    expect(v2.refused).toEqual(v1.refused);
    expect(v2.refused).toMatchObject({ reasonCode: 'test_layers_coverage_gap' });
    expect(v2.report.accepted).toEqual(v1.report.accepted);
    expect(v2.report.refused).toEqual(v1.report.refused);
  });
});

describe('@SCN005 Begin state round-trips without a suite-sized string', () => {
  const BIG_CASES = 2200;
  // Each test id carries 500 characters, so the begun suite is over 1 MiB in one test per line.
  const bigTests = Array.from({ length: BIG_CASES }, (_, index) => ({
    id: `big.test.js:case-${index + 1}-${'i'.repeat(500)}`, file: 'test/big.test.js', lines: [`src/big.js:${index + 1}`], branches: [],
    outcomes: [`case-${index + 1}`],
  }));
  // One scenario covers every big test but the last, so the big batch is refused with a one-entry gap.
  const bigScenario = { id: 'big.feature:covering', file: 'features/big.feature',
    lines: Array.from({ length: BIG_CASES - 1 }, (_, index) => `src/big.js:${index + 1}`), branches: [],
    outcomes: Array.from({ length: BIG_CASES - 1 }, (_, index) => `case-${index + 1}`) };
  const SMALL = [
    { id: 'small.feature:s', file: 'features/small.feature', lines: ['src/small.js:1'], branches: [], outcomes: ['small-ok'] },
    { id: 'small.test.js:s', file: 'test/small.test.js', lines: ['src/small.js:1'], branches: [], outcomes: ['small-ok'] },
  ];
  const FILES = { 'features/big.feature': 'Feature: Big\n', 'features/small.feature': 'Feature: Small\n',
    'test/big.test.js': '// big\n', 'test/small.test.js': '// small\n' };

  // Accepts the small batch, then begins the big batch, measuring its begin record and sidecar, and refuses it.
  function bigFlow(root) {
    const candidates = testLayersCandidates(root);
    beginTestLayersBatch(root, 'batch-002');
    fs.rmSync(path.join(root, 'test/small.test.js'));
    const accepted = gateTestLayersBatch(root, 'batch-002');
    const begun = beginTestLayersBatch(root, 'batch-001');
    const sidecar = path.join(root, STATE, 'batches', 'batch-001.begin.tests.ndjson');
    const measured = { begun, record: JSON.parse(fs.readFileSync(path.join(root, STATE, 'batches', 'batch-001.begin.json'), 'utf8')),
      sidecarLines: fs.readFileSync(sidecar, 'utf8').split('\n').filter(Boolean).length, sidecarBytes: fs.statSync(sidecar).size };
    fs.rmSync(path.join(root, 'test/big.test.js'));
    const refused = gateTestLayersBatch(root, 'batch-001');
    return { candidates, accepted, measured, refused, restored: fs.existsSync(path.join(root, 'test/big.test.js')) };
  }

  it('stores the begun tests one per line, keeps no tests in the record, and gates both batches as the v1 run does', () => {
    const plan = (format) => ({ format, tests: [bigScenario, ...bigTests, ...SMALL] });
    const v2 = project({ plan: plan('v2'), files: FILES });
    const v1 = project({ plan: plan('v1'), files: FILES });
    const spy = jest.spyOn(JSON, 'stringify');
    let v2Flow;
    try {
      v2Flow = bigFlow(v2);
    } finally {
      spy.mockRestore();
    }
    const v1Flow = bigFlow(v1);

    expect(v2Flow.candidates.batches.map((batch) => [batch.file, batch.tests.length])).toEqual([
      ['test/big.test.js', BIG_CASES], ['test/small.test.js', 1],
    ]);
    expect(v2Flow.accepted).toMatchObject({ ok: true, status: 'accepted' });
    expect(v2Flow.measured.begun).toMatchObject({ ok: true, status: 'begun' });
    expect(v2Flow.measured.record).toMatchObject({ version: 2, testsFile: 'batch-001.begin.tests.ndjson' });
    expect(v2Flow.measured.record).not.toHaveProperty('tests');
    expect(v2Flow.measured.sidecarLines).toBe(BIG_CASES + 2);
    expect(v2Flow.measured.sidecarBytes).toBeGreaterThan(MiB);
    expect(v2Flow.refused).toMatchObject({ ok: false, status: 'refused', reasonCode: 'test_layers_coverage_gap',
      gap: { lines: [`src/big.js:${BIG_CASES}`], branches: [], outcomes: [`case-${BIG_CASES}`] } });
    expect(v2Flow.restored).toBe(true);

    expect(v2Flow.accepted).toEqual(v1Flow.accepted);
    expect(v2Flow.refused).toEqual(v1Flow.refused);
  }, 120000);

  it('never builds a string longer than 64 KiB while storing or reading the begin state', () => {
    const root = project({ plan: { format: 'v2', tests: [bigScenario, ...bigTests, ...SMALL] }, files: FILES });
    testLayersCandidates(root);
    beginTestLayersBatch(root, 'batch-002');
    fs.rmSync(path.join(root, 'test/small.test.js'));
    const spy = jest.spyOn(JSON, 'stringify');
    try {
      gateTestLayersBatch(root, 'batch-002');
      beginTestLayersBatch(root, 'batch-001');
      fs.rmSync(path.join(root, 'test/big.test.js'));
      gateTestLayersBatch(root, 'batch-001');
      const longest = Math.max(0, ...spy.mock.results.map((result) => (typeof result.value === 'string' ? result.value.length : 0)));
      expect(longest).toBeLessThanOrEqual(64 * 1024);
    } finally {
      spy.mockRestore();
    }
  }, 120000);
});

describe('@SCN006 The references describe the v2 contract', () => {
  it.each([
    'references/verification-scope.md',
    'references/steering-schema.md',
    'workflows/upgrade-project/references/test-layer-migration.md',
  ])('names the v2 contract in %s', (rel) => {
    const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    for (const term of ['NMG_SDLC_COVERAGE_OUTPUT', '{"version":2}', 'one test per line', '[from, to]', '[line, fromIndex, toIndex]', 'v1']) {
      expect(text).toContain(term);
    }
  });
});

// The verification-gate fixture: a committed project on branch `work` whose changed src/app.js line the selected
// test tests/app.test.js must cover. Its coverage command is injected, so each case chooses the report it reads.
const SELECTED = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
const acquireSlot = async () => ({ slot: 1, waitedMs: 0, release: () => {} });
const runSelection = () => ({ status: 0, stdout: JSON.stringify({ type: 'result', structured_output: SELECTED }) });
const byId = (artifact) => Object.fromEntries(artifact.results.map((result) => [result.id, result]));

async function gateProject() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-615-gate-')));
  roots.push(root);
  for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) write(root, `specs/42-test/${name}`, `${name}\n`);
  write(root, '.gitignore', '.nmg-sdlc/\n');
  await applySteeringPlan(root, createInitializePlan(root, { validations: [] }));
  write(root, 'steering/test-coverage.json', `${JSON.stringify({ version: 1,
    suite: { program: process.execPath, args: ['-e', '0'] }, coverage: { program: process.execPath, args: ['-e', '0'] } }, null, 2)}\n`);
  const manifestFile = path.join(root, 'steering/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.validations = [{ id: 'unit.tests', provider: 'builtin.command', required: true, when: { kind: 'always' }, tier: 'change',
    selection: true, config: { program: process.execPath, args: ['-e', 'process.exitCode = 0'], cwd: '.', env: [] } }];
  manifest.selection = { docPaths: ['docs/**'], fallbackPaths: ['package.json'] };
  manifest.surfaces = [{ id: 'app', sources: ['src/**'] }, { id: 'other', sources: ['other/**'] }];
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  write(root, 'tests/app.test.js', '// app test\n');
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'baseline');
  git(root, 'checkout', '-b', 'work');
  write(root, 'src/app.js', 'a();\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'change src/app.js');
  return root;
}

const verifyGate = (root, extra = {}) => runSteeringValidations({ projectRoot: root, issue: 42,
  specDir: path.join(root, 'specs/42-test'), baseRef: 'main', verificationRunId: 'run-1', runSelection, models: {}, acquireSlot, ...extra });

// A coverage command that writes exactly `lines` to the report file the plugin names.
const rawCoverage = (lines) => async (program, args, { env }) => {
  fs.writeFileSync(env.NMG_SDLC_COVERAGE_OUTPUT, `${lines.join('\n')}\n`);
  return { status: 0, stdout: '' };
};
