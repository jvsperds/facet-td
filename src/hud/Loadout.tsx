import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { GameData } from '../data';
import { ECONOMY } from '../profile/economy';
import {
  buySkillSlot,
  loadProfile,
  openBox,
  profileRunConfig,
  saveProfile,
  storeRunConfig,
  type PlayerProfile,
} from '../profile/profile';
import { readHeroCatalog } from '../sim/hero';
import { MAPS, type MapId } from '../sim/board';

function labels(data: GameData) {
  const tokens = (
    data.files['localization/english.json'] as { lang: { Tokens: Record<string, string> } }
  ).lang.Tokens;
  return (key: string) =>
    tokens[`DOTA_Tooltip_ability_${key}`] ??
    tokens[key] ??
    key.replace(/^(npc_dota_hero_|gemtd_hero_)/, '').replaceAll('_', ' ');
}

export function Loadout({
  data,
  close,
  start,
}: {
  data: GameData;
  close: () => void;
  start: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const profile = useSignal(loadProfile(data));
  const result = useSignal('');
  const difficulty = useSignal<1 | 2 | 3 | 4>(1);
  const endless = useSignal(true);
  const map = useSignal<MapId>('classic');
  const catalog = readHeroCatalog(data);
  const name = labels(data);
  const update = (fn: (p: PlayerProfile) => void) => {
    const next = structuredClone(profile.value);
    fn(next);
    saveProfile(next);
    profile.value = next;
  };
  const buy = (kind: 'hero' | 'skill') => {
    const next = structuredClone(profile.value);
    try {
      const opened = openBox(data, next, kind);
      profile.value = next;
      const item = kind === 'hero' ? catalog.heroes[opened.id] : catalog.abilities[opened.id];
      result.value = opened.refund
        ? `Duplicate ${name(item)} · ${opened.refund} shells refunded`
        : kind === 'skill' && opened.duplicate
          ? `${name(item)} raised to level ${opened.level}`
          : `Unlocked ${name(item)}`;
    } catch (e) {
      result.value = (e as Error).message;
    }
  };
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog ref={dialog} class="panel loadout" aria-labelledby="loadout-title" onClose={close}>
      <header class="drawer-head">
        <div>
          <p class="eyebrow">Offline profile</p>
          <h2 id="loadout-title">Hero loadout</h2>
        </div>
        <strong class="shell-count">◈ {profile.value.shells} shells</strong>
      </header>
      <p class="muted">Choose one owned hero and up to {profile.value.slots} owned skills.</p>
      <div class="run-options">
        <label>
          Difficulty
          <select
            value={difficulty.value}
            onChange={(e) => (difficulty.value = Number(e.currentTarget.value) as 1 | 2 | 3 | 4)}
          >
            <option value="1">Normal · 1× shells</option>
            <option value="2">Hard · 1.5× shells</option>
            <option value="3">Expert · 2× shells</option>
            <option value="4">Master · 3× shells</option>
          </select>
        </label>
        <label>
          Map
          <select value={map.value} onChange={(e) => (map.value = e.currentTarget.value as MapId)}>
            {Object.entries(MAPS).map(([id, m]) => (
              <option key={id} value={id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={endless.value}
            onChange={(e) => (endless.value = e.currentTarget.checked)}
          />
          Continue endless after wave 50
        </label>
      </div>
      <label class="loadout-hero">
        Hero
        <select
          value={profile.value.selectedHero}
          onChange={(e) => update((p) => (p.selectedHero = e.currentTarget.value))}
        >
          {profile.value.heroes.map((id) => (
            <option value={id}>{name(catalog.heroes[id])}</option>
          ))}
        </select>
      </label>
      <fieldset class="loadout-skills">
        <legend>
          Skills · {profile.value.selectedSkills.length}/{profile.value.slots}
        </legend>
        {Object.entries(profile.value.skills).map(([id, level]) => {
          const selected = profile.value.selectedSkills.includes(id);
          return (
            <label>
              <input
                type="checkbox"
                checked={selected}
                disabled={!selected && profile.value.selectedSkills.length >= profile.value.slots}
                onChange={() =>
                  update((p) => {
                    p.selectedSkills = selected
                      ? p.selectedSkills.filter((key) => key !== id)
                      : [...p.selectedSkills, id].slice(0, p.slots);
                  })
                }
              />
              <span>{name(catalog.abilities[id])}</span>
              <b>Lv {level}</b>
            </label>
          );
        })}
      </fieldset>
      <section class="profile-shop" aria-label="Shell shop">
        <button
          disabled={profile.value.shells < ECONOMY.boxes.hero.cost}
          onClick={() => buy('hero')}
        >
          Hero box · {ECONOMY.boxes.hero.cost} ◈
        </button>
        <button
          disabled={profile.value.shells < ECONOMY.boxes.skill.cost}
          onClick={() => buy('skill')}
        >
          Skill box · {ECONOMY.boxes.skill.cost} ◈
        </button>
        <button
          disabled={
            profile.value.slots >= 4 ||
            profile.value.shells < ECONOMY.slotCosts[profile.value.slots - 1]
          }
          onClick={() => {
            const next = structuredClone(profile.value);
            try {
              const cost = buySkillSlot(next);
              profile.value = next;
              result.value = `Unlocked skill slot ${next.slots} for ${cost} shells`;
            } catch (e) {
              result.value = (e as Error).message;
            }
          }}
        >
          {profile.value.slots >= 4
            ? 'All 4 slots unlocked'
            : `Unlock slot ${profile.value.slots + 1} · ${ECONOMY.slotCosts[profile.value.slots - 1]} ◈`}
        </button>
      </section>
      {result.value && (
        <p class="loadout-result" role="status">
          {result.value}
        </p>
      )}
      <div class="actions">
        <button
          class="primary big"
          onClick={() => {
            storeRunConfig({
              ...profileRunConfig(data, profile.value),
              difficulty: difficulty.value,
              endless: endless.value,
              map: map.value,
            });
            start();
          }}
        >
          Start run
        </button>
        <button onClick={() => dialog.current?.close()}>Back</button>
      </div>
    </dialog>
  );
}
