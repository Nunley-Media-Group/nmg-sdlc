/**
 * Opt-in Codex exercise for bounded bare start-issue backfill (issues #175 and #177).
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

function fakeGitSource() {
  return `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const args = process.argv.slice(2);

let commandIndex = 0;
while (commandIndex < args.length) {
  const arg = args[commandIndex];
  if (arg === '-C' || arg === '-c' || arg === '--git-dir' || arg === '--work-tree') {
    commandIndex += 2;
    continue;
  }
  if (arg.startsWith('-')) {
    commandIndex += 1;
    continue;
  }
  break;
}

const command = args[commandIndex] || '';
const commandArgs = args.slice(commandIndex + 1);
const readOnlyCommands = new Set([
  'branch', 'cat-file', 'diff', 'for-each-ref', 'log', 'ls-files', 'ls-remote',
  'merge-base', 'remote', 'rev-parse', 'show', 'status', 'symbolic-ref',
]);
const readOnlyConfig = command === 'config'
  && commandArgs.some((arg) => ['--get', '--get-all', '--get-regexp', '--list', '--show-origin'].includes(arg));
function isReadOnlyBranch(args) {
  if (args.length === 0) return true;
  const flags = new Set([
    '--all', '--color', '--ignore-case', '--list', '--no-color', '--omit-empty',
    '--quiet', '--remotes', '--show-current', '--verbose', '-a', '-q', '-r', '-v', '-vv',
  ]);
  const valueOptions = new Set([
    '--contains', '--format', '--merged', '--no-contains', '--no-merged', '--points-at', '--sort',
  ]);
  let listMode = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--list') listMode = true;
    if (flags.has(arg) || [...valueOptions].some((option) => arg.startsWith(option + '=')) || arg.startsWith('--color=')) {
      continue;
    }
    if (valueOptions.has(arg)) {
      if (index + 1 >= args.length) return false;
      index += 1;
      continue;
    }
    if (listMode && !arg.startsWith('-')) continue;
    return false;
  }
  return true;
}
const readOnlyBranch = command !== 'branch' || isReadOnlyBranch(commandArgs);
const readOnlyRemote = command !== 'remote'
  || commandArgs.length === 0
  || ['-v', '--verbose', 'get-url', 'show'].includes(commandArgs[0]);
const readOnlySymbolicRef = command !== 'symbolic-ref'
  || !commandArgs.some((arg) => arg === '--delete' || arg === '-d');
const allowed = (readOnlyCommands.has(command) || readOnlyConfig)
  && readOnlyBranch
  && readOnlyRemote
  && readOnlySymbolicRef;

if (!allowed) {
  if (process.env.EXERCISE_GIT_WRITE_LOG) {
    fs.appendFileSync(process.env.EXERCISE_GIT_WRITE_LOG, args.join(' ') + '\\n');
  }
  console.error('GIT MUTATION ATTEMPT BLOCKED: ' + args.join(' '));
  process.exit(97);
}

const proc = spawnSync(process.env.EXERCISE_REAL_GIT, args, { stdio: 'inherit' });
if (proc.error) {
  console.error(proc.error.message);
  process.exit(96);
}
process.exit(proc.status == null ? 96 : proc.status);
`;
}

function scaffoldExercise() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-start-backfill-'));
  const plugin = path.join(project, 'plugin');
  const bin = path.join(project, 'bin');
  fs.mkdirSync(path.join(plugin, 'workflows'), { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(project, 'steering'), { recursive: true });

  fs.cpSync(path.join(repoRoot, 'workflows', 'start-issue'), path.join(plugin, 'workflows', 'start-issue'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'references'), path.join(plugin, 'references'), { recursive: true });
  fs.writeFileSync(path.join(project, 'README.md'), '# Disposable start-issue backfill exercise\n');
  fs.writeFileSync(path.join(project, 'steering', 'product.md'), '# Product\nFixture.\n');
  fs.writeFileSync(path.join(project, 'steering', 'tech.md'), '# Tech\nFixture.\n');
  fs.writeFileSync(path.join(project, 'steering', 'structure.md'), '# Structure\nFixture.\n');

  const fakeGh = path.join(bin, 'gh');
  const fakeGit = path.join(bin, 'git');
  const writeLog = path.join(project, 'gh-write-attempts.log');
  const gitWriteLog = path.join(project, 'git-write-attempts.log');
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(fakeGh, fakeGhSource(), { mode: 0o755 });
  fs.writeFileSync(fakeGit, fakeGitSource(), { mode: 0o755 });
  execFileSync(realGit, ['init', '-q'], { cwd: project });
  execFileSync(realGit, ['add', '.'], { cwd: project });
  execFileSync(realGit, ['-c', 'user.name=Exercise', '-c', 'user.email=exercise@example.invalid', 'commit', '-qm', 'fixture'], { cwd: project });
  const initialGit = {
    head: execFileSync(realGit, ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim(),
    branch: execFileSync(realGit, ['branch', '--show-current'], { cwd: project, encoding: 'utf8' }).trim(),
    headRefs: execFileSync(realGit, ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads/'], { cwd: project, encoding: 'utf8' }),
    status: execFileSync(realGit, ['status', '--porcelain'], { cwd: project, encoding: 'utf8' }),
  };
  if (initialGit.status !== '') throw new Error(`exercise fixture is dirty before discovery:\n${initialGit.status}`);
  return { project, bin, writeLog, gitWriteLog, realGit, initialGit };
}

describeExercise('exercise: bare start-issue shortlist backfill', () => {
  test('expands past blocked candidates and a coordination epic without mutation', () => {
    const { project, bin, writeLog, gitWriteLog, realGit, initialGit } = scaffoldExercise();
    try {
      const prompt = [
        'Read plugin/workflows/start-issue/WORKFLOW.md and every reference required for Steps 1 and 1a.',
        'Exercise bare start-issue discovery with no issue-number argument against the gh executable on PATH.',
        'Stop after the automatic candidate window settles: do not call request_user_input, create a branch, update an issue, or change files.',
        'Report only these five evidence lines:',
        'FETCH_LIMITS: issue-list limits used in order',
        'READY: all ready issue numbers in presentation order',
        'BLOCKED: every blocked candidate issue number',
        'EXCLUDED_EPICS: every confirmed epic removed before readiness and shortlist counting',
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
          EXERCISE_GIT_WRITE_LOG: gitWriteLog,
          EXERCISE_REAL_GIT: realGit,
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
      expect(output).toMatch(/EXCLUDED_EPICS:.*#?200/i);
      expect(output).toMatch(/EXCLUDED_DONE:\s*(?:none|empty|\[\])/i);
      expect(output).not.toMatch(/READY:.*#?195/i);
      expect(fs.existsSync(writeLog)).toBe(false);
      const gitWriteAttempts = fs.existsSync(gitWriteLog) ? fs.readFileSync(gitWriteLog, 'utf8') : '';
      expect(gitWriteAttempts).toBe('');
      expect(execFileSync(realGit, ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim()).toBe(initialGit.head);
      expect(execFileSync(realGit, ['branch', '--show-current'], { cwd: project, encoding: 'utf8' }).trim()).toBe(initialGit.branch);
      expect(execFileSync(realGit, ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads/'], { cwd: project, encoding: 'utf8' })).toBe(initialGit.headRefs);
      expect(execFileSync(realGit, ['status', '--porcelain'], { cwd: project, encoding: 'utf8' })).toBe(initialGit.status);
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  }, 310_000);
});
