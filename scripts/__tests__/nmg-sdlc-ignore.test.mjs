import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NMG_SDLC_IGNORE_LINE,
  ensureNmgSdlcIgnore,
  hasNmgSdlcIgnore,
  isAuthorizedNmgSdlcUntrackTransition,
  untrackNmgSdlcRuntime,
  writeNmgSdlcIgnore,
} from '../nmg-sdlc-ignore.mjs';

const SCRIPT = fileURLToPath(new URL('../nmg-sdlc-ignore.mjs', import.meta.url));
const roots = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-ignore-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('nmg-sdlc ignore management (SCN001–SCN003)', () => {
  it('exports the canonical rule and recognizes only exact non-negated lines', () => {
    expect(NMG_SDLC_IGNORE_LINE).toBe('.nmg-sdlc/');
    expect(hasNmgSdlcIgnore('build/\n.nmg-sdlc/\n')).toBe(true);
    expect(hasNmgSdlcIgnore('  .nmg-sdlc  \n')).toBe(true);
    expect(hasNmgSdlcIgnore('# .nmg-sdlc/\n!.nmg-sdlc/\n.nmg-sdlc/*\n')).toBe(false);
  });

  it('does not treat the legacy v3 runtime rule as the managed rule', () => {
    expect(hasNmgSdlcIgnore('.omp/sdlc/\n.omp/\n')).toBe(false);
    const root = makeRoot();
    fs.writeFileSync(path.join(root, '.gitignore'), '.omp/sdlc/\n');
    expect(ensureNmgSdlcIgnore(root)).toMatchObject({ ok: true, changed: true, status: 'written' });
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('.omp/sdlc/\n.nmg-sdlc/\n');
  });

  it('untracks only paths under the managed runtime directory', () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\n');
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: '.nmg-sdlc-other/run.json\0' };
    };
    expect(untrackNmgSdlcRuntime({ cwd: root, run })).toMatchObject({ ok: false, reasonCode: 'runtime_untrack_failed' });
    expect(calls).toEqual([['git', 'ls-files', '-z', '--', '.nmg-sdlc']]);
  });

  it('appends the canonical rule and preserves unrelated rules', () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, '.gitignore'), 'dist/');

    expect(ensureNmgSdlcIgnore(root)).toMatchObject({ ok: true, changed: true, status: 'written' });
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('dist/\n.nmg-sdlc/\n');
  });

  it.each(['.nmg-sdlc/\n', '.nmg-sdlc\n'])(
    'leaves an existing rule unchanged: %s',
    (source) => {
      const root = makeRoot();
      fs.writeFileSync(path.join(root, '.gitignore'), source);
      expect(writeNmgSdlcIgnore(root)).toMatchObject({ ok: true, changed: false });
      expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe(source);
    },
  );

  it.each(['# .nmg-sdlc/\n', '!.nmg-sdlc/\n'])(
    'appends when only a non-matching rule exists: %s',
    (source) => {
      const root = makeRoot();
      fs.writeFileSync(path.join(root, '.gitignore'), source);
      expect(ensureNmgSdlcIgnore(root).changed).toBe(true);
      expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe(`${source}.nmg-sdlc/\n`);
    },
  );

  it('preserves an unmanaged .gitignore directory and reports the CLI error', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, '.gitignore'));

    expect(ensureNmgSdlcIgnore(root)).toEqual({
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

  it('treats only ENOENT as an absent .gitignore', () => {
    const root = makeRoot();
    const calls = [];
    const result = untrackNmgSdlcRuntime({ cwd: root, run: (...args) => calls.push(args) });
    expect(result).toEqual({
      ok: true,
      changed: false,
      status: 'ignore absent',
      reasonCode: null,
    });
    expect(calls).toEqual([]);
  });

  it('fails closed when reading .gitignore fails for a reason other than ENOENT', () => {
    const readError = Object.assign(new Error('I/O failure'), { code: 'EIO' });
    const fsStub = { readFileSync: () => { throw readError; } };
    const calls = [];
    expect(untrackNmgSdlcRuntime({ fs: fsStub, run: (...args) => calls.push(args) })).toEqual({
      ok: false,
      changed: false,
      status: 'failed',
      reasonCode: 'runtime_untrack_failed',
    });
    expect(calls).toEqual([]);
  });

  it('does not remove anything when no tracked runtime exists', () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\n');
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: '' };
    };
    expect(untrackNmgSdlcRuntime({ cwd: root, run })).toMatchObject({ ok: true, changed: false });
    expect(calls).toEqual([['git', 'ls-files', '-z', '--', '.nmg-sdlc']]);
  });

  it('untracks listed runtime using cached-only removal', () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\n');
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      return args[0] === 'ls-files'
        ? { status: 0, stdout: '.nmg-sdlc/run.json\0' }
        : { status: 0, stdout: '' };
    };
    expect(untrackNmgSdlcRuntime({ cwd: root, run })).toMatchObject({
      ok: true,
      changed: true,
      untrackedPaths: ['.nmg-sdlc/run.json'],
    });
    expect(calls).toEqual([
      ['git', 'ls-files', '-z', '--', '.nmg-sdlc'],
      ['git', 'rm', '--cached', '-r', '--', '.nmg-sdlc'],
    ]);
  });

  it('authorizes only the complete exact set of index-only runtime deletions', () => {
    const untrack = {
      changed: true,
      untrackedPaths: ['.nmg-sdlc/run.json', '.nmg-sdlc/handoffs/42-start.json'],
    };
    expect(isAuthorizedNmgSdlcUntrackTransition(
      'D  .nmg-sdlc/run.json\0D  .nmg-sdlc/handoffs/42-start.json\0',
      untrack,
    )).toBe(true);
  });

  it.each([
    ['missing deletion', 'D  .nmg-sdlc/run.json\0'],
    ['extra path', 'D  .nmg-sdlc/run.json\0D  .nmg-sdlc/handoffs/42-start.json\0 M local.txt\0'],
    ['worktree deletion', ' D .nmg-sdlc/run.json\0D  .nmg-sdlc/handoffs/42-start.json\0'],
    ['staged modification', 'M  .nmg-sdlc/run.json\0D  .nmg-sdlc/handoffs/42-start.json\0'],
    ['untracked path', '?? .nmg-sdlc/run.json\0D  .nmg-sdlc/handoffs/42-start.json\0'],
    ['renamed path', 'R  .nmg-sdlc/run.json\0.nmg-sdlc/old.json\0'],
  ])('rejects %s in the staged transition', (_name, porcelain) => {
    expect(isAuthorizedNmgSdlcUntrackTransition(porcelain, {
      changed: true,
      untrackedPaths: ['.nmg-sdlc/run.json', '.nmg-sdlc/handoffs/42-start.json'],
    })).toBe(false);
  });

  it.each(['ls-files', 'rm'])('fails closed when git %s fails', (failedCommand) => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\n');
    const run = (_command, args) => {
      if (args[0] === 'ls-files') {
        return failedCommand === 'ls-files'
          ? { status: 1, stdout: '' }
          : { status: 0, stdout: '.nmg-sdlc/run.json\0' };
      }
      return { status: 1, stdout: '' };
    };
    expect(untrackNmgSdlcRuntime({ cwd: root, run })).toMatchObject({
      ok: false,
      reasonCode: 'runtime_untrack_failed',
    });
  });
});
