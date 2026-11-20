// The version artifacts that technical steering declares in its `## Versioning` table: `{ relative, field }` rows.
// Delivery synchronizes each one at the queue head; the gate's selection treats a change confined to one as a bump.

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
