#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  createIssueDependencyClient,
  issueDependencyStatus,
  readDependencyGraph,
} from './issue-dependencies.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import { untrackNmgSdlcRuntime } from './nmg-sdlc-ignore.mjs';
import { ensureWorktree } from './sdlc-worktree.mjs';

const USAGE = 'Usage: node scripts/start-issue.mjs --issue N';

export function slugFromTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'issue';
}

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function handoffFor(issue, status, summary, reasonCode = null, branch = null, head = null, worktree = null) {
  const h = {
    schemaVersion: 1,
    issue,
    step: 'start',
    status,
    intervention: status !== 'passed',
    summary,
    artifacts: [],
    next: status === 'passed' ? 'implement' : null,
    reasonCode,
  };
  if (status === 'passed' && branch && /^[0-9a-f]{40}$/i.test(String(head || ''))) {
    h.branch = branch;
    h.head = head;
    // The issue's own worktree, when the branch is not the invoking checkout's.
    if (worktree) h.worktree = worktree;
  }
  return h;
}

function parseJson(result) {
  if (!result || result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    return null;
  }
}

function projectStatusInProgress(issue, cwd, run) {
  const repository = parseJson(run('gh', ['repo', 'view', '--json', 'owner,name'], { cwd }));
  const owner = repository?.owner?.login;
  const name = repository?.name;
  if (!owner || !name) return;

  const query = 'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){projectItems(first:10){nodes{id project{id title} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{id options{id name}}}}}}}}}}}';
  const response = parseJson(run('gh', [
    'api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `repo=${name}`, '-F', `number=${issue}`,
  ], { cwd }));
  const items = response?.data?.repository?.issue?.projectItems?.nodes || [];
  for (const item of items) {
    const field = item?.fieldValueByName?.field;
    const option = field?.options?.find((candidate) => String(candidate?.name).toLowerCase() === 'in progress');
    if (!item?.project?.id || !item?.id || !field?.id || !option?.id) continue;
    const mutation = 'mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}){projectV2Item{id}}}';
    run('gh', [
      'api', 'graphql', '-f', `query=${mutation}`, '-f', `projectId=${item.project.id}`,
      '-f', `itemId=${item.id}`, '-f', `fieldId=${field.id}`, '-f', `optionId=${option.id}`,
    ], { cwd });
    return;
  }
}
function integrateDefaultHistory({ run, cwd, expectedBranch, issue }) {
  const defaultResult = run('gh', [
    'repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name',
  ], { cwd });
  const defaultBranch = defaultResult?.status === 0 ? String(defaultResult.stdout || '').trim() : '';
  if (!defaultBranch) return { status: 1, reasonCode: 'default_branch_unreadable' };
  if (defaultBranch === expectedBranch) return { status: 1, reasonCode: 'default_branch_unreadable' };
  const issueRef = `refs/remotes/origin/${expectedBranch}`;
  const defaultRef = `refs/remotes/origin/${defaultBranch}`;
  const issueFetched = run('git', [
    'fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${expectedBranch}:${issueRef}`,
  ], { cwd });
  if (issueFetched?.status !== 0) return issueFetched;
  const defaultFetched = run('git', [
    'fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${defaultBranch}:${defaultRef}`,
  ], { cwd });
  if (defaultFetched?.status !== 0) return defaultFetched;
  const defaultHeadResult = run('git', ['rev-parse', defaultRef], { cwd });
  const defaultHead = String(defaultHeadResult?.stdout || '').trim();
  if (defaultHeadResult?.status !== 0 || !/^[0-9a-f]{40}$/i.test(defaultHead)) {
    return { status: 1, reasonCode: 'default_branch_unreadable' };
  }
  const preRes = run('git', ['rev-parse', 'HEAD'], { cwd });
  const branchHead = String(preRes?.stdout || '').trim();
  if (!/^[0-9a-f]{40}$/i.test(branchHead)) {
    return { status: 1, reasonCode: 'branch_head_unreadable' };
  }
  const remoteAtRef = run('git', ['rev-parse', issueRef], { cwd });
  if (remoteAtRef?.status !== 0 || String(remoteAtRef.stdout || '').trim() !== branchHead) {
    return { status: 1, reasonCode: 'branch_checkout_failed' };
  }
  const issueAnc = run('git', [
    'merge-base', '--is-ancestor', issueRef, defaultHead,
  ], { cwd });
  if (issueAnc?.status === 0) {
    // normal merge-PR case: issue history ancestor of default, ff-only to bring default in
    const merged = run('git', ['merge', '--ff-only', defaultHead], { cwd });
    return merged?.status === 0 ? { status: 0, head: defaultHead, sourceHead: branchHead } : merged;
  }
  if (issueAnc?.status !== 1) return issueAnc;
  const defaultAnc = run('git', [
    'merge-base', '--is-ancestor', defaultHead, issueRef,
  ], { cwd });
  if (defaultAnc?.status === 0) {
    return { status: 0, head: branchHead, sourceHead: branchHead };
  }
  if (defaultAnc?.status !== 1) return defaultAnc;
  // divergent: neither ancestor (typical after squash-merge of approved spec PR)
  const specDir = `specs/${issue}-`;
  const listed = run('gh', [
    'pr', 'list', '--head', expectedBranch, '--base', defaultBranch, '--state', 'all',
    '--json', 'number,headRefOid,state', '--limit', '100',
  ], { cwd });
  const rows = parseJson(listed);
  if (!Array.isArray(rows)) return { status: 1, reasonCode: 'divergent_unproven' };
  const matching = rows.filter((row) =>
    row?.state === 'MERGED' && row.headRefOid === branchHead
    && Number.isSafeInteger(row.number) && row.number > 0);
  if (matching.length !== 1) return { status: 1, reasonCode: 'divergent_unproven' };
  const pr = parseJson(run('gh', [
    'pr', 'view', String(matching[0].number),
    '--json', 'number,state,headRefName,headRefOid,baseRefName,headRepository,headRepositoryOwner,mergeCommit,files',
  ], { cwd }));
  const repository = parseJson(run('gh', ['repo', 'view', '--json', 'owner,name'], { cwd }));
  const paths = pr?.files?.map((file) => file?.path);
  const expectedFiles = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];
  const approvedSpec = typeof paths?.[0] === 'string'
    ? paths[0].slice(0, paths[0].lastIndexOf('/'))
    : '';
  if (pr?.number !== matching[0].number || pr.state !== 'MERGED'
    || pr.headRefName !== expectedBranch || pr.headRefOid !== branchHead
    || pr.baseRefName !== defaultBranch
    || typeof repository?.owner?.login !== 'string'
    || pr.headRepositoryOwner?.login !== repository.owner.login
    || pr.headRepository?.name !== repository.name
    || !/^[0-9a-f]{40}$/i.test(pr.mergeCommit?.oid || '')
    || !approvedSpec.startsWith(specDir)
    || !Array.isArray(paths) || paths.length !== expectedFiles.length
    || new Set(paths).size !== expectedFiles.length
    || expectedFiles.some((file) => !paths.includes(`${approvedSpec}/${file}`))
    || run('git', ['merge-base', '--is-ancestor', pr.mergeCommit.oid, defaultHead], { cwd })?.status !== 0
    || expectedFiles.some((file) => {
      const path = `${approvedSpec}/${file}`;
      const old = run('git', ['show', `${branchHead}:${path}`], { cwd });
      const current = run('git', ['show', `${defaultHead}:${path}`], { cwd });
      const content = String(current?.stdout || '');
      const issues = [...content.matchAll(/^\*\*Issue\*\*:\s*#(\d+)\s*$/gm)];
      const statuses = [...content.matchAll(/^\*\*Status\*\*:\s*(\S+)\s*$/gm)];
      return old?.status !== 0 || current?.status !== 0 || old.stdout !== current.stdout
        || issues.length !== 1 || Number(issues[0][1]) !== issue
        || statuses.length !== 1 || statuses[0][1] !== 'Approved';
    })) {
    return { status: 1, reasonCode: 'divergent_unproven' };
  }
  const clean = run('git', ['status', '--porcelain', '-z'], { cwd });
  if (clean?.status !== 0 || String(clean.stdout || '').length) {
    return { status: 1, reasonCode: 'dirty_tree' };
  }
  const mergeRes = run('git', ['merge', '--no-edit', defaultHead], { cwd });
  if (mergeRes?.status !== 0) {
    run('git', ['merge', '--abort'], { cwd });
    return { status: 1, reasonCode: 'branch_reconcile_failed' };
  }
  const localNowRes = run('git', ['rev-parse', 'HEAD'], { cwd });
  const localNow = String(localNowRes?.stdout || '').trim();
  const parents = run('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { cwd });
  const parentHeads = String(parents?.stdout || '').trim().split(/\s+/);
  const postStatus = run('git', ['status', '--porcelain', '-z'], { cwd });
  const specDiff = run('git', ['diff', '--quiet', defaultHead, 'HEAD', '--', approvedSpec], { cwd });
  if (!/^[0-9a-f]{40}$/i.test(localNow)
    || parents?.status !== 0 || parentHeads.length !== 3
    || parentHeads[0] !== localNow || parentHeads[1] !== branchHead
    || parentHeads[2] !== defaultHead
    || postStatus?.status !== 0 || String(postStatus.stdout || '').length
    || specDiff?.status !== 0) {
    return { status: 1, reasonCode: 'branch_reconcile_failed' };
  }
  return { status: 0, head: localNow, sourceHead: branchHead };
}


export function startIssue({
  issue,
  cwd = process.cwd(),
  run = defaultRun,
  fs = { mkdirSync, writeFileSync, existsSync, readFileSync },
} = {}) {
  const issueNumber = Number(issue);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return handoffFor(issueNumber, 'failed', 'start-issue requires explicit #N argument', 'no_issue_number');
  }

  const handoffPath = join(cwd, '.nmg-sdlc', 'handoffs', `${issueNumber}-start.json`);
  const writeHandoff = (handoff) => {
    const directory = dirname(handoffPath);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);
    return { handoff, handoffPath: `.nmg-sdlc/handoffs/${issueNumber}-start.json` };
  };
  const fail = (summary, reasonCode) => writeHandoff(handoffFor(issueNumber, 'failed', summary, reasonCode));

  const issueData = parseJson(run('gh', ['issue', 'view', String(issueNumber), '--json', 'number,title,body,labels,state'], { cwd }));
  const issueState = typeof issueData?.state === 'string' ? issueData.state.toUpperCase() : null;
  if (issueData?.number !== issueNumber || (issueState !== 'OPEN' && issueState !== 'CLOSED')) {
    return fail(`GitHub issue #${issueNumber} is unreadable`, 'issue_unreadable');
  }
  if (issueState === 'CLOSED') {
    return fail(`GitHub issue #${issueNumber} is CLOSED`, 'issue_closed');
  }

  let dependency;
  try {
    const dependencyClient = createIssueDependencyClient({ cwd, run });
    const graph = readDependencyGraph(dependencyClient, [issueNumber]);
    dependency = issueDependencyStatus(graph, issueNumber);
  } catch (error) {
    return fail(error?.message || 'Official blocked-by evidence is unreadable', error?.reasonCode || 'dependency_unreadable');
  }
  if (dependency.status !== 'eligible') {
    return fail(
      `Issue #${issueNumber} cannot start: ${dependency.reasonCode}`,
      dependency.reasonCode || 'dependency_unreadable',
    );
  }
  const expectedBranch = `${issueNumber}-${slugFromTitle(issueData.title)}`;
  const branchResult = run('git', ['branch', '--show-current'], { cwd });
  const currentBranch = branchResult?.status === 0 ? String(branchResult.stdout || '').trim() : '';
  // A checkout already on the issue branch is used in place. Any other checkout is left exactly as it is, clean or
  // not: the issue gets its own worktree, created from the remote issue branch or the remote default branch.
  let workdir = cwd;
  if (currentBranch !== expectedBranch) {
    const defaultResult = run('gh', ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'], { cwd });
    const defaultBranch = defaultResult?.status === 0 ? String(defaultResult.stdout || '').trim() : '';
    if (!defaultBranch || defaultBranch === expectedBranch) return fail('Repository default branch is unreadable', 'default_branch_unreadable');
    const remoteRef = `refs/remotes/origin/${expectedBranch}`;
    const known = run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${expectedBranch}`], { cwd })?.status === 0
      || run('git', ['fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${expectedBranch}:${remoteRef}`], { cwd })?.status === 0;
    // A new branch is created on the remote, linked to the issue, without checking anything out here.
    if (!known) run('gh', ['issue', 'develop', String(issueNumber), '--name', expectedBranch, '--base', defaultBranch], { cwd });
    try {
      workdir = ensureWorktree({ cwd, branch: expectedBranch, base: defaultBranch, run }).path;
    } catch (error) {
      const reasonCode = ['worktree_setup_failed', 'default_branch_unreadable'].includes(error?.reasonCode)
        ? error.reasonCode : 'branch_checkout_failed';
      return fail(`Failed to prepare a worktree for ${expectedBranch}: ${error?.message ?? 'unknown'}`, reasonCode);
    }
    const checkedOut = String(run('git', ['branch', '--show-current'], { cwd: workdir })?.stdout || '').trim();
    if (checkedOut !== expectedBranch) return fail(`Worktree ${workdir} is not on ${expectedBranch}`, 'branch_checkout_failed');
    // A branch that exists only locally is published so its exact head can be proven.
    if (run('git', ['fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${expectedBranch}:${remoteRef}`], { cwd: workdir })?.status !== 0
      && run('git', ['push', '-u', 'origin', `${expectedBranch}:refs/heads/${expectedBranch}`], { cwd: workdir })?.status !== 0) {
      return fail(`Failed to publish ${expectedBranch}`, 'branch_push_failed');
    }
  }
  const untrack = untrackNmgSdlcRuntime({ cwd: workdir, run, fs });
  if (!untrack.ok) {
    return fail('Failed to untrack plugin runtime under .nmg-sdlc', 'runtime_untrack_failed');
  }
  if (run('git', ['status', '--porcelain', '-z'], { cwd: workdir })?.status !== 0) {
    return fail(`Working tree status of ${expectedBranch} is unreadable`, 'dirty_tree');
  }
  const integrated = integrateDefaultHistory({ run, cwd: workdir, expectedBranch, issue: issueNumber });
  if (integrated?.reasonCode === 'default_branch_unreadable') {
    return fail('Repository default branch is unreadable', integrated.reasonCode);
  }
  if (integrated?.status !== 0) {
    return fail(`Failed to refresh ${expectedBranch}`, integrated?.reasonCode || 'branch_checkout_failed');
  }
  const remoteRef = `refs/remotes/origin/${expectedBranch}`;
  const fetched = run('git', [
    'fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${expectedBranch}:${remoteRef}`,
  ], { cwd: workdir });
  const localHead = run('git', ['rev-parse', 'HEAD'], { cwd: workdir });
  const remoteHead = fetched?.status === 0 ? run('git', ['rev-parse', remoteRef], { cwd: workdir }) : null;
  const head = String(localHead?.stdout || '').trim();
  if (!/^[0-9a-f]{40}$/i.test(head) || head !== integrated.head
    || !/^[0-9a-f]{40}$/i.test(integrated.sourceHead) || remoteHead?.status !== 0) {
    return fail(`Failed to prove exact head of ${expectedBranch}`, 'branch_checkout_failed');
  }
  const observedRemote = String(remoteHead.stdout || '').trim();
  if (observedRemote !== integrated.sourceHead && observedRemote !== head) {
    return fail(`Origin ${expectedBranch} moved during reconciliation`, 'branch_checkout_failed');
  }
  if (observedRemote !== head) {
    if (run('git', ['merge-base', '--is-ancestor', observedRemote, head], { cwd: workdir })?.status !== 0
      || run('git', ['push', 'origin', `${head}:refs/heads/${expectedBranch}`], { cwd: workdir })?.status !== 0
      || run('git', [
        'fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${expectedBranch}:${remoteRef}`,
      ], { cwd: workdir })?.status !== 0
      || String(run('git', ['rev-parse', remoteRef], { cwd: workdir })?.stdout || '').trim() !== head) {
      return fail(`Failed to synchronize ${expectedBranch}`, 'branch_push_failed');
    }
  }

  try {
    projectStatusInProgress(issueNumber, workdir, run);
  } catch {
    // Project status is best-effort and never blocks branch preparation.
  }

  const finalBranch = run('git', ['branch', '--show-current'], { cwd: workdir });
  const finalHead = run('git', ['rev-parse', 'HEAD'], { cwd: workdir });
  if (finalBranch?.status !== 0 || String(finalBranch.stdout || '').trim() !== expectedBranch
    || finalHead?.status !== 0 || String(finalHead.stdout || '').trim() !== head) {
    return fail(`Branch ${expectedBranch} moved before start handoff`, 'branch_checkout_failed');
  }
  return writeHandoff(handoffFor(issueNumber, 'passed', `Branch ready for #${issueNumber}`, null, expectedBranch, head, workdir === cwd ? null : workdir));
}

function runCli(argv = process.argv.slice(2)) {
  const issueIndex = argv.indexOf('--issue');
  const rawIssue = issueIndex >= 0 ? argv[issueIndex + 1] : '';
  if (!/^[1-9]\d*$/.test(rawIssue || '')) {
    console.error(USAGE);
    console.log(JSON.stringify({ reasonCode: 'no_issue_number', intervention: true, step: 'start' }));
    return 2;
  }

  const result = startIssue({ issue: Number(rawIssue) });
  console.log(`NMG_SDLC_HANDOFF: ${result.handoffPath}`);
  return result.handoff.status === 'passed' ? 0 : 1;
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli();
