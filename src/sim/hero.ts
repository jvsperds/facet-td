import type { GameData } from '../data';

const HZ = 30;
type Definition = {
  AbilityCooldown?: string;
  MaxLevel?: string;
  AbilityValues?: Record<string, string>;
};
type LuaData = {
  hero_sea: { value: Record<string, string> };
  ability_sea: { value: Record<string, string> };
};
export type HeroState = {
  selected: string;
  abilities: Record<string, number>;
  cooldowns: Record<string, number>;
};
export type HeroContext = {
  gold: number;
  phase: string;
  buildReady: boolean;
  castleHp: number;
  castleMaxHp: number;
  target?: {
    id: number;
    attackDamage: number;
    friendly: boolean;
    hero?: boolean;
    slab?: boolean;
    castle?: boolean;
    owned?: boolean;
  };
  point?: { x: number; y: number };
  race?: boolean;
};
export type HeroEffect =
  | { kind: 'heal'; amount: number }
  | { kind: 'castleBuff'; buff: 'evasion' | 'guard'; amount: number; duration: number }
  | { kind: 'rewindDraft' }
  | { kind: 'swap'; target: number }
  | { kind: 'swapNearbyStone'; target: number; radius: number }
  | { kind: 'stoneLine'; count: number }
  | { kind: 'whirlwind'; point: { x: number; y: number }; radius: number }
  | { kind: 'beacon'; point: { x: number; y: number }; enemyRadius: number; friendlyRadius: number }
  | { kind: 'lastStand'; target: number; level: number }
  | { kind: 'prayer'; color?: number; quality?: string; chance: number }
  | {
      kind: 'towerBuff';
      target: number;
      ability: string;
      duration: number;
      values: Record<string, number>;
    };
export type HeroPlan =
  | { ok: false; reason: string }
  | { ok: true; cost: number; cooldownUntil: number; effect: HeroEffect };

const colors: Record<string, number> = {
  lanse: 1,
  baise: 2,
  fense: 3,
  danbai: 4,
  lvse: 5,
  huangse: 6,
  hongse: 7,
  zise: 8,
};
const qualities: Record<string, string> = { putong: '111', wuxia: '1111', wanmei: '11111' };
const buffs = ['kuaisusheji', 'baoji', 'miaozhun', 'lianjie'];
const supported = new Set(
  [
    'huichun',
    'shanbi',
    'shouhu',
    'huidaoguoqu',
    ...Object.keys(colors),
    ...Object.keys(qualities),
    ...buffs,
    'yixinghuanwei',
    'qingyi',
    'shitou',
    'xuanfeng',
    'guangzhudaobiao',
    'beishuiyizhan',
  ].map((s) => `gemtd_hero_${s}`),
);

/** Hero IDs and skill IDs are independent; the original service supplied hero skills. */
export function readHeroCatalog(data: GameData) {
  const lua = data.files['lua/addon_game_mode.json'] as LuaData;
  return {
    heroes: { ...lua.hero_sea.value },
    abilities: { ...lua.ability_sea.value },
    supported: [...supported],
    ownership: 'offline-free' as const,
  };
}

export function listHeroActions(data: GameData, state: HeroState) {
  const catalog = readHeroCatalog(data);
  if (!catalog.heroes[state.selected]) return [];
  return Object.entries(state.abilities)
    .filter(([name, level]) => Object.values(catalog.abilities).includes(name) && level > 0)
    .map(([name, level]) => ({ name, level, supported: supported.has(name) }));
}

function value(raw: string | undefined, level: number): number {
  const values = raw?.trim().split(/\s+/).map(Number) ?? [];
  return values.length === 1 ? values[0] : values[level - 1];
}

/** Roll is the original inclusive integer roll, supplied by the deterministic simulation. */
export function adjustDraftOdds<T extends { color: number; quality: string }>(
  draft: T,
  prayer: { color?: number; quality?: string; chance: number },
  roll: number,
  perfected = false,
): T {
  if (!Number.isInteger(roll) || roll < 1 || roll > 100)
    throw new RangeError('roll must be 1..100');
  if (roll >= prayer.chance || (prayer.quality !== undefined && perfected)) return { ...draft };
  return {
    ...draft,
    ...(prayer.color !== undefined ? { color: prayer.color } : {}),
    ...(prayer.quality !== undefined ? { quality: prayer.quality } : {}),
  };
}

