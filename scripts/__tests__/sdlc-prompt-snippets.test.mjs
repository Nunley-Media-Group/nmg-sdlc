import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED_CONSUMERS,
  COMMAND_CONSUMERS,
  WORKER_CONSUMERS,
  createPromptSnippetRegistry,
  defaultPromptRegistry,
  pluginPromptFragments,
  registerPromptSnippet,
  renderPrompt,
  writePromptProvenance,
} from '../../src/sdlc-prompt-snippets.mjs';
import {
  AUTOMATED_COMMANDS,
  INTERACTIVE_COMMANDS,
} from '../../src/sdlc-commands.mjs';
import { VALID_STEPS } from '../sdlc-execute.mjs';
import { workflowBody } from '../../src/sdlc-workflows.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function builtin(overrides = {}) {
  return {
    id: 'test.fragment',
    provider: 'plugin',
    source: 'builtin:test.fragment',
    consumers: ['sdlc-write-spec'],
    slot: 'body',
    order: 100,
    byteBound: 1024,
    body: 'body',
    ...overrides,
  };
}

function fileBacked(overrides = {}) {
  const { body: _body, ...fragment } = builtin(overrides);
  return fragment;
}

function expectReason(reasonCode, callback) {
  expect(callback).toThrow(new Error(reasonCode));
}

