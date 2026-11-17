# 图标 / 品牌资产清单 — CrommaCode 0.3.11

> 本文件记录 `kunlun-shell` 复刻用到的**全部图标与品牌资产**：它们从哪里来、叫什么、用在哪、
> 有多大把握。所有结论都有实测依据（SHA-256 内容比对 / 参考帧墨迹测量 / fontmatch），
> 没有"看起来像"的猜测被写成事实。**不确定的地方在 §6 明确列出。**

交付文件：

| 文件 | 内容 |
|---|---|
| `src/svg/uiIcons.ts` | `UI_ICON_PATHS: Record<string,string>` — 98 个按语义命名的 16×16 currentColor 图标 |
| `src/svg/brand.tsx` | `<BrandMark size/>` — 标题栏品牌标志（程序里真实的品牌矢量） |
| `src/svg/fileIcons.tsx` | `FILE_ICON_PATHS` / `<FileIcon/>` — 8 个彩色文件类型图标（16×16 位图 data URL） |
| `docs/icons.md` | 本文件 |

`src/svg/Icon.tsx` 与 `src/svg/icons.ts` 是 Lead 的共享文件，**我没有改**。

---

## 0. 结论速览（三个问题）

### Q1 标题栏左侧标志是哪个资产？→ `icons/brand-crommacode.svg`（= `vibeloft-web-assets/brand/icon-reader-black-61bf00133b44848b.svg`）

二进制里只有三个品牌矢量，它们的区别是决定性的：

| 二进制路径 | 我方提取文件 | viewBox | 内容 | 标题栏用？ |
|---|---|---|---|---|
| `vibeloft-web-assets/brand/icon-reader-black-61bf00133b44848b.svg` | `analysis/r2-assets/svg/icons/brand-crommacode.svg` | `0 0 289.57 289.57` | 伏在笔记本后的小人 + 头顶七道光（7 条 `fill-opacity` .4/.3/.2/.1/1/.9/.8 的射线），**无底板** | ✅ **是这个** |
| `brand/icon.svg` | `analysis/r2-assets/svg/0x3a0185e_l8862__brand_icon.svg.svg` | `0 0 1024 1024` | 同一个 reader + 七道光，但叠在 **Apple 图标网格的 824 见方白色连续圆角底板**（100..924）上，供 xtask 栅格化 .icns/.ico/Dock | ❌ 应用图标，不是标题栏 |
| `icons/brand-cromma.svg` | `analysis/r2-assets/svg/icons/brand-cromma.svg` | `0 0 740.00 521.72` | "三点相连的一笔" = **Cromma** 产品标（不是 IDE 标） | ❌ 另一个产品标 |

判据：参考帧标题栏里的 reader **直接压在没有底板的奶白 chrome 上**，没有白色圆角底板 → 只能是那个 **plate-less 289.57** 矢量。

实测（`.tmp/shell/ref.png`，原生 2×）：

| 量 | 值 |
|---|---|
| 墨迹 bbox | native `(40,23)–(94,83)`，**54×60** native = **27×30** 逻辑 px |
| 墨迹左上角 | native `(40,23)` → **client 相对 `(13.5, 5.0)`** |
| 墨迹宽高比 | 0.900（矢量内容比 255.41/289.57 = 0.882，差 2% ≈ 抗锯齿） |
| 由比例反推 | SVG 方形 viewBox 左右各留 17.08/289.57 = **5.90%**，所以 `size=30` 的盒子里墨迹正好 26.5×30 |

用法（client 相对坐标）：

```tsx
<BrandMark size={30} style={{ position: 'absolute', left: 11.7, top: 5 }} color="#1A150F" />
```

### Q2 "CrommaCode" 是文字还是矢量字标？→ **是文字。不是矢量字标。**

`fontmatch` 实测：

```
python tools/fontmatch.py --box 114,36,295,70 --text "CrommaCode"

ref ink bbox (native): 176x22    ref ink starts at native (114,42)
  score 0.963  MapleMono-400  native=30  css=15.0px   ink ref=(176,22) cand=(176,22)   ← 墨迹尺寸完全一致
  score 0.936  MapleMono-600  native=30  css=15.0px   ink ref=(176,22) cand=(177,22)
  score 0.924  MapleMono-700  native=30  css=15.0px   ink ref=(176,22) cand=(176,22)
  score 0.763  MicrosoftYaHei-400 css=13.5px
```

**结论：Maple Mono CN 400，15px**（= 原生 30px）。

> ⚠️ 之前测到 score 0.52 是**测量框选错了**：`--box 110,30,460,80` 把菜单项（文件/编辑/搜索…）
> 一起框了进去。文字列扫描显示 "CrommaCode" 的 10 个字形只占 **native x 114..289**，
> 菜单"文件"从 **x=336** 才开始（中间 47px 是菜单项左内边距），所以框必须止于 ~x=295。

