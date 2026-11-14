import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { checkFullGreen, commitsSinceLastGreen, fullRecordsDir, listFullRecords, parseVerifyFullCli,
  runFullVerification } from '../sdlc-verify-full.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-verify-full.mjs');
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const git = (root, ...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
// The full suite passes unless the checked-out tree holds a file named `broken`.
const FULL = "process.exit(require('node:fs').existsSync('broken') ? 1 : 0)";
const node = (id, code, extra = {}) => ({ id, provider: 'builtin.command', required: true, when: { kind: 'always' },
  config: { program: process.execPath, args: ['-e', code], cwd: '.', env: [] }, ...extra });
const DEPLOY = { fullGreen: { actions: ['deploy'] } };

async function fixture({ manifest = {}, validations = [] } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-full-')));
  roots.push(root);
  fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\n');
  await applySteeringPlan(root, createInitializePlan(root, { validations: [
    node('unit.tests', 'process.exit(1)', { tier: 'change' }),
    node('full.suite', FULL, { tier: 'full' }),
    ...validations,
  ] }));
  const file = path.join(root, 'steering/manifest.json');
  fs.writeFileSync(file, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...manifest }, null, 2)}\n`);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'baseline');
  return root;
}
const commit = (root, file, subject) => {
  fs.writeFileSync(path.join(root, file), `${subject}\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-m', subject);
  return git(root, 'rev-parse', 'HEAD');
};
const snapshot = (root) => ({ branch: git(root, 'branch', '--show-current'), head: git(root, 'rev-parse', 'HEAD'),
  status: git(root, 'status', '--porcelain'), worktrees: git(root, 'worktree', 'list', '--porcelain') });
const cli = (root, ...args) => spawnSync(process.execPath, [SCRIPT, ...args, '--project', root], { encoding: 'utf8' });

