const REQUIREMENT_PREFIX = /^\s*-\s*Requires deliverable from\b/i;
const REQUIREMENT_PATTERN = /^\s*-\s*Requires deliverable from\s+#([1-9]\d*):\s*(\S(?:.*\S)?)\s*$/i;
const CROSS_REPOSITORY_REQUIREMENT_PATTERN = /^\s*-\s*Requires deliverable from\s+(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#[1-9]\d*|https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*):\s*\S(?:.*\S)?\s*$/i;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_REQUIREMENTS = 50;
const MAX_DESCRIPTION_LENGTH = 512;

function positiveIssueNumber(value) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (typeof normalized === 'number') {
    return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
  }
  if (typeof normalized !== 'string' || !/^[1-9]\d*$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function connection(value) {
  if (Array.isArray(value)) {
    return { nodes: value, pageInfo: { hasNextPage: false, endCursor: null } };
  }
  if (
    !value
    || !Array.isArray(value.nodes)
    || !value.pageInfo
    || typeof value.pageInfo.hasNextPage !== 'boolean'
  ) return null;
  return {
    nodes: value.nodes,
    pageInfo: value.pageInfo,
  };
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function boundedDescription(value) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length <= MAX_DESCRIPTION_LENGTH ? normalized : null;
}

export function parseDeliverableRequirements(body) {
  const text = typeof body === 'string' ? body : '';
  const gaps = [];
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return {
      requirements: [],
      gaps: [`issue body exceeds the ${MAX_BODY_BYTES}-byte deliverable-dependency limit`],
    };
  }

  const requirements = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!REQUIREMENT_PREFIX.test(line)) continue;
    if (CROSS_REPOSITORY_REQUIREMENT_PATTERN.test(line)) continue;
    const match = line.match(REQUIREMENT_PATTERN);
    if (!match) {
      gaps.push(`malformed deliverable requirement: ${line.trim().slice(0, MAX_DESCRIPTION_LENGTH)}`);
      continue;
    }
    const ownerIssue = positiveIssueNumber(match[1]);
    const description = boundedDescription(match[2]);
    if (ownerIssue === null || description === null) {
      gaps.push(`invalid deliverable requirement: ${line.trim().slice(0, MAX_DESCRIPTION_LENGTH)}`);
      continue;
    }
    const key = `${ownerIssue}:${description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    requirements.push({ ownerIssue, description });
    if (requirements.length > MAX_REQUIREMENTS) {
      return {
        requirements: requirements.slice(0, MAX_REQUIREMENTS),
        gaps: [...gaps, `deliverable requirements exceed the bounded limit of ${MAX_REQUIREMENTS}`],
      };
    }
  }
  return { requirements, gaps };
}

function executionDependencyNumbers(dependencies) {
  if (!Array.isArray(dependencies)) return [];
  return uniqueSorted(dependencies
    .map((dependency) => positiveIssueNumber(
      typeof dependency === 'object' ? dependency?.issueNumber ?? dependency?.number : dependency,
    ))
    .filter((number) => number !== null));
}

function indexTargets(targets) {
  const indexed = new Map();
  for (const target of Array.isArray(targets) ? targets : []) {
    const number = positiveIssueNumber(target?.number);
    if (number !== null && !indexed.has(number)) indexed.set(number, target);
  }
  return indexed;
}

function classifyTarget(target, defaultBranch) {
  const ownerState = String(target?.state ?? 'UNKNOWN').toUpperCase();
  if (!['OPEN', 'CLOSED'].includes(ownerState)) {
    return {
      status: 'unverifiable',
      ownerState,
      mergedPullRequest: null,
      gap: `issue #${target?.number ?? 'unknown'} state is missing or malformed`,
    };
  }
  const closingPullRequests = connection(target?.closedByPullRequestsReferences);
  if (!closingPullRequests) {
    return {
      status: 'unverifiable',
      ownerState,
      mergedPullRequest: null,
      gap: `issue #${target?.number ?? 'unknown'} closing pull-request evidence is missing or malformed`,
    };
  }
  if (closingPullRequests.pageInfo?.hasNextPage === true) {
    return {
      status: 'unverifiable',
      ownerState,
      mergedPullRequest: null,
      gap: `issue #${target.number} closing pull-request pagination is incomplete`,
    };
  }

  const mergedToDefault = closingPullRequests.nodes
    .filter((pullRequest) => String(pullRequest?.state ?? '').toUpperCase() === 'MERGED')
    .filter((pullRequest) => pullRequest?.baseRefName === defaultBranch)
    .sort((left, right) => Number(left?.number ?? 0) - Number(right?.number ?? 0));
  const malformedMerged = mergedToDefault.find((pullRequest) => (
    positiveIssueNumber(pullRequest?.number) === null
    || typeof pullRequest?.mergedAt !== 'string'
    || !pullRequest.mergedAt
    || typeof pullRequest?.mergeCommit?.oid !== 'string'
    || !/^[0-9a-f]{40}$/i.test(pullRequest.mergeCommit.oid)
  ));
  if (malformedMerged) {
    return {
      status: 'unverifiable',
      ownerState,
      mergedPullRequest: null,
      gap: `issue #${target.number} has malformed merged default-branch pull-request evidence`,
    };
  }

  const mergedPullRequest = mergedToDefault[0] ?? null;
  if (ownerState !== 'CLOSED' || !mergedPullRequest) {
    return { status: 'blocked', ownerState, mergedPullRequest: null, gap: null };
  }
  return {
    status: 'ready',
    ownerState,
    mergedPullRequest: {
      number: mergedPullRequest.number,
      mergedAt: mergedPullRequest.mergedAt,
      baseRefName: mergedPullRequest.baseRefName,
      mergeCommit: mergedPullRequest.mergeCommit.oid,
    },
    gap: null,
  };
}

