#!/usr/bin/env node

/** The repository merge queue, from the command line. The queue is `<git-common-dir>/nmg-sdlc/merge-queue.json`,
 * guarded by an exclusive lock; entries whose owner process is dead are dropped. The `/sdlc-execute` controller is
 * the caller that integrates, prepares the version and validates at the head; this command reads and repairs. */
import { isCliEntry } from './plugin-controller-path.mjs';
import { enterMergeQueue, leaveMergeQueue, listMergeQueue } from './sdlc-shared-state.mjs';

export { enterMergeQueue, leaveMergeQueue, listMergeQueue };

const USAGE = 'Usage: node scripts/sdlc-merge-queue.mjs list | position --issue N | enqueue --issue N --branch B [--worktree DIR] | dequeue --issue N';

function runCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const name = { '--issue': 'issue', '--branch': 'branch', '--worktree': 'worktree' }[rest[index]];
    if (!name || rest[index + 1] === undefined || options[name] !== undefined) { process.stderr.write(`${USAGE}\n`); return 2; }
    options[name] = rest[index + 1];
  }
  const issue = /^#?[1-9]\d*$/.test(options.issue ?? '') ? Number(options.issue.replace(/^#/, '')) : null;
  const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  try {
    if (command === 'list' && !rest.length) {
      print({ ok: true, entries: listMergeQueue(cwd) });
    } else if (command === 'position' && issue) {
      const entry = listMergeQueue(cwd).find((item) => item.issue === issue);
      print({ ok: true, issue, queued: Boolean(entry), position: entry?.position ?? null, head: entry?.position === 1 });
    } else if (command === 'enqueue' && issue && options.branch) {
      // The entry is owned by the caller's parent, which is the session that outlives this command.
      print({ ok: true, issue, ...enterMergeQueue(cwd, { issue, branch: options.branch, worktree: options.worktree ?? cwd, pid: process.ppid }) });
    } else if (command === 'dequeue' && issue) {
      print({ ok: true, issue, removed: leaveMergeQueue(cwd, issue) });
    } else {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    return 0;
  } catch (error) {
    print({ ok: false, reasonCode: error.reasonCode ?? 'merge_queue_unreadable', summary: error.message });
    return 1;
  }
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli();
