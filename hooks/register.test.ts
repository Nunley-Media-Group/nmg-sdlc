import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

const ROOT_TOKEN = '<plugin-root>'
const FINISHED = 'Finished — stop writing specs'
const CONTINUE_HEAD = 'Post-publication continuation.'

type World = {
  plans: string[]
  prompts: { text: string; asUser?: true }[]
  toasts: string[]
  renders: string[][]
  draft: string
  renderFails: boolean
  bash: { command: string; stdout: string; isError?: true }[]
  seen: string[]
  envSet: Record<string, string | undefined>
  clock: ReturnType<typeof mock.clock>
}

// The engine beneath the plugin: every `$` call the module makes is answered
// here, and what it asked for is recorded on the returned world.
function engine(on: On, { interactive = true, env = {} as Record<string, string> } = {}): World {
  const world: World = {
    plans: [], prompts: [], toasts: [], renders: [], draft: '', renderFails: false, bash: [], seen: [], envSet: {},
    clock: mock.clock(on),
  }
  mock.env(on, env)
  on('env.set', (_, e) => { world.envSet[e.name] = e.value; return { value: { isSet: true } } as never })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.cwd', () => ({ value: '/project' }))
  on('session.surfaces', () => ({ value: interactive ? ['terminal'] as const : [] }))
  on('prompt.read', () => ({ value: { text: world.draft, cursor: world.draft.length } }))
  on('ui.toast', (_, e) => { world.toasts.push(e.text); return { value: undefined } })
  on('ui.log', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    world.renders.push([...e.argv])
    if (world.renderFails) {
      return { value: { exitCode: 2, stdout: '', stderr: '{"ok":false,"reasonCode":"project_runtime_invalid"}', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    const published = e.argv.indexOf('--published')
    const consumer = e.argv[e.argv.indexOf('--consumer') + 1]
    const stdout = published >= 0
      ? `${CONTINUE_HEAD} published[] = ${e.argv[published + 1]}\n\n# Write Spec`
      : `# ${consumer} workflow`
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.run', (_, e) => { world.plans.push(`/${e.command}${e.args ? ` ${e.args}` : ''}`); return {} })
  on('prompt.submit', (_, e) => { world.prompts.push({ text: e.text, ...(e.origin.kind === 'plugin' && e.origin.asUser ? { asUser: true as const } : {}) }); return { text: e.text } })
  on('tool.call', { tool: 'Bash' }, (_, e) => {
    world.seen.push(e.command)
    const answer = world.bash.find(item => item.command === e.command)
    if (answer?.isError) return { isError: true, result: answer.stdout, text: answer.stdout }
    return { result: { stdout: answer?.stdout ?? '', stderr: '', interrupted: false } }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => ({
    result: { questions: e.questions, answers: e.answers ?? {} },
  }))
  on('tool.call', { tool: 'Read' }, (_, e) => ({ result: { type: 'text', file: { filePath: e.file_path, content: '', numLines: 0, startLine: 1, totalLines: 0 } } }))
  on('classic.PermissionRequest', () => ({}))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return world
}

type Dollar = Engine

async function start($: Dollar, world: World, interactive = true) {
  await $.session.start({ cwd: '/project', surface: interactive ? 'terminal' : null, isInteractive: interactive })
  await world.clock.settle()
}

async function run($: Dollar, world: World, command: string, args = '') {
  const result = await $.command.run({
    command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 },
  })
  await world.clock.advance(5)
  return result
}

async function endTurn($: Dollar, world: World, extra: Record<string, unknown> = {}) {
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...extra } as never)
  await world.clock.advance(5)
}

async function ask($: Dollar, answer: string) {
  const question = 'Write another spec?'
  return $.tool.call({
    tool: 'AskUserQuestion',
    questions: [{ question, header: 'Next', multiSelect: false, options: [{ label: FINISHED, description: 'stop' }, { label: 'Continue', description: 'more' }] }],
    answers: { [question]: answer },
  } as never)
}

function mergeCommand(root: string, issue: number) {
  return `node ${JSON.stringify(`${root}/scripts/publish-approved-spec.mjs`)} merge --issue ${issue} --dir specs/${issue}-slug-${issue}`
}

describe('interactive commands', () => {
  test('a headless session fails closed without rendering', async ($, on) => {
    const world = engine(on, { interactive: false })
    await start($, world, false)
    const result = await run($, world, 'sdlc-write-spec', '#42')
    expect(result).toEqual(expect.objectContaining({ text: 'Run /sdlc-write-spec in the TUI.', exitCode: 2 }))
    expect(world.renders).toEqual([])
    expect(world.plans).toEqual([])
  })

  test('each interactive command enters plan mode, then submits its workflow as the person', async ($, on) => {
    const world = engine(on)
    await start($, world)
    for (const command of ['sdlc-draft-issue', 'sdlc-write-spec', 'sdlc-onboard-project', 'sdlc-upgrade-project', 'sdlc-steering', 'sdlc-run-retro']) {
      world.plans.length = 0
      world.prompts.length = 0
      await run($, world, command, '#7')
      expect(world.renders.at(-1)).toEqual(expect.arrayContaining(['--consumer', command, '--args', '#7', '--project', '/project']))
      expect(world.plans).toEqual(['/plan'])
      expect(world.prompts).toEqual([{ text: `# ${command} workflow`, asUser: true }])
    }
  })

  test('a render failure reports its reason and leaves the mode alone', async ($, on) => {
    const world = engine(on)
    await start($, world)
    world.renderFails = true
    const result = await run($, world, 'sdlc-steering')
    expect(result).toEqual(expect.objectContaining({ text: 'NMG SDLC: /sdlc-steering could not render its workflow: project_runtime_invalid' }))
    expect(world.plans).toEqual([])
    expect(world.prompts).toEqual([])
  })

  test('Herdr sessions are greeted', async ($, on) => {
    const world = engine(on, { env: { HERDR_ENV: '1' } })
    await start($, world)
    expect(world.toasts).toEqual(['NMG SDLC ready in Herdr'])
    expect(world.envSet.NMG_SDLC_PLUGIN_ROOT).toMatch(/^\/.+/)
  })
})

describe('plugin-root materialization', () => {
  test('Bash commands and Read paths reach the engine with the plugin path', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await $.tool.call({ tool: 'Bash', command: `node ${ROOT_TOKEN}/scripts/sdlc-status.mjs --json` })
    await $.tool.call({ tool: 'Bash', command: 'node "${NMG_SDLC_PLUGIN_ROOT}/scripts/exercise-claude.mjs" --cwd .' })
    await $.tool.call({ tool: 'Bash', command: 'node scripts/check.mjs' })
    const seen = world.seen
    expect(seen[0]).toMatch(/^node "\/.+\/scripts\/sdlc-status\.mjs" --json$/)
    expect(seen[1]).toMatch(/^node "\/.+\/scripts\/exercise-claude\.mjs" --cwd \.$/)
    expect(seen[2]).toBe('node scripts/check.mjs')
    expect(seen.join('\n')).not.toContain('plugin-root')
    expect(seen.join('\n')).not.toContain('NMG_SDLC_PLUGIN_ROOT')

    const read = await $.tool.call({ tool: 'Read', file_path: `${ROOT_TOKEN}/references/claude-code-tooling.md` })
    expect(JSON.stringify(read)).not.toContain(ROOT_TOKEN)
  })
})

describe('write-spec continuation', () => {
  test('a merged publication submits one plan-mode Continue prompt after the turn ends', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await run($, world, 'sdlc-write-spec', '#400')
    await $.tool.call({ tool: 'Bash', command: 'node "<plugin-root>/scripts/sdlc-status.mjs"' })
    const root = /^node "(.+)\/scripts\//.exec(world.seen.at(-1) ?? '')?.[1] ?? ''
    world.plans.length = 0
    world.prompts.length = 0

    world.bash.push(
      { command: mergeCommand(root, 400), stdout: '{"ok":true,"merged":true,"pr":401}' },
      { command: mergeCommand(root, 401), stdout: '{"ok":false,"reasonCode":"pr_merge_failed"}', isError: true },
      { command: mergeCommand(root, 403), stdout: '{"merged":true' },
      { command: mergeCommand(root, 402), stdout: 'Exit code 1\n{"ok":false,"reasonCode":"default_checkout_failed","merged":true,"pr":403}', isError: true },
    )
    await $.tool.call({ tool: 'Bash', command: mergeCommand(root, 400), tool_use_id: 'p400' } as never)
    await $.tool.call({ tool: 'Bash', command: mergeCommand(root, 400), tool_use_id: 'p400' } as never)
    await $.tool.call({ tool: 'Bash', command: mergeCommand(root, 401), tool_use_id: 'f401' } as never)
    await $.tool.call({ tool: 'Bash', command: mergeCommand(root, 403), tool_use_id: 'm403' } as never)
    await $.tool.call({ tool: 'Bash', command: `${mergeCommand(root, 400)} && echo done`, tool_use_id: 'x400' } as never)
    await endTurn($, world, { agentId: 'sub-agent' })
    expect(world.prompts).toEqual([])

    await endTurn($, world)
    expect(world.plans).toEqual(['/plan'])
    expect(world.prompts).toHaveLength(1)
    expect(world.prompts[0]?.text).toContain('published[] = [{"issue":400,"slug":"slug-400"}]')
    expect(world.prompts[0]?.asUser).toBe(true)

    await endTurn($, world)
    expect(world.prompts).toHaveLength(1)

    await $.tool.call({ tool: 'Bash', command: mergeCommand(root, 402), tool_use_id: 'p402' } as never)
    await endTurn($, world)
    expect(world.prompts).toHaveLength(2)
    expect(world.prompts[1]?.text).toContain('"issue":400')
    expect(world.prompts[1]?.text).toContain('"issue":402')
  })

  test('a draft in the prompt box keeps the continuation pending until a later empty turn end', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await run($, world, 'sdlc-write-spec')
    await $.tool.call({ tool: 'Bash', command: 'node "<plugin-root>/scripts/sdlc-status.mjs"' })
    const root = /^node "(.+)\/scripts\//.exec(world.seen.at(-1) ?? '')?.[1] ?? ''
    world.prompts.length = 0
    world.bash.push({ command: mergeCommand(root, 420), stdout: '{"ok":true,"merged":true,"pr":421}' })
    await $.tool.call({ tool: 'Bash', command: mergeCommand(root, 420), tool_use_id: 'p420' } as never)

    world.draft = 'my draft'
    await endTurn($, world)
    expect(world.prompts).toEqual([])
    expect(world.toasts.at(-1)).toContain('write-spec Continue is pending')

    world.draft = ''
    await endTurn($, world)
    expect(world.prompts).toHaveLength(1)
    expect(world.prompts[0]?.text).toContain('"issue":420')
  })
})

