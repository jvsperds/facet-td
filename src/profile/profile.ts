import type { GameData } from '../data';
import { resolveConfig, type RunConfig } from '../sim/config';
import { readHeroCatalog } from '../sim/hero';
import { ECONOMY, shellReward } from './economy';

export const PROFILE_KEY = 'facet-td:profile';
export const RUN_CONFIG_KEY = 'facet-td:run-config';
export const PROFILE_VERSION = 1;

export interface PlayerProfile {
  version: typeof PROFILE_VERSION;
  shells: number;
  heroes: string[];
  /** Owned ability-sea keys and their levels. */
  skills: Record<string, number>;
  slots: 1 | 2 | 3 | 4;
  selectedHero: string;
  selectedSkills: string[];
  /** Final-state fingerprints already paid, preventing refreshes from duplicating rewards. */
  rewardedRuns: string[];
  completedQuests: string[];
  claimedQuests: string[];
}

type BoxKind = 'hero' | 'skill';
export interface BoxResult {
  kind: BoxKind;
  id: string;
  tier: number;
  duplicate: boolean;
  level?: number;
  refund: number;
}

const tierOf = (id: string) => Number(/^[ha]([1-4])/.exec(id)?.[1] ?? 1);
const supportedSkillKeys = (data: GameData) => {
  const catalog = readHeroCatalog(data);
  const supported = new Set(catalog.supported);
  return Object.keys(catalog.abilities).filter((key) => supported.has(catalog.abilities[key]));
};

export function defaultProfile(data: GameData): PlayerProfile {
  const catalog = readHeroCatalog(data);
  const hero = Object.keys(catalog.heroes)[0];
  const skill = supportedSkillKeys(data)[0];
  return {
    version: PROFILE_VERSION,
    shells: 0,
    heroes: hero ? [hero] : [],
    skills: skill ? { [skill]: 1 } : {},
    slots: 1,
    selectedHero: hero ?? '',
    selectedSkills: skill ? [skill] : [],
    rewardedRuns: [],
    completedQuests: [],
    claimedQuests: [],
  };
}

export function normalizeProfile(data: GameData, input: unknown): PlayerProfile {
  const fallback = defaultProfile(data);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fallback;
  const raw = input as Partial<PlayerProfile>;
  const catalog = readHeroCatalog(data);
  const heroIds = new Set(Object.keys(catalog.heroes));
  const skillIds = new Set(supportedSkillKeys(data));
  const heroes = Array.isArray(raw.heroes)
    ? [
        ...new Set(
          raw.heroes.filter((id): id is string => typeof id === 'string' && heroIds.has(id)),
        ),
      ]
    : [];
  if (!heroes.length) heroes.push(...fallback.heroes);
  const skills = Object.fromEntries(
    Object.entries(raw.skills ?? {}).filter(
      ([id, level]) => skillIds.has(id) && Number.isInteger(level) && level >= 1 && level <= 4,
    ),
  ) as Record<string, number>;
  if (!Object.keys(skills).length) Object.assign(skills, fallback.skills);
  const slots = ([1, 2, 3, 4].includes(Number(raw.slots)) ? Number(raw.slots) : 1) as 1 | 2 | 3 | 4;
  const selectedHero = heroes.includes(raw.selectedHero ?? '') ? raw.selectedHero! : heroes[0];
  const selectedSkills = Array.isArray(raw.selectedSkills)
    ? [
        ...new Set(
          raw.selectedSkills.filter((id): id is string => typeof id === 'string' && id in skills),
        ),
      ].slice(0, slots)
    : [];
  return {
    version: PROFILE_VERSION,
    shells: Number.isSafeInteger(raw.shells) && raw.shells! >= 0 ? raw.shells! : 0,
    heroes,
    skills,
    slots,
    selectedHero,
    selectedSkills,
    rewardedRuns: Array.isArray(raw.rewardedRuns)
      ? raw.rewardedRuns.filter((id): id is string => typeof id === 'string').slice(-50)
      : [],
    completedQuests: Array.isArray(raw.completedQuests)
      ? [...new Set(raw.completedQuests.filter((id): id is string => typeof id === 'string'))]
      : [],
    claimedQuests: Array.isArray(raw.claimedQuests)
      ? [...new Set(raw.claimedQuests.filter((id): id is string => typeof id === 'string'))]
      : [],
  };
}

export function loadProfile(data: GameData): PlayerProfile {
  try {
    return normalizeProfile(data, JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null'));
  } catch {
    return defaultProfile(data);
  }
}

export function saveProfile(profile: PlayerProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // The profile remains usable for this page when storage is unavailable.
  }
}