export function planHeroAction(
  data: GameData,
  state: HeroState,
  action: string,
  context: HeroContext,
  tick: number,
  roll?: number,
): HeroPlan {
  const fail = (reason: string): HeroPlan => ({ ok: false, reason });
  if (!listHeroActions(data, state).some((a) => a.name === action)) return fail('unavailable');
  if (!supported.has(action)) return fail('unsupported');
  const def = (data.files['npc/abilities.json'] as { DOTAAbilities: Record<string, Definition> })
    .DOTAAbilities[action];
  const level = state.abilities[action];
  if (!def || !Number.isInteger(level) || level < 1 || level > Number(def.MaxLevel))
    return fail('invalid level');
  if ((state.cooldowns[action] ?? 0) > tick) return fail('cooldown');
  const values = def.AbilityValues ?? {};
  const cost = value(values.cost, level);
  const cooldown = value(def.AbilityCooldown, level);
  if (!Number.isFinite(cost) || !Number.isFinite(cooldown)) return fail('missing data');
  if (context.gold < cost) return fail('gold');
  const key = action.slice('gemtd_hero_'.length);
  let effect: HeroEffect;
  if (key === 'huichun') {
    const max = value(values.max_heal, level);
    if (!Number.isInteger(roll) || roll! < 1 || roll! > max) return fail('roll');
    effect = {
      kind: 'heal',
      amount: Math.min(roll!, Math.max(0, context.castleMaxHp - context.castleHp)),
    };
  } else if (key === 'shanbi' || key === 'shouhu') {
    effect = {
      kind: 'castleBuff',
      buff: key === 'shanbi' ? 'evasion' : 'guard',
      amount: value(values[key === 'shanbi' ? 'possibility' : 'shouhu_amount'], level),
      duration: 60 * HZ,
    };
  } else if (key === 'huidaoguoqu') {
    if (context.phase !== 'build' || context.buildReady) return fail('phase');
    effect = { kind: 'rewindDraft' };
  } else if (key in colors || key in qualities) {
    effect = {
      kind: 'prayer',
      ...(key in colors ? { color: colors[key] } : { quality: qualities[key] }),
      chance: value(values.gailv, level),
    };
  } else if (key === 'yixinghuanwei' || key === 'qingyi' || key === 'beishuiyizhan') {
    const target = context.target;
    if (
      !target ||
      !target.friendly ||
      (key !== 'beishuiyizhan' && (target.castle || target.slab)) ||
      (key === 'yixinghuanwei' ? target.hero : target.attackDamage < 1) ||
      (context.race && key !== 'beishuiyizhan' && !target.owned)
    )
      return fail('target');
    effect =
      key === 'yixinghuanwei'
        ? { kind: 'swap', target: target.id }
        : key === 'qingyi'
          ? { kind: 'swapNearbyStone', target: target.id, radius: 192 }
          : { kind: 'lastStand', target: target.id, level };
  } else if (key === 'shitou') {
    effect = { kind: 'stoneLine', count: value(values.stone_max_count, level) };
  } else if (key === 'xuanfeng' || key === 'guangzhudaobiao') {
    if (!context.point || !Number.isFinite(context.point.x) || !Number.isFinite(context.point.y))
      return fail('point');
    effect =
      key === 'xuanfeng'
        ? { kind: 'whirlwind', point: context.point, radius: 192 }
        : { kind: 'beacon', point: context.point, enemyRadius: 192, friendlyRadius: 58 };
  } else {
    if (!context.target || !context.target.friendly || context.target.attackDamage < 1)
      return fail('target');
    effect = {
      kind: 'towerBuff',
      target: context.target.id,
      ability: action,
      duration: value(values.last_time, level) * HZ,
      values: Object.fromEntries(
        Object.entries(values)
          .filter(([k]) => k !== 'cost' && k !== 'last_time')
          .map(([k, v]) => [k, value(v, level)]),
      ),
    };
  }
  return { ok: true, cost, cooldownUntil: tick + cooldown * HZ, effect };
}
