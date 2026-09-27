import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
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

  const extensionUrl = pathToFileURL(path.join(repoRoot, 'src', 'extension.ts')).href;
  const publishHelper = JSON.stringify(path.join(repoRoot, 'scripts', 'publish-approved-spec.mjs'));
  const hostFixture = `
      const { default: installExtension } = await import(${JSON.stringify(extensionUrl)});
      const helper = ${JSON.stringify(publishHelper)};
      class CustomEditor {}
      let sessions = 0;
      // One extension instance models one TUI process; its hosts model sessions.
      function extension() {
        const handlers = new Map();
        installExtension({
          on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
          registerCommand() {},
          sendUserMessage() { throw new Error('sendUserMessage must not carry the continuation'); },
          setLabel() {},
          pi: { CustomEditor },
        });
        return (name, event, ctx) => handlers.get(name).map((handler) => handler(event, ctx));
      }

      // Host model: the editor submit handler dispatches builtin /plan (toggling
      // an active plan off) and submits the remainder as a prompt in the new mode.
      // onSubmit applies a bare /plan as the host does: plan pauses (unless the
      // Exit plan mode? confirmation is declined) and plan_paused disables.
      function host({ mode = 'none', draft = '', focused = 'editor', submitThrows = false, hasUI = true, declineExit = false } = {}, emit = extension()) {
        const state = { entries: mode === 'none' ? [] : [{ type: 'mode_change', mode }], draft, prompts: [], notices: [], commands: [] };
        const currentMode = () => state.entries.at(-1)?.mode ?? 'none';
        const sessionId = 'session-' + (++sessions);
        const editor = new CustomEditor();
        editor.submit = () => {
          if (state.submitThrows) throw new Error('submit failed');
          let text = state.draft;
          state.draft = '';
          if (text.startsWith('/plan\\n\\n')) {
            state.entries.push({ type: 'mode_change', mode: currentMode() === 'plan' ? 'none' : 'plan' });
            text = text.slice('/plan\\n\\n'.length);
          }
          state.prompts.push({ mode: currentMode(), text });
        };
        editor.onSubmit = async (text) => {
          await Promise.resolve();
          if (state.submitThrows) throw new Error('submit failed');
          state.commands.push(text);
          if (text !== '/plan') throw new Error('unexpected command ' + text);
          const current = currentMode();
          if (current === 'plan' && state.declineExit) return;
          state.entries.push({ type: 'mode_change', mode: current === 'plan' ? 'plan_paused' : current === 'plan_paused' ? 'none' : 'plan' });
        };
        Object.assign(state, { submitThrows, declineExit, focused: focused === 'editor' ? editor : {} , hasUI });
        state.ctx = {
          get hasUI() { return state.hasUI; },
          sessionManager: { getEntries: () => state.entries, getSessionId: () => sessionId },
          ui: {
            notify: (message) => state.notices.push(message),
            getEditorText: () => state.draft,
            setEditorText: (text) => { state.draft = text; },
            setEditorComponent: (factory) => factory({ getFocused: () => state.focused }),
          },
        };
        state.setMode = (next) => state.entries.push({ type: 'mode_change', mode: next });
        state.emit = (name, event) => emit(name, event, state.ctx);
        state.extension = emit;
        return state;
      }
      const merge = (issue, toolCallId, text = '{"ok":true,"merged":true,"pr":' + (issue + 1) + '}', isError = false) => ({
        type: 'tool_result',
        toolName: 'bash',
        toolCallId,
        input: { command: 'node ' + helper + ' merge --issue ' + issue + ' --dir specs/' + issue + '-slug-' + issue },
        content: [{ type: 'text', text }],
        isError,
      });
      const summary = (state) => ({
        prompts: state.prompts.map(({ mode, text }) => ({ mode, head: text.split('\\n')[0], workflow: text.includes('## Continue loop') })),
        modes: state.entries.map(({ mode }) => mode),
        draft: state.draft,
        notices: state.notices.length,
      });
      const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  `;

  function runHostFixture(body) {
    const exercised = spawnSync(process.execPath, ['--input-type=module', '--eval', hostFixture + body], {
      cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-extension-')),
      encoding: 'utf8',
      env: { ...process.env, NMG_SDLC_REVIEW_SLICE: '' },
    });
    expect(exercised.stderr).toBe('');
    expect(exercised.status).toBe(0);
    return JSON.parse(exercised.stdout);
  }

  it('submits one plan-mode Continue prompt through the TUI editor after a terminal turn', () => {
    const out = runHostFixture(`
      const out = {};

      const a = host();
      a.emit('tool_result', merge(400, 'p400'));
      a.emit('tool_result', merge(400, 'p400'));
      a.emit('tool_result', merge(401, 'failed', '{"ok":false,"reasonCode":"pr_merge_failed"}', true));
      a.emit('tool_result', merge(403, 'malformed', '{"merged":true'));
      a.emit('tool_result', { ...merge(405, 'unrelated'), input: { command: 'printf done' } });
      a.emit('agent_end', { willContinue: true });
      out.nonterminal = summary(a);
      a.emit('agent_end', {});
      a.emit('agent_end', {});
      out.first = summary(a);
      a.setMode('none');
      a.emit('tool_result', merge(402, 'p402', '{"ok":false,"reasonCode":"default_checkout_failed","merged":true,"pr":403}', true));
      a.emit('agent_end', {});
      out.second = summary(a);

      const planned = host({ mode: 'plan' });
      planned.emit('tool_result', merge(410, 'p410'));
      planned.emit('agent_end', {});
      out.alreadyPlan = summary(planned);

      for (const [name, options] of [
        ['missingUI', { hasUI: false }],
        ['wrongFocus', { focused: 'selector' }],
        ['draft', { draft: 'my draft' }],
        ['submitThrows', { submitThrows: true }],
      ]) {
        const state = host(options);
        state.emit('tool_result', merge(420, name));
        state.emit('agent_end', {});
        out[name] = summary(state);
        Object.assign(state, { hasUI: true, submitThrows: false });
        if (name === 'wrongFocus') continue;
        if (name === 'draft') state.draft = '';
        state.emit('agent_end', {});
        out[name + 'Retry'] = summary(state);
      }

      // Plan approval clears into a new session of the same TUI process.
      const before = host();
      before.emit('tool_result', merge(430, 'p430'));
      before.emit('agent_end', {});
      const after = host({}, before.extension);
      after.emit('tool_result', merge(432, 'p432'));
      after.emit('agent_end', {});
      out.afterClear = summary(after);
      after.emit('input', { text: '/sdlc-write-spec 440', source: 'interactive' });
      after.emit('tool_result', merge(440, 'p440'));
      after.emit('agent_end', {});
      out.afterRestart = summary(after);
      process.stdout.write(JSON.stringify(out));
    `);
    const head = (numbers, names) => `Post-publication continuation. published[] = [${numbers}] (N-slug names: ${names}). Skip Initial issue selection and start ## Continue loop.`;
    const idle = { prompts: [], modes: [], draft: '', notices: 0 };

    expect(out.nonterminal).toEqual(idle);
    expect(out.first).toEqual({
      prompts: [{ mode: 'plan', head: head('400', '400-slug-400'), workflow: true }],
      modes: ['plan'],
      draft: '',
      notices: 0,
    });
    expect(out.second.prompts).toEqual([
      out.first.prompts[0],
      { mode: 'plan', head: head('400, 402', '400-slug-400, 402-slug-402'), workflow: true },
    ]);
    expect(out.second.modes).toEqual(['plan', 'none', 'plan']);
    expect(out.alreadyPlan).toEqual({
      prompts: [{ mode: 'plan', head: head('410', '410-slug-410'), workflow: true }],
      modes: ['plan'],
      draft: '',
      notices: 0,
    });
    expect(out.missingUI).toEqual({ ...idle, notices: 1 });
    expect(out.wrongFocus).toEqual({ ...idle, notices: 1 });
    expect(out.draft).toEqual({ ...idle, draft: 'my draft', notices: 1 });
    expect(out.submitThrows).toEqual({ ...idle, notices: 1 });
    const retried = { prompts: [{ mode: 'plan', head: head('420', '420-slug-420'), workflow: true }], modes: ['plan'], draft: '' };
    for (const name of ['missingUIRetry', 'draftRetry']) {
      expect(out[name]).toMatchObject(retried);
    }
    expect(out.submitThrowsRetry).toEqual({ ...retried, notices: 1 });
    expect(out.afterClear.prompts).toEqual([
      { mode: 'plan', head: head('430, 432', '430-slug-430, 432-slug-432'), workflow: true },
    ]);
    expect(out.afterRestart.prompts.at(-1)).toEqual(
      { mode: 'plan', head: head('440', '440-slug-440'), workflow: true },
    );
  });

  it('exits native plan mode after the write-spec Finished reply, at the plan-mode decision continuation', () => {
    const out = runHostFixture(`
      let asks = 0;
      const ask = (selectedOptions, extra = {}) => ({
        type: 'tool_result',
        toolName: 'ask',
        toolCallId: 'ask-' + (++asks),
        details: { selectedOptions, ...extra },
        isError: false,
      });
      const finishedLoop = ask(['Finished — stop writing specs']);
      const finishedInitial = ask(['Finished — stop without writing a spec']);
      const reply = { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Published specs: …' }] };
      const aborted = { role: 'assistant', stopReason: 'aborted', content: [] };
      // Host model of one turn: tool results reach the model, which replies
      // with text only. Native plan mode continues a text-only turn that
      // settles in plan mode (willContinue: true, forced decision). A /plan
      // dispatched meanwhile aborts that continuation, which then ends
      // terminally; otherwise the model re-asks.
      const turn = async (state, results) => {
        for (const result of results) await Promise.all(state.emit('tool_result', result));
        if (state.entries.at(-1)?.mode !== 'plan') {
          state.ends.push('terminal');
          state.emit('agent_end', { messages: [reply] });
          await flush();
          return;
        }
        state.ends.push('continued');
        state.emit('agent_end', { willContinue: true, messages: [reply] });
        await flush();
        if (state.entries.at(-1)?.mode === 'plan') {
          state.ends.push('reasked');
          return;
        }
        state.ends.push('aborted');
        state.emit('agent_end', { messages: [reply, aborted] });
        await flush();
      };
      const exitSummary = (state) => ({
        commands: [...state.commands],
        modes: state.entries.map(({ mode }) => mode),
        ends: [...state.ends],
        prompts: state.prompts.length,
        draft: state.draft,
        notices: [...state.notices],
      });
      const tracked = (state) => Object.assign(state, { ends: [] });
      const writeSpecSession = (options = {}) => {
        const state = tracked(host(options));
        state.emit('input', { text: '/sdlc-write-spec', source: 'interactive' });
        return state;
      };
      const out = {};

      // SCN001: the post-publication continuation enters plan mode; Finished exits it.
      const loop = tracked(host());
      loop.emit('tool_result', merge(450, 'p450'));
      loop.emit('agent_end', {});
      await turn(loop, [finishedLoop]);
      out.loop = exitSummary(loop);
      loop.emit('agent_end', {});
      await flush();
      out.loopLater = exitSummary(loop);
      // The finished session is inactive: a later plan-mode Finished answer is not write-spec's.
      loop.setMode('plan');
      await turn(loop, [finishedLoop]);
      out.afterExit = exitSummary(loop);

      // SCN002: bare /sdlc-write-spec initial picker Finished.
      const initial = writeSpecSession({ mode: 'plan' });
      await turn(initial, [finishedInitial]);
      out.initial = exitSummary(initial);

      const paused = writeSpecSession({ mode: 'plan_paused' });
      await turn(paused, [finishedLoop]);
      out.paused = exitSummary(paused);

      // SCN003: non-Finished selections and asks outside write-spec keep plan mode.
      for (const [name, results] of [
        ['issueRow', [ask(['#445 — Next issue'])]],
        ['continue', [ask(['Continue — enter another issue number'])]],
        ['customIssue', [ask([], { customInput: '#12' })]],
        ['customInvalid', [ask([], { customInput: 'abc' })]],
        ['errored', [{ ...finishedLoop, isError: true }]],
        ['laterAsk', [finishedLoop, ask(['#445 — Next issue'])]],
      ]) {
        const state = writeSpecSession({ mode: 'plan' });
        await turn(state, results);
        out[name] = exitSummary(state);
      }
      const draftIssue = tracked(host({ mode: 'plan' }));
      draftIssue.emit('input', { text: '/sdlc-draft-issue', source: 'interactive' });
      await turn(draftIssue, [finishedLoop]);
      out.otherCommand = exitSummary(draftIssue);
      const noSession = tracked(host({ mode: 'plan' }));
      await turn(noSession, [finishedLoop]);
      out.noSession = exitSummary(noSession);

      // SCN004: other continuations (tool calls, errors) wait for the terminal end.
      const waiting = writeSpecSession({ mode: 'plan' });
      waiting.emit('tool_result', finishedLoop);
      waiting.emit('agent_end', { willContinue: true, messages: [{ role: 'assistant', stopReason: 'toolUse', content: [{ type: 'toolCall' }] }] });
      waiting.emit('agent_end', { willContinue: true, messages: [{ role: 'assistant', stopReason: 'error', content: [] }] });
      await flush();
      out.waitingNonterminal = exitSummary(waiting);
      waiting.emit('agent_end', { messages: [reply] });
      await flush();
      out.waitingTerminal = exitSummary(waiting);

      // SCN004: undispatchable or non-progressing exits keep the draft and warn once.
      for (const [name, options] of [
        ['missingUI', { hasUI: false }],
        ['draft', { draft: 'my draft' }],
        ['wrongFocus', { focused: {} }],
        ['submitThrows', { submitThrows: true }],
        ['declined', { declineExit: true }],
      ]) {
        const state = writeSpecSession({ mode: 'plan' });
        Object.assign(state, options);
        await turn(state, [finishedLoop]);
        out[name] = exitSummary(state);
        Object.assign(state, { hasUI: true, submitThrows: false, declineExit: false });
        state.emit('agent_end', { messages: [reply] });
        await flush();
        out[name + 'Later'] = exitSummary(state);
      }

      // SCN005: a continuation pending in the same turn wins; a new invocation drops a pending exit.
      const both = writeSpecSession();
      await turn(both, [merge(460, 'p460'), finishedLoop]);
      both.emit('agent_end', {});
      await flush();
      out.continuationWins = exitSummary(both);
      const restarted = writeSpecSession({ mode: 'plan' });
      restarted.emit('tool_result', finishedLoop);
      restarted.emit('input', { text: '/sdlc-write-spec', source: 'interactive' });
      await turn(restarted, []);
      out.restarted = exitSummary(restarted);
      process.stdout.write(JSON.stringify(out));
    `);
    const exited = { commands: ['/plan', '/plan'], modes: ['plan', 'plan_paused', 'none'], ends: ['continued', 'aborted'], draft: '', notices: [] };
    const kept = { commands: [], modes: ['plan'], ends: ['continued', 'reasked'], prompts: 0, draft: '', notices: [] };
    const notice = 'NMG SDLC: write-spec finished, but plan mode is still active; /plan exits it.';

    expect(out.loop).toEqual({ ...exited, prompts: 1 });
    expect(out.loopLater).toEqual(out.loop);
    expect(out.afterExit).toEqual({ ...exited, modes: [...exited.modes, 'plan'], ends: [...exited.ends, 'continued', 'reasked'], prompts: 1 });
    expect(out.initial).toEqual({ ...exited, prompts: 0 });
    expect(out.paused).toEqual({ commands: ['/plan'], modes: ['plan_paused', 'none'], ends: ['terminal'], prompts: 0, draft: '', notices: [] });
    for (const name of ['issueRow', 'continue', 'customIssue', 'customInvalid', 'errored', 'laterAsk', 'otherCommand', 'noSession', 'restarted']) {
      expect({ name, ...out[name] }).toEqual({ name, ...kept });
    }
    expect(out.waitingNonterminal).toEqual({ ...kept, ends: [] });
    expect(out.waitingTerminal).toEqual({ ...exited, ends: [], prompts: 0 });
    for (const name of ['missingUI', 'draft', 'wrongFocus', 'submitThrows', 'declined']) {
      const failed = {
        ...kept,
        commands: name === 'declined' ? ['/plan'] : [],
        draft: name === 'draft' ? 'my draft' : '',
        notices: [notice],
      };
      expect({ name, ...out[name] }).toEqual({ name, ...failed });
      expect({ name, ...out[name + 'Later'] }).toEqual({ name, ...failed });
    }
    expect(out.continuationWins).toEqual({ commands: [], modes: ['plan'], ends: ['terminal'], prompts: 1, draft: '', notices: [] });
  });
});
