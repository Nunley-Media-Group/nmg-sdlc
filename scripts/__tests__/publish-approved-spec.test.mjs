import { afterEach, describe, expect, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../publish-approved-spec.mjs');
const temporaryRoots = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-publish-'));
  temporaryRoots.push(root);
  return root;
}

function git(cwd, args, env = process.env) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

function writeApproved(dir, issueN, status = 'Approved') {
  fs.mkdirSync(dir, { recursive: true });
  const body = `**Issue**: #${issueN}\n**Status**: ${status}\n\ncontent\n`;
  for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
    fs.writeFileSync(path.join(dir, name), body);
  }
}

function makeRepo() {
  const root = makeRoot();
  const remote = makeRoot();
  const bin = makeRoot();
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh
printf '%s\\n' "$*" >> .gh-log
if [ "$1" = "issue" ] && [ "$2" = "develop" ]; then
  name=""
  base=""
  while [ $# -gt 0 ]; do
    if [ "$1" = "--name" ]; then
      name="$2"
      shift 2
      continue
    fi
    if [ "$1" = "--base" ]; then
      base="$2"
      shift 2
      continue
    fi
    shift
  done
  if [ -z "$base" ]; then
    exit 1
  fi
  git checkout -b "$name"
  exit $?
fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '%s\\n' main
  exit 0
fi
if [ "$1" = "label" ] && [ "$2" = "list" ]; then
  printf '%s\n' '[]'
  exit 0
fi
if [ "$1" = "label" ] && [ "$2" = "create" ]; then
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  if [ "$GH_FAIL_ISSUE_LIST" = "1" ]; then
    exit 1
  fi
  if [ -n "$GH_ISSUE_LIST" ]; then
    printf '%s\n' "$GH_ISSUE_LIST"
    exit 0
  fi
  exit 1
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  if [ "$GH_FAIL_ISSUE_VIEW" = "1" ]; then
    exit 1
  fi
  if [ -n "$GH_ISSUE_VIEW" ]; then
    printf '%s\n' "$GH_ISSUE_VIEW"
    exit 0
  fi
  printf '%s\n' '{"number":42,"labels":[]}'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "edit" ] && [ "$4" = "--add-label" ] && [ "$5" = "spec-created" ]; then
  if [ "$FAIL_SPEC_LABEL" = "1" ]; then
    printf '%s\n' 'label failed' >&2
    exit 1
  fi
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then
  if [ -f .remote-merged ] && echo "$*" | grep -q -- '--state all'; then
    sha=$(git rev-parse HEAD)
    printf '[{"number":99,"state":"MERGED","headRefOid":"%s"}]\\n' "$sha"
    exit 0
  fi
  if [ "$GH_EXISTING_PR" = "1" ]; then printf '%s\\n' '[{"number":99}]'; exit 0; fi
  printf '%s\\n' '[]'
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  printf '%s\\n' 'https://github.com/example/repo/pull/99'
  exit 0
fi
if [ "$1" = "api" ]; then
  case "$2" in
    */rules/branches/main)
      if [ "$GH_EXPECTED_MISSING" = "1" ] && [ "$GH_PROTECTED" != "1" ]; then
        printf '%s\\n' '[{"type":"required_status_checks","parameters":{"required_status_checks":[{"context":"guardrails"}]}}]'
      elif [ "$GH_STALE_UNSTABLE" = "1" ] || [ "$GH_BLOCKED_PENDING" = "1" ]; then
        printf '%s\\n' '[{"type":"required_status_checks","parameters":{"required_status_checks":[{"context":"contribution"}]}}]'
      else
        printf '%s\\n' '[]'
      fi
      exit 0 ;;
    */protection/required_status_checks)
      if [ "$GH_PROTECTED" = "1" ]; then
        printf '%s\\n' '{"contexts":["guardrails"],"checks":[{"context":"guardrails"}]}'
        exit 0
      fi
      printf '%s\\n' '{"message":"Branch not protected"}'
      exit 1 ;;
  esac
fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  count=0
  if [ -f .pr-view-count ]; then count=$(cat .pr-view-count); fi
  count=$((count + 1))
  if [ "$GH_RECONCILE_UNREADABLE" = "1" ] && [ "$count" -ge 3 ]; then exit 1; fi
  printf '%s\\n' "$count" > .pr-view-count
  state=CLEAN
  if [ "$GH_POLICY_BLOCK" = "1" ]; then state=BLOCKED; fi
  if [ "$GH_STALE_UNSTABLE" = "1" ] && [ "$count" -lt 3 ]; then state=UNSTABLE; fi
  if [ "$GH_PENDING_CI" = "1" ] && [ "$count" -lt 3 ]; then state=UNSTABLE; fi
  if [ "$GH_OPTIONAL_PENDING" = "1" ] && [ "$count" -lt 3 ]; then state=UNSTABLE; fi
  if [ "$GH_EXPECTED_MISSING" = "1" ] && [ "$count" -eq 2 ]; then state=UNSTABLE; fi
  if [ "$GH_BLOCKED_PENDING" = "1" ] && [ "$count" -lt 3 ]; then state=BLOCKED; fi
  printf '%s\\n' "$state" >> .pr-state-log
  sha=$(git rev-parse HEAD)
  if [ "$GH_DRIFT_BRANCH" = "1" ] && [ "$count" -ge 2 ]; then prhead=other; else prhead=42-add-x; fi
  if [ "$GH_DRIFT_HEAD" = "1" ] && [ "$count" -ge 2 ]; then sha=0000000000000000000000000000000000000000; fi
  prstate=OPEN
  if [ "$GH_CLOSED_PR" = "1" ] && [ "$count" -ge 2 ]; then prstate=CLOSED; fi
  if [ -f .remote-merged ]; then prstate=MERGED; fi
  if [ "$GH_RECONCILE_OPEN" = "1" ] && [ "$count" -ge 3 ]; then prstate=OPEN; fi
  if [ "$GH_RECONCILE_HEAD_DRIFT" = "1" ] && [ "$count" -ge 3 ]; then sha=0000000000000000000000000000000000000000; fi
  prbase=main
  if [ "$GH_DRIFT_BASE" = "1" ] && [ "$count" -ge 2 ]; then prbase=other; fi
  if [ "$GH_RECONCILE_BASE_DRIFT" = "1" ] && [ "$count" -ge 3 ]; then prbase=other; fi
  draft=false
  if [ "$GH_DRAFT_PR" = "1" ] && [ "$count" -ge 2 ]; then draft=true; fi
  printf '{"number":99,"state":"%s","isDraft":%s,"headRefName":"%s","headRefOid":"%s","baseRefName":"%s","mergeStateStatus":"%s","url":"https://github.com/example/repo/pull/99"}\\n' "$prstate" "$draft" "$prhead" "$sha" "$prbase" "$state"
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "checks" ]; then
  count=$(cat .pr-view-count)
  if [ "$GH_NO_REQUIRED" = "1" ] && [ "$4" = "--required" ]; then
    printf '%s\\n' "no required checks reported on the '42-add-x' branch" >&2
    exit 1
  fi
  if [ "$GH_PENDING_CI" = "1" ] && [ "$count" -eq 1 ]; then
    printf '%s\\n' '[]'
    exit 1
  fi
  if [ "$GH_EXPECTED_MISSING" = "1" ] && [ "$count" -eq 1 ] && [ "$4" = "--required" ]; then
    printf '%s\\n' '[]'
    exit 1
  fi
  state=SUCCESS
  bucket=pass
  if [ "$GH_PENDING_CI" = "1" ] && [ "$count" -eq 2 ]; then state=PENDING; bucket=pending; fi
  if [ "$GH_OPTIONAL_PENDING" = "1" ] && [ "$4" != "--required" ] && [ "$count" -lt 3 ]; then state=PENDING; bucket=pending; fi
  if [ "$GH_FAILED_CI" = "1" ]; then state=FAILURE; bucket=fail; fi
  if [ "$GH_EXPECTED_MISSING" = "1" ] && [ "$count" -ge 2 ]; then
    state=SUCCESS
    bucket=pass
    if [ "$count" -eq 2 ]; then state=PENDING; bucket=pending; fi
    printf '[{"name":"guardrails","state":"%s","bucket":"%s"}]\\n' "$state" "$bucket"
    if [ "$bucket" = "pending" ]; then exit 8; fi
    exit 0
  fi
  printf '[{"name":"contribution","state":"%s","bucket":"%s"}]\\n' "$state" "$bucket"
  if [ "$bucket" = "pending" ]; then exit 8; fi
  if [ "$bucket" = "fail" ]; then exit 1; fi
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then
  echo "$*" | grep -q -- '--squash' || exit 1
  if [ "$GH_PENDING_CI" = "1" ]; then
    count=0
    if [ -f .pr-view-count ]; then count=$(cat .pr-view-count); fi
    if [ "$count" -lt 4 ]; then printf '%s\\n' 'required status check expected' >&2; exit 1; fi
  fi
  if [ "$GH_MERGE_REJECT" = "1" ]; then
    printf '%s\\n' 'remote rejected merge' >&2
    exit 1
  fi
  if [ "$GH_REMOTE_MERGE_FAIL" = "1" ]; then
    git -C "$GH_MAIN_WORKTREE" merge --squash "$(git rev-parse HEAD)" || exit 1
    git -C "$GH_MAIN_WORKTREE" commit -m "docs: approve spec squash" || exit 1
    git -C "$GH_MAIN_WORKTREE" push origin main || exit 1
    touch .remote-merged
    printf '%s\\n' "fatal: 'main' is already used by worktree" >&2
    exit 1
  fi
  branch=$(git branch --show-current)
  git checkout main
  git merge --squash "$branch"
  git commit -m "docs: approve spec squash"
  git push origin main
  git checkout "$branch"
  if [ "$FAIL_DEFAULT_CHECKOUT" = "1" ]; then
    touch .git/index.lock
  fi
  exit 0
