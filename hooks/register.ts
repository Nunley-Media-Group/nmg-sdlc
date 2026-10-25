import type { EngineInterface, Register, TurnStepInput } from 'claude-code'
import {
  DIRECT_COMMANDS,
  INTERACTIVE_COMMANDS,
  SDLC_MODELS,
  WRITE_SPEC_FINISHED_LABELS,
  executeModelRefusal,
  interactiveHeadlessMessage,
  materializePluginRootCommand,
  materializePluginRootPath,
  recommendedAnswers,
  writeSpecFinishedSelection,
  writeSpecMergeIssue,
  writeSpecMergeResult,
  writeSpecPublication,
} from '../src/host-events.mjs'

type Published = { issue: number; slug: string }

type Rendered = { ok: true; text: string } | { ok: false; message: string }

type Engine = EngineInterface

const ARGUMENT_HINTS: Record<string, string> = {
  'sdlc-draft-issue': '[need]',
  'sdlc-write-spec': '[#N]',
  'sdlc-onboard-project': '',
  'sdlc-upgrade-project': '',
  'sdlc-steering': '[request]',
  'sdlc-run-retro': '',
  'sdlc-execute': '[--retain-worker] [--check-in-seconds N] [#N ...]',
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
const recordedPublications = new Set<string>()
let interactive = true
let autopilot = false
// The one prompt that asks the model to leave plan mode after Finished was sent.
let exitNudged = false
// The running command's model: main-loop requests name it until the person
// submits their own prompt or the session model changes. The session model
// itself is never set.
let modelOverride: { command: string; model: string; sessionModel: string } | null = null


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
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

// Enter native plan mode with `text` as its first turn: a bare `/plan` enables
// plan mode (and only shows the plan when plan mode is already on), then the
// text is submitted as the person's own prompt.
async function submitInPlanMode($: Engine, text: string): Promise<boolean> {
  try {
    await $.command.run({ command: 'plan', args: '' })
  } catch (error) {
    $.ui.log(`NMG SDLC: /plan failed: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })
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
// any other step, or a host failure, goes out as the engine resolved it.
async function overrideStep($: Engine, e: TurnStepInput): Promise<TurnStepInput> {
  if (e.agentId !== undefined || modelOverride === null) return e
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    interactive = e.isInteractive
    // Plugin scripts and their children resolve the installed plugin from it.
    await $.env.set('NMG_SDLC_PLUGIN_ROOT', $.plugin.root)
    for (const [name, , description] of INTERACTIVE_COMMANDS) {
      await $.command.register({ name, description, argumentHint: ARGUMENT_HINTS[name] || undefined })
    }
    autopilot = (await $.env.get('NMG_SDLC_AUTOPILOT')) === '1'
    if ((await $.env.get('HERDR_ENV')) === '1') $.ui.toast('NMG SDLC ready in Herdr')
    return started
  })

  for (const [name] of INTERACTIVE_COMMANDS) {
    on('command.run', { command: name }, async ($, e) => {
      if (!interactive || (await $.session.surfaces()).length === 0) {
        return { text: interactiveHeadlessMessage(name).trimEnd(), exitCode: 2 }
      }
      if (name === 'sdlc-execute') {
        const refusal = await executeRefusal($)
        if (refusal !== null) return { text: refusal, exitCode: 1 }
      }
      const rendered = await render($, ['--consumer', name, '--args', e.args])
      if (!rendered.ok) return { text: `NMG SDLC: /${name} could not render its workflow: ${rendered.message}` }
      startInteractiveCommand(name)
      await startModelOverride($, name)
      // Neither `/plan` nor the workflow prompt can start from inside this
      // command's own dispatch; a timer starts them once it has settled.
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
    })
  }

  // The person's own prompt or slash command ends the running command's model
  // override; a command it runs starts a fresh one from its `command.run`.
  // Plugin-submitted turns (the workflow, Continue, the Finished nudge) keep it.
  on('prompt.submit', ($, e, next) => {
    if ((e.origin.kind === 'composer' || e.origin.kind === 'bridge') && e.isMeta !== true) modelOverride = null
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    return yield* next(await overrideStep($, e))
  })

  // Workflows name plugin scripts as `<plugin-root>/scripts/<name>.mjs`; the
  // installed plugin's absolute path replaces the placeholder before the shell
  // sees it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = materializePluginRootCommand(e.command, $.plugin.root)
    const ran = await next(command === e.command ? e : { ...e, command })
    if (ran.deny !== undefined) return ran
    const stdout = ran.isError === true
      ? (ran.text ?? '')
      : (ran.result?.stdout ?? ran.text ?? '')
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
    if (e.tool_name === 'ExitPlanMode' && autopilot) return { decision: approvePlan(e.tool_input) }
    if (autopilot && e.tool_name === 'AskUserQuestion') {
      const input = (e.tool_input ?? {}) as { questions?: unknown }
      return {
        decision: {
          behavior: 'allow',
          // During write-spec, autopilot ends after the selected issue: a
          // Finished option wins over the recommended next issue.
          updatedInput: {
            ...input,
            answers: recommendedAnswers(input.questions, writeSpec.active ? { prefer: WRITE_SPEC_FINISHED_LABELS } : {}),
          },
        },
      }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
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
