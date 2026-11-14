import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'
import {
  activityRecord,
  backgroundTaskOf,
  emptyAgentRecord,
  executeResultPath,
  recordBackgroundStart,
  recordStepStart,
  recordToolCall,
  recordTurnEnd,
} from '../src/execute-host.mjs'

const ROOT_TOKEN = '<plugin-root>'
const FINISHED = 'Finished — stop writing specs'
const CONTINUE_HEAD = 'Post-publication continuation.'
const CWD = '/project'
const SESSION_ID = '6f1d3c2a-9b7e-4d8f-8a1b-2c3d4e5f6a7b'
const STOP_DENIAL = 'nmg-sdlc: this /sdlc-execute stage worker was stopped'
const AGENT_BODY = '# Spec Implementer\n\nImplement the approved spec.\n'
const AGENT_FILE = `---\nname: spec-implementer\ndescription: Implement approved spec tasks.\n---\n\n${AGENT_BODY}`

type World = {
  plans: string[]
  prompts: { text: string; asUser?: true }[]
  toasts: string[]
  renders: string[][]
  draft: string
  renderFails: boolean
  bash: { command: string; stdout: string; isError?: true; backgroundTaskId?: string; timedOutAfterMs?: number }[]
  bashInputs: Record<string, unknown>[]
  files: Record<string, string>
  writes: string[]
  seen: string[]
  envSet: Record<string, string | undefined>
  sessionModel: string
  steps: { model: string; effort?: unknown; agentId?: string }[]
  origins: string[]
  configWrites: string[]
  modelFails: boolean
  registered: Record<string, unknown>[]
  registrations: Record<string, unknown>[]
  spawns: Record<string, unknown>[]
  spawnDeny?: string
  registerDeny?: string
  appended: Record<string, unknown>[]
  appendDeny: boolean
  sends: { to: unknown; text: string }[]
  sendDelivered: boolean
  stops: string[]
  stopStatus: string
  agents: Record<string, string>
  messages: Record<string, { role: 'user' | 'assistant'; text: string; toolUses: never[] }[]>
  clock: ReturnType<typeof mock.clock>
}

// The kit resolves a relative path under its own working directory, and the module's stage paths are absolute
// under CWD. Lookups use the `.nmg-sdlc/` part of a path, so a relative record and its absolute stand-in match.
function fsKey(path: string): string {
  const at = path.indexOf('/.nmg-sdlc/')
  if (at >= 0) return `${CWD}${path.slice(at)}`
  if (path.startsWith('.nmg-sdlc/')) return `${CWD}/${path}`
  return path
}

