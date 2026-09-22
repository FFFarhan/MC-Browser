# Procedural Art Specification

## Direction

The game uses a coherent original pixel-art style: readable silhouettes, restrained natural colors, subtle hue variation, and no copied Minecraft patterns. World tiles are generated deterministically from an art seed so builds and tests are reproducible.

## Atlas generation

- Logical tile size: 16×16 pixels
- Nearest-neighbor scaling
- At least two pixels of duplicated edge padding around packed tiles
- No network or filesystem image dependencies at runtime
- Stable atlas ordering derived from sorted texture keys
- A generated manifest records UV bounds and atlas dimensions

## Texture families

- Soil: layered speckles with darker lower values
- Stone and ores: irregular clustered shapes rather than uniform noise
- Grass and snow: distinct top, side, and bottom tiles
- Wood: rings on ends and vertical grain on sides
- Leaves: transparent cutout clusters with adequate solid coverage
- Crafted blocks: visibly constructed patterns
- Water: four subtle animation frames using hue and highlight shifts

## Icons and UI

Item icons are rendered from the same original palette and may reuse atlas tiles for block items. Tool icons are generated as small pixel silhouettes. UI panels use CSS and Canvas-rendered details, not borrowed game artwork.

## Validation

Tests verify stable dimensions, unique texture keys, nonempty alpha coverage, valid UV bounds, deterministic pixel hashes, and sufficient contrast for selection and inventory presentation.
