import type { ComponentChildren } from 'preact';

// HUD glyphs. Gem silhouettes follow docs/art/gems.svg (type reads by shape, colour reinforces it);
// tool icons are 24 px line drawings in currentColor.

const GEM_SHAPES: Record<string, string> = {
  // Diamond: claw-set brilliant.
  d: 'M5 9 8.5 4.5h7L19 9l-7 11z',
  // Sapphire: hexagonal column.
  b: 'M8 3.5h8l2.5 3.5v10L16 20.5H8L5.5 17V7z',
  // Topaz: waisted.
  y: 'M5.5 4h13L14 12l4.5 8h-13L10 12z',
  // Ruby: keep with battlements.
  r: 'M5 20.5V8h2.5V4.5h3V8h3V4.5h3V8H19v12.5z',
  // Emerald: spire.
  g: 'M12 3 17.5 20.5h-11z',
  // Opal: cup.
  e: 'M4.5 5h15L15 13.5v3l2 4H7l2-4v-3z',
  // Aquamarine: stepped.
  q: 'M9 3.5h6V8h3v5.5h2.5v7h-17v-7H6V8h3z',
  // Amethyst: drum.
  p: 'M5 7.5a7 3 0 0 1 14 0v9a7 3 0 0 1-14 0z',
};
// Combined and special towers share one star outline; the inspector names them.
const COMBINED = 'M12 3l2.6 6 6.4.4-4.9 4.1 1.6 6.5L12 16.4 6.3 20l1.6-6.5L3 9.4 9.4 9z';

/** Gem or tower silhouette; `type` is the basic gem letter (d, b, y, ...) or undefined for combined. */
export function GemGlyph({ type, class: cls = 'glyph' }: { type?: string; class?: string }) {
  return (
    <svg class={cls} viewBox="0 0 24 24" aria-hidden="true">
      <path d={(type && GEM_SHAPES[type]) || COMBINED} />
    </svg>
  );
}

export const ICONS: Record<string, ComponentChildren> = {
  iso: <path d="M12 3 21 8v8l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v8" />,
  top: <path d="M4 4h16v16H4z M4 12h16 M12 4v16" />,
  rotate: <path d="M20 12a8 8 0 1 1-3-6.2 M20 4v5h-5" />,
  lock: <path d="M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5z" />,
  camera: <path d="M4 8h4l2-3h4l2 3h4v11H4z M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7" />,
  play: <path d="M7 5v14l12-7z" />,
  pause: <path d="M8 5v14 M16 5v14" />,
  hero: <path d="M4 19h16 M5 16 4 7l5 4 3-6 3 6 5-4-1 9z" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronUp: <path d="M6 15l6-6 6 6" />,
};
