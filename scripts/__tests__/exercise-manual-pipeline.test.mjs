import { afterEach, describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryRoots = [];
const STAGES = [
  'draft-issue',
  'start-issue',
  'write-spec',
  'write-code',
  'simplify',
  'verify-code',
  'open-pr',
  'address-pr-comments',
];
const GATED_STAGES = new Set(['draft-issue', 'start-issue', 'write-spec', 'write-code']);
const PIPELINE = STAGES.map((stage, index) => `$nmg-sdlc:${stage}${[1, 2, 3, 5, 6, 7].includes(index) ? ' #N' : ''}`).join('  →  ');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-manual-pipeline-'));
  temporaryRoots.push(root);
  return root;
}

function write(root, relativePath, source) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
  return target;
}

function exists(root, relativePath) {
  return fs.existsSync(path.join(root, ...relativePath.split('/')));
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

function waitForExplicitInput(answer) {
  if (answer === undefined) return { state: 'waiting', mutationsAuthorized: false };
  return { state: 'answered', mutationsAuthorized: true, answer };
}

function exercisePipeline(root) {
  const evidence = [];
  const run = (stage, preconditions, postcondition, apply) => {
    for (const precondition of preconditions) expect(exists(root, precondition)).toBe(true);
    const gate = GATED_STAGES.has(stage) ? 'explicit-input' : 'none';
    if (gate === 'explicit-input') {
      const waiting = waitForExplicitInput();
      expect(waiting).toEqual({ state: 'waiting', mutationsAuthorized: false });
      expect(exists(root, postcondition)).toBe(false);
      const answered = waitForExplicitInput('approved fixture decision');
      expect(answered.mutationsAuthorized).toBe(true);
    }
    apply();
    expect(exists(root, postcondition)).toBe(true);
    evidence.push({ stage, preconditions, postcondition, gate, remoteMode: 'dry-run' });
  };

  run('draft-issue', ['steering/product.md', 'steering/tech.md', 'steering/structure.md'], '.dry-run/issues/151.json', () => {
    write(root, '.dry-run/issues/151.json', '{"number":151,"state":"OPEN"}\n');
  });
  run('start-issue', ['.dry-run/issues/151.json', '.git/HEAD'], '.dry-run/branch.txt', () => {
    write(root, '.dry-run/branch.txt', '151-manual-pipeline\n');
  });
  run('write-spec', ['.dry-run/branch.txt'], 'specs/feature-manual-pipeline/feature.gherkin', () => {
    write(root, 'specs/feature-manual-pipeline/requirements.md', '# Requirements: Manual pipeline\n');
    write(root, 'specs/feature-manual-pipeline/design.md', '# Design: Manual pipeline\n');
    write(root, 'specs/feature-manual-pipeline/tasks.md', '# Tasks: Manual pipeline\n');
    write(root, 'specs/feature-manual-pipeline/feature.gherkin', [
      'Feature: Manual pipeline',
      '  Scenario: Explicit approval',
      '    Given a reviewed plan',
      '    When the user approves it',
      '    Then implementation may begin',
      '',
    ].join('\n'));
  });
  run('write-code', ['specs/feature-manual-pipeline/feature.gherkin'], 'src/manual-pipeline.mjs', () => {
    write(root, 'src/manual-pipeline.mjs', 'export const mode = "manual";\n');
    write(root, 'test/manual-pipeline.test.mjs', 'export const expected = "manual";\n');
  });
  run('simplify', ['src/manual-pipeline.mjs', 'test/manual-pipeline.test.mjs'], '.dry-run/simplify.json', () => {
    write(root, '.dry-run/simplify.json', '{"behaviorChanged":false}\n');
  });
  run('verify-code', ['.dry-run/simplify.json', 'specs/feature-manual-pipeline/feature.gherkin'], '.dry-run/verification.json', () => {
    write(root, '.dry-run/verification.json', '{"status":"pass","tests":1}\n');
  });
  run('open-pr', ['.dry-run/verification.json'], '.dry-run/pull-request.md', () => {
    write(root, '.dry-run/pull-request.md', 'Dry-run PR for issue #151\n');
  });
  run('address-pr-comments', ['.dry-run/pull-request.md'], '.dry-run/review-clean.json', () => {
    write(root, '.dry-run/review-clean.json', '{"unresolvedThreads":0}\n');
  });
  return evidence;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('complete manual SDLC pipeline exercise (issue #151)', () => {
  test('all eight skills publish one ordered lifecycle and reference the explicit-input gate when needed', () => {
    const interactiveContract = read('references/interactive-gates.md');
    expect(interactiveContract).toContain('Stop after the tool call and wait for the user\'s answer.');
    expect(interactiveContract).toContain('Do not continue the workflow, draft artifacts, run mutating commands, or create GitHub resources until the answer is available.');

    for (const stage of STAGES) {
      const source = read(`skills/${stage}/SKILL.md`);
      expect(source).toContain('## Integration with SDLC Workflow');
      expect(source).toContain(PIPELINE);
      if (source.includes('request_user_input')) {
        expect(source).toContain('../../references/interactive-gates.md');
      }
    }

    const activeSources = STAGES.map((stage) => read(`skills/${stage}/SKILL.md`)).join('\n');
    expect(activeSources).not.toMatch(/\$nmg-sdlc:(?:run-loop|end-loop|init-config)\b/);
    expect(activeSources).not.toMatch(/unattended[- ]mode/i);
  });

  test('a disposable dry-run project satisfies every next-stage precondition without remote writes or sentinel bypass', () => {
    const root = makeProject();
    write(root, 'steering/product.md', '# Product\n');
    write(root, 'steering/tech.md', '# Tech\n');
    write(root, 'steering/structure.md', '# Structure\n');
    write(root, 'src/existing.mjs', 'export const existing = true;\n');
    git(root, ['init', '--quiet', '--initial-branch=main']);
    git(root, ['config', 'user.name', 'nmg-sdlc exercise']);
    git(root, ['config', 'user.email', 'exercise@example.invalid']);
    git(root, ['add', 'steering', 'src']);
    git(root, ['commit', '--quiet', '-m', 'chore: scaffold manual pipeline exercise']);
    const sentinel = write(root, '.codex/unattended-mode', 'must not bypass an explicit gate\n');
    const sentinelBefore = fs.readFileSync(sentinel, 'utf8');

    const evidence = exercisePipeline(root);

    expect(evidence.map(({ stage }) => stage)).toEqual(STAGES);
    for (let index = 1; index < evidence.length; index += 1) {
      expect(evidence[index].preconditions).toContain(evidence[index - 1].postcondition);
    }
    expect(evidence.every(({ remoteMode }) => remoteMode === 'dry-run')).toBe(true);
    expect(evidence.filter(({ gate }) => gate === 'explicit-input').map(({ stage }) => stage)).toEqual([...GATED_STAGES]);
    expect(evidence.filter(({ gate }) => gate === 'none').map(({ stage }) => stage)).toEqual([
      'simplify',
      'verify-code',
      'open-pr',
      'address-pr-comments',
    ]);
    expect(git(root, ['log', '--format=%s', '-1'])).toBe('chore: scaffold manual pipeline exercise');
    expect(exists(root, '.dry-run/review-clean.json')).toBe(true);
    expect(exists(root, '.dry-run/github-writes.json')).toBe(false);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe(sentinelBefore);
    expect(JSON.stringify(evidence)).not.toMatch(/\$nmg-sdlc:(?:run-loop|end-loop|init-config)\b/);
  });
});
