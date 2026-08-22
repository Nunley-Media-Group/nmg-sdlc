import { afterEach, describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runReviewMain } from '../sdlc-review-main.mjs';
import { validateHandoff } from '../sdlc-execute.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sdlc-review-main.mjs');
const roots = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-review-main-'));
  roots.push(root);
  return root;
}

function writeArtifact(root, step, body) {
  const artifact = path.join(root, `.omp/sdlc/reviews/42-${step}.md`);
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, body);
  return artifact;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('runReviewMain', () => {
  test('passes findings through to the matching fix step', () => {
    const root = makeRoot();
    const artifact = writeArtifact(root, 'review1', 'P1: fix this\n');
    const run = () => { throw new Error('git must not run'); };
    const outcome = runReviewMain({ issue: 42, step: 'review1', cwd: root, run, fs });

    expect(outcome.status).toBe(0);
    expect(outcome.handoff).toMatchObject({
      issue: 42,
      step: 'review1',
      status: 'passed',
      intervention: false,
      next: 'fix1',
      reasonCode: null,
      artifacts: ['.omp/sdlc/reviews/42-review1.md'],
    });
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
    expect(fs.readFileSync(artifact, 'utf8')).toBe('P1: fix this\n');
  });

  test('rewrites an empty artifact to the canonical no-findings body', () => {
    const root = makeRoot();
    const artifact = writeArtifact(root, 'review2', '  \n');
    const outcome = runReviewMain({ issue: 42, step: 'review2', cwd: root, run: () => null, fs });

    expect(outcome.handoff.next).toBe('fix2');
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
    expect(fs.readFileSync(artifact, 'utf8')).toBe('No findings.\n');
  });

  test.each([
    ['missing artifact', undefined],
    ['reported review failure', 'review_failed'],
  ])('writes review_failed for %s', (_label, result) => {
    const root = makeRoot();
    const outcome = runReviewMain({ issue: 42, step: 'review1', cwd: root, run: () => null, fs, result });

    expect(outcome.status).toBe(1);
    expect(outcome.handoff).toMatchObject({
      status: 'failed',
      intervention: true,
      reasonCode: 'review_failed',
      next: null,
      schemaVersion: 1,
      issue: 42,
      step: 'review1',
      summary: expect.any(String),
      artifacts: [],
    });
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
  });
});

describe('sdlc-review-main CLI', () => {
  test('rejects invalid or conflicting arguments without writing a handoff', () => {
    const root = makeRoot();
    const result = spawnSync(process.execPath, [SCRIPT, '--issue', '42', '--issue', '43', '--step', 'review1'], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe('Usage: node scripts/sdlc-review-main.mjs --issue N --step review1|review2 [--result review_failed]');
    expect(fs.existsSync(path.join(root, '.omp/sdlc/handoffs'))).toBe(false);
  });
});
