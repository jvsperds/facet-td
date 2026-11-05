import { expect, test } from '@playwright/test';
import type { Sim } from '../../src/sim/sim';
import { expectSelected } from './selection';

test('number keys select draft gems; a double press keeps, while repeat and incomplete drafts do not', async ({
  page,
}) => {
  await page.goto('/?seed=42');
  await page.waitForFunction(() => window.facet);
  await page.evaluate(() => {
    const { sim } = window.facet as unknown as { sim: Sim };
    for (const x of [12, 14]) sim.send(0, { type: 'build', cell: { x, y: 12 } });
  });
  await expect(page.getByRole('button', { name: /Gem 2 of 5:/ })).toBeEnabled();
  await page.keyboard.press('2');
  await page.keyboard.press('2');
  await expectSelected(page, { x: 14, y: 12 });
  expect(await page.evaluate(() => (window.facet as unknown as { sim: Sim }).sim.game.phase)).toBe(
    'build',
  );
  await page.evaluate(() => {
    const { sim } = window.facet as unknown as { sim: Sim };
    for (const x of [16, 18, 20]) sim.send(0, { type: 'build', cell: { x, y: 12 } });
  });
  await expect(page.getByRole('button', { name: /Gem 5 of 5:/ })).toBeEnabled();
  for (let i = 1; i <= 5; i++) {
    await page.keyboard.press(String(i));
    await expect(page.getByRole('button', { name: new RegExp(`Gem ${i} of 5:`) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  await page.keyboard.down('1');
  await page.keyboard.down('1');
  await page.keyboard.up('1');
  expect(await page.evaluate(() => (window.facet as unknown as { sim: Sim }).sim.game.phase)).toBe(
    'build',
  );
  await page.keyboard.press('2');
  await page.keyboard.press('2');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = (window.facet as unknown as { sim: Sim }).sim.game;
        return { phase: g.phase, cell: g.gems[0]?.cell };
      }),
    )
    .toEqual({ phase: 'wave', cell: { x: 14, y: 12 } });
});

test('control strip sets all four speeds without number-key shortcuts', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.waitForFunction(() => window.facet);
  const strip = page.getByLabel('Game controls');
  for (const name of ['Normal speed', 'Double speed', 'Quadruple speed', 'Ten times speed']) {
    const button = strip.getByRole('button', { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(strip.getByRole('button', { name: /Place|Remove/ })).toHaveCount(0);
  await strip.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(strip.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await strip.getByRole('button', { name: 'Camera controls' }).click();
  await expect(page.getByRole('group', { name: 'Settings' })).toBeVisible();
});

test('combining uses the selected draft gem while board tools stay available', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=42');
  await page.waitForFunction(() => window.facet);
  await page.evaluate(() => {
    const { sim } = window.facet as unknown as { sim: Sim };
    for (const x of [12, 14, 16, 18, 20]) sim.send(0, { type: 'build', cell: { x, y: 12 } });
  });
  await page.waitForFunction(
    () => (window.facet as unknown as { sim: Sim }).sim.game.draft.length === 5,
  );
  await page.evaluate(() => {
    const game = (window.facet as unknown as { sim: Sim }).sim.game;
    const names = ['gemtd_b1', 'gemtd_y1', 'gemtd_d1', 'gemtd_q1', 'gemtd_p1'];
    game.draft.forEach((id, i) => {
      game.gems.find((g) => g.id === id)!.name = names[i];
    });
  });
  await page.getByRole('button', { name: /Gem 2 of 5:/ }).click();
  const selection = page.getByLabel('Selection', { exact: true });
  const actions = page.getByLabel('Selected gem commands', { exact: true });
  await expect(selection).toContainText('Chipped topaz');
  await expect(actions.getByLabel('Recipe ingredients')).toContainText('B1');
  await expect(actions.getByLabel('Recipe ingredients')).toContainText('Y1');
  await expect(actions.getByLabel('Recipe ingredients')).toContainText('D1');
  await expect(page.getByLabel('Game controls')).toBeVisible();
  await expect(actions.getByRole('combobox')).toHaveCount(0);
  await expect(actions.getByRole('button', { name: 'Keep', exact: true })).toBeEnabled();
  await expect(actions.getByRole('button', { name: 'Downgrade and keep' })).toBeDisabled();
  await actions.getByRole('button', { name: /Combine: Silver/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = (window.facet as unknown as { sim: Sim }).sim.game;
        return { phase: g.phase, name: g.gemAt({ x: 14, y: 12 })?.name };
      }),
    )
    .toEqual({ phase: 'wave', name: 'gemtd_baiyin' });
  await expect(selection).toContainText('Silver');
  await expect(selection).toContainText('Cell 14, 12');
});

for (const [width, height] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
  [320, 568],
  [844, 390],
]) {
  test(`corner panels fit and leave board picking clear at ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?seed=42');
    await page.waitForFunction(() => window.facet);
    const boxes = await page.locator('[data-exclude]').evaluateAll((nodes) =>
      nodes
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            name: el.getAttribute('aria-label'),
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        })
        .filter((r) => r.width && r.height),
    );
    for (const b of boxes) {
      expect(b.left, `${b.name} left`).toBeGreaterThanOrEqual(0);
      expect(b.right, `${b.name} right`).toBeLessThanOrEqual(width);
      expect(b.top, `${b.name} top`).toBeGreaterThanOrEqual(0);
      expect(b.bottom, `${b.name} bottom`).toBeLessThanOrEqual(height);
    }
    await expect(page.getByLabel('Game stats')).toContainText('Castle');
    await expect(page.getByLabel('Game stats')).toContainText('Gold');
    await expect(page.getByLabel('Game controls')).toBeVisible();
    await page.waitForFunction(() => !window.facet.world.moving);
    const point = await page.evaluate(() => window.facet.world.screenOf({ x: 12, y: 12 }));
    await page.mouse.click(point.x, point.y);
    await expectSelected(page, { x: 12, y: 12 });
    await expect(page.getByLabel('Selection', { exact: true })).toHaveCount(0);
  });
}
