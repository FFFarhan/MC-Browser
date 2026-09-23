# Agent Constitution

These rules apply to every file and every milestone.

## Product boundaries

- Build an original voxel survival game, not a branded Minecraft clone.
- Target keyboard-and-mouse desktop browsers for the first release.
- Keep single-player fully client-side and deployable as static files; online play may use the separately hosted signaling/TURN services documented in `docs/MULTIPLAYER_HOSTING.md`.
- The approved small-room multiplayer and simple night/cave creatures are in scope; dedicated game servers, host migration, and complex creature AI are not.

## Always

- Use TypeScript with strict type checking.
- Keep world generation deterministic for a given seed and generator version.
- Represent voxel blocks with compact typed arrays.
- Treat the main thread as a latency-sensitive resource.
- Generate terrain and chunk meshes in Web Workers.
- Dispose replaced Three.js geometries, materials, textures, and render targets.
- Test negative coordinates and chunk boundaries explicitly.
- Validate inputs loaded from persistence before using them.
- Use data-driven registries for blocks, items, tools, and recipes.
- Keep subsystem APIs narrow, typed, and independently testable.
- Preserve a playable build at every accepted milestone.
- Document architectural deviations in `DECISIONS.md`.

## Never

- Create one Three.js mesh or JavaScript object per block.
- Generate terrain synchronously on the render thread.
- Scan the entire world during a frame or simulation tick.
- Use unbounded worker, fluid, lighting, or entity queues.
- Couple game rules to DOM elements or Three.js scene objects.
- Duplicate block, item, or recipe definitions.
- use `any` without a documented, narrowly scoped interoperability reason.
- Save naturally generated chunks when a seed plus mutation journal is sufficient.
- copy Minecraft textures, audio, code, branding, creatures, or UI art.
- weaken tests to make an implementation pass.
- continue to the next milestone with a failing quality gate.

## Change protocol

Before implementing a milestone:

1. Read its requirements and dependencies.
2. Identify its public interfaces.
3. Write or update tests for deterministic logic first.
4. Implement the smallest complete behavior.
5. Verify resource cleanup and failure paths.
6. Run the full quality gate.
7. Record material decisions.

Architectural changes require an entry in `DECISIONS.md` containing the context, decision, alternatives, consequences, and affected specifications.