describe('write-spec Finished', () => {
  test('a Finished answer approves the reply\'s own ExitPlanMode, once', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await run($, world, 'sdlc-write-spec')
    expect(await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: {} })).toEqual({})

    await ask($, FINISHED)
    expect(await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: {} }))
      .toEqual({ decision: { behavior: 'allow' } })
    expect(await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: {} })).toEqual({})
  })

  test('non-Finished answers and other commands never approve ExitPlanMode', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await run($, world, 'sdlc-write-spec')
    for (const answer of ['Continue', '#12', `${FINISHED} please`]) {
      await ask($, answer)
      expect(await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: {} })).toEqual({})
    }
    await ask($, FINISHED)
    await ask($, 'Continue')
    expect(await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: {} })).toEqual({})

    await run($, world, 'sdlc-draft-issue')
    await ask($, FINISHED)
    expect(await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: {} })).toEqual({})
  })

  test('a Finished reply that ends without ExitPlanMode is asked once, then warned', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await run($, world, 'sdlc-write-spec')
    world.prompts.length = 0
    await ask($, FINISHED)
    await endTurn($, world)
    expect(world.prompts).toEqual([{ text: 'write-spec Finished: call ExitPlanMode now as your only action, with no other output.' }])
    await endTurn($, world)
    expect(world.prompts).toHaveLength(1)
    expect(world.toasts.at(-1)).toBe('NMG SDLC: write-spec finished, but plan mode is still active; Shift+Tab exits it.')
  })

  test('an interrupted Finished reply does not prompt', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await run($, world, 'sdlc-write-spec')
    world.prompts.length = 0
    await ask($, FINISHED)
    await endTurn($, world, { isAborted: true, reason: 'aborted' })
    expect(world.prompts).toEqual([])
  })
})

