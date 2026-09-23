import type { WorldMutationStore } from '../world/MutationBatch';
import { DEFAULT_HOTBAR_ITEM_IDS, DEFAULT_ITEMS, ITEM_ID } from '../world/ItemRegistry';
import { CRAFTING_RECIPES } from '../gameplay/recipes';

const INVENTORY_COLUMNS = 9;
const MIN_INVENTORY_SLOTS = 27;
const HOTBAR_ORDER = new Map(DEFAULT_HOTBAR_ITEM_IDS.map((id, index) => [id, index]));

export class InventoryView {
  readonly element = document.createElement('section');
  private readonly itemList = document.createElement('div');
  private readonly storageHeading = document.createElement('h3');
  private readonly recipes = document.createElement('div');
  private readonly recipeHeading = document.createElement('h3');
  private readonly selectedIcon = document.createElement('span');
  private readonly selectedName = document.createElement('strong');
  private readonly selectedCount = document.createElement('span');
  private readonly itemAction = document.createElement('button');
  private readonly assignAction = document.createElement('button');
  private enabled = false;
  private open = false;
  private creativeMode = false;
  private selectedItemId: number | null = null;

  constructor(
    private readonly world: WorldMutationStore,
    private readonly onCraft: (recipeId: string) => boolean,
    private readonly onOpenChange: (open: boolean) => void,
    private readonly onUseItem: (itemId: number) => boolean = () => false,
    private readonly canUseItem: (itemId: number) => boolean = () => true,
    private readonly getIconUrl: (itemId: number) => string = () => '',
    private readonly onAssignItem: (itemId: number) => boolean = () => false,
  ) {
    this.element.className = 'inventory-panel';
    this.element.setAttribute('aria-labelledby', 'inventory-title');
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.hidden = true;

    const header = document.createElement('header');
    header.className = 'inventory-header';
    const titleGroup = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'inventory-eyebrow';
    eyebrow.textContent = 'PACK';
    const heading = document.createElement('h2');
    heading.id = 'inventory-title';
    heading.textContent = 'Inventory';
    titleGroup.append(eyebrow, heading);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'inventory-close';
    close.setAttribute('aria-label', 'Close inventory');
    close.textContent = '×';
    close.addEventListener('click', () => this.setOpen(false));
    header.append(titleGroup, close);

    const help = document.createElement('p');
    help.className = 'inventory-help';
    help.textContent =
      'Click a stack to inspect it. Select a recipe to craft. Press E or Esc to close.';

    const content = document.createElement('div');
    content.className = 'inventory-content';
    const storagePanel = document.createElement('section');
    storagePanel.className = 'inventory-storage';
    this.storageHeading.textContent = 'Your items';
    this.itemList.className = 'inventory-items';
    this.itemList.setAttribute('role', 'grid');
    this.itemList.setAttribute('aria-label', 'Inventory item slots');
    storagePanel.append(this.storageHeading, this.itemList);

    const sidePanel = document.createElement('aside');
    sidePanel.className = 'inventory-side';
    const selectedPanel = document.createElement('section');
    selectedPanel.className = 'selected-item';
    selectedPanel.setAttribute('aria-label', 'Selected item');
    this.selectedIcon.className = 'item-icon selected-item-icon';
    this.selectedIcon.setAttribute('aria-hidden', 'true');
    this.selectedName.dataset['testid'] = 'selected-item-name';
    this.selectedCount.className = 'selected-item-count';
    this.itemAction.type = 'button';
    this.itemAction.className = 'use-item-button';
    this.assignAction.type = 'button';
    this.assignAction.className = 'assign-item-button';
    selectedPanel.append(
      this.selectedIcon,
      this.selectedName,
      this.selectedCount,
      this.assignAction,
      this.itemAction,
    );

    this.recipeHeading.textContent = 'Crafting';
    this.recipes.className = 'recipe-list';
    sidePanel.append(selectedPanel, this.recipeHeading, this.recipes);
    content.append(storagePanel, sidePanel);
    this.element.append(header, help, content);
    this.render();
    document.addEventListener('keydown', this.onKeyDown);
  }

