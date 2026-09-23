import { expect, test } from '@playwright/test';

test('host approves a guest and block drops synchronize to the guest inventory', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const signalingUrl = 'http://127.0.0.1:8787';
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const pageErrors: string[] = [];
  host.on('pageerror', (error) => pageErrors.push(`host: ${error.message}`));
  guest.on('pageerror', (error) => pageErrors.push(`guest: ${error.message}`));
  await Promise.all(
    [host, guest].map((page) =>
      page.addInitScript((url) => {
        window.STONEFIELD_CONFIG = { signalingUrl: url };
      }, signalingUrl),
    ),
  );

  try {
    await Promise.all([host.goto('/'), guest.goto('/')]);
    await host.getByRole('button', { name: 'Worlds & online play' }).click();
    await host.getByRole('button', { name: 'Host Quiet Valley online' }).click();
    const hostBody = host.locator('body');
    await expect(hostBody).toContainText('Invite code ·', { timeout: 30_000 });
    const roomCode = (await hostBody.innerText()).match(/Invite code · ([A-F0-9]{12})/)?.[1];
    expect(roomCode).toBeTruthy();

    await guest.getByRole('button', { name: 'Worlds & online play' }).click();
    await guest.getByLabel('Invite code').fill(roomCode ?? '');
    await guest.getByRole('button', { name: 'Join by invite' }).click();
    await expect(host.getByRole('button', { name: 'Approve' })).toBeVisible({ timeout: 10_000 });
    await host.getByRole('button', { name: 'Approve' }).click();
    await expect(guest.getByTestId('game-canvas')).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByText(`Online world · ${roomCode}`)).toBeVisible();

    await Promise.all([
      host.getByRole('button', { name: 'Enter world' }).click(),
      guest.getByRole('button', { name: 'Enter world' }).click(),
    ]);

    const canvas = host.getByTestId('game-canvas');
    await canvas.hover();
    await host.mouse.down({ button: 'left' });
    const mining = host.getByTestId('mining-progress');
    await expect(mining).toBeVisible({ timeout: 10_000 });
    await expect(mining).toHaveAttribute('aria-valuenow', /[1-9]\d?/, { timeout: 10_000 });
    await expect(host.getByRole('status')).toHaveText('Block collected.', { timeout: 15_000 });
    await host.mouse.up({ button: 'left' });

    await guest.keyboard.press('e');
    await expect(guest.getByRole('gridcell', { name: 'Grass, 1' })).toBeVisible({
      timeout: 20_000,
    });
    await hostContext.close();
    await expect(guest.getByRole('status')).toHaveText(
      /A player disconnected\.|Multiplayer · Signaling connection closed\./,
      { timeout: 20_000 },
    );
    expect(pageErrors).toEqual([]);
  } finally {
    await Promise.all([guestContext.close(), hostContext.close()]);
  }
});
