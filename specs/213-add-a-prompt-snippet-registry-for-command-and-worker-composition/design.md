# Design: Prompt-snippet registry for command and worker composition

**Issue**: #213
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/193-reduce-injected-sdlc-workflow-tokens-while-keeping-file-command-surfaces/

---

## Overview

Add `src/sdlc-prompt-snippets.mjs`. No equivalent module exists: composition today is `workflowBody` plus wrappers in `rewriteInteractiveInput`, `renderAutomatedCommandMarkdown`, and `workerPrompt`.

The registry registers named fragments, sorts them, substitutes registry-supplied `{{name}}` scalars, joins them, and returns `{ text, provenance }`. Built-in fragments are the plugin workflow files already inlined today, `workflows/execute/references/selection.md` for automated execute, and one builtin worker header that reproduces the current seven-line handoff wrapper.

`workflowBody(name, root)` in `src/sdlc-workflows.mjs` stays a file reader (`workflowPath` + `stripWorkflowFrontmatter`). File-backed catalog entries load WORKFLOW.md bodies through it. Composition callsites must not concatenate `workflowBody` themselves.

Do not edit `workflows/**` or regenerate `commands/*.md` unless a renderer drift test fails. Observable command Markdown and worker-prompt bytes must match pre-change content. Do not add a public command.

## Module

Create `src/sdlc-prompt-snippets.mjs` (Node ESM, `node:` built-ins only). Do not import `src/sdlc-commands.mjs` or `scripts/sdlc-execute.mjs` (avoids cycles). Duplicate the consumer id lists as frozen arrays and add a test that they equal `INTERACTIVE_COMMANDS` + `AUTOMATED_COMMANDS` names and `VALID_STEPS` mapped to `worker:${step}`.

```js
export const ALLOWED_SLOTS = Object.freeze(['header', 'body', 'extra']);

export const COMMAND_CONSUMERS = Object.freeze([
  'sdlc-draft-issue',
  'sdlc-write-spec',
  'sdlc-onboard-project',
  'sdlc-upgrade-project',
  'sdlc-run-retro',
  'sdlc-execute',
  'sdlc-status',
  'sdlc-verify-code',
  'sdlc-open-pr',
]);

export const WORKER_CONSUMERS = Object.freeze([
  'worker:start',
  'worker:implement',
  'worker:review1',
  'worker:fix1',
  'worker:review2',
  'worker:fix2',
  'worker:verify',
  'worker:deliver',
]);

export const ALLOWED_CONSUMERS = Object.freeze([
  ...COMMAND_CONSUMERS,
  ...WORKER_CONSUMERS,
]);

export function createPromptSnippetRegistry() { /* { byId: Map } */ }
export function registerPromptSnippet(registry, fragment, packageRoot) { /* mutates registry; returns registry */ }
export function renderPrompt(registry, { consumer, vars, packageRoot }) { /* { text, provenance } */ }
export function writePromptProvenance(projectRoot, provenance) { /* writes sidecar */ }
export function pluginPromptFragments() { /* frozen catalog array */ }
export function defaultPromptRegistry(packageRoot) { /* create + register every plugin fragment */ }
```

`packageRoot` defaults to the existing `packageRoot` export from `src/sdlc-workflows.mjs`.

## Fragment record

Allowed keys (exactly; extras fail `unknown_key`):

| Key | Rule |
|-----|------|
| `id` | non-empty string |
| `provider` | exactly `plugin` or fail `disallowed_provider` |
| `source` | non-empty string |
| `consumers` | non-empty array of `ALLOWED_CONSUMERS` members; any other id fails `disallowed_consumer` |
| `slot` | member of `ALLOWED_SLOTS` or fail `disallowed_slot` |
| `order` | finite number |
| `byteBound` | integer `> 0` |
| `body` | optional string; required when `source` starts with `builtin:` |

`registerPromptSnippet`:

1. Reject unknown keys / missing required keys / empty `id` / empty `consumers` / non-finite `order` / non-positive `byteBound` with `unknown_key`.
2. If `registry.byId.has(id)` throw `duplicate_fragment_id` (no last-wins).
3. Resolve body:
   - `source` starts with `builtin:` → use `fragment.body`; missing/empty after `String` trim-of-nothing (empty string) fails `empty_body`.
   - else treat `source` as a path relative to `packageRoot`. Resolve with `node:path` `resolve(packageRoot, source)`. Use `lstatSync` / `realpathSync` only if needed to reject symlinks that escape; do not follow a symlink whose resolved target is outside the allowed root. Allowed root is `resolve(packageRoot, 'workflows')`. The resolved path must equal that root or be prefixed by that root + `sep`. Otherwise `path_outside_root`. Missing file → `missing_source`.
   - If the basename is `WORKFLOW.md`, body = `workflowBody` equivalent: `stripWorkflowFrontmatter(readFileSync(utf8))`. Any other file is raw utf8.
