export function createControlsOverlay(): HTMLElement {
  const overlay = document.createElement('aside');
  overlay.className = 'controls-overlay';
  overlay.setAttribute('aria-label', 'Movement controls');
  const rows = [
    ['W A S D', 'Move'],
    ['Space', 'Jump'],
    ['Shift', 'Sprint'],
    ['C', 'Crouch'],
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
