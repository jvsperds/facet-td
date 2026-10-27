import { expect, test, type Page } from '@playwright/test';

// IMPLEMENTATION.md "HUD and input" checks for phase 3: the five-slot summary, keep rules, refusals.
type Cell = { x: number; y: number };
type Facet = {
  world: { moving: boolean; screenOf(c: Cell): { x: number; y: number } };
  sim: { game: { draft: number[]; gems: { id: number; cell: Cell }[]; phase: string } };
};
// Copy only the checked fields: the full game state is large and slow to serialize.
const facet = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as { facet: Facet }).facet.sim.game;
    return { draft: g.draft, gems: g.gems.map(({ id, cell }) => ({ id, cell })), phase: g.phase };
  });

async function select(page: Page, cell: Cell) {
  await page.waitForFunction(() => !(window as unknown as { facet: Facet }).facet.world.moving);
  const p = await page.evaluate(
    (c) => (window as unknown as { facet: Facet }).facet.world.screenOf(c),
    cell,
  );
  await page.mouse.click(p.x, p.y);
  await expect(page.getByLabel('Selection')).toContainText(`Cell ${cell.x}, ${cell.y}`);
}

test('placing five gems fills the slots; slots select their gem; keep starts the wave', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=5');
  await page.waitForFunction(() => (window as unknown as { facet?: Facet }).facet);
  const slots = page.getByLabel('This round').getByRole('button');
  await expect(slots).toHaveCount(5);
  await expect(slots.first()).toBeDisabled();
  await expect(slots.first()).toHaveAccessibleName('Gem 1 of 5: not placed');

  // Illegal: a waypoint offers no build action; a cell that would cut the route is refused with a reason.
  await select(page, { x: 5, y: 19 });
  await expect(page.getByRole('button', { name: 'Place gem' })).toHaveCount(0);

  const cells = [
    { x: 12, y: 12 },
    { x: 14, y: 12 },
    { x: 16, y: 12 },
    { x: 18, y: 12 },
  ];
  for (const c of cells) {
    await select(page, c);
    await page.getByRole('button', { name: 'Place gem' }).click();
    await expect(
      page.getByRole('button', { name: new RegExp(`cell ${c.x}, ${c.y}$`) }),
    ).toBeVisible();
  }
  // Keep is refused until all five are placed.
  await select(page, cells[0]);
  await expect(page.getByRole('button', { name: 'Keep', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Selection')).toContainText('Place all five gems first.');

  await select(page, { x: 20, y: 12 });
  await page.getByRole('button', { name: 'Place gem' }).click();
  await expect(slots.nth(4)).toBeEnabled();

  // Each slot selects the same gem as the board.
  const game = await facet(page);
  for (let i = 0; i < 5; i++) {
    await slots.nth(i).click();
    const gem = game.gems.find((g) => g.id === game.draft[i])!;
    await expect(page.getByLabel('Selection')).toContainText(`Cell ${gem.cell.x}, ${gem.cell.y}`);
    await expect(slots.nth(i)).toHaveAttribute('aria-pressed', 'true');
  }

  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.getByLabel('This round')).toContainText('Wave 1');
  expect((await facet(page)).phase).toBe('wave');
  // The four others became stones; the board refuses building during the wave.
  await select(page, { x: 12, y: 12 });
  await expect(page.getByLabel('Selection')).toContainText('You can only build between waves.');
});
