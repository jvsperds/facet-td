import { signal, useSignal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import type { GameData } from '../data';
import type { Game } from '../sim/game';
import { readRecipes, type Recipe } from '../sim/progression';
import { TowerIcon } from './TowerIcon';
import { Icon } from './icons';
import { code, displayName, gemType } from './names';

// Recipe book drawer (inspired by GemTD's Recipes / Pedals tabs): every Classic recipe with its
// ingredients, marking the ones currently on the board and how many of each you hold. Searchable
// by result or ingredient name. Recipes can be pinned to a tracker beside the board; a recipe
// whose ingredients are all on the board is highlighted as ready to combine.

const PIN_KEY = 'facet-td:pinned-recipes';
const recipeKey = (r: Recipe) => `${r.kind}:${r.result}`;
const loadPins = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(PIN_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
};
/** Pinned recipe keys (`kind:result`), kept in this browser. */
export const pinned = signal<string[]>(typeof localStorage === 'undefined' ? [] : loadPins());
export function togglePin(key: string) {
  pinned.value = pinned.value.includes(key)
    ? pinned.value.filter((k) => k !== key)
    : [...pinned.value, key];
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(pinned.value));
  } catch {
    // Storage unavailable (private window): pins last for this session only.
  }
}
/** Every gem a pinned recipe still calls for, for the board's highlights. */
export function pinnedIngredients(data: GameData, keys: readonly string[]) {
  const recipes = readRecipes(data);
  return new Set(keys.flatMap((k) => recipes.find((r) => recipeKey(r) === k)?.ingredients ?? []));
}
/** How many gems of each name are on the board. */
const counts = (onBoard: readonly string[]) => {
  const out = new Map<string, number>();
  for (const n of onBoard) out.set(n, (out.get(n) ?? 0) + 1);
  return out;
};

type Tab = 'towers' | 'secret' | 'pedals';
const TABS: [Tab, string][] = [
  ['towers', 'Towers'],
  ['secret', 'Secret'],
  ['pedals', 'Pedals'],
];
const tabOf = (r: Recipe): Tab | null =>
  r.kind === 'normal'
    ? 'towers'
    : r.kind === 'secret'
      ? 'secret'
      : r.kind === 'tablet'
        ? 'pedals'
        : null;

/** Which ingredients are on the board, matching each placed gem at most once. */
export function owned(ingredients: readonly string[], onBoard: readonly string[]) {
  const pool = [...onBoard];
  return ingredients.map((name) => {
    const i = pool.indexOf(name);
    if (i < 0) return false;
    pool.splice(i, 1);
    return true;
  });
}

/** The recipes a gem goes into, best progress first (inspector "Builds into"). */
export function recipesUsing(data: GameData, name: string, onBoard: readonly string[]) {
  return readRecipes(data)
    .filter((r) => (r.kind === 'normal' || r.kind === 'secret') && r.ingredients.includes(name))
    .map((r) => ({ recipe: r, have: owned(r.ingredients, onBoard) }))
    .sort(
      (a, b) =>
        b.have.filter(Boolean).length / b.have.length -
          a.have.filter(Boolean).length / a.have.length ||
        a.recipe.result.localeCompare(b.recipe.result),
    );
}

export function Ingredient({
  data,
  name,
  have,
  count = 0,
}: {
  data: GameData;
  name: string;
  have: boolean;
  /** How many of this gem are on the board. */
  count?: number;
}) {
  const label = displayName(data, name);
  const type = gemType(name);
  return (
    <span
      class={`chip ${have ? 'have' : ''} ${type ? `gem-${type}` : ''}`}
      title={`${label}: ${count} on the board`}
    >
      <TowerIcon name={name} class="glyph mini" />
      {type ? code(name) : label}
      {count > 0 && <span class="count tabular">×{count}</span>}
    </span>
  );
}