独立佐证（等宽字体特征）：逐字列区间为

```
114..129  133..147  150..164  167..183  185..201  203..218  221..236  239..253  257..271  275..289
```

10 个字形、步进恒为 **18 native = 9 逻辑 px**。Maple Mono CN 的等宽步进是 0.6em，15px × 0.6 = **9.0px** — 完全吻合。

排版参数（client 相对）：

| 量 | 原生 | client 相对逻辑 |
|---|---|---|
| 墨迹左 | x 114 | **50.5** |
| 墨迹上 | y 42 | **14.5** |
| 墨迹尺寸 | 176×22 | **88×11** |
| 字号 / 字重 / 字体 | 30 / 400 / Maple Mono CN | **15px / 400** |

=> 无需向量字标组件：用
`font: 400 15px/1 'Maple Mono CN'; letter-spacing:0` 的普通文本，左边界对齐到 client x=50.5，
再用 `transform` 或行高把墨迹顶压到 y=14.5 即可。

### Q3 彩色文件类型图标是什么？→ **16×16 像素位图（Material 调色板）**，不是彩色 SVG、不是 PNG 资源、不是 emoji

- 不是彩色 SVG：二进制里 344 个 `<svg>` 字面量全部已提取，除去 189+96 个 16×16 currentColor 图标、
  24×24 的 LLM provider logo、3 个品牌标、1 个 `1028×5250` 描边插画（`0x2677a20`，Twitter 蓝
  `#1D9BF0` 描边的插画拼版，**与文件图标无关**）之外，没有任何彩色文件图标图形。
- 不是 PNG：二进制里 31 处 PNG 签名，逐个解析后只有 `about/hand-*.png`（4 张 799×799）和
  应用图标 `.ico` 内嵌的 7+7 张（16/24/32/48/64/128/256），**没有文件图标图集**。
- 不是 emoji：`Emoji` / `Segoe UI Emoji` 字符串只出现在 GPUI 的字体回退链和 Unicode 属性表里。
- 真正形态：**16×16 RGBA 像素图**，1 位图像素 = 1 逻辑 px，颜色是 Material 调色板
  （python = `#0288D1` Blue 700 + `#FDD835` Yellow 600）。参考帧是 200% 抓帧，所以每位图像素正好
  落在 **2×2 原生块**上；实测 9 个图标**全部 2×2 块内最大通道偏差 = 0** ⇒ 可从参考帧**无损还原**。

已交付：`src/svg/fileIcons.tsx`（8 类，base64 PNG data URL，`image-rendering: pixelated`）。

为什么没有原始资源：应用引用了 `assets/file-icons/index.json`（`cromma-bees.exe` 偏移
`0x2677961`，紧邻 `crates\app\src\app\assets.rs`），但 `file-icons/` 下**只有 index.json 这一个路径**，
且它的 JSON 正文在发行二进制里**不以明文存在**（`"py"` / `"xlsx"` / `FILE_EXT` / `fileExtensions` 等
键全部 0 命中）。⇒ 该图集要么在运行时解包/解码，要么根本没打进这个 build。
**无损还原位图是现有证据下的最高保真方案（逐像素一致，不是近似）。**

---

## 1. 方法：为什么这份清单里的名字可信

Lead 最初把 96 个**无名**的 16×16 资产存成 `analysis/ui-shell/svgs/ui/0NN_<猜测名>.svg`，
并明确说"文件名里的名字是错的，只信序号"。**不要靠形状猜**——我做了内容比对：

1. 二进制里还有一套**带名字**的图标资产：`icons/<name>.svg` 字面量（`assets.rs` 的资产表），
   Lead 已提取成 `analysis/r2-assets/svg/icons/`，共 **291 个权威命名文件**。
2. 把 96 个 `ui/0NN_*.svg` 归一化（去注释、压空白）后做 SHA-256，逐个查这套命名表：
   **96/96 精确命中，0 个失配。**
3. 顺序规律：`ui/000..095` = 命名集按字母序排列（`000`=alert-circle … `095`=zoom-out）。

所以「0NN → 名字」是**逐字节同一文件**，不是猜。生成 `uiIcons.ts` 时我直接从
`analysis/r2-assets/svg/icons/<name>.svg` 取 markup，每个 key 上方注释写明来源文件。

（附带修正：`ui/000` 的猜测名 `brand-cromma` 实际是 `alert-circle`；`ui/001` 猜的
`brand-crommacode` 实际是 `arrow-down`。也就是说 ui 块里**根本没有品牌标**——这也从侧面证实
Q1 的品牌标来自另一个资产块。）

---

## 2. 语义名 → 来源 → 用途 → 把握

「把握」列：**高** = 参考帧里直接看到同形状且尺寸吻合；**中** = 形状吻合但被裁切/极小难辨；
**低** = 推断。