// The engine beneath the plugin: every `$` call the module makes is answered
// here, and what it asked for is recorded on the returned world.
function engine(on: On, { interactive = true, env = {} as Record<string, string> } = {}): World {
  const world: World = {
    plans: [], prompts: [], toasts: [], renders: [], draft: '', renderFails: false, bash: [], bashInputs: [],
    files: {}, writes: [], seen: [], envSet: {},
    sessionModel: 'claude-sonnet-5-5', steps: [], origins: [], configWrites: [], modelFails: false,
    registered: [], registrations: [], spawns: [], spawnDeny: 'no subagent starts under the test kit',
    appended: [], appendDeny: false, sends: [], sendDelivered: true,
    stops: [], stopStatus: 'killed', agents: {}, messages: {},
    clock: mock.clock(on),
  }
  mock.env(on, env)
  on('env.set', (_, e) => { world.envSet[e.name] = e.value; return { value: { isSet: true } } as never })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: SESSION_ID }))
  on('command.register', (_, e) => { world.registered.push({ ...e }); return { value: { command: e.name } } })
  on('command.list', () => ({ value: [{ name: 'goal' }] as never }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: interactive ? ['terminal'] as const : [] }))
  on('session.model', () => {
    if (world.modelFails) throw new Error('host unavailable')
    return { value: world.sessionModel }
  })
  on('session.messages', (_, e) => ({ value: (world.messages[e.agentId ?? ''] ?? []) as never }))
  // A refusal stands for a loop that has ended; otherwise the row is kept below, as a session keeps it.
  on('session.append', (_, e, next) => {
    if (world.appendDeny) return { deny: 'the agent loop has ended' } as never
    world.appended.push({ ...e })
    return next(e)
  })
  on('session.send', (_, e) => {
    world.sends.push({ to: e.to, text: e.text })
    return (world.sendDelivered ? { isDelivered: true } : { isDelivered: false, reason: 'the agent is not running' }) as never
  })
  on('agent.register', (_, e) => {
    world.registrations.push({ ...e })
    return world.registerDeny === undefined ? { value: { agent: e.name } } : { deny: world.registerDeny } as never
  })
  // A hook that answers without `next` starts no subagent, so a spawn is passed on to the kit's own start.
  on('agent.spawn', async (_, e, next) => {
    world.spawns.push({ ...e })
    if (world.spawnDeny !== undefined) return { deny: world.spawnDeny } as never
    const started = await next(e)
    if (typeof started.agentId === 'string') world.agents[started.agentId] = 'running'
    return started
  })
  on('agent.list', () => ({
    value: Object.entries(world.agents).map(([id, status]) => ({ id, description: id, status })) as never,
  }))
  on('fs.read', (_, e) => {
    const text = world.files[fsKey(e.path)]
    return text === undefined ? { deny: `no such file: ${e.path}` } as never : { value: text }
  })
  on('fs.write', (_, e) => {
    world.writes.push(fsKey(e.path))
    world.files[fsKey(e.path)] = e.text
    return { value: undefined }
  })
  on('fs.list', (_, e) => {
    const dir = fsKey(e.path)
    const entries = Object.keys(world.files)
      .filter(file => file.startsWith(`${dir}/`) && !file.slice(dir.length + 1).includes('/'))
      .map(file => ({ name: file.slice(dir.length + 1), kind: 'file' as const }))
    return entries.length === 0 ? { deny: `no such directory: ${dir}` } as never : { value: entries as never }
  })
  on('config.set', (_, e) => { world.configWrites.push(JSON.stringify(e)); return {} as never })
  on('turn.step', async function* (_, e) {
    world.steps.push({ model: e.model, ...(e.effort === undefined ? {} : { effort: e.effort }), ...(e.agentId === undefined ? {} : { agentId: e.agentId }) })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
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
  on('prompt.submit', (_, e) => { world.origins.push(e.origin.kind); world.prompts.push({ text: e.text, ...(e.origin.kind === 'plugin' && e.origin.asUser ? { asUser: true as const } : {}) }); return { text: e.text } })
  on('tool.call', { tool: 'Bash' }, (_, e) => {
    world.seen.push(e.command)
    world.bashInputs.push({ ...e })
    const answer = world.bash.find(item => item.command === e.command)
    if (answer?.isError) return { isError: true, result: answer.stdout, text: answer.stdout }
    const background = answer?.backgroundTaskId === undefined
      ? {}
      : { backgroundTaskId: answer.backgroundTaskId, timedOutAfterMs: answer.timedOutAfterMs }
    return { result: { stdout: answer?.stdout ?? '', stderr: '', interrupted: false, ...background } }
  })
  on('tool.call', { tool: 'TaskStop' }, (_, e) => {
    const id = String((e as { task_id?: unknown }).task_id)
    world.stops.push(id)
    world.agents[id] = world.stopStatus
    return { result: {} as never }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => ({
    result: { questions: e.questions, answers: e.answers ?? {} },
  }))
  on('tool.call', { tool: 'Read' }, (_, e) => ({ result: { type: 'text', file: { filePath: e.file_path, content: world.files[e.file_path] ?? '', numLines: 0, startLine: 1, totalLines: 0 } } }))
  on('classic.PermissionRequest', () => ({}))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return world
}

type Dollar = Engine

async function start($: Dollar, world: World, interactive = true) {
  await $.session.start({ cwd: CWD, surface: interactive ? 'terminal' : null, isInteractive: interactive })
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

// One model request of the current turn: main's unless `agentId` is given.
async function step($: Dollar, world: World, extra: { agentId?: string; model?: string; effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' } = {}) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: world.sessionModel, effort: 'high', messageCount: 1, ...extra })
  for await (const _chunk of stream) { /* drain */ }
  return world.steps.at(-1)
}

// The person's own Enter at the prompt (or Remote Control's `bridge`).
async function typed($: Dollar, world: World, text: string, kind: 'composer' | 'bridge' = 'composer') {
  await $.prompt.submit({ text, wait: false, origin: { kind } })
  await world.clock.advance(5)
}

function mergeCommand(root: string, issue: number) {
  return `node ${JSON.stringify(`${root}/scripts/publish-approved-spec.mjs`)} merge --issue ${issue} --dir specs/${issue}-slug-${issue}`
}

// Each /sdlc-execute session gets its own id, so a bridge left by an earlier test never answers this one.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const executeDir = (session: string) => `${CWD}/.nmg-sdlc/execute/${session}`

// The controller's request n, written into the session directory as the controller writes it.
function writeRequest(world: World, session: string, n: number, fields: Record<string, unknown>): void {
  world.files[`${executeDir(session)}/request-${n}.json`] = JSON.stringify({ schemaVersion: 1, session, n, ...fields })
}

function spawnRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'spawn', issue: 42, step: 'implement', entry: 'implement', agent: 'spec-implementer', name: 'implement #42',
    model: 'claude-opus-5-5', effort: 'high', permissionMode: 'acceptEdits', promptFile: 'prompt-1.md', cwd: '/project/.worktrees/42',
    ...overrides,
  }
}

// The host's answer to request n, or undefined before the bridge has answered it.
function response(world: World, session: string, n: number): Record<string, unknown> | undefined {
  const text = world.files[`${executeDir(session)}/response-${n}.json`]
  return text === undefined ? undefined : JSON.parse(text)
}

// The plugin root the commands resolve to; a Bash call through the hooks module shows it.
async function pluginRoot($: Dollar, world: World) {
  await $.tool.call({ tool: 'Bash', command: `node "${ROOT_TOKEN}/scripts/sdlc-status.mjs"` })
  return /^node "(.+)\/scripts\//.exec(world.seen.at(-1) ?? '')?.[1] ?? ''
}

function controller(root: string, args: string) {
  return `node "${root}/scripts/sdlc-execute.mjs" ${args}`
}

// Starts /sdlc-execute for one issue and sets its goal, as the execute workflow does before supervise.
async function startExecute($: Dollar, world: World, root: string, issue = 42) {
  world.sessionModel = 'claude-opus-5-5'
  await run($, world, 'sdlc-execute', `#${issue}`)
  const goal = controller(root, `goal #${issue}`)
  world.bash.push({ command: goal, stdout: `${JSON.stringify({ ok: true, issues: [issue], condition: 'x' })}\n` })
  await $.tool.call({ tool: 'Bash', command: goal, tool_use_id: `goal-${issue}` } as never)
  await endTurn($, world)
  world.plans.length = 0
  world.prompts.length = 0
}

// Runs `supervise`, which announces `session`; the bridge answers the requests already written.
async function supervise($: Dollar, world: World, root: string, session: string, issue = 42) {
  const command = controller(root, `supervise #${issue}`)
  world.bash.push({ command, stdout: `NMG_SDLC_EXECUTE_SESSION: ${session}\nNMG_SDLC_EXECUTE_WORKER: {"issue":${issue}}\n` })
  await $.tool.call({ tool: 'Bash', command, tool_use_id: `supervise-${session}` } as never)
}

describe('interactive commands', () => {
  test('a headless session fails closed without rendering', async ($, on) => {
    const world = engine(on, { interactive: false })
    await start($, world, false)
    const result = await run($, world, 'sdlc-draft-issue', 'a parser bug')
    expect(result).toEqual(expect.objectContaining({ text: 'Run /sdlc-draft-issue in the TUI.', exitCode: 2 }))
    expect(world.renders).toEqual([])
    expect(world.plans).toEqual([])
    expect(world.prompts).toEqual([])
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

  test('sdlc-execute submits its workflow as the person without entering plan mode', async ($, on) => {
    const world = engine(on)
    world.sessionModel = 'claude-opus-5-5'
    await start($, world)
    await run($, world, 'sdlc-execute', '#7 --check-in-seconds 60')
    expect(world.renders.at(-1)).toEqual(expect.arrayContaining(['--consumer', 'sdlc-execute', '--args', '#7 --check-in-seconds 60', '--project', '/project']))
    expect(world.plans).toEqual([])
    expect(world.prompts).toEqual([{ text: '# sdlc-execute workflow', asUser: true }])
  })

  // A command's own `{ text }` answer is only printed: under `claude -p` the run would end with no model turn.
  test('a headless sdlc-execute submits its rendered workflow as the prompt, with no refusal, no preamble and no printed text', async ($, on) => {
    const world = engine(on, { interactive: false })
    world.sessionModel = 'claude-opus-5-5'
    await start($, world, false)
    const result = await run($, world, 'sdlc-execute', '#42')
    expect(result).toEqual({})
    expect(world.renders.at(-1)).toEqual(expect.arrayContaining(['--consumer', 'sdlc-execute', '--args', '#42']))
    expect(world.plans).toEqual([])
    expect(world.prompts).toEqual([{ text: '# sdlc-execute workflow', asUser: true }])
  })

  test('a headless sdlc-execute on a non-Opus session is still refused before rendering', async ($, on) => {
    const world = engine(on, { interactive: false })
    await start($, world, false)
    const result = await run($, world, 'sdlc-execute', '#42')
    expect(result).toEqual(expect.objectContaining({ exitCode: 1 }))
    expect(world.renders).toEqual([])
    expect(world.prompts).toEqual([])
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

  test('session start records the plugin root and the Claude session id, and shows no Herdr toast', async ($, on) => {
    const world = engine(on, { env: { HERDR_ENV: '1' } })
    await start($, world)
    expect(world.toasts).toEqual([])
    expect(world.envSet.NMG_SDLC_PLUGIN_ROOT).toMatch(/^\/.+/)
    expect(world.envSet.NMG_SDLC_CLAUDE_SESSION_ID).toBe(SESSION_ID)
  })

  test('the execute argument hint names --check-in-seconds and no longer --retain-worker', async ($, on) => {
    const world = engine(on)
    await start($, world)
    const execute = world.registered.find(({ name }) => name === 'sdlc-execute')
    expect(execute?.argumentHint).toBe('[--check-in-seconds N] [#N ...]')
    expect(world.registered.map(({ argumentHint }) => String(argumentHint ?? '')).join(' ')).not.toContain('--retain-worker')
  })
})

describe('pasted interactive commands', () => {
  // AC1: a person's pasted prompt beginning with a registered command runs that command, with the whole remaining text as its arguments.
  test('a pasted multi-line /sdlc-draft-issue runs the command and never reaches the model', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await typed($, world, '/sdlc-draft-issue Fix X\nline two\nline three')
    expect(world.renders.at(-1)).toEqual(expect.arrayContaining(['--consumer', 'sdlc-draft-issue', '--args', 'Fix X\nline two\nline three']))
    expect(world.plans).toEqual(['/plan'])
    expect(world.prompts).toEqual([{ text: '# sdlc-draft-issue workflow', asUser: true }])
  })

  test('a bridge prompt with leading blank lines runs the command the same way', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await typed($, world, '\n\n/sdlc-draft-issue Fix X\nline two\nline three', 'bridge')
    expect(world.renders.at(-1)).toEqual(expect.arrayContaining(['--consumer', 'sdlc-draft-issue', '--args', 'Fix X\nline two\nline three']))
    expect(world.plans).toEqual(['/plan'])
    expect(world.prompts).toEqual([{ text: '# sdlc-draft-issue workflow', asUser: true }])
  })

  test('a pasted /sdlc-execute submits its workflow as the person, with the same drop answer as a typed run', async ($, on) => {
    const world = engine(on)
    world.sessionModel = 'claude-opus-5-5'
    await start($, world)
    const result = await $.prompt.submit({ text: '/sdlc-execute #7', wait: false, origin: { kind: 'composer' } } as never)
    expect(result).toEqual({ drop: 'NMG SDLC: running /sdlc-execute.' })
    await world.clock.advance(5)
    expect(world.renders.at(-1)).toEqual(expect.arrayContaining(['--consumer', 'sdlc-execute', '--args', '#7']))
    expect(world.plans).toEqual([])
    expect(world.prompts).toEqual([{ text: '# sdlc-execute workflow', asUser: true }])
  })

  // AC2: typed commands, plugin-submitted or isMeta prompts, and text that does not begin with a registered name pass through unchanged.
  test('typed, plugin, isMeta and non-matching prompts reach the engine unchanged, with no render', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await $.prompt.submit({ text: '/sdlc-draft-issue x', wait: false, origin: { kind: 'composer' }, command: { name: 'sdlc-draft-issue', args: 'x' } } as never)
    await $.prompt.submit({ text: '/sdlc-draft-issue x', wait: false, origin: { kind: 'plugin', name: 'other-plugin' } } as never)
    await $.prompt.submit({ text: '/sdlc-draft-issue x', wait: false, isMeta: true, origin: { kind: 'composer' } } as never)
    await typed($, world, '/sdlc-unknown x')
    await typed($, world, 'please run /sdlc-draft-issue later')
    await typed($, world, '/sdlc-draft-issuex y')
    await world.clock.advance(5)
    expect(world.prompts).toEqual([
      { text: '/sdlc-draft-issue x' },
      { text: '/sdlc-draft-issue x' },
      { text: '/sdlc-draft-issue x' },
      { text: '/sdlc-unknown x' },
      { text: 'please run /sdlc-draft-issue later' },
      { text: '/sdlc-draft-issuex y' },
    ])
    expect(world.renders).toEqual([])
    expect(world.plans).toEqual([])
  })

  test('a composer prompt that is not a pasted command still ends an active model override', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await run($, world, 'sdlc-draft-issue')
    expect(await step($, world)).toEqual({ model: 'opus', effort: 'high' })
    await typed($, world, '/sdlc-unknown x')
    expect(await step($, world)).toEqual({ model: 'claude-sonnet-5-5', effort: 'high' })
  })

  // AC3: a headless session refuses a pasted interactive command with the same answer as the typed command.
  test('a pasted interactive command in a headless session gets the typed refusal, with no render and no prompt', async ($, on) => {
    const world = engine(on, { interactive: false })
    await start($, world, false)
    const result = await $.prompt.submit({ text: '/sdlc-draft-issue a parser bug', wait: false, origin: { kind: 'composer' } } as never)
    expect(result).toEqual({ drop: 'Run /sdlc-draft-issue in the TUI.' })
    await world.clock.advance(5)
    expect(world.renders).toEqual([])
    expect(world.plans).toEqual([])
    expect(world.prompts).toEqual([])
  })
})

describe('/sdlc-execute --result', () => {
  test('answers the recorded lines and exit status, before any model gate, and mutates nothing', async ($, on) => {
    const world = engine(on)
    world.sessionModel = 'claude-sonnet-5-5'
    await start($, world)
    world.files[`${CWD}/${executeResultPath(SESSION_ID)}`] = JSON.stringify({
      schemaVersion: 1, status: 1, lines: ['#7: MERGED and CLOSED', '/sdlc-execute stopped: halted'],
    })
    const result = await run($, world, 'sdlc-execute', '--result')
    expect(result).toEqual({ text: '#7: MERGED and CLOSED\n/sdlc-execute stopped: halted', exitCode: 1 })
    expect(world.renders).toEqual([])
    expect(world.plans).toEqual([])
    expect(world.prompts).toEqual([])
    expect(world.writes).toEqual([])
  })

  test('answers exit 2 with the no-record line when no result exists, and mutates nothing', async ($, on) => {
    const world = engine(on)
    await start($, world)
    const result = await run($, world, 'sdlc-execute', '--result')
    expect(result).toEqual({ text: `No /sdlc-execute result is recorded for session ${SESSION_ID}.`, exitCode: 2 })
    expect(world.renders).toEqual([])
    expect(world.writes).toEqual([])
  })
})

describe('headless runs', () => {
  // AC9: autopilot is removed, so NMG_SDLC_AUTOPILOT=1 no longer lets an interactive command run headless.
  for (const command of ['sdlc-draft-issue', 'sdlc-write-spec']) {
    test(`with NMG_SDLC_AUTOPILOT=1 a headless /${command} still fails closed without rendering`, async ($, on) => {
      const world = engine(on, { interactive: false, env: { NMG_SDLC_AUTOPILOT: '1' } })
      await start($, world, false)
      const result = await run($, world, command, '#5')
      expect(result).toEqual(expect.objectContaining({ text: `Run /${command} in the TUI.`, exitCode: 2 }))
      expect(world.renders).toEqual([])
      expect(world.plans).toEqual([])
      expect(world.prompts).toEqual([])
    })
  }

  test('a backgrounded write-spec merge is left in the background', async ($, on) => {
    const world = engine(on, { interactive: false })
    await start($, world, false)
    const root = await pluginRoot($, world)
    const merge = mergeCommand(root, 9)
    await $.tool.call({ tool: 'Bash', command: merge, run_in_background: true } as never)
    expect(world.bashInputs.at(-1)).toMatchObject({ command: merge, run_in_background: true })
    expect(world.bashInputs.at(-1)).not.toHaveProperty('timeout')
  })
})

describe('stage subagents', () => {
  // The test kit starts no subagent: a spawn is answered as refused here, so these tests verify the registration,
  // the spawn request and the answers the controller gets. A started worker's id, step override and records need
  // a subagent the kit does not start, so they are not asserted here.
  test('a spawn request registers the stage agent and sends its spawn, with no process launch', async ($, on) => {
    const world = engine(on)
    await start($, world)
    const root = await pluginRoot($, world)
    await startExecute($, world, root)
    const session = uuid(1)
    world.files[`${root}/agents/spec-implementer.md`] = AGENT_FILE
    world.files[`${executeDir(session)}/prompt-1.md`] = 'Implement #42 now.'
    writeRequest(world, session, 1, spawnRequest())
    const rendersBefore = world.renders.length
    await supervise($, world, root, session)

    expect(world.registrations).toEqual([{
      name: 'execute-implement',
      description: 'nmg-sdlc implement stage for #42',
      prompt: AGENT_BODY,
      model: 'claude-opus-5-5',
      effort: 'high',
      permissionMode: 'acceptEdits',
      disallowedTools: ['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode'],
    }])
    // The spawn reaches the engine as the Agent tool's call, in the background, on the stage's agent type.
    expect(world.spawns).toEqual([{
      tool: 'Agent',
      prompt: 'Implement #42 now.',
      description: 'implement #42',
      run_in_background: true,
      subagent_type: 'nmg-sdlc:execute-implement',
      name: 'implement #42',
      cwd: '/project/.worktrees/42',
    }])
    expect(world.renders.length).toBe(rendersBefore)
    expect(response(world, session, 1)).toEqual({
      schemaVersion: 1, session, n: 1, ok: false, deny: 'nmg-sdlc: stage spawn refused: no subagent starts under the test kit',
    })
  })

  test('a null effort is left off the registration', async ($, on) => {
    const world = engine(on)
    await start($, world)
    const root = await pluginRoot($, world)
    await startExecute($, world, root)
    const session = uuid(2)
    world.files[`${root}/agents/spec-implementer.md`] = AGENT_FILE
    world.files[`${executeDir(session)}/prompt-1.md`] = 'Implement #42 now.'
    writeRequest(world, session, 1, spawnRequest({ effort: null }))
    await supervise($, world, root, session)

    expect(world.registrations).toEqual([expect.objectContaining({ name: 'execute-implement', model: 'claude-opus-5-5', permissionMode: 'acceptEdits' })])
    expect(world.registrations[0]).not.toHaveProperty('effort')
  })

  test('a denied spawn, a missing agent file and a rejected registration each answer ok false', async ($, on) => {
    const world = engine(on)
    await start($, world)
    const root = await pluginRoot($, world)
    await startExecute($, world, root)
    const session = uuid(3)
    world.files[`${root}/agents/spec-implementer.md`] = AGENT_FILE
    world.files[`${executeDir(session)}/prompt-1.md`] = 'Implement #42 now.'
    world.spawnDeny = 'the concurrency limit is reached'
    writeRequest(world, session, 1, spawnRequest())
    writeRequest(world, session, 2, spawnRequest({ agent: 'deliverer', name: 'deliver #42', entry: 'deliver', step: 'deliver' }))
    await supervise($, world, root, session)

    expect(response(world, session, 1)).toEqual({
      schemaVersion: 1, session, n: 1, ok: false, deny: 'nmg-sdlc: stage spawn refused: the concurrency limit is reached',
    })
    expect(response(world, session, 2)).toEqual({
      schemaVersion: 1, session, n: 2, ok: false, deny: 'nmg-sdlc: stage agent definition agents/deliverer.md is missing',
    })

    world.spawnDeny = undefined
    world.registerDeny = 'the name execute-implement is taken'
    writeRequest(world, session, 3, spawnRequest())
    await world.clock.advance(1_000)
    expect(response(world, session, 3)).toEqual(expect.objectContaining({ n: 3, ok: false }))
    expect(String(response(world, session, 3)?.deny)).toMatch(/^nmg-sdlc: stage agent registration rejected: .*the name execute-implement is taken/)
    // Only request 1 reached the spawn: request 2's agent file is missing, and request 3 was refused at registration.
    expect(world.spawns).toHaveLength(1)
  })

  test('a worker turn end does not run the main loop handlers: the pending goal waits for the main loop', async ($, on) => {
    const world = engine(on)
    await start($, world)
    const root = await pluginRoot($, world)
    world.sessionModel = 'claude-opus-5-5'
    await run($, world, 'sdlc-execute', '#42')
    const goal = controller(root, 'goal #42')
    world.bash.push({ command: goal, stdout: `${JSON.stringify({ ok: true, issues: [42], condition: 'x' })}\n` })
    await $.tool.call({ tool: 'Bash', command: goal, tool_use_id: 'goal-42' } as never)
    world.plans.length = 0

    await endTurn($, world, { agentId: 'worker-1' })
    expect(world.plans).toEqual([])

    await endTurn($, world)
    expect(world.plans).toEqual([expect.stringMatching(/^\/goal /)])
  })

  test('the first heartbeat is written with the Claude session id when the bridge starts', async ($, on) => {
    const world = engine(on)
    await start($, world)
    const root = await pluginRoot($, world)
    await startExecute($, world, root)
    const session = uuid(7)
    world.files[`${executeDir(session)}/notes.txt`] = ''
    await supervise($, world, root, session)
    expect(JSON.parse(world.files[`${executeDir(session)}/host.json`] ?? 'null'))
      .toEqual({ schemaVersion: 1, claudeSessionId: SESSION_ID, at: expect.any(Number) })
  })

  test('an append request appends guidance to a worker, and a denied append is sent instead', async ($, on) => {
    const world = engine(on)
    await start($, world)
    const root = await pluginRoot($, world)
    await startExecute($, world, root)
    const session = uuid(8)
    world.files[`${executeDir(session)}/notes.txt`] = ''
    await supervise($, world, root, session)

    writeRequest(world, session, 2, { kind: 'append', agentId: 'worker-1', text: 'Use the parser helper.' })
    await world.clock.advance(1_000)
    expect(response(world, session, 2)).toEqual({ schemaVersion: 1, session, n: 2, ok: true })
    expect(world.appended).toEqual([expect.objectContaining({
      agentId: 'worker-1',
      message: { type: 'user', content: [{ type: 'text', text: 'Use the parser helper.' }] },
    })])

    world.appendDeny = true
    writeRequest(world, session, 3, { kind: 'append', agentId: 'worker-1', text: 'Stop and report.' })
    await world.clock.advance(1_000)
    expect(response(world, session, 3)).toEqual({ schemaVersion: 1, session, n: 3, ok: true })
    // The send's address reaches the engine as the agent id.
    expect(world.sends).toEqual([{ to: 'worker-1', text: 'Stop and report.' }])

    world.sendDelivered = false
    writeRequest(world, session, 4, { kind: 'append', agentId: 'worker-1', text: 'One more thing.' })
    await world.clock.advance(1_000)
    expect(response(world, session, 4)).toEqual({ schemaVersion: 1, session, n: 4, ok: false, deny: 'the agent is not running' })
  })

  test('a stop request calls TaskStop, reports the worker killed, and denies its later tool calls', async ($, on) => {
    const world = engine(on)
    await start($, world)
    const root = await pluginRoot($, world)
    await startExecute($, world, root)
    const session = uuid(9)
    world.files[`${executeDir(session)}/notes.txt`] = ''
    await supervise($, world, root, session)

    writeRequest(world, session, 2, { kind: 'stop', agentId: 'worker-1' })
    await world.clock.advance(1_000)
    expect(world.stops).toEqual(['worker-1'])
    expect(response(world, session, 2)).toEqual({ schemaVersion: 1, session, n: 2, ok: true })

    world.seen.length = 0
    const denied = await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'worker-1' } as never)
    expect(denied).toEqual(expect.objectContaining({ deny: STOP_DENIAL }))
    expect(world.seen).toEqual([])
  })

  test('a stop the agent list does not confirm answers ok false', async ($, on) => {
    const world = engine(on)
    await start($, world)
    const root = await pluginRoot($, world)
    await startExecute($, world, root)
    const session = uuid(10)
    world.files[`${executeDir(session)}/notes.txt`] = ''
    await supervise($, world, root, session)

    world.stopStatus = 'running'
    writeRequest(world, session, 2, { kind: 'stop', agentId: 'worker-1' })
    await world.clock.advance(1_000)
    expect(response(world, session, 2)).toEqual({
      schemaVersion: 1, session, n: 2, ok: false, deny: 'nmg-sdlc: stop not confirmed for worker-1: status running',
    })
  })

  // The kit starts no subagent, so the module's worker map stays empty; this drives the record transitions the
  // module's tool.call, turn.complete and turn.step hooks apply to a worker, with the Bash result the engine returns.
  test('a stage worker\'s backgrounded Bash call is recorded, kept through its turn end, and cleared on its next turn', async ($, on) => {
    const world = engine(on)
    await start($, world)
    world.bash.push({ command: 'npm test', stdout: '', backgroundTaskId: 'task-7', timedOutAfterMs: 120000 })
    const backgrounded = await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'worker-7' } as never)
    const foreground = await $.tool.call({ tool: 'Bash', command: 'git status', agentId: 'worker-7' } as never)
    const taskId = backgroundTaskOf('Bash', (backgrounded as unknown as { result?: unknown }).result)
    expect(taskId).toBe('task-7')
    expect(backgroundTaskOf('Bash', (foreground as unknown as { result?: unknown }).result)).toBeNull()
    expect(backgroundTaskOf('Read', { backgroundTaskId: 'task-7' })).toBeNull()

    let record = recordStepStart(emptyAgentRecord('worker-7', 1_000), 1_000)
    record = recordToolCall(record, { tool: 'Bash', input: { command: 'npm test' }, at: 2_000 })
    record = recordBackgroundStart(record, { taskId: String(taskId), command: 'npm test', at: 2_000 })
    expect(record.background).toEqual([{ taskId: 'task-7', command: expect.stringContaining('npm test'), startedAt: 2_000 }])
    // A step while the worker is still running keeps the command tracked.
    record = recordStepStart(record, 3_000)
    expect(record.background).toHaveLength(1)

    // The worker settles with its command still running: the entry stays, and a check-in names it.
    record = recordTurnEnd(record, { reason: 'answer', status: 'idle', at: 4_000 })
    expect(record).toMatchObject({ status: 'idle', background: [expect.objectContaining({ taskId: 'task-7' })] })
    expect(activityRecord(record, 64_000).background).toEqual({ command: expect.stringContaining('npm test'), elapsedSeconds: 62 })

    // Its next turn ends the background commands it was tracking.
    record = recordStepStart(record, 70_000)
    expect(record).toMatchObject({ status: 'running', background: [], lastActivityAt: 70_000 })
    expect(activityRecord(record, 71_000).background).toBeNull()
  })

  test('an undelivered report is not announced while the main loop is mid-turn', async ($, on) => {
    const world = engine(on)
    await start($, world)
    const root = await pluginRoot($, world)
    await startExecute($, world, root)
    const session = uuid(11)
    world.files[`${executeDir(session)}/report-1.json`] = '{"schemaVersion":1,"seq":1}'

    await step($, world)
    await supervise($, world, root, session)
    await world.clock.advance(10_000)
    await world.clock.advance(10_000)
    expect(world.prompts).toEqual([])
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
      { command: mergeCommand(root, 400), stdout: '{"ok":true,"merged":true,"pr":401,"issue":400,"dir":"specs/400-slug-400"}' },
      { command: mergeCommand(root, 401), stdout: '{"ok":false,"reasonCode":"pr_merge_failed"}', isError: true },
      { command: mergeCommand(root, 403), stdout: '{"merged":true' },
      { command: mergeCommand(root, 402), stdout: 'Exit code 1\n{"ok":false,"reasonCode":"default_checkout_failed","merged":true,"pr":403,"issue":402,"dir":"specs/402-slug-402"}', isError: true },
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
    world.bash.push({ command: mergeCommand(root, 420), stdout: '{"ok":true,"merged":true,"pr":421,"issue":420,"dir":"specs/420-slug-420"}' })
    await $.tool.call({ tool: 'Bash', command: mergeCommand(root, 420), tool_use_id: 'p420' } as never)

    world.draft = 'my draft'
    await endTurn($, world)
    expect(world.prompts).toEqual([])
    expect(world.toasts.at(-1)).toContain('NMG SDLC: write-spec published #420;')

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
    // Claude Code dismisses a plan approval only for an allow that carries the input back.
    expect(await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: { plan: '# Spec' } }))
      .toEqual({ decision: { behavior: 'allow', updatedInput: { plan: '# Spec' } } })
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