fi
exit 1
`);
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  execFileSync('git', ['init', '--bare'], { cwd: remote, encoding: 'utf8' });
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'user.email', 'test@example.com']);
  fs.writeFileSync(path.join(root, 'README.md'), 'root\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'init']);
  git(root, ['remote', 'add', 'origin', remote]);
  git(root, ['push', '-u', 'origin', 'HEAD']);
  return {
    root,
    remote,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    },
  };
}

function run(cwd, args, env) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env,
  });
}
function issueJson(overrides = {}) {
  return JSON.stringify({
    number: 42,
    title: 'Add X',
    body: 'Ship it',
    labels: [],
    state: 'OPEN',
    ...overrides,
  });
}

function commitApprovedBranch(root, issueN, slug, { push = false } = {}) {
  const branch = `${issueN}-${slug}`;
  git(root, ['checkout', '-b', branch]);
  writeApproved(path.join(root, 'specs', branch), issueN);
  git(root, ['add', `specs/${branch}`]);
  git(root, ['commit', '-m', `docs: approve ${branch}`]);
  if (push) git(root, ['push', '-u', 'origin', branch]);
  git(root, ['checkout', 'main']);
  if (push) git(root, ['branch', '-D', branch]);
  return branch;
}


function parse(result) {
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

describe('publish-approved-spec', () => {
  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it('discover validates issue input and fails unreadable issue output without mutation', () => {
    const { root, env } = makeRepo();
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    for (const [args, extraEnv, reasonCode] of [
      [['discover', '--issue', '0'], {}, 'invalid_arguments'],
      [['discover', '--issue', '42'], { GH_FAIL_ISSUE_VIEW: '1' }, 'issue_unreadable'],
      [['discover', '--issue', '42'], { GH_ISSUE_VIEW: '{' }, 'issue_unreadable'],
      [['discover', '--issue', '42'], { GH_ISSUE_VIEW: issueJson({ number: 41 }) }, 'issue_unreadable'],
    ]) {
      const result = run(root, args, { ...env, ...extraEnv });
      expect(result.status).not.toBe(0);
      expect(parse(result)).toMatchObject({ ok: false, reasonCode });
    }
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(head);
    expect(git(root, ['status', '--porcelain'])).toBe('?? .gh-log\n');
  });

  it('discover returns complete feature metadata with issue slug fallback and spike neutrality', () => {
    const { root, env } = makeRepo();
    const result = run(root, ['discover', '--issue', '42'], {
      ...env,
      GH_ISSUE_VIEW: issueJson({
        title: '---',
        labels: [{ name: 'spike' }],
      }),
    });
    expect(result.status).toBe(0);
    expect(parse(result)).toEqual({
      ok: true,
      issue: {
        number: 42,
        title: '---',
        body: 'Ship it',
        labels: ['spike'],
        state: 'OPEN',
      },
      classification: 'feature',
      slug: 'issue',
      targetDir: 'specs/42-issue',
      spec: { dir: null, approved: false, source: null },
    });
  });

  it('discover classifies bug labels case-insensitively and reuses an existing directory', () => {
    const { root, env } = makeRepo();
    writeApproved(path.join(root, 'specs', '42-historical-name'), 42, 'Draft');
    const result = run(root, ['discover', '--issue', '42'], {
      ...env,
      GH_ISSUE_VIEW: issueJson({
        title: 'Renamed Issue',
        labels: [{ name: 'BUG' }, { name: 'spike' }],
      }),
    });
    expect(result.status).toBe(0);
    expect(parse(result)).toMatchObject({
      classification: 'bug',
      slug: 'renamed-issue',
      targetDir: 'specs/42-historical-name',
      spec: {
        dir: 'specs/42-historical-name',
        approved: false,
        source: 'worktree',
      },
    });
  });

  it.each([
    ['local', false],
    ['remote', true],
  ])('discover reports an approved %s branch package', (_source, push) => {
    const { root, env } = makeRepo();
    commitApprovedBranch(root, 42, 'historical-name', { push });
    const result = run(root, ['discover', '--issue', '42'], {
      ...env,
      GH_ISSUE_VIEW: issueJson({ title: 'Renamed Issue' }),
    });
    expect(result.status).toBe(0);
    expect(parse(result)).toMatchObject({
      targetDir: 'specs/42-historical-name',
      spec: {
        dir: 'specs/42-historical-name',
        approved: true,
        source: _source,
      },
    });
  });

  it('discover fails closed for ambiguous worktree directories and branches', () => {
    const first = makeRepo();
    fs.mkdirSync(path.join(first.root, 'specs', '42-one'), { recursive: true });
    fs.mkdirSync(path.join(first.root, 'specs', '42-two'), { recursive: true });
    const directoryResult = run(first.root, ['discover', '--issue', '42'], {
      ...first.env,
      GH_ISSUE_VIEW: issueJson(),
    });
    expect(parse(directoryResult)).toMatchObject({
      ok: false,
      reasonCode: 'spec_status_ambiguous',
    });

    const second = makeRepo();
    git(second.root, ['branch', '42-one']);
    git(second.root, ['branch', '42-two']);
    const branchResult = run(second.root, ['discover', '--issue', '42'], {
      ...second.env,
      GH_ISSUE_VIEW: issueJson(),
    });
    expect(parse(branchResult)).toMatchObject({
      ok: false,
      reasonCode: 'spec_status_ambiguous',
    });
  });

  it('missing-spec-created filters exact labels, sorts, and deduplicates complete rows', () => {
    const { root, env } = makeRepo();
    const result = run(root, ['missing-spec-created'], {
      ...env,
      GH_ISSUE_LIST: JSON.stringify([
        { number: 9, title: 'Nine', labels: [] },
        { number: 2, title: 'Two', labels: ['Spec-Created'] },
        { number: 7, title: 'Excluded object', labels: [{ name: 'spec-created' }] },
        { number: 4, title: 'Four', labels: [{ name: 'bug' }] },
        { number: 2, title: 'Duplicate', labels: [] },
        { number: 3, title: 'Excluded string', labels: ['spec-created'] },
      ]),
    });

    expect(result.status).toBe(0);
    expect(parse(result)).toEqual({
      ok: true,
      issues: [
        { number: 2, title: 'Two' },
        { number: 4, title: 'Four' },
        { number: 9, title: 'Nine' },
      ],
    });
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8').trim()).toBe(
      'issue list --state open --limit 100 --json number,title,labels',
    );
  });

  it('missing-spec-created returns empty results and fails closed on unreadable evidence', () => {
    const empty = makeRepo();
    const emptyResult = run(empty.root, ['missing-spec-created'], {
      ...empty.env,
      GH_ISSUE_LIST: '[]',
    });
    expect(emptyResult.status).toBe(0);
    expect(parse(emptyResult)).toEqual({ ok: true, issues: [] });

    for (const [args, list, extraEnv, reasonCode] of [
      [['missing-spec-created', 'extra'], '[]', {}, 'invalid_arguments'],
      [['missing-spec-created'], '{}', {}, 'issues_unreadable'],
      [['missing-spec-created'], '{', {}, 'issues_unreadable'],
      [['missing-spec-created'], '[{"number":0,"title":"Zero","labels":[]}]', {}, 'issues_unreadable'],
      [['missing-spec-created'], '[{"number":1,"title":"","labels":[]}]', {}, 'issues_unreadable'],
      [['missing-spec-created'], '[{"number":1,"title":"One","labels":[{}]}]', {}, 'issues_unreadable'],
      [['missing-spec-created'], '[]', { GH_FAIL_ISSUE_LIST: '1' }, 'issues_unreadable'],
    ]) {
      const fixture = makeRepo();
      const result = run(fixture.root, args, {
        ...fixture.env,
        GH_ISSUE_LIST: list,
        ...extraEnv,
      });
      expect(result.status).not.toBe(0);
      expect(parse(result)).toMatchObject({ ok: false, reasonCode });
    }
  });

  it('candidates deduplicates published numbers, sorts, and excludes every approved source', () => {
    const { root, env } = makeRepo();
    writeApproved(path.join(root, 'specs', '3-worktree'), 3);
    commitApprovedBranch(root, 4, 'local');
    commitApprovedBranch(root, 5, 'remote', { push: true });
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    const result = run(
      root,
      ['candidates', '--published', '7', '--published', '7'],
      {
        ...env,
        GH_ISSUE_LIST: JSON.stringify([
          { number: 9, title: 'Nine' },
          { number: 2, title: 'Two' },
          { number: 7, title: 'Published' },
          { number: 3, title: 'Worktree' },
          { number: 4, title: 'Local' },
          { number: 5, title: 'Remote' },
          { number: 2, title: 'Duplicate' },
        ]),
      },
    );
    expect(result.status).toBe(0);
    expect(parse(result)).toEqual({
      ok: true,
      candidates: [
        { number: 2, title: 'Two' },
        { number: 9, title: 'Nine' },
      ],
    });
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8').trim()).toBe(
      'issue list --state open --limit 100 --json number,title',
    );
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(head);
    expect(git(root, ['branch', '--show-current']).trim()).toBe('main');
    expect(git(root, ['status', '--porcelain'])).toBe('?? .gh-log\n?? specs/\n');
  });

  it('candidates rejects malformed GitHub output, invalid arguments, and ambiguous status', () => {
    const malformed = makeRepo();
    for (const [args, list, reasonCode] of [
      [['candidates', '--published', 'no'], '[]', 'invalid_arguments'],
      [['candidates'], '{}', 'issues_unreadable'],
      [['candidates'], '[{"number":1}]', 'issues_unreadable'],
    ]) {
      const result = run(malformed.root, args, {
        ...malformed.env,
        GH_ISSUE_LIST: list,
      });
      expect(result.status).not.toBe(0);
      expect(parse(result)).toMatchObject({ ok: false, reasonCode });
    }

    const ambiguous = makeRepo();
    fs.mkdirSync(path.join(ambiguous.root, 'specs', '8-one'), { recursive: true });
    fs.mkdirSync(path.join(ambiguous.root, 'specs', '8-two'), { recursive: true });
    const result = run(ambiguous.root, ['candidates'], {
      ...ambiguous.env,
      GH_ISSUE_LIST: '[{"number":8,"title":"Eight"}]',
    });
    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({
      ok: false,
      reasonCode: 'spec_status_ambiguous',
      issue: 8,
    });
  });


  it('prepare fails dirty_tree on a dirty other branch', () => {
    const { root, env } = makeRepo();
    fs.writeFileSync(path.join(root, 'dirty.txt'), 'nope\n');
    const result = run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env);
    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({ ok: false, reasonCode: 'dirty_tree' });
    expect(git(root, ['branch', '--show-current']).trim()).toBe('main');
  });

  it('prepare checks out {N}-{slug} from a clean tree', () => {
    const { root, env } = makeRepo();
    const result = run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env);
    expect(result.status).toBe(0);
    expect(parse(result)).toEqual({ ok: true, branch: '42-add-x' });
    expect(git(root, ['branch', '--show-current']).trim()).toBe('42-add-x');
  });

  it('commit-push stages only the spec dir with the exact subject and pushes HEAD', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    fs.writeFileSync(path.join(root, 'specs', '42-add-x', 'tasks.md'), [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Create code',
      '',
      '**File(s)**: `src/not-yet-created.ts`',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'README.md'), 'changed\n');
    git(root, ['add', 'README.md']);
    const result = run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(result.status).toBe(0);
    expect(parse(result)).toMatchObject({
      ok: true,
      branch: '42-add-x',
      pushed: true,
      skippedCommit: false,
    });
    expect(git(root, ['log', '-1', '--pretty=%s']).trim()).toBe('docs: approve spec for #42');
    const names = git(root, ['show', '--pretty=', '--name-only', 'HEAD']).trim().split('\n');
    expect(names.every((name) => name.startsWith('specs/42-add-x/'))).toBe(true);
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/42-add-x'])).toContain('specs/42-add-x/requirements.md');
    expect(git(root, ['diff', '--cached', '--name-only']).trim()).toBe('README.md');
  });

  it.each([
    ['unmatched', 'Prose with unmatched ` delimiter'],
    ['escaped', 'Prose with escaped \\` delimiter'],
  ])('commit-push accepts a valid declaration after an %s backtick', (_name, prose) => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    const specDir = path.join(root, 'specs', '42-add-x');
    writeApproved(specDir, 42);
    fs.writeFileSync(path.join(specDir, 'tasks.md'), [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Create code',
      prose,
      '**File(s)**: `src/a.ts`',
      '',
    ].join('\n'));

    const result = run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env);

    expect(result.status).toBe(0);
    expect(parse(result)).toMatchObject({ ok: true });
    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
  });

  it('commit-push rejects an unapproved package', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    fs.mkdirSync(path.join(root, 'specs', '42-add-x'), { recursive: true });
    fs.writeFileSync(path.join(root, 'specs', '42-add-x', 'requirements.md'), '**Issue**: #42\n**Status**: Draft\n');
    const result = run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({ ok: false, reasonCode: 'spec_not_approved' });
  });

  it.each(['commit-push', 'merge'].flatMap((command) => [
    [command, 'missing', ['**Type**: Modify'], { line: 4 }],
    [command, 'near-miss', ['**Files**: `src/a.ts`'], { line: 6, entry: '**Files**: `src/a.ts`' }],
    [command, 'duplicate', ['**File(s)**: `src/a.ts`', '**File(s)**: `src/b.ts`'], {
      line: 7,
      entry: '**File(s)**: `src/b.ts`',
    }],
  ]))('%s rejects a %s File(s) declaration before publication side effects', (command, _name, declaration, expected) => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    const specDir = path.join(root, 'specs', '42-add-x');
    writeApproved(specDir, 42);
    fs.writeFileSync(path.join(specDir, 'tasks.md'), [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Create code',
      '',
      ...declaration,
      '',
    ].join('\n'));

    const result = run(root, [command, '--issue', '42', '--dir', 'specs/42-add-x'], env);

    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({
      ok: false,
      reasonCode: 'publication_scope_unproven',
      spec: 'specs/42-add-x/tasks.md',
      taskId: 'T001',
      ...expected,
    });
    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });

  it.each(['commit-push', 'merge'].flatMap((command) => [
    [command, 'fenced', ['```text', '## T001: Hidden task', '**File(s)**: `src/a.ts`', '```']],
    [command, 'commented', ['<!--', '## T001: Hidden task', '**File(s)**: `src/a.ts`', '-->']],
    [command, 'multiline code span', ['``', '## T001: Hidden task', '**File(s)**: `src/a.ts`', '``']],
    [command, 'multiline code span with opener content', ['``example', '## T001: Hidden task', '**File(s)**: `src/a.ts`', '``']],
    [command, 'multiline code span after astral prefix', ['😀 `` opener', '## T001: Hidden task', '**File(s)**: `src/a.ts`', '``']],
  ]))('%s rejects a %s admitted task before publication side effects', (command, _name, hiddenTask) => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    const specDir = path.join(root, 'specs', '42-add-x');
    writeApproved(specDir, 42);
    fs.writeFileSync(path.join(specDir, 'tasks.md'), [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      ...hiddenTask,
      '',
    ].join('\n'));

    const result = run(root, [command, '--issue', '42', '--dir', 'specs/42-add-x'], env);

    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({
      ok: false,
      reasonCode: 'publication_scope_unproven',
      spec: 'specs/42-add-x/tasks.md',
      taskId: 'T001',
      line: 5,
    });
    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });

  it.each(['commit-push', 'merge'].flatMap((command) => [
    [command, 'HTML comment', ['<!-- unmatched ` -->'], 6],
    [command, 'HTML comment after astral prefix', ['😀<!-- unmatched ` -->'], 6],
    [command, 'tilde fence', ['~~~text', 'unmatched `', '~~~'], 8],
  ]))('%s ignores backticks in a %s before a hidden multiline span', (command, _name, prefix, line) => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    const specDir = path.join(root, 'specs', '42-add-x');
    writeApproved(specDir, 42);
    fs.writeFileSync(path.join(specDir, 'tasks.md'), [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      ...prefix,
      '``',
      '## T001: Hidden task',
      '**File(s)**: `src/a.ts`',
      '``',
      '',
    ].join('\n'));

    const result = run(root, [command, '--issue', '42', '--dir', 'specs/42-add-x'], env);

    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({
      ok: false,
      reasonCode: 'publication_scope_unproven',
      spec: 'specs/42-add-x/tasks.md',
      taskId: 'T001',
      line,
    });
    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });

  it.each(['commit-push', 'merge'])('%s rejects a declaration hidden by crossing multiline spans', (command) => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    const specDir = path.join(root, 'specs', '42-add-x');
    writeApproved(specDir, 42);
    fs.writeFileSync(path.join(specDir, 'tasks.md'), [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Create code',
      '`` opener',
      'inside old span `` then `` opener for new span',
      '**File(s)**: `src/a.ts`',
      '``',
      '',
    ].join('\n'));

    const result = run(root, [command, '--issue', '42', '--dir', 'specs/42-add-x'], env);

    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({
      ok: false,
      reasonCode: 'publication_scope_unproven',
      spec: 'specs/42-add-x/tasks.md',
      taskId: 'T001',
      line: 4,
    });
    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });

  it.each(['commit-push', 'merge'].flatMap((command) => [
    [command, 'bare level-two', '##'],
    [command, 'bare level-three', '###'],
  ]))('%s rejects metadata after a %s task boundary before side effects', (command, _name, boundary) => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    const specDir = path.join(root, 'specs', '42-add-x');
    writeApproved(specDir, 42);
    fs.writeFileSync(path.join(specDir, 'tasks.md'), [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Create code',
      boundary,
      '**File(s)**: `src/a.ts`',
      '',
    ].join('\n'));

    const result = run(root, [command, '--issue', '42', '--dir', 'specs/42-add-x'], env);

    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({
      ok: false,
      reasonCode: 'publication_scope_unproven',
      spec: 'specs/42-add-x/tasks.md',
      taskId: 'T001',
      line: 4,
    });
    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });


  it.each(['commit-push', 'merge'])('%s rejects invalid File(s) before publication side effects', (command) => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    const specDir = path.join(root, 'specs', '42-add-x');
    writeApproved(specDir, 42);
    fs.writeFileSync(path.join(specDir, 'tasks.md'), [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Create code',
      '',
      '**File(s)**: Create `src/a.ts`',
      '',
    ].join('\n'));

    const result = run(root, [command, '--issue', '42', '--dir', 'specs/42-add-x'], env);

    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({
      ok: false,
      reasonCode: 'publication_scope_unproven',
      spec: 'specs/42-add-x/tasks.md',
      taskId: 'T001',
      line: 6,
      entry: 'Create `src/a.ts`',
    });
    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });

  it.each(['commit-push', 'merge'])('%s validates the target branch after switching', (command) => {
    const { root, env } = makeRepo();
    const specDir = path.join(root, 'specs', '42-add-x');
    writeApproved(specDir, 42);
    fs.writeFileSync(path.join(specDir, 'tasks.md'), [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Create code',
      '',
      '**File(s)**: Create `src/a.ts`',
      '',
    ].join('\n'));
    git(root, ['add', 'specs/42-add-x']);
    git(root, ['commit', '-m', 'docs: invalid target branch spec']);
    git(root, ['push', 'origin', 'main']);
    git(root, ['checkout', '-b', 'other']);
    fs.writeFileSync(path.join(specDir, 'tasks.md'), [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Create code',
      '',
      '**File(s)**: `src/a.ts`',
      '',
    ].join('\n'));
    git(root, ['add', 'specs/42-add-x/tasks.md']);
    git(root, ['commit', '-m', 'docs: valid current branch spec']);

    const result = run(root, [command, '--issue', '42', '--dir', 'specs/42-add-x'], env);

    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({
      ok: false,
      reasonCode: 'publication_scope_unproven',
      spec: 'specs/42-add-x/tasks.md',
    });
    expect(git(root, ['branch', '--show-current']).trim()).toBe('42-add-x');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });

  it('commit-push skips an identical tree and still pushes', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const first = git(root, ['rev-parse', 'HEAD']).trim();
    const second = run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(second.status).toBe(0);
    expect(parse(second)).toMatchObject({
      ok: true,
      skippedCommit: true,
      commit: null,
      pushed: true,
    });
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(first);
  });

  it('prepare cuts {N}-{slug} from origin/default without gh issue develop', () => {
    const { root, env } = makeRepo();
    const main = git(root, ['rev-parse', 'origin/main']).trim();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    expect(git(root, ['branch', '--show-current']).trim()).toBe('42-add-x');
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(main);
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('issue develop');
  });

  it('merge squash-merges a docs-only PR into the default branch without Closes', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(result.status).toBe(0);
    expect(parse(result)).toEqual({
      ok: true,
      branch: 'main',
      pr: 99,
      merged: true,
      squash: true,
      labeled: true,
    });
    expect(git(root, ['branch', '--show-current']).trim()).toBe('main');
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/main'])).toContain('specs/42-add-x/requirements.md');
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log).toContain('pr create --base main --head 42-add-x --title docs: approve spec for #42');
    expect(log).not.toMatch(/Closes #42|Fixes #42|Resolves #42/i);
    expect(log).toMatch(/pr merge 99 --squash --match-head-commit [0-9a-f]{40} --delete-branch/);
    expect(log).toContain('issue edit 42 --add-label spec-created');
  });
  it('waits for unreported and pending required CI before an exact-head merge', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], { ...env, GH_PENDING_CI: '1' });
    expect(result.status).toBe(0);
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log.match(/pr checks 99 --required/g)).toHaveLength(4);
    expect(log).toContain(`pr merge 99 --squash --match-head-commit ${head}`);
    expect(log.match(/pr merge 99/g)).toHaveLength(1);
  });

  it('waits for reported CI when the branch declares no required checks', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], {
      ...env, GH_PENDING_CI: '1', GH_NO_REQUIRED: '1',
    });
    expect(result.status).toBe(0);
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log.match(/pr checks 99 --required/g)).toHaveLength(4);
    expect(log.match(/pr checks 99 --json/g)).toHaveLength(4);
    expect(log.match(/pr merge 99/g)).toHaveLength(1);
  });

  it('keeps observing unfiltered pending CI after required checks pass', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], {
      ...env, GH_OPTIONAL_PENDING: '1',
    });
    expect(result.status).toBe(0);
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log.match(/pr checks 99 --json/g)).toHaveLength(4);
    expect(log.match(/pr merge 99/g)).toHaveLength(1);
  });

  it('observes BLOCKED with absent then pending checks until passing CLEAN rechecks', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], {
      ...env, GH_EXISTING_PR: '1', GH_PENDING_CI: '1', GH_BLOCKED_PENDING: '1',
    });
    expect(result.status).toBe(0);
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log).not.toContain('pr create');
    expect(fs.readFileSync(path.join(root, '.pr-state-log'), 'utf8').trim().split('\n'))
      .toEqual(['BLOCKED', 'BLOCKED', 'CLEAN', 'CLEAN']);
    expect(log.match(/pr checks 99 --required/g)).toHaveLength(4);
    expect(log.match(/pr merge 99 /g)).toHaveLength(1);
    expect(log).toContain(`pr merge 99 --squash --match-head-commit ${head} --delete-branch`);
  });

  it.each([
    ['ruleset', {}],
    ['branch protection', { GH_PROTECTED: '1' }],
  ])('does not merge a CLEAN PR while a %s check is not reported', (_policy, flags) => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], {
      ...env, GH_EXPECTED_MISSING: '1', ...flags,
    });
    expect(result.status).toBe(0);
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log.match(/pr checks 99 --required/g)).toHaveLength(4);
    expect(log.match(/pr merge 99/g)).toHaveLength(1);
  });

  it.each([
    ['pr_check_failed', { GH_FAILED_CI: '1' }, { check: { name: 'contribution', state: 'FAILURE' } }],
    ['pr_check_failed', { GH_FAILED_CI: '1', GH_STALE_UNSTABLE: '1' }, { check: { name: 'contribution', state: 'FAILURE' } }],
    ['pr_merge_blocked', { GH_POLICY_BLOCK: '1' }, { mergeStateStatus: 'BLOCKED' }],
    ['pr_head_changed', { GH_DRIFT_BRANCH: '1' }, { observed: { headRefName: 'other' } }],
    ['pr_head_changed', { GH_DRIFT_BASE: '1' }, { observed: { baseRefName: 'other' } }],
    ['pr_head_changed', { GH_CLOSED_PR: '1' }, { observed: { state: 'CLOSED' } }],
    ['pr_merge_blocked', { GH_DRAFT_PR: '1' }, { isDraft: true }],
    ['pr_head_changed', { GH_DRIFT_HEAD: '1' }, { head: expect.stringMatching(/^[0-9a-f]{40}$/) }],
  ])('fails closed on %s without merging', (reasonCode, flags, evidence) => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], { ...env, ...flags });
    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({ ok: false, reasonCode, pr: 99, ...evidence });
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr merge 99');
  });

  it('waits through stale UNSTABLE on an existing PR before two passing CLEAN views', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], {
      ...env, GH_EXISTING_PR: '1', GH_STALE_UNSTABLE: '1',
    });
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(result.status).toBe(0);
    expect(parse(result)).toMatchObject({ ok: true, pr: 99, merged: true });
    expect(log).not.toContain('pr create');
    expect(log.match(/pr view 99/g)).toHaveLength(4);
    expect(log.match(/pr checks 99 --required/g)).toHaveLength(4);
    expect(fs.readFileSync(path.join(root, '.pr-state-log'), 'utf8').trim().split('\n'))
      .toEqual(['UNSTABLE', 'UNSTABLE', 'CLEAN', 'CLEAN']);
    expect(log.match(/pr merge 99/g)).toHaveLength(1);
    expect(log).toContain(`pr merge 99 --squash --match-head-commit ${head} --delete-branch`);
    expect(git(root, ['rev-parse', '42-add-x']).trim()).toBe(head);
  });

  it('reuses the existing spec PR and merges only its exact head', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], { ...env, GH_EXISTING_PR: '1' });
    expect(result.status).toBe(0);
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log).not.toContain('pr create');
    expect(log).toContain(`pr merge 99 --squash --match-head-commit ${git(root, ['rev-parse', '42-add-x']).trim()}`);
  });

  it('reports a post-merge label failure without undoing the merge', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);

    const result = run(
      root,
      ['merge', '--issue', '42', '--dir', 'specs/42-add-x'],
      { ...env, FAIL_SPEC_LABEL: '1' },
    );

    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({
      ok: false,
      reasonCode: 'spec_created_label_failed',
      merged: true,
      pr: 99,
    });
    expect(git(root, ['branch', '--show-current']).trim()).toBe('main');
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/main'])).toContain('specs/42-add-x/requirements.md');
  });

  it('reports successful merge state when default checkout fails', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);

    const result = run(
      root,
      ['merge', '--issue', '42', '--dir', 'specs/42-add-x'],
      { ...env, FAIL_DEFAULT_CHECKOUT: '1' },
    );

    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({
      ok: false,
      reasonCode: 'default_checkout_failed',
      merged: true,
      pr: 99,
    });
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/main'])).toContain('specs/42-add-x/requirements.md');
  });


  it.each([
    ['merged remotely', {}, true],
    ['unreadable', { GH_RECONCILE_UNREADABLE: '1' }, false],
    ['still open', { GH_RECONCILE_OPEN: '1' }, false],
    ['changed head', { GH_RECONCILE_HEAD_DRIFT: '1' }, false],
    ['changed base', { GH_RECONCILE_BASE_DRIFT: '1' }, false],
  ])('classifies CLI checkout failure when PR is %s', (_case, flags, proven) => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const worktree = path.join(makeRoot(), 'main');
    git(root, ['worktree', 'add', worktree, 'main']);
    const args = ['merge', '--issue', '42', '--dir', 'specs/42-add-x'];
    const result = run(root, args, {
      ...env, GH_REMOTE_MERGE_FAIL: '1', GH_MAIN_WORKTREE: worktree, ...flags,
    });
    expect(result.status).not.toBe(0);
    if (proven) {
      expect(parse(result)).toMatchObject({
        reasonCode: 'default_checkout_failed', merged: true, pr: 99,
      });
      expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).toContain('issue edit 42 --add-label spec-created');
      expect(git(root, ['branch', '--show-current']).trim()).toBe('42-add-x');
      expect(git(worktree, ['branch', '--show-current']).trim()).toBe('main');
      const second = run(root, args, { ...env, GH_MAIN_WORKTREE: worktree });
      expect(parse(second)).toMatchObject({ reasonCode: 'default_checkout_failed', merged: true, pr: 99 });
      const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
      expect(log.match(/pr create /g)).toHaveLength(1);
      expect(log.match(/pr merge 99 /g)).toHaveLength(1);
    } else {
      expect(parse(result)).toMatchObject({ reasonCode: 'pr_merge_failed' });
      expect(parse(result).merged).not.toBe(true);
      expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('issue edit 42 --add-label spec-created');
    }
  });
  it('does not label when the remote rejects the merge', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], {
      ...env, GH_MERGE_REJECT: '1',
    });
    expect(parse(result)).toMatchObject({ reasonCode: 'pr_merge_failed', pr: 99 });
    expect(parse(result).merged).not.toBe(true);
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('issue edit 42 --add-label spec-created');
  });
  it('merge rejects an unapproved package', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    fs.mkdirSync(path.join(root, 'specs', '42-add-x'), { recursive: true });
    fs.writeFileSync(path.join(root, 'specs', '42-add-x', 'requirements.md'), '**Issue**: #42\n**Status**: Draft\n');
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({ ok: false, reasonCode: 'spec_not_approved' });
  });
});
