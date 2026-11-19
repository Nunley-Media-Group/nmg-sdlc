import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadTestLayers,
  TEST_LAYER_DEFAULTS,
  TEST_LAYER_TYPES,
  TestLayersError,
  testLayersRule,
  validateTestLayers,
} from '../test-layers.mjs';

function project(contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-test-layers-'));
  if (contents !== undefined) {
    fs.mkdirSync(path.join(root, 'steering'));
    fs.writeFileSync(path.join(root, 'steering', 'test-layers.json'), contents);
  }
  return root;
}

function rejection(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new Error('expected a TestLayersError');
}

// @SCN002 (AC2): the kept-test-types setting is read and validated.
describe('@SCN002 test-layers reader', () => {
  it('accepts known kept types including bdd and orders them as the vocabulary', () => {
    expect(TEST_LAYER_TYPES).toEqual(['bdd', 'unit', 'integration', 'property', 'doc']);
    expect(validateTestLayers({ version: 1, kept: ['unit', 'bdd'] })).toEqual({ version: 1, kept: ['bdd', 'unit'] });
    expect(validateTestLayers({ version: 1, kept: [...TEST_LAYER_TYPES].reverse() }).kept).toEqual(TEST_LAYER_TYPES);
  });

  it.each([
    [{ version: 2, kept: ['bdd'] }, 'version', 'steering/test-layers.json: version = 2: must be 1'],
    [{ version: 1, kept: ['bdd'], extra: true }, 'extra', 'steering/test-layers.json: extra = true: unknown key'],
    [{ version: 1, kept: ['bdd', 'e2e'] }, 'kept[1]', 'steering/test-layers.json: kept[1] = "e2e": unknown test type'],
    [{ version: 1, kept: ['bdd', 'bdd'] }, 'kept[1]', 'steering/test-layers.json: kept[1] = "bdd": duplicate test type'],
    [{ version: 1, kept: [] }, 'kept', 'steering/test-layers.json: kept = []: must be a non-empty array'],
    [{ version: 1, kept: ['unit'] }, 'kept', 'steering/test-layers.json: kept = ["unit"]: must include bdd'],
    [{ version: 1 }, 'kept', 'steering/test-layers.json: kept = undefined'],
    [['bdd'], '(root)', 'steering/test-layers.json: (root)'],
  ])('rejects %j naming the file and the %s field', (value, key, message) => {
    const error = rejection(() => validateTestLayers(value));
    expect(error).toBeInstanceOf(TestLayersError);
    expect(error.reasonCode).toBe('test_layers_invalid');
    expect(error.key).toBe(key);
    expect(error.message.startsWith(message)).toBe(true);
  });

  it('resolves a missing file to BDD-only', () => {
    expect(loadTestLayers(project())).toEqual({ config: { version: 1, kept: ['bdd'] }, missing: true });
    expect(TEST_LAYER_DEFAULTS).toEqual({ version: 1, kept: ['bdd'] });
  });

  it('loads a valid file', () => {
    expect(loadTestLayers(project('{"version":1,"kept":["bdd","property"]}\n')))
      .toEqual({ config: { version: 1, kept: ['bdd', 'property'] }, missing: false });
  });

  it('rejects invalid JSON, a symlink, and a non-file', () => {
    expect(rejection(() => loadTestLayers(project('{not json')))).toMatchObject({
      name: 'TestLayersError', key: '(file)',
    });
    expect(rejection(() => loadTestLayers(project('{not json'))).message)
      .toMatch(/^steering\/test-layers\.json: invalid JSON: /);

    const linked = project();
    const real = path.join(linked, 'real.json');
    fs.writeFileSync(real, '{"version":1,"kept":["bdd"]}');
    fs.mkdirSync(path.join(linked, 'steering'));
    fs.symlinkSync(real, path.join(linked, 'steering', 'test-layers.json'));
    expect(rejection(() => loadTestLayers(linked)).message)
      .toBe('steering/test-layers.json: must be a regular file, not a symlink or directory');

    const directory = project();
    fs.mkdirSync(path.join(directory, 'steering', 'test-layers.json'), { recursive: true });
    expect(rejection(() => loadTestLayers(directory)).message)
      .toBe('steering/test-layers.json: must be a regular file, not a symlink or directory');
  });

  it('renders a rule naming exactly the kept types', () => {
    const bddOnly = testLayersRule({ version: 1, kept: ['bdd'] });
    expect(bddOnly).toContain('keeps these test types (from `steering/test-layers.json`; a missing file means `bdd` only): `bdd`.');
    expect(bddOnly).toContain('No other test type is kept');
    for (const type of ['unit', 'integration', 'property', 'doc']) expect(bddOnly).not.toContain(`\`${type}\``);

    const withUnit = testLayersRule({ version: 1, kept: ['bdd', 'unit'] });
    expect(withUnit).toContain('test types (from `steering/test-layers.json`; a missing file means `bdd` only): `bdd`, `unit`.');
    expect(withUnit).toContain('must be of a kept type (`unit`), cover a behavior that no scenario covers, and be justified');
    for (const type of ['integration', 'property', 'doc']) expect(withUnit).not.toContain(`\`${type}\``);
    expect(withUnit).toContain('Never write, task, or keep a test that restates a scenario\'s acceptance criterion.');
  });
});
