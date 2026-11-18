import { expect, test } from '@playwright/test';

test('tower showroom opens directly without replacing an autosave', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('facet-td:autosave', 'existing save'));
  await page.goto('/?preview=all');
  await expect(page.getByRole('button', { name: 'New game' })).toHaveCount(0);
  await expect(page.getByLabel('Game board')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const sim = (
          window as unknown as { facet?: { sim: { tick: number; game: { gems: unknown[] } } } }
        ).facet?.sim;
        return sim && { towers: sim.game.gems.length, tick: sim.tick > 0 };
      }),
    )
    .toEqual({ towers: expect.any(Number), tick: true });
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { facet: { sim: { game: { gems: unknown[] } } } }).facet.sim.game.gems
          .length,
    ),
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('facet-td:autosave'))).toBe(
    'existing save',
  );
});