### 2.1 标题栏 TitleBar

| 语义名 | UI_ICON_PATHS key | 来源 | 用途 | 把握 |
|---|---|---|---|---|
| 品牌标志 | `<BrandMark/>`（`brand.tsx`） | `icons/brand-crommacode.svg` | 左上角标志，30×30 盒 / 墨迹 27×30，client (11.7, 5) | 高 |
| 字标 | — **纯文字** | Maple Mono CN 400 15px | `CrommaCode`，墨迹起 client (50.5, 14.5) | 高（0.963） |
| 最小化 | `minimize` | `icons/minus.svg`（横杠） | 右上窗口按钮 | 高 |
| 还原/最大化 | `restore` | `icons/copy.svg`（两个叠放圆角方） | 右上窗口按钮；参考帧窗口是最大化态，按钮是"还原"造型 | 中 |
| （备用）最大化 | `maximize` | `icons/maximize.svg`（对角两个折角，无箭头） | 非最大化态时用 | 中 |
| 关闭 | `close` | `icons/close.svg` | 右上窗口按钮 | 高 |

菜单栏「文件 编辑 搜索 视图 终端 帮助」**没有图标**，纯文字。

### 2.2 导航条 NavBar（tab + 右侧工具）

| 语义名 | 来源 | 用途（参考帧文字） | 把握 |
|---|---|---|---|
| `lock` | `icons/lock.svg` | 「游戏」tab 前的锁 | 高 |
| `gauge` | `icons/gauge.svg` | 「氛围」tab（选中态） | 高 |
| `file-text` | `icons/file-text.svg` | 「文件」tab | 高 |
| `bot` | `icons/bot.svg` | 「蜂群」tab | 高 |
| `clock` | `icons/clock.svg` | 「痕迹」tab | 高 |
| `trophy` | `icons/trophy.svg` | 「排行榜」tab | 高 |
| `terminal` | `icons/terminal.svg` | 右侧「终端 Ctrl+J」胶囊按钮 | 高 |
| `eye` | `icons/eye.svg` | 右侧第 1 个工具按钮 | 高 |
| `git-fork` | `icons/git-fork.svg`（24 viewBox，已 scale 进 16 网格） | 右侧分支图标 | 中（形状=三分叉图，参考帧小） |
| `waveform` | `icons/waveform.svg` | 右侧音频柱状按钮 | 高 |
| `volume` | `icons/volume.svg` | 右侧音量按钮 | 高 |

### 2.3 侧边栏 Sidebar

| 语义名 | 来源 | 用途 | 把握 |
|---|---|---|---|
| `chevron-down` | `icons/chevron-down-sm.svg` | 「项目」「文件」两个分组标题右侧折叠箭头 | 高（UI 块里只有 `-sm` 变体） |
| `folder` | `icons/folder.svg` | 项目行 `test` 前的文件夹 | 高 |
| `plus` | `icons/plus.svg` | 项目行右侧"新建" | 高 |
| `search` | `icons/search.svg` | 「文件」标题右侧搜索 | 高 |
| `chart-bar` | `icons/chart-bar.svg` | 底部「统计」chip | 高 |
| `bulb` | `icons/bulb.svg` | 底部「意见」chip | 高 |
| `settings` | `icons/settings.svg` | 底部「设置」chip | 高 |
| （无图标） | — | 底部「登录」是纯文字按钮 | 高 |
| 文件类型彩色图标 | `fileIcons.tsx` | 文件树每一行 | 见 §3 |
| 蓝色方框字形 | `brands/opencode.svg`（24×24 provider logo） | 项目路径 chip 前；与 Agent 头/输入框里 "OpenCode" 前的字形同形 | 中（形状高置信，**蓝色 tint 来源未验证**） |

### 2.4 Agent 面板 / 卡片 / 输入框

Agent 面板标题栏：`chat`（「Agent」tab）、`terminal`（「终端」tab）、`expand-corners`、`minus`、`close`。
消息头：`clock`、`arrow-up`、`close`。
输入框：`paperclip`（附件）、`at`（@ 提文件）、`chevron-down`（两个下拉：模型、目录）、
`arrow-up`（发送）、`expand-corners`（右上角展开角标）。

| 语义名 | 来源 | 用途 | 把握 |
|---|---|---|---|
| `chat` | `icons/chat.svg` | Agent / 终端 分段控件左项 | 高 |
| `expand-corners` | `icons/maximize.svg` | 卡片右上角「展开」角标（两个对角折角、无箭头，墨迹 22×22 native） | 高 |
| `arrow-down` | `icons/arrow-down.svg` | Token 流速卡片的蓝色 ↓（墨迹 16×22 native） | 高 |
| `cpu` | `icons/cpu.svg` | 「后台进程 / 齿轮」卡片（圆角方框+四边各 2 引脚+中心实心块，墨迹 26×26 native） | 高 |
| `terminal` | `icons/terminal.svg` | 后台进程卡片 disabled 态（圆角方框内 `>` + `—`，墨迹 22×20 native） | 高 |
| `paperclip` / `at` / `send`(→`arrow-up`) / `close` / `minus` | 同名 | 输入框与面板 chrome | 高 |

