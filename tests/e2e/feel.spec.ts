import { expect, test } from '@playwright/test';
import type { Sim } from '../../src/sim/sim';

type Runtime = { sim: Sim };

test('sound preference, route toggle and wave/kill/castle feedback work through the running game', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);
  await page.getByRole('button', { name: 'Camera controls' }).click();
  const routes = page.getByRole('button', { name: 'Show routes', exact: true });
  await routes.click();
  await expect(routes).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Sound on', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sound off', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Camera controls' }).click();
  await expect(page.getByRole('button', { name: 'Sound off', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sound off', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const sim = (window.facet as unknown as Runtime).sim;
    for (const x of [12, 14, 16, 18, 20]) sim.send(0, { type: 'build', cell: { x, y: 12 } });
  });
  await page.waitForFunction(
    () => (window.facet as unknown as Runtime).sim.game.draft.length === 5,
  );
  await page.evaluate(() => {
    const sim = (window.facet as unknown as Runtime).sim;
    sim.send(0, { type: 'keep', id: sim.game.draft[0], upgrade: 0 });
  });
  await expect(page.getByRole('status')).toContainText('Wave 1 started');
  await page.evaluate(() => {
    const sim = (window.facet as unknown as Runtime).sim;
    const g = sim.game;
    const c = g.creeps[0];
    const exit = g.flyRoute.at(-1)!;
    Object.assign(c, { x: exit.x, y: exit.y, step: g.route.length, damage: 3 });
    sim.tick = 30;
  });
  await expect(page.getByRole('status')).toContainText('Castle hit: −3 HP. 97 HP remaining.');
  await page.waitForFunction(() => (window.facet as unknown as Runtime).sim.game.creeps.length > 0);
  await page.evaluate(() => {
    const g = (window.facet as unknown as Runtime).sim.game;
    const gem = g.gems[0];
    gem.cooldown = 0;
    Object.assign(g.creeps[0], { x: gem.cell.x + 1, y: gem.cell.y, hp: 0.001, speed: 0 });
  });
  await expect(page.getByLabel('Wave rewards')).toContainText('1 kills · +5 gold');
  await page.evaluate(() => {
    const g = (window.facet as unknown as Runtime).sim.game;
    Object.assign(g, { toSpawn: 0, creeps: [] });
  });
  await expect(page.getByRole('status')).toContainText('Wave 1 cleared');
  expect(errors).toEqual([]);
});

test('missing audio and reduced motion keep the board and settings usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() =>
    Object.defineProperty(window, 'AudioContext', { value: undefined }),
  );
  await page.goto('/?seed=5');
  await page.getByRole('button', { name: 'Camera controls' }).click();
  await expect(page.getByRole('button', { name: 'Sound unavailable' })).toBeDisabled();
  await page.getByRole('button', { name: 'Show routes', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to top view' }).click();
  expect(await page.evaluate(() => window.facet.world.moving)).toBe(false);
});
