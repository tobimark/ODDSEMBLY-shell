# Merge guide — folding `kunlun-shell` into `kunlun-loom`

This subproject exists to be **reviewed, then merged**. It is a static, pixel-exact
replica of CrommaCode 0.3.11's chrome; it is not a working app. This document is
the checklist for turning it into the real Loom shell.

---

## 1. What you can lift as-is

| path | what | reuse |
|---|---|---|
| `public/fonts/*.ttf` | the app's own 5 TTFs | copy verbatim; nothing else reproduces the metrics |
| `src/styles.css` (`@font-face`, `.viewport/.stage/.client/.surface/.gutter`) | window frame + fit-to-window | copy verbatim |
| `src/geometry.ts` | the coordinate contract (`px()`, `WINDOW`, `CLIENT`, region rects, palette `C`) | copy verbatim |
| `src/regions/*.tsx` | the six chrome regions | copy; replace hard-coded content with props/state (§3) |
| `src/svg/icons.ts`, `uiIcons.ts`, `Icon.tsx` | 189 + 104 icons extracted from the binary | copy verbatim |
| `src/svg/brand.tsx` + `public/brand/` | **ODDSEMBLY** mark + wordmark (vectorised from the supplied raster; the shipped CrommaCode reader glyph was replaced on request) | copy verbatim |
| `src/svg/fileIcons.tsx` | 8 coloured file-type bitmaps + extension map | copy verbatim |
| `tools/*` | the verification harness | copy to Loom's `tools/` or keep beside it for QA |

**Do not** copy `node_modules` (it is a junction to Loom's own), `.tmp*/`,
`shots/`, or `dist/`.

---

## 2. Non-negotiable geometry rules

These were derived by debugging 1-pixel mismatches; breaking them re-introduces
off-by-one errors:

1. **Client origin is (6.5, 6.5)** inside the 1453×865 stage, and the stage is
   rendered at `devicePixelRatio = 2`. `6.5 * 2 = 13` device px — exactly the
   reference's client offset. Do **not** round it to 6 or 7; do not add
   `translate(0.5px)` "fixes".
2. **The frame is square-cornered** with hard black bands only on the left /
   right / bottom (6.5px); the strip above the client is the desktop colour.
   This is what the capture actually contains.
3. **All interior coordinates are client-relative logical px**, authored with
   `(native − 13) / 2`. Never copy native numbers into CSS.
4. **`overflow:hidden` on `.client`** is load-bearing: several regions
   deliberately overhang their box.
5. If you replace the fit-to-window scaling with a real window, keep the stage
   at 1453×865 for capture parity, or update `tools/diff.py`'s regions to match
   the new raster.

---

## 3. What is mocked, and what to replace

Every region is a *static snapshot of one frame*. The content is hard-coded:

| region | mocked | replace with |
|---|---|---|
| `TitleBar` | menu labels 文件/编辑/搜索/视图/终端/帮助, no menus open | wire to real menu actions |
| `NavBar` | project name `test`, 游戏 tab permanently disabled+locked, 氛围 active | real project + real view state |
| `Sidebar` | project card (`C:\Program Files\Po…`, badges `1分/⚡0/🤖0`, 6 empty bee slots), the 9 filenames, footer chips, `登录` | real project tree + auth state |
| `CanvasWell` | empty well; only the 7-tab mode strip is real (`Westworld` active) | mount Loom's GameView inside the well; keep the strip |
| `Cards` | HUD counters all `0`; 卡 3 `0.00 tok/s` / `— MB`; 卡 4 `没有后台进程` | real metrics store |
| `AgentPanel` | provider `OpenCode`, model `openCode/Big Pic…`, one `hi` bubble, empty composer | real agent session + composer |

Pattern used everywhere: a module-level `const` array + absolute positioning.
Converting to data-driven is mechanical — keep the measured numbers, swap the
source of the values.

---

## 4. Known gaps (accept or fix deliberately)

| gap | severity | note |
|---|---|---|
| game canvas not reproduced | by design | the well is an empty `#fbf9f5` block; the mode strip and the shadow above the well *are* reproduced |
| text AA differs from the app | unavoidable | GPUI ClearType vs browser greyscale AA; compensated with `-webkit-text-stroke: 0.20–0.34px` — see `VERIFICATION.md` §3 |
| hover / pressed / focus states | missing | the reference is one static frame; states must be designed, not copied |
| 5 hand-drawn glyphs | cosmetic | `win-minus`, `win-max`, `win-close`, `glyph-frame`, `glyph-fork` in `uiIcons.ts` — no matching asset ships in the binary (see `icons.md`) |
| bee glyphs in the project card | cosmetic | no bee asset exists anywhere in the binary; hand-drawn approximation |
| coloured file icons only for 8 extensions | functional | js/ts/css/yaml/zip/pdf/… fall back to the monochrome `file` icon |
| `Cromma Sans` usage | unknown | the app's default UI font is `Maple Mono CN`; `Cromma Sans` is registered but barely used — verify against real text in Loom |

---

## 5. QA harness you inherit

```powershell
node tools/shoot.mjs http://127.0.0.1:5180/ shots/shell.png   # 2906x1730, DSF 2
python tools/diff.py --save                                    # region table + heat/overlay
python tools/compare.py --box 13,110,541,1716 --scale 2 --out sidebar
python tools/probe.py bbox 48 136 102 160                      # measure the reference
python tools/fontmatch.py --box 114,36,295,70 --text "CrommaCode"
```

Two operational lessons worth keeping:

* **Wait for HMR before capturing.** A screenshot taken <3s after a file write can
  catch a Vite error overlay or a half-applied module; `tools/shoot.mjs` retries
  when the PNG looks blank, but a *stale-but-valid* frame still fools it. Shoot
  twice and compare when a score jumps unexpectedly.
* **Never judge by bounding boxes.** Aligning ink bboxes to the reference
  repeatedly made pixel scores *worse* (see `region-cards.md` §9). The objective
  is the pixel metric.

---

## 6. Suggested merge order

1. copy fonts + `styles.css` + `geometry.ts`; get a blank 1440×852 client with the
   exact frame and surface colours rendering;
2. copy `svg/` and verify one icon renders at the same size as the reference;
3. bring in regions one at a time, re-running `tools/diff.py` after each — the
   score should drop monotonically per region; if a region *increases* the score
   after wiring real data, suspect a font or coordinate regression first;
4. only then replace hard-coded content with live state;
5. delete `CanvasWell`'s empty block once the real GameView is mounted, but keep
   the mode strip component and its measured offsets.
