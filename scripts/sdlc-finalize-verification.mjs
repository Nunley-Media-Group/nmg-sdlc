#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { inspectVerificationReadiness } from './verification-readiness.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import { enterControllerLease, releaseControllerLease } from './sdlc-controller-lease.mjs';

const USAGE = 'Usage: node scripts/sdlc-finalize-verification.mjs --issue N --spec specs/N-SLUG [--controller-run-id ID]';

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function commandSucceeded(result) {
  return result && !result.error && result.status === 0;
}

function porcelainPaths(output) {
  const entries = String(output ?? '').split('\0');
  const paths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2)) && entries[index + 1]) paths.push(entries[index += 1]);
  }
  return paths.filter((path) => !path.startsWith('.omp/'));
}

function handoff(issue, status, summary, reportPath, reasonCode = null, options = {}) {
  const passed = status === 'passed';
  return {
    schemaVersion: 1,
    issue,
    step: 'verify',
    status,
    intervention: options.intervention ?? (status !== 'passed'),
    summary,
    artifacts: options.artifacts ?? (passed ? [reportPath] : []),
    next: passed ? 'deliver' : null,
    reasonCode,
  };
}

function finalizeVerificationUnlocked({
  issue,
  spec,
  cwd = process.cwd(),
  run = defaultRun,
  fs = { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync },
} = {}) {
  const issueNumber = Number(issue);
  const specPath = String(spec ?? '').split('\\').join('/').replace(/\/$/, '');
  const reportPath = `${specPath}/verification-report.md`;
  const handoffPath = `.omp/sdlc/handoffs/${issueNumber}-verify.json`;
  const writeHandoff = (value) => {
    const absolute = join(cwd, handoffPath);
    if (!fs.existsSync(dirname(absolute))) fs.mkdirSync(dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
    return { status: value.status === 'passed' ? 0 : 1, stdout: `NMG_SDLC_HANDOFF: ${handoffPath}\n`, stderr: '', handoff: value, handoffPath };
  };
  const fail = (reasonCode, summary, options) => writeHandoff(handoff(issueNumber, 'failed', summary, reportPath, reasonCode, options));

  if (!Number.isInteger(issueNumber) || issueNumber <= 0 || isAbsolute(specPath)
    || !new RegExp(`^specs/${issueNumber}-[^/]+$`).test(specPath)) {
    return { status: 2, stdout: '', stderr: `${USAGE}\n`, handoff: null, handoffPath: null };
  }
  const root = resolve(cwd);
  const absoluteReport = resolve(root, reportPath);
  if (!(absoluteReport.startsWith(`${root}${sep}`)) || relative(root, absoluteReport).split(sep).join('/') !== reportPath
    || !fs.existsSync(absoluteReport)) return fail('verification_report_invalid', `Verification report missing for #${issueNumber}`);
  const stat = fs.lstatSync(absoluteReport);
  if (!stat.isFile() || stat.isSymbolicLink()) return fail('verification_report_invalid', `Verification report is unsafe for #${issueNumber}`);

  const readiness = inspectVerificationReadiness({
    content: fs.readFileSync(absoluteReport, 'utf8'),
    options: { expectedIssueNumber: issueNumber, expectedSpecPath: specPath },
  });
  if (!['pass', 'pr_evidence_pending', 'pr_evidence_satisfied'].includes(readiness.status)) {
    const remediableImplementationNonPass = readiness.status === 'blocked'
      && readiness.reasonCode === 'implementation_non_pass'
      && ['fail', 'partial'].includes(readiness.implementationStatus);
    return fail(
      'verification_not_ready',
      `Verification is not ready for #${issueNumber}: ${readiness.reasonCode}`,
      remediableImplementationNonPass
        ? { intervention: false, artifacts: [reportPath] }
        : undefined,
    );
  }

  const branch = run('git', ['branch', '--show-current'], { cwd });
  if (!commandSucceeded(branch) || !String(branch.stdout ?? '').trim().startsWith(`${issueNumber}-`)) {
    return fail('verification_publish_failed', `Verification branch does not belong to #${issueNumber}`);
  }
  const status = run('git', ['status', '--porcelain=v1', '-z'], { cwd });
  if (!commandSucceeded(status)) return fail('verification_publish_failed', `Failed to inspect verification changes for #${issueNumber}`);
  const dirty = porcelainPaths(status.stdout);
  if (dirty.some((path) => path !== reportPath)) {
    return fail('verification_publish_failed', `Unexpected verification changes for #${issueNumber}: ${dirty.filter((path) => path !== reportPath).join(', ')}`);
  }

  if (dirty.includes(reportPath)) {
    const add = run('git', ['add', '--', reportPath], { cwd });
    if (!commandSucceeded(add)) return fail('verification_publish_failed', `Failed to stage verification report for #${issueNumber}`);
    const staged = run('git', ['diff', '--cached', '--quiet', '--', reportPath], { cwd });
    if (staged?.status !== 1) return fail('verification_publish_failed', `Verification report for #${issueNumber} produced no publishable change`);
    const commit = run('git', ['commit', '-m', `docs: record verification for #${issueNumber}`], { cwd });
    if (!commandSucceeded(commit)) return fail('verification_publish_failed', `Failed to commit verification report for #${issueNumber}`);
    const push = run('git', ['push'], { cwd });
    if (!commandSucceeded(push)) return fail('verification_publish_failed', `Failed to push verification report for #${issueNumber}`);
  }

  const upstream = run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd });
  if (!commandSucceeded(upstream) || !String(upstream.stdout ?? '').trim()) {
    return fail('verification_publish_failed', `Verification branch has no upstream for #${issueNumber}`);
  }
  const divergence = run('git', ['rev-list', '--left-right', '--count', '@{u}...HEAD'], { cwd });
  const counts = commandSucceeded(divergence) ? String(divergence.stdout ?? '').trim().split(/\s+/).map(Number) : [];
  if (counts.length !== 2 || counts.some((count) => !Number.isInteger(count)) || counts[0] !== 0 || counts[1] !== 0) {
    return fail('verification_publish_failed', `Verification branch is not synchronized for #${issueNumber}`);
  }
  const finalStatus = run('git', ['status', '--porcelain=v1', '-z'], { cwd });
  if (!commandSucceeded(finalStatus) || porcelainPaths(finalStatus.stdout).length > 0) {
    return fail('verification_publish_failed', `Verification worktree is not clean for #${issueNumber}`);
  }

  return writeHandoff(handoff(
    issueNumber,
    'passed',
    `Verification evidence published for #${issueNumber}`,
    reportPath,
  ));
}

