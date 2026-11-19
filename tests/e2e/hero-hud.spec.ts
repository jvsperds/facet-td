import { expect, test } from '@playwright/test';
import type { Sim } from '../../src/sim/sim';

test('hero HUD keeps hero casts horizontal with dedicated keys and icons', async ({ page }) => {
  await page.goto('/?seed=17&wip');
  await page.waitForFunction(() => window.facet);
  await page.evaluate(() => {
    const { sim } = window.facet as unknown as { sim: Sim };
    sim.send(0, {
      type: 'hero-loadout',
      hero: 'h102',
      abilities: {
        gemtd_hero_huichun: 1,
        gemtd_hero_shanbi: 1,
        gemtd_hero_shouhu: 1,
      },
    });
    sim.send(0, { type: 'build', cell: { x: 12, y: 12 } });
  });
  await page.getByRole('button', { name: /Gem 1 of 5:/ }).click();
  await page.evaluate(() => {
    (window.facet as unknown as { sim: Sim }).sim.game.gems[0].name = 'gemtd_d1';
  });
  const commands = page.getByLabel('Selected gem commands');
  await expect(commands.getByLabel('Aim')).toBeVisible();
  const aimBox = await commands.locator('.aim').boundingBox();
  const toolsBox = await commands.locator('.gem-toolstrip').boundingBox();
  expect(toolsBox!.y - (aimBox!.y + aimBox!.height)).toBeLessThan(12);
  const bar = page.getByRole('region', { name: 'Hero abilities' });
  await expect(bar).toBeVisible();
  const dock = page.getByRole('region', { name: 'Hero HUD' });
  await expect(dock.getByRole('region', { name: 'Hero summary', exact: true })).toBeVisible();
  await expect(dock.getByRole('region', { name: 'Selection', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Selection', exact: true })).toBeVisible();
  await expect(dock.getByRole('region', { name: 'Hero abilities' })).toBeVisible();
  const heroBox = (await dock.boundingBox())!;
  const toolBox = (await page.getByRole('navigation', { name: 'Game controls' }).boundingBox())!;
  expect(Math.abs(heroBox.y + heroBox.height - toolBox.y - toolBox.height)).toBeLessThan(2);
  expect(heroBox.x + heroBox.width).toBeLessThanOrEqual(toolBox.x);
  const casts = bar.locator('.cmd');
  await expect(casts).toHaveCount(3);
  for (const [i, key] of ['Z', 'X', 'D'].entries()) {
    await expect(casts.nth(i)).toHaveAttribute('aria-keyshortcuts', key);
    await expect(casts.nth(i).locator('svg')).toHaveCount(1);
  }
  await page.evaluate(() => {
    const { sim } = window.facet as unknown as { sim: Sim };
    sim.game.gold = 1000;
    sim.game.castleHp = 50;
  });
  await page.keyboard.press('e');
  expect(
    await page.evaluate(
      () =>
        (window.facet as unknown as { sim: Sim }).sim.game.hero.cooldowns.gemtd_hero_huichun ?? 0,
    ),
  ).toBe(0);
  await page.keyboard.press('z');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window.facet as unknown as { sim: Sim }).sim.game.hero.cooldowns.gemtd_hero_huichun ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  const boxes = await casts.evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().top));
  expect(new Set(boxes).size).toBe(1);
  await expect(
    page.getByLabel('Selected gem commands').locator('[aria-keyshortcuts="Z"]'),
  ).toHaveCount(0);
});

test('settings categories isolate controls and wave info sits beside the menu', async ({
  page,
}) => {
  await page.goto('/?seed=17');
  await page.waitForFunction(() => window.facet);
  await expect(page.locator('.wave-info')).toBeVisible();
  await expect(page.locator('.round-clock .next-name')).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const settings = page.getByRole('group', { name: 'Settings', exact: true });
  await expect(settings.getByRole('button', { name: 'Turn left', exact: true })).toBeVisible();
  await settings.getByRole('button', { name: 'Audio', exact: true }).click();
  await expect(settings.getByRole('slider', { name: 'Master' })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Turn left', exact: true })).toBeHidden();
  await settings.getByRole('button', { name: 'Display', exact: true }).click();
  await expect(settings.getByRole('combobox', { name: 'Graphics' })).toBeVisible();
  await expect(settings.getByRole('slider', { name: 'Master' })).toBeHidden();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`hero HUD stays on screen at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?seed=17');
    await page.waitForFunction(() => window.facet);
    const dock = page.getByRole('region', { name: 'Hero HUD' });
    await expect(dock).toBeVisible();
    await expect(dock.getByRole('region', { name: 'Hero abilities' })).toBeVisible();
    const box = (await dock.boundingBox())!;
    expect(box.width / box.height).toBeGreaterThan(2.7);
    expect(await dock.evaluate((n) => n.scrollHeight <= n.clientHeight)).toBe(true);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(await dock.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
  });
}
