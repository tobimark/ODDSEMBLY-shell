# Archived modes — Chips & Westworld (experiments)

These two worlds were built during the multi-mode exploration and are **not part of the
Loom deliverable**. They are kept here (excluded from `tsconfig` and from the Vite build)
so the work is recoverable and the shared engine primitives can be reused later.

Status at archive time (2026-11-16, git tag `archive/modes-wip-2026-11-16`):

| mode | state | evidence |
|---|---|---|
| `chips/` | playable prototype: deterministic 45-card deck, tool-family cards (Read/Edit/Write/Bash/Search), 5-card hands, 10 combo tiers, quota/settlement loop, programmatic card table + printed tickets | `review/v2/chips/` stills; archived 3-mode QA under `review/v2/archive-modes/` |
| `westworld/` | prototype: deterministic pressure-plant machine (5 subsystems, 5-call relief, 20-call purge), engraved dial, tanks, pipes, valves, slider-crank, steam | `review/v2/westworld/` stills; archived QA under `review/v2/archive-modes/` |

They were removed from the shipping UI because the user narrowed scope to the Loom scene.
The reusable parts are in `src/engine/core/` (VisualEngine, EventBus, AudioEngine,
ReplayPlayer, Spring/tween, programmatic drawing kit) and remain in production use by Loom.

## Re-enabling (if ever needed)

1. Move the folder back: `src/engine/gallery/chips` → `src/engine/modes/chips`
   (same directory depth, so the `../../core/*` imports still resolve).
2. Re-register in `src/engine/core/mode.ts` (`MODE_META`, `MODE_ORDER`, `REGISTRY`).
3. Restore `ModeId` in `src/engine/core/types.ts` and the replay map in `src/engine/core/replay.ts`.
4. Add `public/replay/chips-session.json` back (copy from `review/v2/archive/replay/`).
5. Re-run `npx tsc --noEmit` and the archived QA harness (`scripts/verify-v2.mjs --modes=chips`).

The original three-mode build and all QA evidence are preserved in git at tag
`archive/modes-wip-2026-11-16` (commit `c503d3a`).
