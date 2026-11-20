import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTestLayers } from '../check-test-layers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fixture({ kept = ['bdd'], allowlist = null, files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-check-layers-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  if (kept !== null) write('steering/test-layers.json', typeof kept === 'string' ? kept : `${JSON.stringify({ version: 1, kept })}\n`);
  if (allowlist !== null) write('scripts/test-layers-allowlist.json', `${JSON.stringify({ version: 1, files: allowlist })}\n`);
  write('scripts/__tests__/accepted.test.mjs', "describe('@SCN001 accepted', () => {});\n");
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  return root;
}

const codes = (result) => result.violations.map((violation) => violation.reasonCode);

describe('@SCN001 the repository keeps bdd as its only test type (#591 AC1)', () => {
  it('records {"version":1,"kept":["bdd"]} in steering/test-layers.json', () => {
    const recorded = JSON.parse(fs.readFileSync(path.join(repoRoot, 'steering/test-layers.json'), 'utf8'));
    expect(recorded).toEqual({ version: 1, kept: ['bdd'] });
  });

  it('passes the kept-layer check on this repository', () => {
    const result = checkTestLayers(repoRoot);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('@SCN015 CI rejects a test of a type the project does not keep (#591 AC4)', () => {
  it.each([
    ['unit', 'scripts/__tests__/parser.test.mjs'],
    ['doc', 'scripts/__tests__/readme-contract.test.mjs'],
  ])('flags a new %s test that the allowlist does not list', (type, rel) => {
    const root = fixture({ allowlist: [], files: { [rel]: "it('x', () => {});\n" } });
    const result = checkTestLayers(root);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([expect.objectContaining({ reasonCode: 'test_layers_type_not_kept', path: rel, type })]);
  });

  it('accepts an allowlisted unit test and every bdd test', () => {
    const rel = 'scripts/__tests__/parser.test.mjs';
    const root = fixture({ allowlist: [rel], files: { [rel]: "it('x', () => {});\n" } });
    expect(checkTestLayers(root)).toEqual({ ok: true, kept: ['bdd'], violations: [] });
  });

  it('accepts a unit test when the project keeps unit', () => {
    const root = fixture({ kept: ['bdd', 'unit'], files: { 'scripts/__tests__/parser.test.mjs': "it('x', () => {});\n" } });
    expect(checkTestLayers(root).ok).toBe(true);
  });

  it('exits 1 from the CLI and prints the violation', () => {
    const root = fixture({ files: { 'scripts/__tests__/parser.test.mjs': "it('x', () => {});\n" } });
    const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/check-test-layers.mjs'), '--root', root], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout).violations[0].reasonCode).toBe('test_layers_type_not_kept');
  });
});

describe('@SCN016 the allowlist only shrinks (#591 AC5)', () => {
  it('flags an allowlisted file that no longer exists', () => {
    const root = fixture({ allowlist: ['scripts/__tests__/gone.test.mjs'] });
    const result = checkTestLayers(root);
    expect(codes(result)).toEqual(['test_layers_allowlist_stale']);
    expect(result.violations[0].path).toBe('scripts/__tests__/gone.test.mjs');
  });

  it('flags an allowlisted file that is now a bdd test', () => {
    const root = fixture({ allowlist: ['scripts/__tests__/accepted.test.mjs'] });
    expect(codes(checkTestLayers(root))).toEqual(['test_layers_allowlist_stale']);
  });

  it('flags an invalid steering/test-layers.json', () => {
    const root = fixture({ kept: '{"version":1,"kept":["unit"]}\n' });
    expect(codes(checkTestLayers(root))).toEqual(['test_layers_invalid']);
  });

  it('flags a malformed allowlist', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'scripts/test-layers-allowlist.json'), '{"files":"x"}\n');
    expect(codes(checkTestLayers(root))).toEqual(['test_layers_allowlist_invalid']);
  });

  it('exits 2 for an unknown argument', () => {
    const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/check-test-layers.mjs'), '--bogus'], { encoding: 'utf8' });
    expect(run.status).toBe(2);
  });
});

describe('@SCN017 CI runs the kept-layer check before the tests (#591 AC6)', () => {
  it('runs check-test-layers.mjs before the Jest suite in the verify job', () => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/nmg-sdlc-verify.yml'), 'utf8');
    const check = workflow.indexOf('run: node scripts/check-test-layers.mjs --root .');
    const tests = workflow.indexOf('run: npm test');
    expect(check).toBeGreaterThan(-1);
    expect(tests).toBeGreaterThan(check);
  });
});