4. If body length is 0, `empty_body`.
5. If `renderedPromptBytes(body) > byteBound`, `byte_bound_exceeded`.
6. Store the validated record including loaded body.

Throw `new Error(reasonCode)` with the exact code string (plugin `src/` style). Do not return a partial registry on failure: throw before `byId.set`.

## Render

`renderPrompt(registry, { consumer, vars = {} })`:

1. If `consumer` is not in `ALLOWED_CONSUMERS`, throw `disallowed_consumer`.
2. Select fragments whose `consumers` include `consumer`. If none, throw `empty_body`.
3. Sort by `order` ascending, then `id` with `localeCompare('en')`.
4. For each fragment, substitute `{{name}}` where `name` matches `/^[A-Za-z][A-Za-z0-9]*$/`. Replacement values come only from `vars` (stringified with `String`). After substitution, if the text still matches `/\{\{[A-Za-z][A-Za-z0-9]*\}\}/`, throw `unknown_placeholder`. Do not expand `$NAME`, `${NAME}`, loops, includes, or expressions. `$ARGUMENTS` in workflow text is literal.
5. If post-substitution `renderedPromptBytes(text) > byteBound`, throw `byte_bound_exceeded`.
6. Join fragment texts with a single `\n`.
7. Return `{ text, provenance }` and do not write files.

Provenance object:

```json
{
  "consumer": "worker:start",
  "renderedAt": "2026-08-23T00:00:00.000Z",
  "byteCount": 0,
  "fragments": [
    {
      "id": "plugin.worker.header",
      "provider": "plugin",
      "source": "builtin:plugin.worker.header",
      "hash": "sha256:…",
      "byteCount": 0,
      "slot": "header",
      "order": 0
    }
  ]
}
```

`renderedAt` is `new Date().toISOString()`. `byteCount` at the top is UTF-8 bytes of the joined `text`. Each fragment `hash` is `sha256:` + `createHash('sha256').update(substitutedText, 'utf8').digest('hex')` (same prefix style as `scripts/epic-lifecycle-repair.mjs` `repairEvidenceDigest`). Fragment `byteCount` is UTF-8 bytes of the substituted text. `source` is the catalog source string, not an absolute path.

`writePromptProvenance(projectRoot, provenance)` writes

`join(projectRoot, '.omp/sdlc/prompt-provenance', `${provenance.consumer.replaceAll(':', '-')}.json`)`

with `mkdirSync(..., { recursive: true })` and `JSON.stringify(provenance, null, 2) + '\n'`. Write failure throws `provenance_write_failed`. `.omp/sdlc/` is already gitignored.

## Built-in catalog

`pluginPromptFragments()` returns these records. `byteBound` for each file-backed fragment is the current loaded-body UTF-8 size plus 256, hardcoded after one measurement during implementation (same rule as `rendered-prompt-bytes.test.mjs`). Header `byteBound` is `512`.

| id | source | consumers | slot | order |
|----|--------|-----------|------|-------|
| `plugin.workflow.draft-issue` | `workflows/draft-issue/WORKFLOW.md` | `sdlc-draft-issue` | body | 100 |
| `plugin.workflow.write-spec` | `workflows/write-spec/WORKFLOW.md` | `sdlc-write-spec` | body | 100 |
| `plugin.workflow.onboard-project` | `workflows/onboard-project/WORKFLOW.md` | `sdlc-onboard-project` | body | 100 |
| `plugin.workflow.upgrade-project` | `workflows/upgrade-project/WORKFLOW.md` | `sdlc-upgrade-project` | body | 100 |
| `plugin.workflow.run-retro` | `workflows/run-retro/WORKFLOW.md` | `sdlc-run-retro` | body | 100 |
| `plugin.workflow.execute` | `workflows/execute/WORKFLOW.md` | `sdlc-execute` | body | 100 |
| `plugin.workflow.status` | `workflows/status/WORKFLOW.md` | `sdlc-status` | body | 100 |
| `plugin.workflow.verify-code` | `workflows/verify-code/WORKFLOW.md` | `sdlc-verify-code`, `worker:verify` | body | 100 |
| `plugin.workflow.open-pr` | `workflows/open-pr/WORKFLOW.md` | `sdlc-open-pr`, `worker:deliver` | body | 100 |
| `plugin.workflow.start-issue` | `workflows/start-issue/WORKFLOW.md` | `worker:start` | body | 100 |
| `plugin.workflow.write-code` | `workflows/write-code/WORKFLOW.md` | `worker:implement` | body | 100 |
| `plugin.workflow.review-main` | `workflows/review-main/WORKFLOW.md` | `worker:review1`, `worker:review2` | body | 100 |
| `plugin.workflow.apply-review` | `workflows/apply-review/WORKFLOW.md` | `worker:fix1`, `worker:fix2` | body | 100 |
| `plugin.workflow.address-pr-comments` | `workflows/address-pr-comments/WORKFLOW.md` | `worker:deliver` | extra | 200 |
| `plugin.execute.selection` | `workflows/execute/references/selection.md` | `sdlc-execute` | extra | 200 |
| `plugin.worker.header` | `builtin:plugin.worker.header` | all `WORKER_CONSUMERS` | header | 0 |

