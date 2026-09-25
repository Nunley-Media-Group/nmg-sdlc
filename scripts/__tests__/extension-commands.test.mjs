import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('extension sdlc- commands', () => {
  it('registers only sdlc-prefixed public commands', () => {
    const source = read('src/extension.ts');
    const helpers = read('src/sdlc-commands.mjs');

    expect(helpers).toContain('["sdlc-draft-issue", "draft-issue"');
    expect(helpers).toContain('["sdlc-write-spec", "write-spec"');
    expect(helpers).toContain('["sdlc-onboard-project", "onboard-project"');
    expect(helpers).toContain('["sdlc-upgrade-project", "upgrade-project"');
    expect(helpers).toContain('["sdlc-run-retro", "run-retro"');
    expect(helpers).toContain('["sdlc-execute", "execute"');
    expect(helpers).toContain('["sdlc-status", "status"');
    expect(helpers).toContain('["sdlc-verify-code", "verify-code"');
    expect(helpers).toContain('["sdlc-open-pr", "open-pr"');
    expect(source).toContain('pi.registerCommand(name');
    expect(source).toContain('process.env.NMG_SDLC_PLUGIN_ROOT = packageRoot');
    expect(source).toContain('resolvePluginController("sdlc-deliver.mjs"');
    expect(source).not.toMatch(/registerCommand\("(execute|draft-issue|write-spec)"/);
  });

  it('materializes controller paths used by registered handlers and automated runtime prompts', async () => {
    const source = read('src/extension.ts');
    const {
      materializeControllerPaths,
      materializeRuntimeMessages,
      packageRoot,
      withArguments,
      workflowBody,
    } = await import('../../src/sdlc-commands.mjs');
    expect(source).toContain('rewriteInteractiveInput(`/${name}${args ? ` ${args}` : \"\"}`');
    expect(source).not.toContain('materializeControllerPaths(workflowBody(skill), packageRoot)');
    expect(source).toContain('materializeRuntimeMessages(context.messages, packageRoot)');

    const interactive = `/plan\n\n${withArguments(
      materializeControllerPaths(workflowBody('upgrade-project'), packageRoot),
      '#252',
    )}`;
    const projectCommands = [
      'node scripts/check-gate.mjs',
      'node "/opt/consumer/scripts/check-gate.mjs"',
      String.raw`node "C:\consumer\scripts\check-gate.mjs"`,
    ];
    const runtime = materializeRuntimeMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-status.mjs" --project .' }],
      },
      ...projectCommands.map((content) => ({ role: 'assistant', content })),
      { role: 'user', content: 'node <plugin-root>/scripts/missing.mjs' },
      { role: 'user', content: String.raw`node "\\foreign\plugins\nmg-sdlc\scripts\missing.mjs"` },
    ], packageRoot);
    const upgradeController = JSON.stringify(path.join(repoRoot, 'scripts', 'sdlc-upgrade.mjs'));
    const statusController = JSON.stringify(path.join(repoRoot, 'scripts', 'sdlc-status.mjs'));
    expect(interactive).toContain(`["node",${upgradeController},"apply"`);
    expect(interactive).not.toContain('<plugin-root>');
    expect(runtime[0].content[0].text).toBe(`node ${statusController} --project .`);
    for (const [index, command] of projectCommands.entries()) {
      expect(runtime[index + 1].content).toBe(command);
    }
    expect(runtime.at(-2).content).toBe('node <plugin-root>/scripts/missing.mjs');
    expect(runtime.at(-1).content).toBe(String.raw`node "\\foreign\plugins\nmg-sdlc\scripts\missing.mjs"`);
  });


  it('package omp declares extensions and no skills key', () => {
    const manifest = JSON.parse(read('package.json'));
    expect(manifest.omp.extensions).toEqual(['./src/extension.ts']);
    expect(manifest.omp).not.toHaveProperty('skills');
    expect(fs.existsSync(path.join(repoRoot, 'skills'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, '.claude-plugin'))).toBe(false);
    expect(fs.existsSync(path.join(
      repoRoot,
      'workflows/address-pr-comments/references/fetch-threads.md;skills/address-pr-comments/references/fix-loop.md;skills/address-pr-comments/references/polling.md',
    ))).toBe(false);
    expect(fs.existsSync(path.join(
      repoRoot,
      'workflows/start-issue/references/milestone-selection.md;skills/start-issue/references/stale-remote-branch.md;skills/start-issue/references/project-status.md',
    ))).toBe(false);
  });

  it('queues one follow-up plan turn per completed publication tool call', () => {
    const extensionUrl = pathToFileURL(path.join(repoRoot, 'src', 'extension.ts')).href;
    const helper = JSON.stringify(path.join(repoRoot, 'scripts', 'publish-approved-spec.mjs'));
    const fixture = `
      const { default: installExtension } = await import(${JSON.stringify(extensionUrl)});
      const handlers = new Map();
      const messages = [];
      const pi = {
        appendEntry() {},
        getActiveTools() { return []; },
        on(name, handler) {
          const registered = handlers.get(name) ?? [];
          registered.push(handler);
          handlers.set(name, registered);
        },
        registerCommand() {},
        sendUserMessage(content, options) { messages.push({ content, options }); },
        setActiveTools: async () => {},
        setLabel() {},
      };
      installExtension(pi);
      const publish = {
        type: 'tool_result',
        toolName: 'bash',
        toolCallId: 'publish-400',
        input: {
          command: ${JSON.stringify(`node ${helper} merge --issue 400 --dir specs/400-restore-per-spec-plan-approval-and-ci-gated-merge-waiting`)},
        },
        content: [{ type: 'text', text: '{"ok":true,"merged":true,"pr":401}' }],
        isError: false,
      };
      const toolResult = handlers.get('tool_result')[0];
      toolResult(publish);
      toolResult(publish);
      toolResult({
        ...publish,
        toolCallId: 'publish-400-failed',
        content: [{ type: 'text', text: '{"ok":false,"reasonCode":"pr_merge_failed"}' }],
        isError: true,
      });
      process.stdout.write(JSON.stringify(messages));
    `;
    const exercised = spawnSync(process.execPath, ['--input-type=module', '--eval', fixture], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, NMG_SDLC_REVIEW_SLICE: '' },
    });
    expect(exercised.stderr).toBe('');
    expect(exercised.status).toBe(0);
    const messages = JSON.parse(exercised.stdout);
    expect(messages).toHaveLength(1);
    expect(messages[0].content.startsWith('/plan\n\n')).toBe(true);
    expect(messages[0].options).toEqual({ deliverAs: 'followUp' });
  });
});
