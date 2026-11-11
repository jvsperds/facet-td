import type { GameData } from '../data';
import { readHeroCatalog } from './hero';

/**
 * What a run is started with. Fixed for the whole run; part of saves and the state hash.
 *
 * - `difficulty` indexes gem_difficulty (creep HP) and gem_difficulty_speed (creep speed). The
 *   original picked the index from the player count (`gem_nandu`, line 3381), so 1 is the original
 *   single-player value.
 * - `hero` is a hero_sea key (h101..h4xx). Heroes are skins; the skills are the real unlocks.
 * - `skills` maps an ability_sea key (a101..a4xx) or a gemtd_hero_* name to a level 1..MaxLevel;
 *   the original allowed one to four skill slots.
 * - `sandbox` keeps the free hero loadout (`hero-loadout` commands) for development and tests.
 */
export interface RunConfig {
  difficulty: 1 | 2 | 3 | 4;
  hero: string | null;
  skills: Record<string, number>;
  sandbox?: boolean;
}

export const DEFAULT_CONFIG: Readonly<RunConfig> = Object.freeze({
  difficulty: 1,
  hero: null,
  skills: {},
});
export const MAX_SKILLS = 4;

export class RunConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunConfigError';
  }
}

/** Fill defaults and check a run config against the data; throws RunConfigError when invalid. */
export function resolveConfig(data: GameData, input: Partial<RunConfig> = {}): RunConfig {
  const config: RunConfig = {
    difficulty: input.difficulty ?? DEFAULT_CONFIG.difficulty,
    hero: input.hero ?? null,
    skills: { ...(input.skills ?? {}) },
    ...(input.sandbox ? { sandbox: true } : {}),
  };
  if (![1, 2, 3, 4].includes(config.difficulty))
    throw new RunConfigError(`Difficulty must be 1, 2, 3 or 4 (got ${String(config.difficulty)}).`);
  const catalog = readHeroCatalog(data);
  if (config.hero !== null && !catalog.heroes[config.hero])
    throw new RunConfigError(`Unknown hero "${config.hero}".`);
  const entries = Object.entries(config.skills);
  if (entries.length > MAX_SKILLS)
    throw new RunConfigError(`At most ${MAX_SKILLS} hero skills (got ${entries.length}).`);
  if (entries.length && config.hero === null) throw new RunConfigError('Hero skills need a hero.');
  const defs = (
    data.files['npc/abilities.json'] as { DOTAAbilities: Record<string, { MaxLevel?: string }> }
  ).DOTAAbilities;
  const names = new Set<string>();
  for (const [key, level] of entries) {
    const name = skillName(data, key);
    if (!name) throw new RunConfigError(`Unknown hero skill "${key}".`);
    if (names.has(name)) throw new RunConfigError(`Hero skill "${key}" is listed twice.`);
    names.add(name);
    const max = Number(defs[name]?.MaxLevel ?? 1);
    if (!Number.isInteger(level) || level < 1 || level > max)
      throw new RunConfigError(
        `Hero skill "${key}" level must be 1..${max} (got ${String(level)}).`,
      );
  }
  return config;
}

/** The gemtd_hero_* ability for a skill key or name, or undefined. */
export function skillName(data: GameData, key: string): string | undefined {
  const abilities = readHeroCatalog(data).abilities;
  const name = abilities[key] ?? key;
  return Object.values(abilities).includes(name) ? name : undefined;
}

/** The config's skills keyed by ability name, as the hero state holds them. */
export function configAbilities(data: GameData, config: RunConfig): Record<string, number> {
  return Object.fromEntries(
    Object.entries(config.skills).map(([key, level]) => [skillName(data, key)!, level]),
  );
}
