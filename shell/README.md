# kunlun-shell

Standalone, pixel-level replica of the **CrommaCode 0.3.11** desktop client chrome
(Windows, 200% DPI), built as a throwaway-but-mergeable Vite + React + TypeScript
subproject.

Scope: **everything except the centre GameView canvas** — i.e. title bar, main
navigation, project/file sidebar, mode strip, HUD + metric cards, right agent
panel (header, session row, message area, composer), window frame and right
gutter.

> **2026-11-17 update — the Game View is no longer an empty well.**
> The Loom scene from `../kunlun-loom` is mounted inside it. See
> [Game View: Loom](#game-view-loom) below.

The goal was never "looks similar": every box, colour, font size, letter
spacing, radius, icon and 1px border was measured out of the original 2906×1730
native capture and verified by re-rendering the replica into the *same* raster
and diffing pixel by pixel.

---

## Quick start

```powershell
cd D:\workspace\gamified-flow\kunlun-shell
npm run dev        # http://127.0.0.1:5180/
npm run build      # tsc -b && vite build  ->  dist/
```

> `node_modules` is currently a **directory junction** to
> `../kunlun-loom/node_modules` (the sandbox refused a real install).
> For a clean checkout run a normal `npm install` instead.

Open the page at a viewport of 1453×865 CSS px for a 1:1 mapping with the
reference frame; any other size scales the 1453×865 stage with
`transform: scale()` (fit-to-window, `src/App.tsx`).

---

## Game View: Loom

The centre well now hosts the real Loom engine from `../kunlun-loom` — the same
code the standalone page runs, not a reduced copy:

| Piece | Where |
|---|---|
| Alias `@loom` → `../kunlun-loom/src` | `vite.config.ts`, `tsconfig.json` path map |
| Mount + lifecycle | `src/regions/LoomView.tsx` |
| Well geometry / active pill | `src/regions/CanvasWell.tsx` |
| Event source | the shell's own `snapshot.toolCalls` (`src/data/store.tsx`) |

Rules it follows:

- **One source of truth.** Calls come from the workbench store, keyed by
  OpenCode's own call id; nothing is re-derived and no second event pipeline is
  added. Calls observed while the well is open are woven in arrival order.
- **No history replay.** The first snapshot seeds the dedup set, so opening the
  shell shows an empty loom rather than re-weaving an old session.
- **The canvas floor is the shell's own chrome.** The engine is given
  `top = strip bottom`, `bottom = 660` (the `游戏视图` caption / HUD row), so the
  scene never draws under the caption, the HUD row or the metric cards.
- **No page-level side effects.** The engine no longer touches
  `document.body` (it used to set the page background), so the shell's own
  paper colour wins.
- **Mount only when idle** (files view owns the well when a file is open); the
  engine is destroyed on unmount, so no canvas or WebGL context leaks.

Mounting it costs one alias and one extra dep — `pixi.js` resolves from
`../kunlun-loom/node_modules` via the importing file, so nothing is duplicated.

`tools/build.mjs` wraps `vite build` with `TEMP` pointed at `.tmp/build-temp`:
this machine intermittently fails esbuild's temp-file delete (`Access is denied`)
inside `%LOCALAPPDATA%\Temp`.

---

## What "pixel level" means here

The reference is `analysis/r2-runtime/.../printwindow2.png`: a PrintWindow grab of
the real app at 200% DPI, 2906×1730 device px.

```
CSS logical px  = native px / 2
client-relative = (native - 13) / 2        # client area starts at native (13,13)
```

The replica is authored **entirely in client-relative logical px** with
absolutely positioned elements (`src/geometry.ts` holds the contract), then
rendered at `devicePixelRatio = 2` so the raster matches 1:1.

Verification loop (`tools/`):

```powershell
node tools/shoot.mjs http://127.0.0.1:5180/ shots/shell.png   # Edge headless, DSF 2 -> 2906x1730
python tools/diff.py --save                                    # per-region scores + heat/overlay/side-by-side
python tools/compare.py --box 13,110,541,1716 --scale 2 --out sidebar   # REF | MINE | DIFF panel for one box
python tools/probe.py rows|cols|bbox|colors|rle ...            # measure the reference (native coords)
python tools/fontmatch.py --box X0,Y0,X1,Y1 --text "..."       # identify font family / weight / px size
```

`tools/diff.py` scores:

| region | box (native) |
|---|---|
| `title_bar` | 13,13 → 2892,109 |
| `sidebar` | 13,110 → 541,1716 |
| `nav_bar` | 543,110 → 2892,212 |
| `agent_panel` | 2029,213 → 2852,1699 |
| `right_gutter` | 2876,213 → 2892,1716 |
| `CENTER_out_of_scope` | 543,213 → 2005,1699 (game canvas — not replicated) |

---

## Layout contract

```
1453 x 865 stage          (#000 frame, 6.5px desktop strip on top, square corners)
└── client 1440 x 852 @ (6.5, 6.5)      #f6f1ea
    ├── surface 1166 x 794.5 @ (265, 49)  #fcfaf6   ← main working surface
    ├── TitleBar     1440 x 49          #f6f1ea, 1px #eae8e4 bottom rule
    ├── Sidebar      265  x 802.5       #f6f1ea, 1px #eae8e4 right rule
    ├── NavBar       1166 x 51 @ 265,49 (transparent, sits on surface)
    ├── CanvasWell   730.5 x 743 @ 265,100   ← empty; carries the mode strip
    ├── Cards        HUD row + 4 metric cards, floated over the well
    ├── AgentPanel   412 x 732 @ 1008,100   #fefcf9, 1px #dcdad5, r 12.5
    └── gutter       9 x 794.5 @ 1431,49    #f6f1ea + 1px #eae8e4 left rule
```

Full element-by-element tables live in `docs/region-*.md`.

---

## Assets — all extracted from the shipped binary, nothing redrawn by eye

| asset | where | provenance |
|---|---|---|
| `Cromma Sans` 400/500 | `public/fonts/CrommaSans-*.ttf` | TTFs embedded in `cromma-bees.exe` |
| `Maple Mono CN` 400/600/700 | `public/fonts/MapleMonoCN-*.ttf` | same |
| 189 theme icons + 98 UI icons | `src/svg/icons.ts`, `src/svg/uiIcons.ts` | literal `<svg>` string constants inside the binary |
| **ODDSEMBLY brand mark + wordmark** | `src/svg/brand.tsx`, `public/brand/` | **NOT from the binary** — vectorised from the supplied brand raster (see below) |
| 8 file-type icons (coloured) | `src/svg/fileIcons.tsx` | 16×16 RGBA bitmaps, losslessly recovered from the 200% capture (1 bitmap px = 2×2 native px, zero deviation) |

Typography facts (measured with `tools/fontmatch.py`, ink boxes match exactly):

* the app's default UI font is **Maple Mono CN** — including full-width CJK;
  `Cromma Sans` is only used for display-size text;
* menus / section labels **13px**, nav project name **14px**, file rows / tabs
  **15px**;
* in the original app the title-bar name `CrommaCode` was **text** (Maple Mono CN
  400 @15px), not a vector wordmark. It has since been **replaced by the
  ODDSEMBLY wordmark vector**.

### Brand identity (replaced)

The shipped CrommaCode brand was swapped for the project's own ODDSEMBLY identity
on request:

* source: `public/brand/oddsembly-brand-source.png` (2172×724 raster supplied by
  the owner, ink `#28241a` on `#fdf8f2`);
* vectorised with OpenCV (blur → `RETR_CCOMP` contours → `approxPolyDP` ε0.55),
  counters preserved via `fill-rule="evenodd"`, emitted as
  `src/svg/brand.tsx` (`<BrandMark height>` 436×400, `<BrandWordmark height>`
  1301×164);
* placed with the raster's own proportions: mark 30px tall at client (13.5, 5),
  wordmark 12.3px tall at (52.8, 13.85) — the menus keep their measured
  positions;
* `public/brand/oddsembly-mark.png` (alpha-cut) doubles as the favicon source.

See `docs/icons.md` for the icon inventory and `docs/VERIFICATION.md` §7 for what
this does to the pixel score (the title-bar brand region intentionally no longer
matches the CrommaCode reference).

---

## Status

Measured against the reference raster (re-run `tools/diff.py` to refresh).
**Post-rebrand note:** the reference still shows the *old* CrommaCode identity, so
the title-bar brand region now differs by design — see the two rows below.

| scope | meanAbs (0 = identical) | ≤8 levels |
|---|---|---|
| whole frame | 4.64 | 89% |
| **chrome only** (frame minus game canvas) | **1.67** | 97.1% |
| `right_gutter` / `agent_panel` / `nav_bar` / `sidebar` | 0.03 / 1.02 / 1.97 / 2.00 | |
| `title_bar` **including** the new brand | 3.74 | |
| `title_bar` menus + window buttons only (x ≥ 300 native) | **1.08** | |
| title-bar brand region (native 13,13 → 300,109) — **intentional difference** | 27.79 | |
| cards + HUD (over the canvas) | 2.06 | |

Before the identity swap the same build measured `title_bar` 1.10 / chrome 1.41.
Everything outside the brand region is bit-for-bit unchanged by the swap.


See **`docs/VERIFICATION.md`** for the score table, the error budget (why the
remaining delta is text rasterisation, not geometry), the two competing
text-compensation routes that were measured against each other, and the honest
list of what is *not* reproduced.

See **`docs/MERGE-GUIDE.md`** for how to fold this into `kunlun-loom`.

---

## Directory map

```
kunlun-shell/
├── index.html
├── vite.config.ts            # port 5180
├── public/fonts/             # 5 extracted TTFs
├── src/
│   ├── main.tsx
│   ├── App.tsx               # stage / surface / gutter + region composition
│   ├── geometry.ts           # the coordinate contract (px(), WINDOW, CLIENT, …)
│   ├── styles.css            # @font-face, frame, fit-to-window
│   ├── regions/
│   │   ├── TitleBar.tsx      # brand mark, wordmark, 6 menus, 3 window buttons
│   │   ├── NavBar.tsx        # project name, 6-tab capsule, terminal pill, rail
│   │   ├── Sidebar.tsx       # project card, 9-row file tree, footer chips
│   │   ├── CanvasWell.tsx    # empty well + 7-tab mode strip
│   │   ├── Cards.tsx         # HUD counters + 4 metric cards
│   │   └── AgentPanel.tsx    # panel header, session row, bubble, composer
│   └── svg/                  # icons.ts, uiIcons.ts, Icon.tsx, brand.tsx, fileIcons.tsx
├── tools/                    # shoot.mjs, diff.py, compare.py, probe.py, fontmatch.py, gen_icons.py
└── docs/                     # CONVENTIONS.md, region-*.md, icons.md, VERIFICATION.md, MERGE-GUIDE.md
```

## Conventions for anyone touching this

`docs/CONVENTIONS.md` is the shared contract: coordinates, colours, fonts, icon
usage, probe commands, and the rule that **every number must be measured, never
eyeballed**. Read it first.
