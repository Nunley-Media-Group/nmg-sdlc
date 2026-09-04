import { describe, expect, test } from '@jest/globals';

import {
  buildDeliveryPullRequestBody,
  createLocalGithubAdapter,
  evaluateContributionEvidence,
} from '../contribution-evidence.mjs';

function repositoryFiles() {
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
    'specs/42-delivery/verification-report.md': '# Verification\n\n`npm test` — passed\n',
  }));
}

async function evaluate(body, changedPaths) {
  const files = repositoryFiles();
  return evaluateContributionEvidence({
    title: 'fix: close delivery evidence gaps',
    body,
    changedPaths,
    readText: async (requestedPath) => files.get(requestedPath) ?? '',
    pathExists: async (requestedPath) => files.has(requestedPath),
  });
}

test('local GitHub adapter returns changed paths through listFiles and paginate', async () => {
  const changedPaths = ['scripts/sdlc-deliver.mjs', 'VERSION'];
  const github = createLocalGithubAdapter({
    changedPaths,
    readText: async () => '',
    pathExists: async () => false,
  });

  await expect(github.rest.pulls.listFiles()).resolves.toEqual({
    data: changedPaths.map((filename) => ({ filename })),
  });
  await expect(github.paginate(github.rest.pulls.listFiles, {
    owner: 'local',
    repo: 'repository',
    pull_number: 1,
  })).resolves.toEqual(changedPaths.map((filename) => ({ filename })));
});

describe('delivery contribution evidence', () => {
  test('builds a body that maps implementation and version paths through the canonical gate', async () => {
    const changedPaths = ['scripts/sdlc-deliver.mjs', 'VERSION', 'package.json'];
    const body = buildDeliveryPullRequestBody({
      issue: 42,
      specRelative: 'specs/42-delivery',
      changedPaths,
      verificationReport: '# Verification\n\n`npm test` — passed\n',
    });

    await expect(evaluate(body, changedPaths)).resolves.toEqual({ ok: true, errors: [] });
  });

  test('reports missing steering and unmatched paths in the former generated body', async () => {
    const changedPaths = ['scripts/sdlc-deliver.mjs', 'VERSION', 'package.json'];
    const body = 'Closes #42\n\nSpec: specs/42-delivery/\n\n## Verification\n`specs/42-delivery/verification-report.md`\n';
    const result = await evaluate(body, changedPaths);

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Missing steering evidence');
    expect(result.errors.join('\n')).toContain('Unmatched changed paths');
  });
});
