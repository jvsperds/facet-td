// Game data: the immutable Gem TD baseline, plus Facet overrides in Facet mode (docs/PLAN.md, Game modes).
// shortcut: bundles every baseline file (~4.5 MB incl. map decor and portraits); trim to used files when build size matters.
const BASELINE = import.meta.glob<unknown>('../../data/baseline/**/*.json', { eager: true, import: 'default' });
const FACET = import.meta.glob<unknown>('../../data/facet/**/*.json', { eager: true, import: 'default' });

export type Mode = 'classic' | 'facet';
/** Files keyed by path relative to the layer root, e.g. `npc/units.json`. */
export type Files = Record<string, unknown>;
export interface GameData {
  mode: Mode;
  files: Files;
  /** Hash of the loaded data; stamped into saves, and the co-op join check. */
  version: string;
}

const byRelPath = (glob: Record<string, unknown>, root: string): Files =>
  Object.fromEntries(Object.entries(glob).map(([k, v]) => [k.slice(k.indexOf(root) + root.length), v]));

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

export function loadData(mode: Mode, baseline: Files = byRelPath(BASELINE, '/data/baseline/'), facet: Files = byRelPath(FACET, '/data/facet/')): GameData {
  const files: Files = { ...baseline };
  if (mode === 'facet') for (const [k, v] of Object.entries(facet)) files[k] = merge(files[k], v);
  const sorted = Object.keys(files).sort();
  return { mode, files, version: hash(JSON.stringify(sorted.map((k) => [k, files[k]]))) };
}
