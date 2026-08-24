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
    expect(interviewDepth).toContain('Never skip a necessary probe');
    expect(workflow).toContain('ONE ask to confirm split');
    expect(workflow).toContain('Classification ask (exactly these 2 options');
    expect(workflow).toContain('Enhancement — New capability or improvement');
    expect(workflow).toContain('Bug — Something is broken');
    expect(workflow).toContain('if root VERSION parses as semver X.Y.Z');
    expect(workflow).toContain('Investigate (use glob/grep/read');
    expect(workflow).toContain('Do NOT use ask for final approval or review of draft');
    expect(interviewDepth).toContain('Use `ask()` only for preferences and tradeoffs');
    expect(interviewDepth).toContain('Provide 2–4 options');
    expect(interviewDepth).toContain('Put the recommended option first');
    expect(interviewDepth).toContain('Include at most three questions');
    expect(interviewDepth).toContain(
      'Continue with focused probes until every material undiscoverable preference, acceptance criterion, and scope boundary is gathered',
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
      'question: "What type of issue is this?"',
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
      'Else use one ask for the need (free-form via Other if needed, but prefer short).',
    );
    expect(read('workflows/draft-issue/WORKFLOW.md')).toContain(
      '- `v${major} (current)`',
    );
    expect(read('workflows/draft-issue/WORKFLOW.md')).toContain(
      '- `v${major+1} (next)`',
    );
    expect(read('references/interactive-gates.md')).toContain(
      'Required canned gates keep their existing question and option labels and are not required to add a situation paragraph: draft-issue classification, draft-issue milestone, draft-issue split confirmation, draft-issue need-gather when `$ARGUMENTS` is absent, and write-spec continue/finish.',
    );
  });

  it('write-spec preserves full native planning and delegates lifecycle reads', () => {
    const source = read('workflows/write-spec/WORKFLOW.md');

    expect(source).toContain('/sdlc-write-spec');
    expect(source).toContain('Only the first spec in a session uses `xd://propose`');
    expect(source).toContain('Usage: /sdlc-write-spec #N');
    expect(source).toContain('the full file contents to write on approval');
    expect(source).toContain('requirements.md');
    expect(source).toContain('design.md');
    expect(source).toContain('tasks.md');
    expect(source).toContain('feature.gherkin');
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
    expect(source).toContain('publish-approved-spec.mjs merge');
    expect(source).not.toContain('Closes #N');
    expect(source).toContain('Published specs: #<n> on <n>-<slug>[, ...]');
    expect(source).toContain('Next step: /sdlc-execute #<first-published>');
    expect(source).toContain('Finished — stop writing specs');
    expect(source).toContain('candidates [--published N ...]');
    expect(source).toContain('without printing `Published specs:` or `Next step:`');
    expect(source).not.toContain('gh issue list --state open');
    expect(source).not.toContain('refs/remotes/origin');
    expect(source).not.toContain('/skill:');
  });

  it('automated skills do not invoke user-input tools', () => {
    for (const name of AUTOMATED) {
      const source = read(`workflows/${name}/WORKFLOW.md`);
      const executableInstructions = source.replaceAll('Never call `ask`.', '');
      expect(`${name}\n${executableInstructions}`).not.toMatch(/\bask\b/);
      expect(source).not.toContain('request_user_input');
    }
  });
});
