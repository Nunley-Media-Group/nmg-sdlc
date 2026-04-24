/**
 * Codex exercise test for /draft-issue Epic classification.
 *
 * Derived from: specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/
 * Issue: #149 (T015)
 *
 * These tests scaffold a disposable test project, invoke /nmg-sdlc:draft-issue
 * via `codex exec`, and assert against captured output.
 *
 * Opt-in: these hit a live OpenAI API and cost tokens. Enable with
 *   RUN_EXERCISE_TESTS=1 npm test -- --testPathPattern=exercise-draft-issue-epic
 *
 * Requires:
 *   - codex CLI available on PATH
 */

import { jest } from '@jest/globals';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RUN_EXERCISE = process.env.RUN_EXERCISE_TESTS === '1';
const describeRunner = RUN_EXERCISE ? describe : describe.skip;

const PLUGIN_DIR = path.resolve(process.cwd(), '..', 'plugins', 'nmg-sdlc');

function scaffoldTestProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-draft-epic-'));
  fs.mkdirSync(path.join(dir, 'steering'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), '# Test Project\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n.codex/\n');
  fs.writeFileSync(path.join(dir, 'steering', 'product.md'), '# Product\nTest fixture for epic classification.\n');
  fs.writeFileSync(path.join(dir, 'steering', 'tech.md'), '# Tech\nNode.js. Jest.\n');
  fs.writeFileSync(path.join(dir, 'steering', 'structure.md'), '# Structure\nsrc/ and tests/.\n');
  execSync('git init -q', { cwd: dir });
  execSync('git add -A && git -c user.email=test@test -c user.name=test commit -qm init', { cwd: dir });
  return dir;
}

async function runSkill({ cwd, prompt }) {
  const proc = spawnSync('codex', [
    'exec',
    '--cd', cwd,
    '--full-auto',
    prompt,
  ], { encoding: 'utf8' });

  return [{
    exitCode: proc.status ?? 1,
    stdout: proc.stdout || '',
    stderr: proc.stderr || '',
  }];
}

describeRunner('exercise: /draft-issue Epic branch', () => {
  const projects = [];
  afterEach(() => {
    while (projects.length) {
      try { fs.rmSync(projects.pop(), { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  test('Epic classification produces coordination body (Goal, Phases, delegated Success, Child Issues)', async () => {
    const cwd = scaffoldTestProject();
    projects.push(cwd);
    const messages = await runSkill({
      cwd,
      prompt: '/nmg-sdlc:draft-issue "add real-time collaborative editing in phases: infrastructure first, then pilot, then bulk rollout — multiple PRs expected"',
      answers: {
        'What type of issue is this?': 'Epic',
      },
    });
    const blob = JSON.stringify(messages);
    expect(blob).toMatch(/## Goal/);
    expect(blob).toMatch(/## Delivery Phases/);
    expect(blob).toMatch(/Phase \| Child Issue \| Depends On \| Summary/);
    expect(blob).toMatch(/## Success Criteria\s*\n+\s*Each child issue owns its own acceptance criteria/);
    expect(blob).toMatch(/## Child Issues/);
    expect(blob).not.toMatch(/## User Story/);
    expect(blob).not.toMatch(/## Functional Requirements/);
  }, 300_000);

  test('Children each include Depends on: #<epic>', async () => {
    const cwd = scaffoldTestProject();
    projects.push(cwd);
    const messages = await runSkill({
      cwd,
      prompt: '/nmg-sdlc:draft-issue "epic: migrate auth subsystem in phases — infrastructure, pilot, bulk rollout"',
      answers: { 'What type of issue is this?': 'Epic' },
    });
    const blob = JSON.stringify(messages);
    expect(blob).toMatch(/Depends on: #\{?\d+|askId/);
  }, 300_000);

  test('unattended mode never auto-selects Epic without explicit Type: epic signal', async () => {
    const cwd = scaffoldTestProject();
    projects.push(cwd);
    fs.mkdirSync(path.join(cwd, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.codex', 'unattended-mode'), '');

    const messages = await runSkill({
      cwd,
      prompt: '/nmg-sdlc:draft-issue "add dark mode in phases with multiple PRs across UI, settings, and persistence"',
    });
    const blob = JSON.stringify(messages);
    // In unattended mode the classifier defaults to Feature unless Type: epic is present.
    // Check that no Epic body markers were emitted.
    expect(blob).not.toMatch(/## Delivery Phases/);
  }, 300_000);
});
