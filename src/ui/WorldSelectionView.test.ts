import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldSelectionView } from './WorldSelectionView';

const worlds = [
  { id: 'cedar', name: 'Cedar Valley', seed: 'cedar-1' },
  { id: 'stone', name: 'Stone Reach', seed: 'stone-2' },
];

describe('world selection screen', () => {
  afterEach(() => document.body.replaceChildren());

  it('lists saved worlds and reports the selected world ID', () => {
    const onSelect = vi.fn();
    const view = new WorldSelectionView(worlds, onSelect, () => null);
    document.body.append(view.element);
    expect(view.element.querySelectorAll('.world-card')).toHaveLength(2);
    view.element.querySelector<HTMLButtonElement>('[data-world-id="stone"] .open-world')?.click();
    expect(onSelect).toHaveBeenCalledWith('stone');
    view.dispose();
  });

  it('validates and submits a new world name and optional seed', () => {
    const onCreate = vi.fn(() => ({ id: 'new-world', name: 'New World', seed: 'new-seed' }));
    const onSelect = vi.fn();
    const view = new WorldSelectionView(worlds, onSelect, onCreate);
    document.body.append(view.element);
    view.element.querySelector<HTMLButtonElement>('.create-world-open')?.click();
    const name = view.element.querySelector<HTMLInputElement>('[name="worldName"]');
    const seed = view.element.querySelector<HTMLInputElement>('[name="worldSeed"]');
    if (!name || !seed) throw new Error('world form fields are missing');
    name.value = 'New World';
    seed.value = 'new-seed';
    view.element.querySelector<HTMLFormElement>('.create-world-form')?.requestSubmit();
    expect(onCreate).toHaveBeenCalledWith({ name: 'New World', seed: 'new-seed' });
    expect(onSelect).toHaveBeenCalledWith('new-world');
    view.dispose();
  });

  it('keeps the create form open and shows an error if creation fails', () => {
    const view = new WorldSelectionView(
      worlds,
      () => undefined,
      () => null,
    );
    view.openCreateForm();
    view.setStatus('Could not save this world.');
    expect(view.element.querySelector<HTMLFormElement>('.create-world-form')?.hidden).toBe(false);
    expect(view.element.querySelector('[role="status"]')?.textContent).toContain('Could not save');
    view.dispose();
  });

  it('lets the player host a selected saved world and join by invite code', () => {
    const onHost = vi.fn();
    const onJoin = vi.fn();
    const view = new WorldSelectionView(
      worlds,
      () => undefined,
      () => null,
      onHost,
      onJoin,
    );
    document.body.append(view.element);
    view.element.querySelector<HTMLButtonElement>('[data-world-id="stone"] .host-world')?.click();
    const invite = view.element.querySelector<HTMLInputElement>('[name="inviteCode"]');
    if (!invite) throw new Error('invite code input is missing');
    invite.value = 'a1b2c3d4e5f6';
    view.element.querySelector<HTMLFormElement>('.join-world-form')?.requestSubmit();
    expect(onHost).toHaveBeenCalledWith('stone');
    expect(onJoin).toHaveBeenCalledWith('A1B2C3D4E5F6');
    view.dispose();
  });

  it('does not pass malformed invite codes into the join callback', () => {
    const onJoin = vi.fn();
    const view = new WorldSelectionView(
      worlds,
      () => undefined,
      () => null,
      undefined,
      onJoin,
    );
    const invite = view.element.querySelector<HTMLInputElement>('[name="inviteCode"]');
    if (!invite) throw new Error('invite code input is missing');
    invite.value = 'not-a-code';
    view.element.querySelector<HTMLFormElement>('.join-world-form')?.requestSubmit();
    expect(onJoin).not.toHaveBeenCalled();
    expect(view.element.querySelector('[role="status"]')?.textContent).toMatch(/12 characters/i);
    view.dispose();
  });
});
