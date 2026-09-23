import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function setInitialWorldTime(
  page: Page,
  worldTime: number,
  player: {
    readonly x: number;
    readonly z: number;
    readonly y: number;
    readonly health?: number;
  } = {
    x: 8,
    z: 8,
    y: 80,
  },
) {
  await page.addInitScript(
    ({ time, startPlayer }) => {
      localStorage.setItem(
        'stonefield.worlds.v1',
        JSON.stringify({
          version: 1,
          worlds: [{ id: 'world-default', name: 'Quiet Valley', seed: 'quiet-valley' }],
        }),
      );
      localStorage.setItem(
        'stonefield.world.v2.world-default',
        JSON.stringify({
          version: 2,
          worldId: 'world-default',
          worldName: 'Quiet Valley',
          seed: 'quiet-valley',
          worldTime: time,
          player: {
            chunkX: 0,
            chunkZ: 0,
            localX: startPlayer.x,
            localZ: startPlayer.z,
            y: startPlayer.y,
            yaw: 0,
            pitch: -0.4,
          },
          inventory: [{ itemId: 11, count: 16 }],
          mutations: [],
          survival: {
            health: startPlayer.health ?? 20,
            hunger: 20,
            activityProgress: 0,
            starvationProgress: 0,
            regenerationProgress: 0,
          },
          hotbar: [2, 3, 11, 18, 19, 23, 9, 4, 10],
          durability: [],
        }),
      );
    },
    { time: worldTime, startPlayer: player },
  );
}

test('opening the source file directly explains how to launch the game', async ({ page }) => {
  await page.goto(pathToFileURL(resolve(process.cwd(), 'index.html')).href);
  await expect(page.getByRole('heading', { name: 'Run Stonefield locally' })).toBeVisible();
  await expect(page.getByText('npm run dev')).toBeVisible();
});

test('explains the required public signaling setup when online hosting is not configured', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Worlds & online play' }).click();
  await page.getByRole('button', { name: 'Host Quiet Valley online' }).click();

  await expect(page.getByRole('status')).toHaveText(
    /Online play needs a deployed signaling service.*VITE_SIGNALING_URL.*docs\/MULTIPLAYER_HOSTING\.md/,
  );
});

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
  await expect(page.getByTestId('fps-counter')).toHaveText(/FPS · \d+/, { timeout: 2_000 });
  await page.getByRole('button', { name: 'Enter world' }).click();

  const status = page.getByRole('status');
  const welcomePanel = page.locator('.welcome-panel');
  const canvas = page.getByTestId('game-canvas');
  await expect(page.locator('.game-shell')).toHaveAttribute('data-state', 'playing');
  await expect(page.getByRole('heading', { name: 'Stonefield' })).toBeHidden();
  await expect(status).toBeVisible();
  await expect(status).toContainText('Exploring');
  await canvas.hover({ position: { x: 640, y: 360 } });
  await page.mouse.wheel(0, 100);
  await expect(page.locator('.hotbar-slot[aria-pressed="true"]')).toHaveAttribute(
    'data-item-id',
    '3',
  );
  await page.mouse.wheel(0, -100);
  await expect(page.locator('.hotbar-slot[aria-pressed="true"]')).toHaveAttribute(
    'data-item-id',
    '2',
  );
  await page.mouse.wheel(0, -100);
  await expect(page.locator('.hotbar-slot[aria-pressed="true"]')).toHaveAttribute(
    'data-item-id',
    '10',
  );
  await page.keyboard.press('e');
  const uncanceledInventoryWheel = await canvas.evaluate((element) =>
    element.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }),
    ),
  );
  expect(uncanceledInventoryWheel).toBe(true);
  await expect(page.locator('.hotbar-slot[aria-pressed="true"]')).toHaveAttribute(
    'data-item-id',
    '10',
  );
  await page.keyboard.press('e');
  const startingPosition = await status.textContent();
  await page.keyboard.down('KeyW');
  await expect(status).not.toHaveText(startingPosition ?? '', { timeout: 2_000 });
  await page.keyboard.up('KeyW');
  await expect(status).toContainText('Exploring');

  await page.keyboard.press('Escape');
  await expect(page.locator('.game-shell')).toHaveAttribute('data-state', 'paused');
  await expect(welcomePanel).toBeVisible();
  await expect(status).toContainText('Paused');
  await page.getByRole('button', { name: 'Resume world' }).click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-state', 'playing');
  await expect(page.getByRole('heading', { name: 'Stonefield' })).toBeHidden();
  await expect(status).toContainText('Exploring');
  expect(pageErrors).toEqual([]);
});

test('switches Survival and Creative using Alt+G or the pause-menu toggle', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  const mode = page.getByTestId('game-mode-indicator');
  await expect(mode).toHaveText('Survival');

  await page.keyboard.press('Alt+g');
  await expect(mode).toHaveText('Creative');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('flight-indicator')).toHaveText('Flight · On');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Switch to Survival' }).click();
  await expect(mode).toHaveText('Survival');
  await expect(page.getByTestId('flight-indicator')).toHaveText('Flight · Off');
});