describe('plan and question gates', () => {
  // AC9: NMG_SDLC_AUTOPILOT is not read; every plan and question goes to the person.
  for (const [label, env] of [['without', {}], ['with', { NMG_SDLC_AUTOPILOT: '1' }]] as const) {
    test(`${label} NMG_SDLC_AUTOPILOT=1, questions, plans and plan entry go to the person`, async ($, on) => {
      const world = engine(on, { env })
      await start($, world)
      const questions = [{ question: 'Which kind?', header: 'Kind', multiSelect: false, options: [{ label: 'Bug', description: '' }, { label: 'Feature (Recommended)', description: '' }] }]
      expect(await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: { questions } })).toEqual({})
      expect(await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: { plan: '# Draft' } })).toEqual({})
      expect(await $.classic.PermissionRequest({ tool_name: 'EnterPlanMode', tool_input: {} })).toEqual({})
    })
  }

  test('with NMG_SDLC_AUTOPILOT=1 the write-spec Finished approval is unchanged', async ($, on) => {
    const world = engine(on, { env: { NMG_SDLC_AUTOPILOT: '1' } })
    await start($, world)
    await run($, world, 'sdlc-write-spec', '#5')
    await ask($, FINISHED)
    expect(await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: { plan: '# Done' } }))
      .toEqual({ decision: { behavior: 'allow', updatedInput: { plan: '# Done' } } })
  })
})

