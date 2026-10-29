import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';

// The in-game menu (top right, or Esc with nothing selected) and the title screen it exits to.
// A run is the page: restarting loads a new seed (or the same one), exiting loads the title.

const go = (search: string) => (location.search = search);

/** Resume, restart with a new or the same seed, or exit to the title. Restarts ask first. */
export function GameMenu({ seed, close }: { seed: number; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const confirm = useSignal<null | { label: string; run: () => void }>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const ask = (label: string, run: () => void) => (confirm.value = { label, run });
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
            <button onClick={() => (confirm.value = null)}>Back</button>
          </div>
        </>
      ) : (
        <div class="menu-actions">
          <button class="primary" onClick={() => dialog.current?.close()}>
            Resume <kbd aria-hidden="true">Esc</kbd>
          </button>
          <button onClick={() => ask('New run', () => go(`?seed=${Date.now() >>> 0}`))}>
            New run
          </button>
          <button onClick={() => ask('Restart this seed', () => go(`?seed=${seed}`))}>
            Restart this seed
          </button>
          <button onClick={() => ask('Exit to title', () => go('?title'))}>Exit to title</button>
          <p class="muted tabular">Seed {seed}</p>
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
        <button class="primary big" ref={(b) => b?.focus()} onClick={() => go('')}>
          New game
        </button>
      </div>
    </div>
  );
}