> 注：`arrow-up` 既是消息头的"上传/发送"，也是输入框圆钮里的发送箭头；参考帧输入框圆钮里是 ↑ 形，
> 不是纸飞机，所以这里用 `arrow-up` 而不是 `send`（`send` 仍保留在表里备用）。

### 2.5 `uiIcons.ts` 其余保留 key

即使当前区域还没用到，表里也保留了复刻时高频会用到的语义 key（全部有真实来源）：
`check` `check-circle` `checklist` `close-circle` `trash` `pencil` `filter` `sliders` `command` `code`
`database` `dollar` `download` `mail` `send` `monitor` `shield-alert` `shield-check` `tag` `images`
`info` `help-circle` `key` `keyboard` `palette` `globe` `map-pin` `map` `calendar` `link` `file`
`file-plus` `users` `user` `user-plus` `briefcase` `compass` `heart` `book-open` `magic-wand` `play`
`stop-circle` `loader` `square-fill` `circle-dashed` `zoom-in` `zoom-out` `eye-off` `volume-off`
`lock-open` `folder-open` `folder-plus` `sign-in` `log-out` `refresh` `copy` `more-horizontal`
`target` `sparkle` `bolt` `chart-bar` `user` `brand-claude`。

完整映射见 `UI_ICON_SOURCE`（`uiIcons.ts` 内导出，`'语义名' → 'icons/<name>.svg'`）。

---

## 3. 彩色文件类型图标（`fileIcons.tsx`）

参考帧侧边栏文件树里出现的 8 种类型，全部还原为 **16×16 RGBA 位图**：

| kind | 扩展名映射 | 像素/颜色 | 图形 |
|---|---|---|---|
| `python` | `.py .pyw .pyi` | 112 不透明像素，2 色 `#0288D1` + `#FDD835` | Python 双蛇标 |
| `json` | `.json .jsonc .json5 .lock` | 40 像素，1 色（橙 `#F5A623` 系） | `{ }` 大括号（缺一边的开口造型） |
| `image` | `.png .jpg .jpeg .gif .webp .bmp .ico .avif` | 119 像素，1 色（青绿） | 图片：山 + 太阳 |
| `svg` | `.svg` | 92 像素，1 色（金 `#FDB515` 系） | 八芒星/星芒 |
| `video` | `.mp4 .mov .mkv .webm .avi .m4v` | 124 像素，1 色（橙 `#F7941D` 系） | 场记板（两行视频条目形状完全一致，已比对） |
| `xlsx` | `.xlsx .xls .csv` | 108 像素，1 色（绿 `#7AC143` 系） | 表格：折角纸 + X |
| `html` | `.html .htm` | 97 像素，1 色（橙红 `#E44D26` 系） | HTML5 盾 + "5" |
| `md` | `.md .markdown .mdx` | 48 像素，1 色（蓝 `#4A9FE0` 系） | Markdown "M↓" |

（颜色为按不透明像素均值四舍五入的近似值；精确值在 data URL 里逐像素原样保留。）

尺寸与用法：

```tsx
import { FileIcon } from '../svg/fileIcons';
<FileIcon name="build_chart_data.py" size={16} />   // 也可 <FileIcon kind="python" />
```

- 图标盒 **16×16 逻辑 px**（参考帧里墨迹最大 14×14，四周各留 1px 透明边 —— 与 16 网格一致）。
- 文件树里图标的墨迹左边界 = client 相对 **x 17.0**，即 16px 盒子的 left = 16。
- 首行墨迹 top：client y **280.0**（原生 573）；行距 ≈**28.5** 逻辑 px（原生 60/52/56/60/56/52/58/62，均值 57）。
- 位图必须 `image-rendering: pixelated`（组件已内联），且**只能整数倍**放大，否则像素网格会糊。

**未找到 / 未覆盖**（`FILE_ICON_MISSING`）：`js/ts`、`css`、`yaml/toml`、`zip/tar/gz`、`pdf`、`sql`、
`sh`、`rs`、`go`、`java`、`xml`、字体、未知类型。参考帧里没有出现，二进制里也没有资源 ⇒ 无法取得。
这些类型请回退到 `uiIcons.ts` 的单色 `file` 图标（`FileIcon` 返回 `null`，由调用方决定）。

---

## 4. 品牌资产（`brand.tsx`）

三个品牌矢量的定位（全部在二进制里，均已提取）：

