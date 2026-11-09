import type { CommandRunResult, EngineInterface, Register, TurnStepInput } from 'claude-code'
import {
  DIRECT_COMMANDS,
  INTERACTIVE_COMMANDS,
  SDLC_MODELS,
  executeGoalCondition,
  executeGoalRequest,
  executeGoalStoppedLine,
  executeModelRefusal,
  interactiveHeadlessMessage,
  isExecuteSuperviseCommand,
  materializePluginRootCommand,
  materializePluginRootPath,
  parseInteractiveSlash,
  writeSpecFinishedSelection,
  writeSpecMergeIssue,
  writeSpecMergeResult,
  writeSpecPublication,
} from '../src/host-events.mjs'
import {
  agentBody,
  checkInNotice,
  emptyAgentRecord,
  executeResultPath,
  executeResultText,
  hostResponse,
  missingResultText,
  recordToolCall,
  recordTurnEnd,
  stoppedWorkerDenial,
  validateHostRequest,
  type AgentRecord,
} from '../src/execute-host.mjs'

type Published = { issue: number; slug: string }

type Rendered = { ok: true; text: string } | { ok: false; message: string }

type Engine = EngineInterface

// A controller request's answer: `agentId` on a started subagent or a delivered message, `deny` on a refusal.
type Fields = { ok: boolean; agentId?: string; deny?: string }

// A request the controller wrote into the execute session directory.
type Request = {
  kind: string
  session: string
  n: number
  issue?: number
  step?: string
  entry?: string
  agent?: string
  name?: string
  model?: string
  effort?: string | null
  permissionMode?: string
  promptFile?: string
  cwd?: string
  agentId?: string
  text?: string
}

// A stage subagent this session started, and the settings its turns run on.
type WorkerSpec = { dir: string; issue: number; step: string; model: string; effort: string | null }

// One /sdlc-execute session the hooks module services: its directory, the requests answered, and the
// reports already announced to the supervising session.
type Bridge = {
  session: string
  cwd: string
  dir: string
  claudeSessionId: string
  busy: boolean
  finished: boolean
  heartbeatAt: number
  latestAt: number
  handled: Set<number>
  announced: Set<number>
  cancel: () => void
}

const ARGUMENT_HINTS: Record<string, string> = {
  'sdlc-draft-issue': '[need]',
  'sdlc-write-spec': '[#N]',
  'sdlc-onboard-project': '',
  'sdlc-upgrade-project': '',
  'sdlc-steering': '[request]',
  'sdlc-run-retro': '',
  'sdlc-execute': '[--check-in-seconds N] [#N ...]',
}

// Names every published issue, so a held Continue stays visible to the person.
function pendingContinuationNotice(published: Published[]): string {
  const issues = published.map(({ issue }) => `#${issue}`).join(', ')
  return `NMG SDLC: write-spec published ${issues}; the Continue picker opens in plan mode after the next turn that ends with an empty prompt box.`
}

const FINISHED_EXIT_NOTICE =
  'NMG SDLC: write-spec finished, but plan mode is still active; Shift+Tab exits it.'
const FINISHED_EXIT_PROMPT =
  'write-spec Finished: call ExitPlanMode now as your only action, with no other output.'
const RENDER_TIMEOUT_MS = 120_000

// The stage subagent bridge: the controller's request channel is serviced at this tick, the heartbeat is
// written at HEARTBEAT_MS, a worker's latest text refreshed at LATEST_TEXT_MS, and a waiting report is
// announced once the main loop has been idle for NOTICE_IDLE_MS.
const BRIDGE_TICK_MS = 1_000
const HEARTBEAT_MS = 15_000
const LATEST_TEXT_MS = 15_000
const NOTICE_IDLE_MS = 5_000
const LATEST_TEXT_CHARS = 2_000
// Tools a stage subagent may never call: it has no user to answer and no plan mode to enter or leave.
const SUBAGENT_DISALLOWED = ['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode']
// Subagent statuses that end a stage turn; anything else at a turn end is recorded as idle.
const SETTLED_STATUSES = ['idle', 'completed', 'failed', 'killed']
// Subagent statuses that confirm a stop request.
const STOPPED_STATUSES = ['killed', 'completed', 'failed']
const SESSION_LINE = /^NMG_SDLC_EXECUTE_SESSION: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/m
const REQUEST_FILE = /^request-([1-9]\d*)\.json$/
const REPORT_FILE = /^report-([1-9]\d*)\.json$/
const DECISION_FILE = /^decision-([1-9]\d*)\.json$/
const RESULT_FILE = 'result.json'

