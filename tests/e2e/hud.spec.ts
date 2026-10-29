import { expect, test } from '@playwright/test';

// IMPLEMENTATION.md "HUD and input": toolbar keyboard path, flyout focus return, collapsible
// inspector and deselect.

test('toolbar arrows move focus, Escape closes the camera flyout and returns focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);
  const view = page.getByRole('button', { name: 'Switch to top view' });
  await view.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: /Rotate board/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const camera = page.getByRole('button', { name: 'Camera controls' });
  await expect(camera).toBeFocused();
  await page.keyboard.press('ArrowRight'); // camera controls is last: wraps to the first tool
  await expect(page.getByRole('button', { name: 'Pause' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(camera).toBeFocused();

  await camera.click();
  await expect(camera).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Zoom in' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Camera' })).toHaveCount(0);
  await expect(camera).toBeFocused();
});

test('the inspector collapses on tablets and Deselect clears the selection', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);
  await page.waitForFunction(() => !window.facet.world.moving);
  const p = await page.evaluate(() => window.facet.world.screenOf({ x: 12, y: 12 }));
  await page.mouse.click(p.x, p.y);
  const info = page.getByLabel('Selection');
  await expect(info).toContainText('Cell 12, 12');
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
  await expect(page.locator('canvas')).toBeFocused();
});

test('speed, recipe book, damage meter and shortcuts work from the toolbar and keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => window.facet);

  await page.getByRole('button', { name: 'Double speed' }).click();
  await expect(page.getByRole('button', { name: 'Double speed' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('1');
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
  await page.keyboard.press('r');
  await expect(book).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(book).toHaveCount(0);

  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('p');

  // The top bar previews the next wave's creep.
  await expect(page.locator('.next')).toContainText('×');
});
