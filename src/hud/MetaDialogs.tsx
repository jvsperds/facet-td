import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { Audio, Bus } from '../audio';
import type { GameData } from '../data';
import { claimQuest, loadProfile } from '../profile/profile';
import { bestRun, loadHistory } from '../profile/runs';
import { questTitle } from '../sim/quests';
import type { Game } from '../sim/game';
import { Icon } from './icons';
import { compact, displayName, skillName, skillText } from './names';
import { StatusIcon, iconForText } from './Statuses';
import { CreepIcon } from './TowerIcon';

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: preact.ComponentChildren;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog ref={dialog} class="panel meta-dialog" aria-label={title} onClose={close}>
      <header class="drawer-head">
        <h2>{title}</h2>
        <button aria-label={`Close ${title}`} onClick={() => dialog.current?.close()}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function HistoryDialog({ close }: { close: () => void }) {
  const history = loadHistory();
  const best = bestRun(history);
  return (
    <Modal title="Run history" close={close}>
      {best && (
        <p>
          <b>Best:</b> wave {best.stats.wavesCleared}, score {best.stats.killScore}
        </p>
      )}
      {history.length ? (
        <ol class="history-list">
          {history.map((run) => (
            <li>
              <b>
                {run.stats.result === 'won' ? 'Victory' : 'Defeat'} · wave {run.stats.wavesCleared}
              </b>
              <span>
                Difficulty {run.config.difficulty} · {run.stats.kills} kills · score{' '}
                {run.stats.killScore}
              </span>
              <small>{new Date(run.finishedAt).toLocaleString()}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p class="muted">Finished runs will appear here.</p>
      )}
    </Modal>
  );
}

export function QuestsDialog({ data, close }: { data: GameData; close: () => void }) {
  const profile = useSignal(loadProfile(data));
  return (
    <Modal title="Quests" close={close}>
      <p>
        <b>◈ {profile.value.shells}</b> shells
      </p>
      {profile.value.completedQuests.length ? (
        <ul class="quest-list">
          {profile.value.completedQuests.map((id) => {
            const claimed = profile.value.claimedQuests.includes(id);
            return (
              <li>
                <span>{questTitle(data, id)}</span>
                <button
                  disabled={claimed}
                  onClick={() => {
                    const next = structuredClone(profile.value);
                    claimQuest(next, id);
                    profile.value = next;
                  }}
                >
                  {claimed ? 'Claimed' : `Claim ${[3, 5, 8][Number(id[1]) - 1] ?? 3} ◈`}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="muted">Clear wave 50 to complete quests.</p>
      )}
    </Modal>
  );
}

export function SettingsDialog({ audio, close }: { audio: Audio; close: () => void }) {
  const quality = useSignal(localStorage.getItem('facet-td:quality') ?? 'auto');
  const buses: [Bus, string][] = [
    ['master', 'Master'],
    ['music', 'Music'],
    ['ambience', 'Ambience'],
    ['effects', 'Effects'],
  ];
  return (
    <Modal title="Settings" close={close}>
      <div class="settings-form">
        {buses.map(([bus, label]) => (
          <label>
            {label}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audio.getVolume(bus)}
              onInput={(e) => audio.setVolume(bus, Number(e.currentTarget.value))}
            />
          </label>
        ))}
        <label>
          Music
          <input
            type="checkbox"
            checked={audio.isMusicOn()}
            onChange={(e) => audio.setMusicOn(e.currentTarget.checked)}
          />
        </label>
        <label>
          Graphics
          <select
            value={quality.value}
            onChange={(e) => {
              quality.value = e.currentTarget.value;
              localStorage.setItem('facet-td:quality', quality.value);
            }}
          >
            <option value="auto">Auto</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>
      <p class="muted">Graphics changes apply on the next run.</p>
    </Modal>
  );
}

/** The next waves: creep, count, HP, armor, speed, castle damage and skills. */
export function UpcomingDialog({
  data,
  game,
  close,
}: {
  data: GameData;
  game: Game;
  close: () => void;
}) {
  const first = game.phase === 'wave' ? game.level + 1 : game.level;
  const plans = Array.from({ length: 5 }, (_, i) => game.wavePlan(first + i)).filter(
    (p) => p.names.length && (game.config.endless || p.level <= 50),
  );
  return (
    <Modal title="Upcoming waves" close={close}>
      <ol class="upcoming-list">
        {plans.map((p) => (
          <li key={p.level} class={p.boss ? 'boss' : ''}>
            <header>
              <span class="upcoming-wave">
                <small>Wave</small>
                {p.level}
              </span>
              <div class="upcoming-portrait">
                <CreepIcon name={p.names[0]} />
              </div>
              <span>
                <strong>{p.names.map((n) => displayName(data, n)).join(' or ')}</strong>
                <small>{p.boss ? 'Boss' : `${p.count} enemies${p.fly ? ' · flying' : ''}`}</small>
              </span>
            </header>
            <dl class="upcoming-stats">
              <div>
                <dt>
                  <Icon name="heart" /> HP
                </dt>
                <dd>{p.hp === null ? '?' : compact(p.hp)}</dd>
              </div>
              <div>
                <dt>
                  <Icon name="shield" /> Armor
                </dt>
                <dd>{p.armor}</dd>
              </div>
              <div>
                <dt>
                  <Icon name="boot" /> Speed
                </dt>
                <dd>{p.speed.toFixed(1)}/s</dd>
              </div>
              <div>
                <dt>
                  <Icon name="castle" /> Leak
                </dt>
                <dd>{p.leak ? `${p.leak[0]}-${p.leak[1]}` : 'Fatal'}</dd>
              </div>
            </dl>
            {p.skills.length > 0 && (
              <ul class="upcoming-skills">
                {p.skills.map((k) => (
                  <li key={k}>
                    <StatusIcon kind={iconForText(`${skillName(data, k)} ${skillText(data, k)}`)} />
                    <b>{skillName(data, k)}</b> {skillText(data, k)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