// One write-spec run per process: plan approval may clear context, so
// published[] must outlive the conversation. Each new /sdlc-write-spec
// invocation starts a fresh list.
const writeSpec = {
  published: [] as Published[],
  // Merges whose Bash call moved to the background, by issue, until their
  // result is read in a later call.
  backgrounded: new Set<number>(),
  pending: false,
  // A write-spec session (the command or its continuation) is running.
  active: false,
  // A Finished selection awaits the end of its reply turn.
  exitPending: false,
}
// The /sdlc-execute run in this session. supervise is refused until its goal is
// set; pendingIssues holds the issues a `goal` helper result named, until the
// turn that ran that helper completes.
const execute = {
  active: false,
  goalSet: false,
  pendingIssues: null as number[] | null,
}
const recordedPublications = new Set<string>()
let interactive = true
// The one prompt that asks the model to leave plan mode after Finished was sent.
let exitNudged = false
// The running command's model: main-loop requests name it until the person
// submits their own prompt or the session model changes. The session model
// itself is never set.
let modelOverride: { command: string; model: string; sessionModel: string } | null = null
// Stage subagents this session started, by agentId, and the agentIds whose stop was requested.
const workers = new Map<string, WorkerSpec>()
const stopped = new Set<string>()
// Agent record writes per agent, in order, so concurrent hook events never interleave a read and write.
const agentQueues = new Map<string, Promise<unknown>>()
let bridge: Bridge | null = null
// Whether the main loop is mid-turn, and when it last became idle; a report is announced only after idleness.
let mainBusy = false
let mainIdleSince = 0
// A headless /sdlc-execute run has no UI; its goal handshake completes before its turn ends.
let headlessRun = false

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function refusal(deny: string): Fields {
  return { ok: false, deny }
}

async function render($: Engine, args: string[]): Promise<Rendered> {
  const script = `${$.plugin.root}/scripts/sdlc-render-prompt.mjs`
  try {
    const cwd = await $.session.cwd()
    const { exitCode, stdout, stderr } = await $.process.run(
      ['node', script, '--project', cwd, ...args],
      { timeoutMs: RENDER_TIMEOUT_MS },
    )
    if (exitCode === 0 && stdout.length > 0) return { ok: true, text: stdout }
    let message = stderr.trim() || `prompt render exited ${exitCode}`
    try { message = JSON.parse(message).reasonCode ?? message } catch { /* plain text */ }
    return { ok: false, message }
  } catch (error) {
    return { ok: false, message: errorText(error) }
  }
}

// Enter native plan mode with `text` as its first turn: a bare `/plan` enables
// plan mode (and only shows the plan when plan mode is already on), then the
// text is submitted as the person's own prompt.
async function submitInPlanMode($: Engine, text: string): Promise<boolean> {
  try {
    await $.command.run({ command: 'plan', args: '' })
  } catch (error) {
    $.ui.log(`NMG SDLC: /plan failed: ${errorText(error)}`, { to: 'debug' })
    return false
  }
  await $.prompt.submit({ text, asUser: true })
  return true
}

function startInteractiveCommand(command: string): void {
  if (command === 'sdlc-write-spec') {
    Object.assign(writeSpec, { published: [], backgrounded: new Set<number>(), pending: false, active: true, exitPending: false })
    exitNudged = false
  } else {
    Object.assign(writeSpec, { active: false, exitPending: false })
  }
  if (command === 'sdlc-execute') Object.assign(execute, { active: true, goalSet: false, pendingIssues: null })
  else Object.assign(execute, { active: false, pendingIssues: null })
}

// A command without a table model (`/sdlc-execute`) keeps the session model.
async function startModelOverride($: Engine, command: string): Promise<void> {
  const model = SDLC_MODELS.commands[command]
  try {
    modelOverride = model ? { command, model, sessionModel: await $.session.model() } : null
  } catch {
    modelOverride = null
  }
}

