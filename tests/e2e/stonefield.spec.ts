import { expect, test } from '@playwright/test';

test('production app shows the Stonefield welcome screen and WebGL viewport', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Stonefield' })).toBeVisible();
  const diagnostics = page.locator('details summary');
  if (await diagnostics.count()) await diagnostics.click();
  await expect(page.getByRole('button', { name: 'Enter world' })).toBeVisible();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
