import { describe, expect, it } from '@jest/globals';

import {
  buildDeliveryPullRequestBody,
  evaluateContributionEvidence,
} from '../contribution-evidence.mjs';

const REPORT_HEADING = '### Results (`npm test` passed)';
const CHANGED_PATHS = ['scripts/sdlc-deliver.mjs', 'VERSION', 'package.json', '.claude-plugin/plugin.json'];
const GATE_HEADING_RULE = /^\s*#{1,6}\s+(.+?)\s*$/;
const INDENTED_HEADINGS = [
  ['four spaces', `    ${REPORT_HEADING}`],
  ['eight spaces', `        ${REPORT_HEADING}`],
  ['one tab', `\t${REPORT_HEADING}`],
];

function reportWith(line) {
  return `# Verification\n\n${line}\n\n\`npm test\` — passed\n`;
}

function repositoryFiles(report) {
  return new Map(Object.entries({
    'CONTRIBUTING.md': '# Contributing\n',
    'steering/manifest.json': '{}\n',
    'steering/modules/product.mjs': 'export default {};\n',
    'steering/modules/tech.mjs': 'export default {};\n',
    'steering/modules/structure.mjs': 'export default {};\n',
    'steering/modules/verification.mjs': 'export default {};\n',
    'specs/42-delivery/requirements.md': '**Issue**: #42\n**Status**: Approved\n',
    'specs/42-delivery/design.md': '**Issue**: #42\n**Status**: Approved\n',
    'specs/42-delivery/tasks.md': '**Issue**: #42\n**Status**: Approved\n',
    'specs/42-delivery/feature.gherkin': '# Issue #42\nFeature: Delivery\n',
    'specs/42-delivery/verification-report.md': report,
  }));
}

function buildBody(report) {
  return buildDeliveryPullRequestBody({
    issue: 42,
    specRelative: 'specs/42-delivery',
    changedPaths: CHANGED_PATHS,
    verificationReport: report,
  });
}

function evaluate(body, report) {
  const files = repositoryFiles(report);
  return evaluateContributionEvidence({
    title: 'fix: exclude indented report headings from delivery bodies',
    body,
    changedPaths: CHANGED_PATHS,
    readText: async (requestedPath) => files.get(requestedPath) ?? '',
    pathExists: async (requestedPath) => files.has(requestedPath),
  });
}

describe('@SCN001 indented heading lines are not copied (#602 AC1)', () => {
  it.each(INDENTED_HEADINGS)('drops the heading indented by %s and leaves only "## Verification" as a gate heading', (_label, line) => {
    const body = buildBody(reportWith(line));
    const lines = body.split('\n');

    expect(lines).not.toContain(line);
    expect(lines.filter((bodyLine) => GATE_HEADING_RULE.test(bodyLine))).toEqual(['## Verification']);
  });
});

describe('@SCN002 the changed-path list stays verification evidence (#602 AC2)', () => {
  it('matches every changed path and passes the contribution evidence check', async () => {
    const report = reportWith(`    ${REPORT_HEADING}`);

    await expect(evaluate(buildBody(report), report)).resolves.toEqual({ ok: true, errors: [] });
  });
});

describe('@SCN003 command results are still copied (#602 AC3)', () => {
  it.each([
    ['- `npm test` — passed'],
    ['| `git diff --check` | Pass |'],
    ['    - `npm test` — passed'],
  ])('keeps the report line %s unchanged in the Verification section before "Changed paths:"', (line) => {
    const lines = buildBody(`# Verification\n\n${line}\n`).split('\n');
    const verificationStart = lines.indexOf('## Verification');
    const changedPathsStart = lines.indexOf('Changed paths:');
    const lineIndex = lines.indexOf(line);

    expect(lineIndex).toBeGreaterThan(verificationStart);
    expect(lineIndex).toBeLessThan(changedPathsStart);
  });
});
