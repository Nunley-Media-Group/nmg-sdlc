import { afterEach, describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runApplyReview } from '../sdlc-apply-review.mjs';
import { resolveReviewArtifacts, validateHandoff } from '../sdlc-execute.mjs';
import { resolveRecoveryOwner } from '../sdlc-safe-recoveries.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sdlc-apply-review.mjs');
const roots = [];
const failed = { status: 1, stdout: '', stderr: 'injected failure', error: null };

function fixture(body = 'P1: fix this\n', step = 'fix1') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-apply-review-'));
  roots.push(base);
  const root = path.join(base, 'work');
  const remote = path.join(base, 'remote.git');
  fs.mkdirSync(root);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git('init', '--bare', remote); git('init', '-b', '42-feature');
  git('config', 'user.name', 'Review fixture'); git('config', 'user.email', 'review@example.test');
  git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', path.join(base, 'no-hooks'));
  const spec = path.join(root, 'specs/42-feature');
  fs.mkdirSync(spec, { recursive: true }); fs.mkdirSync(path.join(root, 'src'));
  const header = '**Issue**: #42\n**Status**: Approved\n\n';
  fs.writeFileSync(path.join(spec, 'requirements.md'), `${header}### AC1: Apply review fixes\n\n| FR1 | Fix reviewed behavior | Must |\n`);
  fs.writeFileSync(path.join(spec, 'design.md'), `${header}Apply only approved changes.\n`);
  fs.writeFileSync(path.join(spec, 'tasks.md'), `${header}### T001: Apply review fixes\n\n**File(s)**: \`src/\` (modify)\n`);
  fs.writeFileSync(path.join(spec, 'feature.gherkin'), `${header}Feature: Review fixes\n  Scenario: Publish reviewed changes\n    Given findings\n    When fixes are applied\n    Then reviewed behavior is corrected\n`);
  fs.writeFileSync(path.join(root, '.gitignore'), '.omp/\n');
  fs.writeFileSync(path.join(root, 'src/code.mjs'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'src/old name.mjs'), 'export const moved = true;\n');
  git('add', '.'); git('commit', '-m', 'chore: initialize review fixture');
  git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', '42-feature');
  const ownerId = resolveRecoveryOwner({ cwd: root, issue: 42, step });
  const reviewStep = step === 'fix1' ? 'review1' : 'review2';
  const artifactPath = `.omp/sdlc/reviews/42-${reviewStep}.md`;
  fs.mkdirSync(path.dirname(path.join(root, artifactPath)), { recursive: true });
  fs.writeFileSync(path.join(root, artifactPath), body);
  const calls = [];
  const run = (command, args, options) => {
    calls.push([command, ...args]);
    return spawnSync(command, args, { encoding: 'utf8', ...options });
  };
  const apply = (options = {}) => runApplyReview({ issue: 42, step, cwd: root, run, fs, ...options });
  const state = () => JSON.parse(fs.readFileSync(path.join(root, '.omp/sdlc/safe-recoveries.json'), 'utf8'));
  return { root, remote, git, run, calls, ownerId, step, reviewStep, artifactPath, apply, state };
}

