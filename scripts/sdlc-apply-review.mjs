#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'Usage: node scripts/sdlc-apply-review.mjs --issue N --step fix1|fix2 [--applied]';
const FIX_STEPS = new Set(['fix1', 'fix2']);

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function handoffFor(issue, step, status, summary, artifactPath, reasonCode = null) {
  return {
    schemaVersion: 1,
    issue,
    step,
    status,
    intervention: status !== 'passed',
    summary,
    artifacts: [artifactPath],
    next: status === 'passed' ? (step === 'fix1' ? 'review2' : 'verify') : null,
    reasonCode,
  };
}

function porcelainPaths(stdout) {
  const records = String(stdout || '').split('\0');
  const paths = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    const path = record.slice(3);
    if (path !== '.omp' && !path.startsWith('.omp/')) paths.push(path);
    if (status.includes('R') || status.includes('C')) index += 1;
  }
  return paths;
}

export function runApplyReview({
  issue,
  step,
  cwd = process.cwd(),
  run = defaultRun,
  fs = { existsSync, mkdirSync, readFileSync, writeFileSync },
  applied = false,
} = {}) {
  const issueNumber = Number(issue);
  const reviewStep = step === 'fix1' ? 'review1' : 'review2';
  const artifactPath = `.omp/sdlc/reviews/${issueNumber}-${reviewStep}.md`;
  const handoffPath = `.omp/sdlc/handoffs/${issueNumber}-${step}.json`;
  const writeHandoff = (handoff) => {
    const absolutePath = join(cwd, handoffPath);
    const directory = dirname(absolutePath);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(absolutePath, `${JSON.stringify(handoff, null, 2)}\n`);
    return {
      status: handoff.status === 'passed' ? 0 : 1,
      stdout: `NMG_SDLC_HANDOFF: ${handoffPath}\n`,
      stderr: '',
      handoff,
      handoffPath,
    };
  };
  const fail = (summary, reasonCode) => writeHandoff(handoffFor(
    issueNumber,
    step,
    'failed',
    summary,
    artifactPath,
    reasonCode,
  ));
  const pass = (summary) => writeHandoff(handoffFor(
    issueNumber,
    step,
    'passed',
    summary,
    artifactPath,
  ));

  const absoluteArtifact = join(cwd, artifactPath);
  if (!fs.existsSync(absoluteArtifact)) {
    return fail(`Review artifact missing for #${issueNumber} ${reviewStep}`, 'review_artifact_missing');
  }
  const findings = fs.readFileSync(absoluteArtifact, 'utf8').trim();
  if (!findings || findings === 'No findings.') {
    return pass(`No ${reviewStep} findings to apply for #${issueNumber}`);
  }
  if (!applied) {
    const packet = {
      schemaVersion: 1,
      kind: 'apply_review_required',
      issue: issueNumber,
      step,
      artifactPath,
      handoffPath,
    };
    return {
      status: 3,
      stdout: `NMG_SDLC_APPLY_REVIEW: ${JSON.stringify(packet)}\n`,
      stderr: '',
      handoff: null,
      handoffPath,
    };
  }

  const status = run('git', ['status', '--porcelain=v1', '-z'], { cwd });
  if (status?.status !== 0) return fail(`Failed to inspect review fixes for #${issueNumber}`, 'apply_review_failed');
  const paths = porcelainPaths(status.stdout);
  if (paths.length === 0) return pass(`No ${reviewStep} changes to commit for #${issueNumber}`);

  const add = run('git', ['add', '--', ...paths], { cwd });
  if (add?.status !== 0) return fail(`Failed to stage ${reviewStep} fixes for #${issueNumber}`, 'apply_review_failed');
  const commit = run('git', ['commit', '-m', `fix: apply ${reviewStep} findings for #${issueNumber}`], { cwd });
  if (commit?.status !== 0) return fail(`Failed to commit ${reviewStep} fixes for #${issueNumber}`, 'apply_review_failed');
  const push = run('git', ['push'], { cwd });
  if (push?.status !== 0) return fail(`Failed to push ${reviewStep} fixes for #${issueNumber}`, 'apply_review_failed');
  return pass(`Applied and pushed ${reviewStep} findings for #${issueNumber}`);
}

function parseCli(argv) {
  let issue;
  let step;
  let applied = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--issue' && issue === undefined && argv[index + 1] !== undefined) {
      issue = argv[index + 1];
      index += 1;
    } else if (argument === '--step' && step === undefined && argv[index + 1] !== undefined) {
      step = argv[index + 1];
      index += 1;
    } else if (argument === '--applied' && !applied) {
      applied = true;
    } else {
      return null;
    }
  }
  const match = /^#?([1-9]\d*)$/.exec(issue || '');
  if (!match || !FIX_STEPS.has(step)) return null;
  return { issue: Number(match[1]), step, applied };
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (!options) {
    console.error(USAGE);
    return 2;
  }
  const outcome = runApplyReview(options);
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  return outcome.status;
}

const isMainModule = process.argv[1]
  && pathResolve(process.argv[1]) === pathResolve(fileURLToPath(import.meta.url));
if (isMainModule) process.exitCode = runCli();