test('Creative gives unlimited placement and restores the Survival hotbar and inventory', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  const mode = page.getByTestId('game-mode-indicator');
  const canvas = page.getByTestId('game-canvas');

  await page.keyboard.press('Alt+g');
  await page.keyboard.press('e');
  await page.getByRole('gridcell', { name: 'Bedrock, unlimited' }).click();
  await page.getByRole('button', { name: 'Assign selected block to hotbar' }).click();
  await page.getByRole('button', { name: 'Close inventory' }).click();
  await expect(page.locator('.hotbar-slot[aria-pressed="true"]')).toContainText('∞');

  await canvas.click({ button: 'right' });
  await expect(page.getByRole('status')).toHaveText('Block placed.');
  await expect(page.locator('.hotbar-slot[aria-pressed="true"]')).toContainText('∞');
  await canvas.hover();
  await page.mouse.down({ button: 'left' });
  await expect(page.getByRole('status')).toHaveText('Block collected.', { timeout: 350 });
  await page.mouse.up({ button: 'left' });

  await page.reload();
  await page.getByRole('button', { name: 'Enter world' }).click();
  await expect(page.getByTestId('game-mode-indicator')).toHaveText('Creative');
  await expect(page.locator('.hotbar-slot[aria-pressed="true"]')).toContainText('∞');

  await page.keyboard.press('Alt+g');
  await expect(mode).toHaveText('Survival');
  const selectedSlot = page.locator('.hotbar-slot[aria-pressed="true"]');
  await expect(selectedSlot).toHaveAttribute('data-item-id', '2');
  await expect(selectedSlot).toContainText('32');
  await page.keyboard.press('e');
  await expect(page.getByRole('gridcell', { name: 'Dirt, 32' })).toBeVisible();
});

test('can mine the generated surface, collect drops, and place a block', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await expect(page.locator('.hotbar-slot .item-icon').first()).toHaveAttribute(
    'style',
    /data:image\/png;base64,/,
  );
  const canvas = page.getByTestId('game-canvas');
  const status = page.getByRole('status');
  const dirtSlot = page.getByRole('button', { name: /^1: Dirt/ });
  await expect(dirtSlot).toContainText('32');
  await canvas.hover();
  await page.mouse.down({ button: 'left' });
  const mining = page.getByTestId('mining-progress');
  await expect(mining).toBeVisible();
  await expect(mining).toHaveAttribute('aria-valuenow', /[1-9]\d?/);
  await expect(status).toHaveText('Block collected.', { timeout: 3_000 });
  await page.mouse.up({ button: 'left' });
  await expect(status).toHaveText('Block collected.');
  await page.keyboard.press('e');
  await expect(page.getByRole('gridcell', { name: 'Grass, 1' })).toBeVisible();
  await expect(page.locator('.inventory-slot')).toHaveCount(27);
  await expect(page.locator('.inventory-slot[data-item-id="1"] .item-icon')).toHaveAttribute(
    'style',
    /data:image\/png;base64,/,
  );
  await page.locator('.inventory-slot[data-item-id="1"]').click();
  await expect(page.getByTestId('selected-item-name')).toHaveText('Grass');
  await page.keyboard.press('e');
  await canvas.click({ button: 'right' });
  await expect(status).toHaveText('Block placed.');
  await expect(dirtSlot).toContainText('31');
});

test('crafting and inventory survive a page reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await page.keyboard.press('e');
  await page.getByRole('button', { name: 'Oak log → 4 planks' }).click();
  await expect(page.getByRole('gridcell', { name: 'Oak planks, 20' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Enter world' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^3: Oak planks/ })).toContainText('20');
  await expect(page.getByRole('button', { name: /^7: Oak log/ })).toContainText('7');
});

test('Save & New World saves the current world and creates an isolated named world', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save & New World' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a world' })).toBeVisible();
  await expect(page.locator('.create-world-form')).toBeVisible();

  await page.getByLabel('World name').fill('Cedar Valley');
  await page.getByLabel('Seed (optional)').fill('cedar-e2e');
  await page.getByRole('button', { name: 'Create world' }).click();
  await expect(page.getByRole('heading', { name: 'Stonefield' })).toBeVisible();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-state', 'ready');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose a world' })).toBeVisible();
  await expect(page.locator('.world-card')).toHaveCount(2);
  await expect(page.locator('.world-card').filter({ hasText: 'Quiet Valley' })).toBeVisible();
  await expect(page.locator('.world-card').filter({ hasText: 'Cedar Valley' })).toBeVisible();
  await page.locator('.world-card[data-world-id="world-default"] .open-world').click();
  await expect(page.getByRole('button', { name: 'Enter world' })).toBeVisible();
});

