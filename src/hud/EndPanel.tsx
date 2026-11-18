import { useSignal } from '@preact/signals';
import { LAST_LEVEL, TICK_HZ } from '../sim/game';
import type { Sim } from '../sim/sim';
import type { WaveStats } from '../sim/stats';
import { loadHistory } from '../profile/runs';
import { Icon } from './icons';
import { exitToTitle, newRun, restartSeed } from './Menu';
import { compact, displayName } from './names';
import { TowerIcon } from './TowerIcon';

const DIFFICULTY = ['', 'Normal', 'Hard', 'Expert', 'Master'];
const SERIES = [
  ['damage', 'Damage', 'Damage dealt per wave, log scale'],
  ['gold', 'Gold', 'Gold earned per wave'],
  ['castle', 'Castle', 'Castle HP lost per wave'],
  ['kills', 'Kills', 'Creeps killed per wave'],
] as const;
type Series = (typeof SERIES)[number][0];

function clock(seconds: number) {
  const s = Math.floor(seconds),
    h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** The run's end: result, score, per-wave chart, top towers, highlights and local best runs. */
export function EndPanel({ sim }: { sim: Sim }) {
  const game = sim.game;
  const stats = game.stats;
  const won = game.phase === 'won';
  const difficulty = sim.config.difficulty;
  const series = useSignal<Series>('damage');
  const hover = useSignal<WaveStats | null>(null);
  const name = (n: string) => displayName(sim.data, n);

  const waves = stats.waves;
  const last = waves.at(-1);
  const totalDamage = waves.reduce((n, w) => n + w.damage, 0);
  const towers = Object.values(stats.damageByTower).sort((a, b) => b.damage - a.damage);
  const lifetime = towers.reduce((n, t) => n + t.damage, 0) || 1;
  const byType = (['physical', 'magical', 'pure'] as const).map(
    (k) => [k, towers.reduce((n, t) => n + (t[k] ?? 0), 0) / lifetime] as const,
  );
  const biggestWave = waves.reduce<WaveStats | undefined>(
    (b, w) => (!b || w.damage > b.damage ? w : b),
    undefined,
  );
  const longestWave = waves.reduce<WaveStats | undefined>(
    (b, w) => (!b || w.ticks > b.ticks ? w : b),
    undefined,
  );
  const accuracy = stats.attacks ? Math.round((1 - stats.dodged / stats.attacks) * 100) : 100;

  // Local best runs on this difficulty; this run is recorded when it ends, so match it by tick and seed.
  const runs = loadHistory()
    .filter((r) => r.config.difficulty === difficulty)
    .sort(
      (a, b) =>
        b.stats.wavesCleared - a.stats.wavesCleared ||
        b.stats.killScore - a.stats.killScore ||
        a.stats.ticks - b.stats.ticks,
    );
  const isThis = (r: (typeof runs)[number]) => r.seed === sim.seed && r.stats.ticks === stats.ticks;
  const rank = runs.findIndex(isThis) + 1;

  const columns = Math.max(LAST_LEVEL, waves.length);
  const value = (w: WaveStats) => w[series.value];
  const max = Math.max(1, ...waves.map(value));
  const height = (w: WaveStats) =>
    series.value === 'damage'
      ? (Math.log10(1 + w.damage) / Math.log10(1 + max)) * 100
      : (value(w) / max) * 100;
  const seriesMeta = SERIES.find((s) => s[0] === series.value)!;
  const peak = waves.reduce<WaveStats | undefined>(
    (b, w) => (!b || value(w) > value(b) ? w : b),
    undefined,
  );
  const total = waves.reduce((n, w) => n + value(w), 0);

  return (
    <div class="end" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div class={`panel end-panel ${won ? 'won' : 'lost'}`}>
        <header class="end-head">
          <div>
            <h2 id="end-title">
              {won ? 'Victory' : 'Defeat'} <span class="end-chip">{DIFFICULTY[difficulty]}</span>
            </h2>
            <p>
              {won
                ? game.level > LAST_LEVEL
                  ? `All ${LAST_LEVEL} waves cleared; held until endless wave ${game.level}.`
                  : `All ${LAST_LEVEL} waves cleared.`
                : `Fell on wave ${game.level} of ${LAST_LEVEL}.`}
            </p>
          </div>
          {!won && last && (
            <aside class="end-killer">
              <small>What killed you</small>
              <strong>
                Wave {last.level}, {name(last.creep)}
              </strong>
              <span>
                {last.leaks} got through and took {last.castle} HP. Your towers dealt{' '}
                {compact(last.damage)} damage that wave.
              </span>
            </aside>
          )}
        </header>

        <div class="end-body">
          <div class="end-col">
            <section class="end-score">
              <small>Score</small>
              <strong class="tabular">{compact(stats.killScore)}</strong>
              {rank > 0 && (
                <span class="end-chip">
                  #{rank} of your {DIFFICULTY[difficulty]} runs
                </span>
              )}
            </section>
            <dl class="end-grid tabular">
              {(
                [
                  ['flag', 'Waves', `${stats.wavesCleared}/${LAST_LEVEL}`],
                  ['paw', 'Kills', stats.kills],
                  ['castle', 'Leaked', stats.leaks],
                  ['sword', 'Damage', compact(totalDamage)],
                  ['tower', 'Towers', game.gems.length],
                  ['target', 'Accuracy', `${accuracy}%`],
                  ['coin', 'Gold', compact(stats.goldEarned)],
                  ['play', 'Time', clock(stats.ticks / TICK_HZ)],
                  ['hammer', 'Combines', Object.values(stats.combined).reduce((n, v) => n + v, 0)],
                  ['upgrade', 'MVP awards', stats.mvpAwards],
                  ['hero', 'Hero casts', Object.values(stats.heroCasts).reduce((n, v) => n + v, 0)],
                  ['heart', 'Castle left', Math.max(0, game.castleHp)],
                ] as const
              ).map(([icon, label, v]) => (
                <div key={label}>
                  <dt>
                    <Icon name={icon} /> {label}
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {towers.length > 0 && (
              <section>
                <h3 class="section-label">Top towers</h3>
                <div class="end-types" aria-label="Damage by type">
                  {byType.map(([k, share]) => (
                    <span
                      key={k}
                      class={k}
                      style={{ flexGrow: share }}
                      title={`${k} ${Math.round(share * 100)}%`}
                    />
                  ))}
                </div>
                <p class="end-legend">
                  {byType.map(([k, share]) => (
                    <span key={k} class={k}>
                      {k[0].toUpperCase() + k.slice(1)} {Math.round(share * 100)}%
                    </span>
                  ))}
                </p>
                <ol class="end-towers">
                  {towers.slice(0, 5).map((t, i) => (
                    <li key={i}>
                      <TowerIcon name={t.name} class="glyph mini" />
                      <span class="end-tower-name">{name(t.name)}</span>
                      <span class="tabular">
                        {compact(t.damage)} · {Math.round((t.damage / lifetime) * 100)}%
                      </span>
                      <span class="end-types thin">
                        {(['physical', 'magical', 'pure'] as const).map((k) => (
                          <span
                            key={k}
                            class={k}
                            style={{ width: `${((t[k] ?? 0) / towers[0].damage) * 100}%` }}
                          />
                        ))}
                      </span>
                      <small>{t.kills ?? 0} kills</small>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          <div class="end-col">
            <section class="end-chart">
              <div class="end-chart-head">
                <h3 class="section-label">Waves</h3>
                <div class="end-tabs" role="tablist">
                  {SERIES.map(([key, label]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={series.value === key}
                      onClick={() => (series.value = key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <small>{seriesMeta[2]}</small>
              <div class="end-bars" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
                {Array.from({ length: columns }, (_, i) => {
                  const w = waves[i];
                  return w ? (
                    <span
                      key={i}
                      class={w === last && !won ? 'fatal' : ''}
                      style={{ height: `${Math.max(1, height(w))}%` }}
                      onPointerEnter={() => (hover.value = w)}
                      onPointerLeave={() => (hover.value = null)}
                      title={`Wave ${w.level}: ${compact(value(w))}`}
                    />
                  ) : (
                    <span key={i} class="unplayed" />
                  );
                })}
              </div>
              <p class="end-chart-note">
                {hover.value
                  ? `Wave ${hover.value.level}, ${name(hover.value.creep)}: ${compact(hover.value.damage)} damage, ${hover.value.gold} gold, ${hover.value.kills} kills, ${hover.value.castle} castle HP lost, ${clock(hover.value.ticks / TICK_HZ)}.`
                  : `${compact(total)} ${seriesMeta[1].toLowerCase()} in total${peak && value(peak) ? `, the most in wave ${peak.level} (${compact(value(peak))})` : ''}.`}
              </p>
            </section>

            <section>
              <h3 class="section-label">Highlights</h3>
              <ul class="end-highlights">
                {stats.biggestHit && (
                  <li>
                    <small>Biggest hit</small>
                    <strong>{compact(stats.biggestHit.damage)}</strong>
                    <span>
                      {name(stats.biggestHit.name)}, wave {stats.biggestHit.level}
                    </span>
                  </li>
                )}
                {biggestWave && (
                  <li>
                    <small>Biggest fight</small>
                    <strong>Wave {biggestWave.level}</strong>
                    <span>
                      {compact(biggestWave.damage)} damage to {name(biggestWave.creep)}
                    </span>
                  </li>
                )}
                {longestWave && (
                  <li>
                    <small>Longest wave</small>
                    <strong>{clock(longestWave.ticks / TICK_HZ)}</strong>
                    <span>
                      wave {longestWave.level}, {name(longestWave.creep)}
                    </span>
                  </li>
                )}
                <li>
                  <small>Dodged</small>
                  <strong>{stats.dodged}</strong>
                  <span>of {stats.attacks} attacks</span>
                </li>
              </ul>
            </section>

            {runs.length > 0 && (
              <section>
                <h3 class="section-label">Your best {DIFFICULTY[difficulty]} runs</h3>
                <ol class="end-runs tabular">
                  {runs.slice(0, 5).map((r, i) => (
                    <li key={r.id} class={isThis(r) ? 'this' : ''}>
                      <span>#{i + 1}</span>
                      <strong>{compact(r.stats.killScore)}</strong>
                      <span>Wave {r.stats.wavesCleared}</span>
                      <span>
                        {isThis(r)
                          ? 'This run'
                          : new Date(r.finishedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                      </span>
                    </li>
                  ))}
                </ol>
                <small>Kept on this device.</small>
              </section>
            )}
          </div>
        </div>

        <div class="actions">
          <button onClick={exitToTitle}>Exit to title</button>
          <button onClick={() => restartSeed(sim.seed)}>Restart this seed</button>
          <button class="primary" ref={(b) => b?.focus()} onClick={newRun}>
            Play again
          </button>
        </div>
      </div>
    </div>
  );
}