describe('step models', () => {
  test('hooks-registered commands run on their model without changing the session model', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await typed($, world, '/sdlc-write-spec #7')
    await run($, world, 'sdlc-write-spec', '#7')
    expect(world.origins.at(-1)).toBe('plugin')
    expect(await step($, world)).toEqual({ model: 'opus', effort: 'high' })

    // write-spec Continue, submitted by the hooks module after a merge.
    await $.tool.call({ tool: 'Bash', command: `node "${ROOT_TOKEN}/scripts/sdlc-status.mjs"` })
    const root = /^node "(.+)\/scripts\//.exec(world.seen.at(-1) ?? '')?.[1] ?? ''
    world.bash.push({ command: mergeCommand(root, 7), stdout: '{"ok":true,"merged":true,"pr":8,"issue":7,"dir":"specs/7-slug-7"}' })
    await $.tool.call({ tool: 'Bash', command: mergeCommand(root, 7), tool_use_id: 'p7' } as never)
    await endTurn($, world)
    expect(world.prompts.at(-1)?.text).toContain(CONTINUE_HEAD)
    expect(world.origins.at(-1)).toBe('plugin')
    expect(await step($, world)).toEqual({ model: 'opus', effort: 'high' })

    // The Finished nudge, submitted when the Finished reply ends without ExitPlanMode.
    await ask($, FINISHED)
    await endTurn($, world)
    expect(world.prompts.at(-1)?.text).toContain('call ExitPlanMode now')
    expect(world.origins.at(-1)).toBe('plugin')
    expect(await step($, world)).toEqual({ model: 'opus', effort: 'high' })

    expect(await step($, world, { agentId: 'sub-agent', model: 'claude-haiku-5-5' }))
      .toEqual({ model: 'claude-haiku-5-5', effort: 'high', agentId: 'sub-agent' })

    // A composer-typed command clears the old override before its own command.run sets the new one.
    await typed($, world, '/sdlc-status')
    await run($, world, 'sdlc-draft-issue')
    expect(await step($, world)).toEqual({ model: 'opus', effort: 'high' })

    // Nothing set the session model: no /model run and no settings write.
    expect(world.sessionModel).toBe('claude-sonnet-5-5')
    expect(world.plans.filter(plan => plan.startsWith('/model'))).toEqual([])
    expect(world.configWrites).toEqual([])
  })

  test('the override ends when the user moves on or picks a model', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await run($, world, 'sdlc-draft-issue')
    expect(await step($, world)).toEqual({ model: 'opus', effort: 'high' })
    await $.prompt.submit({ text: 'reminder', wait: false, isMeta: true, origin: { kind: 'composer' } })
    await $.prompt.submit({ text: 'done', wait: false, origin: { kind: 'task-notification' } })
    expect(await step($, world)).toEqual({ model: 'opus', effort: 'high' })
    await typed($, world, 'thanks, something else now')
    expect(await step($, world)).toEqual({ model: 'claude-sonnet-5-5', effort: 'high' })

    await run($, world, 'sdlc-draft-issue')
    await typed($, world, 'from my phone', 'bridge')
    expect(await step($, world)).toEqual({ model: 'claude-sonnet-5-5', effort: 'high' })

    await run($, world, 'sdlc-draft-issue')
    world.sessionModel = 'claude-haiku-5-5'
    expect(await step($, world)).toEqual({ model: 'claude-haiku-5-5', effort: 'high' })
    world.sessionModel = 'claude-sonnet-5-5'
    expect(await step($, world)).toEqual({ model: 'claude-sonnet-5-5', effort: 'high' })

    world.renderFails = true
    await run($, world, 'sdlc-steering')
    expect(await step($, world)).toEqual({ model: 'claude-sonnet-5-5', effort: 'high' })
  })

  test('a headless refusal sets no override', async ($, on) => {
    const world = engine(on, { interactive: false })
    await start($, world, false)
    await run($, world, 'sdlc-write-spec', '#7')
    expect(await step($, world)).toEqual({ model: 'claude-sonnet-5-5', effort: 'high' })
  })

  test('a failing session model read never blocks or rewrites a request', async ($, on) => {
    const world = engine(on)
    await start($, world)
    await run($, world, 'sdlc-draft-issue')
    world.modelFails = true
    expect(await step($, world)).toEqual({ model: 'claude-sonnet-5-5', effort: 'high' })
  })
})

