// Kept-test-types validation, declared path globs and rule text for steering/test-layers.json.
// Node-free: no imports, so any runtime (the prompt registry, the controller, the hooks module) can load it.

export const TEST_LAYERS_PATH = 'steering/test-layers.json';
export const TEST_LAYER_TYPES = Object.freeze(['bdd', 'e2e', 'unit', 'integration', 'property', 'doc']);
export const TEST_LAYER_DEFAULTS = Object.freeze({ version: 1, kept: Object.freeze(['bdd']) });
const TOP_LEVEL_KEYS = Object.freeze(['version', 'kept', 'paths']);

const TYPE_DESCRIPTIONS = Object.freeze({
  bdd: 'scenario implementations: the step definitions of a `feature.gherkin` scenario, or the test that the scenario\'s `# File:` header names and that cites the scenario\'s `@SCN` tag',
  e2e: 'automated tests that drive the running app or UI through a device, emulator, simulator or browser',
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

/** Validates the optional `paths` map: vocabulary type keys, arrays of distinct repository-relative globs. */
function validatePaths(paths) {
  if (!isPlainObject(paths)) throw new TestLayersError('paths', paths, 'must be an object that maps test types to arrays of globs');
  for (const type of Object.keys(paths)) {
    if (!TEST_LAYER_TYPES.includes(type)) {
      throw new TestLayersError(`paths.${type}`, paths[type], `unknown test type; must be one of ${TEST_LAYER_TYPES.join(', ')}`);
    }
  }
  const firstField = new Map();
  const normalized = {};
  for (const type of TEST_LAYER_TYPES) {
    if (!Object.hasOwn(paths, type)) continue;
    const globs = paths[type];
    if (!Array.isArray(globs)) throw new TestLayersError(`paths.${type}`, globs, 'must be an array of globs');
    globs.forEach((glob, index) => {
      const field = `paths.${type}[${index}]`;
      if (typeof glob !== 'string') throw new TestLayersError(field, glob, 'must be a string');
      if (glob === '') throw new TestLayersError(field, glob, 'must not be empty');
      if (glob.startsWith('/')) throw new TestLayersError(field, glob, 'must be repository-relative, not absolute');
      const segments = glob.split('/');
      if (segments.includes('..')) throw new TestLayersError(field, glob, 'must not contain a `..` segment');
      // A leading `./`, a trailing `/` or `//` could never match a repository-relative path.
      if (segments.some((segment) => segment === '' || segment === '.')) {
        throw new TestLayersError(field, glob, 'must not contain an empty or `.` segment (no leading `./`, trailing `/` or `//`)');
      }
      if (firstField.has(glob)) throw new TestLayersError(field, glob, `repeats the glob at ${firstField.get(glob)}`);
      firstField.set(glob, field);
    });
    normalized[type] = [...globs];
  }
  return normalized;
}

/** Returns the normalized config, with `kept` in vocabulary order, or throws TestLayersError. `paths` is kept only
 * when the input declares it. */
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
  const normalized = { version: 1, kept: TEST_LAYER_TYPES.filter((type) => kept.includes(type)) };
  if (Object.hasOwn(value, 'paths')) normalized.paths = validatePaths(value.paths);
  return normalized;
}

// A glob segment compiled to a RegExp: `*` any run of characters, `?` one character, every other character literal.
// A glob segment never contains `/`, so neither wildcard can cross a segment boundary.
function segmentPattern(segment) {
  let source = '';
  for (const char of segment) {
    if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

const compiledGlobs = new Map();

/** Compiles one declared glob: a `**` segment matches zero or more whole segments; the path must be consumed whole. */
function compileGlob(glob) {
  let compiled = compiledGlobs.get(glob);
  if (!compiled) {
    const segments = glob.split('/').map((segment) => (segment === '**' ? null : segmentPattern(segment)));
    const matchFrom = (index, position, parts) => {
      if (index === segments.length) return position === parts.length;
      const pattern = segments[index];
      if (pattern === null) {
        for (let next = position; next <= parts.length; next += 1) {
          if (matchFrom(index + 1, next, parts)) return true;
        }
        return false;
      }
      return position < parts.length && pattern.test(parts[position]) && matchFrom(index + 1, position + 1, parts);
    };
    compiled = (rel) => matchFrom(0, 0, rel.split('/'));
    compiledGlobs.set(glob, compiled);
  }
  return compiled;
}

/** The one type whose declared globs match the repository-relative path `rel`, or null. A path that matches the globs
 * of two types is a `test_layers_invalid` error naming the file and both types. */
export function declaredTestType(config, rel) {
  const matched = TEST_LAYER_TYPES.filter((type) => (config?.paths?.[type] ?? []).some((glob) => compileGlob(glob)(rel)));
  if (matched.length > 1) throw new TestLayersError('paths', rel, `matches globs of both ${matched.join(' and ')}`);
  return matched[0] ?? null;
}

/** The kept-types rule rendered into the write-spec, implement and verify prompts. */
export function testLayersRule(config) {
  const { kept, paths = {} } = validateTestLayers(config);
  const others = kept.filter((type) => type !== 'bdd');
  const declared = TEST_LAYER_TYPES.filter((type) => (paths[type] ?? []).length > 0);
  return [
    '# Kept Test Layers',
    '',
    `This project keeps these test types (from \`${TEST_LAYERS_PATH}\`; a missing file means \`bdd\` only): ${kept.map((type) => `\`${type}\``).join(', ')}.`,
    '',
    ...kept.map((type) => `- \`${type}\`: ${TYPE_DESCRIPTIONS[type]}.`),
    '',
    '- `bdd` is the single acceptance layer. Each acceptance criterion is tested once, by the implementation of its `feature.gherkin` scenario.',
    '- Never write, task, or keep a test that restates a scenario\'s acceptance criterion.',
    ...(kept.includes('e2e')
      ? ['- An `e2e` test that cites a scenario\'s `@SCN` tag is that scenario\'s implementation. Use one when the acceptance criterion\'s behavior is only observable through the running app or UI.']
      : []),
    ...declared.map((type) => `- \`${type}\` tests are identified by these declared path globs (\`${TEST_LAYERS_PATH}\`): ${paths[type].map((glob) => `\`${glob}\``).join(', ')}. A test of that type belongs under one of them.`),
    others.length === 0
      ? '- No other test type is kept: every test is a scenario implementation.'
      : `- Any other test must be of a kept type (${others.map((type) => `\`${type}\``).join(', ')}), cover a behavior that no scenario covers, and be justified with its type and reason.`,
    '',
  ].join('\n');
}
