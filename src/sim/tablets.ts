import type { GameData } from '../data';
import { CELL_UNITS, type Cell } from './board';

const HZ = 30;
type Definition = { AbilityValues?: Record<string, string>; AbilityDamage?: string };
export type TabletCreep = {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  fly?: boolean;
  boss?: boolean;
};
export type TabletCell = Cell & { cooldownUntil?: number; level?: number };
export type TabletOperation = {
  kind: 'targets' | 'area' | 'line' | 'bounce' | 'friendlyAura';
  target?: number;
  x?: number;
  y?: number;
  radius?: number;
  limit?: number;
  duration?: number;
  slowPct?: number;
  decaySlow?: boolean;
  armor?: number;
  mr?: number;
  incomingDamagePct?: number;
  speedPct?: number;
  damagePct?: number;
  damage?: number;
  damageType?: 'magical' | 'physical';
  stun?: number;
  delay?: number;
  speed?: number;
  distance?: number;
  bounces?: number;
  bounceDelay?: number;
  magicImmune?: boolean;
  selectionDelay?: [number, number];
  modifier?: string;
};
export type TabletPlan =
  | { ok: false; reason: string }
  | {
      ok: true;
      cooldown: number;
      cooldownUntil: number;
      target: number;
      triggerChainFrost: { radius: number; chance: number };
      plans: TabletOperation[];
    };

/** Lua lines 1858-1883 map tablet unit names to spells. Level 4 is the one-player map. */
export function readTabletSpell(data: GameData, name: string, level = 4) {
  const list = (
    data.files['lua/addon_game_mode.json'] as {
      shiban_ability_list?: { value: Record<string, string> };
    }
  )?.shiban_ability_list?.value;
  const spell = list?.[name];
  const definitions = (
    data.files['npc/abilities.json'] as { DOTAAbilities?: Record<string, Definition> }
  )?.DOTAAbilities;
  const def = spell ? definitions?.[spell] : undefined;
  if (!spell || !def || !Number.isInteger(level) || level < 1 || level > 4) return undefined;
  const values: Record<string, number> = {};
  for (const [key, raw] of Object.entries(def.AbilityValues ?? {})) {
    const parts = raw.trim().split(/\s+/).map(Number);
    const value = parts.length === 1 ? parts[0] : parts[level - 1];
    if (!Number.isFinite(value)) return undefined;
    values[key] = value;
  }
  const damageParts = def.AbilityDamage?.trim().split(/\s+/).map(Number);
  const damage =
    damageParts && (damageParts.length === 1 ? damageParts[0] : damageParts[level - 1]);
  if (damage !== undefined && !Number.isFinite(damage)) return undefined;
  return {
    name,
    spell,
    tier: name.endsWith('_jin') ? 3 : name.endsWith('_yin') ? 2 : 1,
    level,
    values,
    damage,
  };
}