  get isOpen(): boolean {
    return this.open;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.setOpen(false);
  }

  refresh(): void {
    this.render();
  }

  setCreativeMode(enabled: boolean): void {
    if (this.creativeMode === enabled) return;
    this.creativeMode = enabled;
    this.selectedItemId = null;
    this.render();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.element.remove();
  }

  private setOpen(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    this.element.hidden = !open;
    this.onOpenChange(open);
    if (open)
      (
        this.itemList.querySelector<HTMLButtonElement>('.inventory-slot:not(:disabled)') ??
        this.element.querySelector<HTMLButtonElement>('.inventory-close')
      )?.focus();
  }

  private render(): void {
    const items = DEFAULT_ITEMS.list()
      .filter((item) =>
        this.creativeMode
          ? item.kind === 'block' && item.id !== 0
          : this.world.getItemCount(item.id) > 0,
      )
      .sort(
        (left, right) =>
          (HOTBAR_ORDER.get(left.id) ?? DEFAULT_HOTBAR_ITEM_IDS.length + left.id) -
          (HOTBAR_ORDER.get(right.id) ?? DEFAULT_HOTBAR_ITEM_IDS.length + right.id),
      );
    if (!items.some((item) => item.id === this.selectedItemId)) this.selectedItemId = null;
    this.storageHeading.textContent = this.creativeMode ? 'Creative blocks' : 'Your items';
    this.recipeHeading.hidden = this.creativeMode;
    const help = this.element.querySelector<HTMLElement>('.inventory-help');
    if (help)
      help.textContent = this.creativeMode
        ? 'Creative blocks are unlimited. Select one and assign it to your hotbar.'
        : 'Click a stack to inspect it. Select a recipe to craft. Press E or Esc to close.';
    this.itemList.replaceChildren();
    const slotCount = Math.max(
      MIN_INVENTORY_SLOTS,
      Math.ceil(items.length / INVENTORY_COLUMNS) * INVENTORY_COLUMNS,
    );
    for (let index = 0; index < slotCount; index += 1) {
      const item = items[index];
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'inventory-slot';
      slot.setAttribute('role', 'gridcell');
      if (!item) {
        slot.disabled = true;
        slot.classList.add('is-empty');
        slot.setAttribute('aria-label', 'Empty slot');
        this.itemList.append(slot);
        continue;
      }
      const count = this.world.getItemCount(item.id);
      slot.dataset['itemId'] = String(item.id);
      slot.title = this.creativeMode
        ? `${item.displayName} · unlimited`
        : `${item.displayName} ×${count}`;
      slot.setAttribute(
        'aria-label',
        this.creativeMode ? `${item.displayName}, unlimited` : `${item.displayName}, ${count}`,
      );
      slot.setAttribute('aria-pressed', String(item.id === this.selectedItemId));
      const icon = this.createIcon(item.id, 'inventory-item-icon');
      icon.classList.add('item-icon');
      const stack = document.createElement('span');
      stack.className = 'stack-count';
      stack.textContent = this.creativeMode ? '∞' : String(count);
      stack.setAttribute('aria-hidden', 'true');
      slot.append(icon, stack);
      slot.addEventListener('click', () => this.selectItem(item.id));
      this.itemList.append(slot);
    }
    this.renderSelectedItem();
    this.renderRecipes();
  }

  private selectItem(itemId: number): void {
    this.selectedItemId = itemId;
    for (const slot of this.itemList.querySelectorAll<HTMLButtonElement>(
      '.inventory-slot[data-item-id]',
    ))
      slot.setAttribute('aria-pressed', String(Number(slot.dataset['itemId']) === itemId));
    this.renderSelectedItem();
  }

