import { useEffect } from 'preact/hooks';
import { CELL_UNITS } from '../sim/board';
import { TICK_HZ } from '../sim/game';
import type { Sim } from '../sim/sim';
import { announcement, selectedCreep } from '../input/camera';
import { Icon } from './icons';
import { compact, displayName, skillName, skillText } from './names';
import { Statuses } from './Statuses';
import { CreepIcon } from './TowerIcon';

// The selected creep (GemTD's creep panel): portrait, health, defences, castle damage, its own
// abilities with the original tooltips, and the effects on it right now.

export function CreepInspector({ sim, id }: { sim: Sim; id: number; tick: number }) {
  const game = sim.game;
  const creep = game.creeps.find((c) => c.id === id);
  // Killed or arrived: drop the selection.
  useEffect(() => {
    if (!creep) {
      selectedCreep.value = null;
      announcement.value = 'The selected creep is gone';
    }
  }, [creep]);
  if (!creep) return null;
  const u = game.unit(creep.name) ?? {};
  const stats = game.creepStats(creep);
  const share = Math.max(0, creep.hp / creep.maxHp);
  const speed = Math.round(stats.speed * CELL_UNITS * TICK_HZ);
  const baseSpeed = Math.round(creep.speed * CELL_UNITS * TICK_HZ);
  const skills = game.creepSkills(creep);
  const name = displayName(sim.data, creep.name);
  return (
    <section class="panel info creep" data-exclude aria-label="Selection">
      <div class="info-head">
        <span class="swatch">
          <CreepIcon name={creep.name} />
        </span>
        <div class="info-title">
          <h2>
            {creep.elite && 'Elite '}
            {name}
          </h2>
          <p class="muted">
            {[
              creep.boss ? 'Boss' : 'Creep',
              creep.fly ? 'Flying' : 'Ground',
              `wave ${game.level}`,
            ].join(' · ')}
          </p>
        </div>
        <button
          class="icon-button"
          aria-label="Deselect"
          onClick={() => {
            selectedCreep.value = null;
            announcement.value = 'Selection cleared';
            document.querySelector('canvas')?.focus();
          }}
        >
          <Icon name="close" />
        </button>
      </div>
      <div class="info-body" id="info-body">
        <div
          class="hp"
          role="meter"
          aria-label="Health"
          aria-valuemin={0}
          aria-valuemax={creep.maxHp}
          aria-valuenow={Math.ceil(creep.hp)}
        >
          <i style={{ width: `${share * 100}%` }} class={share < 0.3 ? 'low' : ''} />
          <span class="tabular">
            {compact(Math.ceil(creep.hp))} / {compact(creep.maxHp)} HP
          </span>
        </div>
        <dl class="tiles tabular">
          <div>
            <dt>Armor</dt>
            <dd>{+stats.armor.toFixed(1)}</dd>
            {stats.armor !== creep.armor && <dd class="sub">base {creep.armor}</dd>}
          </div>
          <div>
            <dt>Magic res.</dt>
            <dd>{Math.round(stats.magicResist)}%</dd>
          </div>
          <div>
            <dt>Speed</dt>
            <dd>{speed}</dd>
            {speed !== baseSpeed && <dd class="sub">base {baseSpeed}</dd>}
          </div>
          <div>
            <dt>Castle dmg</dt>
            <dd>{creep.boss ? `${Math.ceil(share * 100)}` : creep.damage}</dd>
            <dd class="sub">if it arrives</dd>
          </div>
        </dl>
        {skills.length > 0 && (
          <>
            <h3 class="section-label">Abilities</h3>
            <ul class="skills" role="list">
              {skills.map((k) => (
                <li key={k}>
                  <b>{skillName(sim.data, k)}</b>
                  {skillText(sim.data, k) && <span>{skillText(sim.data, k)}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        <Statuses data={sim.data} list={game.creepStatuses(creep)} />
        {Number(u.BountyGoldMin ?? 0) > 0 && (
          <p class="muted tabular">
            Bounty {u.BountyGoldMin}–{u.BountyGoldMax} gold
          </p>
        )}
      </div>
    </section>
  );
}
