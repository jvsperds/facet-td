import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { expect, test } from 'vitest';
import lock from '../data/baseline.lock.json';

const root = join(import.meta.dirname, '../data/baseline');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );

test('baseline is byte-for-byte the converted Gem TD data', () => {
  const actual = Object.fromEntries(
    files(root).map((f) => [
      relative(root, f).split(sep).join('/'),
      createHash('sha256').update(readFileSync(f)).digest('hex'),
    ]),
  );
  // Baseline is immutable: put changes in data/facet/ instead (docs/PLAN.md, Source of truth).
  expect(actual).toEqual(lock);
});

test('baseline covers every original map', async () => {
  for (const map of ['gemtd_1p', 'gemtd_coop', 'gemtd_race']) {
    const ents = JSON.parse(readFileSync(join(root, `maps/${map}.entities.json`), 'utf8'));
    const names = ents.map((e: { targetname?: string }) => e.targetname?.replace('[PR#]', ''));
    for (let i = 1; i <= 7; i++) expect(names).toContain(`path${i}`);
  }
});
