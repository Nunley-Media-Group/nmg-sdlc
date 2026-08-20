---
name: start-issue
description: "Select an executable GitHub issue, create a linked feature branch, and set it to In Progress. Requires explicit #N. Re-proves Depends on parents. No picker, no milestone gate, no ready-to-start gate, leftover spike or epic labels are ordinary. Use when /skill:execute needs to begin delivery for #N."
---

# Start Issue

Automated start for issue #N. No user questions, no pickers, no gates. Missing preconditions produce failed handoff with intervention.

## Workflow

### Step 1: Require and Parse Issue Number

The invocation must supply an explicit issue number argument in the form `#N` or `N`.

- If no argument or argument does not match `^#?([1-9]\d*)$`, write failed handoff immediately:
  - reasonCode: `no_issue_number`
  - summary: "start-issue requires explicit #N argument"
  - step: "start"
  - intervention: true
- Extract N as integer.

Use `bash`:
```bash
echo "$ARGUMENTS" | cat
```

### Step 2: Fetch Issue and Derive Slug

Run:
```bash
gh issue view N --json number,title,body,labels,state --jq '.'
```

If gh fails or state is not readable, write failed handoff:
- reasonCode: `issue_unreadable`
- intervention: true
- step: "start"

Parse JSON for number, title, labels array, body, state.

Compute slug from title (reuse feature-naming rules):
```bash
node --input-type=module -e '
  const title = process.argv[1];
  const slug = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  console.log(slug);
' "TITLE"
```

expectedBranch = `${N}-${slug}`

### Step 3: Re-prove Depends-on Parents (reuse parseBodyRelationships)

```bash
node --input-type=module -e '
import { parseBodyRelationships } from "./scripts/epic-relationships.mjs";
import { execSync } from "child_process";
const body = `BODY_HERE`;
const rels = parseBodyRelationships(body);
console.log(JSON.stringify(rels));
' 
```

For each parent in dependsOn:

- Run `gh issue view P --json state`

- If command fails or cannot parse: reasonCode `dependency_unreadable`, failed, intervention true

- If state !== "CLOSED": reasonCode `dependency_blocked`, failed, intervention true

If any parent blocks, write handoff and stop. Do not guess.

### Step 4: Dirty Tree Check

```bash
current=$(git branch --show-current)
dirty=$(git status --porcelain)
```

If dirty (non-empty after trim) AND current !== expectedBranch:
  write failed handoff reasonCode: `dirty_tree`, intervention: true, step: "start"

### Step 5: Create/Switch Branch

If current branch !== expectedBranch:
  ```bash
  gh issue develop N --checkout --name ${expectedBranch}
  ```
  Verify afterwards that `git branch --show-current` === expectedBranch. If not, fail with `branch_checkout_failed`

### Step 6: Best-Effort Project Status to In Progress

Do not fail the handoff on errors here.

Use node to attempt discovery + mutation (condensed from project rules, wrapped):

```bash
node --input-type=module -e '
import { execSync } from "child_process";
try {
  const repo = JSON.parse(execSync("gh repo view --json owner,name", {encoding:"utf8"}));
  const owner = repo.owner.login; const name = repo.name;
  const q = `query($owner:String!,$repo:String!,$number:Int!){ repository(owner:$owner,name:$repo){ issue(number:$number){ projectItems(first:10){ nodes{ id project{id title} fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { id options{id name} } } } } } } } } }`;
  const data = JSON.parse(execSync(`gh api graphql -f query='\''${q}'\'' -f owner=${owner} -f repo=${name} -F number=${N}`, {encoding:"utf8"}));
  const items = data.data?.repository?.issue?.projectItems?.nodes || [];
  for (const item of items) {
    const proj = item.project; const fv = item.fieldValueByName;
    if (!fv || !fv.field) continue;
    const opt = (fv.field.options || []).find(o => o.name.toLowerCase() === "in progress");
    if (!opt) continue;
    const mut = `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){ updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}){ projectV2Item{id} } }`;
    execSync(`gh api graphql -f query='\''${mut}'\'' -f projectId=${proj.id} -f itemId=${item.id} -f fieldId=${fv.field.id} -f optionId=${opt.id}`, {encoding:"utf8"});
    console.log("best-effort project status updated for", proj.title);
    break;
  }
} catch (e) { console.log("best-effort project status skipped:", e.message); }
' 
```

Failure here is ignored.

### Step 7: Next Step

next = "implement"

A leftover `spike` label does not skip implement/verify.

### Step 8: Write Handoff and Report

Always write `.omp/sdlc/handoffs/${N}-start.json`

```bash
node --input-type=module -e '
import fs from "fs";
import path from "path";
const dir = ".omp/sdlc/handoffs";
fs.mkdirSync(dir, { recursive: true });
const handoff = {
  schemaVersion: 1,
  issue: N,
  step: "start",
  status: "passed",
  intervention: false,
  summary: "Branch ready for #N",
  artifacts: [],
  next: NEXT,
  reasonCode: null
};
fs.writeFileSync(path.join(dir, `${N}-start.json`), JSON.stringify(handoff, null, 2) + "\n");
console.log("NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/" + N + "-start.json");
' 
```

Output summary:

```
--- Issue Ready ---
Issue: #N — TITLE
Branch: EXPECTED_BRANCH
Labels: ...
Status: In Progress (best-effort project)

Next step: Run /skill:execute or continue with /plan /skill:write-spec #N if spec missing.
```

Handoff is the contract. Print the NMG line exactly.

## Integration with SDLC Workflow

```
/plan /skill:draft-issue [need] → /plan /skill:write-spec #N → /skill:execute [#N …] → /skill:status
                          ▲ You are here (automated)
```