export function finalizeVerification(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const processApi = options.processApi ?? process;
  let leaseContext;
  try {
    leaseContext = enterControllerLease({
      projectRoot: cwd,
      runId: options.controllerRunId,
    });
  } catch (error) {
    return {
      status: 1,
      stdout: '',
      stderr: `${error?.reasonCode || 'controller_lease_held'}\n`,
      handoff: null,
      handoffPath: `.omp/sdlc/handoffs/${options.issue}-verify.json`,
    };
  }
  const signalHandlers = [];
  if (leaseContext.owned) {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handler = () => {
        releaseControllerLease(leaseContext.lease);
        leaseContext = null;
        processApi.exit(signal === 'SIGINT' ? 130 : 143);
      };
      processApi.once(signal, handler);
      signalHandlers.push([signal, handler]);
    }
  }
  try {
    return finalizeVerificationUnlocked(options);
  } finally {
    for (const [signal, handler] of signalHandlers) processApi.removeListener(signal, handler);
    if (leaseContext?.owned) releaseControllerLease(leaseContext.lease);
  }
}

function parseCli(argv) {
  let issue;
  let spec;
  let controllerRunId;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--issue' && issue === undefined && argv[index + 1] !== undefined) issue = argv[index += 1];
    else if (argv[index] === '--spec' && spec === undefined && argv[index + 1] !== undefined) spec = argv[index += 1];
    else if (argv[index] === '--controller-run-id' && controllerRunId === undefined && argv[index + 1] !== undefined) controllerRunId = argv[index += 1];
    else return null;
  }
  if (!/^#?[1-9]\d*$/.test(issue ?? '') || !spec || controllerRunId === '') return null;
  return { issue: Number(String(issue).replace(/^#/, '')), spec, controllerRunId };
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (!options) { process.stderr.write(`${USAGE}\n`); return 2; }
  const outcome = finalizeVerification(options);
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  return outcome.status;
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli();
