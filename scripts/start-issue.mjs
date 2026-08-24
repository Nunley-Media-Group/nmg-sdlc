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
import {
  isAuthorizedOmpSdlcUntrackTransition,
  untrackOmpSdlcRuntime,
} from './omp-sdlc-ignore.mjs';

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

function handoffFor(issue, status, summary, reasonCode = null) {
  return {
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

  const handoffPath = join(cwd, '.omp', 'sdlc', 'handoffs', `${issueNumber}-start.json`);
  const writeHandoff = (handoff) => {
    const directory = dirname(handoffPath);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);
    return { handoff, handoffPath: `.omp/sdlc/handoffs/${issueNumber}-start.json` };
  };
  const fail = (summary, reasonCode) => writeHandoff(handoffFor(issueNumber, 'failed', summary, reasonCode));

  const issueData = parseJson(run('gh', ['issue', 'view', String(issueNumber), '--json', 'number,title,body,labels,state'], { cwd }));
  if (!issueData?.number || !issueData?.state) {
    return fail(`GitHub issue #${issueNumber} is unreadable`, 'issue_unreadable');
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
  const untrack = untrackOmpSdlcRuntime({ cwd, run, fs });
  if (!untrack.ok) {
    return fail('Failed to untrack plugin runtime under .omp/sdlc', 'runtime_untrack_failed');
  }


  const expectedBranch = `${issueNumber}-${slugFromTitle(issueData.title)}`;

  const branchResult = run('git', ['branch', '--show-current'], { cwd });
  const dirtyResult = run('git', ['status', '--porcelain', '-z'], { cwd });
  const currentBranch = branchResult?.status === 0 ? String(branchResult.stdout || '').trim() : '';
  const dirty = String(dirtyResult?.stdout || '');
  const authorizedUntrack = isAuthorizedOmpSdlcUntrackTransition(dirty, untrack);
  if (dirtyResult?.status !== 0 || (dirty && !authorizedUntrack && currentBranch !== expectedBranch)) {
    return fail(`Working tree is dirty and current branch is not ${expectedBranch}`, 'dirty_tree');
  }

  if (currentBranch !== expectedBranch) {
    const defaultResult = run('gh', ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'], { cwd });
    const defaultBranch = defaultResult?.status === 0 ? String(defaultResult.stdout || '').trim() : '';
    if (!defaultBranch) return fail('Repository default branch is unreadable', 'default_branch_unreadable');

    const checkout = run('gh', [
      'issue', 'develop', String(issueNumber), '--checkout', '--name', expectedBranch, '--base', defaultBranch,
    ], { cwd });
    const checkedOut = String(run('git', ['branch', '--show-current'], { cwd })?.stdout || '').trim();
    if (checkout?.status !== 0 || checkedOut !== expectedBranch) {
      return fail(`Failed to check out ${expectedBranch}`, 'branch_checkout_failed');
    }
  }

  try {
    projectStatusInProgress(issueNumber, cwd, run);
  } catch {
    // Project status is best-effort and never blocks branch preparation.
  }

  return writeHandoff(handoffFor(issueNumber, 'passed', `Branch ready for #${issueNumber}`));
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
