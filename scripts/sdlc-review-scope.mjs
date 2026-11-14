#!/usr/bin/env node

/** The scope of a verify review that follows a repair: `scoped` to the prior findings and the repair diff when the
 * repair stayed inside the files those findings named, otherwise `full`, naming the paths outside them. Read-only. */
import { isCliEntry } from './plugin-controller-path.mjs';
import { reviewScope } from './sdlc-review.mjs';

export { reviewScope };

const USAGE = 'Usage: node scripts/sdlc-review-scope.mjs --issue N';

function runCli(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== '--issue' || !/^#?[1-9]\d*$/.test(argv[1])) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  process.stdout.write(`${JSON.stringify(reviewScope({ issue: Number(argv[1].replace(/^#/, '')) }), null, 2)}\n`);
  return 0;
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli();
