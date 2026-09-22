# Rendering and Meshing Specification

## Rendering model

Blocks are data, not scene objects. Each visible chunk has at most one mesh per render layer. Opaque, cutout, and translucent geometry are separated so their depth and blending rules remain correct.

## Texture atlas

M0–M2 generate an original nearest-neighbor atlas with Canvas 2D. Tiles are 16×16 logical pixels with padding that prevents texture bleeding. The atlas builder produces both a canvas texture and a typed manifest mapping texture keys to UV rectangles. Mipmaps are disabled unless padded generation proves artifact-free.

## Meshing

The first correct mesher emits only faces whose neighbor does not obscure that render layer. Neighbor samples include adjacent chunk border data. The optimized mesher greedily merges coplanar faces only when texture, render layer, light values, face direction, and material flags match.

Mesh output contains transferable typed arrays for positions, normals, UVs, indices, per-vertex light, and optional ambient-occlusion values. Index buffers use the smallest safe integer type.

## Transparency

- Opaque blocks write depth normally.
- Cutout blocks use alpha testing and write depth.
- Water and glass use the translucent layer.
- Faces between identical translucent blocks are suppressed where visually correct.
- Translucency is accepted as approximate at chunk granularity; per-face global sorting is out of scope.

## Scene

The scene includes a perspective camera, directional sun, ambient contribution, distance fog, procedural sky gradient, sun and moon discs, stars at night, chunk meshes, selection outline, item drops, and particles. Shadow maps are optional and disabled by default unless performance budgets are met.

## Resource lifecycle

Replacing or unloading a chunk removes its scene object and disposes its geometry. Shared materials and the atlas are reference-owned by the renderer and disposed only at application shutdown or renderer recreation. Context restoration rebuilds GPU resources from authoritative CPU state.
