// The version artifacts that technical steering declares in its `## Versioning` table: `{ relative, field }` rows.
// Delivery synchronizes each one at the queue head with `updatedVersionMirror`; the gate's selection uses the same
// update to recognize a change that is only that version bump.
import { extname } from 'node:path';

/** The declared version artifacts of the technical steering text, in table order, without duplicates. */
export function versionedArtifacts(tech) {
  const source = String(tech);
  const heading = source.match(/^## Versioning\s*$/m);
  if (!heading) return [];
  const body = source.slice(heading.index + heading[0].length);
  const nextHeading = body.search(/^#{2,3}\s/m);
  const section = nextHeading < 0 ? body : body.slice(0, nextHeading);
  const artifacts = [];
  const seen = new Map();
  for (const line of section.split('\n')) {
    const row = line.match(/^\|\s*`([^`]+)`\s*\|\s*(?:`([^`]+)`|([^|]+?))\s*\|/);
    if (!row) continue;
    const relative = row[1].trim();
    const field = (row[2] ?? row[3]).trim();
    if (!relative || !field) throw new Error('technical steering has an invalid version artifact declaration');
    if (seen.has(relative)) {
      if (seen.get(relative) !== field) {
        throw new Error(`technical steering declares conflicting fields for ${relative}`);
      }
      continue;
    }
    seen.set(relative, field);
    artifacts.push({ relative, field });
  }
  return artifacts;
}

function jsonVersionMirror(content, field, current, version, relative) {
  const document = JSON.parse(content);
  const keys = field.split('.').map((key) => key.trim()).filter(Boolean);
  if (keys.length === 0 || keys.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) {
    throw new Error(`invalid JSON version field for ${relative}: ${field}`);
  }
  let owner = document;
  for (const key of keys.slice(0, -1)) {
    if (!owner || typeof owner !== 'object' || !Object.hasOwn(owner, key)) {
      throw new Error(`declared version field is missing from ${relative}: ${field}`);
    }
    owner = owner[key];
  }
  const key = keys.at(-1);
  if (!owner || typeof owner !== 'object' || !Object.hasOwn(owner, key)) {
    throw new Error(`declared version field is missing from ${relative}: ${field}`);
  }
  if (owner[key] !== current) {
    throw new Error(`declared version field is not synchronized in ${relative}: ${field}`);
  }
  owner[key] = version;
  return `${JSON.stringify(document, null, 2)}\n`;
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tomlVersionMirror(content, field, current, version, relative) {
  const parts = field.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error(`invalid TOML version field for ${relative}: ${field}`);
  const table = parts.slice(0, -1).join('.');
  const key = parts.at(-1);
  const assignment = new RegExp(`^(\\s*${regexEscape(key)}\\s*=\\s*)(["'])([^"']*)(["'])(\\s*(?:#.*)?)$`);
  let activeTable = '';
  const matches = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (heading) {
      activeTable = heading[1].trim();
      continue;
    }
    if (activeTable !== table) continue;
    const match = lines[index].match(assignment);
    if (match && match[2] === match[4]) matches.push({ index, match });
  }
  if (matches.length !== 1) {
    throw new Error(`declared TOML version field is ${matches.length ? 'ambiguous' : 'missing'} in ${relative}: ${field}`);
  }
  const [{ index, match }] = matches;
  if (match[3] !== current) {
    throw new Error(`declared version field is not synchronized in ${relative}: ${field}`);
  }
  lines[index] = `${match[1]}${match[2]}${version}${match[4]}${match[5]}`;
  return lines.join('\n');
}

function textVersionMirror(content, field, current, version, relative) {
  if (field.toLowerCase() === 'file text') {
    if (content.trim() !== current) {
      throw new Error(`declared version field is not synchronized in ${relative}: ${field}`);
    }
    return content.replace(current, version);
  }
  const lines = content.split('\n');
  const matches = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes(field) && line.includes(current));
  if (matches.length !== 1 || matches[0].line.split(current).length !== 2) {
    throw new Error(`declared text version field is ${matches.length ? 'ambiguous' : 'missing'} in ${relative}: ${field}`);
  }
  lines[matches[0].index] = matches[0].line.replace(current, version);
  return lines.join('\n');
}

/**
 * `content` of declared version artifact `artifact` with its version moved from `current` to `version`: a JSON field,
 * a TOML key or a text line, by the file extension. Throws when the field is missing, ambiguous or not at `current`.
 */
export function updatedVersionMirror(content, artifact, current, version) {
  const extension = extname(artifact.relative).toLowerCase();
  if (extension === '.json') {
    return jsonVersionMirror(content, artifact.field, current, version, artifact.relative);
  }
  if (extension === '.toml') {
    return tomlVersionMirror(content, artifact.field, current, version, artifact.relative);
  }
  return textVersionMirror(content, artifact.field, current, version, artifact.relative);
}
