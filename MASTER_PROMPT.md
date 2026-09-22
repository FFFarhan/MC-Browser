# One-Shot Browser Voxel Survival Build

You are the implementation agent for an original browser-based voxel survival game. Your job is to build the project from an empty repository into the release described by the permanent specifications in this repository.

## Required reading

Before changing code, read these files completely:

1. `AGENTS.md`
2. `docs/ARCHITECTURE.md`
3. `docs/GAME_SPEC.md`
4. `docs/BLOCKS.md`
5. `docs/WORLD_GENERATION.md`
6. `docs/RENDERING.md`
7. `docs/TEXTURES.md`
8. `docs/PERFORMANCE.md`
9. `docs/TESTING.md`
10. `docs/ROADMAP.md`
11. `docs/acceptance/RELEASE_CHECKLIST.md`
12. `DECISIONS.md`

If the documents appear to disagree, follow this priority order: `AGENTS.md`, `GAME_SPEC.md`, `ARCHITECTURE.md`, subsystem specifications, `ROADMAP.md`, and finally this prompt. Record the conflict and its resolution in `DECISIONS.md`.

## Mission

Create a polished, desktop-first, single-player voxel survival game that runs entirely in a modern browser. It must use original procedural artwork, deterministic seeded terrain, streamed chunks, first-person survival gameplay, local persistence, and a complete tested production build. It must not use Minecraft branding, code, textures, audio, names, or other proprietary assets.

## Execution protocol

This is one autonomous run, but it is not one undifferentiated coding task.

1. Inspect the repository and confirm the current milestone.
2. Create a milestone checklist from `docs/ROADMAP.md`.
3. Work on exactly one milestone at a time, in order.
4. Break that milestone into small test-driven tasks.
5. Keep the application runnable after every task.
6. Run the milestone's focused tests as work progresses.
7. Run the complete quality gate before accepting the milestone.
8. Fix every failure before moving forward.
9. Update `DECISIONS.md` for any necessary deviation.
10. Commit the accepted milestone with a descriptive commit message.
11. Continue until the release checklist passes or progress is blocked by an unrecoverable environment issue.

Do not silently omit, weaken, or reinterpret acceptance criteria. If a requirement cannot be completed, leave the last working version intact and report the exact blocker, evidence, attempted remedies, and unfinished criteria.

The production invariants in `docs/ARCHITECTURE.md` override convenience. Do not accept a feature that works only on the happy path: exercise stale asynchronous results, queue saturation, subsystem failure, chunk boundaries, negative coordinates, save interruption, and resource cleanup at the milestone that introduces the relevant system.

## Quality gate

Once M0 establishes the scripts, every milestone must pass:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Performance-sensitive milestones must also run the benchmark commands established in M0. Never claim a milestone is complete from visual inspection alone.

## Scope discipline

Build only the first release. Do not add multiplayer, complex mobs, villages, redstone-like automation, dimensions, portals, accounts, cloud saves, mod support, mobile controls, shader packs, or infinite vertical terrain. A smaller correct system is preferable to a broad incomplete one.

Begin with M0 only. Do not start M1 until every M0 acceptance criterion passes.
