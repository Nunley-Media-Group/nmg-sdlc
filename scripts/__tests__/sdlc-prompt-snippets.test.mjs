import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPromptSnippetRegistry,
  defaultPromptRegistry,
  pluginPathsNote,
  pluginPromptFragments,
  registerPromptSnippet,
  registerValidatedProjectSnippets,
  renderPrompt,
  writePromptProvenance,
} from '../../src/sdlc-prompt-snippets.mjs';
import { renderInteractiveWorkflow } from '../../src/sdlc-commands.mjs';
import { workflowBody } from '../../src/sdlc-workflows.mjs';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function builtin(overrides = {}) {
  return {
    id: 'test.fragment',
    provider: 'plugin',
    source: 'builtin:test.fragment',
    consumers: ['sdlc-write-spec'],
    slot: 'body',
    order: 100,
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

  it('renders the shared execute contract after both workflow bodies with provenance', () => {
    const registry = defaultPromptRegistry(repoRoot);
    const executeContract = fs.readFileSync(
      path.join(repoRoot, 'references/execute-implementable-requirements.md'),
      'utf8',
    );
    for (const [consumer, workflow] of [
      ['sdlc-draft-issue', 'draft-issue'],
      ['sdlc-write-spec', 'write-spec'],
    ]) {
      const rendered = renderPrompt(registry, { consumer });
      expect(rendered.text).toBe(`${pluginPathsNote([workflow])}\n${workflowBody(workflow, repoRoot)}\n${executeContract}`);
      expect(rendered.provenance.fragments.map(({ id, source, order }) => ({
        id,
        source,
        order,
      }))).toEqual([
        {
          id: `plugin.paths.${consumer}`,
          source: `builtin:plugin.paths.${consumer}`,
          order: 50,
        },
        {
          id: `plugin.workflow.${workflow}`,
          source: `workflows/${workflow}/WORKFLOW.md`,
          order: 100,
        },
        {
          id: 'plugin.reference.execute-implementable-requirements',
          source: 'references/execute-implementable-requirements.md',
          order: 150,
        },
      ]);
      expect(rendered.provenance.fragments[2].byteCount)
        .toBe(Buffer.byteLength(executeContract));
    }

    const consumers = pluginPromptFragments()
      .find(({ id }) => id === 'plugin.reference.execute-implementable-requirements')
      .consumers;
    expect(consumers).toEqual(['sdlc-draft-issue', 'sdlc-write-spec']);
  });

  it('renders the exact worker header', () => {
    const registry = defaultPromptRegistry(repoRoot);
    const rendered = renderPrompt(registry, {
      consumer: 'worker:start',
      vars: {
        step: 'start',
        issue: '42',
        controllerRunId: 'run-42',
        handoffPath: '.nmg-sdlc/handoffs/42-start.json',
      },
    });
    expect(rendered.text).toBe([
      'nmg-sdlc start worker for #42: a Herdr Claude worker started by /sdlc-execute.',
      'Execute this inlined workflow for #42 without questions: never call AskUserQuestion, EnterPlanMode, or ExitPlanMode.',
      'Write and validate the handoff, then stop.',
      '',
      '$ARGUMENTS: #42',
      'Controller run id: run-42',
      'Handoff path: .nmg-sdlc/handoffs/42-start.json',
      'Before printing the marker, run: node ' + '<plugin-root>' + '/scripts/sdlc-execute.mjs validate-handoff --file .nmg-sdlc/handoffs/42-start.json',
      'Only after validation succeeds print exactly: NMG_SDLC_HANDOFF: .nmg-sdlc/handoffs/42-start.json',
      'Before ending any turn while a background command for this step is still running, write .nmg-sdlc/handoffs/42-start.json.waiting naming that command; the controller keeps this session open and you are resumed when it finishes. Ending a turn with neither the handoff nor that file means the step stopped.',
      'This checkout is shared with the controller, which depends on its current branch and HEAD. Never switch its branch or move HEAD to read another ref, such as the default branch: read other refs with `git show <ref>:<path>`, `git diff <ref>...HEAD`, or a separate `git worktree`. Only the start stage checks out the issue branch it creates.',
      '',
      pluginPathsNote(['start-issue']),
      workflowBody('start-issue', repoRoot),
    ].join('\n'));
  });

  it('renders the worker header for a production UUID and multi-digit issue', () => {
    const issue = '10000';
    const handoffPath = `.nmg-sdlc/handoffs/${issue}-implement.json`;
    const rendered = renderPrompt(defaultPromptRegistry(repoRoot), {
      consumer: 'worker:implement',
      vars: {
        step: 'implement',
        issue,
        controllerRunId: '123e4567-e89b-12d3-a456-426614174000',
        handoffPath,
      },
    });
    expect(rendered.text).toContain(`Handoff path: ${handoffPath}`);
  });

  it('renders and materializes the steering command controller paths', () => {
    const text = renderInteractiveWorkflow('sdlc-steering', repoRoot, '');
    expect(text).toContain(`node "${path.join(repoRoot, 'scripts', 'sdlc-steering.mjs')}" inspect --project .`);
    expect(text).not.toContain('<plugin-root>/scripts/');
    expect(text).not.toContain('{{pluginRoot}}');
  });

  it('states where relative workflow and shared reference paths resolve', () => {
    const note = pluginPathsNote(['write-code', 'simplify']);
    expect(note).toContain('resolve under `<plugin-root>/workflows/write-code/`');
    expect(note).toContain('resolve under `<plugin-root>/workflows/simplify/`');
    expect(note).toContain('`../../references/...` resolves under `<plugin-root>/references/`');
    expect(note).toContain('a path beginning `workflows/` resolves under `<plugin-root>/`');

    const implement = renderPrompt(defaultPromptRegistry(repoRoot), {
      consumer: 'worker:implement',
      vars: { step: 'implement', issue: '7', controllerRunId: 'run-7', handoffPath: '.nmg-sdlc/handoffs/7-implement.json' },
    }).text;
    expect(implement).toContain(note);
    expect(implement.indexOf(note)).toBeLessThan(implement.indexOf('# Write Code'));

    const fragments = pluginPromptFragments();
    for (const consumer of ['sdlc-draft-issue', 'sdlc-write-spec', 'sdlc-execute', 'sdlc-status', 'worker:start', 'worker:verify', 'worker:deliver']) {
      expect(fragments.some(({ id }) => id === `plugin.paths.${consumer.replace(':', '-')}`)).toBe(true);
    }
  });

  it('forbids every execute worker from moving the shared checkout to read another ref (#491)', () => {
    for (const step of ['start', 'implement', 'verify', 'deliver']) {
      const text = renderPrompt(defaultPromptRegistry(repoRoot), {
        consumer: `worker:${step}`,
        vars: { step, issue: '7', controllerRunId: 'run-7', handoffPath: `.nmg-sdlc/handoffs/7-${step}.json` },
      }).text;
      expect(text).toContain('Never switch its branch or move HEAD to read another ref, such as the default branch');
      expect(text).toContain('`git show <ref>:<path>`, `git diff <ref>...HEAD`, or a separate `git worktree`');
    }
  });

  it('loads project snippets with Node when the plugin host is not Node', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-compiled-host-'));
    const originalExecPath = process.execPath;
    const policy = 'Keep issue delivery scoped to the approved project contract.';
    try {
      await applySteeringPlan(projectRoot, createInitializePlan(projectRoot, {
        snippets: [{
          id: 'project.product',
          path: 'steering/snippets/project-product.md',
          consumers: ['sdlc-draft-issue'],
          slot: 'body',
          order: 500,
          content: `${policy}\n`,
        }],
        validations: [],
      }));
      process.execPath = path.join(os.tmpdir(), 'compiled-claude-host');
      const text = renderInteractiveWorkflow('sdlc-draft-issue', repoRoot, projectRoot);
      expect(text).toContain('# Draft Issue');
      expect(text).toContain(policy);
    } finally {
      process.execPath = originalExecPath;
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('registers project snippets larger than the former bound', () => {
    const registry = createPromptSnippetRegistry();
    const body = 'x'.repeat(8193);
    expect(() => registerValidatedProjectSnippets(registry, [{
      id: 'project.large',
      provider: 'project:project.large',
      source: 'steering/snippets/project-large.md',
      consumers: ['worker:implement'],
      slot: 'body',
      order: 500,
      body,
    }])).not.toThrow();
    expect(renderPrompt(registry, { consumer: 'worker:implement' }).text).toBe(body);
  });

  it('registers and renders plugin fragments without a size ceiling', () => {
    const registry = createPromptSnippetRegistry();
    const body = `prefix ${'x'.repeat(100_000)} {{value}}`;
    registerPromptSnippet(registry, builtin({ body }));
    const rendered = renderPrompt(registry, {
      consumer: 'sdlc-write-spec',
      vars: { value: 'expanded' },
    });
    expect(rendered.text).toBe(body.replace('{{value}}', 'expanded'));
    expect(rendered.provenance.byteCount).toBe(Buffer.byteLength(rendered.text));
  });

  it('renders repair commands from plugin prompts when project steering is invalid', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-invalid-steering-'));
    fs.mkdirSync(path.join(projectRoot, 'steering'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'steering', 'manifest.json'), '{ invalid\n');

    const repaired = renderInteractiveWorkflow('sdlc-steering', repoRoot, projectRoot);
    expect(repaired).toContain('# Manage Steering');
    expect(() => renderInteractiveWorkflow('sdlc-write-spec', repoRoot, projectRoot))
      .toThrow('project_runtime_invalid');
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

  it('loads only regular files contained by workflows or the root references subtree', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-snippet-roots-'));
    const workflows = path.join(tempRoot, 'workflows');
    const references = path.join(tempRoot, 'references');
    const outside = path.join(tempRoot, 'outside.md');
    fs.mkdirSync(workflows);
    fs.mkdirSync(references);
    fs.writeFileSync(outside, 'outside');
    fs.writeFileSync(path.join(references, 'allowed.md'), 'reference bytes');

    const registry = createPromptSnippetRegistry();
    registerPromptSnippet(
      registry,
      fileBacked({ id: 'allowed-reference', source: 'references/allowed.md' }),
      tempRoot,
    );
    expect(renderPrompt(registry, { consumer: 'sdlc-write-spec' }).text)
      .toBe('reference bytes');

    expectReason('path_outside_root', () => registerPromptSnippet(
      createPromptSnippetRegistry(),
      fileBacked({ id: 'absolute', source: outside }),
      tempRoot,
    ));
    expectReason('missing_source', () => registerPromptSnippet(
      createPromptSnippetRegistry(),
      fileBacked({ id: 'directory', source: 'references' }),
      tempRoot,
    ));

    const escape = path.join(references, 'escape.md');
    fs.symlinkSync(outside, escape);
    expectReason('path_outside_root', () => registerPromptSnippet(
      createPromptSnippetRegistry(),
      fileBacked({ id: 'symlink-escape', source: 'references/escape.md' }),
      tempRoot,
    ));
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
      createPromptSnippetRegistry(), { ...builtin(), byteBound: 1 },
    ));
    expectReason('empty_body', () => registerPromptSnippet(
      createPromptSnippetRegistry(), builtin({ body: '' }),
    ));
    expectReason('empty_body', () => renderPrompt(createPromptSnippetRegistry(), {
      consumer: 'sdlc-write-spec',
    }));

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
      vars: {
        step: 'start',
        issue: '42',
        controllerRunId: 'run-42',
        handoffPath: '.nmg-sdlc/handoffs/42-start.json',
      },
    });
    writePromptProvenance(projectRoot, provenance);
    const sidecar = path.join(
      projectRoot,
      '.nmg-sdlc/prompt-provenance/worker-start.json',
    );
    expect(JSON.parse(fs.readFileSync(sidecar, 'utf8'))).toEqual(provenance);
    expectReason('provenance_write_failed', () => writePromptProvenance(
      path.join(projectRoot, 'missing', 'file\0'), provenance,
    ));
  });
});