Header `body` is exactly:

```js
[
  'You are the nmg-sdlc {{step}} worker for issue #{{issue}}.',
  'Execute the following inlined workflow for #{{issue}} with no user questions.',
  'Write the handoff file then stop.',
  '',
  '$ARGUMENTS: #{{issue}}',
  'Handoff path: {{handoffPath}}',
  'On success print exactly: NMG_SDLC_HANDOFF: {{handoffPath}}',
  '',
].join('\n')
```

`defaultPromptRegistry(packageRoot)` registers every catalog record. It must not read `steering/`, project `snippets/`, or any path outside `packageRoot/workflows` plus builtin bodies.

## Callsite wiring

### `src/sdlc-commands.mjs`

`rewriteInteractiveInput` after `parseInteractiveSlash`:

```js
const { text } = renderPrompt(defaultPromptRegistry(root ?? packageRoot), {
  consumer: parsed.command,
  vars: {},
});
const body = withArguments(text, parsed.args);
```

Then the same plan-mode branch: `sessionMode === 'plan'` → `{ text: body }`, else `{ text: \`/plan\n\n${body}\` }`.

Add optional `provenanceRoot`. When it is a non-empty string, after a successful compose call `writePromptProvenance(provenanceRoot, provenance)` (`provenance` from the same `renderPrompt`). When omitted, write to `process.cwd()`. Existing `scripts/__tests__/sdlc-commands.test.mjs` cases must pass `provenanceRoot` as a `fs.mkdtempSync` directory so they do not litter the repo and so AC2 can assert the sidecar.

`renderAutomatedCommandMarkdown(name, skill, description, root = packageRoot)`:

