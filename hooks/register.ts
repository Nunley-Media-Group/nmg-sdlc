import type { EngineInterface, Register } from 'claude-code'
import {
  DIRECT_COMMANDS,
  INTERACTIVE_COMMANDS,
  WRITE_SPEC_FINISHED_LABELS,
  interactiveHeadlessMessage,
  materializePluginRootCommand,
  materializePluginRootPath,
  recommendedAnswers,
  writeSpecFinishedSelection,
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
  'sdlc-execute': '[--retain-worker] [#N ...]',
}

const PENDING_CONTINUATION_NOTICE =
  'NMG SDLC: write-spec Continue is pending; it is submitted in plan mode after the next turn ends with an empty prompt.'
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
    Object.assign(writeSpec, { published: [], pending: false, active: true, exitPending: false })
    exitNudged = false
  } else {
    Object.assign(writeSpec, { active: false, exitPending: false })
  }
}

// A merged write-spec publication is recorded from its Bash result; the
// Continue prompt is submitted in plan mode once the turn ends, so
// post-merge remediation finishes first.
async function submitContinuation($: Engine): Promise<void> {
  const box = await $.prompt.read()
  if (!interactive || box.text !== '') {
    $.ui.toast(PENDING_CONTINUATION_NOTICE)
    return
  }
  writeSpec.pending = false
  const rendered = await render($, [
    '--consumer', 'sdlc-write-spec',
    '--published', JSON.stringify(writeSpec.published),
  ])
  if (!rendered.ok || !(await submitInPlanMode($, rendered.text))) {
    writeSpec.pending = true
    $.ui.toast(PENDING_CONTINUATION_NOTICE)
    return
  }
  writeSpec.active = true
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
      const rendered = await render($, ['--consumer', name, '--args', e.args])
      if (!rendered.ok) return { text: `NMG SDLC: /${name} could not render its workflow: ${rendered.message}` }
      startInteractiveCommand(name)
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
    const publication = writeSpecPublication(
      { toolUseId: e.tool_use_id, command, stdout },
      $.plugin.root,
    )
    if (!publication || recordedPublications.has(e.tool_use_id)) return ran
    recordedPublications.add(e.tool_use_id)
    if (writeSpec.published.some(({ issue }) => issue === publication.issue)) return ran
    writeSpec.published.push({ issue: publication.issue, slug: publication.slug })
    writeSpec.pending = true
    return ran
  })

  on('tool.call', { tool: 'Read' }, ($, e, next) => {
    const file_path = materializePluginRootPath(e.file_path, $.plugin.root)
    return next(file_path === e.file_path ? e : { ...e, file_path })
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

  // After a write-spec Finished selection the workflow's last act is
  // ExitPlanMode; that one call is approved here, so plan mode ends with no
  // dialog and the session returns to the mode it had before plan mode.
  on('classic.PermissionRequest', async ($, e, next) => {
    if (e.tool_name === 'ExitPlanMode' && writeSpec.active && writeSpec.exitPending) {
      Object.assign(writeSpec, { active: false, exitPending: false })
      return { decision: { behavior: 'allow' } }
    }
    if (e.tool_name === 'ExitPlanMode' && autopilot) return { decision: { behavior: 'allow' } }
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
