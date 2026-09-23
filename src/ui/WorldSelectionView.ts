import type { NewWorldInput, WorldSummary } from '../world/WorldCatalog';

export class WorldSelectionView {
  readonly element = document.createElement('main');
  private readonly worldList = document.createElement('div');
  private readonly form = document.createElement('form');
  private readonly joinForm = document.createElement('form');
  private readonly status = document.createElement('p');
  private worlds: readonly WorldSummary[];

  constructor(
    worlds: readonly WorldSummary[],
    private readonly onSelect: (worldId: string) => void,
    private readonly onCreate: (input: NewWorldInput) => WorldSummary | null,
    private readonly onHost?: (worldId: string) => void,
    private readonly onJoin?: (roomCode: string) => void,
  ) {
    this.worlds = worlds;
    this.element.className = 'world-selection';
    this.element.setAttribute('aria-labelledby', 'world-selection-title');
    const content = document.createElement('section');
    content.className = 'world-selection-card';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'STONEFIELD';
    const heading = document.createElement('h1');
    heading.id = 'world-selection-title';
    heading.textContent = 'Choose a world';
    const description = document.createElement('p');
    description.className = 'world-selection-copy';
    description.textContent = 'Each world keeps its own seed, progress, and discoveries.';
    this.worldList.className = 'world-list';
    this.worldList.setAttribute('aria-label', 'Saved worlds');
    const createOpen = document.createElement('button');
    createOpen.type = 'button';
    createOpen.className = 'secondary-button create-world-open';
    createOpen.textContent = 'Create new world';
    createOpen.addEventListener('click', () => this.openCreateForm());
    this.status.className = 'world-selection-status';
    this.status.setAttribute('role', 'status');
    this.form.className = 'create-world-form';
    this.form.hidden = true;
    this.buildForm();
    this.buildOnlineControls();
    content.append(
      eyebrow,
      heading,
      description,
      this.worldList,
      createOpen,
      this.joinForm,
      this.form,
      this.status,
    );
    this.element.append(content);
    this.renderWorlds();
  }

  setWorlds(worlds: readonly WorldSummary[]): void {
    this.worlds = worlds;
    this.renderWorlds();
  }

  openCreateForm(): void {
    this.form.hidden = false;
    this.status.textContent = '';
    this.form.querySelector<HTMLInputElement>('[name="worldName"]')?.focus();
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  dispose(): void {
    this.element.remove();
  }

  private buildForm(): void {
    const heading = document.createElement('h2');
    heading.textContent = 'New world';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'World name';
    const name = document.createElement('input');
    name.name = 'worldName';
    name.type = 'text';
    name.maxLength = 32;
    name.required = true;
    name.autocomplete = 'off';
    name.placeholder = 'e.g. Cedar Valley';
    nameLabel.append(name);
    const seedLabel = document.createElement('label');
    seedLabel.textContent = 'Seed (optional)';
    const seed = document.createElement('input');
    seed.name = 'worldSeed';
    seed.type = 'text';
    seed.maxLength = 80;
    seed.autocomplete = 'off';
    seed.placeholder = 'Random seed';
    seedLabel.append(seed);
    const buttons = document.createElement('div');
    buttons.className = 'world-form-actions';
    const create = document.createElement('button');
    create.type = 'submit';
    create.className = 'primary-button';
    create.textContent = 'Create world';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'text-button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      this.form.hidden = true;
      this.status.textContent = '';
    });
    buttons.append(create, cancel);
    this.form.append(heading, nameLabel, seedLabel, buttons);
    this.form.addEventListener('submit', this.onSubmit);
  }

  private buildOnlineControls(): void {
    this.joinForm.hidden = !this.onJoin;
    if (this.onJoin) {
      this.joinForm.className = 'join-world-form';
      const label = document.createElement('label');
      label.textContent = 'Join an online world';
      const input = document.createElement('input');
      input.name = 'inviteCode';
      input.type = 'text';
      input.maxLength = 12;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = '12-character invite code';
      input.setAttribute('aria-label', 'Invite code');
      label.append(input);
      const join = document.createElement('button');
      join.type = 'submit';
      join.className = 'secondary-button join-world';
      join.textContent = 'Join by invite';
      this.joinForm.append(label, join);
      this.joinForm.addEventListener('submit', this.onJoinSubmit);
    }
  }

  private renderWorlds(): void {
    this.worldList.replaceChildren();
    for (const world of this.worlds) {
      const card = document.createElement('article');
      card.className = 'world-card';
      card.dataset['worldId'] = world.id;
      const details = document.createElement('div');
      details.className = 'world-card-details';
      const name = document.createElement('h2');
      name.textContent = world.name;
      const seed = document.createElement('p');
      seed.textContent = `Seed · ${String(world.seed)}`;
      details.append(name, seed);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'primary-button open-world';
      open.textContent = 'Open world';
      open.addEventListener('click', () => this.onSelect(world.id));
      const actions = document.createElement('div');
      actions.className = 'world-card-actions';
      actions.append(open);
      if (this.onHost) {
        const host = document.createElement('button');
        host.type = 'button';
        host.className = 'secondary-button host-world';
        host.textContent = 'Host online';
        host.setAttribute('aria-label', `Host ${world.name} online`);
        host.addEventListener('click', () => this.onHost?.(world.id));
        actions.append(host);
      }
      card.append(details, actions);
      this.worldList.append(card);
    }
  }

  private readonly onJoinSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const input = this.joinForm.querySelector<HTMLInputElement>('[name="inviteCode"]');
    const roomCode = input?.value.trim() ?? '';
    if (!/^[a-f0-9]{12}$/i.test(roomCode)) {
      this.status.textContent = 'Invite code must be 12 characters (letters A–F and numbers).';
      return;
    }
    this.status.textContent = 'Connecting to the invite…';
    this.onJoin?.(roomCode.toUpperCase());
  };

  private readonly onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const name = this.form.querySelector<HTMLInputElement>('[name="worldName"]')?.value ?? '';
    const seed =
      this.form.querySelector<HTMLInputElement>('[name="worldSeed"]')?.value.trim() ?? '';
    const input: NewWorldInput = seed ? { name, seed } : { name };
    try {
      const world = this.onCreate(input);
      if (!world) return;
      this.worlds = [...this.worlds, world];
      this.renderWorlds();
      this.onSelect(world.id);
    } catch (error) {
      this.status.textContent =
        error instanceof Error ? error.message : 'Could not create this world.';
    }
  };
}
