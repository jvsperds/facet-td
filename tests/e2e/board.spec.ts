import { expect, test, type Page } from '@playwright/test';
import { closeMenu, openMenu } from './menu';

// IMPLEMENTATION.md "Implementation gate": fit, picking and view toggles at the five reference viewports.
const VIEWPORTS = [
  [1440, 900],
  [768, 1024],
  [390, 844],
  [320, 568],
  [844, 390],
];
const CORNERS = [
  { x: 1, y: 1 },
  { x: 37, y: 1 },
  { x: 1, y: 37 },
  { x: 37, y: 37 },
];

type Cell = { x: number; y: number };
declare global {
  interface Window {
    facet: { world: { moving: boolean; screenOf(c: Cell): { x: number; y: number } } };
  }
}
const settle = (page: Page) => page.waitForFunction(() => !window.facet.world.moving);
const screenOf = (page: Page, cell: Cell) =>
  page.evaluate((c) => window.facet.world.screenOf(c), cell);

async function pickMatches(page: Page, cell: Cell) {
  await settle(page);
  const p = await screenOf(page, cell);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByLabel('Selection')).toContainText(`Cell ${cell.x}, ${cell.y}`);
}

/** No board corner cell centre may sit under a HUD panel or off screen. */
async function cornersClear(page: Page) {
  await settle(page);
  const panels = await page.$$eval('[data-exclude]', (els) =>
    els.map((e) => e.getBoundingClientRect().toJSON()),
  );
  const vp = page.viewportSize()!;
  for (const c of CORNERS) {
    const p = await screenOf(page, c);
    expect(
      p.x > 0 && p.x < vp.width && p.y > 0 && p.y < vp.height,
      `cell ${c.x},${c.y} on screen`,
    ).toBe(true);
    for (const r of panels)
      expect(
        p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom,
        `cell ${c.x},${c.y} under a panel`,
      ).toBe(false);
  }
}

for (const [width, height] of VIEWPORTS)
  test(`board fit and picking at ${width}x${height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.facet);

    await cornersClear(page);
    await pickMatches(page, { x: 5, y: 19 });
    await expect(page.getByLabel('Selection')).toContainText('Checkpoint 1');

    await openMenu(page);
    await page.getByRole('button', { name: 'Switch to top view' }).click();
    await closeMenu(page);
    await cornersClear(page);
    await pickMatches(page, { x: 30, y: 8 });

    await openMenu(page);
    await page.getByRole('button', { name: 'Turn right' }).click();
    await closeMenu(page);
    await cornersClear(page);
    await pickMatches(page, { x: 2, y: 36 });

    await openMenu(page);
    await page.getByRole('button', { name: 'Switch to isometric view' }).click();
    await closeMenu(page);
    await cornersClear(page);
    await pickMatches(page, { x: 19, y: 19 });
    expect(errors).toEqual([]);
  });

test('toggling views keeps selection and camera state, and the keyboard cursor moves by screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.facet);
  await pickMatches(page, { x: 1, y: 1 });
  const before = await screenOf(page, { x: 1, y: 1 });
  await openMenu(page);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /Switch to/ }).click();
  await settle(page);
  expect(await screenOf(page, { x: 1, y: 1 })).toEqual(before);
  await expect(page.getByLabel('Selection')).toContainText('Cell 1, 1');

  // Top view, rotation 0: up arrow is board north (+y).
  await page.getByRole('button', { name: 'Switch to top view' }).click();
  await closeMenu(page);
  await page.getByRole('img', { name: /^Game board/ }).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await settle(page); // activation is refused while the view is still moving
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Selection')).toContainText('Cell 2, 2');
});

test('rotate mode drag turns the board instead of panning, and reset restores the preset', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.facet);
  await settle(page);
  const start = await screenOf(page, { x: 1, y: 1 });
  await openMenu(page);
  await page.getByRole('button', { name: /Rotate board/ }).click();
  await expect(page.getByRole('button', { name: /Rotate board/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(800, 450, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Selection')).not.toContainText('Cell'); // a drag never picks
  expect(await screenOf(page, { x: 1, y: 1 })).not.toEqual(start);
  await openMenu(page);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await closeMenu(page);
  await settle(page);
  expect(await screenOf(page, { x: 1, y: 1 })).toEqual(start);
});
