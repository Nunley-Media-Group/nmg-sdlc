/**
 * Opt-in Codex exercise for bounded bare start-issue backfill (issue #175).
 *
 * Enable with:
 *   RUN_EXERCISE_TESTS=1 npm test -- --runInBand exercise-start-issue-backfill
 *
 * The exercise uses a disposable git project and a PATH-prepended fake `gh`.
 * Every GitHub response is local and deterministic; write-shaped gh commands
 * fail so discovery cannot create branches or mutate GitHub state.
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
  return `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const joined = args.join(' ');
const candidateOrder = [209, 208, 207, 206, 205, 204, 203, 202, 201, 200, 199, 198, 197, 196, 195];

function issue(number) {
  if (number >= 201 && number <= 209) {
    return {
      number,
      title: 'Blocked candidate ' + number,
      state: 'OPEN',
      body: 'Depends on: #900',
      labels: [{ name: 'enhancement' }],
      parent: null,
      projectItems: [{ title: 'Fixture', status: { name: 'Backlog' } }],
    };
  }
  if (number === 200) {
    return {
      number,
      title: 'Completed coordination epic',
      state: 'OPEN',
      body: 'Depends on: #950',
      labels: [{ name: 'epic' }, { name: 'epic-child-of-950' }],
      parent: 950,
      projectItems: [{ title: 'Fixture', status: { name: 'Done' } }],
    };
  }
  if (number >= 196 && number <= 199) {
    return {
      number,
      title: 'Ready candidate ' + number,
      state: 'OPEN',
      body: '',
      labels: [{ name: 'enhancement' }],
      parent: null,
      projectItems: [{ title: 'Fixture', status: { name: 'Backlog' } }],
    };
  }
  if (number === 195) {
    return {
      number,
      title: 'Unneeded malformed trailing candidate',
      state: 'OPEN',
      body: '',
      labels: [{ name: 'enhancement' }],
      parent: 960,
      projectItems: [{ title: 'Fixture', status: { name: 'Backlog' } }],
    };
  }
  if (number === 900) {
    return { number, title: 'Open execution prerequisite', state: 'OPEN', body: '', labels: [{ name: 'enhancement' }], parent: null, projectItems: [] };
  }
  if (number === 950) {
    return { number, title: 'Coordination parent', state: 'OPEN', body: '- [ ] #200 — Completed child', labels: [{ name: 'epic' }], parent: null, projectItems: [] };
  }
  if (number === 960) {
    return { number, title: 'Trailing epic parent', state: 'OPEN', body: '- [ ] #195 — Malformed child', labels: [{ name: 'epic' }], parent: null, projectItems: [] };
  }
  return null;
}

function connection(nodes) {
  return { nodes, pageInfo: { hasNextPage: false, endCursor: nodes.length ? String(nodes.length) : null } };
}

function graphIssue(number) {
  const current = issue(number);
  if (!current) return null;
  const parent = current.parent ? issue(current.parent) : null;
  const children = number === 950
    ? [{ number: 200, state: 'OPEN' }]
    : number === 960
      ? [{ number: 195, state: 'OPEN' }]
      : [];
  return {
    number: current.number,
    state: current.state,
    body: current.body,
    labels: connection(current.labels),
    parent: parent ? {
      number: parent.number,
      state: parent.state,
      body: parent.body,
      labels: connection(parent.labels),
      subIssues: connection(current.parent === 950
        ? [{ number: 200, state: 'OPEN' }]
        : [{ number: 195, state: 'OPEN' }]),
    } : null,
    subIssues: connection(children),
    closedByPullRequestsReferences: connection([]),
  };
}

if (joined.includes('issue develop') || joined.includes('issue edit') || /mutation\\b/i.test(joined) || joined.includes('projectV2ItemFieldValue')) {
  if (process.env.EXERCISE_GH_WRITE_LOG) fs.appendFileSync(process.env.EXERCISE_GH_WRITE_LOG, joined + '\\n');
  console.error('WRITE ATTEMPT BLOCKED: ' + joined);
  process.exit(99);
}

if (args[0] === 'api' && joined.includes('milestones')) {
  console.log(JSON.stringify([{ number: 2, title: 'v2', open_issues: candidateOrder.length, due_on: null }]));
  process.exit(0);
}

if (args[0] === 'issue' && args[1] === 'list') {
  const limitIndex = args.findIndex((arg) => arg === '-L' || arg === '--limit');
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 30;
  console.log(JSON.stringify(candidateOrder.slice(0, limit).map((number) => {
    const current = issue(number);
    return { number: current.number, title: current.title, labels: current.labels, projectItems: current.projectItems };
  })));
  process.exit(0);
}

if (args[0] === 'repo' && args[1] === 'view') {
  console.log(JSON.stringify({ owner: { login: 'example' }, name: 'fixture', nameWithOwner: 'example/fixture' }));
  process.exit(0);
}

if (args[0] === 'api' && args[1] === 'graphql') {
  const requested = [...new Set([...joined.matchAll(/issue([1-9]\\d*):/g)].map((match) => Number(match[1])))];
  const repository = { defaultBranchRef: { name: 'main' } };
  for (const number of requested) repository['issue' + number] = graphIssue(number);
  console.log(JSON.stringify({ data: { repository } }));
  process.exit(0);
}

const view = joined.match(/^issue view #?([1-9]\\d*)/);
if (view) {
  const current = graphIssue(Number(view[1]));
  if (!current) process.exit(1);
  console.log(JSON.stringify({ ...current, title: issue(Number(view[1])).title, projectItems: issue(Number(view[1])).projectItems }));
  process.exit(0);
}

console.error('UNEXPECTED GH COMMAND: ' + joined);
process.exit(98);
`;
}

function scaffoldExercise() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-start-backfill-'));
  const plugin = path.join(project, 'plugin');
  const bin = path.join(project, 'bin');
  fs.mkdirSync(path.join(plugin, 'skills'), { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(project, 'steering'), { recursive: true });

  fs.cpSync(path.join(repoRoot, 'skills', 'start-issue'), path.join(plugin, 'skills', 'start-issue'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'references'), path.join(plugin, 'references'), { recursive: true });
  fs.writeFileSync(path.join(project, 'README.md'), '# Disposable start-issue backfill exercise\n');
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

describeExercise('exercise: bare start-issue shortlist backfill', () => {
  test('expands past blocked and Done candidates without mutation', () => {
    const { project, bin, writeLog } = scaffoldExercise();
    try {
      const prompt = [
        'Read plugin/skills/start-issue/SKILL.md and every reference required for Steps 1 and 1a.',
        'Exercise bare start-issue discovery with no issue-number argument against the gh executable on PATH.',
        'Stop after the automatic candidate window settles: do not call request_user_input, create a branch, update an issue, or change files.',
        'Report only these four evidence lines:',
        'FETCH_LIMITS: issue-list limits used in order',
        'READY: all ready issue numbers in presentation order',
        'BLOCKED: every blocked candidate issue number',
        'EXCLUDED_DONE: every unblocked issue excluded because all readable Project statuses are Done',
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
      if (proc.status !== 0) throw new Error(`codex exercise exited ${proc.status}:\n${output}`);
      expect(output).toMatch(/FETCH_LIMITS:.*10.*20/i);
      expect(output).toMatch(/READY:.*#?196.*#?197.*#?198.*#?199/i);
      const blockedLine = output.match(/^BLOCKED:\s*(.+)$/im)?.[1] ?? '';
      for (let number = 201; number <= 209; number += 1) {
        expect(blockedLine).toMatch(new RegExp(`(?:^|\\D)#?${number}(?:\\D|$)`));
      }
      expect(output).toMatch(/EXCLUDED_DONE:.*#?200/i);
      expect(output).not.toMatch(/READY:.*#?195/i);
      expect(fs.existsSync(writeLog)).toBe(false);
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  }, 310_000);
});