export function profileRunConfig(data: GameData, profile: PlayerProfile): RunConfig {
  return resolveConfig(data, {
    hero: profile.selectedHero || null,
    skills: Object.fromEntries(
      profile.selectedSkills.slice(0, profile.slots).map((id) => [id, profile.skills[id]]),
    ),
  });
}

export function storeRunConfig(config: RunConfig) {
  try {
    localStorage.setItem(RUN_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Starting with the default config is still possible without storage.
  }
}

export function loadRunConfig(data: GameData): RunConfig {
  try {
    const raw = localStorage.getItem(RUN_CONFIG_KEY);
    return raw ? resolveConfig(data, JSON.parse(raw)) : profileRunConfig(data, loadProfile(data));
  } catch {
    return profileRunConfig(data, defaultProfile(data));
  }
}

const tierFromRoll = (odds: readonly number[], roll: number) => {
  let edge = 0;
  for (let i = 0; i < odds.length; i++) {
    edge += odds[i];
    if (roll <= edge) return i + 1;
  }
  return odds.length;
};

/** Buy and open a box. Rolls are injectable for deterministic tests and use 1..100 / 0..1. */
export function openBox(
  data: GameData,
  profile: PlayerProfile,
  kind: BoxKind,
  tierRoll = Math.floor(Math.random() * 100) + 1,
  itemRoll = Math.random(),
): BoxResult {
  const box = ECONOMY.boxes[kind];
  if (profile.shells < box.cost) throw new Error(`A ${kind} box costs ${box.cost} shells.`);
  if (
    !Number.isInteger(tierRoll) ||
    tierRoll < 1 ||
    tierRoll > 100 ||
    itemRoll < 0 ||
    itemRoll >= 1
  )
    throw new RangeError('Invalid box roll.');
  const catalog = readHeroCatalog(data);
  const ids = (kind === 'hero' ? Object.keys(catalog.heroes) : supportedSkillKeys(data)).filter(
    (id) => tierOf(id) === tierFromRoll(box.tierOdds, tierRoll),
  );
  if (!ids.length) throw new Error(`No tier result for ${kind} box.`);
  const id = ids[Math.floor(itemRoll * ids.length)];
  profile.shells -= box.cost;
  let duplicate: boolean;
  let refund = 0,
    level: number | undefined;
  if (kind === 'hero') {
    duplicate = profile.heroes.includes(id);
    if (duplicate) profile.shells += refund = box.duplicateRefund;
    else profile.heroes.push(id);
  } else {
    duplicate = id in profile.skills;
    if (!duplicate) profile.skills[id] = 1;
    else if (profile.skills[id] < ECONOMY.maxSkillLevel) profile.skills[id]++;
    else profile.shells += refund = box.duplicateRefund;
    level = profile.skills[id];
  }
  saveProfile(profile);
  return { kind, id, tier: tierOf(id), duplicate, level, refund };
}

export function buySkillSlot(profile: PlayerProfile) {
  if (profile.slots >= 4) throw new Error('All skill slots are unlocked.');
  const cost = ECONOMY.slotCosts[profile.slots - 1];
  if (profile.shells < cost) throw new Error(`The next skill slot costs ${cost} shells.`);
  profile.shells -= cost;
  profile.slots = (profile.slots + 1) as 2 | 3 | 4;
  saveProfile(profile);
  return cost;
}

export function claimRunReward(
  profile: PlayerProfile,
  runId: string,
  wavesCleared: number,
  difficulty: 1 | 2 | 3 | 4,
) {
  if (profile.rewardedRuns.includes(runId)) return 0;
  const shells = shellReward(wavesCleared, difficulty);
  profile.rewardedRuns = [...profile.rewardedRuns.slice(-49), runId];
  profile.shells += shells;
  saveProfile(profile);
  return shells;
}

export function completeProfileQuests(profile: PlayerProfile, ids: readonly string[]) {
  profile.completedQuests = [...new Set([...profile.completedQuests, ...ids])];
  saveProfile(profile);
}

export function claimQuest(profile: PlayerProfile, id: string) {
  if (!profile.completedQuests.includes(id) || profile.claimedQuests.includes(id)) return 0;
  const tier = Math.max(1, Math.min(3, Number(id[1]) || 1));
  const reward = ECONOMY.questRewards[tier - 1];
  profile.claimedQuests.push(id);
  profile.shells += reward;
  saveProfile(profile);
  return reward;
}
