# World Generation Specification

## Determinism contract

A world is defined by a 64-bit seed, generator version, and chunk coordinate. Generating a chunk must produce identical block and initial-light arrays regardless of worker count, job order, neighboring load state, locale, or frame timing. Random decisions derive from coordinate-hashed sub-seeds, never shared mutable random state.

Seed text is hashed deterministically to 64 bits. An empty seed creates a random seed once and stores its numeric and display forms.

## Dimensions

- Chunk: 16×192×16 blocks
- Sea level: Y=62
- Bedrock boundary: Y=0
- Normal surface band: approximately Y=48..128
- Generation must remain valid across the entire signed safe-integer chunk range accepted by persistence, though the UI may limit imported coordinates to a safer documented range.

## Pipeline

1. Derive continentalness, elevation, erosion, temperature, and humidity fields.
2. Select a biome using continuous climate values.
3. Calculate terrain height and ocean depth.
4. Fill bedrock, stone, subsurface, surface, air, and water.
5. Carve deterministic 3D-noise caves below the surface buffer.
6. Place coordinate-hashed ore veins.
7. Place trees and vegetation using region-level feature anchors.
8. Calculate initial sunlight inputs.

## Biomes

- Plains: gentle terrain, grass, sparse trees
- Forest: moderate terrain, dense trees
- Desert: sand surface, sandstone below, no normal trees
- Mountains: high-relief stone and snow at altitude
- Snow: cold grass or snow surface, sparse cold-region trees
- Ocean: depressed terrain filled to sea level

Climate transitions should blend terrain height and surface thresholds. A single block column must not randomly alternate biomes.

## Cross-chunk features

Trees, veins, and caves may cross chunk boundaries. Features are selected from deterministic anchors in a region larger than a chunk; each chunk evaluates every anchor whose bounding box can intersect it. The result cannot depend on whether the neighboring chunk exists.

## Safe spawn

Search outward deterministically from `(0, 0)` for a non-liquid surface in plains or forest with two blocks of headroom and a stable floor. The search has a documented bound and falls back to a generated platform only if no valid column exists within it.

## Mutation overlay

Generated blocks are immutable source data. Runtime edits are stored as a per-chunk sparse mutation map and applied before lighting and meshing. Setting a block back to its generated value removes the mutation entry.