/** One recipe row: result, progress, ingredients with counts, and its pin. */
function RecipeRow({
  data,
  r,
  onBoard,
}: {
  data: GameData;
  r: Recipe;
  onBoard: readonly string[];
}) {
  const have = owned(r.ingredients, onBoard);
  const held = counts(onBoard);
  const done = have.filter(Boolean).length;
  const ready = done === have.length;
  const key = recipeKey(r);
  const isPinned = pinned.value.includes(key);
  const name = displayName(data, r.result);
  return (
    <li class={`recipe ${ready ? 'ready' : ''}`} key={key}>
      <span class="recipe-icon">
        <TowerIcon name={r.result} />
      </span>
      <span class="recipe-body">
        <span class="recipe-name">
          {name}
          {ready && <span class="chip ready-chip">Ready</span>}
          <span class="progress tabular">
            {done}/{have.length}
          </span>
        </span>
        <span class="chips">
          {r.ingredients.map((n, i) => (
            <Ingredient data={data} name={n} have={have[i]} count={held.get(n) ?? 0} />
          ))}
        </span>
      </span>
      <button
        class={`icon-button pin ${isPinned ? 'on' : ''}`}
        aria-label={isPinned ? `Unpin ${name}` : `Pin ${name}`}
        aria-pressed={isPinned}
        onClick={() => togglePin(key)}
      >
        <Icon name="pin" />
      </button>
    </li>
  );
}

/** Pinned recipes beside the board: progress at a glance, highlighted when ready to combine. */
export function PinnedRecipes({ data, game }: { data: GameData; game: Game }) {
  const recipes = useMemo(() => readRecipes(data), [data]);
  const list = pinned.value
    .map((k) => recipes.find((r) => recipeKey(r) === k))
    .filter((r): r is Recipe => !!r);
  if (!list.length) return null;
  const onBoard = game.gems.map((g) => g.name);
  return (
    <section class="panel pinned" aria-label="Pinned recipes">
      <h2 class="section-label">Pinned</h2>
      <ul class="recipe-list" role="list">
        {list.map((r) => (
          <RecipeRow key={recipeKey(r)} data={data} r={r} onBoard={onBoard} />
        ))}
      </ul>
    </section>
  );
}

export function RecipeBook({
  data,
  game,
  close,
}: {
  data: GameData;
  game: Game;
  close: () => void;
}) {
  const tab = useSignal<Tab>('towers');
  const query = useSignal('');
  const recipes = useMemo(() => readRecipes(data), [data]);
  const onBoard = game.gems.map((g) => g.name);
  const q = query.value.trim().toLowerCase();
  const rows = recipes
    .filter((r) => tabOf(r) === tab.value)
    .filter(
      (r) =>
        !q ||
        [r.result, ...r.ingredients].some(
          (n) => displayName(data, n).toLowerCase().includes(q) || code(n).toLowerCase() === q,
        ),
    )
    .map((r) => ({ r, have: owned(r.ingredients, onBoard) }))
    .sort(
      (a, b) =>
        b.have.filter(Boolean).length - a.have.filter(Boolean).length ||
        displayName(data, a.r.result).localeCompare(displayName(data, b.r.result)),
    );
  return (
    <section class="panel drawer" data-exclude aria-label="Recipe book">
      <div class="drawer-head">
        <h2 class="panel-title">Recipes</h2>
        <button class="icon-button" aria-label="Close recipes" onClick={close}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div class="tabs" role="tablist" aria-label="Recipe type">
        {TABS.map(([id, label]) => (
          <button
            role="tab"
            aria-selected={tab.value === id}
            class={tab.value === id ? 'active' : ''}
            onClick={() => (tab.value = id)}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        class="search"
        type="search"
        placeholder="Search recipes or ingredients"
        aria-label="Search recipes"
        value={query.value}
        onInput={(e) => (query.value = e.currentTarget.value)}
      />
      <ul class="recipe-list" role="list">
        {rows.map(({ r }) => (
          <RecipeRow key={recipeKey(r)} data={data} r={r} onBoard={onBoard} />
        ))}
        {rows.length === 0 && <li class="muted">No recipe matches “{query.value}”.</li>}
      </ul>
    </section>
  );
}