| 资产 | viewBox | 用途 | 是否交付 |
|---|---|---|---|
| `icons/brand-crommacode.svg` | `0 0 289.57 289.57` | **标题栏标志**（reader + 七道光，无底板） | ✅ `<BrandMark/>` |
| `brand/icon.svg` | `0 0 1024 1024` | 应用图标源（白圆角底板 + 黑 reader），xtask 栅格化 icns/Dock.png/ico/hicolor | ❌ 不需要（OS 层用） |
| `icons/brand-cromma.svg` | `0 0 740.00 521.72` | Cromma 产品标（三点一笔），非 IDE 标 | ❌ 本界面未使用 |

`<BrandMark/>` 细节：8 条 path（1 条 reader + 7 条射线，`fill-opacity` .4/.3/.2/.1/1/.9/.8），
全部 `currentColor`，可染色；默认 `size=30`。

---

## 5. 附带发现：LLM provider 品牌 logo（**未交付**，供 Lead 决定是否要）

二进制里还有 **35 + 11 个 24×24 彩色 provider logo**（`brands/<name>.color.svg` 与 `brands/<name>.svg`），
已全部提取在 `analysis/r2-assets/svg/*__brands_*.color.svg.svg`（含 `<title>` 可判名）：

```
amp-acp antigravity antigravity-acp bun claude claude-acp cline codebuddy codebuddy-code codex
codex-acp copilot cortex-code cursor deepagents deno devin docker gemini git github-copilot-cli
glm-acp-agent go goose grok-build java junie kilo kimi kimi-code kiro magpie minimax-cn
minimax-code mistral-vibe mongodb moonshot-cn mysql nodejs npm opencode opencode-v2 openrouter
pnpm poolside postgres python qoder qwen-cn qwen-code redis ruby rust yarn zai
```

Agent 面板里 `□ OpenCode` 的方框字形 = `brands/opencode.svg`
（`<path d="M16 6H8v12h8V6zm4 16H4V2h16v20z">`，evenodd ⇒ 外框 + 中心方孔，
正好是参考帧里那个"方框套方块"）。它们 **24×24 且带品牌色**，与 16×16 currentColor 的 UI 图标是两套资产，
所以我没塞进 `UI_ICON_PATHS`。需要的话可以再生成一张 `PROVIDER_ICON_PATHS`。

---

## 6. 未解决 / 不确定

1. **窗口"还原"按钮（两个叠放圆角方）**：我判为 `icons/copy.svg`（形状吻合），把握**中**。
   窗口按钮区域我的测量框与相邻按钮重叠（`restore` 量到 30 逻辑 px 宽明显偏大），没有拿到干净的墨迹 bbox。
   如果 Lead 的 TitleBar 区域能给出 3 个按钮各自的精确 bbox，可以钉死 `copy` vs `maximize`。
2. **侧边栏路径 chip 前那个蓝色方框字形**：形状 = `brands/opencode.svg`（高置信），但参考帧里它是**蓝色**的，
   而该 SVG 是 `currentColor`。蓝色究竟是容器给的 `color` 还是另有 `-v2`/彩色变体，我没验证。
3. **导航条最右侧那个被裁切的字形**：`nav_right.png` 最右边被裁到，形状像"框内下划线"，
   无法确认是 `square-fill` / `monitor` / `sidebar`(侧栏折叠) 中的哪一个。
4. **`git-fork` 的网格**：它在二进制里是唯一的 24×24、Lucide 来源、`stroke-width 2.5` 的图标。
   为塞进 16 网格我加了 `<g transform="scale(0.666667)">`（物理线宽 2.5×0.667 = 1.67 ≈ 兄弟图标 1.75）。
   如果参考帧里该图标实际是按 24px 画的（而不是缩到 16），需要改用按 24 渲染。
5. **文件类型图标的原始图集**：`assets/file-icons/index.json` 正文不在发行二进制里（证据见 Q3）。
   若要支持参考帧之外的更多类型，需要另一个 build 或运行时解包，目前无从取得。
6. **chevron 变体**：UI 资产块里只有 `chevron-*-sm`，我据此把语义 `chevron-down/left/right` 映射到 `-sm` 版本。
   若 `Icon.tsx` 合并时优先查 `icons.ts`，会拿到非 `-sm` 版本（形状相同、墨迹宽 ~1px 差）。
   `UI_ICON_OVERRIDES` 已导出需要优先用 UI 表的 6 个 key：
   `chevron-down, chevron-left, chevron-right, chevron-up, dollar, lock-open`。
7. **`dollar`**：UI 块里只有 `dollar-italic`（斜体美元），我映射为 `dollar`。若某处要正体美元需另取 `icons/dollar.svg`。

---

## 7. 定案（第二轮，按参考帧逐像素复核）

