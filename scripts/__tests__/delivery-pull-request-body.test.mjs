import { describe, expect, it } from '@jest/globals';

import {
  buildDeliveryPullRequestBody,
  evaluateContributionEvidence,
} from '../contribution-evidence.mjs';

const REPORT_HEADING = '### Review Findings (all `info`, carried from the passed review)';
const CHANGED_PATHS = ['scripts/sdlc-deliver.mjs', 'VERSION', 'package.json', '.claude-plugin/plugin.json'];
const HEADING_LINE = /^ {0,3}#{1,6}(?:\s|$)/;

function reportWithHeading() {
  return `# Verification\n\n${REPORT_HEADING}\n\n\`npm test\` — passed\n`;
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
    title: 'fix: keep report headings out of delivery bodies',
    body,
    changedPaths: CHANGED_PATHS,
    readText: async (requestedPath) => files.get(requestedPath) ?? '',
    pathExists: async (requestedPath) => files.has(requestedPath),
  });
}

function verificationSection(body) {
  return body.slice(body.indexOf('## Verification'), body.indexOf('Changed paths:'));
}

describe('@SCN001 a report heading is not copied into the body (#597 AC1)', () => {
  it('leaves no Markdown heading in the body except the body Verification heading', () => {
    const headings = buildBody(reportWithHeading())
      .split('\n')
      .filter((line) => HEADING_LINE.test(line));

    expect(headings).toEqual(['## Verification']);
  });
});

describe('@SCN002 the changed-path list stays verification evidence (#597 AC2)', () => {
  it('matches every changed path and passes the contribution evidence check', async () => {
    const report = reportWithHeading();

    await expect(evaluate(buildBody(report), report)).resolves.toEqual({ ok: true, errors: [] });
  });
});

describe('@SCN003 command results are still copied (#597 AC3)', () => {
  it.each([
    ['- `npm test` — passed'],
    ['| `git diff --check` | Pass |'],
  ])('keeps the report line %s in the Verification section before "Changed paths:"', (line) => {
    const body = buildBody(`# Verification\n\n${line}\n`);

    expect(verificationSection(body)).toContain(line);
  });
});
