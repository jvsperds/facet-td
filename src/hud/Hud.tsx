import { useSignal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import type { Board, Cell } from '../sim/board';
import { announcement, rotateMode, selected, view, type CameraActions } from '../input/camera';

// DOM overlay: status bar, lower-left selection info, lower-right icon toolstrip with camera flyout.
// Panels marked data-exclude are measured and kept clear of playable cells by the camera fit.

const WAYPOINT_NAMES = [
  'Spawn (S)',
  'Checkpoint 1',
  'Checkpoint 2',
  'Checkpoint 3',
  'Checkpoint 4',
  'Checkpoint 5',
  'Castle exit (E)',
];

function describe(board: Board, cell: Cell) {
  const kind = board.kind(cell);
  if (kind === 'waypoint') {
    const i = board.waypoints.findIndex((w) => w.cell.x === cell.x && w.cell.y === cell.y);
    return { title: WAYPOINT_NAMES[i], detail: 'Creep route waypoint. Cannot build here.' };
  }
  return {
    stone: { title: 'Stone', detail: 'Default wall stone placed at game start.' },
    'no-build': {
      title: 'No-build zone',
      detail: cell.x <= 9 ? 'Reserved around the spawn.' : 'Reserved around the castle.',
    },
    open: { title: 'Open cell', detail: 'Gems can be placed here once building starts.' },
    outside: { title: 'Outside the board', detail: '' },
  }[kind];
}

export function Hud({
  board,
  actions,
  mode,
  version,
}: {
  board: Board;
  actions: CameraActions;
  mode: string;
  version: string;
}) {
  const flyout = useSignal(false);
  const cell = selected.value;
  const info = cell && describe(board, cell);
  const v = view.value;
  return (
    <>
      <header class="status" data-exclude>
        <strong>Facet TD</strong>
        <span>{mode === 'classic' ? 'Classic' : 'Facet'}</span>
        <span class="muted">data {version}</span>
      </header>

      <section class="panel info" data-exclude aria-label="Selection">
        {info ? (
          <>
            <h2>{info.title}</h2>
            <p class="muted tabular">
              Cell {cell.x}, {cell.y}
            </p>
            {info.detail && <p>{info.detail}</p>}
          </>
        ) : (
          <p>
            Click or tap a cell to inspect it, or focus the board and use the arrow keys and Enter.
          </p>
        )}
      </section>

      <div
        class="tools"
        data-exclude
        onKeyDown={(e) => e.key === 'Escape' && (flyout.value = false)}
      >
        {flyout.value && (
          <div class="panel flyout" id="camera-flyout" role="group" aria-label="Camera">
            <button onClick={() => actions.turn(-90)}>Turn left</button>
            <button onClick={() => actions.turn(90)}>Turn right</button>
            <button onClick={() => actions.zoomBy(1.25)}>Zoom in</button>
            <button onClick={() => actions.zoomBy(1 / 1.25)}>Zoom out</button>
            <button onClick={actions.reset}>Reset view</button>
          </div>
        )}
        <div class="strip panel" role="toolbar" aria-label="Tools">
          <Tool
            label={v.mode === 'iso' ? 'Switch to top view' : 'Switch to isometric view'}
            onClick={actions.toggleMode}
          >
            {v.mode === 'iso' ? (
              <path d="M12 3 21 8v8l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v8" />
            ) : (
              <path d="M4 4h16v16H4z M4 12h16 M12 4v16" />
            )}
          </Tool>
          <Tool
            label="Rotate board: drag turns instead of pans"
            pressed={rotateMode.value}
            onClick={actions.toggleRotate}
          >
            {rotateMode.value ? (
              <path d="M20 12a8 8 0 1 1-3-6.2 M20 4v5h-5" />
            ) : (
              <path d="M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5z" />
            )}
          </Tool>
          <Tool
            label="Camera controls"
            expanded={flyout.value}
            onClick={() => (flyout.value = !flyout.value)}
          >
            <path d="M4 8h4l2-3h4l2 3h4v11H4z M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7" />
          </Tool>
        </div>
      </div>

      <div class="sr-only" aria-live="polite">
        {announcement.value}
      </div>
    </>
  );
}

function Tool(p: {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      class="tool"
      aria-label={p.label}
      title={p.label}
      aria-pressed={p.pressed}
      aria-expanded={p.expanded}
      onClick={p.onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {p.children}
      </svg>
    </button>
  );
}
