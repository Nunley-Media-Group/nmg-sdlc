import { afterEach, describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runApplyReview } from '../sdlc-apply-review.mjs';
import { validateHandoff } from '../sdlc-execute.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sdlc-apply-review.mjs');
const roots = [];

function makeRoot(body = 'P1: fix this\n', reviewStep = 'review1') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-apply-review-'));
  roots.push(root);
  const artifact = path.join(root, `.omp/sdlc/reviews/42-${reviewStep}.md`);
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, body);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('runApplyReview', () => {
  test.each(['', '  \n', 'No findings.\n'])('passes no findings with zero git calls', (body) => {
    const root = makeRoot(body);
    const run = () => { throw new Error('git must not run'); };
    const outcome = runApplyReview({ issue: 42, step: 'fix1', cwd: root, run, fs });

    expect(outcome.status).toBe(0);
    expect(outcome.handoff).toMatchObject({
      issue: 42,
      step: 'fix1',
      status: 'passed',
      intervention: false,
      next: 'review2',
      reasonCode: null,
    });
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
  });

  test('requests model application once and writes no handoff before --applied', () => {
    const root = makeRoot();
    const outcome = runApplyReview({ issue: 42, step: 'fix1', cwd: root, run: () => null, fs });

    expect(outcome.status).toBe(3);
    expect(outcome.stdout.split('\n').filter(Boolean)).toHaveLength(1);
    expect(outcome.stdout).toContain('NMG_SDLC_APPLY_REVIEW: {"schemaVersion":1,"kind":"apply_review_required","issue":42,"step":"fix1"');
    expect(fs.existsSync(path.join(root, '.omp/sdlc/handoffs/42-fix1.json'))).toBe(false);
  });

  test('passes an applied clean tree without commit or push', () => {
    const root = makeRoot();
    const calls = [];
    const run = (command, args) => {
      calls.push([command, args]);
      return { status: 0, stdout: '' };
    };
    const outcome = runApplyReview({ issue: 42, step: 'fix1', cwd: root, run, fs, applied: true });

    expect(outcome.status).toBe(0);
    expect(calls).toEqual([['git', ['status', '--porcelain']]]);
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
  });

  test('stages non-handoff paths, commits the exact subject, and pushes without force', () => {
    const root = makeRoot('P1: fix this\n', 'review2');
    const calls = [];
    const run = (command, args) => {
      calls.push([command, args]);
      if (args[0] === 'status') return { status: 0, stdout: ' M src/code.mjs\n?? .omp/sdlc/handoffs/42-fix2.json\n' };
      return { status: 0, stdout: '' };
    };
    const outcome = runApplyReview({ issue: 42, step: 'fix2', cwd: root, run, fs, applied: true });

    expect(outcome.status).toBe(0);
    expect(outcome.handoff.next).toBe('verify');
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
    expect(calls).toEqual([
      ['git', ['status', '--porcelain']],
      ['git', ['add', '--', 'src/code.mjs']],
      ['git', ['commit', '-m', 'fix: apply review2 findings for #42']],
      ['git', ['push']],
    ]);
  });

  test('writes named failures for missing artifacts and git errors', () => {
    const missingRoot = makeRoot();
    fs.rmSync(path.join(missingRoot, '.omp/sdlc/reviews/42-review1.md'));
    const missing = runApplyReview({ issue: 42, step: 'fix1', cwd: missingRoot, run: () => null, fs });
    expect(missing.handoff.reasonCode).toBe('review_artifact_missing');
    expect(validateHandoff(missing.handoff)).toEqual(missing.handoff);

    const gitRoot = makeRoot();
    const failed = runApplyReview({
      issue: 42,
      step: 'fix1',
      cwd: gitRoot,
      run: () => ({ status: 1, stdout: '', stderr: 'failed' }),
      fs,
      applied: true,
    });
    expect(failed.handoff.reasonCode).toBe('apply_review_failed');
    expect(validateHandoff(failed.handoff)).toEqual(failed.handoff);
  });
});

describe('sdlc-apply-review CLI', () => {
  test('rejects invalid arguments without writing a handoff', () => {
    const root = makeRoot();
    const result = spawnSync(process.execPath, [SCRIPT, '--issue', '42', '--step', 'fix3'], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe('Usage: node scripts/sdlc-apply-review.mjs --issue N --step fix1|fix2 [--applied]');
    expect(fs.existsSync(path.join(root, '.omp/sdlc/handoffs'))).toBe(false);
  });
});
