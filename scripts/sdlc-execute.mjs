#!/usr/bin/env node

/**
 * nmg-sdlc v3 execute helper.
 * Node ESM, zero runtime deps.
 * The execute skill invokes this for classification and state.
 * The agent in the main pane drives all Herdr commands.
 *
 * Exports support direct import by tests and the skill.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { parseBodyRelationships } from './epic-relationships.mjs';
import { workflowBody } from '../src/sdlc-workflows.mjs';

const __filename = fileURLToPath(import.meta.url);

const RUN_DIR = '.omp/sdlc';
const RUN_FILE = join(RUN_DIR, 'run.json');
const HANDOFF_DIR = join(RUN_DIR, 'handoffs');

const VALID_STEPS = ['start', 'implement', 'verify', 'deliver'];
const VALID_STATUSES = ['passed', 'failed', 'blocked'];
const REQUIRED_SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];
const STEP_SKILL = {
  start: 'start-issue',
  implement: 'write-code',
  verify: 'verify-code',
  deliver: 'open-pr',
};
const STEP_EXTRA_WORKFLOWS = {
  implement: ['simplify'],
  deliver: ['address-pr-comments'],
};

function usageError() {
  return 'Usage: /sdlc-execute [#N ...]';
}


export function parseArgs(input = '') {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    return { issues: [], defaultBacklog: true };
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const issues = [];
  const seen = new Set();
  for (const tok of tokens) {
    const m = tok.match(/^#?(\d+)$/);
    if (!m) {
      throw new Error(usageError());
    }
    const num = parseInt(m[1], 10);
    if (!seen.has(num)) {
      seen.add(num);
      issues.push(num);
    }
  }
  if (issues.length > 20) {
    throw new Error(usageError());
  }
  return { issues, defaultBacklog: false };
}

function getRepoContext() {
  const res = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner'], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error('gh repo view failed');
  }
  const { nameWithOwner } = JSON.parse(res.stdout || '{}');
  const [owner, name] = String(nameWithOwner || '').split('/');
  if (!owner || !name) throw new Error('cannot determine repo owner/name');
  return { owner, name };
}

function hydrateParentStates(parentNumbers) {
  const states = {};
  if (!parentNumbers || parentNumbers.length === 0) return states;
  const { owner, name } = getRepoContext();
  // try one GraphQL batch
  try {
    const aliases = parentNumbers.map((p) => `p${p}: issue(number: ${p}) { number state }`).join(' ');
    const query = `{ repository(owner: "${owner}", name: "${name}") { ${aliases} } }`;
    const gres = spawnSync('gh', ['api', 'graphql', '-f', `query=${query}`], { encoding: 'utf8' });
    if (gres.status === 0) {
      const data = JSON.parse(gres.stdout || '{}').data?.repository || {};
      for (const p of parentNumbers) {
        const key = `p${p}`;
        if (data[key] && data[key].state) {
          states[p] = data[key].state;
        }
      }
    }
  } catch {
    // fall through to per-issue views
  }
  // fill missing with gh issue view
  for (const p of parentNumbers) {
    if (states[p]) continue;
    const vres = spawnSync('gh', ['issue', 'view', String(p), '--json', 'state'], { encoding: 'utf8' });
    if (vres.status !== 0) {
      throw new Error(`gh issue view failed for parent #${p}`);
    }
    try {
      const d = JSON.parse(vres.stdout || '{}');
      if (d.state) states[p] = d.state;
    } catch {
      throw new Error(`failed to parse state for #${p}`);
    }
  }
  return states;
}

function allReadableProjectDone(projectItems) {
  if (!Array.isArray(projectItems) || projectItems.length === 0) return false;
  const readable = [];
  for (const item of projectItems) {
    if (!item || typeof item !== 'object') continue;
    let s = '';
    if (typeof item.statusName === 'string') s = item.statusName;
    else if (item.status && typeof item.status.name === 'string') s = item.status.name;
    else if (typeof item.title === 'string' && !item.itemId) s = item.title; // legacy shape guard
    const t = s.trim().toLowerCase();
    if (t) readable.push(t);
  }
  if (readable.length === 0) return false;
  return readable.every((s) => s === 'done');
}

export function selectBacklog(options) {
  if (options?.parentLookupError) {
    throw options.parentLookupError;
  }

  let listed;
  let parentStates;
  if (Array.isArray(options?.issues)) {
    listed = options.issues;
    parentStates = options.parentStates || {};
    const needed = new Set();
    for (const iss of listed) {
      for (const parent of parseBodyRelationships(iss.body || '').dependsOn || []) needed.add(parent);
    }
    for (const parent of needed) {
      if (!parentStates[parent]) {
        throw new Error(`unreadable parent state for #${parent}`);
      }
    }
  } else {
    const listRes = spawnSync(
      'gh',
      ['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,labels,body,projectItems'],
      { encoding: 'utf8' },
    );
    if (listRes.status !== 0) {
      throw new Error('gh issue list failed');
    }
    try {
      listed = JSON.parse(listRes.stdout || '[]');
    } catch {
      throw new Error('failed to parse gh issue list');
    }
    const parentNums = new Set();
    for (const iss of listed) {
      for (const parent of parseBodyRelationships(iss.body || '').dependsOn || []) parentNums.add(parent);
    }
    parentStates = hydrateParentStates([...parentNums]);
  }

  const candidates = [];
  for (const iss of listed) {
    const rel = parseBodyRelationships(iss.body || '');
    if ((rel.dependsOn || []).some((parent) => String(parentStates[parent] || '').toUpperCase() !== 'CLOSED')) {
      continue;
    }
    const statuses = options?.projectStatuses?.[iss.number]
      ?? (iss.projectItems || []).map((item) => item?.statusName || item?.status?.name || '');
    if (Array.isArray(options?.projectStatuses?.[iss.number])) {
      if (statuses.length > 0 && statuses.every((status) => String(status).trim().toLowerCase() === 'done')) {
        continue;
      }
    } else if (allReadableProjectDone(iss.projectItems || [])) {
      continue;
    }
    candidates.push(iss);
  }
  candidates.sort((a, b) => a.number - b.number);
  return candidates.length ? candidates[0].number : null;
}

export function resolveSpecDir(root, issueN) {
  if (!Number.isInteger(issueN) || issueN <= 0) return null;
  const specsDir = join(root || process.cwd(), 'specs');
  if (!existsSync(specsDir)) return null;
  let entries;
  try {
    entries = readdirSync(specsDir).filter((e) => {
      try {
        const st = statSync(join(specsDir, e));
        return st.isDirectory() && !st.isSymbolicLink();
      } catch {
        return false;
      }
    });
  } catch {
    return null;
  }
  const prefixRe = new RegExp(`^${issueN}-`);
  const matches = entries.filter((e) => prefixRe.test(e)).sort();
  if (matches.length !== 1) return null;
  return join(specsDir, matches[0]);
}

function parseFrontmatterStatusAndIssue(source, expectedIssue) {
  const issueMatch = source.match(/^\*\*Issue\*\*:\s*#(\d+)\s*$/m);
  const statusMatch = source.match(/^\*\*Status\*\*:\s*(Draft|Approved)\s*$/im);
  const issueNumber = issueMatch ? Number(issueMatch[1]) : null;
  const status = statusMatch ? statusMatch[1].trim().toLowerCase() : null;
  return {
    issueOk: issueNumber === expectedIssue,
    status,
  };
}

function readFrontmatterStatusAndIssue(filePath, expectedIssue) {
  if (!existsSync(filePath)) return { present: false };
  try {
    return {
      present: true,
      ...parseFrontmatterStatusAndIssue(readFileSync(filePath, 'utf8'), expectedIssue),
    };
  } catch {
    return { present: true, error: true };
  }
}

export function isSpecApproved(specDir, issueN) {
  if (!specDir || !existsSync(specDir)) return false;
  return REQUIRED_SPEC_FILES.every((name) => {
    const info = readFrontmatterStatusAndIssue(join(specDir, name), issueN);
    return info.present === true
      && info.error !== true
      && info.issueOk === true
      && info.status === 'approved';
  });
}

function gitForEachRef(root, pattern) {
  const result = spawnSync('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)', pattern], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function matchingIssueBranches(shortRefs, issueN, remotePrefix) {
  const prefixRe = new RegExp(`^${issueN}-`);
  const matches = [];
  for (const short of shortRefs) {
    const name = remotePrefix && short.startsWith(`${remotePrefix}/`)
      ? short.slice(remotePrefix.length + 1)
      : short;
    if (prefixRe.test(name)) {
      matches.push({ name, ref: short });
    }
  }
  return matches;
}

function specApprovedOnRef(root, ref, specRel, issueN) {
  return REQUIRED_SPEC_FILES.every((file) => {
    const result = spawnSync('git', ['-C', root, 'show', `${ref}:${specRel}/${file}`], {
      encoding: 'utf8',
    });
    if (result.status !== 0) return false;
    const info = parseFrontmatterStatusAndIssue(result.stdout, issueN);
    return info.issueOk === true && info.status === 'approved';
  });
}

export function specStatus(issueN, root = process.cwd()) {
  const dir = resolveSpecDir(root, issueN);
  if (dir) {
    return { dir, approved: isSpecApproved(dir, issueN) };
  }

  const local = matchingIssueBranches(gitForEachRef(root, 'refs/heads'), issueN);
  if (local.length > 1) return { dir: null, approved: false };

  const candidates = local.length === 1
    ? local
    : matchingIssueBranches(gitForEachRef(root, 'refs/remotes/origin'), issueN, 'origin');
  if (candidates.length !== 1) return { dir: null, approved: false };

  const { name, ref } = candidates[0];
  const specRel = `specs/${name}`;
  if (!specApprovedOnRef(root, ref, specRel, issueN)) {
    return { dir: null, approved: false };
  }
  return { dir: specRel, approved: true, ref };
}

export function validateHandoff(input) {
  let data = input;
  if (typeof input === 'string') {
    if (!input || !existsSync(input)) {
      throw new Error('handoff missing');
    }
    try {
      data = JSON.parse(readFileSync(input, 'utf8'));
    } catch {
      throw new Error('handoff malformed');
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('handoff invalid');
  }
  if (data.schemaVersion !== 1) throw new Error('handoff schemaVersion');
  if (!Number.isInteger(data.issue) || data.issue <= 0) throw new Error('handoff issue');
  if (!VALID_STEPS.includes(data.step)) throw new Error('handoff step');
  if (!VALID_STATUSES.includes(data.status)) throw new Error('handoff status');
  if (typeof data.intervention !== 'boolean') throw new Error('handoff intervention');
  if (typeof data.summary !== 'string') throw new Error('handoff summary');
  if (!Array.isArray(data.artifacts) || !data.artifacts.every((item) => typeof item === 'string')) {
    throw new Error('handoff artifacts');
  }
  if (data.next !== null && typeof data.next !== 'string') throw new Error('handoff next');
  if (data.reasonCode !== null && typeof data.reasonCode !== 'string') throw new Error('handoff reasonCode');
  return data;
}

export function readRun(root = process.cwd()) {
  const p = join(root, RUN_FILE);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    if (data && data.schemaVersion === 1) return data;
  } catch {
    // fallthrough
  }
  return null;
}

export function writeRun(runData, root = process.cwd()) {
  if (!runData || runData.schemaVersion !== 1) {
    throw new Error('invalid run schema');
  }
  const p = join(root, RUN_FILE);
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  if (!existsSync(HANDOFF_DIR)) mkdirSync(HANDOFF_DIR, { recursive: true });
  const content = JSON.stringify(runData, null, 2) + '\n';
  writeFileSync(p, content);
}

export function resolveSpecDirForIssue(root, issueN) {
  return resolveSpecDir(root, issueN);
}

export function nextStep(completedForIssue = []) {
  const order = ['start', 'implement', 'verify', 'deliver'];
  for (const step of order) {
    if (!completedForIssue.includes(step)) return step;
  }
  return null;
}

export function workerPrompt({ step, issue, skill } = {}) {
  if (!step || !VALID_STEPS.includes(step)) throw new Error('invalid step for workerPrompt');
  if (!Number.isInteger(issue) || issue <= 0) throw new Error('invalid issue for workerPrompt');
  const skillName = skill || STEP_SKILL[step];
  if (!skillName) throw new Error('no skill for step');
  const extras = STEP_EXTRA_WORKFLOWS[step] || [];
  const workflows = [workflowBody(skillName), ...extras.map(workflowBody)];
  return [
    `You are the nmg-sdlc ${step} worker for issue #${issue}.`,
    `Execute the following inlined workflow for #${issue} with no user questions.`,
    'Write the handoff file then stop.',
    '',
    `$ARGUMENTS: #${issue}`,
    `Handoff path: .omp/sdlc/handoffs/${issue}-${step}.json`,
    `On success print exactly: NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/${issue}-${step}.json`,
    '',
    ...workflows,
  ].join('\n');
}

function runCli(argv = process.argv.slice(2)) {
  const [sub, ...rest] = argv;
  if (!sub) {
    console.error('sdlc-execute: missing subcommand');
    process.exit(2);
  }
  if (sub === 'parse-args') {
    try {
      const res = parseArgs(rest.join(' '));
      console.log(JSON.stringify({ issues: res.issues || [], defaultBacklog: !!res.defaultBacklog }));
      process.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : usageError());
      process.exit(2);
    }
  }
  if (sub === 'backlog') {
    try {
      const n = selectBacklog();
      process.stdout.write(n != null ? `${n}\n` : '');
      process.exit(0);
    } catch (e) {
      console.error(String(e.message || e));
      process.exit(1);
    }
  }
  if (sub === 'spec-status') {
    const i = rest.indexOf('--issue');
    if (i < 0 || !rest[i + 1]) {
      console.error('Usage: node sdlc-execute.mjs spec-status --issue N');
      process.exit(2);
    }
    const n = parseInt(rest[i + 1], 10);
    if (!Number.isInteger(n) || n <= 0) {
      console.error('invalid issue');
      process.exit(2);
    }
    const out = specStatus(n);
    console.log(JSON.stringify(out));
    process.exit(0);
  }
  if (sub === 'validate-handoff') {
    const i = rest.indexOf('--file');
    if (i < 0 || !rest[i + 1]) {
      console.error('Usage: node sdlc-execute.mjs validate-handoff --file <path>');
      process.exit(2);
    }
    try {
      validateHandoff(rest[i + 1]);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  }
  if (sub === 'read-run') {
    const data = readRun();
    console.log(data ? JSON.stringify(data, null, 2) : 'null');
    process.exit(0);
  }
  if (sub === 'write-run') {
    const input = rest.join(' ');
    if (!input) {
      console.error('provide run json');
      process.exit(2);
    }
    try {
      const data = JSON.parse(input);
      writeRun(data);
      process.exit(0);
    } catch (e) {
      console.error('invalid json or schema for write-run');
      process.exit(1);
    }
  }
  if (sub === 'worker-prompt') {
    const stepIndex = rest.indexOf('--step');
    const issueIndex = rest.indexOf('--issue');
    const step = stepIndex >= 0 ? rest[stepIndex + 1] : '';
    const issueRaw = issueIndex >= 0 ? rest[issueIndex + 1] : '';
    const issue = Number.parseInt(issueRaw, 10);
    if (!VALID_STEPS.includes(step) || !Number.isInteger(issue) || issue <= 0) {
      console.error('Usage: node sdlc-execute.mjs worker-prompt --step <start|implement|verify|deliver> --issue N');
      process.exit(2);
    }
    try {
      process.stdout.write(`${workerPrompt({ step, issue })}\n`);
      process.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    }
  }
  console.error(`unknown subcommand: ${sub}`);
  process.exit(2);
}

const isMainModule =
  process.argv[1] && pathResolve(process.argv[1]) === pathResolve(__filename);

if (isMainModule) {
  runCli(process.argv.slice(2));
}