/** Coordinates and radii use board cells; durations, delays and cooldowns use ticks. */
export function planTabletCast(
  data: GameData,
  name: string,
  cell: TabletCell,
  creeps: readonly TabletCreep[],
  tick: number,
): TabletPlan {
  const spell = readTabletSpell(data, name, cell.level ?? 4);
  if (!spell) return { ok: false, reason: 'unknown or invalid data' };
  if (!Number.isFinite(tick) || !Number.isFinite(cell.x) || !Number.isFinite(cell.y))
    return { ok: false, reason: 'invalid position or tick' };
  if ((cell.cooldownUntil ?? 0) > tick) return { ok: false, reason: 'cooldown' };
  // Lua 10735-10787: first living enemy within 128 world units; retries every 0.1 seconds.
  const target = creeps.find(
    (c) =>
      c.hp > 0 &&
      Number.isFinite(c.x) &&
      Number.isFinite(c.y) &&
      (c.x - cell.x) ** 2 + (c.y - cell.y) ** 2 <= 1,
  );
  if (!target) return { ok: false, reason: 'no target' };
  const v = spell.values,
    tier = spell.tier,
    t = (seconds: number) => seconds * HZ;
  const plans: TabletOperation[] = [];
  const at = { x: target.x, y: target.y };
  const sub = (key: string) => readTabletDefinition(data, key, spell.level);
  if (spell.spell.startsWith('new_youbu')) {
    const s = sub('new_youbu_sub');
    if (!s) return { ok: false, reason: 'missing subspell' };
    plans.push({
      kind: 'targets',
      ...at,
      radius: [192, 1024, 9999][tier - 1] / CELL_UNITS,
      limit: [1, 8, 64][tier - 1],
      stun: t(s.youbu_duration),
      magicImmune: true,
      selectionDelay: [0.01 * HZ, 0.5 * HZ],
      modifier: 'modifier_new_youbu',
    });
  } else if (spell.spell.startsWith('new_venomous_gale')) {
    plans.push({
      kind: 'line',
      ...at,
      radius: v.radius / CELL_UNITS,
      distance: v.distance / CELL_UNITS,
      speed: v.speed / CELL_UNITS / HZ,
      duration: t(v.duration),
      slowPct: v.movement_slow,
      decaySlow: true,
      damage: v.strike_damage,
      damageType: 'magical',
      modifier: 'modifier_venomous_gale_debuff_datadriven',
    });
  } else if (spell.spell.startsWith('new_torrent')) {
    plans.push({
      kind: 'area',
      ...at,
      radius: v.radius / CELL_UNITS,
      delay: t(v.delay),
      duration: t(v.slow_duration),
      slowPct: v.movespeed_bonus,
      stun: t(v.stun_duration),
      damage: spell.damage! / 2,
      damageType: 'magical',
      modifier: 'modifier_torrent_slow_debuff_datadriven',
    });
  } else if (spell.spell.startsWith('new_haojiao')) {
    plans.push({
      kind: 'friendlyAura',
      x: cell.x,
      y: cell.y,
      radius: v.aura_radius / CELL_UNITS,
      duration: t(v.howl_duration),
      damagePct: v.unit_bonus_damage,
      modifier: 'modifier_howl_unit_datadriven',
    });
  } else if (spell.spell.startsWith('new_acid_spray')) {
    plans.push({
      kind: 'area',
      ...at,
      radius: v.radius / CELL_UNITS,
      duration: t(v.duration),
      armor: v.armor_reduction,
      damage: v.damage,
      damageType: 'physical',
      magicImmune: true,
      modifier: tier === 1 ? 'modifier_acid_spray' : `modifier_acid_spray${tier}`,
    });
  } else if (spell.spell.startsWith('new_cask')) {
    const s = sub(tier === 1 ? 'new_cask' : `new_cask_sub${tier}`);
    if (!s) return { ok: false, reason: 'missing subspell' };
    plans.push({
      kind: 'bounce',
      target: target.id,
      ...at,
      radius: tier === 1 ? 0 : [0, 512, 1024][tier - 1] / CELL_UNITS,
      limit: [1, 3, 9][tier - 1],
      stun: t(s.creep_duration),
      bounces: s.bounces,
      distance: s.bounce_range / CELL_UNITS,
      speed: s.speed / CELL_UNITS / HZ,
      bounceDelay: t(s.bounce_delay),
      ...(tier > 1 ? { selectionDelay: [0.01 * HZ, 0.5 * HZ] as [number, number] } : {}),
    });
  } else if (spell.spell.startsWith('new_konghe')) {
    plans.push({
      kind: 'area',
      target: target.id,
      ...at,
      radius: [256, 512, 1024][tier - 1] / CELL_UNITS,
      duration: t(v.konghe_duration),
      incomingDamagePct: v.konghe_damage_per,
      speedPct: v.konghe_speed_per,
      speed: 1500 / CELL_UNITS / HZ,
      magicImmune: true,
      modifier: 'modifier_new_konghe',
    });
  } else if (spell.spell.startsWith('new_xuwu')) {
    plans.push({
      kind: 'area',
      ...at,
      radius: [256, 384, 512][tier - 1] / CELL_UNITS,
      duration: t(v.xuwu_duration),
      mr: v.xuwu_mokang_per,
      slowPct: v.xuwu_speed_per,
      modifier: 'modifier_new_xuwu',
    });
  } else return { ok: false, reason: 'unsupported spell' };
  if (
    plans.some((p) =>
      Object.values(p).some((value) => typeof value === 'number' && !Number.isFinite(value)),
    )
  )
    return { ok: false, reason: 'missing data' };
  // Lua 5475 and 10909 set a ten-second timer; TriggerShiban lines 10914-10937.
  return {
    ok: true,
    cooldown: 10 * HZ,
    cooldownUntil: tick + 10 * HZ,
    target: target.id,
    triggerChainFrost: { radius: 500 / CELL_UNITS, chance: [15, 30, 60][tier - 1] },
    plans,
  };
}

function readTabletDefinition(data: GameData, name: string, level: number) {
  const def = (data.files['npc/abilities.json'] as { DOTAAbilities: Record<string, Definition> })
    .DOTAAbilities[name];
  if (!def?.AbilityValues) return undefined;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(def.AbilityValues)) {
    const parts = raw.trim().split(/\s+/).map(Number);
    const n = parts.length === 1 ? parts[0] : parts[level - 1];
    if (!Number.isFinite(n)) return undefined;
    out[key] = n;
  }
  return out;
}
