import { afterAll, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXECUTE_GOAL_MAX_ISSUES,
  executeGoalCondition,
  executeGoalRequest,
  executeGoalStoppedLine,
  isExecuteSuperviseCommand,
  materializePluginRootCommand,
} from '../../src/host-events.mjs';
import { renderInteractiveWorkflow } from '../../src/sdlc-commands.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const controller = path.join(repoRoot, 'scripts', 'sdlc-execute.mjs');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const scratch = [];

afterAll(() => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

// A git repository whose HEAD names `branch`, with no commits: `goal` reads only the branch name.
function repoOnBranch(branch) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-goal-'));
  scratch.push(root);
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['symbolic-ref', 'HEAD', `refs/heads/${branch}`], { cwd: root });
  return root;
}

// `gh` and `herdr` on PATH record their calls; `goal` must make neither.
function sentinelBin() {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-goal-bin-'));
  scratch.push(bin);
  for (const tool of ['gh', 'herdr']) {
    const file = path.join(bin, tool);
    fs.writeFileSync(file, `#!/bin/sh\ntouch "${bin}/called-${tool}"\nexit 1\n`);
    fs.chmodSync(file, 0o755);
  }
  return bin;
}

function goal(root, args, bin) {
  return spawnSync(process.execPath, [controller, 'goal', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
}

function section(source, heading) {
  const lines = source.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => line.startsWith('## ') || line.startsWith('### '));
  return rest.slice(0, next < 0 ? undefined : next).join('\n');
}

const completionLine = (issue) => `"#${issue}: MERGED and CLOSED"`;

describe('executeGoalCondition (FR2, FR3)', () => {
  it('names every issue in run order and quotes each completion line and the stop prefix', () => {
    const condition = executeGoalCondition([41, 42]);

    expect(condition).toContain('is delivering #41, #42 in this order.');
    expect(condition).toContain(`the line ${completionLine(41)} and the line ${completionLine(42)}`);
    expect(condition.indexOf(completionLine(41))).toBeLessThan(condition.indexOf(completionLine(42)));
    expect(condition).toContain('a line beginning "/sdlc-execute stopped:" followed by the halt or controller-exit diagnosis.');
  });

  it('stays at or under 4,000 characters for the 20-issue maximum', () => {
    const issues = Array.from({ length: EXECUTE_GOAL_MAX_ISSUES }, (_, index) => Number.MAX_SAFE_INTEGER - index);

    expect(executeGoalCondition(issues).length).toBeLessThanOrEqual(4000);
  });

  it('returns null for empty, duplicate, non-integer, non-positive, over-long, or non-array input', () => {
    const overLong = Array.from({ length: EXECUTE_GOAL_MAX_ISSUES + 1 }, (_, index) => index + 1);

    for (const issues of [[], [1, 1], [1.5], [0], [-3], ['41'], [Number.NaN], overLong, undefined, 'x']) {
      expect(executeGoalCondition(issues)).toBeNull();
    }
  });
});

describe('executeGoalRequest (FR1, FR2)', () => {
  it('returns the issues a sole ok JSON line names for a goal helper call', () => {
    const command = 'node "/opt/nmg/scripts/sdlc-execute.mjs" goal \'#41\' \'#42\'';
    const stdout = '{"ok":true,"issues":[41,42],"condition":"x"}\n';

    expect(executeGoalRequest({ command, stdout })).toEqual([41, 42]);
  });

  it('returns null for other commands, failed or invalid results, and several JSON lines', () => {
    const goalCommand = 'node "/opt/nmg/scripts/sdlc-execute.mjs" goal';

    expect(executeGoalRequest({ command: 'node "/opt/nmg/scripts/sdlc-execute.mjs" supervise', stdout: '{"ok":true,"issues":[41]}' })).toBeNull();
    expect(executeGoalRequest({ command: goalCommand, stdout: '{"ok":false,"reasonCode":"goal_issues_unresolved"}' })).toBeNull();
    expect(executeGoalRequest({ command: goalCommand, stdout: '{"ok":true,"issues":[41,41]}' })).toBeNull();
    expect(executeGoalRequest({ command: goalCommand, stdout: '{"ok":true,"issues":[41]}\n{"ok":true,"issues":[42]}' })).toBeNull();
  });
});

describe('isExecuteSuperviseCommand (FR1)', () => {
  it('recognizes supervise under quoted, plugin-root, and absolute spellings', () => {
    for (const command of [
      'node "/opt/nmg/scripts/sdlc-execute.mjs" supervise #41',
      "node '/opt/nmg/scripts/sdlc-execute.mjs' supervise",
      'node /opt/nmg/scripts/sdlc-execute.mjs supervise --retain-worker',
      'node "<plugin-root>/scripts/sdlc-execute.mjs" supervise #41',
      'node "${NMG_SDLC_PLUGIN_ROOT}/scripts/sdlc-execute.mjs" supervise',
      '$NMG_SDLC_PLUGIN_ROOT/scripts/sdlc-execute.mjs supervise',
    ]) {
      expect(isExecuteSuperviseCommand(command)).toBe(true);
    }
    expect(isExecuteSuperviseCommand(materializePluginRootCommand('node "<plugin-root>/scripts/sdlc-execute.mjs" supervise #41', '/opt/nmg'))).toBe(true);
  });

  it('does not match decide, wait, list-specified, or goal', () => {
    for (const command of [
      'node "/opt/nmg/scripts/sdlc-execute.mjs" decide --session S --seq 1 accept',
      'node "/opt/nmg/scripts/sdlc-execute.mjs" wait --session S',
      'node "/opt/nmg/scripts/sdlc-execute.mjs" list-specified',
      'node "/opt/nmg/scripts/sdlc-execute.mjs" goal #41',
    ]) {
      expect(isExecuteSuperviseCommand(command)).toBe(false);
    }
  });
});

describe('executeGoalStoppedLine (FR4)', () => {
  it('prints the one-line goal_unavailable stop with the reason', () => {
    expect(executeGoalStoppedLine('goal command unavailable'))
      .toBe('/sdlc-execute stopped: goal_unavailable: goal command unavailable');
  });

  it('collapses newlines in the reason into spaces', () => {
    expect(executeGoalStoppedLine('first line\nsecond line'))
      .toBe('/sdlc-execute stopped: goal_unavailable: first line second line');
  });
});

describe('sdlc-execute.mjs goal (T002, AC1, AC2, FR5)', () => {
  it('prints explicit issues with their condition, exits 0, and makes no GitHub or Herdr call', () => {
    const bin = sentinelBin();
    const result = goal(repoOnBranch('feature-x'), ['#41', '#42'], bin);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, issues: [41, 42], condition: executeGoalCondition([41, 42]) });
    expect(fs.existsSync(path.join(bin, 'called-gh'))).toBe(false);
    expect(fs.existsSync(path.join(bin, 'called-herdr'))).toBe(false);
  });

  it('names the issue on a recognized N-* branch when no tokens are given', () => {
    const result = goal(repoOnBranch('42-add-goal'), [], sentinelBin());

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, issues: [42], condition: executeGoalCondition([42]) });
  });

  it('reports goal_issues_unresolved and exits 1 with no tokens on a non-issue branch', () => {
    const result = goal(repoOnBranch('feature-x'), [], sentinelBin());

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, reasonCode: 'goal_issues_unresolved' });
  });

  it('accepts and ignores the supervise flags', () => {
    const result = goal(repoOnBranch('feature-x'), ['--retain-worker', '--check-in-seconds', '30', '#7'], sentinelBin());

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).issues).toEqual([7]);
  });

  it('prints usage on stderr and exits 2 for invalid tokens, with nothing on stdout', () => {
    const invalid = goal(repoOnBranch('42-add-goal'), ['#x'], sentinelBin());
    const tooMany = goal(repoOnBranch('42-add-goal'), Array.from({ length: 21 }, (_, index) => `#${index + 1}`), sentinelBin());

    for (const result of [invalid, tooMany]) {
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Usage: /sdlc-execute');
      expect(result.stdout).toBe('');
    }
  });
});

