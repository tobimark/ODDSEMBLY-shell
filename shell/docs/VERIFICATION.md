# Verification report — how close is the replica?

Everything below is produced by re-rendering the replica into the **same raster**
as the reference and diffing pixels, not by eyeballing screenshots.

* reference: `analysis/r2-runtime/frames/mode_westworld_idle_native/000083_119605_printwindow2.png`
  (2906×1730 device px, Windows 200% DPI, GPUI/ClearType rasteriser)
* replica: `node tools/shoot.mjs` → Edge headless, `--force-device-scale-factor=2`,
  viewport 1453×865 → 2906×1730 PNG, greyscale AA (`--disable-lcd-text`), sRGB
* metric: per-pixel `max(|ΔR|,|ΔG|,|ΔB|)`, reported as `meanAbs` (0 = identical),
  `p95` and the share of pixels within 8 / 32 levels

```powershell
node tools/shoot.mjs http://127.0.0.1:5180/ shots/shell.png
python tools/diff.py --save        # -> shots/diff/heat.png, overlay.png, side-by-side.png
```

---

## 1. Headline result

| scope | meanAbs | p95 | ≤8 levels | ≤16 levels |
|---|---|---|---|---|
| whole 2906×1730 frame | **4.50** | 23 | 89% | — |
| **chrome only** (frame minus the game canvas) | **1.41** | **3** | **97.2%** | **98.0%** |

Per region (chrome only; the game canvas is out of scope):

| region | meanAbs | p95 | ≤8 levels |
|---|---|---|---|
| `right_gutter` | **0.03** | 0 | 99.9% |
| `agent_panel` | **1.02** | 1 | 98.8% |
| `title_bar` | **1.10** | 0 | 98.1% |
| `sidebar` | **2.00** | 8 | 95.2% |
| `nav_bar` | **1.97** | 5 | 96.0% |
| **CHROME SCORE** (mean of the five) | **1.22** | | |
| cards + HUD (float over the canvas) | 2.06 | 5 | 97.3% |
| *reference* `CENTER_out_of_scope` | *8.49* | 37 | 78.8% |

The game canvas is not reproduced (it is an empty well), which is why the
whole-frame number is 4.50 while the chrome is 1.42.

**Two text-compensation routes coexisted and were measured against each other** —
they are not merged into one conclusion, because they disagree:

| route | implementation | measured |
|---|---|---|
| A: weight 400 + ink compensation | `-webkit-text-stroke: 0.16–0.34px currentColor` on Maple Mono CN 400 | `title_bar` **1.91**, `sidebar` **2.61** |
| B: weight 600 + advance compression | Maple Mono CN **SemiBold** with negative `letter-spacing` to restore CJK/ASCII advances, no stroke | `nav_bar` **2.33** vs **2.82** for route A on the same region |

Route B wins on the pixel metric even though the reference is *semantically* 400
(the app's own ink is 17–22% heavier than a browser's 400 rasterisation). Offline
analysis (`docs/icons.md` §8) predicted route A would be enough; the measurement
disagreed. Both are recorded so a future merge can decide per region.

---

## 2. What is *exactly* reproduced (not "close" — same pixels)

Measured by scanning specific rows/columns of both rasters:

* **window frame** — black bands on the left / right / bottom are byte-identical
  (`meanAbs = 0.000`); the 6.5px desktop strip above the client area, and the
  fact that the frame has **square** corners, are both reproduced.
* **structural edges** — every panel/sidebar/canvas/gutter border lands on the
  same native columns as the reference: sidebar right rule `541..542`,
  agent panel `2029..2030` / `2851..2852`, gutter rule `2875..2876`,
  title-bar bottom rule `109..110`.
* **main surface** — `#fcfaf6` fills `x 543..2874, y 189..1700` exactly, including
  all inter-region gaps (`right_gutter` 0.03 proves the colour and the 1px rule).
* **sidebar** — non-text pixels score **0.57** meanAbs overall; the file-column
  band scores **0.20**, and the 9 coloured file-type icons score **0.00**
  (they are the original 16×16 bitmaps, recovered losslessly: every bitmap pixel
  maps to a 2×2 native block with zero intra-block deviation).
