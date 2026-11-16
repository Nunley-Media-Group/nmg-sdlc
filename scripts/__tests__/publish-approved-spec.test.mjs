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
  temporaryRoots.push(root, `${root}-wt`);
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
spec_sha() { git rev-parse -q --verify refs/heads/spec/42-add-x 2>/dev/null || git rev-parse HEAD; }
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
  if echo "$*" | grep -q -- '--head 42-add-x'; then
    printf '%s\\n' '[{"number":77}]'
    exit 0
  fi
  if [ "$GH_PRIOR_MERGED" = "1" ] && [ ! -f .remote-merged ] && echo "$*" | grep -q -- '--state all'; then
    printf '%s\\n' '[{"number":95,"state":"MERGED","headRefOid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},{"number":90,"state":"CLOSED","headRefOid":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]'
    exit 0
  fi
  if [ -f .remote-merged ] && echo "$*" | grep -q -- '--state all'; then
    sha=$(spec_sha)
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
      if [ -n "$GH_RULES_STATUS" ]; then
        if [ -n "$GH_RULES_STDOUT" ]; then printf '%s\\n' "$GH_RULES_STDOUT"; fi
        if [ -n "$GH_RULES_STDERR" ]; then printf '%s\\n' "$GH_RULES_STDERR" >&2; fi
        exit "$GH_RULES_STATUS"
      fi
      if [ "$GH_EXPECTED_MISSING" = "1" ] && [ "$GH_PROTECTED" != "1" ]; then
        printf '%s\\n' '[{"type":"required_status_checks","parameters":{"required_status_checks":[{"context":"guardrails"}]}}]'
      elif [ "$GH_STALE_UNSTABLE" = "1" ] || [ "$GH_BLOCKED_PENDING" = "1" ]; then
        printf '%s\\n' '[{"type":"required_status_checks","parameters":{"required_status_checks":[{"context":"contribution"}]}}]'
      else
        printf '%s\\n' '[]'
      fi
      exit 0 ;;
    */protection/required_status_checks)
      if [ -n "$GH_PROTECTION_STATUS" ]; then
        if [ -n "$GH_PROTECTION_STDOUT" ]; then printf '%s\\n' "$GH_PROTECTION_STDOUT"; fi
        if [ -n "$GH_PROTECTION_STDERR" ]; then printf '%s\\n' "$GH_PROTECTION_STDERR" >&2; fi
        exit "$GH_PROTECTION_STATUS"
      fi
      if [ "$GH_PROTECTED" = "1" ]; then
        printf '%s\\n' '{"contexts":["guardrails"],"checks":[{"context":"guardrails"}]}'
        exit 0
      fi
      printf '%s\\n' '{"message":"Branch not protected"}'
      exit 1 ;;
  esac
fi
if [ "$1" = "pr" ] && [ "$2" = "view" ] && [ "$4" = "--json" ] && [ "$5" = "files" ]; then
  # The PR's changed files are what the remote spec branch changes relative to the remote default branch.
  if [ "$GH_PR_FILES_UNREADABLE" = "1" ]; then printf '%s\\n' 'files unavailable' >&2; exit 1; fi
  if [ "$3" != "99" ] || [ "$6" != "--jq" ] || [ "$7" != ".files[].path" ]; then exit 1; fi
  git --git-dir="$(git remote get-url origin)" diff --name-only main...spec/42-add-x
  exit $?
fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  count=0
  if [ -f .pr-view-count ]; then count=$(cat .pr-view-count); fi
  count=$((count + 1))
  if [ "$GH_RECONCILE_UNREADABLE" = "1" ] && [ "$count" -ge 3 ]; then exit 1; fi
  printf '%s\\n' "$count" > .pr-view-count
  state=CLEAN
  if [ -n "$GH_MERGE_STATE" ]; then state="$GH_MERGE_STATE"; fi
  if [ "$GH_POLICY_BLOCK" = "1" ]; then state=BLOCKED; fi
  if [ "$GH_STALE_UNSTABLE" = "1" ] && [ "$count" -lt 3 ]; then state=UNSTABLE; fi
  if [ "$GH_PENDING_CI" = "1" ] && [ "$count" -lt 3 ]; then state=UNSTABLE; fi
  if [ "$GH_OPTIONAL_PENDING" = "1" ] && [ "$count" -lt 3 ]; then state=UNSTABLE; fi
  if [ "$GH_EXPECTED_MISSING" = "1" ] && [ "$count" -eq 2 ]; then state=UNSTABLE; fi
  if [ "$GH_BLOCKED_PENDING" = "1" ] && [ "$count" -lt 3 ]; then state=BLOCKED; fi
  printf '%s\\n' "$state" >> .pr-state-log
  sha=$(spec_sha)
  if [ "$GH_DRIFT_BRANCH" = "1" ] && [ "$count" -ge 2 ]; then prhead=other; else prhead=spec/42-add-x; fi
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
  prnumber=99
  if [ "$GH_DRIFT_NUMBER" = "1" ] && [ "$count" -ge 2 ]; then prnumber=98; fi
  printf '{"number":%s,"state":"%s","isDraft":%s,"headRefName":"%s","headRefOid":"%s","baseRefName":"%s","mergeStateStatus":"%s","url":"https://github.com/example/repo/pull/99"}\\n' "$prnumber" "$prstate" "$draft" "$prhead" "$sha" "$prbase" "$state"
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "checks" ]; then
  count=$(cat .pr-view-count)
  if [ "$4" = "--required" ] && [ -n "$GH_REQUIRED_CHECKS_STATUS" ]; then
    if [ -n "$GH_REQUIRED_CHECKS_STDOUT" ]; then printf '%s\\n' "$GH_REQUIRED_CHECKS_STDOUT"; fi
    if [ -n "$GH_REQUIRED_CHECKS_STDERR" ]; then printf '%s\\n' "$GH_REQUIRED_CHECKS_STDERR" >&2; fi
    exit "$GH_REQUIRED_CHECKS_STATUS"
  fi
  if [ "$4" != "--required" ] && [ -n "$GH_ALL_CHECKS_STATUS" ]; then
    if [ -n "$GH_ALL_CHECKS_STDOUT" ]; then printf '%s\\n' "$GH_ALL_CHECKS_STDOUT"; fi
    if [ -n "$GH_ALL_CHECKS_STDERR" ]; then printf '%s\\n' "$GH_ALL_CHECKS_STDERR" >&2; fi
    exit "$GH_ALL_CHECKS_STATUS"
  fi
  if [ "$GH_LATE_REQUIRED" = "1" ]; then
    if [ "$count" -ge 3 ]; then
      printf '%s\\n' '[{"name":"contribution","state":"SUCCESS","bucket":"pass"},{"name":"guardrails","state":"SUCCESS","bucket":"pass"}]'
    else
      printf '%s\\n' '[{"name":"contribution","state":"SUCCESS","bucket":"pass"}]'
    fi
    exit 0
  fi
  if [ "$GH_NO_REQUIRED" = "1" ] && [ "$4" = "--required" ]; then
    printf '%s\\n' "no required checks reported on the 'spec/42-add-x' branch" >&2
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
  if [ "$GH_LATE_REQUIRED" = "1" ] && [ "$(cat .pr-view-count)" -lt 3 ]; then
    printf '%s\\n' 'required status check expected' >&2
    exit 1
  fi
  if [ "$GH_PENDING_CI" = "1" ]; then
    count=0
    if [ -f .pr-view-count ]; then count=$(cat .pr-view-count); fi
    if [ "$count" -lt 4 ]; then printf '%s\\n' 'required status check expected' >&2; exit 1; fi
  fi
  if [ "$GH_MERGE_REJECT" = "1" ]; then
    printf '%s\\n' 'remote rejected merge' >&2
    exit 1
  fi
  if [ "$3" != "99" ]; then exit 1; fi
  tmp=$(mktemp -d)
  git clone -q -b main "$(git remote get-url origin)" "$tmp/clone" || exit 1
  git -C "$tmp/clone" merge -q --squash origin/spec/42-add-x >/dev/null || exit 1
  git -C "$tmp/clone" -c user.name=Test -c user.email=test@example.com commit -q -m "docs: approve spec squash" || exit 1
  git -C "$tmp/clone" push -q origin HEAD:main || exit 1
  rm -rf "$tmp"
  if [ "$GH_REMOTE_MERGE_FAIL" = "1" ]; then
    touch .remote-merged
    printf '%s\\n' 'failed to delete local branch spec/42-add-x' >&2
    exit 1
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
  // The gh stub's scratch files stay out of `git status`.
  fs.appendFileSync(path.join(root, '.git', 'info', 'exclude'), '.gh-log\n.pr-view-count\n.pr-state-log\n.remote-merged\n');
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
function prepareSpec(root, env) {
  const result = run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env);
  expect(result.status).toBe(0);
  return parse(result).worktree;
}

