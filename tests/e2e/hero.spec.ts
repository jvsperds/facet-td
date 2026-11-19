import { expect, test } from '@playwright/test';
import type { Sim } from '../../src/sim/sim';

test('hero actions dialog and shortcut are removed', async ({ page }) => {
  await page.goto('/?seed=17&wip');
  await page.waitForFunction(() => window.facet);
  await expect(page.getByRole('button', { name: 'Hero', exact: true })).toHaveCount(0);
  await page.keyboard.press('h');
  await expect(page.getByRole('dialog', { name: 'Hero actions' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Display', exact: true }).click();
  await expect(page.getByRole('button', { name: /Hero actions/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Hero abilities' })).toBeVisible();
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

  const abilities = page.getByRole('region', { name: 'Hero abilities' });
  await expect(abilities).toBeVisible();
  await expect(abilities.getByRole('button', { name: 'Heal', exact: true })).toHaveAttribute(
    'aria-keyshortcuts',
    'Z',
  );
  await expect(page.getByRole('dialog', { name: 'Hero actions' })).toHaveCount(0);
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