test('a failed Save & New leaves the current world open and does not create another world', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string): void {
      if (key.startsWith('stonefield.world.v2.'))
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save & New World' }).click();
  await expect(page.getByRole('status')).toContainText('Save failed: browser storage is full');
  await expect(page.getByRole('heading', { name: 'Choose a world' })).toHaveCount(0);
  await expect(page.locator('.game-shell')).toHaveAttribute('data-state', 'paused');
});

test('crafts and assigns a durable tool through the interactive inventory', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '2 planks → 4 sticks' }).click();
  await page.getByRole('button', { name: 'Wooden pickaxe' }).click();
  const pickaxeSlot = page.locator('.inventory-slot[data-item-id="1002"]');
  await expect(pickaxeSlot).toBeVisible();
  await pickaxeSlot.click();
  await page.getByRole('button', { name: 'Assign selected item to hotbar' }).click();
  await page.getByRole('button', { name: 'Close inventory' }).click();
  await expect(page.getByRole('button', { name: /^1: Wooden pickaxe/ })).toContainText('1');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Enter world' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^1: Wooden pickaxe/ })).toContainText('1');
});

test('surface creatures appear at night but stay away during daytime', async ({ page }) => {
  await setInitialWorldTime(page, 10);
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '2 planks → 4 sticks' }).click();
  await page.getByRole('button', { name: 'Wooden sword' }).click();
  await page.locator('.inventory-slot[data-item-id="1013"]').click();
  await page.getByRole('button', { name: 'Assign selected item to hotbar' }).click();
  await page.getByRole('button', { name: 'Close inventory' }).click();
  await expect(page.getByTestId('mob-count')).toHaveText(/^Creatures · [1-9]/, { timeout: 8_000 });
  await expect(page.locator('.hotbar-slot[aria-pressed="true"]')).toHaveAttribute(
    'data-item-id',
    '1013',
  );
  const status = page.getByRole('status');
  const canvas = page.getByTestId('game-canvas');
  await expect
    .poll(
      async () => {
        await canvas.click({ button: 'left' });
        return (await status.textContent()) ?? '';
      },
      { timeout: 20_000, intervals: [250] },
    )
    .toMatch(/You struck a creature|Creature defeated/);

  await setInitialWorldTime(page, 500);
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await page.waitForTimeout(4_000);
  await expect(page.getByTestId('mob-count')).toHaveText('Creatures · 0');
});

test('cave creatures appear during daytime in generated underground terrain', async ({ page }) => {
  // This is a roomy, two-block-high cave in the deterministic quiet-valley seed.
  await setInitialWorldTime(page, 500, { x: 13.5, z: 7.5, y: 10 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await expect(page.getByTestId('mob-count')).toHaveText(/^Creatures · [1-9]/, { timeout: 12_000 });
});

test('fall death is one transition and respawn returns the player safely', async ({ page }) => {
  await setInitialWorldTime(page, 500, { x: 8, z: 8, y: 180, health: 20 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await expect(page.getByRole('button', { name: 'Respawn' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('status')).toHaveText(
    'You fell too far. Respawn to return to the wild.',
  );

  await page.getByRole('button', { name: 'Respawn' }).click();
  await expect(page.getByRole('status')).toHaveText('Back on your feet. Watch your step.');
  await expect(page.locator('.game-shell')).toHaveAttribute('data-state', 'playing');
  await expect(page.getByLabel('Health')).toHaveAttribute('value', '20');
  await page.waitForTimeout(1_000);
  await expect(page.getByRole('button', { name: 'Respawn' })).toBeHidden();
});

test('Creative flight prevents fall death and preserves Survival health', async ({ page }) => {
  await setInitialWorldTime(page, 500, { x: 8, z: 8, y: 180, health: 20 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await page.keyboard.press('Alt+g');
  await expect(page.getByTestId('game-mode-indicator')).toHaveText('Creative');
  await expect
    .poll(
      async () => {
        const status = (await page.getByRole('status').textContent()) ?? '';
        const position = status.split('·')[1]?.trim().split(',');
        return Number(position?.[1]);
      },
      { timeout: 10_000 },
    )
    .toBeLessThan(100);
  await expect(page.getByRole('button', { name: 'Respawn' })).toBeHidden();
  await expect(page.getByLabel('Health')).toHaveAttribute('value', '20');
});

test('a nearby daytime cave creature can kill the player and reports the cause', async ({
  page,
}) => {
  await setInitialWorldTime(page, 500, { x: 13.5, z: 7.5, y: 10, health: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await expect(page.getByTestId('mob-count')).toHaveText(/^Creatures · [1-9]/, { timeout: 12_000 });
  await expect(page.getByRole('button', { name: 'Respawn' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('status')).toHaveText(
    'A creature overcame you. Respawn to return to the wild.',
  );
});
