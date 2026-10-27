import type { GameData } from '../data';
import type { Cell } from './board';
import type { Gem, Phase } from './game';

export type ProgressionState = { phase: Phase; gems: Gem[]; draft: number[]; gold: number };
export type RecipeKind = 'normal' | 'draft' | 'secret' | 'tablet' | 'tablet-upgrade';
export type Recipe = { kind: RecipeKind; result: string; ingredients: string[] };
export type Plan =
  | {
      ok: true;
      result: string;
      consume: number[];
      kind: RecipeKind | 'keep' | 'downgrade';
      endDraft: boolean;
      placement: 'anchor' | 'separate';
    }
  | { ok: false; reason: string };

/** Recipe tables are the loaded baseline or Facet data, not a second copy of the rules. */
export function readRecipes(data: GameData): Recipe[] {
  const lua = data.files['lua/addon_game_mode.json'] as Record<string, { value: unknown }>;
  const table = (key: string) => lua[key].value as Record<string, string[]>;
  const recipes: Recipe[] = [];
  for (const [key, kind] of [
    ['gemtd_merge', 'normal'],
    ['gemtd_merge', 'draft'],
    ['gemtd_merge_secret', 'secret'],
    ['gemtd_merge_shiban', 'tablet'],
  ] as const)
    for (const [result, ingredients] of Object.entries(table(key)))
      recipes.push({ kind, result, ingredients: [...ingredients] });
  for (const [ingredient, result] of Object.entries(
    lua.gemtd_merge_shiban_update.value as Record<string, string>,
  ))
    recipes.push({
      kind: 'tablet-upgrade',
      result,
      ingredients: [ingredient, ingredient, ingredient],
    });
  return recipes;
}

const fail = (reason: string): Plan => ({ ok: false, reason });
const units = (data: GameData) =>
  (data.files['npc/units.json'] as { DOTAUnits: Record<string, unknown> }).DOTAUnits;
const draftReady = (state: ProgressionState, id: number) =>
  state.phase === 'build' &&
  state.draft.length === 5 &&
  new Set(state.draft).size === 5 &&
  state.draft.includes(id) &&
  state.draft.every((d) => state.gems.some((g) => g.id === d));
const aligned = (a: Cell, b: Cell, c: Cell) => {
  const x = b.x - a.x,
    y = b.y - a.y;
  return (
    (x !== 0 || y !== 0) &&
    Math.abs(x) <= 1 &&
    Math.abs(y) <= 1 &&
    c.x === a.x - x &&
    c.y === a.y - y
  );
};

export function planCombine(
  data: GameData,
  state: ProgressionState,
  anchorId: number,
  kind: RecipeKind,
  result: string,
): Plan {
  const recipe = readRecipes(data).find((r) => r.kind === kind && r.result === result);
  const anchor = state.gems.find((g) => g.id === anchorId);
  if (!recipe || !anchor || !units(data)[result]) return fail('Unknown recipe or selected gem.');
  if (kind === 'normal' && (state.phase !== 'wave' || state.draft.includes(anchorId)))
    return fail('Kept towers combine during a wave.');
  if ((kind === 'draft' || kind === 'secret' || kind === 'tablet') && !draftReady(state, anchorId))
    return fail('A complete draft and selected draft gem are required.');
  if (
    kind === 'tablet-upgrade' &&
    (state.phase === 'lost' || state.phase === 'won' || state.draft.includes(anchorId))
  )
    return fail('Select a placed tablet.');
  const pool = state.gems
    .filter((g) =>
      kind === 'draft' || kind === 'secret' || kind === 'tablet'
        ? state.draft.includes(g.id)
        : !state.draft.includes(g.id),
    )
    .sort((a, b) => a.id - b.id);
  const remaining = [...recipe.ingredients];
  const index = remaining.indexOf(anchor.name);
  if (index < 0) return fail('Selected gem is not an ingredient.');
  remaining.splice(index, 1);
  const chosen = [anchor];
  for (const name of remaining) {
    const gem = pool.find((g) => g.name === name && !chosen.some((c) => c.id === g.id));
    if (!gem) return fail('Missing ingredients.');
    chosen.push(gem);
  }
  if (kind === 'tablet-upgrade') {
    const candidates = pool.filter((g) => g.name === anchor.name && g.id !== anchorId);
    const pair = candidates.flatMap((a) =>
      candidates
        .filter((b) => b.id !== a.id && aligned(anchor.cell, a.cell, b.cell))
        .map((b) => [a, b]),
    )[0];
    if (!pair) return fail('Tablet upgrades need three adjacent tablets in a line.');
    chosen.splice(1, 2, ...pair);
  }
  const endDraft = kind === 'draft' || kind === 'secret' || kind === 'tablet';
  return {
    ok: true,
    result,
    consume: endDraft ? [...state.draft] : chosen.map((g) => g.id),
    kind,
    endDraft,
    placement: kind === 'tablet' ? 'separate' : 'anchor',
  };
}

export function combineOptions(
  data: GameData,
  state: ProgressionState,
  anchorId: number,
): Extract<Plan, { ok: true }>[] {
  return readRecipes(data).flatMap((r) => {
    const plan = planCombine(data, state, anchorId, r.kind, r.result);
    return plan.ok ? [plan] : [];
  });
}

export function resolveKeepUpgrade(
  data: GameData,
  state: ProgressionState,
  id: number,
  steps: 0 | 1 | 2,
): Plan {
  if (!draftReady(state, id)) return fail('A complete draft and selected draft gem are required.');
  const gem = state.gems.find((g) => g.id === id)!;
  if (!/^gemtd_[bdqegyrp]1{1,6}$/.test(gem.name)) return fail('Selected gem cannot be upgraded.');
  const count = state.gems.filter((g) => state.draft.includes(g.id) && g.name === gem.name).length;
  if (count < (steps === 2 ? 4 : steps === 1 ? 2 : 1))
    return fail('Not enough identical draft gems.');
  const result =
    steps === 2 && gem.name.endsWith('11111') && !gem.name.endsWith('111111')
      ? 'gemtd_zhenjiazhishi'
      : gem.name + '1'.repeat(steps);
  if (!units(data)[result]) return fail('Upgrade result is unavailable.');
  return {
    ok: true,
    result,
    consume: [...state.draft],
    kind: 'keep',
    endDraft: true,
    placement: 'anchor',
  };
}

/** roll is an externally supplied integer in 1..100; Lua chooses the downgrade randomly. */
export function planDowngrade(
  data: GameData,
  state: ProgressionState,
  id: number,
  roll: number,
): Plan {
  if (!draftReady(state, id)) return fail('A complete draft and selected draft gem are required.');
  const gem = state.gems.find((g) => g.id === id)!;
  const match = /^gemtd_[bdqegyrp](1{2,6})$/.exec(gem.name);
  if (!match || !Number.isInteger(roll) || roll < 1 || roll > 100)
    return fail('Invalid gem or downgrade roll.');
  const tier = match[1].length;
  const removed =
    tier === 2
      ? 1
      : tier === 3
        ? roll > 66
          ? 2
          : 1
        : tier === 4
          ? roll > 80
            ? 3
            : roll > 50
              ? 2
              : 1
          : tier === 5
            ? roll > 90
              ? 4
              : roll > 75
                ? 3
                : roll > 50
                  ? 2
                  : 1
            : Math.ceil(roll / 20);
  const result = gem.name.slice(0, -removed);
  if (!units(data)[result]) return fail('Downgrade result is unavailable.');
  return {
    ok: true,
    result,
    consume: [...state.draft],
    kind: 'downgrade',
    endDraft: true,
    placement: 'anchor',
  };
}