describe('sdlc-execute session model', () => {
  const refusal = (model: string) =>
    `/sdlc-execute requires an Opus session (current: ${model}). Switch with /model opus and run /sdlc-execute again.`

  for (const model of ['claude-opus-5-5', 'claude-fable-5-1', 'Opus 5.5']) {
    test(`a ${model} session runs sdlc-execute on its own model`, async ($, on) => {
      const world = engine(on)
      world.sessionModel = model
      await start($, world)
      await typed($, world, '/sdlc-execute #42')
      const result = await run($, world, 'sdlc-execute', '#42')
      expect(result).toEqual({})
      expect(world.prompts.at(-1)).toEqual({ text: '# sdlc-execute workflow', asUser: true })
      expect(await step($, world)).toEqual({ model, effort: 'high' })
    })
  }

  for (const model of ['claude-sonnet-5-5', 'claude-haiku-5-5']) {
    test(`a ${model} session is told to switch and stopped before anything renders`, async ($, on) => {
      const world = engine(on)
      world.sessionModel = model
      await start($, world)
      const result = await run($, world, 'sdlc-execute', '#42')
      expect(result).toEqual(expect.objectContaining({ text: refusal(model), exitCode: 1 }))
      expect(world.renders).toEqual([])
      expect(world.prompts).toEqual([])
      expect(world.plans).toEqual([])
      expect(world.seen).toEqual([])
    })
  }

  test('an unreadable session model fails closed as unknown', async ($, on) => {
    const world = engine(on)
    await start($, world)
    world.modelFails = true
    const result = await run($, world, 'sdlc-execute')
    expect(result).toEqual(expect.objectContaining({ text: refusal('unknown'), exitCode: 1 }))
    expect(world.renders).toEqual([])
    expect(world.prompts).toEqual([])
  })
})