const mutations = (calls) => calls.filter((call) => ['add', 'commit', 'push'].includes(call[1] === '--literal-pathspecs' ? call[2] : call[1]));
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('runApplyReview', () => {
  test.each(['', '  \n', 'No findings.\n'])('passes fix no-op with zero git calls for %j', (body) => {
    const f = fixture(body);
    const outcome = f.apply({ run: () => { throw new Error('git must not run'); } });
    expect(outcome).toMatchObject({ status: 0, handoff: { issue: 42, step: 'fix1', status: 'passed', intervention: false, next: 'review2', reasonCode: null } });
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
  });

  test('requests model application without committing or writing a handoff', () => {
    const f = fixture();
    const outcome = f.apply();
    expect(outcome.status).toBe(3);
    const packet = JSON.parse(outcome.stdout.trim().slice('NMG_SDLC_APPLY_REVIEW: '.length));
    expect(packet).toMatchObject({ kind: 'apply_review_required', issue: 42, step: 'fix1', artifactPath: f.artifactPath });
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/handoffs/42-fix1.json'))).toBe(false);
    expect(mutations(f.calls)).toEqual([]);
  });

  test('passes an applied unchanged tree without commit or push', () => {
    const f = fixture(); const head = f.git('rev-parse', 'HEAD');
    const outcome = f.apply({ applied: true });
    expect(outcome.status).toBe(0);
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
    expect(mutations(f.calls)).toEqual([]);
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
  });

  test('publishes only approved changes with the exact review2 subject and no force', () => {
    const f = fixture('P1: fix this\n', 'fix2');
    fs.writeFileSync(path.join(f.root, 'src/code.mjs'), 'export const value = 2;\n');
    fs.mkdirSync(path.join(f.root, '.omp/sdlc/handoffs'), { recursive: true });
    fs.writeFileSync(path.join(f.root, '.omp/sdlc/handoffs/42-fix2.json'), '{"status":"failed"}\n');
    const outcome = f.apply({ applied: true });
    expect(outcome).toMatchObject({ status: 0, handoff: { next: 'verify' } });
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
    expect(f.git('log', '-1', '--format=%s')).toBe('fix: apply review2 findings for #42');
    expect(f.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')).toBe('src/code.mjs');
    expect(f.git('--git-dir', f.remote, 'show', 'refs/heads/42-feature:src/code.mjs')).toBe('export const value = 2;');
    expect(f.calls.filter((call) => call[1] === 'push')).toEqual([['git', 'push']]);
  });

  test('preserves literal spaces, newline filenames, and rename content through publication', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'src/with spaces.mjs'), 'export const spaced = true;\n');
    fs.writeFileSync(path.join(f.root, 'src/line\nbreak.mjs'), 'export const newline = true;\n');
    f.git('mv', 'src/old name.mjs', 'src/new name.mjs');
    expect(f.apply({ applied: true })).toMatchObject({ status: 0 });
    expect(f.git('--git-dir', f.remote, 'show', 'refs/heads/42-feature:src/with spaces.mjs')).toBe('export const spaced = true;');
    expect(f.git('--git-dir', f.remote, 'show', 'refs/heads/42-feature:src/line\nbreak.mjs')).toBe('export const newline = true;');
    expect(f.git('--git-dir', f.remote, 'show', 'refs/heads/42-feature:src/new name.mjs')).toBe('export const moved = true;');
    expect(fs.existsSync(path.join(f.root, 'src/old name.mjs'))).toBe(false);
  });

  test('does not publish unrelated dirty work', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'unrelated.txt'), 'retain this\n');
    expect(f.apply({ applied: true })).toMatchObject({ status: 1, handoff: { reasonCode: 'apply_review_failed' } });
    expect(mutations(f.calls)).toEqual([]);
    expect(fs.readFileSync(path.join(f.root, 'unrelated.txt'), 'utf8')).toBe('retain this\n');
  });

  test('automatically recovers the failed first push without duplicate commit, then only acknowledges remote state', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'src/code.mjs'), 'export const value = 2;\n');
    let pushes = 0;
    expect(f.apply({ applied: true, run: (command, args, options) => {
      if (args[0] === 'push' && pushes++ === 0) return failed;
      return f.run(command, args, options);
    } })).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(pushes).toBe(2);
    const head = f.git('rev-parse', 'HEAD');
    const consumed = f.state();
    expect(consumed.records).toEqual([expect.objectContaining({ class: 'stage_publication', runId: f.ownerId, issue: 42, step: 'fix1' })]);
    expect(f.calls.filter((call) => call[1] === 'commit')).toHaveLength(1);
    expect(f.calls.filter((call) => call[1] === 'push')).toEqual([['git', 'push', 'origin', 'HEAD:refs/heads/42-feature']]);
    f.calls.length = 0;
    expect(f.apply({ applied: true, sessionToken: '33333333-3333-4333-8333-333333333333' }).status).toBe(0);
    expect(f.state()).toEqual(consumed);
    expect(mutations(f.calls)).toEqual([]);
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
    expect(f.git('--git-dir', f.remote, 'rev-parse', 'refs/heads/42-feature')).toBe(head);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/run.json'))).toBe(false);
  });

  test.each(['', `.head-${'a'.repeat(40)}`])('uses current attempt2 evidence rather than historical no-findings (%s)', (generation) => {
    const f = fixture('No findings.\n');
    const reviewRoot = path.join(f.root, '.omp/sdlc/reviews');
    if (generation) fs.writeFileSync(path.join(reviewRoot, '42-review1.current.json'), JSON.stringify({ generation }));
    const prefix = `42-review1${generation}`;
    fs.writeFileSync(path.join(reviewRoot, `${prefix}.md`), 'No findings.\n');
    fs.writeFileSync(path.join(reviewRoot, `${prefix}.invalidation.json`), JSON.stringify({ reason: 'invalid_review_slice' }));
    fs.writeFileSync(path.join(reviewRoot, `${prefix}.attempt-2.md`), 'P1: Current replacement must be applied.\n');
    const before = fs.readFileSync(path.join(f.root, f.artifactPath));
    const outcome = f.apply();
    expect(outcome.status).toBe(3);
    const packet = JSON.parse(outcome.stdout.trim().slice('NMG_SDLC_APPLY_REVIEW: '.length));
    expect(packet.artifactPath).toBe(`.omp/sdlc/reviews/${prefix}.attempt-2.md`);
    expect(fs.readFileSync(path.join(f.root, f.artifactPath))).toEqual(before);
    fs.rmSync(path.join(f.root, resolveReviewArtifacts({ cwd: f.root, issue: 42, step: 'review1' }).artifactPath));
    expect(f.apply().handoff.reasonCode).toBe('review_artifact_missing');
  });

  test('fails missing artifacts without git or a fabricated review file', () => {
    const f = fixture(); fs.rmSync(path.join(f.root, f.artifactPath));
    const outcome = f.apply({ run: () => { throw new Error('git must not run'); } });
    expect(outcome.handoff.reasonCode).toBe('review_artifact_missing');
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
    expect(fs.existsSync(path.join(f.root, f.artifactPath))).toBe(false);
  });

  test('fails an unreadable git status without publication', () => {
    const f = fixture();
    const outcome = f.apply({ applied: true, run: (command, args, options) => args[0] === 'status' ? failed : f.run(command, args, options) });
    expect(outcome.handoff.reasonCode).toBe('apply_review_failed');
    expect(mutations(f.calls)).toEqual([]);
  });
});

describe('sdlc-apply-review CLI', () => {
  test('rejects invalid steps without writing a handoff', () => {
    const f = fixture();
    const result = spawnSync(process.execPath, [SCRIPT, '--issue', '42', '--step', 'fix3'], { cwd: f.root, encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/handoffs'))).toBe(false);
  });
});
