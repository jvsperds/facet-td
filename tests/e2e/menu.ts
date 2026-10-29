import type { Page } from '@playwright/test';

// Every setting lives in the hamburger menu (top left); these open and close it.
const button = (page: Page) => page.getByRole('button', { name: 'Menu', exact: true });

export async function openMenu(page: Page) {
  if ((await button(page).getAttribute('aria-expanded')) !== 'true') await button(page).click();
}

export async function closeMenu(page: Page) {
  if ((await button(page).getAttribute('aria-expanded')) === 'true') await button(page).click();
}
