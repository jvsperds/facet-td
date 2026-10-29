import { expect, test } from '@playwright/test';
import type { Sim } from '../../src/sim/sim';

test('offline loadout freely selects hero and skill level without spending gold', async ({
  page,
}) => {
  await page.goto('/?seed=17&wip'); // the hero is hidden for now; ?wip shows it
  await page.waitForFunction(() => window.facet);
  await page.getByRole('button', { name: 'Hero', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Offline hero' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Hero', exact: true }).selectOption('h102');
  await dialog.locator('.hero-skills select').first().selectOption('4');
  await dialog.getByRole('button', { name: 'Apply loadout' }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = (window.facet as unknown as { sim: Sim }).sim.game;
        return { hero: g.hero.selected, level: g.hero.abilities.gemtd_hero_huichun, gold: g.gold };
      }),
    )
    .toEqual({ hero: 'h102', level: 4, gold: 0 });
  await page.getByRole('button', { name: 'Hero', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.hero-skills select').first()).toHaveValue('4');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