// `/sdlc-execute` supervises its workers only on an Opus or Fable session; an
// unreadable model is refused as `unknown`.
async function executeRefusal($: Engine): Promise<string | null> {
  let model: string | undefined
  try { model = await $.session.model() } catch { /* unknown */ }
  return executeModelRefusal(model)
}

// The request a main-loop step sends while a command's model override holds;
// any other step, or a host failure, goes out as the engine resolved it. A stage
// subagent's step runs on the model and effort its spawn request named.
async function overrideStep($: Engine, e: TurnStepInput): Promise<TurnStepInput> {
  if (e.agentId !== undefined) {
    const worker = workers.get(e.agentId)
    if (worker === undefined) return e
    return { ...e, model: worker.model, ...(worker.effort !== null ? { effort: worker.effort } : {}) } as TurnStepInput
  }
  if (modelOverride === null) return e
  try {
    if ((await $.session.model()) !== modelOverride.sessionModel) {
      modelOverride = null
      return e
    }
  } catch {
    return e
  }
  return { ...e, model: modelOverride.model }
}

// Records one merged publication once per tool call and per issue, and marks
// the Continue prompt pending.
function recordPublication(toolUseId: string, publication: Published): void {
  if (recordedPublications.has(toolUseId)) return
  recordedPublications.add(toolUseId)
  if (writeSpec.published.some(({ issue }) => issue === publication.issue)) return
  writeSpec.published.push({ issue: publication.issue, slug: publication.slug })
  writeSpec.pending = true
}

// A backgrounded merge's sole JSON result arrives in a later Bash or Read
// call; it counts once, while its issue is still outstanding.
function recordBackgrounded(toolUseId: string, text: unknown): void {
  const result = writeSpecMergeResult(text)
  if (result === null || !writeSpec.backgrounded.has(result.issue)) return
  writeSpec.backgrounded.delete(result.issue)
  recordPublication(toolUseId, { issue: result.issue, slug: result.slug })
}

// A merged write-spec publication is recorded from its merge result; the
// Continue prompt is submitted in plan mode once the turn ends, so
// post-merge remediation finishes first. Any host failure keeps it pending.
async function submitContinuation($: Engine): Promise<void> {
  try {
    const box = await $.prompt.read()
    if (!interactive || box.text !== '') {
      $.ui.toast(pendingContinuationNotice(writeSpec.published))
      return
    }
    writeSpec.pending = false
    const rendered = await render($, [
      '--consumer', 'sdlc-write-spec',
      '--published', JSON.stringify(writeSpec.published),
    ])
    if (!rendered.ok || !(await submitInPlanMode($, rendered.text))) {
      writeSpec.pending = true
      $.ui.toast(pendingContinuationNotice(writeSpec.published))
      return
    }
    writeSpec.active = true
  } catch {
    writeSpec.pending = true
    $.ui.toast(pendingContinuationNotice(writeSpec.published))
  }
}

// Sets the run's /goal once its issues are known. supervise stays refused until
// the goal is set; a failure keeps it refused and has the session print the
// goal_unavailable stop line instead.
async function setExecuteGoal($: Engine, issues: number[]): Promise<void> {
  try {
    const condition = executeGoalCondition(issues)
    if (condition === null) throw new Error('goal issues are invalid')
    if (!(await $.command.list()).some(({ name }) => name === 'goal')) throw new Error('goal command unavailable')
    // Set before the goal's own turn, so that turn's supervise passes the gate.
    execute.goalSet = true
    await $.command.run({ command: 'goal', args: condition })
  } catch (error) {
    execute.goalSet = false
    void $.prompt.submit({
      text: `NMG SDLC: setting the /goal failed. Print exactly this line and stop without running supervise: ${executeGoalStoppedLine(errorText(error))}`,
    })
  }
}

// ---------------------------------------------------------------------------
// Stage subagents: the controller's request channel, the worker records and the
// supervising session's heartbeat, reports and check-in notices.
// ---------------------------------------------------------------------------

function agentPath(dir: string, agentId: string): string {
  return `${dir}/agent-${agentId}.json`
}

async function readJsonFile<T>($: Engine, path: string): Promise<T | null> {
  try {
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return null
  }
}

