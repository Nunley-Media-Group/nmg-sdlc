import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySteeringPlan, createInitializePlan, inspectSteering } from '../sdlc-steering.mjs';
import { loadSteeringRuntime, projectPromptFragments } from '../../src/sdlc-steering-runtime.mjs';

import { defaultPromptRegistry, renderPrompt } from '../../src/sdlc-prompt-snippets.mjs';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-steering-'));
  fs.mkdirSync(path.join(root, 'steering'), { recursive: true });
  fs.writeFileSync(path.join(root, 'steering', 'retrospective.md'), 'keep\n');
  fs.writeFileSync(path.join(root, 'steering', 'unknown.txt'), 'unknown\n');
  return root;
}
function plan(root, options = {}) {
  return createInitializePlan(root, {
    snippets: options.snippets ?? [{ id: 'project.tech', path: 'steering/snippets/project-tech.md', consumers: ['worker:implement'], slot: 'body', order: 500, content: 'Use focused tests.\n' }],
    validations: options.validations ?? [],
  });
}

describe('managed steering runtime', () => {
  it('initializes exactly four managed modules and preserves project files', async () => {
    const root = fixture();
    const result = await applySteeringPlan(root, plan(root));
    expect(result.ok).toBe(true);
    const runtime = await loadSteeringRuntime(root);
    expect([...runtime.modules.keys()]).toEqual(['product', 'tech', 'structure', 'verification']);
    expect(fs.readFileSync(path.join(root, 'steering', 'retrospective.md'), 'utf8')).toBe('keep\n');
    expect(fs.readFileSync(path.join(root, 'steering', 'unknown.txt'), 'utf8')).toBe('unknown\n');
    expect(projectPromptFragments(runtime)).toEqual([expect.objectContaining({ provider: 'project:project.tech', source: 'steering/snippets/project-tech.md' })]);
    const rendered = renderPrompt(defaultPromptRegistry(repoRoot, { projectRoot: root }), {
      consumer: 'worker:implement',
      vars: { step: 'implement', issue: '42', controllerRunId: 'run-42', handoffPath: '.omp/sdlc/handoffs/42-implement.json' },
    });
    expect(rendered.text).toContain('Use focused tests.');
    expect(rendered.provenance.fragments).toContainEqual(expect.objectContaining({
      id: 'project.tech',
      provider: 'project:project.tech',
      source: 'steering/snippets/project-tech.md',
    }));
  });

  it('writes and renders the canonical project snippet schema', async () => {
    const root = fixture();
    await applySteeringPlan(root, plan(root));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'steering', 'manifest.json'), 'utf8'));
    expect(Object.keys(manifest.snippets[0]).sort()).toEqual(['consumers', 'id', 'order', 'path', 'slot']);

    const runtime = await loadSteeringRuntime(root);
    const [fragment] = projectPromptFragments(runtime);
    expect(Object.keys(fragment).sort()).toEqual(['body', 'consumers', 'id', 'order', 'provider', 'slot', 'source']);
    expect(renderPrompt(defaultPromptRegistry(repoRoot, { projectRoot: root }), {
      consumer: 'worker:implement',
      vars: { step: 'implement', issue: '42', controllerRunId: 'run-42', handoffPath: '.omp/sdlc/handoffs/42-implement.json' },
    }).text).toContain('Use focused tests.');
  });

  it('rejects leftover project byteBound values as unknown keys', async () => {
    const root = fixture();
    await applySteeringPlan(root, plan(root));
    const manifestPath = path.join(root, 'steering', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.snippets[0].byteBound = 1;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await expect(loadSteeringRuntime(root)).rejects.toMatchObject({
      reasonCode: 'steering_manifest_unknown_key',
    });
  });

  it('rejects stale plans before mutating live steering', async () => {
    const root = fixture();
    const approved = plan(root);
    fs.writeFileSync(path.join(root, 'steering', 'unknown.txt'), 'changed\n');
    await expect(applySteeringPlan(root, approved)).rejects.toMatchObject({ reasonCode: 'steering_plan_stale' });
    expect(fs.existsSync(path.join(root, 'steering', 'manifest.json'))).toBe(false);
  });

  it('leaves live steering unchanged when staged validation fails', async () => {
    const root = fixture();
    const invalid = plan(root);
    const manifestAction = invalid.actions.find(({ path: target }) => target === 'steering/manifest.json');
    const manifest = JSON.parse(manifestAction.content);
    manifest.unknown = true;
    manifestAction.content = `${JSON.stringify(manifest, null, 2)}\n`;
    await expect(applySteeringPlan(root, invalid)).rejects.toMatchObject({ reasonCode: 'steering_manifest_unknown_key' });
    expect(fs.existsSync(path.join(root, 'steering', 'manifest.json'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'steering', 'unknown.txt'), 'utf8')).toBe('unknown\n');
  });

  it.each([
    ['unknown key', (manifest) => { manifest.extra = true; }, 'steering_manifest_unknown_key'],
    ['null snippet', (manifest) => { manifest.snippets[0] = null; }, 'steering_manifest_invalid'],
    ['array snippet', (manifest) => { manifest.snippets[0] = []; }, 'steering_manifest_invalid'],
    ['primitive snippet', (manifest) => { manifest.snippets[0] = 1; }, 'steering_manifest_invalid'],
    ['duplicate snippet id', (manifest) => { manifest.snippets.push({ ...manifest.snippets[0] }); }, 'steering_duplicate_id'],
    ['escaping snippet path', (manifest) => { manifest.snippets[0].path = '../outside.md'; }, 'steering_path_outside_root'],
    ['unresolved provider', (manifest) => { manifest.validations.push({ id: 'x', provider: 'project.missing', required: true, when: { kind: 'always' }, config: {} }); }, 'steering_provider_unresolved'],
  ])('fails closed for %s', async (_name, mutate, reasonCode) => {
    const root = fixture();
    const approved = plan(root);
    await applySteeringPlan(root, approved);
    const manifestPath = path.join(root, 'steering', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    mutate(manifest);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await expect(loadSteeringRuntime(root)).rejects.toMatchObject({ reasonCode });
  });

  it.each([
    ['path-qualified shell', { kind: 'always' }, '/bin/bash'],
    ['absolute include glob', { kind: 'changed_paths', include: ['/src/**'] }, process.execPath],
    ['absolute exclude glob', { kind: 'changed_paths', include: ['src/**'], exclude: ['/src/generated/**'] }, process.execPath],
  ])('rejects %s', async (_name, when, program) => {
    const root = fixture();
    const approved = plan(root, {
      validations: [{
        id: 'invalid.command',
        provider: 'builtin.command',
        required: true,
        when,
        config: { program, args: [], cwd: '.', env: [] },
      }],
    });
    await expect(applySteeringPlan(root, approved)).rejects.toMatchObject({
      reasonCode: expect.stringMatching(/^steering_(condition|validation_config)_invalid$/),
    });
  });

  it('accepts missing timeoutMs and strips a legacy value from runtime registrations', async () => {
    const root = fixture();
    const approved = plan(root, {
      validations: [{
        id: 'valid.command',
        provider: 'builtin.command',
        required: true,
        when: { kind: 'always' },
        config: { program: process.execPath, args: [], cwd: '.', env: [] },
      }],
    });
    await applySteeringPlan(root, approved);
    const manifestPath = path.join(root, 'steering', 'manifest.json');
    const current = await loadSteeringRuntime(root);
    expect(current.validations[0]).not.toHaveProperty('timeoutMs');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.validations[0].timeoutMs = 1;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const legacy = await loadSteeringRuntime(root);
    expect(legacy.validations[0]).not.toHaveProperty('timeoutMs');
  });

  it('rejects approved actions outside managed runtime scope', async () => {
    const root = fixture();
    const approved = plan(root);
    approved.actions.push({ op: 'write', path: 'steering/unknown.txt', content: 'replace\n' });
    await expect(applySteeringPlan(root, approved)).rejects.toMatchObject({ reasonCode: 'steering_apply_failed' });
    expect(fs.readFileSync(path.join(root, 'steering', 'unknown.txt'), 'utf8')).toBe('unknown\n');
  });

  it('rejects staged ancestor symlinks without changing their targets', async () => {
    const root = fixture();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-steering-outside-'));
    fs.symlinkSync(outside, path.join(root, 'steering', 'snippets'));
    const approved = plan(root);

    await expect(applySteeringPlan(root, approved)).rejects.toMatchObject({
      reasonCode: 'steering_apply_failed',
    });
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('reports uninitialized state without writing', async () => {
    const root = fixture();
    expect(await inspectSteering(root)).toEqual(expect.objectContaining({ ok: true, state: 'uninitialized' }));
    expect(fs.readdirSync(path.join(root, 'steering')).sort()).toEqual(['retrospective.md', 'unknown.txt']);
  });

  it('ships valid managed templates', async () => {
    const root = fixture();
    const approved = createInitializePlan(root);
    for (const action of approved.actions.filter(({ template }) => template)) {
      action.template = path.relative(repoRoot, path.resolve(repoRoot, action.template));
    }
    await expect(applySteeringPlan(root, approved)).resolves.toMatchObject({ ok: true });
  });
});
