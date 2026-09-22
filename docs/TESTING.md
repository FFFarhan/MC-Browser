# Testing Specification

## Test layers

### Unit tests

Vitest covers pure deterministic systems: coordinates, registries, generation, feature placement, meshing, ray traversal, collision, inventory, crafting, furnace smelting, survival rules, light propagation, fluid updates, encoding, and migrations.

### Integration tests

Integration tests cover worker protocols, chunk lifecycle, atomic mutation-to-remesh flow, immutable persistence generations, pause semantics, origin rebasing, browser lifecycle events, overload degradation, and renderer resource ownership using controlled adapters.

### Browser tests

Playwright covers startup, world creation, pointer-lock fallback, movement, mining, placement, inventory, crafting, pause, settings, save/reload, world export/import, and fatal-error recovery. Tests may use deterministic test hooks compiled only for test builds; they must exercise the same production systems.

## Required edge cases

- World X/Z values `-1`, `-16`, `-17`, `0`, `15`, `16`, and `17`
- Block edits at every chunk edge and corner
- Same seed with different generation orders and worker counts
- Transparent neighbors and cross-chunk faces
- Stale worker results after teleport or mutation
- Wrong protocol, generator, content, light, and job revisions in worker responses
- Worker crash, timeout, repeated deterministic failure, and queue saturation
- Collision at high allowed velocity and low frame rate
- Floating-origin rebase at positive and negative long-distance coordinates
- Inventory actions with full destinations and maximum stacks
- Crafting with mirrored-invalid and offset-valid patterns
- Furnace output blocking, partial fuel, pause, unload/reload, and repeated UI access
- Light addition and removal across chunk borders
- Bounded water updates at unloaded borders
- Corrupt, oversized, old-version, and interrupted saves
- Mutation during snapshot encoding and simultaneous save requests
- Tab suspension, pause, pointer-lock loss, and WebGL context loss
- Service-worker upgrade with an obsolete cache and offline application reload
- Storage quota exhaustion, transaction abort, and private-mode storage failure
- Malformed worker payload lengths and transferred-buffer ownership mistakes

## Test discipline

Important deterministic logic is introduced with a failing test. A regression receives a test that fails for the original defect. Tests must assert observable behavior, not private implementation details. Randomized property tests use logged fixed seeds so failures reproduce exactly.

Development builds assert chunk ownership, revision monotonicity, queue bounds, registry IDs, finite numeric values, typed-array lengths, and disposed-resource reuse. Fault-injection adapters deterministically fail workers, storage, audio, service-worker installation, and WebGL restoration.

Long-running tests include repeated world enter and exit, a 20-minute streaming soak, save-during-mutation stress, repeated context-loss restoration in a controlled renderer test, and randomized inventory transactions checked against conservation invariants.

## Release verification

The final manual journey is defined in `acceptance/RELEASE_CHECKLIST.md`. Automated checks support that journey but do not replace browser testing on Chrome, Firefox, and Safari.
