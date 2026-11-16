import { expect, test } from '@playwright/test';
import type { Sim } from '../../src/sim/sim';

test('offline loadout freely selects hero and skill level without spending gold', async ({
  page,
}) => {
  await page.goto('/?seed=17&wip'); // ?wip keeps the development-only free loadout editor.
  await page.waitForFunction(() => window.facet);
  await page.getByRole('button', { name: 'Hero', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Hero actions' });
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

test('title loadout builds a normal run with owned hero skills and gold costs', async ({
  page,
}) => {
  await page.goto('/?title&seed=17');
  await page.getByRole('button', { name: 'New game' }).click();
  const loadout = page.getByRole('dialog', { name: 'Hero loadout' });
  await expect(loadout).toBeVisible();
  await expect(loadout).toContainText('0 shells');
  await expect(loadout.getByRole('checkbox', { name: /Heal Lv/ })).toBeChecked();
  await loadout.getByRole('button', { name: 'Start run' }).click();
  await page.waitForFunction(() => window.facet);

  await page.getByRole('button', { name: 'Hero', exact: true }).click();
  const hero = page.getByRole('dialog', { name: 'Hero actions' });
  await expect(hero).toBeVisible();
  await expect(hero).toContainText('gold');
  await expect(hero.getByRole('button', { name: 'Apply loadout' })).toHaveCount(0);
});

test('title exposes settings, history and a resumable autosave', async ({ page }) => {
  await page.goto('/?title&seed=18');
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings.getByRole('slider', { name: 'Master' })).toBeVisible();
  await settings.getByRole('combobox', { name: 'Graphics' }).selectOption('low');
  await settings.getByRole('button', { name: 'Close Settings' }).click();
  await page.getByRole('button', { name: 'Run history' }).click();
  await expect(page.getByRole('dialog', { name: 'Run history' })).toContainText(
    'Finished runs will appear here',
  );
  await page.getByRole('button', { name: 'Close Run history' }).click();

  await page.getByRole('button', { name: 'New game' }).click();
  const loadout = page.getByRole('dialog', { name: 'Hero loadout' });
  await loadout.getByRole('combobox', { name: 'Difficulty' }).selectOption('3');
  await loadout.getByRole('checkbox', { name: 'Continue endless after wave 50' }).uncheck();
  await loadout.getByRole('button', { name: 'Start run' }).click();
  await page.waitForFunction(() => window.facet);
  await expect
    .poll(() => page.evaluate(() => (window.facet as unknown as { sim: Sim }).sim.config))
    .toMatchObject({ difficulty: 3, endless: false });
  await page.evaluate(() => {
    const sim = (window.facet as unknown as { sim: Sim }).sim;
    localStorage.setItem('facet-td:autosave', JSON.stringify(sim.save()));
  });
  await page.goto('/?title');
  await expect(page.getByRole('button', { name: 'Resume run' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume run' }).click();
  await page.waitForFunction(() => window.facet);
  await expect
    .poll(() => page.evaluate(() => (window.facet as unknown as { sim: Sim }).sim.config))
    .toMatchObject({ difficulty: 3, endless: false });
});
