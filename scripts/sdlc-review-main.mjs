#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isCliEntry } from './plugin-controller-path.mjs';

const USAGE = 'Usage: node scripts/sdlc-review-main.mjs --issue N --step review1|review2 [--result review_failed]';
const REVIEW_STEPS = new Set(['review1', 'review2']);

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
    artifacts: status === 'passed' ? [artifactPath] : [],
    next: status === 'passed' ? (step === 'review1' ? 'fix1' : 'fix2') : null,
    reasonCode,
  };
}

export function runReviewMain({
  issue,
  step,
  cwd = process.cwd(),
  run = defaultRun,
  fs = { existsSync, mkdirSync, readFileSync, writeFileSync },
  result,
} = {}) {
  void run;
  const issueNumber = Number(issue);
  const artifactPath = `.omp/sdlc/reviews/${issueNumber}-${step}.md`;
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
  const fail = (summary) => writeHandoff(handoffFor(
    issueNumber,
    step,
    'failed',
    summary,
    artifactPath,
    'review_failed',
  ));

  if (result === 'review_failed') return fail(`Review ${step} failed for #${issueNumber}`);

  const absoluteArtifact = join(cwd, artifactPath);
  if (!fs.existsSync(absoluteArtifact)) {
    return fail(`Review artifact missing for #${issueNumber} ${step}`);
  }
  const artifact = fs.readFileSync(absoluteArtifact, 'utf8');
  if (!artifact.trim()) fs.writeFileSync(absoluteArtifact, 'No findings.\n');

  return writeHandoff(handoffFor(
    issueNumber,
    step,
    'passed',
    `Review ${step} completed for #${issueNumber}`,
    artifactPath,
  ));
}

function parseCli(argv) {
  let issue;
  let step;
  let result;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--issue' && issue === undefined && argv[index + 1] !== undefined) {
      issue = argv[index + 1];
      index += 1;
    } else if (argument === '--step' && step === undefined && argv[index + 1] !== undefined) {
      step = argv[index + 1];
      index += 1;
    } else if (argument === '--result' && result === undefined && argv[index + 1] !== undefined) {
      result = argv[index + 1];
      index += 1;
    } else {
      return null;
    }
  }
  const match = /^#?([1-9]\d*)$/.exec(issue || '');
  if (!match || !REVIEW_STEPS.has(step) || (result !== undefined && result !== 'review_failed')) return null;
  return { issue: Number(match[1]), step, result };
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (!options) {
    console.error(USAGE);
    return 2;
  }
  const outcome = runReviewMain(options);
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  return outcome.status;
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli();
