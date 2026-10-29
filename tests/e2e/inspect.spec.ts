import { expect, test, type Page } from '@playwright/test';

// Selecting creeps (stats, abilities, effects) and the tower's aim options and effect cards.
type Cell = { x: number; y: number };
type Facet = {
  world: { moving: boolean; screenOf(c: Cell): { x: number; y: number } };
  sim: {
    send(player: number, cmd: unknown): void;
    game: {
      draft: number[];
      phase: string;
      creeps: { id: number; x: number; y: number }[];
      gems: { id: number; cell: Cell; aim?: number; level?: number }[];
    };
  };
};

/** Five gems in a row on the north side, the first kept: the wave starts. */
async function startWave(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => (window as unknown as { facet?: Facet }).facet);
  await page.evaluate(async () => {
    const { sim } = (window as unknown as { facet: Facet }).facet;
    for (const x of [20, 22, 24, 26, 28]) sim.send(0, { type: 'build', cell: { x, y: 30 } });
    await new Promise((r) => setTimeout(r, 300));
    sim.send(0, { type: 'keep', id: sim.game.draft[0], upgrade: 0 });
  });
}

test('clicking a creep shows its health, defences and abilities; it clears when deselected', async ({
  page,
}) => {
  await startWave(page);
  await page.waitForFunction(
    () => (window as unknown as { facet: Facet }).facet.sim.game.creeps.length >= 2,
  );
  await page.keyboard.press('p'); // hold the creeps still
  await page.waitForFunction(() => !(window as unknown as { facet: Facet }).facet.world.moving);
  const p = await page.evaluate(() => {
    const { world, sim } = (window as unknown as { facet: Facet }).facet;
    const c = sim.game.creeps[0];
    return world.screenOf({ x: c.x, y: c.y });
  });
  await page.mouse.click(p.x, p.y - 8);
  const info = page.getByLabel('Selection');
  await expect(info.getByRole('meter', { name: 'Health' })).toBeVisible();
  await expect(info).toContainText('Armor');
  await expect(info).toContainText('Speed');
  await expect(info).toContainText('Ground');
  await info.getByRole('button', { name: 'Deselect' }).click();
  await expect(info.getByRole('meter', { name: 'Health' })).toHaveCount(0);
});

test('a tower takes an aim mode and boss priority, and shows its MVP card', async ({ page }) => {
  await startWave(page);
  await page.keyboard.press('p');
  const tower = await page.evaluate(() => {
    const { sim } = (window as unknown as { facet: Facet }).facet;
    const g = sim.game.gems[0];
    g.level = 2; // two MVP awards
    return g.cell;
  });
  await page.waitForFunction(() => !(window as unknown as { facet: Facet }).facet.world.moving);
  const p = await page.evaluate(
    (c) => (window as unknown as { facet: Facet }).facet.world.screenOf(c),
    tower,
  );
  await page.mouse.click(p.x, p.y);
  const info = page.getByLabel('Selection');
  await expect(info.getByRole('listitem', { name: /MVP 2: \+20% damage/ })).toBeVisible();
  await page.keyboard.press('p'); // aim commands apply on the next tick
  await info.getByLabel('Aim').selectOption({ label: 'Lowest HP' });
  await info.getByRole('button', { name: 'Boss first' }).click();
  await expect(info.getByRole('button', { name: 'Boss first' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    await page.evaluate(() => (window as unknown as { facet: Facet }).facet.sim.game.gems[0].aim),
  ).toBe(2 + 8);

  // Hold fire stops the tower (to steer the MVP), shown as an effect; S resumes.
  await info.getByRole('button', { name: 'Hold fire' }).click();
  await expect(info.getByRole('listitem', { name: /Holding fire/ })).toBeVisible();
  await page.keyboard.press('s');
  await expect(info.getByRole('listitem', { name: /Holding fire/ })).toHaveCount(0);
});
