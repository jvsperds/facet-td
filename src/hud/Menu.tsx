import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';

// The in-game menu (top right, or Esc with nothing selected) and the title screen it exits to.
// A run is the page: restarting loads a new seed (or the same one), exiting loads the title.

/** Load the page with `patch` applied to the URL's query, keeping flags such as `?wip`. */
function go(patch: Record<string, string | null>) {
  const params = new URLSearchParams(location.search);
  for (const key of ['seed', 'title']) params.delete(key);
  for (const [key, value] of Object.entries(patch)) if (value !== null) params.set(key, value);
  location.search = params.toString().replace(/=(?=&|$)/g, '');
}
export const newRun = () => go({ seed: String(Date.now() >>> 0) });
export const restartSeed = (seed: number) => go({ seed: String(seed) });
export const exitToTitle = () => go({ title: '' });

export type MenuAsk = 'new' | 'restart' | null;

/** Resume, restart with a new or the same seed, or exit to the title. Restarts ask first. */
export function GameMenu({
  seed,
  close,
  ask: initial = null,
}: {
  seed: number;
  close: () => void;
  /** Open straight on the confirm step of New run or Restart this seed (their shortcuts). */
  ask?: MenuAsk;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const ask = (label: string, run: () => void) => ({ label, run });
  const confirm = useSignal<null | { label: string; run: () => void }>(
    initial === 'new'
      ? ask('New run', newRun)
      : initial === 'restart'
        ? ask('Restart this seed', () => restartSeed(seed))
        : null,
  );
  const seedShown = useSignal(false);
  const copied = useSignal(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(String(seed))
      .then(() => (copied.value = true))
      .catch(() => (seedShown.value = true));
  };
  return (
    <dialog ref={dialog} class="panel menu" aria-labelledby="menu-title" onClose={close}>
      <h2 id="menu-title">Menu</h2>
      {confirm.value ? (
        <>
          <p>{confirm.value.label}? This run's progress is lost.</p>
          <div class="menu-actions">
            <button class="primary" ref={(b) => b?.focus()} onClick={confirm.value.run}>
              {confirm.value.label}
            </button>
            <button onClick={() => (initial ? dialog.current?.close() : (confirm.value = null))}>
              {initial ? 'Cancel' : 'Back'}
            </button>
          </div>
        </>
      ) : (
        <div class="menu-actions">
          <button class="primary" onClick={() => dialog.current?.close()}>
            Resume <kbd aria-hidden="true">Esc</kbd>
          </button>
          <button aria-keyshortcuts="N" onClick={() => (confirm.value = ask('New run', newRun))}>
            New run <kbd aria-hidden="true">N</kbd>
          </button>
          <button
            aria-keyshortcuts="Shift+N"
            onClick={() => (confirm.value = ask('Restart this seed', () => restartSeed(seed)))}
          >
            Restart this seed <kbd aria-hidden="true">⇧N</kbd>
          </button>
          <button onClick={() => (confirm.value = ask('Exit to title', exitToTitle))}>
            Exit to title
          </button>
          <div class="seed-row">
            {seedShown.value ? (
              <span class="tabular">Seed {seed}</span>
            ) : (
              <button class="link" onClick={() => (seedShown.value = true)}>
                Show seed
              </button>
            )}
            <button class="link" onClick={copy}>
              {copied.value ? 'Seed copied' : 'Copy seed'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** The title: the game's name over the idle cave, and a way in. */
export function TitleScreen() {
  return (
    <div class="title-screen" role="dialog" aria-modal="true" aria-labelledby="title-name">
      <div class="title-card">
        <p class="eyebrow">Gem TD · Classic</p>
        <h1 id="title-name" class="logo">
          Facet TD
        </h1>
        <p class="muted">
          Place random gems, keep one, wall in the rest. Combine towers and hold the crystal vault
          for fifty waves.
        </p>
        <button class="primary big" ref={(b) => b?.focus()} onClick={() => go({})}>
          New game
        </button>
      </div>
    </div>
  );
}
