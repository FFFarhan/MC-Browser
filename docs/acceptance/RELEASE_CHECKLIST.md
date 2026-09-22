# Release Acceptance Checklist

## Automated gate

- [ ] `npm run format:check` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test:e2e` passes.
- [ ] Performance benchmarks are recorded and within approved budgets.
- [ ] The 20-minute streaming soak reaches stable chunk, heap, and GPU-resource counts.
- [ ] Fault-injection tests for workers, storage, WebGL, audio, and service-worker installation pass.

## Complete play journey

- [ ] Create a named world from a typed seed.
- [ ] Verify the seed is visible and a safe spawn is selected.
- [ ] Walk across positive and negative chunk boundaries without a visible terrain seam.
- [ ] Gather a log and convert it to planks and sticks.
- [ ] Craft and place a crafting station.
- [ ] Craft a wooden tool, mine stone, and craft a stone tool.
- [ ] Find coal and raw iron, smelt an iron ingot, and craft an iron-grade tool.
- [ ] Break and place blocks on chunk edges.
- [ ] Observe drops, pickup, stack merging, splitting, and full-inventory behavior.
- [ ] Build a shelter and observe sunlight and block light.
- [ ] Swim and modify a bounded water flow.
- [ ] Experience day, sunset, night, and sunrise.
- [ ] Lose hunger, take fall damage, regenerate, die, and respawn.
- [ ] Pause and verify simulation stops and pointer lock releases.
- [ ] Change and persist controls, video, accessibility, and audio settings.
- [ ] Save, refresh, and verify player, inventory, time, and mutations.
- [ ] Travel far enough to unload the starting chunks, then return and verify edits.
- [ ] Trigger a floating-origin rebase in a deterministic test world without camera, collision, particle, or audio discontinuity.
- [ ] Export a world, import it under a new name, and verify equivalent state.
- [ ] Reject an invalid import without damaging existing worlds.

## Browser and deployment checks

- [ ] Current stable Chrome completes the journey.
- [ ] Current stable Firefox completes the core movement, interaction, and save flows.
- [ ] Current stable Safari completes the core movement, interaction, and save flows.
- [ ] The production output runs from a static HTTP server.
- [ ] The game loads after network loss once production assets are cached.
- [ ] Installing a newer production build replaces its static asset cache without touching saved worlds.
- [ ] WebGL context loss and restoration do not corrupt the save.
- [ ] Audio denial or failure does not prevent play.
- [ ] Worker crash and queue overload recover without freezing or accepting stale terrain.
- [ ] Storage quota failure preserves the last committed world and offers diagnostic export.

## Legal and product checks

- [ ] No copied Minecraft code, textures, audio, branding, names, or UI artwork exists.
- [ ] Third-party dependencies have compatible licenses and notices.
- [ ] The committed lockfile reproduces the release from a clean install.
- [ ] The production bundle contains no test-only hooks or public source maps.
- [ ] Controls, save limitations, browser requirements, and known limitations are documented.
- [ ] Every required release feature is implemented rather than represented by a placeholder.