describe('write-spec publication recognition', () => {
  const mergedJson = (issue: number) =>
    JSON.stringify({ ok: true, merged: true, pr: issue + 1, issue, dir: `specs/${issue}-slug-${issue}` })

  // Starts a write-spec run and returns the plugin root its commands resolve to.
  async function startWriteSpec($: Dollar, world: World) {
    await start($, world)
    await run($, world, 'sdlc-write-spec')
    await $.tool.call({ tool: 'Bash', command: 'node "<plugin-root>/scripts/sdlc-status.mjs"' })
    const root = /^node "(.+)\/scripts\//.exec(world.seen.at(-1) ?? '')?.[1] ?? ''
    world.plans.length = 0
    world.prompts.length = 0
    return root
  }

  test('a merge quoted differently from the verbatim command submits one Continue prompt', async ($, on) => {
    const world = engine(on)
    const root = await startWriteSpec($, world)
    const merge = `node '${root}//scripts/publish-approved-spec.mjs' merge --issue 430 --dir specs/430-slug-430`
    world.bash.push({ command: merge, stdout: mergedJson(430) })
    await $.tool.call({ tool: 'Bash', command: merge, tool_use_id: 'q430' } as never)
    await endTurn($, world)
    expect(world.plans).toEqual(['/plan'])
    expect(world.prompts).toHaveLength(1)
    expect(world.prompts[0]?.text).toContain('published[] = [{"issue":430,"slug":"slug-430"}]')
  })

  test('a backgrounded merge records its publication once, when its result is read back', async ($, on) => {
    const world = engine(on)
    const root = await startWriteSpec($, world)
    const merge = mergeCommand(root, 440)
    world.bash.push(
      { command: merge, stdout: '', backgroundTaskId: 'task-440', timedOutAfterMs: 120000 },
      { command: 'cat /tmp/task-440.output', stdout: `${mergedJson(440)}\n` },
    )
    await $.tool.call({ tool: 'Bash', command: merge, tool_use_id: 'b440' } as never)
    await endTurn($, world)
    expect(world.plans).toEqual([])
    expect(world.prompts).toEqual([])

    await $.tool.call({ tool: 'Bash', command: 'cat /tmp/task-440.output', tool_use_id: 'c440' } as never)
    await endTurn($, world)
    expect(world.plans).toEqual(['/plan'])
    expect(world.prompts).toHaveLength(1)
    expect(world.prompts[0]?.text).toContain('published[] = [{"issue":440,"slug":"slug-440"}]')

    await $.tool.call({ tool: 'Bash', command: 'cat /tmp/task-440.output', tool_use_id: 'c440again' } as never)
    await endTurn($, world)
    expect(world.prompts).toHaveLength(1)
  })

  test('a backgrounded merge is also recognized from a Read of its output', async ($, on) => {
    const world = engine(on)
    const root = await startWriteSpec($, world)
    const merge = mergeCommand(root, 450)
    world.bash.push({ command: merge, stdout: '', backgroundTaskId: 'task-450' })
    world.files['/tmp/task-450.output'] = `${mergedJson(450)}\n`
    await $.tool.call({ tool: 'Bash', command: merge, tool_use_id: 'b450' } as never)
    await $.tool.call({ tool: 'Read', file_path: '/tmp/task-450.output', tool_use_id: 'r450' } as never)
    await endTurn($, world)
    expect(world.prompts).toHaveLength(1)
    expect(world.prompts[0]?.text).toContain('published[] = [{"issue":450,"slug":"slug-450"}]')
  })

  test('unrelated merged JSON schedules nothing, and another issue leaves a backgrounded merge outstanding', async ($, on) => {
    const world = engine(on)
    const root = await startWriteSpec($, world)
    world.bash.push({ command: 'cat /tmp/other.json', stdout: mergedJson(460) })
    await $.tool.call({ tool: 'Bash', command: 'cat /tmp/other.json', tool_use_id: 'u460' } as never)
    await endTurn($, world)
    expect(world.prompts).toEqual([])

    const merge = mergeCommand(root, 470)
    world.bash.push(
      { command: merge, stdout: '', backgroundTaskId: 'task-470' },
      { command: 'cat /tmp/task-470.output', stdout: mergedJson(471) },
      { command: 'cat /tmp/task-470-final.output', stdout: mergedJson(470) },
    )
    await $.tool.call({ tool: 'Bash', command: merge, tool_use_id: 'b470' } as never)
    await $.tool.call({ tool: 'Bash', command: 'cat /tmp/task-470.output', tool_use_id: 'c470' } as never)
    await endTurn($, world)
    expect(world.prompts).toEqual([])

    await $.tool.call({ tool: 'Bash', command: 'cat /tmp/task-470-final.output', tool_use_id: 'f470' } as never)
    await endTurn($, world)
    expect(world.prompts).toHaveLength(1)
    expect(world.prompts[0]?.text).toContain('published[] = [{"issue":470,"slug":"slug-470"}]')
  })

  test('a render failure keeps the Continue pending, names the issue, and submits on a later empty turn end', async ($, on) => {
    const world = engine(on)
    const root = await startWriteSpec($, world)
    const merge = mergeCommand(root, 480)
    world.bash.push({ command: merge, stdout: mergedJson(480) })
    await $.tool.call({ tool: 'Bash', command: merge, tool_use_id: 'p480' } as never)
    world.renderFails = true
    await endTurn($, world)
    expect(world.prompts).toEqual([])
    expect(world.toasts.at(-1)).toBe('NMG SDLC: write-spec published #480; the Continue picker opens in plan mode after the next turn that ends with an empty prompt box.')

    world.renderFails = false
    await endTurn($, world)
    expect(world.prompts).toHaveLength(1)
    expect(world.prompts[0]?.text).toContain('published[] = [{"issue":480,"slug":"slug-480"}]')
  })

  test('after a Finished selection no continuation follows the last publication', async ($, on) => {
    const world = engine(on)
    const root = await startWriteSpec($, world)
    const merge = mergeCommand(root, 490)
    world.bash.push({ command: merge, stdout: mergedJson(490) })
    await $.tool.call({ tool: 'Bash', command: merge, tool_use_id: 'p490' } as never)
    await endTurn($, world)
    expect(world.prompts).toHaveLength(1)

    world.prompts.length = 0
    await ask($, FINISHED)
    await endTurn($, world)
    expect(world.prompts.map(({ text }) => text).join('\n')).not.toContain(CONTINUE_HEAD)
    expect(world.prompts[0]?.text).toContain('call ExitPlanMode now')
  })
})
