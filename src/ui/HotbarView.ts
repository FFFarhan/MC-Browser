import type { WorldMutationStore } from '../world/MutationBatch';
import { DEFAULT_BLOCKS, BLOCK_ID } from '../world/defaultBlocks';

const HOTBAR_IDS = [
  BLOCK_ID['dirt'] ?? 0,
  BLOCK_ID['stone'] ?? 0,
  BLOCK_ID['oak_planks'] ?? 0,
  BLOCK_ID['cobblestone'] ?? 0,
  BLOCK_ID['glass'] ?? 0,
  BLOCK_ID['torch'] ?? 0,
  BLOCK_ID['oak_log'] ?? 0,
  BLOCK_ID['sand'] ?? 0,
  BLOCK_ID['oak_leaves'] ?? 0,
];

export class HotbarView {
  readonly element = document.createElement('nav');
  private readonly buttons: HTMLButtonElement[] = [];
  private selectedIndex = 0;
  private enabled = false;

  constructor(
    private readonly world: WorldMutationStore,
    private readonly onSelect: (blockId: number) => void,
  ) {
    this.element.className = 'hotbar';
    this.element.setAttribute('aria-label', 'Block hotbar');
    HOTBAR_IDS.forEach((id, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hotbar-slot';
      button.addEventListener('click', () => this.select(index));
      this.buttons.push(button);
      this.element.append(button);
    });
    this.render();
    document.addEventListener('keydown', this.onKeyDown);
  }

  get selectedBlockId(): number {
    return HOTBAR_IDS[this.selectedIndex] ?? 0;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  refresh(): void {
    this.render();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
  }

  private select(index: number): void {
    if (index < 0 || index >= HOTBAR_IDS.length) return;
    this.selectedIndex = index;
    this.onSelect(this.selectedBlockId);
    this.render();
  }

  private render(): void {
    this.buttons.forEach((button, index) => {
      const id = HOTBAR_IDS[index] ?? 0;
      const block = DEFAULT_BLOCKS.get(id);
      const count = this.world.getItemCount(id);
      button.textContent = `${index + 1} ${block.displayName} ${count}`;
      button.title = `${index + 1}: ${block.displayName} (${count})`;
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(index === this.selectedIndex));
    });
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || !/^Digit[1-9]$/.test(event.code)) return;
    event.preventDefault();
    this.select(Number(event.code.slice(-1)) - 1);
  };
}
