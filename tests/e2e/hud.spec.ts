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
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // wraps to the last tool
  await expect(page.getByRole('button', { name: 'Pause' })).toBeFocused();

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