> 方法：从 `.tmp/shell/ref.png` 取墨迹 bbox（亮度阈值分离，避开底色），
> 再用自写的 SVG 路径展平器（`.tmp/iconmap/svgmini.py`）算出**每个候选资产在自身 viewBox 里的精确墨迹
> 外框**（含 stroke/2 外扩），用「比例不变」的墨迹宽高比 + 反解盒尺寸（width/height 两路必须自洽）来定案。
> 注：Chromium 在本会话被沙箱拦住（mojo 命名管道 `拒绝访问`），无法截图，因此没有走渲染比对。

### 7.1 导航条最右侧「两侧内凹的矩形」= `icons/ticket.svg` ✅ 资产里有，不用手绘

这是 **Lucide `ticket`（24×24，`stroke-width 2.5`）**：`M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0…`
—— 左右两边各一个半圆凹口 + 中间虚线撕口，正是参考帧里那个"两侧内凹、中间一小竖"的图形。

| 量 | 值 |
|---|---|
| 资产 | `icons/ticket.svg`（仅在 291 命名集里，**不在** `icons.ts`/我第一版 `uiIcons.ts` 里，因为它不是 16 grid） |
| viewBox | `0 0 24 24` |
| viewBox 内墨迹 | **22.50 × 16.50**（aspect 1.364） |
| 参考帧墨迹 | native 30×22 = **15.0×11.0 逻辑 px**（aspect 1.364 —— 完全一致） |
| 反解盒尺寸 | 宽路 **16.00** / 高路 **16.00** ⇒ **16×16 盒**，两路自洽度 1.00 |

⇒ 已加进 `uiIcons.ts`：`'ticket'`（用 `<g transform="scale(0.666667)">` 从 24 网格压进 16 网格，
物理线宽 2.5×0.667 = 1.67 ≈ 兄弟图标的 1.75）。用法 `<Icon name="ticket" size={16} />`。

### 7.2 窗口最大化/还原按钮 = `copy`（**不是** `maximize`）✅ 定案

三个窗口按钮的实测墨迹（native / 逻辑）：

| 按钮 | native bbox | 逻辑墨迹 | 定案 |
|---|---|---|---|
| 最小化 | x 2702..2723, y 51..53 | **10.5 × 1.0** | **不是 `minus`**（见下） |
| 还原/最大化 | x 2774..2795, y 43..63 | **10.5 × 10.0** | **`copy`**（两个叠放圆角方，外轮廓并集） |
| 关闭 | x 2846..2867, y 43..63 | **10.5 × 10.0** | **`close`**（IoU 0.750，无争议） |

- **`maximize` 排除**：`icons/maximize.svg` 是"两个对角折角、中间空"，渲染出来是两个分离的 L，
  绝不可能产生"完整闭合的前方 + 右上方露出另一个方"的效果；参考帧 10× 放大图里明确是**两个叠放圆角方**。
- **`copy` 命中**：`icons/copy.svg` 的墨迹 13.75×13.75（aspect 1.00）、墙厚约 1.25 viewBox 单位；
  放进 **12.2 px** 盒 ⇒ 墨迹 10.5×10.0、墙厚 ≈0.95 逻辑 px（≈2 native，与实测一致）。两路反解自洽。
- ⚠️ **但三个按钮的盒尺寸互相矛盾**（copy≈12.2 / close≈18.1 / minus≈14.9），且最小化横线的
  实测厚度是 **1.0 逻辑 px**，而 `minus` 在同宽下必然是 **1.6 逻辑 px**。
  ⇒ 结论：**标题栏三个窗口按钮大概率是应用自己画的 1px 描边原语，不是图标资产**。
  建议：这三处直接用 SVG 原语手绘（尺寸照上表），比硬套图标更准；若要矢量，`copy` 是最接近的资产
  （12.2 px 盒），`close` 用 18.1 px 盒、`minus` 用 14.9 px 盒会让描边偏粗 60%。

### 7.3 侧边栏路径 chip 前的方框字形：**不是 opencode，且没有蓝色** ⚠️ 未定案

逐像素量出来两件事：

1. **颜色是 `#1A150F`（近黑），不是蓝色。** 该字形 256 个不透明像素**全部**是 `#1A150F`，
   其余是抗锯齿灰（`#A9A6A2` 等）；整片区域**没有任何蓝色像素**。
   （我上一轮说"蓝色 tint 来源未验证"是错的 —— 那是对 `sidebar_top.png` 缩略图的主观误读，此处更正。）
2. **形状是"竖长厚壁圆角矩形框"**，实测 native **18×24** = **9×12 逻辑 px**，壁厚 5 native（2.5 逻辑），
   中间镂空 8×14 native。字形不该是 `brands/opencode.svg`：它是 **20×20 正方形**（aspect 1.00），
   镂空/外框 = 0.60 双向；而实测 aspect **0.75**、镂空/外框 = 0.44(横)×0.58(竖) —— 对不上。

