import { expect, test } from '@playwright/test';
import { closeMenu, openMenu } from './menu';

// IMPLEMENTATION.md "HUD and input": the settings menu's focus return, collapsible inspector and
// deselect.

test('one hamburger menu holds every setting; Escape closes it and returns focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  const settings = page.getByRole('group', { name: 'Settings' });
  await expect(settings).toHaveCount(0);
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['Switch to top view', 'Recipes', 'Show routes'])
    await expect(settings.getByRole('button', { name, exact: true })).toBeVisible();
  await settings.getByRole('button', { name: 'Zoom in' }).focus();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect(menu).toBeFocused();

  // A press outside closes it too.
  await menu.click();
  await page.mouse.click(720, 450);
  await expect(settings).toHaveCount(0);
});

test('the inspector collapses on tablets and Deselect clears the selection', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);
  await page.waitForFunction(() => !window.facet.world.moving);
  const cell = await page.evaluate(() => {
    const g = (
      window.facet as unknown as {
        sim: { game: { stones: Map<number, { x: number; y: number }> } };
      }
    ).sim.game;
    return [...g.stones.values()][0];
  });
  const p = await page.evaluate((c) => window.facet.world.screenOf(c), cell);
  await page.mouse.click(p.x, p.y);
  const info = page.getByLabel('Selection');
  await expect(info).toContainText(`Cell ${cell.x}, ${cell.y}`);
  const before = (await info.boundingBox())!.height;

  await page.getByRole('button', { name: 'Hide details' }).click();
  await expect(page.getByRole('button', { name: 'Show details' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect((await info.boundingBox())!.height).toBeLessThan(before);
  await expect(page.getByRole('button', { name: 'Place gem' })).toBeVisible();

  await page.getByRole('button', { name: 'Deselect' }).click();
  await expect(info).not.toContainText('Cell 12, 12');
  await expect(page.getByRole('img', { name: /^Game board/ })).toBeFocused();
});

test('speed, recipe book, damage meter and shortcuts work from the toolbar and keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);

  await openMenu(page);
  await page.getByRole('button', { name: 'Double speed' }).click();
  await expect(page.getByRole('button', { name: 'Double speed' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Normal speed' }).click();
  await expect(page.getByRole('button', { name: 'Normal speed' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Recipes' }).click();
  const book = page.getByRole('region', { name: 'Recipe book' });
  await expect(book).toBeVisible();
  await book.getByRole('searchbox', { name: 'Search recipes' }).fill('malachite');
  // The result and every recipe using it as an ingredient match.
  await expect(book.getByRole('listitem').first()).toContainText('Malachite');
  await book.getByRole('searchbox', { name: 'Search recipes' }).fill('zzz');
  await expect(book.getByRole('listitem')).toContainText('No recipe matches');
  await book.getByRole('tab', { name: 'Pedals' }).click();
  await book.getByRole('searchbox', { name: 'Search recipes' }).fill('');
  await expect(book.getByRole('listitem').first()).toBeVisible();
  await book.getByRole('button', { name: 'Close recipes' }).click();
  await expect(book).toHaveCount(0);
  await closeMenu(page);
  await page.keyboard.press('g');
  await expect(book).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(book).toHaveCount(0);

  await openMenu(page);
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('p');

  // The round clock previews the next wave's creep.
  await expect(page.locator('.next')).toContainText('×');
});

test('T toggles the view; Esc with nothing selected opens the menu; recipes pin beside the board', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);

  // With nothing selected the command card shows the builder; the hero waits behind ?wip.
  await expect(page.getByLabel('Selection')).toContainText('Build lv');
  await expect(page.getByRole('button', { name: 'Hero', exact: true })).toHaveCount(0);

  await openMenu(page);
  await page.keyboard.press('t');
  await expect(page.getByRole('button', { name: 'Switch to isometric view' })).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.getByRole('button', { name: 'Switch to top view' })).toBeVisible();

  await closeMenu(page);
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await expect(page.getByLabel('Round', { exact: true })).toContainText('Paused');
  await menu.getByRole('button', { name: 'New run' }).click();
  await expect(menu).toContainText('progress is lost');
  await menu.getByRole('button', { name: 'Back' }).click();
  await menu.getByRole('button', { name: /^Resume/ }).click();
  await expect(menu).toHaveCount(0);
  await openMenu(page);
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await page.getByRole('button', { name: 'Recipes' }).click();
  const book = page.getByRole('region', { name: 'Recipe book' });
  await book.getByRole('button', { name: 'Pin Malachite' }).click();
  await page.getByRole('button', { name: 'Close recipes' }).click();
  const pinnedPanel = page.getByRole('region', { name: 'Pinned recipes' });
  await expect(pinnedPanel).toContainText('Malachite');
  await pinnedPanel.getByRole('button', { name: 'Unpin Malachite' }).click();
  await expect(pinnedPanel).toHaveCount(0);
});

test('Q arms placing so the next picked cell gets a gem; W removes a stone; Esc cancels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);
  await page.waitForFunction(() => !window.facet.world.moving);
  const game = () =>
    page.evaluate(() => {
      const g = (window.facet as unknown as { sim: { game: Game } }).sim.game;
      return { draft: g.draft.length, stones: g.stones.size };
    });
  type Game = { draft: number[]; stones: Map<number, unknown> };
  type Cell = { x: number; y: number };

  await page.keyboard.press('q');
  await expect(page.locator('.targeting')).toBeVisible();
  const p = await page.evaluate(() => window.facet.world.screenOf({ x: 12, y: 12 }));
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await game()).draft).toBe(1);
  // One cast per press, as in Dota: the next click selects again.
  await expect(page.locator('.targeting')).toHaveCount(0);

  await page.keyboard.press('q');
  await expect(page.locator('.targeting')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.targeting')).toHaveCount(0);

  // W on a stone removes it.
  const stone = await page.evaluate(() => {
    const g = (window.facet as unknown as { sim: { game: { stones: Map<number, Cell> } } }).sim
      .game;
    return [...g.stones.values()][0];
  });
  const before = (await game()).stones;
  await page.keyboard.press('w');
  const s = await page.evaluate((c) => window.facet.world.screenOf(c), stone);
  await page.mouse.click(s.x, s.y);
  await expect.poll(async () => (await game()).stones).toBe(before - 1);
});

test('audit HUD conveniences remain visible and keyboard-accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);

  await expect(page.locator('.notice-banner')).toBeVisible();
  await expect(page.locator('.clock-res')).toContainText('Castle');
  await expect(page.locator('.clock-res')).toContainText('Gold');

  await page.getByRole('img', { name: /^Game board/ }).focus();
  const before = await page.evaluate(async () => {
    const cameraModule = '/src/input/camera.ts';
    const { view } = await import(cameraModule);
    return view.value.zoom;
  });
  await page.keyboard.press('+');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cameraModule = '/src/input/camera.ts';
        const { view } = await import(cameraModule);
        return view.value.zoom;
      }),
    )
    .not.toBe(before);

  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Controls and help' });
  await expect(help).toBeVisible();
  await expect(help).toContainText('Place gem');
  await help.getByRole('button', { name: 'Close help' }).click();

  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await expect(menu).not.toContainText('Seed 5');
  await expect(menu.getByRole('button', { name: 'Show seed' })).toBeVisible();
});

test('phone recipe book is a viewport sheet and landscape notices clear the draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);
  await page.getByRole('button', { name: 'Recipe book' }).click();
  const sheet = page.locator('.recipe-sheet');
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await sheet.getByRole('button', { name: 'Close recipes' }).click();

  await page.setViewportSize({ width: 844, height: 390 });
  const draft = await page.getByLabel('This round').boundingBox();
  const notice = await page.locator('.notice-banner').boundingBox();
  expect(draft).not.toBeNull();
  expect(notice).not.toBeNull();
  const overlap = !(
    notice!.x + notice!.width <= draft!.x ||
    draft!.x + draft!.width <= notice!.x ||
    notice!.y + notice!.height <= draft!.y ||
    draft!.y + draft!.height <= notice!.y
  );
  expect(overlap).toBe(false);

  await page.waitForFunction(() => !window.facet.world.moving);
  const point = await page.evaluate(() => window.facet.world.screenOf({ x: 12, y: 12 }));
  await page.mouse.click(point.x, point.y);
  const place = page.getByRole('button', { name: 'Place gem' });
  await expect(place).toBeVisible();
});