function baseResult(issueNumber, defaultBranch, requirements) {
  return {
    status: 'none',
    reasonCode: 'no_deliverable_requirements',
    issueNumber,
    defaultBranch: defaultBranch ?? null,
    requirements,
    gaps: [],
  };
}

export function inspectDeliverableDependencies({
  issueNumber,
  body,
  defaultBranch,
  targets,
  executionDependencies,
  relationshipEvidenceComplete = true,
}) {
  const activeIssueNumber = positiveIssueNumber(issueNumber);
  const parsed = parseDeliverableRequirements(body);
  const dependencyNumbers = new Set(executionDependencyNumbers(executionDependencies));
  const result = baseResult(activeIssueNumber, defaultBranch, parsed.requirements.map((requirement) => ({
    ...requirement,
    executionEdge: dependencyNumbers.has(requirement.ownerIssue),
    ownerState: 'UNKNOWN',
    mergedPullRequest: null,
    available: false,
  })));

  if (activeIssueNumber === null) {
    return {
      ...result,
      status: 'unverifiable',
      reasonCode: 'active_issue_invalid',
      gaps: ['active issue number must be a positive integer'],
    };
  }
  if (parsed.gaps.length > 0) {
    return {
      ...result,
      status: 'unverifiable',
      reasonCode: 'deliverable_requirements_malformed',
      gaps: parsed.gaps,
    };
  }
  if (parsed.requirements.length === 0) return result;
  if (typeof defaultBranch !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(defaultBranch)) {
    return {
      ...result,
      status: 'unverifiable',
      reasonCode: 'default_branch_unverifiable',
      gaps: ['repository default branch is missing or malformed'],
    };
  }
  if (relationshipEvidenceComplete !== true) {
    return {
      ...result,
      status: 'unverifiable',
      reasonCode: 'execution_relationships_unverifiable',
      gaps: ['execution-dependency classification is incomplete or unverifiable'],
    };
  }

  const selfReferences = parsed.requirements.filter((requirement) => requirement.ownerIssue === activeIssueNumber);
  if (selfReferences.length > 0) {
    return {
      ...result,
      status: 'repair_required',
      reasonCode: 'deliverable_owner_self_reference',
      gaps: [`issue #${activeIssueNumber} cannot require its own deliverable`],
    };
  }

  const missingEdges = uniqueSorted(parsed.requirements
    .map((requirement) => requirement.ownerIssue)
    .filter((ownerIssue) => !dependencyNumbers.has(ownerIssue)));
  if (missingEdges.length > 0) {
    return {
      ...result,
      status: 'repair_required',
      reasonCode: 'deliverable_execution_edge_missing',
      requirements: result.requirements,
      gaps: missingEdges.map((number) => `deliverable owner #${number} lacks a whole-issue execution dependency`),
    };
  }

  const targetByNumber = indexTargets(targets);
  const classified = [];
  const gaps = [];
  let blocked = false;
  let unverifiable = false;
  for (const requirement of result.requirements) {
    const target = targetByNumber.get(requirement.ownerIssue);
    if (!target) {
      unverifiable = true;
      gaps.push(`deliverable owner #${requirement.ownerIssue} metadata is unavailable`);
      classified.push({
        ...requirement,
        executionEdge: true,
        ownerState: 'UNKNOWN',
        mergedPullRequest: null,
        available: false,
      });
      continue;
    }
    const targetResult = classifyTarget(target, defaultBranch);
    if (targetResult.status === 'unverifiable') {
      unverifiable = true;
      gaps.push(targetResult.gap);
    } else if (targetResult.status === 'blocked') {
      blocked = true;
    }
    classified.push({
      ...requirement,
      executionEdge: true,
      ownerState: targetResult.ownerState,
      mergedPullRequest: targetResult.mergedPullRequest,
      available: targetResult.status === 'ready',
    });
  }

  if (unverifiable) {
    return {
      ...result,
      status: 'unverifiable',
      reasonCode: 'deliverable_metadata_unverifiable',
      requirements: classified,
      gaps,
    };
  }
  if (blocked) {
    return {
      ...result,
      status: 'blocked',
      reasonCode: 'deliverable_not_merged',
      requirements: classified,
      gaps: classified
        .filter((requirement) => !requirement.available)
        .map((requirement) => `deliverable owner #${requirement.ownerIssue} has no merged closing pull request to ${defaultBranch}`),
    };
  }
  return {
    ...result,
    status: 'ready',
    reasonCode: 'deliverables_available',
    requirements: classified,
  };
}

export const deliverableDependencyLimits = Object.freeze({
  maxBodyBytes: MAX_BODY_BYTES,
  maxRequirements: MAX_REQUIREMENTS,
  maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
});
