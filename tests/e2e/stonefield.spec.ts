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

test('first-person movement updates coordinates and Escape pauses before resume', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();

  const status = page.getByRole('status');
  await expect(status).toContainText('Exploring');
  const startingPosition = await status.textContent();
  await page.keyboard.down('KeyW');
  await expect(status).not.toHaveText(startingPosition ?? '', { timeout: 2_000 });
  await page.keyboard.up('KeyW');
  await expect(status).toContainText('Exploring');

  await page.keyboard.press('Escape');
  await expect(status).toContainText('Paused');
  await page.getByRole('button', { name: 'Resume world' }).click();
  await expect(status).toContainText('Exploring');
  expect(pageErrors).toEqual([]);
});

test('can place and break a block while inventory counts update', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  const canvas = page.getByTestId('game-canvas');
  const dirtSlot = page.getByRole('button', { name: /^1: Dirt/ });
  await expect(dirtSlot).toContainText('32');
  const stoneSlot = page.getByRole('button', { name: /^2: Stone/ });
  await expect(stoneSlot).toContainText('16');
  await canvas.click({ button: 'left' });
  await expect(stoneSlot).toContainText('17');
  await canvas.click({ button: 'right' });
  await expect(dirtSlot).toContainText('31');
});