const MERGED = {
  ok: true,
  branch: 'spec/42-add-x',
  base: 'main',
  pr: 99,
  merged: true,
  squash: true,
  labeled: true,
  issue: 42,
  dir: 'specs/42-add-x',
  fastForwarded: true,
  remoteBranchDeleted: true,
  worktreeRemoved: true,
  cleanup: [],
};

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
    expect(git(root, ['status', '--porcelain'])).toBe('');
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
    expect(git(root, ['status', '--porcelain'])).toBe('?? specs/\n');
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


  function primaryState(root) {
    return {
      branch: git(root, ['branch', '--show-current']).trim(),
      head: git(root, ['rev-parse', 'HEAD']).trim(),
      status: git(root, ['status', '--porcelain']),
    };
  }

  it('prepare creates the spec worktree from the remote default branch and leaves a dirty primary checkout alone', () => {
    const { root, remote, env } = makeRepo();
    // The remote default branch is ahead of the primary checkout, which holds uncommitted work.
    const other = path.join(makeRoot(), 'clone');
    git(root, ['clone', '-q', '-b', 'main', remote, other]);
    fs.writeFileSync(path.join(other, 'remote-only.txt'), 'ahead\n');
    git(other, ['add', 'remote-only.txt']);
    git(other, ['commit', '-m', 'remote ahead']);
    git(other, ['push', 'origin', 'main']);
    const remoteHead = git(other, ['rev-parse', 'HEAD']).trim();
    fs.writeFileSync(path.join(root, 'README.md'), 'uncommitted\n');
    fs.writeFileSync(path.join(root, 'dirty.txt'), 'untracked\n');
    const before = primaryState(root);

    const result = run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env);

    expect(result.status).toBe(0);
    const output = parse(result);
    expect(output).toEqual({
      ok: true,
      branch: 'spec/42-add-x',
      worktree: expect.any(String),
      specDir: path.join(output.worktree, 'specs', '42-add-x'),
      created: true,
    });
    expect(path.isAbsolute(output.worktree)).toBe(true);
    expect(fs.realpathSync(output.worktree)).not.toBe(fs.realpathSync(root));
    expect(git(output.worktree, ['branch', '--show-current']).trim()).toBe('spec/42-add-x');
    expect(git(output.worktree, ['rev-parse', 'HEAD']).trim()).toBe(remoteHead);
    expect(primaryState(root)).toEqual(before);
    expect(before).toMatchObject({ branch: 'main', status: ' M README.md\n?? dirty.txt\n' });
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log).not.toContain('issue develop');
  });

  it('prepare reuses the spec worktree left by an earlier run', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);

    const again = run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env);

    expect(again.status).toBe(0);
    expect(parse(again)).toMatchObject({ ok: true, branch: 'spec/42-add-x', worktree: tree, created: false });
    expect(fs.existsSync(path.join(tree, 'specs', '42-add-x', 'requirements.md'))).toBe(true);
    expect(git(root, ['worktree', 'list', '--porcelain']).match(/^worktree /gm)).toHaveLength(2);
  });

  it('a dirty primary checkout publishes end to end and keeps its branch, HEAD, and status', () => {
    const { root, remote, env } = makeRepo();
    fs.writeFileSync(path.join(root, 'README.md'), 'uncommitted\n');
    const before = primaryState(root);
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    const args = ['--issue', '42', '--dir', 'specs/42-add-x'];

    const pushed = run(root, ['commit-push', ...args], env);
    const merged = run(root, ['merge', ...args], env);

    expect(parse(pushed)).toMatchObject({ ok: true, branch: 'spec/42-add-x', worktree: tree });
    expect(merged.status).toBe(0);
    expect(parse(merged)).toMatchObject({ ok: true, merged: true, fastForwarded: false, worktreeRemoved: true });
    expect(`${pushed.stdout}${merged.stdout}`).not.toMatch(/default_checkout_failed|branch_checkout_failed|dirty_tree/);
    expect(primaryState(root)).toEqual(before);
    expect(git(remote, ['ls-tree', '-r', '--name-only', 'main'])).toContain('specs/42-add-x/requirements.md');
  });

  it('publishes on spec/{N}-{slug} beside an open code pull request on {N}-{slug} without touching it', () => {
    const { root, env } = makeRepo();
    // The code branch is checked out in the primary checkout and its PR (#77 in the gh stub) is open.
    git(root, ['checkout', '-b', '42-add-x']);
    fs.writeFileSync(path.join(root, 'code.txt'), 'code\n');
    git(root, ['add', 'code.txt']);
    git(root, ['commit', '-m', 'feat: code']);
    git(root, ['push', '-u', 'origin', '42-add-x']);
    const before = primaryState(root);
    const codeRemote = git(root, ['rev-parse', 'origin/42-add-x']).trim();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    const args = ['--issue', '42', '--dir', 'specs/42-add-x'];

    expect(run(root, ['commit-push', ...args], env).status).toBe(0);
    const specHead = git(tree, ['rev-parse', 'HEAD']).trim();
    const merged = run(root, ['merge', ...args], env);

    expect(merged.status).toBe(0);
    expect(parse(merged)).toMatchObject({ ok: true, branch: 'spec/42-add-x', base: 'main', pr: 99, merged: true });
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log).toContain('pr list --head spec/42-add-x --base main');
    expect(log).toContain('pr create --base main --head spec/42-add-x --title docs: approve spec for #42');
    expect(log).toContain(`pr merge 99 --squash --match-head-commit ${specHead}`);
    expect(log).not.toContain('--head 42-add-x');
    expect(log).not.toMatch(/pr (?:merge|view|checks|close|edit) 77/);
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/main'])).not.toContain('code.txt');
    git(root, ['fetch', '--prune', 'origin']);
    expect(git(root, ['rev-parse', 'origin/42-add-x']).trim()).toBe(codeRemote);
    expect(primaryState(root)).toEqual(before);
  });

  it('commit-push names the worktree when the approved package was written into the invoking checkout', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);

    const result = run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env);

    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({
      ok: false,
      reasonCode: 'spec_outside_worktree',
      worktree: tree,
      specDir: path.join(tree, 'specs', '42-add-x'),
    });
    expect(git(root, ['status', '--porcelain'])).toBe('?? specs/\n');
  });

  it('commit-push stages only the spec dir with the exact subject and pushes HEAD', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    fs.writeFileSync(path.join(tree, 'specs', '42-add-x', 'tasks.md'), [
      '**Issue**: #42',
      '**Status**: Approved',
      '',
      '### T001: Create code',
      '',
      '**File(s)**: `src/not-yet-created.ts`',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(tree, 'README.md'), 'changed\n');
    fs.writeFileSync(path.join(tree, 'stray.txt'), 'untracked\n');
    git(tree, ['add', 'README.md']);
    const result = run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(result.status).toBe(0);
    expect(parse(result)).toMatchObject({
      ok: true,
      branch: 'spec/42-add-x',
      worktree: tree,
      pushed: true,
      skippedCommit: false,
    });
    expect(git(tree, ['log', '-1', '--pretty=%s']).trim()).toBe('docs: approve spec for #42');
    const names = git(tree, ['show', '--pretty=', '--name-only', 'HEAD']).trim().split('\n');
    expect(names.every((name) => name.startsWith('specs/42-add-x/'))).toBe(true);
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/spec/42-add-x'])).toContain('specs/42-add-x/requirements.md');
    expect(git(root, ['ls-remote', 'origin', 'refs/heads/42-add-x'])).toBe('');
    expect(git(tree, ['diff', '--cached', '--name-only']).trim()).toBe('README.md');
    expect(git(root, ['branch', '--show-current']).trim()).toBe('main');
  });

  it.each([
    ['unmatched', 'Prose with unmatched ` delimiter'],
    ['escaped', 'Prose with escaped \\` delimiter'],
  ])('commit-push accepts a valid declaration after an %s backtick', (_name, prose) => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    const specDir = path.join(tree, 'specs', '42-add-x');
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
    expect(git(tree, ['diff', '--cached', '--name-only'])).toBe('');
  });

  it('commit-push rejects an unapproved package', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    fs.mkdirSync(path.join(tree, 'specs', '42-add-x'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'specs', '42-add-x', 'requirements.md'), '**Issue**: #42\n**Status**: Draft\n');
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
    const tree = prepareSpec(root, env);
    const specDir = path.join(tree, 'specs', '42-add-x');
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
    expect(git(tree, ['diff', '--cached', '--name-only'])).toBe('');
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
    const tree = prepareSpec(root, env);
    const specDir = path.join(tree, 'specs', '42-add-x');
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
    expect(git(tree, ['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });

  it.each(['commit-push', 'merge'].flatMap((command) => [
    [command, 'HTML comment', ['<!-- unmatched ` -->'], 6],
    [command, 'HTML comment after astral prefix', ['😀<!-- unmatched ` -->'], 6],
    [command, 'tilde fence', ['~~~text', 'unmatched `', '~~~'], 8],
  ]))('%s ignores backticks in a %s before a hidden multiline span', (command, _name, prefix, line) => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    const specDir = path.join(tree, 'specs', '42-add-x');
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
    expect(git(tree, ['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });

  it.each(['commit-push', 'merge'])('%s rejects a declaration hidden by crossing multiline spans', (command) => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    const specDir = path.join(tree, 'specs', '42-add-x');
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
    expect(git(tree, ['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });

  it.each(['commit-push', 'merge'].flatMap((command) => [
    [command, 'bare level-two', '##'],
    [command, 'bare level-three', '###'],
  ]))('%s rejects metadata after a %s task boundary before side effects', (command, _name, boundary) => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    const specDir = path.join(tree, 'specs', '42-add-x');
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
    expect(git(tree, ['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });


  it.each(['commit-push', 'merge'])('%s rejects invalid File(s) before publication side effects', (command) => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    const specDir = path.join(tree, 'specs', '42-add-x');
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
    expect(git(tree, ['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });

  it.each(['commit-push', 'merge'])('%s validates the spec worktree package, not the invoking checkout', (command) => {
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
    expect(git(root, ['branch', '--show-current']).trim()).toBe('other');
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr create');
  });

  it('commit-push skips an identical tree and still pushes', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const first = git(tree, ['rev-parse', 'HEAD']).trim();
    const second = run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(second.status).toBe(0);
    expect(parse(second)).toMatchObject({
      ok: true,
      skippedCommit: true,
      commit: null,
      pushed: true,
    });
    expect(git(tree, ['rev-parse', 'HEAD']).trim()).toBe(first);
  });

  it('merge publishes a revised spec through a new PR after an earlier spec PR merged at another head (#560 AC3)', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], { ...env, GH_PRIOR_MERGED: '1' });
    expect(result.status).toBe(0);
    expect(parse(result)).toEqual(MERGED);
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).toContain('pr create --base main --head spec/42-add-x');
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/main'])).toContain('specs/42-add-x/requirements.md');
  });

  it('merge reports the latest earlier spec PR when the package already equals the default branch\'s (#560 AC3)', () => {
    const { root, env } = makeRepo();
    const first = prepareSpec(root, env);
    writeApproved(path.join(first, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    expect(run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    fs.writeFileSync(path.join(root, '.gh-log'), '');
    // Published again with no change: the spec worktree is recreated from the default branch, which holds the package.
    prepareSpec(root, env);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const again = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], { ...env, GH_PRIOR_MERGED: '1' });
    expect(again.status).toBe(0);
    expect(parse(again)).toMatchObject({ ok: true, pr: 95, merged: true, issue: 42 });
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log).not.toContain('pr create');
    expect(log).not.toContain('pr merge');
  });

  it('merge squash-merges a docs-only PR into the default branch without Closes', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(result.status).toBe(0);
    expect(parse(result)).toEqual(MERGED);
    // The clean primary checkout on the default branch is fast-forwarded in place, never checked out.
    expect(git(root, ['branch', '--show-current']).trim()).toBe('main');
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(git(root, ['rev-parse', 'origin/main']).trim());
    expect(fs.existsSync(path.join(root, 'specs', '42-add-x', 'requirements.md'))).toBe(true);
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/main'])).toContain('specs/42-add-x/requirements.md');
    // The spec worktree, its local branch, and the remote spec branch are gone.
    expect(fs.existsSync(tree)).toBe(false);
    expect(git(root, ['worktree', 'list', '--porcelain']).match(/^worktree /gm)).toHaveLength(1);
    expect(git(root, ['branch', '--list', 'spec/42-add-x'])).toBe('');
    expect(git(root, ['ls-remote', '--heads', 'origin', 'spec/42-add-x'])).toBe('');
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log).toContain('pr create --base main --head spec/42-add-x --title docs: approve spec for #42');
    expect(log).not.toMatch(/Closes #42|Fixes #42|Resolves #42/i);
    expect(log).toMatch(/pr merge 99 --squash --match-head-commit [0-9a-f]{40}$/m);
    expect(log).toContain('issue edit 42 --add-label spec-created');
  });
  it('waits for unreported and pending required CI before an exact-head merge', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const head = git(tree, ['rev-parse', 'HEAD']).trim();
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], { ...env, GH_PENDING_CI: '1' });
    expect(result.status).toBe(0);
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log.match(/pr checks 99 --required/g)).toHaveLength(4);
    expect(log).toContain(`pr merge 99 --squash --match-head-commit ${head}`);
    expect(log.match(/pr merge 99/g)).toHaveLength(1);
  });

  it('waits for reported CI when the branch declares no required checks', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
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
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
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
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const head = git(tree, ['rev-parse', 'HEAD']).trim();
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
    expect(log).toContain(`pr merge 99 --squash --match-head-commit ${head}`);
  });

  it.each([
    ['ruleset', {}],
    ['branch protection', { GH_PROTECTED: '1' }],
  ])('does not merge a CLEAN PR while a %s check is not reported', (_policy, flags) => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
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
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], { ...env, ...flags });
    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({ ok: false, reasonCode, pr: 99, ...evidence });
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('pr merge 99');
  });

  it('waits through stale UNSTABLE on an existing PR before two passing CLEAN views', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const head = git(tree, ['rev-parse', 'HEAD']).trim();
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], {
      ...env, GH_EXISTING_PR: '1', GH_STALE_UNSTABLE: '1',
    });
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(result.status).toBe(0);
    expect(parse(result)).toMatchObject({ ok: true, pr: 99, merged: true });
    expect(log).not.toContain('pr create');
    // Readiness snapshots only: the one changed-files read (`--json files`) is not a snapshot.
    expect(log.match(/pr view 99 --json number,state,isDraft/g)).toHaveLength(4);
    expect(log.match(/pr checks 99 --required/g)).toHaveLength(4);
    expect(fs.readFileSync(path.join(root, '.pr-state-log'), 'utf8').trim().split('\n'))
      .toEqual(['UNSTABLE', 'UNSTABLE', 'CLEAN', 'CLEAN']);
    expect(log.match(/pr merge 99/g)).toHaveLength(1);
    expect(log).toContain(`pr merge 99 --squash --match-head-commit ${head}`);
  });

  it('reuses the existing spec PR and merges only its exact head', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const head = git(tree, ['rev-parse', 'HEAD']).trim();
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], { ...env, GH_EXISTING_PR: '1' });
    expect(result.status).toBe(0);
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log).not.toContain('pr create');
    expect(log).toContain(`pr merge 99 --squash --match-head-commit ${head}`);
  });

  describe('spec pull request scope (#551 AC2, FR2)', () => {
    const ARGS = ['--issue', '42', '--dir', 'specs/42-add-x'];
    const FILES_READ = 'pr view 99 --json files --jq .files[].path';
    const ghLog = (root) => fs.readFileSync(path.join(root, '.gh-log'), 'utf8').trim().split('\n');
    /** Commits `files` on the spec branch beside the approved package and publishes them, as a stray push would. */
    function pushOutside(tree, files) {
      for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(tree, file)), { recursive: true });
        fs.writeFileSync(path.join(tree, file), content);
      }
      git(tree, ['add', '--', ...Object.keys(files)]);
      git(tree, ['commit', '-m', 'feat: not part of the spec']);
      git(tree, ['push', 'origin', 'HEAD']);
    }

    it('merges a PR whose changed files are all under specs/{N}-{slug}/, reading them once before the merge', () => {
      const { root, remote, env } = makeRepo();
      const tree = prepareSpec(root, env);
      writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
      expect(run(root, ['commit-push', ...ARGS], env).status).toBe(0);
      // What the stub reports is what the remote branch really changes.
      expect(git(remote, ['diff', '--name-only', 'main...spec/42-add-x']).trim().split('\n')).toEqual(
        ['design.md', 'feature.gherkin', 'requirements.md', 'tasks.md'].map((name) => `specs/42-add-x/${name}`));

      const result = run(root, ['merge', ...ARGS], env);

      expect(result.status).toBe(0);
      expect(parse(result)).toEqual(MERGED);
      const log = ghLog(root);
      expect(log.filter((line) => line === FILES_READ)).toHaveLength(1);
      expect(log.indexOf(FILES_READ)).toBeLessThan(log.findIndex((line) => line.startsWith('pr merge 99 ')));
      expect(log.indexOf(FILES_READ)).toBeLessThan(log.findIndex((line) => line.startsWith('pr checks 99 ')));
      // The pull request is only ever looked up on the spec branch.
      const lookups = log.filter((line) => line.startsWith('pr list '));
      expect(lookups.length).toBeGreaterThan(0);
      for (const line of lookups) expect(line).toMatch(/^pr list --head spec\/42-add-x --base main /);
    });

    it.each([
      ['a new', {}],
      ['an existing', { GH_EXISTING_PR: '1' }],
    ])('refuses %s PR with a file outside the spec directory, naming it, and never merges', (_case, flags) => {
      const { root, remote, env } = makeRepo();
      const tree = prepareSpec(root, env);
      writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
      expect(run(root, ['commit-push', ...ARGS], env).status).toBe(0);
      // `specs/42-add-x-extra/` shares the directory's prefix but is another directory.
      pushOutside(tree, { 'src/code.js': 'export const code = 1;\n', 'specs/42-add-x-extra/notes.md': 'notes\n' });
      const mainBefore = git(remote, ['rev-parse', 'main']).trim();

      const result = run(root, ['merge', ...ARGS], { ...env, ...flags });

      expect(result.status).not.toBe(0);
      expect(parse(result)).toEqual({ ok: false, reasonCode: 'pr_scope_invalid', pr: 99,
        outside: ['specs/42-add-x-extra/notes.md', 'src/code.js'] });
      const log = ghLog(root);
      expect(log).toContain(FILES_READ);
      expect(log.filter((line) => /^pr (?:merge|checks) /.test(line))).toEqual([]);
      expect(log.filter((line) => line.startsWith('issue edit '))).toEqual([]);
      for (const line of log.filter((entry) => entry.startsWith('pr list '))) {
        expect(line).toMatch(/^pr list --head spec\/42-add-x --base main /);
      }
      // Nothing was merged or cleaned up: the default branch, the remote spec branch and the worktree are as they were.
      expect(git(remote, ['rev-parse', 'main']).trim()).toBe(mainBefore);
      expect(git(remote, ['rev-parse', 'spec/42-add-x']).trim()).toBe(git(tree, ['rev-parse', 'HEAD']).trim());
      expect(fs.existsSync(tree)).toBe(true);
    });

    it('fails closed with pr_readiness_failed and never merges when the changed files cannot be read', () => {
      const { root, env } = makeRepo();
      const tree = prepareSpec(root, env);
      writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
      expect(run(root, ['commit-push', ...ARGS], env).status).toBe(0);

      const result = run(root, ['merge', ...ARGS], { ...env, GH_PR_FILES_UNREADABLE: '1' });

      expect(result.status).not.toBe(0);
      expect(parse(result)).toMatchObject({ ok: false, reasonCode: 'pr_readiness_failed', pr: 99 });
      expect(ghLog(root).filter((line) => line.startsWith('pr merge '))).toEqual([]);
    });
  });

  it('reports a post-merge label failure without undoing the merge', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
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
      issue: 42,
      dir: 'specs/42-add-x',
      worktreeRemoved: true,
    });
    expect(git(root, ['branch', '--show-current']).trim()).toBe('main');
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/main'])).toContain('specs/42-add-x/requirements.md');
  });

  it.each([
    ['has diverged from the default branch', (root) => {
      fs.writeFileSync(path.join(root, 'local.txt'), 'local\n');
      git(root, ['add', 'local.txt']);
      git(root, ['commit', '-m', 'local only']);
    }, 'main'],
    ['is on another branch', (root) => git(root, ['checkout', '-b', 'other']), 'other'],
  ])('merge succeeds without a default-branch checkout when the primary checkout %s', (_case, arrange, branch) => {
    const { root, remote, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    arrange(root);
    const head = git(root, ['rev-parse', 'HEAD']).trim();

    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], env);

    expect(result.status).toBe(0);
    expect(parse(result)).toEqual({ ...MERGED, fastForwarded: false });
    expect(git(root, ['branch', '--show-current']).trim()).toBe(branch);
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(head);
    expect(git(remote, ['ls-tree', '-r', '--name-only', 'main'])).toContain('specs/42-add-x/requirements.md');
    expect(fs.existsSync(tree)).toBe(false);
    expect(git(root, ['branch', '--list', 'spec/42-add-x'])).toBe('');
  });

  it('a failed run keeps the spec worktree and the next run reuses it', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    const args = ['--issue', '42', '--dir', 'specs/42-add-x'];
    expect(run(root, ['commit-push', ...args], env).status).toBe(0);
    const head = git(tree, ['rev-parse', 'HEAD']).trim();

    const rejected = run(root, ['merge', ...args], { ...env, GH_MERGE_REJECT: '1' });

    expect(parse(rejected)).toMatchObject({ ok: false, reasonCode: 'pr_merge_failed' });
    expect(git(tree, ['rev-parse', 'HEAD']).trim()).toBe(head);
    expect(parse(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env)))
      .toMatchObject({ ok: true, worktree: tree, created: false });
    const retried = run(root, ['merge', ...args], { ...env, GH_EXISTING_PR: '1' });
    expect(parse(retried)).toMatchObject({ ok: true, merged: true, worktreeRemoved: true });
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).toContain(`pr merge 99 --squash --match-head-commit ${head}`);
  });

  it.each([
    ['merged remotely', {}, true],
    ['unreadable', { GH_RECONCILE_UNREADABLE: '1' }, false],
    ['still open', { GH_RECONCILE_OPEN: '1' }, false],
    ['changed head', { GH_RECONCILE_HEAD_DRIFT: '1' }, false],
    ['changed base', { GH_RECONCILE_BASE_DRIFT: '1' }, false],
  ])('classifies a nonzero merge CLI exit when PR is %s', (_case, flags, proven) => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const args = ['merge', '--issue', '42', '--dir', 'specs/42-add-x'];
    const result = run(root, args, { ...env, GH_REMOTE_MERGE_FAIL: '1', ...flags });
    if (proven) {
      expect(result.status).toBe(0);
      expect(parse(result)).toEqual(MERGED);
      expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).toContain('issue edit 42 --add-label spec-created');
      expect(fs.existsSync(tree)).toBe(false);
    } else {
      expect(result.status).not.toBe(0);
      expect(parse(result)).toMatchObject({ reasonCode: 'pr_merge_failed' });
      expect(parse(result).merged).not.toBe(true);
      expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('issue edit 42 --add-label spec-created');
      expect(fs.existsSync(tree)).toBe(true);
    }
  });
  it('does not label when the remote rejects the merge', () => {
    const { root, env } = makeRepo();
    const tree = prepareSpec(root, env);
    writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
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
    const tree = prepareSpec(root, env);
    fs.mkdirSync(path.join(tree, 'specs', '42-add-x'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'specs', '42-add-x', 'requirements.md'), '**Issue**: #42\n**Status**: Draft\n');
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({ ok: false, reasonCode: 'spec_not_approved' });
  });

  describe('with account-plan unavailable policy discovery', () => {
    const PLAN_SENTENCE = 'Upgrade to GitHub Pro or make this repository public to enable this feature.';
    const PLAN_BODY = JSON.stringify({ message: PLAN_SENTENCE, status: '403' });
    const unavailable = (source) => ({
      [`GH_${source}_STATUS`]: '1',
      [`GH_${source}_STDOUT`]: PLAN_BODY,
      [`GH_${source}_STDERR`]: `gh: ${PLAN_SENTENCE} (HTTP 403)`,
    });
    const BOTH_UNAVAILABLE = { ...unavailable('RULES'), ...unavailable('PROTECTION') };
    const RULES_REQUIRE_GUARDRAILS = {
      GH_RULES_STATUS: '0',
      GH_RULES_STDOUT: '[{"type":"required_status_checks","parameters":{"required_status_checks":[{"context":"guardrails"}]}}]',
    };
    const sourceResponse = (source, { status, stdout = '', stderr = '' }) => ({
      [`GH_${source}_STATUS`]: status,
      [`GH_${source}_STDOUT`]: stdout,
      [`GH_${source}_STDERR`]: stderr,
    });

    function mergeWith(flags) {
      const { root, env } = makeRepo();
      const tree = prepareSpec(root, env);
      writeApproved(path.join(tree, 'specs', '42-add-x'), 42);
      expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
      const head = git(tree, ['rev-parse', 'HEAD']).trim();
      const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], { ...env, ...flags });
      const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
      const stateLog = path.join(root, '.pr-state-log');
      const states = fs.existsSync(stateLog) ? fs.readFileSync(stateLog, 'utf8').trim().split('\n') : [];
      return { head, result, log, states };
    }

    function expectExactHeadMerge({ head, result, log }) {
      expect(result.status).toBe(0);
      expect(parse(result)).toEqual(MERGED);
      expect(log.match(/pr merge 99 /g)).toHaveLength(1);
      expect(log).toContain(`pr merge 99 --squash --match-head-commit ${head}`);
      const lines = log.trim().split('\n');
      expect(lines.findIndex((line) => line.startsWith('pr merge 99 ')))
        .toBeGreaterThan(lines.findLastIndex((line) => line.startsWith('pr view 99 ')));
    }

    it.each([
      ['branch rules', unavailable('RULES')],
      ['classic protection', unavailable('PROTECTION')],
      ['both policy sources', BOTH_UNAVAILABLE],
      ['branch rules without the gh prefix', {
        ...sourceResponse('RULES', { status: '1', stderr: `${PLAN_SENTENCE} (HTTP 403)` }),
      }],
    ])('continues readiness and merges the exact head when %s report the plan capability unavailable', (_source, flags) => {
      const merged = mergeWith(flags);
      expectExactHeadMerge(merged);
      expect(merged.states).toEqual(['CLEAN', 'CLEAN']);
      const lines = merged.log.trim().split('\n');
      const rules = lines.findIndex((line) => line.startsWith('api repos/example/repo/rules/branches/main'));
      const protection = lines.findIndex((line) => line.startsWith('api repos/example/repo/branches/main/protection/required_status_checks'));
      const checks = lines.findIndex((line) => line.startsWith('pr checks 99 --required'));
      expect(rules).toBeGreaterThanOrEqual(0);
      expect(protection).toBeGreaterThan(rules);
      expect(checks).toBeGreaterThan(protection);
    });

    const NON_CAPABILITY_FAILURES = [
      ['a permission failure', { status: '1', stderr: 'gh: Resource not accessible by integration (HTTP 403)' }],
      ['an authentication failure', { status: '1', stderr: 'gh: Bad credentials (HTTP 401)' }],
      ['a generic HTTP 403', { status: '1', stdout: '{"message":"Forbidden"}', stderr: 'gh: Forbidden (HTTP 403)' }],
      ['an ambiguous HTTP 404', { status: '1', stdout: '{"message":"Not Found"}', stderr: 'gh: Not Found (HTTP 404)' }],
      ['the capability sentence with HTTP 404', { status: '1', stderr: `gh: ${PLAN_SENTENCE} (HTTP 404)` }],
      ['the capability sentence inside another diagnostic', { status: '1', stderr: `warning: gh: ${PLAN_SENTENCE} (HTTP 403)` }],
      ['a network failure', { status: '1', stderr: 'error connecting to api.github.com' }],
      ['malformed successful data', { status: '0', stdout: '{' }],
      ['the capability sentence on a successful malformed response', {
        status: '0', stdout: '{', stderr: `gh: ${PLAN_SENTENCE} (HTTP 403)`,
      }],
    ];

    it.each([
      ...NON_CAPABILITY_FAILURES.map(([label, response]) => [`branch rules return ${label}`, sourceResponse('RULES', response), response]),
      ...NON_CAPABILITY_FAILURES.map(([label, response]) => [`classic protection returns ${label}`, sourceResponse('PROTECTION', response), response]),
      ['branch rules return a non-array payload', sourceResponse('RULES', { status: '0', stdout: '{"rules":[]}' }), {}],
      ['classic protection returns malformed checks', sourceResponse('PROTECTION', { status: '0', stdout: '{"contexts":"guardrails"}' }), {}],
      ['branch rules are unavailable and classic protection returns a generic HTTP 403', {
        ...unavailable('RULES'), ...sourceResponse('PROTECTION', { status: '1', stderr: 'gh: Forbidden (HTTP 403)' }),
      }, { stderr: 'gh: Forbidden (HTTP 403)' }],
      ['classic protection is unavailable and branch rules return a generic HTTP 403', {
        ...sourceResponse('RULES', { status: '1', stderr: 'gh: Forbidden (HTTP 403)' }), ...unavailable('PROTECTION'),
      }, { stderr: 'gh: Forbidden (HTTP 403)' }],
    ])('reports the discovery failure without merging when %s', (_case, flags, response) => {
      const { result, log } = mergeWith(flags);
      expect(result.status).not.toBe(0);
      const output = parse(result);
      expect(output).toMatchObject({ ok: false, reasonCode: 'pr_readiness_failed' });
      if (response.status !== '0' && response.stderr) expect(output.stderr).toContain(response.stderr);
      else expect(output.detail).toEqual(expect.any(String));
      expect(log).not.toContain('pr merge 99');
    });

    it.each([
      ['branch rules are unavailable and classic protection requires it', { ...unavailable('RULES'), GH_PROTECTED: '1' }],
      ['classic protection is unavailable and branch rules require it', { ...RULES_REQUIRE_GUARDRAILS, ...unavailable('PROTECTION') }],
      ['both policy sources are readable and require it', { ...RULES_REQUIRE_GUARDRAILS, GH_PROTECTED: '1' }],
    ])('waits for an unreported required check when %s', (_case, flags) => {
      const merged = mergeWith({ ...flags, GH_LATE_REQUIRED: '1' });
      expectExactHeadMerge(merged);
      expect(merged.states).toEqual(['CLEAN', 'CLEAN', 'CLEAN', 'CLEAN']);
      expect(merged.log.match(/pr checks 99 --required/g)).toHaveLength(4);
    });

    it.each([
      ['absent then pending checks', { GH_PENDING_CI: '1' }],
      ['pending unfiltered checks', { GH_OPTIONAL_PENDING: '1' }],
      ['stale UNSTABLE mergeability', { GH_EXISTING_PR: '1', GH_STALE_UNSTABLE: '1' }],
    ])('waits through %s for two fresh CLEAN snapshots at the unchanged head', (_case, flags) => {
      const merged = mergeWith({ ...BOTH_UNAVAILABLE, ...flags });
      expectExactHeadMerge(merged);
      expect(merged.states).toEqual(['UNSTABLE', 'UNSTABLE', 'CLEAN', 'CLEAN']);
      expect(merged.log.match(/pr view 99 --json number,state,isDraft/g)).toHaveLength(4);
    });

    it.each([
      ['pr_check_failed', 'a terminal failed check', { GH_FAILED_CI: '1' }, { check: { name: 'contribution', state: 'FAILURE' } }],
      ['pr_readiness_failed', 'an unknown check state', sourceResponse('REQUIRED_CHECKS', {
        status: '0', stdout: '[{"name":"contribution","state":"STALE","bucket":"pass"}]',
      }), { detail: 'unknown PR check state' }],
      ['pr_readiness_failed', 'malformed required checks', sourceResponse('REQUIRED_CHECKS', { status: '0', stdout: '{' }),
        { detail: 'checks returned invalid JSON' }],
      ['pr_readiness_failed', 'non-array reported checks', sourceResponse('ALL_CHECKS', { status: '0', stdout: '{"checks":[]}' }),
        { detail: 'checks unavailable' }],
      ['pr_readiness_failed', 'a required check query with the plan diagnostic', sourceResponse('REQUIRED_CHECKS', {
        status: '1', stderr: `gh: ${PLAN_SENTENCE} (HTTP 403)`,
      }), { detail: 'checks returned invalid JSON' }],
      ['pr_readiness_failed', 'a reported check query with the plan diagnostic', sourceResponse('ALL_CHECKS', {
        status: '1', stderr: `gh: ${PLAN_SENTENCE} (HTTP 403)`,
      }), { detail: 'checks returned invalid JSON' }],
      ['pr_readiness_failed', 'an unreadable reported check query', sourceResponse('ALL_CHECKS', {
        status: '4', stdout: '[]', stderr: 'gh: Bad credentials (HTTP 401)',
      }), { detail: 'checks unavailable', stderr: 'gh: Bad credentials (HTTP 401)\n' }],
      ['pr_head_changed', 'a changed head', { GH_DRIFT_HEAD: '1' }, { observed: { headRefOid: '0'.repeat(40) } }],
      ['pr_head_changed', 'a changed head branch', { GH_DRIFT_BRANCH: '1' }, { observed: { headRefName: 'other' } }],
      ['pr_head_changed', 'a changed base', { GH_DRIFT_BASE: '1' }, { observed: { baseRefName: 'other' } }],
      ['pr_head_changed', 'a changed PR number', { GH_DRIFT_NUMBER: '1' }, { observed: { number: 98 } }],
      ['pr_head_changed', 'a closed PR', { GH_CLOSED_PR: '1' }, { observed: { state: 'CLOSED' } }],
      ['pr_merge_blocked', 'a draft PR', { GH_DRAFT_PR: '1' }, { isDraft: true }],
      ['pr_merge_blocked', 'an explicit merge-policy blocker', { GH_POLICY_BLOCK: '1' }, { mergeStateStatus: 'BLOCKED' }],
      ['pr_merge_blocked', 'DIRTY mergeability', { GH_MERGE_STATE: 'DIRTY' }, { mergeStateStatus: 'DIRTY' }],
    ])('fails closed with %s on %s without merging', (reasonCode, _case, flags, evidence) => {
      const { result, log } = mergeWith({ ...BOTH_UNAVAILABLE, ...flags });
      expect(result.status).not.toBe(0);
      expect(parse(result)).toMatchObject({ ok: false, reasonCode, pr: 99, ...evidence });
      expect(log).not.toContain('pr merge 99');
    });
  });
});