describe('prompt snippet registry', () => {
  it('keeps consumer lists synchronized with command and worker tables', () => {
    expect(COMMAND_CONSUMERS).toEqual([
      ...INTERACTIVE_COMMANDS.map(([name]) => name),
      ...AUTOMATED_COMMANDS.map(([name]) => name),
    ]);
    expect(WORKER_CONSUMERS).toEqual(VALID_STEPS.map((step) => `worker:${step}`));
    expect(ALLOWED_CONSUMERS).toEqual([...COMMAND_CONSUMERS, ...WORKER_CONSUMERS]);
  });

  it('ships exactly the built-in plugin catalog without project snippets', () => {
    const fragments = pluginPromptFragments();
    expect(fragments.map(({ id }) => id)).toEqual([
      'plugin.workflow.draft-issue',
      'plugin.workflow.write-spec',
      'plugin.workflow.onboard-project',
      'plugin.workflow.upgrade-project',
      'plugin.workflow.steering',
      'plugin.workflow.run-retro',
      'plugin.workflow.execute',
      'plugin.workflow.status',
      'plugin.workflow.verify-code',
      'plugin.workflow.open-pr',
      'plugin.workflow.start-issue',
      'plugin.workflow.write-code',
      'plugin.workflow.review-main',
      'plugin.workflow.apply-review',
      'plugin.workflow.simplify',
      'plugin.execute.selection',
      'plugin.worker.header',
    ]);
    expect(fragments.filter(({ source }) => !source.startsWith('builtin:'))
      .every(({ source }) => source.startsWith('workflows/'))).toBe(true);
    expect(defaultPromptRegistry(repoRoot).byId.size).toBe(17);
  });

  it('renders existing workflow text and the exact worker header', () => {
    const registry = defaultPromptRegistry(repoRoot);
    expect(renderPrompt(registry, { consumer: 'sdlc-write-spec' }).text)
      .toBe(workflowBody('write-spec', repoRoot));
    const rendered = renderPrompt(registry, {
      consumer: 'worker:start',
      vars: { step: 'start', issue: '42', handoffPath: '.omp/sdlc/handoffs/42-start.json' },
    });
    expect(rendered.text).toBe([
      'nmg-sdlc start worker for #42.',
      'Execute this inlined workflow for #42 without questions.',
      'Write and validate the handoff, then stop.',
      '',
      '$ARGUMENTS: #42',
      'Handoff path: .omp/sdlc/handoffs/42-start.json',
      'Before printing the marker, run: node ' + '<plugin-root>' + '/scripts/sdlc-execute.mjs validate-handoff --file .omp/sdlc/handoffs/42-start.json',
      'Only after validation succeeds print exactly: NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/42-start.json',
      '',
      workflowBody('start-issue', repoRoot),
    ].join('\n'));
  });

  it('sorts by order then id and records substituted fragment provenance', () => {
    const registry = createPromptSnippetRegistry();
    registerPromptSnippet(registry, builtin({ id: 'test.z', order: 20, body: 'second {{value}}' }));
    registerPromptSnippet(registry, builtin({ id: 'test.b', order: 10, body: 'first-b' }));
    registerPromptSnippet(registry, builtin({ id: 'test.a', order: 10, body: 'first-a' }));
    const { text, provenance } = renderPrompt(registry, {
      consumer: 'sdlc-write-spec',
      vars: { value: 7 },
    });
    expect(text).toBe('first-a\nfirst-b\nsecond 7');
    expect(provenance.consumer).toBe('sdlc-write-spec');
    expect(provenance.byteCount).toBe(Buffer.byteLength(text));
    expect(provenance.fragments.map(({ id }) => id)).toEqual(['test.a', 'test.b', 'test.z']);
    for (const fragment of provenance.fragments) {
      expect(fragment.provider).toBe('plugin');
      expect(fragment.source).toMatch(/^builtin:/);
      expect(fragment.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(fragment.byteCount).toBeGreaterThan(0);
    }
  });

  it('fails closed with every named registration and render reason code', () => {
    const registry = createPromptSnippetRegistry();
    registerPromptSnippet(registry, builtin());
    expectReason('duplicate_fragment_id', () => registerPromptSnippet(registry, builtin()));
    expect(registry.byId.size).toBe(1);

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-snippets-'));
    fs.mkdirSync(path.join(tempRoot, 'workflows'));
    expectReason('missing_source', () => registerPromptSnippet(
      createPromptSnippetRegistry(),
      fileBacked({ id: 'missing', source: 'workflows/missing.md' }),
      tempRoot,
    ));
    expectReason('path_outside_root', () => registerPromptSnippet(
      createPromptSnippetRegistry(),
      fileBacked({ id: 'outside', source: '../package.json' }),
      tempRoot,
    ));
    expectReason('disallowed_consumer', () => registerPromptSnippet(
      createPromptSnippetRegistry(), builtin({ consumers: ['worker:nope'] }),
    ));
    expectReason('disallowed_consumer', () => renderPrompt(registry, { consumer: 'worker:nope' }));
    expectReason('disallowed_slot', () => registerPromptSnippet(
      createPromptSnippetRegistry(), builtin({ slot: 'footer' }),
    ));
    expectReason('disallowed_provider', () => registerPromptSnippet(
      createPromptSnippetRegistry(), builtin({ provider: 'project' }),
    ));
    expectReason('unknown_key', () => registerPromptSnippet(
      createPromptSnippetRegistry(), { ...builtin(), extra: true },
    ));
    expectReason('unknown_key', () => registerPromptSnippet(
      createPromptSnippetRegistry(), { ...builtin(), byteBound: 0 },
    ));
    expectReason('empty_body', () => registerPromptSnippet(
      createPromptSnippetRegistry(), builtin({ body: '' }),
    ));
    expectReason('empty_body', () => renderPrompt(createPromptSnippetRegistry(), {
      consumer: 'sdlc-write-spec',
    }));
    expectReason('byte_bound_exceeded', () => registerPromptSnippet(
      createPromptSnippetRegistry(), builtin({ byteBound: 1 }),
    ));

    const placeholderRegistry = createPromptSnippetRegistry();
    registerPromptSnippet(placeholderRegistry, builtin({ body: '{{unknown}}' }));
    expectReason('unknown_placeholder', () => renderPrompt(placeholderRegistry, {
      consumer: 'sdlc-write-spec',
    }));
  });

  it('writes provenance sidecars below the requested project root', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-provenance-'));
    const { provenance } = renderPrompt(defaultPromptRegistry(repoRoot), {
      consumer: 'worker:start',
      vars: { step: 'start', issue: '42', handoffPath: '.omp/sdlc/handoffs/42-start.json' },
    });
    writePromptProvenance(projectRoot, provenance);
    const sidecar = path.join(
      projectRoot,
      '.omp/sdlc/prompt-provenance/worker-start.json',
    );
    expect(JSON.parse(fs.readFileSync(sidecar, 'utf8'))).toEqual(provenance);
    expectReason('provenance_write_failed', () => writePromptProvenance(
      path.join(projectRoot, 'missing', 'file\0'), provenance,
    ));
  });
});