在 291 个资产里做全量 IoU 排名，最接近的是 `smartphone`（0.673）、`alert-square-fill`(0.660)、
`sidebar`(0.633)；但 `smartphone`(aspect 0.69)、`tablet`(0.86) 的比例都对不上，壁厚也差一倍。
⇒ **判定：这个字形在已提取的资产里没有对应项（要么是另一个 build 的资源，要么是运行时画的）。**
建议按实测手绘：9×12 圆角框、壁厚 2.5、圆角 ~2、颜色 `#1A150F`。

### 7.4 `git-fork` 的 24→16 缩放假设：**盒尺寸是对的，但字形与参考帧不符** ⚠️

导航条第 2 个图标（在 "眼睛" 与 "音频柱" 之间）实测：

| 量 | 值 |
|---|---|
| 参考帧墨迹 | native 21×27 = **10.5×13.5 逻辑 px**，aspect **0.78**，色 `#8E867B` |
| 拓扑（16× 放大逐像素读） | 3 个圆环：左上、右上、左下；**左侧一竖杆**把左上环与左下环连起来；**右上环甩一条曲线**下行并入竖杆 |
| `icons/git-fork.svg` | viewBox 24、stroke 2.5、墨迹 **20.50×20.50**（aspect **1.00**） |

- 比例反解：若按 `git-fork` 渲染，墨迹是**正方形**，无论盒多大都不可能得到 0.78 的竖长墨迹 ⇒
  **参考帧里这个图标不是 `icons/git-fork.svg`**（`git-fork` 的拓扑是"2 上 + 1 下方居中 + 一条 U 形横杆"，
  与实测"1 条左侧竖杆 + 右下并入"也不同）。
- 我此前在 `uiIcons.ts` 里给它加的 `<g transform="scale(0.666667)">` 让**盒**变成 16 px
  （若真用它，墨迹会是 13.7 逻辑 px 的正方形，比参考帧**宽 30%**）。**结论：缩放假设在"盒"上成立，
  在"字形"上不成立。** 建议：`git-fork` 按 16 px 用可以（形状语义对），但要接受它会比参考帧宽；
  若要像素级一致，这个字形也得手绘（10.5×13.5，1.75 描边，3 个 r≈2.4 的圆环）。

### 7.5 本轮对 `uiIcons.ts` 的改动

- **新增 `'ticket'`**（§7.1 定案所需，此前两张表都没有）。
- 其余 key 未动；`npx tsc --noEmit` 通过。

---

## 8. 手绘字形（§7.3/§7.4 的资产缺口）+ 文字墨量补偿

### 8.1 新增 5 个手绘 key（都已在 `uiIcons.ts`，**未覆盖任何现有 key**）

全部 16×16 网格、`fill="none"` + `stroke="currentColor"`，**1 网格单位 = 1 逻辑 px**
（在 2× 抓帧里 = 2 native px）。因此调用方请用 **`size={16}`**；其它 size 会等比缩放
（墨迹 = ×size/16，描边也会等比变粗）。

| key | 墨迹 (CSS px) | 构造 | 用在哪 |
|---|---|---|---|
| `win-minus` | **10.5 × 1.0** | 一条 `M2.75 8h10.5`，`stroke-width 1`、**butt cap**（参考帧端点就是平的） | 标题栏最小化 |
| `win-max` | **10.5 × 10.0** | 前圆角方 `x3.75 y6 w6 h6 rx.75`（stroke 2）+ 后方的 **C 形可见轮廓**（上边 + 左边上半 + 右边 + 底边右半），偏移 (2.5, −2)，壁厚 2 | 标题栏最大化/还原 |
| `win-close` | **10.5 × 10.0** | 两条对角线，`stroke-width 2`、round cap | 标题栏关闭 |
| `glyph-frame` | **9 × 12** | `rect x4.75 y3.25 w6.5 h9.5 rx2`，`stroke-width 2.5` | 侧边栏路径 chip 前的方块字形 |
| `glyph-fork` | **10.5 × 13.5** | 3 个圆环 `r 1.125`（中心 4.75/3.25、11.25/3.25、4.75/12.75）+ 左竖杆 + 右上环甩向左下的贝塞尔，`stroke-width 1.75` | 导航条第 2 个分支图标 |

几何全部用 SVG 路径展平器**校验过**（墨迹 bbox 与参考帧实测误差 ≤0.2px，中心严格在 (8,8)）：

```
win-minus    ink 10.50x 1.00  center (8.00,8.00)  OK
win-max      ink 10.50x10.00  center (8.00,8.00)  OK
win-close    ink 10.50x10.00  center (8.00,8.00)  OK
glyph-frame  ink  9.00x12.00  center (8.00,8.00)  OK
glyph-fork   ink 10.50x13.50  center (8.00,8.00)  OK
```