async function writeJsonFile($: Engine, path: string, value: unknown): Promise<void> {
  await $.fs.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

// Runs `job` after the agent's earlier record writes, so a read and its write never interleave with another.
function queueAgent(agentId: string, job: () => Promise<void>): Promise<void> {
  const next = (agentQueues.get(agentId) ?? Promise.resolve()).then(job)
  agentQueues.set(agentId, next.catch(() => undefined))
  return next
}

async function updateAgent(
  $: Engine,
  dir: string,
  agentId: string,
  change: (record: AgentRecord) => AgentRecord,
): Promise<void> {
  const path = agentPath(dir, agentId)
  const current = (await readJsonFile<AgentRecord>($, path)) ?? emptyAgentRecord(agentId, await $.clock.now())
  await writeJsonFile($, path, change(current))
}

function executeDir(cwd: string, session: string): string {
  return `${cwd}/.nmg-sdlc/execute/${session}`
}

function stopBridge(state: Bridge): void {
  state.finished = true
  if (bridge === state) bridge = null
  if (!state.busy) state.cancel()
}

// Starts servicing one supervised session's directory, once its supervise call has announced it.
async function startBridge($: Engine, session: string): Promise<void> {
  if (bridge?.session === session) return
  if (bridge !== null) stopBridge(bridge)
  const cwd = await $.session.cwd()
  const claudeSessionId = await $.session.id()
  const state: Bridge = {
    session, cwd, dir: executeDir(cwd, session), claudeSessionId,
    busy: false, finished: false, heartbeatAt: 0, latestAt: 0,
    handled: new Set(), announced: new Set(), cancel: () => undefined,
  }
  bridge = state
  const timer = $.clock.every(BRIDGE_TICK_MS, () => {
    if (!state.busy && !state.finished) void tick($, state)
  })
  state.cancel = () => timer.cancel()
  // The heartbeat is written at once: the supervise call has just created the directory, and the controller
  // treats a session with no fresh heartbeat as gone.
  try {
    state.heartbeatAt = await $.clock.now()
    await writeJsonFile($, `${state.dir}/host.json`, { schemaVersion: 1, claudeSessionId, at: state.heartbeatAt })
  } catch {
    // The next tick writes the heartbeat once the directory is listable.
  }
  await tick($, state)
}

// One bridge pass: heartbeat, the controller's requests in order, the announcement of a waiting report, and
// each worker's latest text. A directory that is gone, or a terminal result, ends the bridge.
async function tick($: Engine, state: Bridge): Promise<void> {
  if (state.busy) return
  state.busy = true
  try {
    let names: string[]
    try {
      names = (await $.fs.list(state.dir)).map((entry) => entry.name)
    } catch {
      stopBridge(state)
      return
    }
    const now = await $.clock.now()
    if (now - state.heartbeatAt >= HEARTBEAT_MS) {
      state.heartbeatAt = now
      await writeJsonFile($, `${state.dir}/host.json`, { schemaVersion: 1, claudeSessionId: state.claudeSessionId, at: now })
    }
    await serviceRequests($, state, names)
    if (names.includes(RESULT_FILE)) {
      stopBridge(state)
      return
    }
    await announceReport($, state, names)
    await refreshLatestText($, state, now)
  } catch {
    // The next tick retries; a refused request was already answered with its deny.
  } finally {
    state.busy = false
    if (state.finished) state.cancel()
  }
}

// Answers the controller's requests in number order, once each.
async function serviceRequests($: Engine, state: Bridge, names: string[]): Promise<void> {
  const numbers = names
    .map((name) => REQUEST_FILE.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .sort((left, right) => left - right)
  for (const n of numbers) {
    if (state.handled.has(n)) continue
    state.handled.add(n)
    await answerRequest($, state, n)
  }
}

async function answerRequest($: Engine, state: Bridge, n: number): Promise<void> {
  const responsePath = `${state.dir}/response-${n}.json`
  const request = await readJsonFile<Request>($, `${state.dir}/request-${n}.json`)
  const checked = validateHostRequest(request)
  let fields: Fields
  if (request === null || !checked.ok) {
    fields = refusal(checked.ok ? 'nmg-sdlc: invalid host request' : checked.deny)
  } else {
    try {
      fields = await serviceRequest($, state, request)
    } catch (error) {
      fields = refusal(`nmg-sdlc: request ${n} failed: ${errorText(error)}`)
    }
  }
  await writeJsonFile($, responsePath, hostResponse({ session: state.session, n }, fields))
}

async function serviceRequest($: Engine, state: Bridge, request: Request): Promise<Fields> {
  if (request.kind === 'spawn') return spawnWorker($, state, request)
  const agentId = request.agentId ?? ''
  if (request.kind === 'append') return appendToWorker($, agentId, request.text ?? '')
  if (request.kind === 'send') return sendToWorker($, agentId, request.text ?? '')
  return stopWorker($, agentId)
}

// Registers `execute-<entry>` with the request's model, effort and permission mode, and the stage agent's body as its
// system prompt, then starts the subagent with the controller's prompt file.
async function spawnWorker($: Engine, state: Bridge, request: Request): Promise<Fields> {
  const issue = request.issue ?? 0
  const step = request.step ?? ''
  const entry = request.entry ?? ''
  const name = `execute-${entry}`
  const definition = await readFile($, `${$.plugin.root}/agents/${request.agent ?? ''}.md`)
  if (definition === null) return refusal(`nmg-sdlc: stage agent definition agents/${request.agent ?? ''}.md is missing`)
  const prompt = await readFile($, `${state.dir}/${request.promptFile ?? ''}`)
  if (prompt === null) return refusal(`nmg-sdlc: stage prompt ${request.promptFile ?? ''} is unreadable`)
  try {
    await $.agent.register({
      name,
      description: `nmg-sdlc ${step} stage for #${issue}`,
      prompt: agentBody(definition),
      model: request.model ?? '',
      ...(request.effort ? { effort: request.effort } : {}),
      permissionMode: request.permissionMode ?? 'auto',
      disallowedTools: SUBAGENT_DISALLOWED,
    })
  } catch (error) {
    return refusal(`nmg-sdlc: stage agent registration rejected: ${errorText(error)}`)
  }
  let started: Awaited<ReturnType<Engine['agent']['spawn']>>
  try {
    started = await $.agent.spawn({
      prompt,
      subagentType: `nmg-sdlc:${name}`,
      description: `${step} #${issue}`,
      name: request.name,
      cwd: request.cwd,
    })
  } catch (error) {
    return refusal(`nmg-sdlc: stage spawn refused: ${errorText(error)}`)
  }
  const agentId = 'agentId' in started ? started.agentId : undefined
  if (typeof agentId !== 'string') {
    return refusal(`nmg-sdlc: stage spawn refused: ${'deny' in started && typeof started.deny === 'string' ? started.deny : 'no agent id'}`)
  }
  workers.set(agentId, { dir: state.dir, issue, step, model: request.model ?? '', effort: request.effort ?? null })
  const at = await $.clock.now()
  await queueAgent(agentId, () => writeJsonFile($, agentPath(state.dir, agentId), { ...emptyAgentRecord(agentId, at), status: 'running' }))
  return { ok: true, agentId }
}

async function readFile($: Engine, path: string): Promise<string | null> {
  try {
    return await $.fs.read(path)
  } catch {
    return null
  }
}

// The guidance enters the running subagent's conversation before its next model request; when the loop has
// ended, the same text resumes it as a message.
async function appendToWorker($: Engine, agentId: string, text: string): Promise<Fields> {
  if (stopped.has(agentId)) return refusal(stoppedWorkerDenial())
  try {
    const row = await $.session.append({ agentId, message: { type: 'user', content: [{ type: 'text', text }] } })
    // A refused append answers without a stored row's uuid; only a stored row counts as delivered.
    if (row && typeof row.uuid === 'string') return { ok: true }
  } catch {
    // A loop that has ended refuses the append; the message below resumes it.
  }
  return sendToWorker($, agentId, text)
}

async function sendToWorker($: Engine, agentId: string, text: string): Promise<Fields> {
  if (stopped.has(agentId)) return refusal(stoppedWorkerDenial())
  try {
    const sent = await $.session.send({ to: { agentId }, text })
    return sent.isDelivered ? { ok: true } : refusal(sent.reason ?? 'nmg-sdlc: message not delivered')
  } catch (error) {
    return refusal(`nmg-sdlc: message not delivered: ${errorText(error)}`)
  }
}

// Stops the subagent: its further tool calls are denied from now on, and the stop is confirmed only when its
// status is killed, completed or failed.
async function stopWorker($: Engine, agentId: string): Promise<Fields> {
  stopped.add(agentId)
  try {
    await $.tool.call({ tool: 'TaskStop', task_id: agentId } as never)
  } catch {
    // The status check below decides whether the stop held.
  }
  const listed = await $.agent.list().catch(() => [])
  const status = listed.find((agent) => agent.id === agentId)?.status
  const worker = workers.get(agentId)
  if (worker !== undefined) {
    const at = await $.clock.now()
    await queueAgent(agentId, () => updateAgent($, worker.dir, agentId, (record) => ({
      ...record, status: status ?? record.status, stopped: true, updatedAt: at,
    })))
  }
  if (status !== undefined && STOPPED_STATUSES.includes(status)) return { ok: true }
  return refusal(`nmg-sdlc: stop not confirmed for ${agentId}: status ${status ?? 'unknown'}`)
}

// Once a report waits, the supervising session is prompted to fetch it, after the main loop has been idle.
async function announceReport($: Engine, state: Bridge, names: string[]): Promise<void> {
  const decided = new Set(names
    .map((name) => DECISION_FILE.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number))
  const pending = names
    .map((name) => REPORT_FILE.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .filter((seq) => !decided.has(seq))
    .sort((left, right) => left - right)
  const seq = pending[0]
  if (seq === undefined || state.announced.has(seq)) return
  if (mainBusy || (await $.clock.now()) - mainIdleSince < NOTICE_IDLE_MS) return
  state.announced.add(seq)
  await $.prompt.submit({ text: checkInNotice({ session: state.session, seq, pluginRoot: $.plugin.root }) })
}

// Refreshes each running worker's latest transcript text at most every LATEST_TEXT_MS.
async function refreshLatestText($: Engine, state: Bridge, now: number): Promise<void> {
  if (now - state.latestAt < LATEST_TEXT_MS) return
  state.latestAt = now
  for (const [agentId, worker] of workers) {
    if (stopped.has(agentId) || worker.dir !== state.dir) continue
    const messages = await $.session.messages({ agentId }).catch(() => null)
    if (!Array.isArray(messages)) continue
    const latest = [...messages].reverse().find((message) => message.role === 'assistant' && message.text.length > 0)
    if (latest === undefined) continue
    const text = latest.text.slice(0, LATEST_TEXT_CHARS)
    await queueAgent(agentId, () => updateAgent($, worker.dir, agentId, (record) => ({ ...record, latestText: text, updatedAt: now })))
  }
}

// `/sdlc-execute --result`: the recorded lines and exit status for this Claude session, or the no-record answer.
async function executeResult($: Engine): Promise<{ text: string; exitCode: number }> {
  const claudeSessionId = await $.session.id()
  const record = await readJsonFile<unknown>($, executeResultPath(claudeSessionId))
  return executeResultText(record) ?? missingResultText(claudeSessionId)
}

// One interactive command's gates and workflow, for a typed `command.run` and for a pasted prompt alike,
// so both reach the same refusals, model gate, render, plan mode and model override.
async function runInteractive($: Engine, name: string, args: string): Promise<CommandRunResult> {
  // `--result` reads the recorded outcome of an earlier run; it mutates nothing and needs no model gate.
  if (name === 'sdlc-execute' && args.trim() === '--result') return executeResult($)
  const headless = !interactive || (await $.session.surfaces()).length === 0
  // Interactive commands need plan mode and AskUserQuestion, which a headless session lacks.
  if (headless && name !== 'sdlc-execute') {
    return { text: interactiveHeadlessMessage(name).trimEnd(), exitCode: 2 }
  }
  if (name === 'sdlc-execute') {
    const modelRefusal = await executeRefusal($)
    if (modelRefusal !== null) return { text: modelRefusal, exitCode: 1 }
  }
  const rendered = await render($, ['--consumer', name, '--args', args])
  if (!rendered.ok) return { text: `NMG SDLC: /${name} could not render its workflow: ${rendered.message}` }
  startInteractiveCommand(name)
  await startModelOverride($, name)
  headlessRun = headless
  // Neither `/plan` nor the workflow prompt can start from inside this
  // command's own dispatch; a timer starts them once it has settled. A
  // command's own `{ text }` answer is only printed, so a direct command
  // (`/sdlc-execute`, TUI or `claude -p`) submits its workflow as the prompt.
  if (DIRECT_COMMANDS.includes(name)) {
    $.clock.after(1, () => { void $.prompt.submit({ text: rendered.text, asUser: true }) })
    return {}
  }
  $.clock.after(1, async () => {
    if (!(await submitInPlanMode($, rendered.text))) {
      $.ui.toast(`NMG SDLC: /${name} could not enter plan mode; run it again.`)
    }
  })
  return {}
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    interactive = e.isInteractive
    // Plugin scripts and their children resolve the installed plugin from it.
    await $.env.set('NMG_SDLC_PLUGIN_ROOT', $.plugin.root)
    // The controller records its terminal result under this Claude session id.
    await $.env.set('NMG_SDLC_CLAUDE_SESSION_ID', await $.session.id())
    for (const [name, , description] of INTERACTIVE_COMMANDS) {
      await $.command.register({ name, description, argumentHint: ARGUMENT_HINTS[name] || undefined })
    }
    return started
  })

  for (const [name] of INTERACTIVE_COMMANDS) {
    on('command.run', { command: name }, ($, e) => runInteractive($, name, e.args))
  }

  // The person's own prompt or slash command ends the running command's model
  // override; a command it runs starts a fresh one from its `command.run`.
  // Plugin-submitted turns (the workflow, Continue, the Finished nudge) keep it.
  // A pasted prompt whose text begins with an interactive command name runs that
  // command as the typed one would, and is dropped so its text never reaches the
  // model. A prompt the engine parsed as a command (`e.command`) already ran in
  // `command.run`, so it passes through.
  on('prompt.submit', async ($, e, next) => {
    if ((e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') || e.isMeta === true) return next(e)
    modelOverride = null
    const match = e.command === undefined ? parseInteractiveSlash(e.text) : null
    if (match === null) return next(e)
    const result = await runInteractive($, match.command, match.args)
    return { drop: result.text ?? `NMG SDLC: running /${match.command}.` }
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      const worker = workers.get(e.agentId)
      if (worker !== undefined) {
        const at = await $.clock.now()
        const agentId = e.agentId
        void queueAgent(agentId, () => updateAgent($, worker.dir, agentId, (record) => ({
          ...record, status: 'running', lastActivityAt: at, updatedAt: at,
        }))).catch(() => undefined)
      }
    } else {
      mainBusy = true
    }
    return yield* next(await overrideStep($, e))
  })

  // A stopped subagent's further calls are denied; a stage subagent's calls are recorded as its activity.
  on('tool.call', async ($, e, next) => {
    const agentId = (e as { agentId?: string }).agentId
    if (agentId !== undefined) {
      if (stopped.has(agentId)) return { deny: stoppedWorkerDenial() }
      const worker = workers.get(agentId)
      if (worker !== undefined) {
        const call = e as unknown as { tool?: string; command?: unknown; file_path?: unknown }
        const at = await $.clock.now()
        void queueAgent(agentId, () => updateAgent($, worker.dir, agentId, (record) => recordToolCall(record, {
          tool: String(call.tool ?? 'tool'),
          input: { command: call.command, file_path: call.file_path },
          at,
        }))).catch(() => undefined)
      }
    }
    return next(e)
  })

  // Workflows name plugin scripts as `<plugin-root>/scripts/<name>.mjs`; the
  // installed plugin's absolute path replaces the placeholder before the shell
  // sees it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = materializePluginRootCommand(e.command, $.plugin.root)
    if (execute.active && !execute.goalSet && isExecuteSuperviseCommand(command)) {
      return { deny: 'NMG SDLC: /sdlc-execute sets its /goal before supervise. Run sdlc-execute.mjs goal with the resolved issues and end your turn.' }
    }
    const ran = await next(command === e.command ? e : { ...e, command })
    if (ran.deny !== undefined) return ran
    const stdout = ran.isError === true
      ? (ran.text ?? '')
      : (ran.result?.stdout ?? ran.text ?? '')
    // The supervise call announces its session; the bridge services that session's requests from here on.
    if (isExecuteSuperviseCommand(command)) {
      const session = SESSION_LINE.exec(stdout)?.[1]
      if (session !== undefined) await startBridge($, session)
    }
    const goal = execute.active ? executeGoalRequest({ command, stdout }) : null
    if (goal !== null) execute.pendingIssues = goal
    const publication = writeSpecPublication({ toolUseId: e.tool_use_id, command, stdout })
    if (publication) {
      recordPublication(e.tool_use_id, publication)
      return ran
    }
    // A merge that the Bash timeout or `run_in_background` moved to the
    // background returns no merged JSON yet; its result is read later.
    const issue = writeSpecMergeIssue(command)
    if (issue !== null && ran.result?.backgroundTaskId) {
      writeSpec.backgrounded.add(issue)
      return ran
    }
    if (writeSpec.backgrounded.size > 0) recordBackgrounded(e.tool_use_id, stdout)
    return ran
  })

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const file_path = materializePluginRootPath(e.file_path, $.plugin.root)
    const ran = await next(file_path === e.file_path ? e : { ...e, file_path })
    if (writeSpec.backgrounded.size > 0 && ran.result?.type === 'text') {
      recordBackgrounded(e.tool_use_id, ran.result.file?.content)
    }
    return ran
  })

  // Records the write-spec Finished selection; plan mode is exited only once
  // the reply turn ends, so the Finished output stays the last reply.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const ran = await next(e)
    if (writeSpec.active) {
      const finished = ran.deny === undefined && ran.isError !== true
        && writeSpecFinishedSelection(ran.result?.answers as Record<string, unknown> | undefined)
      if (finished && !writeSpec.exitPending) exitNudged = false
      writeSpec.exitPending = finished
    }
    return ran
  })

  // Claude Code settles a plan approval only from an allow that carries the
  // tool's input back; a bare allow leaves the approval dialog up.
  const approvePlan = (input: unknown) =>
    ({ behavior: 'allow', updatedInput: (input ?? {}) as Record<string, unknown> }) as const

  // After a write-spec Finished selection the workflow's last act is
  // ExitPlanMode; that one call is approved here, so plan mode ends with no
  // dialog and the session returns to the mode it had before plan mode.
  on('classic.PermissionRequest', async ($, e, next) => {
    if (e.tool_name === 'ExitPlanMode' && writeSpec.active && writeSpec.exitPending) {
      Object.assign(writeSpec, { active: false, exitPending: false })
      return { decision: approvePlan(e.tool_input) }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) {
      // A stage subagent's turn end is its record only; the main-loop handlers below do not run for it.
      const worker = workers.get(e.agentId)
      if (worker !== undefined) {
        const at = await $.clock.now()
        const agentId = e.agentId
        const listed = await $.agent.list().catch(() => [])
        const listedStatus = listed.find((agent) => agent.id === agentId)?.status
        const status = listedStatus !== undefined && SETTLED_STATUSES.includes(listedStatus) ? listedStatus : 'idle'
        await queueAgent(agentId, () => updateAgent($, worker.dir, agentId, (record) =>
          recordTurnEnd(record, { reason: e.reason, status, at })))
      }
      return done
    }
    mainBusy = false
    mainIdleSince = await $.clock.now()
    if (execute.pendingIssues !== null) {
      const issues = execute.pendingIssues
      execute.pendingIssues = null
      if (!e.isAborted && e.reason !== 'error') {
        // A headless run's goal is set before its turn ends; a TUI goal is set in the background.
        const goal = setExecuteGoal($, issues)
        if (headlessRun) await goal
        else void goal
      }
    }
    if (writeSpec.pending) {
      writeSpec.exitPending = false
      void submitContinuation($)
    } else if (writeSpec.exitPending && !e.isAborted && e.reason !== 'error') {
      // The Finished reply ended without ExitPlanMode: ask once, then warn.
      if (exitNudged) {
        Object.assign(writeSpec, { active: false, exitPending: false })
        $.ui.toast(FINISHED_EXIT_NOTICE)
      } else {
        exitNudged = true
        void $.prompt.submit({ text: FINISHED_EXIT_PROMPT })
      }
    }
    return done
  })
}
