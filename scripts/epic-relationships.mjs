const POSITIVE_ISSUE = /^[1-9]\d*$/;
const EPIC_CHILD_LABEL = /^epic-child-of-([1-9]\d*)$/i;

function positiveIssueNumber(value) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (typeof normalized === 'number') {
    return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
  }
  if (typeof normalized !== 'string' || !POSITIVE_ISSUE.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function collectionNodes(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.nodes) ? value.nodes : [];
}

export function issueLabelNames(issue) {
  return [...new Set(collectionNodes(issue?.labels)
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter((label) => typeof label === 'string' && label.trim())
    .map((label) => label.trim().toLowerCase()))].sort();
}

export function epicChildLabelTargets(issue) {
  return issueLabelNames(issue)
    .map((label) => label.match(EPIC_CHILD_LABEL)?.[1] ?? null)
    .map(positiveIssueNumber)
    .filter((number) => number !== null);
}

export function parseBodyRelationships(body) {
  const dependsOn = [];
  const blocks = [];
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const dependsMatch = line.match(/^\s*Depends on:\s*(#\d+(?:\s*,\s*#\d+)*)\s*$/i);
    const blocksMatch = line.match(/^\s*Blocks:\s*(#\d+(?:\s*,\s*#\d+)*)\s*$/i);
    const target = dependsMatch ? dependsOn : blocksMatch ? blocks : null;
    const source = dependsMatch?.[1] ?? blocksMatch?.[1];
    if (!target || !source) continue;
    for (const match of source.matchAll(/#([1-9]\d*)/g)) {
      const number = positiveIssueNumber(match[1]);
      if (number !== null) target.push(number);
    }
  }
  return {
    dependsOn: [...new Set(dependsOn)],
    blocks: [...new Set(blocks)],
  };
}

export function parseChecklistChildren(body) {
  const children = [];
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*\[[ xX]\]\s*#([1-9]\d*)\b/);
    const number = positiveIssueNumber(match?.[1]);
    if (number !== null) children.push(number);
  }
  return [...new Set(children)].sort((left, right) => left - right);
}

function nativeParent(issue) {
  return positiveIssueNumber(typeof issue?.parent === 'object' ? issue.parent?.number : issue?.parent);
}

function nativeChildren(issue) {
  return collectionNodes(issue?.subIssues)
    .map((child) => positiveIssueNumber(typeof child === 'object' ? child?.number : child))
    .filter((number) => number !== null);
}

function mergeIssue(existing, candidate) {
  if (!candidate || positiveIssueNumber(candidate.number) === null) return existing;
  if (!existing) return candidate;
  const existingLabels = collectionNodes(existing.labels);
  const candidateLabels = collectionNodes(candidate.labels);
  return {
    ...candidate,
    ...existing,
    labels: existingLabels.length ? existing.labels : candidateLabels.length ? candidate.labels : existing.labels,
    body: typeof existing.body === 'string' ? existing.body : candidate.body,
    state: existing.state ?? candidate.state,
  };
}

function indexIssues(issues) {
  const byNumber = new Map();
  const records = Array.isArray(issues) ? issues : [];
  for (const issue of records) {
    const number = positiveIssueNumber(issue?.number);
    if (number === null) continue;
    byNumber.set(number, mergeIssue(byNumber.get(number), issue));
  }
  for (const issue of records) {
    if (issue?.parent && typeof issue.parent === 'object') {
      const parentNumber = positiveIssueNumber(issue.parent.number);
      if (parentNumber !== null) {
        byNumber.set(parentNumber, mergeIssue(byNumber.get(parentNumber), issue.parent));
      }
    }
    for (const child of collectionNodes(issue?.subIssues)) {
      if (child && typeof child === 'object') {
        const childNumber = positiveIssueNumber(child.number);
        if (childNumber !== null) {
          byNumber.set(childNumber, mergeIssue(byNumber.get(childNumber), child));
        }
      }
    }
  }
  return byNumber;
}

function addPair(pairs, child, target, signal) {
  const childNumber = positiveIssueNumber(child);
  const targetNumber = positiveIssueNumber(target);
  if (childNumber === null || targetNumber === null || childNumber === targetNumber) return;
  const key = `${childNumber}:${targetNumber}`;
  const pair = pairs.get(key) ?? { child: childNumber, target: targetNumber, signals: new Set() };
  pair.signals.add(signal);
  pairs.set(key, pair);
}

export function normalizeEpicRelationships(issues) {
  const byNumber = indexIssues(issues);
  const pairs = new Map();
  for (const issue of byNumber.values()) {
    const number = positiveIssueNumber(issue.number);
    if (number === null) continue;
    addPair(pairs, number, nativeParent(issue), 'native-parent');
    for (const child of nativeChildren(issue)) addPair(pairs, child, number, 'native-sub-issue');
    const body = parseBodyRelationships(issue.body);
    for (const target of body.dependsOn) addPair(pairs, number, target, 'body-depends-on');
    for (const child of body.blocks) addPair(pairs, child, number, 'body-blocks');
    for (const target of epicChildLabelTargets(issue)) addPair(pairs, number, target, 'child-label');
  }
  return {
    issues: byNumber,
    pairs: [...pairs.values()]
      .map((pair) => ({ ...pair, signals: [...pair.signals].sort() }))
      .sort((left, right) => left.child - right.child || left.target - right.target),
  };
}

function targetState(issue) {
  const state = String(issue?.state ?? 'UNKNOWN').toUpperCase();
  return state === 'OPEN' || state === 'CLOSED' ? state : 'UNKNOWN';
}

function resultBase(activeIssueNumber) {
  return {
    issueNumber: activeIssueNumber,
    role: 'ordinary',
    parentNumber: null,
    identity: 'none',
    consistency: 'not-applicable',
    nativeAuthority: 'not-applicable',
    degraded: false,
    coordinationPairs: [],
    executionDependencies: [],
    siblingNumbers: [],
    siblingReconciliation: null,
    gaps: [],
  };
}

function appendSiblingDiagnostics(result, parentNumber) {
  const reconciliation = result.siblingReconciliation;
  result.nativeAuthority = reconciliation.authority;
  if (reconciliation.authority !== 'native') {
    result.degraded = true;
    result.gaps.push(`parent #${parentNumber} sibling authority degraded to checklist-fallback; native sub-issue discovery was unavailable`);
    return;
  }
  if (reconciliation.nativeOnly.length > 0) {
    result.degraded = true;
    result.gaps.push(`parent #${parentNumber} checklist omits native children: ${reconciliation.nativeOnly.map((number) => `#${number}`).join(', ')}`);
  }
  if (reconciliation.checklistOnly.length > 0) {
    result.degraded = true;
    result.gaps.push(`parent #${parentNumber} checklist contains non-native children: ${reconciliation.checklistOnly.map((number) => `#${number}`).join(', ')}`);
  }
}

export function reconcileEpicSiblings({
  nativeChildren: nativeInput = [],
  checklistChildren: checklistInput = [],
  nativeAvailable = true,
} = {}) {
  const normalize = (values) => [...new Set((Array.isArray(values) ? values : [])
    .map(positiveIssueNumber)
    .filter((number) => number !== null))].sort((left, right) => left - right);
  const native = normalize(nativeInput);
  const checklist = normalize(checklistInput);
  const nativeSet = new Set(native);
  const checklistSet = new Set(checklist);
  return {
    authority: nativeAvailable ? 'native' : 'checklist-fallback',
    siblingNumbers: nativeAvailable ? native : checklist,
    observedNumbers: [...new Set([...native, ...checklist])].sort((left, right) => left - right),
    nativeOnly: native.filter((number) => !checklistSet.has(number)),
    checklistOnly: checklist.filter((number) => !nativeSet.has(number)),
  };
}

export function classifyEpicRelationships({ issues, activeIssueNumber, nativeAvailable = true } = {}) {
  const active = positiveIssueNumber(activeIssueNumber);
  const result = resultBase(active);
  if (active === null) {
    result.role = 'unverifiable';
    result.identity = 'unverifiable';
    result.consistency = 'unverifiable';
    result.degraded = true;
    result.gaps.push('active issue number is missing or invalid');
    return result;
  }

  const normalized = normalizeEpicRelationships(issues);
  const current = normalized.issues.get(active);
  if (!current) {
    result.role = 'unverifiable';
    result.identity = 'unverifiable';
    result.consistency = 'unverifiable';
    result.degraded = true;
    result.gaps.push(`issue #${active} metadata is unavailable`);
    return result;
  }

  const currentLabels = issueLabelNames(current);
  const childLabelTargets = epicChildLabelTargets(current);
  const pairs = normalized.pairs.filter((pair) => pair.child === active);
  const coordination = [];
  const inconsistentClaims = [];

  for (const pair of pairs) {
    const target = normalized.issues.get(pair.target);
    const state = targetState(target);
    const targetKnown = Boolean(target) && state !== 'UNKNOWN';
    const targetEpic = issueLabelNames(target).includes('epic');
    if (targetKnown && targetEpic) {
      coordination.push({ ...pair, targetState: state });
      continue;
    }
    if (pair.signals.includes('child-label')) {
      inconsistentClaims.push({ ...pair, targetKnown, targetState: state });
    }
    result.executionDependencies.push({
      issueNumber: pair.target,
      state,
      blocking: !targetKnown || state !== 'CLOSED',
      metadata: targetKnown ? 'confirmed-non-epic' : 'unknown',
      signals: pair.signals,
    });
  }

  result.executionDependencies.sort((left, right) => left.issueNumber - right.issueNumber);
  if (result.executionDependencies.some((dependency) => dependency.metadata === 'unknown')) {
    result.degraded = true;
  }
  result.coordinationPairs = coordination;

  const uniqueCoordinationTargets = [...new Set(coordination.map((pair) => pair.target))];
  if (uniqueCoordinationTargets.length > 1) {
    result.role = 'ambiguous';
    result.identity = 'ambiguous';
    result.consistency = 'ambiguous';
    result.degraded = true;
    result.gaps.push(`issue #${active} has multiple confirmed epic parents: ${uniqueCoordinationTargets.map((number) => `#${number}`).join(', ')}`);
    return result;
  }

  if (inconsistentClaims.length > 0) {
    const targets = [...new Set(inconsistentClaims.map((pair) => pair.target))];
    const unknown = inconsistentClaims.some((claim) => !claim.targetKnown);
    result.role = unknown ? 'unverifiable' : 'inconsistent';
    result.identity = result.role;
    result.consistency = result.role;
    result.degraded = true;
    result.gaps.push(`${unknown ? 'could not verify' : 'confirmed non-epic'} target${targets.length === 1 ? '' : 's'} claimed by child label: ${targets.map((number) => `#${number}`).join(', ')}`);
    return result;
  }

  if (uniqueCoordinationTargets.length === 1) {
    const parentNumber = uniqueCoordinationTargets[0];
    const pair = coordination.find((candidate) => candidate.target === parentNumber);
    const parent = normalized.issues.get(parentNumber);
    const nativeSignals = pair.signals.filter((signal) => signal.startsWith('native-'));
    const bodySignals = pair.signals.filter((signal) => signal.startsWith('body-'));
    const matchingLabels = childLabelTargets.filter((target) => target === parentNumber);
    const otherLabels = childLabelTargets.filter((target) => target !== parentNumber);
    if (!nativeAvailable) {
      result.role = 'unverifiable';
      result.parentNumber = parentNumber;
      result.identity = 'unverifiable';
      result.consistency = 'unverifiable';
      result.degraded = true;
      result.siblingReconciliation = reconcileEpicSiblings({
        nativeChildren: nativeChildren(parent),
        checklistChildren: parseChecklistChildren(parent?.body),
        nativeAvailable: false,
      });
      result.siblingNumbers = result.siblingReconciliation.siblingNumbers
        .filter((number) => number !== active);
      result.gaps.push(`issue #${active} native relationship discovery is unavailable; coordination with epic #${parentNumber} is unverifiable`);
      appendSiblingDiagnostics(result, parentNumber);
      return result;
    }
    const labeledIdentityIncomplete = matchingLabels.length === 1
      && (nativeSignals.length === 0 || bodySignals.length === 0);
    const legacyIdentityIncomplete = matchingLabels.length === 0
      && (nativeSignals.length === 0 || bodySignals.length === 0);
    if (childLabelTargets.length > 1 || otherLabels.length > 0 || labeledIdentityIncomplete) {
      result.role = 'inconsistent';
      result.identity = result.role;
      result.consistency = result.role;
      result.degraded = true;
      if (childLabelTargets.length > 1) result.gaps.push(`issue #${active} has multiple epic-child labels`);
      if (otherLabels.length > 0) result.gaps.push(`issue #${active} child label does not match confirmed epic #${parentNumber}`);
      if (nativeSignals.length === 0) {
        result.gaps.push(`issue #${active} has no native relationship to labeled epic #${parentNumber}`);
      }
      if (bodySignals.length === 0) result.gaps.push(`issue #${active} has no supported body relationship to labeled epic #${parentNumber}`);
      return result;
    }
    if (legacyIdentityIncomplete) {
      result.role = 'unverifiable';
      result.parentNumber = parentNumber;
      result.identity = 'unverifiable';
      result.consistency = 'unverifiable';
      result.degraded = true;
      if (nativeSignals.length === 0) {
        result.gaps.push(`issue #${active} cannot be treated as a legacy child of epic #${parentNumber} without an agreeing native relationship`);
      }
      if (bodySignals.length === 0) {
        result.gaps.push(`issue #${active} cannot be treated as a legacy child of epic #${parentNumber} without an agreeing body relationship`);
      }
      return result;
    }

    result.role = 'epic-child';
    result.parentNumber = parentNumber;
    result.identity = matchingLabels.length === 1 ? 'durable' : 'legacy';
    result.consistency = result.identity === 'durable' ? 'consistent' : 'legacy';
    result.degraded = result.identity === 'legacy';
    if (result.identity === 'legacy') {
      result.gaps.push(`issue #${active} is missing label epic-child-of-${parentNumber}`);
    }
    result.siblingReconciliation = reconcileEpicSiblings({
      nativeChildren: nativeChildren(parent),
      checklistChildren: parseChecklistChildren(parent?.body),
      nativeAvailable,
    });
    result.siblingNumbers = result.siblingReconciliation.siblingNumbers
      .filter((number) => number !== active);
    appendSiblingDiagnostics(result, parentNumber);
    return result;
  }

  if (childLabelTargets.length > 0) {
    result.role = 'unverifiable';
    result.identity = 'unverifiable';
    result.consistency = 'unverifiable';
    result.degraded = true;
    result.gaps.push(`issue #${active} claims an epic parent that was not hydrated`);
    return result;
  }

  if (currentLabels.includes('epic')) {
    result.role = nativeAvailable ? 'epic' : 'unverifiable';
    result.identity = nativeAvailable ? 'durable' : 'unverifiable';
    result.consistency = nativeAvailable ? 'consistent' : 'unverifiable';
    result.degraded = !nativeAvailable;
    result.siblingReconciliation = reconcileEpicSiblings({
      nativeChildren: nativeChildren(current),
      checklistChildren: parseChecklistChildren(current.body),
      nativeAvailable,
    });
    result.siblingNumbers = result.siblingReconciliation.siblingNumbers;
    if (!nativeAvailable) {
      result.gaps.push(`issue #${active} native sub-issue discovery is unavailable; epic coordination is unverifiable`);
    }
    appendSiblingDiagnostics(result, active);
  }
  return result;
}
