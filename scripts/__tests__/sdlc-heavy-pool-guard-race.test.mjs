import { afterEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A third process takes the guard in the moment between this process moving a guard aside and putting it back. The
// rename is the only point where that can be injected, so node:fs is mocked for this file alone.
let afterRename = null;
const realFs = await import('node:fs');
jest.unstable_mockModule('node:fs', () => ({
  ...realFs,
  default: realFs.default,
  renameSync: (from, to) => {
    realFs.renameSync(from, to);
    const hook = afterRename;
    afterRename = null;
    if (hook) hook(from, to);
  },
}));
const { underReclaimGuard } = await import('../../src/heavy-pool.mjs');

const roots = [];
afterEach(() => {
  afterRename = null;
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('reclaim guard restore race (#560 AC2)', () => {
  it('leaves a guard another process took after the move in place, and drops the moved one rather than replace it', () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-guard-race-')));
    roots.push(dir);
    const target = path.join(dir, 'target');
    const guard = `${target}.reclaim`;
    const dead = JSON.stringify({ pid: 999_001, host: os.hostname(), start: null, at: 0 });
    const fresh = JSON.stringify({ pid: 999_002, host: os.hostname(), start: null, at: 1 });
    const third = JSON.stringify({ pid: 999_003, host: os.hostname(), start: null, at: 2 });
    fs.writeFileSync(guard, dead);
    let swapped = false;
    // While this process judges the dead owner's guard breakable, a second process breaks it and takes a fresh guard.
    const alive = (pid) => {
      if (pid === 999_001 && !swapped) { swapped = true; fs.rmSync(guard); fs.writeFileSync(guard, fresh); }
      return pid !== 999_001;
    };
    // After this process moves that fresh guard aside by mistake, a third process takes the free path.
    afterRename = (from) => { fs.writeFileSync(from, third, { flag: 'wx' }); };
    let ran = false;
    expect(underReclaimGuard(target, () => { ran = true; }, { alive })).toBe(false);
    expect(swapped).toBe(true);
    expect(afterRename).toBeNull();
    expect(ran).toBe(false);
    expect(fs.readFileSync(guard, 'utf8')).toBe(third);
    expect(fs.readdirSync(dir).filter((name) => name.startsWith('target'))).toEqual(['target.reclaim']);
  });
});
