// Data version helpers shared by the app and the build (vite.config.ts precomputes the version).

export type Mode = 'classic' | 'facet';
/** Files keyed by path relative to the layer root, e.g. `npc/units.json`. */
export type Files = Record<string, unknown>;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
const isObject = (v: unknown): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Objects merge key by key; `null` deletes a key; anything else (arrays included) replaces. */
export function merge(base: unknown, patch: unknown): unknown {
  if (!isObject(base) || !isObject(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = merge(base[k], v);
  }
  return out;
}

/** FNV-1a, 32-bit, over the JSON text. Identifies a data set; not a security hash. */
export function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The layered files for a mode: the baseline, plus Facet overrides in Facet mode. */
export function layer(mode: Mode, baseline: Files, facet: Files): Files {
  const files: Files = { ...baseline };
  if (mode === 'facet') for (const [k, v] of Object.entries(facet)) files[k] = merge(files[k], v);
  return files;
}

/** Hash of every layered file, sorted by path. */
export function versionOf(files: Files) {
  const sorted = Object.keys(files).sort();
  return hash(JSON.stringify(sorted.map((k) => [k, files[k]])));
}