```js
const { text } = renderPrompt(defaultPromptRegistry(root), { consumer: name, vars: {} });
const body = text.replace(/\s*$/, '\n');
return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`;
```

Delete the `skill === 'execute'` `readFileSync(selection.md)` branch. Selection is `plugin.execute.selection`. Do not persist provenance here (packaging / `commands/*.md` sync). Output must stay byte-identical to today’s four automated command files.

Keep exporting `workflowBody` and `withArguments`.

### `src/extension.ts`

Replace the `registerCommand` handler body send line so it does not call `workflowBody` / `withArguments` itself. Use `rewriteInteractiveInput`:

```js
const rewritten = rewriteInteractiveInput(`/${name}${args ? ` ${args}` : ''}`, {
  source: 'interactive',
  headless: false,
  sessionMode: 'none',
});
if (!rewritten?.text) return;
pi.sendUserMessage(rewritten.text);
```

Update `scripts/__tests__/extension-commands.test.mjs` so it no longer requires the source substring `sendUserMessage(\`/plan\\n\\n${withArguments(workflowBody(skill), args)}\`)`. Assert instead that the handler calls `rewriteInteractiveInput` (or that `workflowBody(skill)` is absent from the send path) and that `/plan` + `rewriteInteractiveInput` remain. Keep: no `registerCommand` loop over `AUTOMATED_COMMANDS`; no `commands/sdlc-write-spec.md`; file commands stay byte-identical to `renderAutomatedCommandMarkdown`.

Drop unused `workflowBody` / `withArguments` imports from `extension.ts` if they become unused.

### `scripts/sdlc-execute.mjs` `workerPrompt`

```js
export function workerPrompt({ step, issue, skill, cwd } = {}) {
  if (!step || !VALID_STEPS.includes(step)) throw new Error('invalid step for workerPrompt');
  if (!Number.isInteger(issue) || issue <= 0) throw new Error('invalid issue for workerPrompt');
  const skillName = skill || STEP_SKILL[step];
  if (!skillName) throw new Error('no skill for step');
  const { text, provenance } = renderPrompt(defaultPromptRegistry(), {
    consumer: `worker:${step}`,
    vars: {
      issue: String(issue),
      step,
      handoffPath: `.omp/sdlc/handoffs/${issue}-${step}.json`,
    },
  });
  if (cwd) writePromptProvenance(cwd, provenance);
  return text;
}
```

Do not read `STEP_EXTRA_WORKFLOWS` inside `workerPrompt`. Leave the constant defined as `{ deliver: ['address-pr-comments'] }`. If `skill` is passed, it must equal `STEP_SKILL[step]` or throw `no skill for step`; do not load an arbitrary workflow through `skill` (no caller passes it today).

Pass `cwd` at every production `workerPrompt` callsite:

- `runExecute` `herdrApi.agentPrompt` (~978): `workerPrompt({ step, issue, cwd })` where `cwd` is the execute project root already used by `runExecute`.
- `hasPastedWorkerPrompt` compare (~815): the same `{ step, issue, cwd }` so the compared text equals the sent text.
- `worker-prompt` CLI (~1162): `workerPrompt({ step, issue, cwd: process.cwd() })`.

Unit tests that only check prompt text may omit `cwd`. Returned text must equal today’s `workerPrompt` for issue `42` on every `VALID_STEPS` member. Keep assertions: implement does not contain `# Simplify`; review1/2 contain `# Review Main`; fix1/2 contain `# Apply Review`; deliver contains `# Address PR Comments`.

## Errors

| reasonCode | When |
|------------|------|
| `duplicate_fragment_id` | register same `id` twice |
| `missing_source` | file source does not exist |
| `unknown_placeholder` | leftover `{{name}}` after substitution |
| `path_outside_root` | resolved file not under `packageRoot/workflows` |
| `disallowed_consumer` | fragment or render consumer not allowed |
| `disallowed_slot` | slot not `header`/`body`/`extra` |
| `disallowed_provider` | `provider` !== `plugin` |
| `unknown_key` | extra or missing fragment field |
| `empty_body` | empty loaded/builtin body, or no fragments for consumer |
| `byte_bound_exceeded` | loaded or substituted text exceeds `byteBound` |
| `provenance_write_failed` | sidecar write failed |

Registration/render throws before producing a successful `{ text }` or mutating `byId` for the failing record. Callers must not treat a thrown render as a usable prompt.

## Testing

Add `scripts/__tests__/sdlc-prompt-snippets.test.mjs`.

Cover:

- `COMMAND_CONSUMERS` / `WORKER_CONSUMERS` match `sdlc-commands` tables and execute `VALID_STEPS`
- `defaultPromptRegistry` registers exactly the catalog ids; none have a source under a project directory
- `renderPrompt` for `sdlc-write-spec` equals `workflowBody('write-spec')`
- `renderAutomatedCommandMarkdown` still equals each `commands/sdlc-*.md`
- `workerPrompt({ step, issue: 42 })` equals the pre-registry concatenation (assert via current heading/wrapper lines and `renderedPromptBytes` ceilings)
- two test-only fragments same consumer+slot sort by `order` then `id`; provenance lists both ids, providers, sources, `sha256:` hashes, byte counts
- each named error in the table (duplicate id, missing file, `{{unknown}}`, path `../package.json` or absolute `/etc/passwd`, consumer `worker:nope`, slot `footer`, provider `project`, extra key `extra`, empty body, `byteBound: 1` with a larger body)
- `writePromptProvenance` creates `.omp/sdlc/prompt-provenance/worker-start.json` under a temp root
- registry does not read or insert `steering/product.md` even if that file exists in a temp package root

Keep `scripts/__tests__/rendered-prompt-bytes.test.mjs` ceilings unchanged. Automated ceilings still measure `workflowBody(skill)` (adapter unchanged). Worker ceilings still measure `workerPrompt({ step, issue: 42 })`. After wiring, a production `grep` of `workflowBody(` under `src/` and `scripts/` excluding `src/sdlc-workflows.mjs`, `src/sdlc-prompt-snippets.mjs`, and `scripts/__tests__/` must be empty. Implementation is not done until Verification’s full Jest suite and smoke commands exit 0.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #213 | 2026-08-23 | Initial feature spec |