* **mode strip** — container 730..1839 × 212..271, active pill 737..938 × 219..264,
  label ink `758..915 × 232..253` all within 2 native px (1 logical px).
* **HUD counters** — `AGENT 0 … 输出 0` ink lands within 2 native px of the
  reference, colours `#8e867b` (labels) / `#1a150f` (numbers) exact.
* **title bar** — brand mark ink 54×60 native at native (40,23); wordmark and all
  six menus within ±1 native px.

---

## 3. Error budget — why the score is ~1.7 and not ~0.3

Measured on the final capture by splitting the chrome area into "ink" pixels
(pixels that differ from the dominant background by >24 levels in the reference —
i.e. glyphs, icon strokes, 1px rules) and everything else:

| group | area share | meanAbs | share of total error |
|---|---|---|---|
| **ink pixels** | **7.0%** | **13.30** | **~65%** |
| non-ink pixels | 93.0% | **0.52** | ~35% |

So **93% of the chrome area is reproduced to within half a level out of 255**
(colours, surfaces, borders, panel geometry, icons' solids), and essentially all
remaining error sits on glyph and icon *edges*.

The reference was rasterised by GPUI with **ClearType subpixel AA plus a
different gamma**; a browser screenshot produces anti-aliasing that can never be
identical. Consequences, measured rather than assumed:

* same glyph box, same font, same size → the reference's ink mass is
  **13–25% heavier** than Chromium's greyscale rasterisation. Two different
  compensations were measured against each other (see §1.1).
* text edges therefore never match to the level: a 1px-tall glyph edge that is 2
  levels off contributes 2 to the `meanAbs` of that row.
* CJK rows score 3–4× worse than ASCII rows *with identical geometry* simply
  because CJK strokes are thin and edge-dominated. Verified by re-measuring the
  same rows with coordinates corrected to ±2 native px — the score did not move.

**Capture back-end matters more than any per-element tweak.** The reference has
coloured sub-pixel fringes (`mean|R−B| = 20.3` on ink); capturing the replica
with `--disable-lcd-text` gives `mean|R−B| = 12.7`. A/B on identical code:

| capture | title_bar | sidebar | nav_bar | CHROME |
|---|---|---|---|---|
| `--disable-lcd-text` (greyscale AA) | 1.34 | 2.27 | 2.07 | 1.34 |
| **`--enable-lcd-text`** (subpixel AA) | **1.10** | **2.00** | **2.02** | **1.23** |

So `tools/shoot.mjs` now captures with LCD text **by default** (`SHOOT_LCD=0`
reverts it). This is not moving the goalposts: the reference itself is a
ClearType-rasterised frame, so subpixel capture is the *more faithful* ruler.
(An earlier A/B in this project showed the opposite result — that run was
polluted by a stale dev-server module and a different text-stroke setting, which
is why every comparison here is now taken twice after a settling delay.)

**A negative result worth recording:** for several elements, aligning the ink
bounding box to the reference's bounding box *increased* the pixel error
(HUD title 12.3 → 15.8; arrow 4.1 → 9.3) — because glyph rasterisation phase and
bbox edges are not the same thing. The correct objective is the pixel metric, and
elements were nudged in ±0.5 logical px steps by grid search instead.

**Second negative result:** moving text runs onto whole native pixel phases makes
bboxes more accurate but pixels *worse* (c2 card title 15.7 → 21.1): the app
positions glyphs at sub-pixel offsets, so `x.25` / `x.75` client phases are
correct. See `docs/region-cards.md` §9.

---

## 4. Not reproduced (and why)

| item | why |
|---|---|
| the centre GameView canvas (Westworld scene, paper texture, dot grid, pipes, gauges, "游戏视图" label, card bleed-through) | explicitly out of scope — the well is left empty |
| coloured file-type icons for extensions not present in the capture (js/ts, css, yaml, zip, pdf, …) | the app's `assets/file-icons/index.json` payload is not in the release binary; only the 8 visible types could be recovered |
| the bee glyphs in the sidebar project card | no bee asset exists in the binary or the icon theme; hand-drawn approximation (28×24 vs the reference's 30×30) |
| a few custom glyphs with no shipped asset (window min/max/close primitives, the 9×12 frame glyph in the path chip, the slim fork icon in the nav rail) | reverse-engineering showed the shipped assets do not match these shapes (wrong aspect / stroke weight); they are hand-drawn from measured ink boxes |
| hover / pressed / focus states | the reference is a single static frame; inventing states would be fabrication |
| text sub-pixel colour fringing | physically impossible with a browser rasteriser (see §3) |
| fonts on a machine without the app's TTFs | the exact TTFs ship from `public/fonts/`; a fallback would change metrics |

---

## 5. Reproducibility note

Two consecutive captures of the unchanged page are **byte-identical**
(`max |shot1 − shot2| = 0`), so the numbers above are not capture noise.
(`tools/shoot.mjs` retries when the PNG looks blank; a *stale but valid* frame
after a file write is the one failure mode to watch for — wait ~4s after an edit.)

A last caveat recorded honestly: two different ink tables were produced while
measuring icons (one from the reference raster, one from flattened SVG paths in
`NavBar.tsx`'s `ASSET_INK`). They disagree by ±1 native px on `lock` and `clock`;
mixing them introduces a systematic ±1px offset, so a merge should pick **one**
table (preferably the reference-raster one) and re-derive all icon sizes from it.

## 6. Reproducing these numbers

```powershell
cd D:\workspace\gamified-flow\kunlun-shell
npm run dev &                                   # or a separate terminal
node tools/shoot.mjs http://127.0.0.1:5180/ shots/shell.png
python tools/diff.py --save                     # prints the region table above
python tools/compare.py --box 0,0,2906,112 --scale 2 --out titlebar
```

`shots/diff/heat.png` is a 6× amplified per-pixel error map; `overlay.png` and
`side-by-side.png` are for eyeballing. `tools/compare.py` prints REF / MINE /
DIFF as three stacked panels for any box you pass.

> Numbers in this file were captured at the end of the build session; re-running
> `tools/diff.py` is the source of truth if the components change afterwards.

---

## 7. Rebrand: ODDSEMBLY identity (post-verification change)

Everything above was measured against the shipped CrommaCode UI. On request the
title-bar identity was then replaced with the project's own **ODDSEMBLY** brand,
so the reference no longer applies to that one area. Measured impact:

| scope | before swap | after swap |
|---|---|---|
| title-bar brand region (native 13,13 → 300,109) | 0.9 | **27.79** (intentional) |
| title bar, menus + window buttons (native x ≥ 300) | 1.08 | **1.08** (untouched) |
| sidebar / nav / agent / gutter / cards | 2.00 / 1.97 / 1.02 / 0.03 / 2.06 | **identical** |
| chrome only | 1.41 | **1.67** |
| whole frame | 4.50 | **4.64** |

So the identity swap costs 0.26 on the chrome score and **changes nothing else** —
the increase is entirely the difference between two different logos.

How the new marks were produced (no ground truth exists for them, so this is
reproduction of a supplied raster, not reverse engineering):

* source raster `public/brand/oddsembly-brand-source.png` (2172×724, ink
  `#28241a` on `#fdf8f2`), two ink groups measured at x168..603 / x692..1992;
* traced with OpenCV: greyscale → Gaussian blur σ1.1 → threshold → `findContours`
  (`RETR_CCOMP`) → `approxPolyDP` ε0.55. Counters survive as separate subpaths,
  rendered with `fill-rule="evenodd"`;
* emitted to `src/svg/brand.tsx` as `<BrandMark height>` (viewBox 436×400) and
  `<BrandWordmark height>` (viewBox 1301×164), filled with `currentColor`;
* placed using the raster's own proportions — mark 30px tall at client (13.5, 5),
  wordmark 12.3px tall at (52.8, 13.85) — which keeps the menu row at its
  measured x positions;
* `public/brand/oddsembly-mark.png` is the alpha-cut mark (used for the favicon).