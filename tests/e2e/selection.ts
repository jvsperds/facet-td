import { expect, type Page } from '@playwright/test';

export async function expectSelected(page: Page, cell: { x: number; y: number }) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cameraModule = '/src/input/camera.ts';
        const { selected } = await import(cameraModule);
        return selected.value;
      }),
    )
    .toEqual(cell);
}
