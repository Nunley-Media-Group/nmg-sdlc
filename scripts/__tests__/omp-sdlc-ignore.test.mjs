import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OMP_SDLC_IGNORE_LINE,
  ensureOmpSdlcIgnore,
  hasOmpSdlcIgnore,
  untrackOmpSdlcRuntime,
  writeOmpSdlcIgnore,
} from '../omp-sdlc-ignore.mjs';

const SCRIPT = fileURLToPath(new URL('../omp-sdlc-ignore.mjs', import.meta.url));
const roots = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-ignore-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('omp-sdlc ignore management (SCN001–SCN003)', () => {
  it('exports the canonical rule and recognizes only exact non-negated lines', () => {
    expect(OMP_SDLC_IGNORE_LINE).toBe('.omp/sdlc/');
    expect(hasOmpSdlcIgnore('build/\n.omp/sdlc/\n')).toBe(true);
    expect(hasOmpSdlcIgnore('  .omp/sdlc  \n')).toBe(true);
    expect(hasOmpSdlcIgnore('# .omp/sdlc/\n!.omp/sdlc/\n.omp/\n')).toBe(false);
  });

  it('appends the canonical rule and preserves unrelated rules', () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, '.gitignore'), 'dist/');

    expect(ensureOmpSdlcIgnore(root)).toMatchObject({ ok: true, changed: true, status: 'written' });
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('dist/\n.omp/sdlc/\n');
  });

  it.each(['.omp/sdlc/\n', '.omp/sdlc\n'])(
    'leaves an existing rule unchanged: %s',
    (source) => {
      const root = makeRoot();
      fs.writeFileSync(path.join(root, '.gitignore'), source);
      expect(writeOmpSdlcIgnore(root)).toMatchObject({ ok: true, changed: false });
      expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe(source);
    },
  );

  it.each(['# .omp/sdlc/\n', '!.omp/sdlc/\n'])(
    'appends when only a non-matching rule exists: %s',
    (source) => {
      const root = makeRoot();
      fs.writeFileSync(path.join(root, '.gitignore'), source);
      expect(ensureOmpSdlcIgnore(root).changed).toBe(true);
      expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe(`${source}.omp/sdlc/\n`);
    },
  );

  it('preserves an unmanaged .gitignore directory and reports the CLI error', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, '.gitignore'));

    expect(ensureOmpSdlcIgnore(root)).toEqual({
      ok: false,
      changed: false,
      status: 'preserved (unmanaged)',
      reasonCode: 'gitignore_unwritable',
    });
    const cli = spawnSync(process.execPath, [SCRIPT, 'ensure', '--root', root], { encoding: 'utf8' });
    expect(cli.status).toBe(1);
    expect(JSON.parse(cli.stdout)).toMatchObject({ reasonCode: 'gitignore_unwritable' });
    expect(cli.stdout.trim().split('\n')).toHaveLength(1);
  });

  it('does not call git without the managed ignore rule', () => {
    const root = makeRoot();
    const calls = [];
    const result = untrackOmpSdlcRuntime({ cwd: root, run: (...args) => calls.push(args) });
    expect(result).toMatchObject({ ok: true, changed: false });
    expect(calls).toEqual([]);
  });

  it('does not remove anything when no tracked runtime exists', () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, '.gitignore'), '.omp/sdlc/\n');
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: '' };
    };
    expect(untrackOmpSdlcRuntime({ cwd: root, run })).toMatchObject({ ok: true, changed: false });
    expect(calls).toEqual([['git', 'ls-files', '-z', '--', '.omp/sdlc']]);
  });

  it('untracks listed runtime using cached-only removal', () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, '.gitignore'), '.omp/sdlc/\n');
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      return args[0] === 'ls-files'
        ? { status: 0, stdout: '.omp/sdlc/run.json\0' }
        : { status: 0, stdout: '' };
    };
    expect(untrackOmpSdlcRuntime({ cwd: root, run })).toMatchObject({ ok: true, changed: true });
    expect(calls).toEqual([
      ['git', 'ls-files', '-z', '--', '.omp/sdlc'],
      ['git', 'rm', '--cached', '-r', '--', '.omp/sdlc'],
    ]);
  });

  it.each(['ls-files', 'rm'])('fails closed when git %s fails', (failedCommand) => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, '.gitignore'), '.omp/sdlc/\n');
    const run = (_command, args) => {
      if (args[0] === 'ls-files') {
        return failedCommand === 'ls-files'
          ? { status: 1, stdout: '' }
          : { status: 0, stdout: '.omp/sdlc/run.json\0' };
      }
      return { status: 1, stdout: '' };
    };
    expect(untrackOmpSdlcRuntime({ cwd: root, run })).toMatchObject({
      ok: false,
      reasonCode: 'runtime_untrack_failed',
    });
  });
});
