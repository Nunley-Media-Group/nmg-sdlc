#!/usr/bin/env node

/** Renders an interactive /sdlc-* workflow prompt for the Claude Code hooks module,
 * which has no Node of its own. Prints the prompt on stdout, or one JSON error line
 * on stderr with exit 2. */
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import {
  isInteractiveCommand,
  renderInteractiveWorkflow,
  renderWriteSpecContinuation,
  withArguments,
} from '../src/sdlc-commands.mjs';
import { packageRoot } from '../src/sdlc-workflows.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';

function usage() {
  return 'Usage: sdlc-render-prompt.mjs --consumer <sdlc-command> --project <dir> [--args <text>] [--published <json>]';
}

function parsePublished(value) {
  const published = JSON.parse(value);
  if (!Array.isArray(published) || published.length === 0 || !published.every((entry) =>
    Number.isSafeInteger(entry?.issue) && entry.issue > 0
    && typeof entry.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug))) {
    throw new Error('published_invalid');
  }
  return published.map(({ issue, slug }) => ({ issue, slug }));
}

export function renderPromptCli(argv, { root = packageRoot } = {}) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        consumer: { type: 'string' },
        project: { type: 'string' },
        args: { type: 'string', default: '' },
        published: { type: 'string' },
      },
      strict: true,
    }));
  } catch {
    return { status: 2, stdout: '', stderr: `${JSON.stringify({ ok: false, reasonCode: 'usage', message: usage() })}\n` };
  }
  const { consumer, project } = values;
  if (!isInteractiveCommand(consumer) || !project) {
    return { status: 2, stdout: '', stderr: `${JSON.stringify({ ok: false, reasonCode: 'usage', message: usage() })}\n` };
  }
  const projectRoot = resolve(project);
  try {
    if (values.published !== undefined) {
      if (consumer !== 'sdlc-write-spec') throw new Error('published_invalid');
      return { status: 0, stdout: renderWriteSpecContinuation(root, projectRoot, parsePublished(values.published)), stderr: '' };
    }
    return { status: 0, stdout: withArguments(renderInteractiveWorkflow(consumer, root, projectRoot), values.args), stderr: '' };
  } catch (error) {
    const reasonCode = /^[a-z_]+$/.test(error?.message ?? '') ? error.message : 'render_failed';
    return { status: 2, stdout: '', stderr: `${JSON.stringify({ ok: false, reasonCode, message: String(error?.message ?? error) })}\n` };
  }
}

if (isCliEntry(import.meta.url)) {
  const result = renderPromptCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.status;
}