describe('autopilot', () => {
  test('NMG_SDLC_AUTOPILOT answers questions with the recommended option and approves plans', async ($, on) => {
    const world = engine(on, { env: { NMG_SDLC_AUTOPILOT: '1' } })
    await start($, world)
    const questions = [
      { question: 'Which kind?', header: 'Kind', multiSelect: false, options: [{ label: 'Bug', description: '' }, { label: 'Feature (Recommended)', description: '' }] },
      { question: 'Milestone?', header: 'Milestone', multiSelect: false, options: [{ label: 'v1', description: '' }, { label: 'v2', description: '' }] },
    ]
    expect(await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: { questions } })).toEqual({
      decision: {
        behavior: 'allow',
        updatedInput: { questions, answers: { 'Which kind?': 'Feature (Recommended)', 'Milestone?': 'v1' } },
      },
    })
    expect(await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: {} }))
      .toEqual({ decision: { behavior: 'allow' } })
    expect(await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } })).toEqual({})
  })

  test('during write-spec autopilot prefers Finished over the recommended next issue', async ($, on) => {
    const world = engine(on, { env: { NMG_SDLC_AUTOPILOT: '1' } })
    await start($, world)
    await run($, world, 'sdlc-write-spec', '#5')
    const questions = [{
      question: 'Write another spec?', header: 'Next', multiSelect: false,
      options: [{ label: '#6 — Next issue (Recommended)', description: '' }, { label: FINISHED, description: '' }],
    }]
    const answered = await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: { questions } })
    expect(answered).toEqual({
      decision: { behavior: 'allow', updatedInput: { questions, answers: { 'Write another spec?': FINISHED } } },
    })
  })

  test('without autopilot questions and plans go to the person', async ($, on) => {
    const world = engine(on)
    await start($, world)
    expect(await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: { questions: [] } })).toEqual({})
    expect(await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: {} })).toEqual({})
  })
})
