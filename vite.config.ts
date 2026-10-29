/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

// HUD icons are saved in the browser, keyed by a hash of every source that shapes a model, so a
// changed model is re-rendered and an unchanged one never is.
const iconSources = [
  ...readdirSync('docs/art/model-study')
    .filter((f) => f.endsWith('.js'))
    .map((f) => `docs/art/model-study/${f}`),
  'src/world/pieces.ts',
  'src/world/pedal-models.ts',
  'src/world/pedals.ts',
  'src/hud/TowerIcon.tsx',
];
const iconVersion = createHash('sha1')
  .update(iconSources.map((f) => readFileSync(f, 'utf8')).join('\0'))
  .digest('hex')
  .slice(0, 12);

export default defineConfig({
  base: './',
  define: { __ICON_VERSION__: JSON.stringify(iconVersion) },
  plugins: [preact(), viteSingleFile()],
  test: { include: ['tests/**/*.test.ts'] },
});
