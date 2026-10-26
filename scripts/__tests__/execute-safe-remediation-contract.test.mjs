import { describe, expect, it } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderInteractiveWorkflow } from '../../src/sdlc-commands.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = renderInteractiveWorkflow('sdlc-execute', repoRoot, '');
const lines = workflow.split('\n');

function section(heading) {
  const start = lines.indexOf(`### ${heading}`);
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => line.startsWith('## ') || line.startsWith('### '));
  return rest.slice(0, next < 0 ? undefined : next).join('\n');
}

const intro = workflow.slice(0, workflow.indexOf('## Preflight'));
const safeActions = section('Safe actions');
const hungWorker = section('Hung worker processes');
const gates = section('Gates stay with the controller');
const haltRow = lines.find((line) => line.startsWith('| `halt --text'));
const anythingElseRow = lines.find((line) => line.startsWith('| Anything else |'));

describe('rendered /sdlc-execute safe remediation contract (SCN001–SCN005)', () => {
  it('SCN001: authorizes any safe, reversible action that moves delivery at every stage without asking', () => {
    expect(safeActions).toContain('start, implement, verify, deliver');
    expect(safeActions).toContain('after a non-report controller exit');
    expect(safeActions).toContain('safe, reversible, and moves the issue toward delivery of its spec');
    expect(safeActions).toContain('without asking the person');
    expect(safeActions).toContain('Do not wait for the action to appear on the list below');
    expect(safeActions).toContain('changes no tracked repository file, loses no work or data that cannot be regenerated, and touches no shared or production system');
    expect(safeActions).toContain('`prompt` the worker');
    expect(safeActions).toContain('`redispatch` the same stage with guidance that names the fix');
    expect(safeActions).toContain('rerun `supervise` when the controller already exited');
    expect(workflow).not.toContain('### Environmental verify failures');
  });

  it('SCN002: states the examples are not exhaustive and names every example', () => {
    expect(safeActions).toContain('These examples illustrate that rule. They are not an exhaustive list:');
    const examples = safeActions.split('\n').filter((line) => line.startsWith('- '));
    expect(examples).toHaveLength(9);
    for (const example of [
      'Rancher Desktop via `rdctl`',
      'boot an iOS simulator or Android emulator',
      'restart a stopped host service or port forward',
      'stop a hung test or build process the run itself started',
      '`.nmg-sdlc/` to `.git/info/exclude`',
      'wait for a transient network or GitHub failure to clear, then rerun `supervise`',
      'wait for still-running required PR checks to finish, then `redispatch` deliver',
      'run every `supervise`, `decide`, and `wait` command from the project root',
      'free regenerable caches when the disk is full',
    ]) {
      expect(safeActions).toContain(example);
    }
  });

  it('SCN003: limits halt to the four cases the person must handle', () => {
    expect(haltRow).toBeDefined();
    expect(haltRow).toContain('a login or credential the person must enter interactively');
    expect(haltRow).toContain('a product or spec decision');
    expect(haltRow).toContain('an action that is destructive, irreversible, or touches shared or production systems');
    expect(haltRow).toContain('a blocker still present after a remediation based on a different hypothesis');
    expect(workflow).not.toContain('No worker can fix it');
  });

  it('SCN004: keeps the prohibitions and the full-green gate in force during remediation', () => {
    expect(intro).toContain('Never edit product code, specs, or any other tracked repository file');
    expect(intro).toContain('open PRs, commit, or push');
    expect(intro).toContain('bypass branch protection or required checks');
    expect(intro).toContain('run `herdr server stop`');
    expect(safeActions).toContain('never edit product code, specs, or other tracked repository files');
    expect(safeActions).toContain('never commit, push, or open PRs');
    expect(safeActions).toContain('never bypass branch protection or required checks');
    expect(safeActions).toContain('never run `herdr server stop`');
    expect(safeActions).toContain('held to the same full registered gate at the exact source head');
    expect(gates).toContain('full-green registered gate at the exact source head');
  });

  it('SCN005: diagnoses a hung worker process instead of choosing continue again', () => {
    expect(hungWorker).toContain('no pane or token progress');
    expect(hungWorker).toContain('about 0% CPU for several minutes');
    expect(hungWorker).toContain("Check that process's activity");
    expect(hungWorker).toContain('stop the hung process');
    expect(hungWorker).toContain('`prompt` the worker');
    expect(hungWorker).toContain('Do not answer `continue` again');
  });

  it('reruns supervise from the project root after a transient or remediable controller exit', () => {
    expect(anythingElseRow).toBeDefined();
    expect(anythingElseRow).toContain('`pr_evidence_unavailable`');
    expect(anythingElseRow).toContain('`execute_session_unknown`');
    expect(anythingElseRow).toContain('apply the safe remediation under **Safe actions**');
    expect(anythingElseRow).toContain('rerun `supervise` from the project root');
    expect(anythingElseRow).toContain('Otherwise stop with its exit code');
  });
});
