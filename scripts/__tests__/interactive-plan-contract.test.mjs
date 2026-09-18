import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const AUTOMATED = [
  'start-issue',
  'write-code',
  'review-main',
  'apply-review',
  'verify-code',
  'open-pr',
  'address-pr-comments',
];

describe('interactive plan contract (SCN003, SCN008, SCN012)', () => {
  it('draft-issue has no Epic or Spike option and does not bounce to /skill:', () => {
    const source = read('workflows/draft-issue/WORKFLOW.md');

    expect(source).toContain('/sdlc-draft-issue');
    expect(source).toContain('Bug');
    expect(source).toContain('Enhancement');
    expect(source).not.toMatch(/\bSpike\b/);
    expect(source).toContain('xd://propose');
    expect(source).not.toContain('/skill:');
    expect(source).not.toMatch(/classification[^\n]{0,80}Epic|Epic option|epicRecommended/i);
  });

  it('draft-issue publishes only approved official blocked-by edges', () => {
    const workflow = read('workflows/draft-issue/WORKFLOW.md');
    const multiIssue = read('workflows/draft-issue/references/multi-issue.md');
    const contract = `${workflow}\n${multiIssue}`;

    expect(contract).toContain('planId');
    expect(contract).toContain('blockedBy');
    expect(contract).toContain('numeric REST database ids');
    expect(contract).toContain('preflight');
    expect(contract).toContain('do not ask again');
    expect(contract).not.toContain('Bodies contain the Depends on: / Blocks: lines');
    expect(multiIssue).toContain('Do not infer edges from thematic similarity');
  });

  it('draft-issue interviews to completion without a whole-run ask quota', () => {
    const workflow = read('workflows/draft-issue/WORKFLOW.md');
    const interviewDepth = read('workflows/draft-issue/references/interview-depth.md');
    const multiIssue = read('workflows/draft-issue/references/multi-issue.md');
    const draftIssueContract = `${workflow}\n${interviewDepth}\n${multiIssue}`;

    expect(draftIssueContract).not.toMatch(
      /3 total across whole run|total asks?\s*<=?\s*3|max total questions budget across skill|remaining ask slots?|remaining slots|if slots allow|saves budget|synthesize directly from/i,
    );
    expect(interviewDepth).toContain('Never skip a necessary eligible probe');
    expect(workflow).toContain('one `ask` to confirm split');
    expect(workflow).toContain('classification with exactly these two options');
    expect(workflow).toContain('Enhancement — New capability or improvement');
    expect(workflow).toContain('Bug — Something is broken');
    expect(workflow).toContain('If root `VERSION` parses as semver `X.Y.Z`');
    expect(workflow).toContain('Investigate with `glob`, `grep`, and `read`');
    expect(workflow).toContain('Do not use `ask` for final approval');
    expect(interviewDepth).toContain('Use `ask()` only for preferences and tradeoffs');
    expect(interviewDepth).toContain('Provide 2–4 options');
    expect(interviewDepth).toContain('Put the recommended option first');
    expect(interviewDepth).toContain('Include at most three questions');
    expect(interviewDepth).toContain(
      'Continue with focused probes until every material undiscoverable preference, observable acceptance criterion, and adjacent-software scope boundary is gathered',
    );
    expect(multiIssue).toContain('Only this one ask for the split decision');
  });

  it('retains per-call and unrelated workflow interview budgets', () => {
    expect(read('references/interactive-gates.md')).toContain('max 3 questions per call');
    expect(read('workflows/write-spec/WORKFLOW.md')).toContain('Interview (max 3 asks per issue)');
    expect(read('workflows/onboard-project/WORKFLOW.md')).toContain('max 3 total qs');
    expect(read('workflows/upgrade-project/WORKFLOW.md')).toContain('Ask ( <=3 total )');
  });

  it('requires situation paragraphs while preserving canned interview gates', () => {
    const situationParagraphPaths = [
      'references/interactive-gates.md',
      'workflows/draft-issue/WORKFLOW.md',
      'workflows/draft-issue/references/interview-depth.md',
      'workflows/write-spec/WORKFLOW.md',
      'workflows/write-spec/references/interview.md',
      'workflows/write-spec/references/discovery.md',
      'workflows/onboard-project/WORKFLOW.md',
      'workflows/onboard-project/references/interview.md',
      'workflows/upgrade-project/WORKFLOW.md',
      'workflows/run-retro/WORKFLOW.md',
    ];

    for (const relativePath of situationParagraphPaths) {
      expect(`${relativePath}\n${read(relativePath)}`).toContain(
        'short paragraph stating the situation',
      );
    }

    expect(read('workflows/draft-issue/WORKFLOW.md')).toContain(
      'classification with exactly these two options',
    );
    expect(read('workflows/draft-issue/references/multi-issue.md')).toContain(
      'question: "Create separate issues for this split?"',
    );
    expect(read('workflows/write-spec/WORKFLOW.md')).toContain(
      'Finished — stop writing specs',
    );
    expect(read('workflows/write-spec/WORKFLOW.md')).toContain(
      'Continue — enter another issue number',
    );

    expect(read('workflows/draft-issue/WORKFLOW.md')).toContain(
      'Otherwise use one `ask` for the need',
    );
    expect(read('workflows/draft-issue/WORKFLOW.md')).toContain(
      '`v${major} (current)`',
    );
    expect(read('workflows/draft-issue/WORKFLOW.md')).toContain(
      '`v${major+1} (next)`',
    );
    expect(read('references/interactive-gates.md')).toContain(
      'Required canned gates keep their existing question and option labels and are not required to add a situation paragraph: draft-issue classification, draft-issue milestone, draft-issue split confirmation, draft-issue need-gather when `$ARGUMENTS` is absent, and write-spec continue/finish.',
    );
  });

  it('write-spec preserves full per-issue native planning and delegates lifecycle reads', () => {
    const source = read('workflows/write-spec/WORKFLOW.md');
    const publish = read('workflows/write-spec/references/publish.md');
    const reviewGates = read('workflows/write-spec/references/review-gates.md');
    const contract = `${source}\n${publish}\n${reviewGates}`;

    expect(source).toContain('/sdlc-write-spec');
    expect(source).toContain('Every selected issue uses its own `xd://propose`');
    expect(source).toContain('the current complete `published[]` list');
    expect(source).toContain('the full planned contents of all four files');
    expect(source).toContain('Do not call `candidates` or `ask` in this execution turn');
    expect(source).toContain('Do not call `default-branch` before M\'s proposal');
    expect(source).toContain('distinct `local://spec-{M}-plan.md`');
    expect(publish).toContain('queues one native-plan follow-up');
    expect(reviewGates).toContain('receives its own proposal before any issue-specific mutation');
    expect(contract).not.toMatch(/Only the first|first spec only|Continuation never calls `xd:\/\/propose`|No second `xd:\/\/propose`/i);
    expect(source).toContain('Usage: /sdlc-write-spec #N');
    for (const template of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
      expect(source).toContain(`workflows/write-spec/templates/${template}`);
    }
    expect(source).not.toContain('Use templates from templates/');
    expect(read('workflows/write-spec/references/defect-variant.md'))
      .toContain('workflows/write-spec/templates/');
    expect(source).toContain('publish-approved-spec.mjs discover --issue N');
    expect(source).toContain('publish-approved-spec.mjs candidates [--published N ...]');
    expect(source).toContain('publish-approved-spec.mjs missing-spec-created');
    expect(source).toContain('Before any usage gate or `ask`');
    expect(source).toContain('If the trimmed value is non-empty');
    expect(source).toContain('Skip the bare picker and continue directly to Discovery');
    expect(source).toContain('at most its first three rows as `#M — {title}`');
    expect(source).toContain('recommended index 0');
    expect(source).toContain('Finished — stop without writing a spec');
    expect(source).toContain('Automatic Other remains available');
    expect(source).toContain('re-asks the same picker from the cached rows without rerunning the helper');
    expect(source).toContain('For the initially selected issue, regardless of whether N came from `$ARGUMENTS`, a listed picker choice, or automatic Other');
    expect(source).toContain('No open issues missing spec-created.');
    expect(source).toContain('stop without `ask` or usage output');
    expect(source).toContain('helper failure output and stop without asking');
    expect(source).toContain('at most the first three');
    expect(source).toContain('Finished — stop writing specs');
    expect(source).toContain('docs: approve spec for #N');
    expect(source).toContain('publish-approved-spec.mjs" merge');
    expect(source).not.toContain('Closes #N');
    expect(source).toContain('Published specs: #<n> on <n>-<slug>[, ...]');
    expect(source).toContain('Next step: /sdlc-execute #<first-published>');
    expect(source).toContain('candidates [--published N ...]');
    expect(source).toContain('without printing `Published specs:` or `Next step:`');
    expect(source).not.toContain('gh issue list --state open');
    expect(source).not.toContain('refs/remotes/origin');
    expect(source).not.toContain('/skill:');
  });

  it('restricts both generated artifacts to execute-implementable software requirements', () => {
    const draft = read('workflows/draft-issue/WORKFLOW.md');
    const writeSpec = read('workflows/write-spec/WORKFLOW.md');
    const execute = read('references/execute-implementable-requirements.md');
    const issueTemplates = [
      read('workflows/draft-issue/references/feature-template.md'),
      read('workflows/draft-issue/references/bug-template.md'),
    ].join('\n');
    const requirements = read('workflows/write-spec/templates/requirements.md');
    const design = read('workflows/write-spec/templates/design.md');
    const tasks = read('workflows/write-spec/templates/tasks.md');
    const feature = read('workflows/write-spec/templates/feature.gherkin');
    const specTemplates = [requirements, design, tasks, feature].join('\n');
    const consumers = `${draft}\n${writeSpec}`;

    expect(execute).toContain(
      'start → implement → review1 → fix1 → review2 → fix2 → verify → deliver',
    );
    expect(execute).toContain('`**File(s)**` is an optional hint');
    expect(execute).toContain('Outcome mutation may touch any needed valid repository-relative');
    expect(execute).toContain('four immutable current Approved spec inputs');
    expect(execute).toContain('`.omp` run state, handoffs, locks, receipts, and recovery records are controller-owned evidence');
    expect(execute).toContain('observable local, registered-provider, or allowlisted PR-only success oracle');
    expect(execute).toContain('human approval');
    expect(execute).toContain('credentials acquisition');
    expect(execute).toContain('live production/cloud/vendor operations');
    expect(execute).toContain('another repository');
    expect(execute).toContain('GitHub Release or tag creation');
    expect(execute).toContain('package/container publication');
    expect(execute).toContain('Project-board In Progress is best effort and never acceptance evidence');
    expect(execute).toContain('control-plane metadata, not Functional Requirements');
    expect(execute).toMatch(/1\. Normalize[\s\S]*2\. Identify[\s\S]*3\. Require every mutation[\s\S]*4\. Require an observable[\s\S]*5\. Reject it[\s\S]*6\. Strip excluded/);

    const columns = '`Item`, `Behavior or task`, `Owning stage`, `Mutation/artifact`, `Evidence kind and identity`, `External prerequisite`, and `Disposition`';
    for (const source of [draft, writeSpec]) {
      expect(source).toContain('Execute Feasibility');
      expect(source).toContain(columns);
    }
    expect(execute).toContain('| Item | Behavior or task | Owning stage | Mutation/artifact | Evidence kind and identity | External prerequisite | Disposition |');
    expect(draft).toContain('Cover every proposed AC and FR');
    expect(writeSpec).toContain('Cover every proposed AC, FR, task, and scenario');
    expect(execute).toContain('Reject a retained row with blank or unresolved ownership');
    expect(consumers).toContain('never enter `body` or `ghCreateArgs.body`');
    expect(consumers).toContain('The feasibility table, omitted rows, and control-plane rows remain plan-only');

    expect(draft).toContain('Immediately apply the rendered `/sdlc-execute` eligibility algorithm before multi-issue detection');
    expect(writeSpec).toContain('extract the eligible slice from the issue body, repository evidence, and steering before Interview');
    expect(consumers).toContain('retained or rewritten');
    expect(consumers).toContain('Excluded material must not be relocated');
    expect(consumers).toContain('Excluded burdens are absent from every file');
    expect(draft).toContain('audit every complete issue-body section and the exact `ghCreateArgs.body`');
    expect(writeSpec).toContain('audit the complete planned contents of `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`');

    expect(draft).toContain(
      'No software requirements executable by /sdlc-execute remain after excluding non-software obligations.',
    );
    expect(writeSpec).toContain(
      'Issue #N has no software requirements executable by /sdlc-execute after excluding non-software obligations.',
    );
    expect(writeSpec).toContain(
      'Issue #N has unresolved decisions required for /sdlc-execute: <comma-separated decisions>.',
    );
    expect(consumers).toMatch(/stop before (?:plan creation|writing a plan)/);

    expect(issueTemplates).toContain('## Technical Notes');
    expect(issueTemplates).not.toContain('**User Confirmed**');
    expect(issueTemplates).toContain('Out of Scope may name only adjacent software behavior');
    expect(design).not.toMatch(/^## (Security Considerations|Performance Considerations|Testing Strategy|Risks & Mitigations|Open Questions|Validation Checklist|Regression Risk)$/m);
    expect(tasks).not.toMatch(/^## Phase \d|^## Validation Checklist|^## Dependency Graph/m);
    expect(tasks).toContain('`**File(s)**:` is optional implementation guidance');
    expect(specTemplates).not.toContain('## Open Questions');
    expect(feature).toContain('one observable scenario per requirements acceptance criterion');
    expect(requirements).toContain('functional software context');
  });

  it('automated skills do not invoke user-input tools', () => {
    const withoutProhibitions = (source) => source.replace(/\b(?:Never|Do not) call `ask`(?=[.,\s]|$)/g, '');
    expect(withoutProhibitions('Do not call `ask`. Then invoke `ask`.')).toMatch(/\bask\b/);
    for (const name of AUTOMATED) {
      const source = read(`workflows/${name}/WORKFLOW.md`);
      const executableInstructions = withoutProhibitions(source);
      expect(`${name}\n${executableInstructions}`).not.toMatch(/\bask\b/);
      expect(source).not.toContain('request_user_input');
    }
  });
});