  private renderSelectedItem(): void {
    const item = this.selectedItemId === null ? undefined : DEFAULT_ITEMS.get(this.selectedItemId);
    this.selectedIcon.className = 'item-icon selected-item-icon';
    this.selectedIcon.style.backgroundImage = item ? this.iconBackground(item.id) : '';
    this.selectedName.textContent = item?.displayName ?? 'Select an item';
    this.selectedName.dataset['testid'] = 'selected-item-name';
    this.selectedCount.textContent = item
      ? this.creativeMode
        ? 'Unlimited'
        : `×${this.world.getItemCount(item.id)}`
      : 'Click a stack to inspect';
    this.itemAction.hidden = this.creativeMode || item?.id !== ITEM_ID['berries'];
    this.itemAction.onclick = null;
    if (item && item.id === ITEM_ID['berries']) {
      const berryId = item.id;
      this.itemAction.textContent = 'Eat';
      this.itemAction.setAttribute('aria-label', `Eat ${item.displayName}`);
      this.itemAction.disabled = !this.canUseItem(berryId);
      this.itemAction.onclick = () => {
        if (this.onUseItem(berryId)) this.render();
      };
    }

    this.assignAction.hidden = !item;
    this.assignAction.disabled = false;
    this.assignAction.textContent = 'Assign to selected hotbar slot';
    this.assignAction.setAttribute(
      'aria-label',
      this.creativeMode ? 'Assign selected block to hotbar' : 'Assign selected item to hotbar',
    );
    this.assignAction.onclick = null;
    if (item) {
      this.assignAction.onclick = () => {
        if (this.onAssignItem(item.id)) {
          this.assignAction.textContent = 'Assigned to hotbar';
          this.assignAction.disabled = true;
        }
      };
    }
  }

  private renderRecipes(): void {
    this.recipes.replaceChildren();
    if (this.creativeMode) return;
    for (const recipe of CRAFTING_RECIPES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recipe-button';
      button.dataset['recipe'] = recipe.id;
      button.setAttribute('aria-label', recipe.name);
      button.disabled = !recipe.ingredients.every(
        (ingredient) => this.world.getItemCount(ingredient.itemId) >= ingredient.amount,
      );
      const icons = document.createElement('span');
      icons.className = 'recipe-icons';
      recipe.ingredients.forEach((ingredient, index) => {
        if (index > 0) {
          const plus = document.createElement('span');
          plus.className = 'recipe-plus';
          plus.textContent = '+';
          icons.append(plus);
        }
        const ingredientIcon = this.createRecipeItem(ingredient.itemId, ingredient.amount);
        icons.append(ingredientIcon);
      });
      const arrow = document.createElement('span');
      arrow.className = 'recipe-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      icons.append(arrow, this.createRecipeItem(recipe.output.itemId, recipe.output.amount));
      const name = document.createElement('span');
      name.className = 'recipe-name';
      name.textContent = recipe.name;
      button.append(icons, name);
      button.addEventListener('click', () => {
        if (this.onCraft(recipe.id)) this.render();
      });
      this.recipes.append(button);
    }
  }

  private createRecipeItem(itemId: number, amount: number): HTMLElement {
    const token = document.createElement('span');
    token.className = 'recipe-item';
    const icon = this.createIcon(itemId, 'recipe-item-icon');
    icon.classList.add('item-icon');
    const count = document.createElement('span');
    count.className = 'recipe-item-count';
    count.textContent = `×${amount}`;
    const item = DEFAULT_ITEMS.get(itemId);
    token.title = `${item.displayName} ×${amount}`;
    token.append(icon, count);
    return token;
  }

  private createIcon(itemId: number, className: string): HTMLSpanElement {
    const icon = document.createElement('span');
    icon.className = className;
    icon.style.backgroundImage = this.iconBackground(itemId);
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  private iconBackground(itemId: number): string {
    const url = this.getIconUrl(itemId);
    return url ? `url("${url}")` : '';
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || event.repeat) return;
    if (event.code === 'KeyE') {
      event.preventDefault();
      this.setOpen(!this.open);
    } else if (event.code === 'Escape' && this.open) {
      event.preventDefault();
      this.setOpen(false);
    }
  };
}
