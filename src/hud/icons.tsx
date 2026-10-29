import type { ComponentChildren } from 'preact';

// HUD glyphs in the P1.5 mockup style. Gem silhouettes follow docs/art/gems.svg (type reads by
// shape, colour reinforces it) and are drawn faceted: the gem colour, a light top-left facet, a
// shaded lower-right facet, facet lines and a dark rim. Tool icons are 24 px line drawings in
// currentColor with a 1.75 stroke.

const GEM_SHAPES: Record<string, { outline: string; facets: string }> = {
  // Diamond: claw-set brilliant.
  d: {
    outline: 'M5 9 8.5 4.5h7L19 9l-7 11z',
    facets: 'M5 9h14 M10 9l2-4.5L14 9 M10 9l2 11 2-11',
  },
  // Sapphire: hexagonal column.
  b: {
    outline: 'M8 3.5h8l2.5 3.5v10L16 20.5H8L5.5 17V7z',
    facets: 'M5.5 7h13 M9.5 7v13.5 M14.5 7v13.5 M5.5 17h13',
  },
  // Topaz: waisted.
  y: {
    outline: 'M5.5 4h13L14 12l4.5 8h-13L10 12z',
    facets: 'M10 12h4 M12 4v16',
  },
  // Ruby: keep with battlements.
  r: {
    outline: 'M5 20.5V8h2.5V4.5h3V8h3V4.5h3V8H19v12.5z',
    facets: 'M5 12h14 M12 12v8.5',
  },
  // Emerald: spire.
  g: {
    outline: 'M12 3 17.5 20.5h-11z',
    facets: 'M12 3v17.5 M9.4 12.2h5.2',
  },
  // Opal: cup.
  e: {
    outline: 'M4.5 5h15L15 13.5v3l2 4H7l2-4v-3z',
    facets: 'M7.2 9.5h9.6 M12 5v8.5',
  },
  // Aquamarine: stepped.
  q: {
    outline: 'M9 3.5h6V8h3v5.5h2.5v7h-17v-7H6V8h3z',
    facets: 'M6 13.5h12 M9 8h6 M12 3.5v17',
  },
  // Amethyst: drum.
  p: {
    outline: 'M5 7.5a7 3 0 0 1 14 0v9a7 3 0 0 1-14 0z',
    facets: 'M5 7.5a7 3 0 0 0 14 0 M12 10.5v9',
  },
};
// Combined and special towers share one faceted star; the inspector names them.
const COMBINED = {
  outline: 'M12 3l2.6 6 6.4.4-4.9 4.1 1.6 6.5L12 16.4 6.3 20l1.6-6.5L3 9.4 9.4 9z',
  facets: 'M12 3v13.4 M3 9.4l9 7 9-7',
};

/** Shared gradients for the faceted gems; render once anywhere in the HUD. */
export function GlyphDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="gem-light" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
          <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="gem-shade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.45" stop-color="#000" stop-opacity="0" />
          <stop offset="1" stop-color="#000" stop-opacity="0.35" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Gem or tower silhouette; `type` is the basic gem letter (d, b, y, ...) or undefined for combined. */
export function GemGlyph({ type, class: cls = 'glyph' }: { type?: string; class?: string }) {
  const shape = (type && GEM_SHAPES[type]) || COMBINED;
  return (
    <svg class={cls} viewBox="0 0 24 24" aria-hidden="true">
      <path class="gem-body" d={shape.outline} />
      <path d={shape.outline} fill="url(#gem-light)" stroke="none" />
      <path d={shape.outline} fill="url(#gem-shade)" stroke="none" />
      <path class="gem-facets" d={shape.facets} />
      <path class="gem-rim" d={shape.outline} />
    </svg>
  );
}

export const ICONS: Record<string, ComponentChildren> = {
  iso: <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9" />,
  top: <path d="M4.5 4.5h15v15h-15z M4.5 12h15 M12 4.5v15" />,
  rotate: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3 M4.5 4v4.5H9" />,
  lock: <path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5 M5.5 10.5h13v9.5h-13z M12 14.5v2" />,
  camera: <path d="M4 8h3.5l1.8-2.5h5.4L16.5 8H20v11H4z M12 10.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  pause: <path d="M9 5.5v13 M15 5.5v13" />,
  hero: <path d="M5 18.5h14 M5.5 15.5 4.5 7.5 9 11l3-5.5 3 5.5 4.5-3.5-1 8z" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronUp: <path d="M6 15l6-6 6 6" />,
  close: <path d="M6.5 6.5l11 11 M17.5 6.5l-11 11" />,
  book: (
    <path d="M3.5 5.5c2.7-1 5.6-.8 8.5 1 2.9-1.8 5.8-2 8.5-1V19c-2.7-1-5.6-.8-8.5 1-2.9-1.8-5.8-2-8.5-1z M12 6.5V20" />
  ),
  meter: <path d="M4 20h16 M6.5 20v-6 M10.5 20V8 M14.5 20v-9 M18.5 20V5" />,
  route: <path d="M4 6h7v12h9 M16.5 14.5 20 18l-3.5 3.5" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  coin: (
    <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16 M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.9 2.5 2-1 2-2.5 2c-1.2 0-2.1-.6-2.6-1.6 M12 6.5V8 M12 16v1.5" />
  ),
};

/** Inline icon in currentColor for labels and buttons. */
export function Icon({ name, class: cls = 'icon' }: { name: keyof typeof ICONS; class?: string }) {
  return (
    <svg class={cls} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
