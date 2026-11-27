/**
 * Jest global setup for the contract tests.
 *
 * The suite starts git tens of thousands of times. On macOS `/usr/bin/git` is the xcrun shim, which looks up the
 * active developer directory on every start and costs about three times the git binary it then runs. When git
 * resolves to that shim, put the directory of the binary it selects first on PATH, so every test and every helper
 * a test starts runs the same git without the lookup. Any other platform or git is left alone.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

const SHIM = '/usr/bin/git';

/** The first `git` on PATH, or null. */
function firstGit(env) {
  for (const dir of String(env.PATH ?? '').split(delimiter)) {
    if (dir && existsSync(join(dir, 'git'))) return join(dir, 'git');
  }
  return null;
}

export default function setup() {
  if (process.platform !== 'darwin' || firstGit(process.env) !== SHIM) return;
  const found = spawnSync('/usr/bin/xcrun', ['-f', 'git'], { encoding: 'utf8' });
  const real = found.status === 0 ? found.stdout.trim() : '';
  if (!real || real === SHIM || !existsSync(real)) return;
  process.env.PATH = `${dirname(real)}${delimiter}${process.env.PATH}`;
}
