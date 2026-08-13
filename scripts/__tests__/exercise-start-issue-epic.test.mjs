/**
 * Opt-in Codex exercise for bare start-issue epic selection (issue #149).
 *
 * Enable with:
 *   RUN_EXERCISE_TESTS=1 npm test -- --runInBand exercise-start-issue-epic
 *
 * The exercise uses a disposable git project and a PATH-prepended fake `gh`.
 * Every GitHub response is local and deterministic; write-shaped gh commands
 * fail so the exercise cannot create branches or mutate GitHub state.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN_EXERCISE = process.env.RUN_EXERCISE_TESTS === '1';
const describeExercise = RUN_EXERCISE ? describe : describe.skip;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fakeGhSource() {
  const issue = (number) => {
    const fixtures = {
      10: { number: 10, title: 'Coordinate rollout', state: 'OPEN', body: '', labels: [{ name: 'epic' }], parent: null },
      20: { number: 20, title: 'Build foundation', state: 'OPEN', body: 'Depends on: #10', labels: [{ name: 'automatable' }], parent: 10 },
      30: { number: 30, title: 'Ship integration', state: 'OPEN', body: 'Depends on: #10\nDepends on: #20', labels: [{ name: 'automatable' }], parent: 10 },
    };
    return fixtures[number];
  };

  return `#!/usr/bin/env node
const args = process.argv.slice(2);
const joined = args.join(' ');
const issue = ${issue.toString()};
if (joined.includes('issue develop') || joined.includes('issue edit') || joined.includes('projectV2ItemFieldValue')) {
  if (process.env.EXERCISE_GH_WRITE_LOG) {
    require('node:fs').appendFileSync(process.env.EXERCISE_GH_WRITE_LOG, joined + '\\n');
  }
  console.error('WRITE ATTEMPT BLOCKED: ' + joined);
  process.exit(99);
}
if (args[0] === 'api' && joined.includes('milestones')) {
  console.log(JSON.stringify([{ title: 'v1', open_issues: 3 }]));
  process.exit(0);
}
if (args[0] === 'issue' && args[1] === 'list') {
  console.log(JSON.stringify([issue(10), issue(20), issue(30)].map(({number,title,labels}) => ({number,title,labels}))));
  process.exit(0);
}
if (args[0] === 'repo' && args[1] === 'view') {
  console.log(JSON.stringify({ owner: { login: 'example' }, name: 'fixture', nameWithOwner: 'example/fixture' }));
  process.exit(0);
}
if (args[0] === 'api' && args[1] === 'graphql') {
  const graphIssue = (number) => {
    const current = issue(number);
    const parent = current.parent ? issue(current.parent) : null;
    return {
      number,
      state: current.state,
      body: current.body,
      labels: { nodes: current.labels },
      parent: parent ? { number: parent.number, state: parent.state, labels: { nodes: parent.labels } } : null,
      subIssues: { nodes: number === 10 ? [{ number: 20, state: 'OPEN' }, { number: 30, state: 'OPEN' }] : [] },
    };
  };
  console.log(JSON.stringify({ data: { repository: { issue10: graphIssue(10), issue20: graphIssue(20), issue30: graphIssue(30) } } }));
  process.exit(0);
}
const view = joined.match(/^issue view #?(\\d+)/);
if (view) {
  const current = issue(Number(view[1]));
  console.log(JSON.stringify({ ...current, closedByPullRequestsReferences: [] }));
  process.exit(0);
}
console.error('UNEXPECTED GH COMMAND: ' + joined);
process.exit(98);
`;
}

function scaffoldExercise() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-start-epic-'));
  const plugin = path.join(project, 'plugin');
  const bin = path.join(project, 'bin');
  fs.mkdirSync(path.join(plugin, 'skills'), { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(project, 'steering'), { recursive: true });

  fs.cpSync(path.join(repoRoot, 'skills', 'start-issue'), path.join(plugin, 'skills', 'start-issue'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'references'), path.join(plugin, 'references'), { recursive: true });
  fs.writeFileSync(path.join(project, 'README.md'), '# Disposable start-issue exercise\n');
  fs.writeFileSync(path.join(project, 'steering', 'product.md'), '# Product\nFixture.\n');
  fs.writeFileSync(path.join(project, 'steering', 'tech.md'), '# Tech\nFixture.\n');
  fs.writeFileSync(path.join(project, 'steering', 'structure.md'), '# Structure\nFixture.\n');

  const fakeGh = path.join(bin, 'gh');
  const writeLog = path.join(project, 'gh-write-attempts.log');
  fs.writeFileSync(fakeGh, fakeGhSource(), { mode: 0o755 });
  execFileSync('git', ['init', '-q'], { cwd: project });
  execFileSync('git', ['add', '.'], { cwd: project });
  execFileSync('git', ['-c', 'user.name=Exercise', '-c', 'user.email=exercise@example.invalid', 'commit', '-qm', 'fixture'], { cwd: project });
  return { project, bin, writeLog };
}

describeExercise('exercise: bare start-issue epic selection', () => {
  test('first child is selectable while later child remains blocked by its sibling', () => {
    const { project, bin, writeLog } = scaffoldExercise();
    try {
      const prompt = [
        'Read plugin/skills/start-issue/SKILL.md and every reference it requires for Steps 1 and 1a.',
        'Exercise bare start-issue discovery with no issue-number argument against the gh executable on PATH.',
        'Stop after dependency filtering: do not call request_user_input, create a branch, update an issue, or change files.',
        'Report only these three evidence lines, using the controlled issue numbers:',
        'READY: all ready issue numbers',
        'BLOCKED: each blocked issue and its genuine blocker numbers',
        'COORDINATION: which epic target was excluded from blockers',
      ].join('\n');
      const proc = spawnSync('codex', [
        'exec',
        '--cd', project,
        '--ephemeral',
        '--approve-for-me',
        '-c', 'shell_environment_policy.inherit=all',
        prompt,
      ], {
        encoding: 'utf8',
        timeout: 300_000,
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
          EXERCISE_GH_WRITE_LOG: writeLog,
        },
      });

      const output = `${proc.stdout || ''}\n${proc.stderr || ''}`;
      if (proc.status !== 0) {
        throw new Error(`codex exercise exited ${proc.status}:\n${output}`);
      }
      expect(output).toMatch(/READY:.*#?20/i);
      expect(output).toMatch(/BLOCKED:.*#?30.*#?20/i);
      expect(output).toMatch(/COORDINATION:.*#?10/i);
      expect(fs.existsSync(writeLog)).toBe(false);
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  }, 310_000);
});
