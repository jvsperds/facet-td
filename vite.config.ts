/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { layer, versionOf, type Files } from './src/data/version';

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

/** Every JSON file under `root`, parsed, keyed by its path relative to `root`. */
function readLayer(root: string): Files {
  const files: Files = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.json'))
        files[relative(root, path).split(sep).join('/')] = JSON.parse(readFileSync(path, 'utf8'));
    }
  };
  walk(root);
  return files;
}

// The data version hashes the whole baseline (and Facet layer) once here, not on every boot.
const baseline = readLayer('data/baseline');
const facet = readLayer('data/facet');
const dataVersion = {
  classic: versionOf(layer('classic', baseline, facet)),
  facet: versionOf(layer('facet', baseline, facet)),
};

/**
 * The 1-player map's entity list is 0.6 MB of decor; the board reads only the route's path corners.
 * Bundle just those, with the fields the board reads (the file on disk is untouched).
 */
function trimEntities(): Plugin {
  return {
    name: 'facet-trim-entities',
    enforce: 'pre',
    load(id) {
      if (!id.replace(/\\/g, '/').endsWith('data/baseline/maps/gemtd_1p.entities.json')) return;
      const all = JSON.parse(readFileSync(id.split('?')[0], 'utf8')) as Record<string, unknown>[];
      return JSON.stringify(
        all
          .filter((e) => e.classname === 'path_corner')
          .map(({ classname, targetname, origin }) => ({ classname, targetname, origin })),
      );
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __ICON_VERSION__: JSON.stringify(iconVersion),
    __DATA_VERSION__: JSON.stringify(dataVersion),
  },
  plugins: [trimEntities(), preact(), viteSingleFile()],
  test: { include: ['tests/**/*.test.ts'] },
});
