import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { readHeroCatalog } from '../sim/hero';
import type { Cmd, Sim } from '../sim/sim';
import { selected } from '../input/camera';

export function HeroPanel({
  sim,
  send,
  close,
}: {
  sim: Sim;
  send: (cmd: Cmd) => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const game = sim.game,
    catalog = readHeroCatalog(sim.data);
  const hero = useSignal(game.hero.selected || 'h101');
  const skills = useSignal({ ...game.hero.abilities });
  const definitions = (
    sim.data.files['npc/abilities.json'] as {
      DOTAAbilities: Record<string, { MaxLevel?: string; AbilityValues?: { cost?: string } }>;
    }
  ).DOTAAbilities;
  const tokens = (
    sim.data.files['localization/english.json'] as { lang: { Tokens: Record<string, string> } }
  ).lang.Tokens;
  const name = (key: string) =>
    tokens[`DOTA_Tooltip_ability_${key}`] ??
    tokens[key] ??
    key.replace(/^(npc_dota_hero_|gemtd_hero_)/, '').replaceAll('_', ' ');
  const point = selected.value ?? undefined;
  const target = point
    ? (game.gemAt(point)?.id ?? (game.stoneAt(point) ? -(point.y * 64 + point.x) : undefined))
    : undefined;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} class="panel hero-panel" aria-labelledby="hero-title" onClose={close}>
      <h2 id="hero-title">Offline hero</h2>
      <p>Choose any hero, skills, and skill levels for free. Casting still costs gold.</p>
      {game.hero.selected && (
        <section aria-label="Hero actions">
          <p>
            Hero at {game.heroPosition.x.toFixed(1)}, {game.heroPosition.y.toFixed(1)}. Select a
            board cell before opening this panel to move or target a tower.
          </p>
          <div class="actions">
            <button
              disabled={!point || game.stoneAt(point) || !!game.gemAt(point)}
              title="Select an empty board cell to move the hero."
              onClick={() => {
                if (selected.value) {
                  send({ type: 'hero-move', cell: { ...selected.value } });
                  close();
                }
              }}
            >
              Move to selected cell
            </button>
            {game.heroActions().map((a) => {
              const check = game.canHeroAction(a.name, target, point, sim.tick);
              const remaining = Math.max(
                0,
                Math.ceil(((game.hero.cooldowns[a.name] ?? 0) - sim.tick) / 30),
              );
              return (
                <button
                  key={a.name}
                  disabled={!check.ok}
                  title={check.ok ? '' : check.reason}
                  onClick={() => {
                    send({ type: 'hero-cast', action: a.name, target, point });
                    close();
                  }}
                >
                  {name(a.name)} Lv {a.level}
                  {remaining ? ` (${remaining}s)` : ''}
                  {!check.ok && !remaining ? ` · ${check.reason}` : ''}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: 'hero-loadout', hero: hero.value, abilities: { ...skills.value } });
          close();
        }}
      >
        <label>
          Hero{' '}
          <select value={hero.value} onChange={(e) => (hero.value = e.currentTarget.value)}>
            {Object.entries(catalog.heroes).map(([id, unit]) => (
              <option key={id} value={id}>
                {name(unit)}
              </option>
            ))}
          </select>
        </label>
        <div class="hero-skills">
          {Object.values(catalog.abilities)
            .filter((a) => a.startsWith('gemtd_hero_'))
            .map((a) => (
              <label key={a}>
                {name(a)}
                <select
                  aria-label={`${name(a)} level`}
                  value={skills.value[a] ?? 0}
                  onChange={(e) => {
                    const next = { ...skills.value },
                      level = Number(e.currentTarget.value);
                    if (level) next[a] = level;
                    else delete next[a];
                    skills.value = next;
                  }}
                >
                  {Array.from({ length: Number(definitions[a]?.MaxLevel ?? 1) + 1 }, (_, level) => (
                    <option key={level} value={level}>
                      {level ? `Level ${level}` : 'None'}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </div>
        <div class="actions">
          <button type="submit" disabled={game.phase !== 'build' || game.draft.length > 0}>
            Apply loadout
          </button>
          <button type="button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        <small>Loadouts can be changed between drafts.</small>
      </form>
    </dialog>
  );
}
