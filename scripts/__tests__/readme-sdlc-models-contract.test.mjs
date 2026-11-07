import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

// Returns the text from a heading up to the next heading of the same or higher level.
function section(heading) {
  const start = readme.indexOf(heading);
  if (start < 0) return '';
  const rest = readme.slice(start + heading.length);
  const next = rest.search(/\n#{1,3} /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('README documents per-project stage models (FR8)', () => {
  it('describes the file, the default verify effort, provider/model ids, and the default effort', () => {
    const models = section('### Models');
    expect(models).toContain('steering/sdlc-models.json');
    expect(models).toContain('verify.effort` (default `high`)');
    const perProject = section('### Per-project stage models');
    expect(perProject).toContain('"verify": { "model": "opus", "effort": "high" }');
    expect(perProject).toContain('provider/model');
    expect(perProject).toContain('opencode-go/kimi-k3.1-pro');
    expect(perProject).toContain('Effort `default` passes no `--effort` flag');
    expect(perProject).toContain('The diagnostic names `steering/sdlc-models.json`');
    expect(perProject).toContain('exit status 2');
    expect(perProject).toContain('one warning per invocation');
    expect(perProject).toContain('never changes the models of slash commands');
  });

  it('lists the file in the onboarding/upgrade managed assets and the steering configuration table', () => {
    const manage = readme.slice(readme.indexOf('Onboarding/upgrade manage:'));
    expect(manage.slice(0, manage.indexOf('\n\nDo not replace'))).toContain('`steering/sdlc-models.json`');
    const config = section('## Configure steering and verification');
    expect(config).toMatch(/\| `steering\/sdlc-models\.json` \|/);
  });

  it('troubleshoots the invalid-file diagnostic and the missing-file warning with /sdlc-upgrade-project', () => {
    const troubleshooting = section('## Status and troubleshooting');
    expect(troubleshooting).toContain('`steering/sdlc-models.json:` diagnostic');
    expect(troubleshooting).toMatch(/Warning: steering\/sdlc-models\.json is missing[\s\S]*?\/sdlc-upgrade-project/);
  });

  it('no longer names SDLC_MODELS or SDLC_EFFORTS as the execute stage maps', () => {
    expect(readme).not.toMatch(/SDLC_(MODELS|EFFORTS)/);
  });
});
