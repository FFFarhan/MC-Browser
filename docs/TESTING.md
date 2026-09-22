# Testing Specification

## Test layers

### Unit tests

Vitest covers pure deterministic systems: coordinates, registries, generation, feature placement, meshing, ray traversal, collision, inventory, crafting, furnace smelting, survival rules, light propagation, fluid updates, encoding, and migrations.

### Integration tests

Integration tests cover worker protocols, chunk lifecycle, mutation-to-remesh flow, persistence transactions, pause semantics, and renderer resource ownership using controlled adapters.

### Browser tests

Playwright covers startup, world creation, pointer-lock fallback, movement, mining, placement, inventory, crafting, pause, settings, save/reload, world export/import, and fatal-error recovery. Tests may use deterministic test hooks compiled only for test builds; they must exercise the same production systems.

## Required edge cases

- World X/Z values `-1`, `-16`, `-17`, `0`, `15`, `16`, and `17`
- Block edits at every chunk edge and corner
- Same seed with different generation orders and worker counts
- Transparent neighbors and cross-chunk faces
- Stale worker results after teleport or mutation
- Collision at high allowed velocity and low frame rate
- Inventory actions with full destinations and maximum stacks
- Crafting with mirrored-invalid and offset-valid patterns
- Furnace output blocking, partial fuel, pause, unload/reload, and repeated UI access
- Light addition and removal across chunk borders
- Bounded water updates at unloaded borders
- Corrupt, oversized, old-version, and interrupted saves
- Tab suspension, pause, pointer-lock loss, and WebGL context loss
- Service-worker upgrade with an obsolete cache and offline application reload

## Test discipline

Important deterministic logic is introduced with a failing test. A regression receives a test that fails for the original defect. Tests must assert observable behavior, not private implementation details. Randomized property tests use logged fixed seeds so failures reproduce exactly.

## Release verification

The final manual journey is defined in `acceptance/RELEASE_CHECKLIST.md`. Automated checks support that journey but do not replace browser testing on Chrome, Firefox, and Safari.
