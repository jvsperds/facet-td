import { expect, test } from '@playwright/test';
import type { Sim } from '../../src/sim/sim';

test('selection shows live attack cadence and the four implemented passive families', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);
  await page.evaluate(() => {
    const g = (window.facet as unknown as { sim: Sim }).sim.game;
    for (const [i, type] of [...'qebp'].entries())
      g.gems.push({
        id: i + 1,
        name: `gemtd_${type}1`,
        cell: { x: 12 + i * 2, y: 12 },
        cooldown: 0,
        target: null,
      });
  });
  const expected = [
    ['every 0.31s', '+200 attack speed'],
    ['every 0.83s', 'Aura: +20 attack speed within 5.19 cells'],
    ['every 0.83s', 'On hit: -60 movement speed for 3s'],
    ['every 0.50s', 'On hit: -2 armor for 3s'],
  ];
  for (let i = 0; i < expected.length; i++) {
    await page.waitForFunction(() => !window.facet.world.moving);
    const point = await page.evaluate((x) => window.facet.world.screenOf({ x, y: 12 }), 12 + i * 2);
    await page.mouse.click(point.x, point.y);
    for (const text of expected[i]) await expect(page.getByLabel('Selection')).toContainText(text);
  }
});
