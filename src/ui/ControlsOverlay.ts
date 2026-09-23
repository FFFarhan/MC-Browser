export function createControlsOverlay(): HTMLElement {
  const overlay = document.createElement('aside');
  overlay.className = 'controls-overlay';
  overlay.setAttribute('aria-label', 'Movement controls');
  const rows = [
    ['W A S D', 'Move'],
    ['Space', 'Jump / fly up'],
    ['Shift', 'Sprint / fly down'],
    ['C', 'Crouch'],
    ['E', 'Inventory'],
    ['Click / F', 'Attack creature or mine block'],
    ['Alt+G', 'Switch game mode'],
    ['Space ×2', 'Toggle Creative flight'],
    ['Wheel', 'Change slot'],
    ['Mouse', 'Look'],
    ['Esc', 'Pause'],
  ];
  for (const [key, action] of rows) {
    const row = document.createElement('div');
    const binding = document.createElement('kbd');
    binding.textContent = key ?? '';
    const label = document.createElement('span');
    label.textContent = action ?? '';
    row.append(binding, label);
    overlay.append(row);
  }
  return overlay;
}