describe('hooks module goal gate and handshake (T003, AC1, AC5)', () => {
  const source = read('hooks/register.ts');

  it('refuses supervise before the goal is set, without reaching next', () => {
    const deny = source.indexOf("return { deny: 'NMG SDLC: /sdlc-execute sets its /goal before supervise.");
    const forward = source.indexOf('const ran = await next(command === e.command');

    expect(deny).toBeGreaterThan(0);
    expect(deny).toBeLessThan(forward);
    expect(source).toContain('isExecuteSuperviseCommand(command)');
  });

  it('sets the goal from turn.complete through the command API with the condition as args', () => {
    const turnComplete = source.indexOf("on('turn.complete'");

    expect(source.indexOf('void setExecuteGoal($, issues)')).toBeGreaterThan(turnComplete);
    expect(source).toContain("await $.command.run({ command: 'goal', args: condition })");
    expect(source).toContain('await $.command.list()');
    expect(source).toContain("throw new Error('goal command unavailable')");
  });

  it('prints the goal_unavailable line through a prompt and keeps supervise refused on failure', () => {
    expect(source).toContain('executeGoalStoppedLine(reason)');
    expect(source).toContain('setting the /goal failed. Print exactly this line and stop without running supervise');
    expect(source).toContain('execute.goalSet = false');
  });

  it('imports no Node built-ins', () => {
    expect(source).not.toMatch(/from ['"]node:/);
  });
});

describe('execute workflow goal routing and terminal rules (T004, AC1–AC6, FR6)', () => {
  const workflow = read('workflows/execute/WORKFLOW.md');
  const rendered = renderInteractiveWorkflow('sdlc-execute', repoRoot, '');
  const goalSection = section(workflow, '## Set the goal');
  const completion = section(workflow, '### Completion and stop lines');
  const start = section(workflow, '## Start');
  const select = section(workflow, '## Select specified issues');

  it('routes explicit-token, bare issue-branch, and picker paths through Set the goal before supervise', () => {
    expect(start).toContain('follow **Set the goal** with every trimmed token');
    expect(start).toContain('follow **Set the goal** with no issue tokens');
    expect(select).toContain('7. Follow **Set the goal** with the selected numbers');
    expect(start).not.toContain('sdlc-execute.mjs" supervise');
    expect(select).not.toContain('sdlc-execute.mjs" supervise');
    expect(rendered).toContain('## Set the goal');
  });

  it('runs goal, ends the turn, and keeps /goal under the hooks module', () => {
    expect(goalSection).toContain('sdlc-execute.mjs" goal`');
    expect(goalSection).toContain('end your turn with no further action');
    expect(goalSection).toContain('Do not run `/goal` yourself');
    expect(goalSection).toContain('goal_issues_unresolved');
  });

  it('describes the goal failure line, refused supervise, and no-goal stops', () => {
    expect(goalSection).toContain('/sdlc-execute stopped: goal_unavailable: <reason>');
    expect(goalSection).toContain('A `supervise` call refused because no goal is set means this turn must end now.');
    expect(goalSection).toContain('A run that resolves no issue set stops in **Select specified issues** and never reaches this section, so it sets no goal.');
  });

  it('requires the completion lines and the stop line in the final reply, and names /goal clear', () => {
    expect(completion).toContain('repeat every `#N: MERGED and CLOSED` line');
    expect(completion).toContain('print `/sdlc-execute stopped: <diagnosis>` as the reply\'s last line');
    expect(completion).toContain('`/goal clear`');
  });
});

describe('README goal documentation (T005, FR6)', () => {
  const readme = read('README.md');
  const goalSection = section(readme, '### Completion goal');

  it('describes the goal, its completion lines, the goal_unavailable stop, and /goal clear', () => {
    expect(goalSection).toContain('`/goal`');
    expect(goalSection).toContain('`#N: MERGED and CLOSED`');
    expect(goalSection).toContain('/sdlc-execute stopped: <diagnosis>');
    expect(goalSection).toContain('/sdlc-execute stopped: goal_unavailable: <reason>');
    expect(goalSection).toContain('`/goal clear`');
  });
});

describe('CHANGELOG citation (T005)', () => {
  it('adds an Unreleased bullet that ends with (#529)', () => {
    const changelog = read('CHANGELOG.md');
    const unreleased = changelog.slice(changelog.indexOf('## [Unreleased]'), changelog.indexOf('## [4.6.0]'));

    expect(unreleased).toMatch(/^- .*\(#529\)\.?$/m);
  });
});
