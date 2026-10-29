import { expect, test, type Page } from '@playwright/test';
import type { Sim } from '../../src/sim/sim';

// Issue #13: double-clicking an open cell or a stone places a gem straight away.

type Cell = { x: number; y: number };
const game = (page: Page) =>
  page.evaluate(() => {
    const g = (window.facet as unknown as { sim: Sim }).sim.game;
    return { cells: g.gems.map((gem) => gem.cell), draft: g.draft.length };
  });
async function dblclick(page: Page, cell: Cell) {
  await page.waitForFunction(() => !window.facet.world.moving);
  const p = await page.evaluate((c) => window.facet.world.screenOf(c), cell);
  await page.mouse.dblclick(p.x, p.y);
}

test('double-click places a gem on an open cell or a stone, but not on a waypoint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);

  await dblclick(page, { x: 12, y: 12 });
  await expect.poll(async () => (await game(page)).draft).toBe(1);
  expect((await game(page)).cells).toContainEqual({ x: 12, y: 12 });

  const stone = await page.evaluate(() => {
    const g = (window.facet as unknown as { sim: Sim }).sim.game;
    return [...g.stones.values()].find((s) => g.canBuild(s).ok)!;
  });
  await dblclick(page, stone);
  await expect.poll(async () => (await game(page)).draft).toBe(2);

  await dblclick(page, { x: 5, y: 19 }); // checkpoint 1
  await page.waitForTimeout(300);
  expect((await game(page)).draft).toBe(2);

  // A single click still only selects.
  await page.waitForFunction(() => !window.facet.world.moving);
  const p = await page.evaluate(() => window.facet.world.screenOf({ x: 14, y: 12 }));
  await page.mouse.click(p.x, p.y);
  await expect(page.getByLabel('Selection')).toContainText('Cell 14, 12');
  await page.waitForTimeout(500);
  expect((await game(page)).draft).toBe(2);
});
