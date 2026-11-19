// Kept-test-types validation and rule text for steering/test-layers.json.
// Node-free: no imports, so any runtime (the prompt registry, the controller, the hooks module) can load it.

export const TEST_LAYERS_PATH = 'steering/test-layers.json';
export const TEST_LAYER_TYPES = Object.freeze(['bdd', 'unit', 'integration', 'property', 'doc']);
export const TEST_LAYER_DEFAULTS = Object.freeze({ version: 1, kept: Object.freeze(['bdd']) });
const TOP_LEVEL_KEYS = Object.freeze(['version', 'kept']);

const TYPE_DESCRIPTIONS = Object.freeze({
  bdd: 'scenario implementations: the step definitions of a `feature.gherkin` scenario, or the test that the scenario\'s `# File:` header names and that cites the scenario\'s `@SCN` tag',
  unit: 'isolated tests of one module or function',
  integration: 'tests that exercise several modules or a real external boundary together',
  property: 'property-based tests that check an invariant over generated inputs',
  doc: 'documentation examples executed as tests',
});

/** Fail-closed diagnostic naming the file, the offending field, and the value. */
export class TestLayersError extends Error {
  constructor(key, value, reason) {
    super(key === '(file)'
      ? `${TEST_LAYERS_PATH}: ${reason}`
      : `${TEST_LAYERS_PATH}: ${key} = ${JSON.stringify(value)}: ${reason}`);
    this.name = 'TestLayersError';
    this.reasonCode = 'test_layers_invalid';
    this.key = key;
    this.value = value;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Returns the normalized config, with `kept` in vocabulary order, or throws TestLayersError. */
export function validateTestLayers(value) {
  if (!isPlainObject(value)) throw new TestLayersError('(root)', value, 'must be a JSON object');
  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL_KEYS.includes(key)) throw new TestLayersError(key, value[key], 'unknown key');
  }
  if (value.version !== 1) throw new TestLayersError('version', value.version, 'must be 1');
  const { kept } = value;
  if (!Array.isArray(kept) || kept.length === 0) {
    throw new TestLayersError('kept', kept, `must be a non-empty array of ${TEST_LAYER_TYPES.join(', ')}`);
  }
  kept.forEach((type, index) => {
    if (!TEST_LAYER_TYPES.includes(type)) {
      throw new TestLayersError(`kept[${index}]`, type, `unknown test type; must be one of ${TEST_LAYER_TYPES.join(', ')}`);
    }
    if (kept.indexOf(type) !== index) throw new TestLayersError(`kept[${index}]`, type, 'duplicate test type');
  });
  if (!kept.includes('bdd')) throw new TestLayersError('kept', kept, 'must include bdd, the acceptance layer');
  return { version: 1, kept: TEST_LAYER_TYPES.filter((type) => kept.includes(type)) };
}

/** The kept-types rule rendered into the write-spec, implement and verify prompts. */
export function testLayersRule(config) {
  const { kept } = validateTestLayers(config);
  const others = kept.filter((type) => type !== 'bdd');
  return [
    '# Kept Test Layers',
    '',
    `This project keeps these test types (from \`${TEST_LAYERS_PATH}\`; a missing file means \`bdd\` only): ${kept.map((type) => `\`${type}\``).join(', ')}.`,
    '',
    ...kept.map((type) => `- \`${type}\`: ${TYPE_DESCRIPTIONS[type]}.`),
    '',
    '- `bdd` is the single acceptance layer. Each acceptance criterion is tested once, by the implementation of its `feature.gherkin` scenario.',
    '- Never write, task, or keep a test that restates a scenario\'s acceptance criterion.',
    others.length === 0
      ? '- No other test type is kept: every test is a scenario implementation.'
      : `- Any other test must be of a kept type (${others.map((type) => `\`${type}\``).join(', ')}), cover a behavior that no scenario covers, and be justified with its type and reason.`,
    '',
  ].join('\n');
}