两处与 Lead 最初描述不同的**实测修正**（以参考帧为准）：

1. `win-max` 的**壁厚是 2 逻辑 px，不是 0.95**。0.95 是我上一轮从 `copy.svg` 内部结构反推的；
   但参考帧 ASCII 逐像素读出来左壁是 4 native = **2 逻辑 px**，且前方块是**不透明遮挡**后方块
   （后方的线在洞内不可见）。手绘版用「C 形可见轮廓」实现这种遮挡，**不依赖背景色**，任何底色都正确。
2. `glyph-fork` 的**圆环是 r≈1.125、描边 1.75**（不是我上轮说的 r≈2.4）。r=2.4 是把外径 4 CSS
   当成了路径半径；实际外径 4 = 2r + stroke ⇒ r = (4−1.75)/2 = 1.125。环心的实测间距：横向
   6.5、纵向 9.5 逻辑 px。

### 8.2 参考帧文字比 FreeType/Chromium 渲染重 **15–22%** —— 结论与推荐值

**方法**：从 `ref.png` 取真实文字 run 的墨迹覆盖率积分（`coverage = (bg_lum − lum)/(bg_lum − core_lum)`），
与同字体同字号（15px → 30px em）的 FreeType 栅格做墨量比；再把栅格按「−webkit-text-stroke 的
外扩半径 r_native = w_css」做圆盘膨胀（8× 超采样 + 二值 + 下采样），求解达到参考墨量所需的 w。
（chromium 在本会话被沙箱拦住不能截图，所以用 FreeType 做基线；Lead 独立测到的 0.75–0.87
与我的 0.82–0.85 同区间，互为交叉验证。）

**实测三例（Maple Mono CN 400 / 15px）**：

| run | 参考墨量 | 我的栅格 | 比值 | 需要加 |
|---|---|---|---|---|
| `CrommaCode`（标题栏） | 1377 | 1177 | **0.854** | +17% |
| `build_chart_data.py`（文件树） | 2307 | 1924 | **0.834** | +20% |
| `数据统计-20260813.xlsx`（CJK+数字） | 3320 | 2715 | **0.818** | +22% |

**需要的 `-webkit-text-stroke` 宽度（CSS px）**——按字号/字体列出（目标 = 追平参考墨量）：

| 字体 | 15px | 14px | 13px | 12px |
|---|---|---|---|---|
| Maple Mono CN 400（正文/文件名/标题） | **0.30** | 0.28 | 0.27 | 0.25 |
| Cromma Sans 400（中文正文） | **0.24** | 0.23 | 0.22 | 0.21 |

（表内为「+20% 墨量」的解；要 +25% 再加约 0.05px。斜率约 0.8–1.5 倍墨量/px，字号越小斜率越大。）

### 8.3 最终建议（结论性）

1. **主用 `-webkit-text-stroke`，并且不要用 0.1px。**
   0.1px 只补约 **+8%**，而缺口是 **+17~22%** ⇒ 现在的 `0.1px` 是**补不够**，不是过头。
   推荐：**Maple Mono CN 的文本统一 `-webkit-text-stroke: 0.3px currentColor`**；
   **Cromma Sans 的中文统一 `0.22px`**。若必须全站一个值，用 **`0.25px`**
   （Maple Mono 仍会偏轻约 4%，可只在 title/sidebar 的等宽文本上提到 0.3px）。
2. **不要用 `font-weight: 600` 换墨量。**
   SemiBold 实测墨量 = Regular 的 **+20~23%**，数值上刚好，但它是**另一套字形轮廓**
   （竖干更粗、字面形状变了）。而 Maple Mono CN **400 已经把参考帧的墨迹外框 1:1 复现**
   （`CrommaCode` 实测 176×22，渲染也是 176×22）⇒ 参考帧用的就是 400，
   缺口完全来自**栅格化粗细（stem darkening）**，所以只能在栅格层加粗（stroke），不能换字重。
   `700` 更不行（+32~36%）。
3. **不要用 `text-shadow: 0 0 0.2px`。**
   阴影是同形状的**半透明**光晕，它抬高「总量」但**降低边缘对比度**（边缘变灰而不是变黑），
   与参考帧「同一轮廓、边缘更实」的特征相反；而且它会被 `overflow`/合成层影响，不可控。
   `-webkit-text-stroke` 同色时是**纯外扩**（把边缘压黑），正是参考帧的样子。
4. **实现细节**：`-webkit-text-stroke-width` 不参与布局，不会引起重排；但会让墨迹外框各边
   长大 w/2（0.3px 时 +0.15px/边，2× 下 0.3 native px），定位仍沿用原 left/top 即可。
   显式写上 `-webkit-text-stroke-color: currentColor`（避免某些浏览器默认值差异）。
   SVG 图标不受影响。
