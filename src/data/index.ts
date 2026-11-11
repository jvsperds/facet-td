// Game data: the immutable Gem TD baseline, plus Facet overrides in Facet mode (docs/PLAN.md, Game modes).
// Only the files the 1-player game reads are bundled (vite.config.ts also strips the map entities
// down to what the board reads). The data version still identifies the whole baseline: the build
// hashes every baseline file once (`__DATA_VERSION__`), so a boot never re-serialises the data.
import { layer, versionOf, type Files, type Mode } from './version';

export { hash, merge } from './version';
export type { Files, Mode } from './version';

const BASELINE = import.meta.glob<unknown>(
  [
    '../../data/baseline/npc/units.json',
    '../../data/baseline/npc/abilities.json',
    '../../data/baseline/lua/addon_game_mode.json',
    '../../data/baseline/localization/english.json',
    '../../data/baseline/maps/gemtd_1p.entities.json',
  ],
  { eager: true, import: 'default' },
);
const FACET = import.meta.glob<unknown>('../../data/facet/**/*.json', {
  eager: true,
  import: 'default',
});

declare const __DATA_VERSION__: Record<Mode, string> | undefined;

export interface GameData {
  mode: Mode;
  files: Files;
  /** Hash of the loaded data; stamped into saves, and the co-op join check. */
  version: string;
}

const byRelPath = (glob: Record<string, unknown>, root: string): Files =>
  Object.fromEntries(
    Object.entries(glob).map(([k, v]) => [k.slice(k.indexOf(root) + root.length), v]),
  );

/**
 * Layered game data. With the bundled files the version is the build's hash of the full baseline
 * (and Facet layer); with files passed in (tests) it is hashed from them.
 */
export function loadData(mode: Mode, baseline?: Files, facet?: Files): GameData {
  const bundled = !baseline && !facet && typeof __DATA_VERSION__ === 'object';
  const files = layer(
    mode,
    baseline ?? byRelPath(BASELINE, '/data/baseline/'),
    facet ?? byRelPath(FACET, '/data/facet/'),
  );
  return { mode, files, version: bundled ? __DATA_VERSION__![mode] : versionOf(files) };
}
