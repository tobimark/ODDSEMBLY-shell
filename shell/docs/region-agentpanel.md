# Region — AgentPanel (`src/regions/AgentPanel.tsx`)

Right-hand agent column of the CrommaCode 0.3.11 shell. Every number below was
measured on the native reference frame `../.tmp/shell/ref.png` (2906×1730,
200 % DPI) with `tools/probe.py`. Conversion used everywhere:

```
client-rel logical px  =  (native - 13) / 2
panel-rel (in the .tsx) =  client-rel - (1008, 100)
```

## 0. Status

| item | state |
|---|---|
| Panel shell (rect, border, radius, bg, 1 px bevel) | measured, implemented |
| Header row (glyph, segmented control, 3 window icons, divider) | measured, implemented |
| Conversation row (glyph, `OpenCode`, clock / arrow-up / close) | measured, implemented |
| `hi` bubble (stadium, gradient, tail, text) | body measured exactly; tail hand-fitted (±1–2 native px) |
| Composer (frame, placeholder, row 2, send button) | measured, implemented |
| Fonts / sizes / weights | `fontmatch.py` + pixel-mass calibration (see §6) |
| Score (panel box native 2029,213–2852,1699) | **meanAbs 1.43**, p95 1, %>8 2.5 % |
| Score (Lead's compare box 2020,200–2906,1710) | **meanAbs 2.08** — the extra 0.65 comes from *outside* this region (see §8) |
| Icon artwork | **hand-drawn placeholders** (§7) — the 189-icon theme has none of these pictograms |
| Sub-pixel AA | reference uses LCD/sub-pixel AA, the replica greyscale → per-glyph fringes cannot match |

## 1. Panel shell

| property | native | client-rel | value |
|---|---|---|---|
| border-box | x 2029..2852, y 213..1676 | left 1008, top 100, **w 412**, **h 732** | — |
| border | 2 native px | 1 px | `#dcdad5` (bottom row reads `#dddbd6`) |
| radius | ~25 native | 12.5 px | — |
| background | — | — | `#fefcf9` (flat; the capture dithers ±1 level — ignored) |
| inner bevel, top | y 215..216 | 1 px inside the top border | `#fffefd` |
| inner bevel, bottom | y 1673..1674 | 1 px inside the bottom border | `#eceae7` |
| right-chrome overlap | none — the chrome slot starts at native x 2875, the panel ends at 2852 | | |

> **Deviation from `CONVENTIONS.md` / `geometry.ts`:** both list the panel as
> `411.5 × 743` (bottom edge at client 843). The pixels say **412 × 732**
> (bottom border native 1675..1676 → client 831..832; the `#f6f1ea` bottom
> chrome starts at native 1699 → 843). The 412 width is self-consistent with
> the 14 px composer inset on *both* sides (1008+1+14 = 1023 and
> 1420−1−14 = 1405 = the measured composer edges); the same 14 px works
> vertically (composer bottom 817, panel inner bottom 831).
> So `diff.py`'s `agent_panel` region also contains ~22 native rows of exposed
> surface below the panel.

## 2. Header (native y 213..287)

| element | native ink bbox | client-rel | size | notes |
|---|---|---|---|---|
| separator | y 285..286, full width | y 136, h 1 | — | `#edeae6`, no side inset |
| left glyph | (2059,238)-(2079,262) | (1023, 112.5) | 10 × 12 | `#8e867b`, thick picture-frame glyph, 16 px box at (1020, 111) |
| segmented container | (2291,224)-(2591,276) | (1139, 105.5) | 150 × 26 | bg `#f9f6f1`, border 1 px `#e4e0db`, radius 6.5 |
| ↳ selected pill | (2296,229)-(2448,269) | (1141.5, 108) | 76 × 20 | bg `#fffdfb`, radius 6.5, soft shadow |
| ↳ chat-bubble icon | (2313,237)-(2341,263) | (1150, 112) | 14 × 13 | `#1a150f` |
| ↳ `Agent` | ink starts (2353,240) | x 1169.5, baseline 122.5 | 12.8 px req. | `#1a150f`, weight 700 |
| ↳ terminal icon | (2468,238)-(2494,262) | (1227.5, 112.5) | 13 × 12 | `#8e867b` |
| ↳ `终端` | ink starts (2510,237) | x 1247, baseline 123 | 12.8 px req. | `#766f65`, weight 600 |
| expand | (2674,237)-(2700,263) | (1330.5, 112) | 13 × 13 | two corner brackets |
| minimise | (2739,248)-(2763,252) | (1363, 117.5) | 12 × 2 | — |
| close | (2805,240)-(2825,260) | (1396, 113.5) | 10 × 10 | — |

## 3. Conversation row (native y 287..~380)

| element | native ink bbox | client-rel | size | notes |
|---|---|---|---|---|
| left glyph | (2059,311)-(2079,335) | (1023, 149) | 10 × 12 | same glyph, `#8e867b` |
| `OpenCode` | (2100,313)-(2220,337) | x 1042.5, baseline 159 | 12.8 px req. | `#766f65`, weight 400 |
| clock | (2671,307)-(2703,339) | (1329, 147) | 16 × 16 | outline clock |
| arrow-up | (2741,311)-(2760,335) | (1364, 149) | 9.5 × 12 | — |
| close | (2805,313)-(2825,333) | (1396, 150) | 10 × 10 | — |

No row background, no hover pill, no divider under the row (native y 340..390
is empty except the bubble's top edge at 390).

## 4. Message bubble `hi`

| property | native | client-rel |
|---|---|---|
| body (border box) | x 2694..2816, y 389.5..472 | (1340.25, 188.25) 61.5 × 41.5 |
| radius | — | **20.75** (= height/2, stadium; row-by-row outline fit gave r = 41 native) |
| fill | — | vertical gradient `#ffeac5` → `#ffdda4` (samples `#fee9c3`→`#ffdda5`) |
| border | 2 native px | 1 px `#e2a520` |
| tail | base x 2752..2784 at y ≈ 470, tip ≈ (2779, 486.5) | 16 × 8.6 at (1369.5, 228.25) |
| `hi` | ink (2727,420)-(2755,440) | x 1356, baseline 213.5; 13 px `#45310b`, weight 600 |

`fontmatch.py` for `hi`: Maple Mono CN **13.0 px**, score 0.984 (requested size
already exact — no nudge).

## 5. Composer (native 2059,1491 - 2823,1647)

| element | native | client-rel | size / value |
|---|---|---|---|
| frame | x 2059..2822, y 1491..1646 | (1023, 739) | 382 × 78, bg `#fffdfb`, border 1 px `#dfdcda`, radius 13 |
| placeholder | ink starts (2088,1522) | x 1035.5, baseline 767.5 | **14.9 px req.**, `#8e867b`, weight 600 |
| expand (row 1, right) | (2768,1516)-(2794,1542) | (1377.5, 751.5) | 13 × 13, `#bbb6ae` (= icon colour at ~60 % opacity) |
| paperclip | (2095,1591)-(2122,1619) | (1041, 789) | 13.5 × 14, `#8e867b` |
| `@` | (2147,1591)-(2175,1619) | (1067, 789) | 14 × 14, `#8e867b` |
| provider glyph | (2205,1593)-(2225,1617) | (1096, 790) | 10 × 12, `#1a150f` |
| `OpenCode` | ink starts (2238,1595) | x 1111.5, baseline 800 | 12.8 px req., weight 600 |
| provider chevron | (2374,1600)-(2392,1611) | (1180.5, 793.5) | 9 × 5.5 |
| model label | ink starts (2434,1593) | x 1209.5, baseline 800.5 | `opencode/Big Pic…` 12.8 px req., weight 600 |
| model chevron | (2714,1600)-(2732,1611) | (1350.5, 793.5) | 9 × 5.5 |
| send button | (2757,1581)-(2805,1629) | (1372, 784) | 24 × 24 circle, bg `#f9f6f1` (disabled) |
| send arrow | (2772,1593)-(2790,1617) | (1379.5, 790) | 9 × 12, `#d2c9bc` |

Neither pill has a visible background — both buttons sit transparently on the
composer surface. `mine 258 vs ref 258 native ink` after nudge.

## 6. Fonts — measured, then calibrated against the render

Family is **Maple Mono CN** everywhere (404-style mono, full-width Han). No CJK
fallback is needed (`终端` scores 0.95 with Maple Mono Cn, not YaHei).

`fontmatch.py` gives the family/weight, but Chrome's fractional advances run
~2 % narrower than the app's hinted integer advances, so the requested sizes
were tuned by re-measuring the *rendered* ink width:

| run | requested size | weight | rendered ink vs ref (native px) | mass ratio |
|---|---|---|---|---|
| `Agent` | 12.8 px | 700 | 76 vs 76 | 0.97 |
| `终端` | 12.8 px | 600 | 56 vs 55 | 0.95 |
| `OpenCode` (row) | 12.8 px | 400 | 120 vs 120 | 0.95 |
| `OpenCode` (composer) | 12.8 px | 600 | 120 vs 120 | 0.99 |
| `opencode/Big Pic…` | 12.8 px | 600 | 259 vs 258 | 0.99 |
| placeholder | 14.9 px | 600 | 653 vs 652 | 0.99 |
| `hi` | 13.0 px | 600 | 29 vs 29 | 0.98 |

The weight split is not cosmetic: at weight 400 the composer/`Agent` glyphs are
~22 % lighter in ink mass than the reference; at 600/700 the ratio lands within
3 %. The conversation-row `OpenCode` is the only 400-weight run (600 measures
12 % too heavy there — the two copies really do differ in the app).

All text is drawn as **SVG `<text>` anchored on the measured baseline**, so the
vertical placement does not depend on line-box metrics: `x = ink_left − lsb`,
`y = ink_top + ink_above_baseline`, both derived from the shipped TTFs.

## 7. Icons — placeholder artwork (for icon-mapper)

`src/svg/icons.ts` (189 icons) contains **none** of this panel's pictograms;
they come from a second, stroke-based set. Each icon below is hand-drawn in
`AgentPanel.tsx` with the measured size / position / stroke weight (1.5-1.7 px)
and colour, so the layout is right but the outline is an approximation:

| pictogram | used at | measured ink (native) |
|---|---|---|
| thick picture frame (10×12) | header + conversation row + provider chip — **3×** | 20 × 24 |
| speech bubble + tail | Agent pill | 28 × 26 |
| terminal window (`>_`) | 终端 tab | 26 × 24 |
| fullscreen (2 corner brackets) | header + composer | 26 × 26 |
| minus | header | 23 × 4 |
| cross | header + conversation row | 20 × 20 |
| outline clock | conversation row | 32 × 32 |
| up arrow | conversation row + send button | 19 × 24 |
| paperclip | composer | 27 × 28 |
| at-sign | composer | 28 × 28 |
| chevron-down | composer ×2 | 18 × 11 |

The provider chip glyph is the same picture-frame shape as the panel glyph (not
`brands/opencode.svg`) — measured 20 × 24 native, dark `#1a150f`.

## 8. Verification (numbers, and what is *not* mine)

`node tools/shoot.mjs` still exits 2147483651 inside this agent's sandbox, so
the screenshot was produced by an out-of-sandbox Playwright capture of the same
dev server (viewport 1453×865, DPR 2, `?static=1`) and then scored with the
project's own `tools/compare.py` (shot saved as `shots/agentpanel.png`).

| box | meanAbs | p95 | %>8 |
|---|---|---|---|
| `diff.py` agent_panel (2029,213–2852,1699) | **1.43** | 1 | 2.49 % |
| `compare.py --box 2020,200,2906,1710` | **2.08** | 12 | 5.9 % |

Band breakdown of the diff.py box: header 4.85 / conversation row 1.83 /
bubble 1.69 / message area 0.39 / composer row 1 7.12 / composer row 2 4.12 /
surface strip 2.31 — i.e. the residual is text AA plus a global 1-device-px
offset, not layout.

**Two global (not region-local) defects inflate the wide box:**

1. **The main surface `#fcfaf6` is never painted.** Every gap between regions
   (x 2020..2028 and x 2853..2875 beside this panel, the strip below it, the
   right gutter, the sidebar gaps) shows the chrome colour `#f6f1ea` instead of
   the reference's `#fcfaf6`. One `MainSurface` div in `App.tsx` fixes it for
   every region; it is worth ~0.5 meanAbs in this box.
   (As a stopgap this component paints an 11 px `#fcfaf6` strip under itself —
   delete it once the global layer exists.)
2. **`.client`'s 6.5 px offset is rasterised as 7 px** by headless Chromium, so
   the entire replica sits 1 device px right/down: the black frame is 14 native
   px wide instead of 13, and every border/edge in the capture is off by one
   device pixel. It cannot be cancelled from inside a region — with the client
   at an even device offset an element edge only lands on even device px, while
   this panel's left edge is at odd native 2029 (shifting the panel to 1007.5
   measures *worse*: 2.12 vs 1.43). Suggested global fix: position `.client`
   with `transform: translate(6.5px, 6.5px)` instead of `left/top`, or accept
   the half pixel globally.

Other residuals in this region are inherent: the reference has LCD sub-pixel
colour fringes (replica is greyscale) and the bubble tail is a fit, not a
measurement.

## 9. Reproduce

```bash
cd kunlun-shell
node tools/shoot.mjs http://127.0.0.1:5180/ shots/agentpanel.png
python tools/compare.py --box 2020,200,2906,1710 --shot shots/agentpanel.png --out agentpanel
```
