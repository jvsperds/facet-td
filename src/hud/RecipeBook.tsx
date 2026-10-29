import { useSignal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import type { GameData } from '../data';
import type { Game } from '../sim/game';
import { readRecipes, type Recipe } from '../sim/progression';
import { GemGlyph } from './icons';
import { code, displayName, gemType, isTablet } from './names';

// Recipe book drawer (inspired by GemTD's Recipes / Pedals tabs): every Classic recipe with its
// ingredients, marking the ones currently on the board. Searchable by result or ingredient name.

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

export function Ingredient({ data, name, have }: { data: GameData; name: string; have: boolean }) {
  const label = displayName(data, name);
  const type = gemType(name);
  return (
    <span class={`chip ${have ? 'have' : ''} ${type ? `gem-${type}` : ''}`} title={label}>
      <GemGlyph type={type} class="glyph mini" />
      {type ? code(name) : label}
    </span>
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
        {rows.map(({ r, have }) => {
          const done = have.filter(Boolean).length;
          return (
            <li
              class={`recipe ${done === have.length ? 'ready' : ''}`}
              key={`${r.kind}:${r.result}`}
            >
              <span class="recipe-icon">
                {isTablet(r.result) ? (
                  <svg class="icon pedal-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 15 12 11l8 4-8 4z M12 11V5" />
                  </svg>
                ) : (
                  <GemGlyph />
                )}
              </span>
              <span class="recipe-body">
                <span class="recipe-name">
                  {displayName(data, r.result)}
                  <span class="progress tabular">
                    {done}/{have.length}
                  </span>
                </span>
                <span class="chips">
                  {r.ingredients.map((n, i) => (
                    <Ingredient data={data} name={n} have={have[i]} />
                  ))}
                </span>
              </span>
            </li>
          );
        })}
        {rows.length === 0 && <li class="muted">No recipe matches “{query.value}”.</li>}
      </ul>
    </section>
  );
}