describe('full-tier verification on demand (#551 AC11, FR19)', () => {
  it('records a passed result for the commit a named ref points at, without touching the checkout', async () => {
    const root = await fixture();
    const head = git(root, 'rev-parse', 'HEAD');
    fs.writeFileSync(path.join(root, 'uncommitted.txt'), 'local work\n');
    const before = snapshot(root);
    const result = await runFullVerification({ projectRoot: root, ref: 'main' });
    expect(result).toMatchObject({ ok: true, commit: head, ref: 'main', status: 'passed', validations: 1, failing: [] });
    for (const key of ['lastGreen', 'sinceLastGreen', 'reason']) expect(Object.hasOwn(result, key)).toBe(false);
    expect(snapshot(root)).toEqual(before);
    const records = listFullRecords(root);
    expect(records).toHaveLength(1);
    // Only the full tier ran: the change-tier validation, which fails, is not part of the record.
    expect(records[0]).toMatchObject({ schemaVersion: 1, commit: head, ref: 'main', status: 'passed',
      results: [{ id: 'full.suite', required: true, status: 'passed', tier: 'full' }] });
    expect(Number.isNaN(Date.parse(records[0].generatedAt))).toBe(false);
    expect(result.record).toBe(path.join(fullRecordsDir(root), `${head}.json`));
    expect(result.record.startsWith(path.join(root, '.git', 'nmg-sdlc'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(result.record, 'utf8'))).toEqual(records[0]);
  });

  it('records each run under the commit its ref resolves to', async () => {
    const root = await fixture();
    const first = git(root, 'rev-parse', 'HEAD');
    await runFullVerification({ projectRoot: root, ref: 'main' });
    const second = commit(root, 'feature.txt', 'feat: add feature');
    git(root, 'tag', 'v1');
    expect(await runFullVerification({ projectRoot: root, ref: 'v1' })).toMatchObject({ ok: true, commit: second, ref: 'v1' });
    expect(listFullRecords(root).map((record) => record.commit).sort()).toEqual([first, second].sort());
    expect(fs.readdirSync(fullRecordsDir(root)).sort()).toEqual([`${first}.json`, `${second}.json`].sort());
  });

  it('verifies the remote default branch when no ref is named', async () => {
    const origin = await fixture();
    const head = git(origin, 'rev-parse', 'HEAD');
    const clone = `${origin}-clone`;
    roots.push(clone);
    git(path.dirname(origin), 'clone', '--quiet', origin, clone);
    // Local work ahead of the remote is not what gets verified.
    git(clone, 'config', 'user.email', 'test@example.com');
    git(clone, 'config', 'user.name', 'Test');
    commit(clone, 'broken', 'fix: local only');
    expect(await runFullVerification({ projectRoot: clone })).toMatchObject({ ok: true, commit: head, ref: 'origin/main', status: 'passed' });
    const ran = cli(clone, 'run');
    expect(ran.status).toBe(0);
    expect(JSON.parse(ran.stdout)).toMatchObject({ ok: true, commit: head, ref: 'origin/main' });
  });

  it('lists the first-parent commits merged since the last passed full run when it fails', async () => {
    const root = await fixture();
    const green = git(root, 'rev-parse', 'HEAD');
    expect((await runFullVerification({ projectRoot: root, ref: 'main' })).ok).toBe(true);
    const first = commit(root, 'feature.txt', 'feat: add feature (#12)');
    // A merged branch counts as its merge commit, not as the commits on the branch.
    git(root, 'checkout', '--quiet', '-b', 'side');
    const side = commit(root, 'broken', 'fix: adjust\tthing (#13)');
    git(root, 'checkout', '--quiet', 'main');
    git(root, 'merge', '--quiet', '--no-ff', '-m', 'Merge side (#13)', 'side');
    const merge = git(root, 'rev-parse', 'HEAD');
    const expected = [{ sha: merge, subject: 'Merge side (#13)' }, { sha: first, subject: 'feat: add feature (#12)' }];
    const result = await runFullVerification({ projectRoot: root, ref: 'main' });
    expect(result).toMatchObject({ ok: false, commit: merge, status: 'failed', failing: [{ id: 'full.suite', status: 'failed' }],
      lastGreen: green });
    expect(result.sinceLastGreen).toEqual(expected);
    expect(result.sinceLastGreen.map(({ sha }) => sha)).not.toContain(side);
    expect(Object.hasOwn(result, 'reason')).toBe(false);
    const record = listFullRecords(root).find((candidate) => candidate.commit === merge);
    expect(record).toMatchObject({ status: 'failed', lastGreen: green, sinceLastGreen: expected,
      results: [{ id: 'full.suite', status: 'failed' }] });
    expect(Object.hasOwn(record, 'reason')).toBe(false);
    expect(commitsSinceLastGreen(root, merge)).toEqual({ lastGreen: green, commits: expected });
    // The record of the last passed run is still there, under its own commit.
    expect(listFullRecords(root).find((candidate) => candidate.commit === green)).toMatchObject({ status: 'passed' });
    // The command line reports the same failure with exit status 1.
    const ran = cli(root, 'run', '--ref', 'main');
    expect(ran.status).toBe(1);
    expect(JSON.parse(ran.stdout)).toMatchObject({ ok: false, status: 'failed', lastGreen: green, sinceLastGreen: expected });
  });

  it('measures from the nearest passed record', async () => {
    const root = await fixture();
    await runFullVerification({ projectRoot: root, ref: 'main' });
    const nearer = commit(root, 'feature.txt', 'feat: add feature');
    await runFullVerification({ projectRoot: root, ref: 'main' });
    const broken = commit(root, 'broken', 'fix: break it');
    expect(await runFullVerification({ projectRoot: root, ref: 'main' })).toMatchObject({ status: 'failed', lastGreen: nearer,
      sinceLastGreen: [{ sha: broken, subject: 'fix: break it' }] });
    // A failed record is never the last green one.
    const later = commit(root, 'more.txt', 'feat: more');
    expect(await runFullVerification({ projectRoot: root, ref: 'main' })).toMatchObject({ status: 'failed', lastGreen: nearer,
      sinceLastGreen: [{ sha: later, subject: 'feat: more' }, { sha: broken, subject: 'fix: break it' }] });
  });

  it('reports no_green_record when no earlier passed run is recorded', async () => {
    const root = await fixture();
    const head = commit(root, 'broken', 'fix: break it');
    const result = await runFullVerification({ projectRoot: root, ref: head });
    expect(result).toMatchObject({ ok: false, status: 'failed', lastGreen: null, sinceLastGreen: null, reason: 'no_green_record' });
    expect(listFullRecords(root)[0]).toMatchObject({ commit: head, status: 'failed', lastGreen: null, sinceLastGreen: null, reason: 'no_green_record' });
    expect(commitsSinceLastGreen(root, head)).toBeNull();
  });

  it('records a run whose required validation could not finish as incomplete', async () => {
    const root = await fixture({ validations: [{ id: 'soak', provider: 'builtin.external-evidence', required: true, when: { kind: 'always' },
      config: { path: 'soak-evidence.json' }, tier: 'full' }] });
    const result = await runFullVerification({ projectRoot: root, ref: 'main' });
    expect(result).toMatchObject({ ok: false, status: 'incomplete', validations: 2, failing: [{ id: 'soak', status: 'incomplete' }],
      lastGreen: null, sinceLastGreen: null, reason: 'no_green_record' });
    expect(listFullRecords(root)[0]).toMatchObject({ status: 'incomplete' });
  });

  it('runs the worktree setup command in the temporary checkout and fails closed when it fails', async () => {
    const root = await fixture({ manifest: { worktree: { setup: { program: process.execPath, args: ['-e', 'process.exit(7)'] } } } });
    await expect(runFullVerification({ projectRoot: root, ref: 'main' })).rejects.toMatchObject({ reasonCode: 'worktree_setup_failed' });
    expect(listFullRecords(root)).toEqual([]);
    expect(git(root, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
  });

  it('refuses a ref that does not resolve', async () => {
    const root = await fixture();
    await expect(runFullVerification({ projectRoot: root, ref: 'no-such-ref' })).rejects.toMatchObject({ reasonCode: 'ref_unresolved' });
    const ran = cli(root, 'run', '--ref', 'no-such-ref');
    expect(ran.status).toBe(1);
    expect(JSON.parse(ran.stdout)).toMatchObject({ ok: false, reasonCode: 'ref_unresolved' });
  });
});

describe('full-green check for downstream actions (#551 AC12, FR20)', () => {
  it('answers green only when a passed full record exists at the commit or a descendant of it', async () => {
    const root = await fixture({ manifest: DEPLOY });
    const first = git(root, 'rev-parse', 'HEAD');
    expect(checkFullGreen({ projectRoot: root, commit: first, action: 'deploy' }))
      .toEqual({ action: 'deploy', commit: first, green: false, record: null });
    const second = commit(root, 'feature.txt', 'feat: add feature');
    await runFullVerification({ projectRoot: root, ref: second });
    // A passed record at a later commit covers the earlier one, and the commit itself.
    const behind = checkFullGreen({ projectRoot: root, commit: first, action: 'deploy' });
    expect(behind).toMatchObject({ action: 'deploy', commit: first, green: true, record: { commit: second, ref: second } });
    expect(Object.keys(behind).sort()).toEqual(['action', 'commit', 'green', 'record']);
    expect(checkFullGreen({ projectRoot: root, commit: second, action: 'deploy' })).toMatchObject({ commit: second, green: true });
    // The commit may be named by any ref.
    expect(checkFullGreen({ projectRoot: root, commit: 'main', action: 'deploy' })).toMatchObject({ commit: second, green: true });
    // A commit after the last passed record is not covered by it.
    const third = commit(root, 'more.txt', 'feat: more');
    expect(checkFullGreen({ projectRoot: root, commit: third, action: 'deploy' })).toEqual({ action: 'deploy', commit: third, green: false, record: null });
    // A failed record never counts, at the commit or ahead of it.
    const fourth = commit(root, 'broken', 'fix: break');
    await runFullVerification({ projectRoot: root, ref: 'main' });
    expect(checkFullGreen({ projectRoot: root, commit: third, action: 'deploy' })).toMatchObject({ green: false, record: null });
    expect(checkFullGreen({ projectRoot: root, commit: fourth, action: 'deploy' })).toMatchObject({ green: false, record: null });
    // A commit on another line of history is not behind the passed record.
    git(root, 'checkout', '--quiet', '-b', 'other', first);
    const other = commit(root, 'other.txt', 'feat: other');
    expect(checkFullGreen({ projectRoot: root, commit: other, action: 'deploy' })).toMatchObject({ green: false, record: null });
  });

  it('refuses an action steering does not list', async () => {
    const root = await fixture({ manifest: DEPLOY });
    await runFullVerification({ projectRoot: root, ref: 'main' });
    for (const action of ['preview', undefined]) {
      expect(() => checkFullGreen({ projectRoot: root, commit: 'HEAD', action })).toThrow(expect.objectContaining({ reasonCode: 'full_green_action_unknown' }));
    }
    const undeclared = await fixture();
    expect(() => checkFullGreen({ projectRoot: undeclared, commit: 'HEAD', action: 'deploy' }))
      .toThrow(expect.objectContaining({ reasonCode: 'full_green_action_unknown' }));
  });

  it('answers through the command line with exit status 0 when green, 1 when not and 2 for an unknown action', async () => {
    const root = await fixture({ manifest: DEPLOY });
    const first = git(root, 'rev-parse', 'HEAD');
    const check = (ref, action = 'deploy') => cli(root, 'check', '--action', action, '--commit', ref);
    const before = check(first);
    expect(before.status).toBe(1);
    expect(JSON.parse(before.stdout)).toEqual({ action: 'deploy', commit: first, green: false, record: null });

    const second = commit(root, 'feature.txt', 'feat: add feature');
    const ran = cli(root, 'run', '--ref', 'main');
    expect(ran.status).toBe(0);
    expect(JSON.parse(ran.stdout)).toMatchObject({ ok: true, status: 'passed', commit: second });
    // At the passed record, and behind it.
    for (const sha of [second, first]) {
      const answer = check(sha);
      expect(answer.status).toBe(0);
      expect(JSON.parse(answer.stdout)).toMatchObject({ action: 'deploy', commit: sha, green: true, record: { commit: second } });
    }
    // Ahead of it.
    const third = commit(root, 'more.txt', 'feat: more');
    const ahead = check(third);
    expect(ahead.status).toBe(1);
    expect(JSON.parse(ahead.stdout)).toEqual({ action: 'deploy', commit: third, green: false, record: null });
    // A failed record at the commit.
    const fourth = commit(root, 'broken', 'fix: break');
    expect(cli(root, 'run', '--ref', 'main').status).toBe(1);
    const failed = check(fourth);
    expect(failed.status).toBe(1);
    expect(JSON.parse(failed.stdout)).toMatchObject({ commit: fourth, green: false, record: null });

    // An action steering does not list is refused even for a commit that is green.
    const unknown = check(second, 'preview');
    expect(unknown.status).toBe(2);
    expect(JSON.parse(unknown.stdout)).toMatchObject({ ok: false, reasonCode: 'full_green_action_unknown' });
    // Both options are required, and `query` is gone.
    for (const args of [['check', '--action', 'deploy'], ['check', '--commit', second], ['query', '--action', 'deploy', '--commit', second]]) {
      const usage = cli(root, ...args);
      expect(usage.status).toBe(2);
      expect(usage.stderr).toContain('Usage');
      expect(usage.stdout).toBe('');
    }
  });

  it('parses its arguments strictly', () => {
    expect(parseVerifyFullCli(['run', '--ref', 'main'])).toEqual({ command: 'run', ref: 'main' });
    expect(parseVerifyFullCli(['run'])).toEqual({ command: 'run' });
    expect(parseVerifyFullCli(['run', '--project', '/p'])).toEqual({ command: 'run', project: '/p' });
    expect(parseVerifyFullCli(['check', '--commit', 'abc', '--action', 'deploy', '--project', '/p']))
      .toEqual({ command: 'check', commit: 'abc', action: 'deploy', project: '/p' });
    for (const argv of [[], ['run', '--commit', 'x'], ['run', '--ref'], ['run', '--ref', 'a', '--ref', 'b'], ['run', 'main'],
      ['check'], ['check', '--action', 'deploy'], ['check', '--commit', 'abc'], ['check', '--action', 'deploy', '--commit', 'abc', '--ref', 'main'],
      ['query', '--commit', 'abc', '--action', 'deploy'], ['verify']]) {
      expect(() => parseVerifyFullCli(argv)).toThrow('Usage');
    }
  });
});
