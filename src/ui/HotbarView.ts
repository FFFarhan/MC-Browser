import type { WorldMutationStore } from '../world/MutationBatch';
import { DEFAULT_ITEMS, DEFAULT_HOTBAR_ITEM_IDS } from '../world/ItemRegistry';

export class HotbarView {
  readonly element = document.createElement('nav');
  private readonly buttons: HTMLButtonElement[] = [];
  private selectedIndex = 0;
  private enabled = false;
  private creativeMode = false;
  private itemIds: (number | null)[];

  constructor(
    private readonly world: WorldMutationStore,
    private readonly onSelect: (itemId: number) => void,
    private readonly getIconUrl: (itemId: number) => string = () => '',
    assignments: readonly (number | null)[] = DEFAULT_HOTBAR_ITEM_IDS,
    private readonly onAssignmentsChange: (assignments: readonly (number | null)[]) => void = () =>
      undefined,
  ) {
    this.itemIds = this.validAssignments(assignments)
      ? [...assignments]
      : [...DEFAULT_HOTBAR_ITEM_IDS];
    this.element.className = 'hotbar';
    this.element.setAttribute('aria-label', 'Hotbar');
    this.itemIds.forEach((_id, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hotbar-slot';
      const shortcut = document.createElement('span');
      shortcut.className = 'slot-number';
      shortcut.textContent = String(index + 1);
      const icon = document.createElement('span');
      icon.className = 'item-icon';
      icon.setAttribute('aria-hidden', 'true');
      const count = document.createElement('span');
      count.className = 'stack-count';
      count.setAttribute('aria-hidden', 'true');
      button.append(shortcut, icon, count);
      button.addEventListener('click', () => this.select(index));
      this.buttons.push(button);
      this.element.append(button);
    });
    this.render();
    document.addEventListener('keydown', this.onKeyDown);
  }

  get selectedBlockId(): number {
    const id = this.selectedItemId;
    return id !== null && DEFAULT_ITEMS.get(id).kind === 'block' ? id : 0;
  }

  get selectedItemId(): number | null {
    return this.itemIds[this.selectedIndex] ?? null;
  }

  get selectedSlotIndex(): number {
    return this.selectedIndex;
  }

  get assignments(): readonly (number | null)[] {
    return [...this.itemIds];
  }

  assignItem(slotIndex: number, itemId: number): boolean {
    if (
      !Number.isInteger(slotIndex) ||
      slotIndex < 0 ||
      slotIndex >= this.itemIds.length ||
      (!this.creativeMode && this.world.getItemCount(itemId) <= 0)
    )
      return false;
    try {
      const item = DEFAULT_ITEMS.get(itemId);
      if (this.creativeMode && (item.kind !== 'block' || item.id === 0)) return false;
    } catch {
      return false;
    }
    const next = [...this.itemIds];
    const previousSlot = next.indexOf(itemId);
    if (previousSlot >= 0 && previousSlot !== slotIndex) next[previousSlot] = null;
    next[slotIndex] = itemId;
    this.itemIds = next;
    this.selectedIndex = slotIndex;
    this.onAssignmentsChange(this.assignments);
    this.onSelect(this.selectedBlockId);
    this.render();
    return true;
  }

  setCreativeMode(enabled: boolean): void {
    if (this.creativeMode === enabled) return;
    this.creativeMode = enabled;
    this.render();
  }

  setAssignments(assignments: readonly (number | null)[], selectedIndex = 0): boolean {
    if (
      !this.validAssignments(assignments) ||
      !Number.isSafeInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= this.itemIds.length
    )
      return false;
    this.itemIds = [...assignments];
    this.selectedIndex = selectedIndex;
    this.onAssignmentsChange(this.assignments);
    this.onSelect(this.selectedBlockId);
    this.render();
    return true;
  }

  removeItem(itemId: number): void {
    const next = this.itemIds.map((id) => (id === itemId ? null : id));
    if (next.every((id, index) => id === this.itemIds[index])) return;
    this.itemIds = next;
    this.onAssignmentsChange(this.assignments);
    this.render();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  scrollSelection(deltaY: number): boolean {
    if (!this.enabled || !Number.isFinite(deltaY) || deltaY === 0) return false;
    const direction = deltaY > 0 ? 1 : -1;
    this.select((this.selectedIndex + direction + this.itemIds.length) % this.itemIds.length);
    return true;
  }

  refresh(): void {
    this.render();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
  }

  private select(index: number): void {
    if (index < 0 || index >= this.itemIds.length) return;
    this.selectedIndex = index;
    this.onSelect(this.selectedBlockId);
    this.render();
  }

  private render(): void {
    this.buttons.forEach((button, index) => {
      const id = this.itemIds[index] ?? null;
      const item = id === null ? undefined : DEFAULT_ITEMS.get(id);
      const count = id === null ? 0 : this.world.getItemCount(id);
      const unlimited = this.creativeMode && item?.kind === 'block';
      const icon = button.querySelector<HTMLElement>('.item-icon');
      const stackCount = button.querySelector<HTMLElement>('.stack-count');
      const iconUrl = id === null ? '' : this.getIconUrl(id);
      if (icon) icon.style.backgroundImage = iconUrl ? `url("${iconUrl}")` : '';
      if (stackCount) stackCount.textContent = unlimited ? '∞' : count > 0 ? String(count) : '';
      button.dataset['itemId'] = id === null ? '' : String(id);
      button.title = item
        ? `${index + 1}: ${item.displayName} (${unlimited ? 'unlimited' : count})`
        : `${index + 1}: Empty`;
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(index === this.selectedIndex));
    });
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || !/^Digit[1-9]$/.test(event.code)) return;
    event.preventDefault();
    this.select(Number(event.code.slice(-1)) - 1);
  };

  private validAssignments(assignments: readonly (number | null)[]): boolean {
    if (assignments.length !== DEFAULT_HOTBAR_ITEM_IDS.length) return false;
    const ids = assignments.filter((id): id is number => id !== null);
    if (new Set(ids).size !== ids.length) return false;
    return ids.every((id) => {
      try {
        const item = DEFAULT_ITEMS.get(id);
        if (this.creativeMode && (item.kind !== 'block' || item.id === 0)) return false;
        return true;
      } catch {
        return false;
      }
    });
  }
}
