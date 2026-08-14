import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectDeliverableDependencies } from '../deliverable-dependencies.mjs';

const scriptsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(scriptsRoot, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('deliverable dependency consumer contracts', () => {
  const shared = read('references/deliverable-dependencies.md');
  const draftIssue = read('skills/draft-issue/references/multi-issue.md');
  const draftIssueSkill = read('skills/draft-issue/SKILL.md');
  const writeSpec = read('skills/write-spec/SKILL.md');
  const umbrella = read('skills/write-spec/references/umbrella-mode.md');
  const startIssue = read('skills/start-issue/SKILL.md');
  const statusSkill = read('skills/status/SKILL.md');
  const statusCli = read('scripts/sdlc-status.mjs');
  const upgrade = read('skills/upgrade-project/SKILL.md');
  const recovery = read('skills/upgrade-project/references/deliverable-dependency-recovery.md');
  const gherkin = read('specs/bug-require-deliverable-dependencies-in-multi-pr-child-plans/feature.gherkin');

  it('defines one structured record and merged-default-branch availability contract', () => {
    expect(shared).toContain('- Requires deliverable from #122: T054 validated schema/register baseline');
    expect(shared).toContain('`closedByPullRequestsReferences`');
    expect(shared).toContain('| `ready` | Every owner has the matching execution edge, is closed, and has a merged closing PR');
    expect(shared).toContain('Issue state alone is insufficient.');
  });

  it('prevents midpoint plans before child creation and persists the approved graph', () => {
    expect(draftIssue).toContain('#### Deliverable-boundary validation');
    expect(draftIssue).toContain('stop before the graph gate');
    expect(draftIssue).toContain('clear all edges only when the plan has no cross-child deliverable prerequisites');
    expect(draftIssue).toContain('do not revise `session.proposedSplit` or create an ask inside this flow');
    expect(draftIssue).toContain('boundary: "baseline"');
    expect(draftIssueSkill).toContain('activeDeliverablePrerequisites');
    expect(draftIssueSkill).toContain('- Requires deliverable from <ownerAskId>: <task/artifact description>');
    expect(writeSpec).toContain('inventory every task ID and named artifact assigned to each Delivery Phase');
    expect(umbrella).toContain('prerequisite owners before consumers');
    expect(umbrella).toContain('Require `ready` or truthfully `blocked`');
  });

  it('keeps start and status aligned on fail-closed deliverable evidence', () => {
    expect(startIssue).toContain('fully page each owner\'s `closedByPullRequestsReferences`');
    expect(startIssue).toContain('`repair_required` or `unverifiable`');
    expect(statusSkill).toContain('`issue.deliverableDependencies`');
    expect(statusCli).toContain("from './deliverable-dependencies.mjs'");
    expect(statusCli).toContain("stage = 'blocked'");
    expect(statusCli).toContain('Deliverables: ${deliverables}');
  });

  it('owns exact approval-gated and idempotent manual existing-plan repair', () => {
    expect(upgrade).toContain('### Step 3.7: Audit Deliverable Dependencies');
    expect(upgrade).toContain('references/deliverable-dependency-recovery.md');
    expect(recovery).toContain('It authorizes rendering the manual handoff, not an automated GitHub write.');
    expect(recovery).toContain('Do not call `gh issue edit`');
    expect(recovery).toContain('canonical task/artifact ownership entry and its source spec digest');
    expect(recovery).toContain('Run Step 3.7 again from fresh GitHub and canonical-spec evidence.');
    expect(recovery).toContain('Baseline extraction requires `$nmg-sdlc:draft-issue`');
  });

  it('maps every issue acceptance criterion to one stable regression scenario', () => {
    expect(gherkin.match(/@SCN\d+ @regression/g)).toHaveLength(7);
    expect(gherkin.match(/^  Scenario:/gm)).toHaveLength(7);
  });
});

describe('independent branch deliverable exercise', () => {
  it('reports a child ready only after the owner artifact is merged and present at its branch point', () => {
    const plan = JSON.parse(fs.readFileSync(
      path.join(scriptsRoot, '__fixtures__', 'deliverable-dependencies', 'plan.json'),
      'utf8',
    ));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-deliverable-'));
    try {
      execFileSync('git', ['init', '-b', plan.defaultBranch], { cwd: root, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.name', 'Deliverable Test'], { cwd: root });
      execFileSync('git', ['config', 'user.email', 'deliverable@example.test'], { cwd: root });
      fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n');
      execFileSync('git', ['add', 'README.md'], { cwd: root });
      execFileSync('git', ['commit', '-m', 'chore: initialize'], { cwd: root, stdio: 'ignore' });

      execFileSync('git', ['checkout', '-b', 'consumer-before-merge'], { cwd: root, stdio: 'ignore' });
      expect(fs.existsSync(path.join(root, plan.artifactPath))).toBe(false);
      execFileSync('git', ['checkout', plan.defaultBranch], { cwd: root, stdio: 'ignore' });

      execFileSync('git', ['checkout', '-b', 'owner'], { cwd: root, stdio: 'ignore' });
      fs.mkdirSync(path.dirname(path.join(root, plan.artifactPath)), { recursive: true });
      fs.writeFileSync(path.join(root, plan.artifactPath), 'validated baseline\n');
      execFileSync('git', ['add', plan.artifactPath], { cwd: root });
      execFileSync('git', ['commit', '-m', 'feat: publish baseline'], { cwd: root, stdio: 'ignore' });
      execFileSync('git', ['checkout', plan.defaultBranch], { cwd: root, stdio: 'ignore' });

      const body = `- Requires deliverable from #${plan.ownerIssue}: ${plan.description}\nDepends on: #${plan.ownerIssue}`;
      const before = inspectDeliverableDependencies({
        issueNumber: plan.consumerIssue,
        body,
        defaultBranch: plan.defaultBranch,
        executionDependencies: [plan.ownerIssue],
        targets: [{
          number: plan.ownerIssue,
          state: 'OPEN',
          closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: false } },
        }],
      });
      expect(before.status).toBe('blocked');

      execFileSync('git', ['merge', '--no-ff', 'owner', '-m', 'merge owner deliverable'], {
        cwd: root,
        stdio: 'ignore',
      });
      const mergeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
      const after = inspectDeliverableDependencies({
        issueNumber: plan.consumerIssue,
        body,
        defaultBranch: plan.defaultBranch,
        executionDependencies: [plan.ownerIssue],
        targets: [{
          number: plan.ownerIssue,
          state: 'CLOSED',
          closedByPullRequestsReferences: {
            nodes: [{
              number: 200,
              state: 'MERGED',
              mergedAt: '2026-08-14T10:00:00Z',
              baseRefName: plan.defaultBranch,
              mergeCommit: { oid: mergeCommit },
            }],
            pageInfo: { hasNextPage: false },
          },
        }],
      });
      expect(after.status).toBe('ready');

      execFileSync('git', ['checkout', '-b', 'consumer-after-merge'], { cwd: root, stdio: 'ignore' });
      expect(fs.readFileSync(path.join(root, plan.artifactPath), 'utf8')).toBe('validated baseline\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
