# Project-Board Status Update to "In Progress"

**Consumed by**: `start-issue` Step 4, after the feature branch has been created.

GitHub Projects (v2) expose a Status field per issue via GraphQL. Moving the issue to "In Progress" is a nice-to-have observable signal — it tells stakeholders looking at the project board that work has actually started — but it is not a precondition for any downstream skill, so the whole flow is best-effort and silently skips when the issue is not in a project or the expected status option is missing.

## Discover project, field, and option IDs

Ask GitHub for every project that contains the issue, along with the current value of the `Status` field and the full set of status options:

```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        projectItems(first: 10) {
          nodes {
            id
            project { id title }
            fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2SingleSelectField {
                    id
                    options { id name }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
' -f owner=OWNER -f repo=REPO -F number=N
```

Replace `OWNER`, `REPO`, and `N` with the actual values (derive owner/repo via `gh repo view --json owner,name`).

From the response, extract four values for the update mutation below:

| Value | Source |
|-------|--------|
| `projectId` | `projectItems.nodes[].project.id` |
| `itemId` | `projectItems.nodes[].id` |
| `fieldId` | `projectItems.nodes[].fieldValueByName.field.id` |
| `optionId` | `projectItems.nodes[].fieldValueByName.field.options[]` where `name` matches `"In Progress"` (case-insensitive) |

If the issue is not in any project, or no option matches "In Progress" (the project uses a different column naming scheme), skip the update silently — the branch creation in Step 4 is the success-critical part of the skill.

## Update the status

With all four IDs resolved, apply the mutation:

```bash
gh api graphql -f query='
  mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: { singleSelectOptionId: $optionId }
    }) {
      projectV2Item { id }
    }
  }
' -f projectId=PROJECT_ID -f itemId=ITEM_ID -f fieldId=FIELD_ID -f optionId=OPTION_ID
```

Mutation failures (permission errors, transient API errors) are logged but do not halt the skill — the branch is already created and linked, so the Step 4 postcondition holds even without the status update.
