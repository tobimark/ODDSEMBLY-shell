# kunlun-shell — 像素级复刻 CrommaCode 界面（中间画布除外）

本项目把 **CrommaCode 0.3.11（Rust + GPUI 原生桌面应用）** 的窗口界面，按**像素级**
复刻成 Web（React + TS + CSS）。**中间的游戏画布（GameView / Loom 场景）不在范围内**——
那里保留空面板，后续与 `../kunlun-loom` 合并时再填入。

> 合并约定：本项目完全独立，不 import `../kunlun-loom` 的任何东西。合并时由 Lead 处理。

---

## 0. 参考帧（唯一事实来源）

| 文件 | 说明 |
|---|---|
| `../.tmp/shell/ref.png` | **原生参考帧**，2906×1730 px，来自 200% DPI 的 PrintWindow 抓帧 |
| `../analysis/ui-overview/CrommaCode-主界面-原始截图.png` | 同一张图（仓库内正式副本） |
| `../analysis/r2-assets/fonts/*.ttf` | 应用内嵌的**真实字体**（已拷进 `public/fonts/`） |
| `../analysis/ui-shell/svgs/icons__*.svg` | 从二进制里抠出的**真实图标**（189 个，`icons/<name>.svg`） |

**关键坐标换算**：参考帧是 2 倍图，所以

```
CSS 逻辑像素 = 原生像素 / 2
```

窗口客户区（client）在参考帧里的左上角是原生 `(13, 13)`。因此

```
client 相对坐标 = (原生坐标 - 13) / 2
```

组件的根 div 用 `position: absolute` 放在 `.client`（1440×852）里，
`left/top/width/height` 一律用**上面这个 client 相对逻辑坐标**。

---

## 1. 已测定的框架几何（client 相对，逻辑 px）

| 区块 | left | top | width | height | 备注 |
|---|---|---|---|---|---|
| client | 0 | 0 | 1440 | 852 | 背景 `#f6f1ea`（奶白 chrome） |
| 标题栏 TitleBar | 0 | 0 | 1440 | 48 | 底边 1px `#eae8e4`（含在 48 内） |
| 侧边栏 Sidebar | 0 | 49 | 265 | 802.5 | 右边 1px `#eae8e4`；背景 `#f6f1ea` |
| 主区 Main（surface） | 265 | 49 | 1166 | 794.5 | 背景 `#fcfaf6`，含导航条 + 两块面板 |
| 导航条 NavBar | 265 | 49 | 1166 | 51 | 透明（落在 surface 上） |
| 画布卡片 CanvasWell | 265 | 100 | 730.5 | 743 | 边框 1px `#dcdad5`，圆角 ~12 |
| Agent 面板 | 1008 | 100 | 411.5 | 743 | 边框 1px `#dcdad5`，圆角 ~12 |
| 右侧 chrome 槽 | 1431 | 49 | 9 | 794.5 | `#f6f1ea` + 左侧 1px 边框 |

底部 `y=843..851.5` 也是 `#f6f1ea` 的 chrome。

## 2. 颜色（从参考帧直接采样）

| 名称 | 值 | 用在哪 |
|---|---|---|
| chrome | `#f6f1ea` | 标题栏、侧边栏、右侧槽、底部 |
| chromeBorder | `#eae8e4` | chrome 与 surface 之间的 1px 分隔线 |
| surface | `#fcfaf6` | 导航条 / 主区背景 |
| panel | `#fefcf9` | Agent 面板主体 |
| cardBorder | `#dcdad5` | 画布卡片 / Agent 面板 1px 边框 |
| chip | `#f2ece3` | 侧边栏底部 统计/意见/设置 按钮底色 |
| canvasWell | `#f9f6f1` | 空画布底（视觉占位） |

文字颜色、次要色等请在你负责的区域内用 `tools/probe.py` 采样后写进自己的区域文档。

## 3. 字体（**必须使用真实字体**）

字体已拷到 `public/fonts/`，`src/styles.css` 里已注册，且 **body 默认字体 = `Maple Mono CN`**：

| CSS family | 文件 | 用途 |
|---|---|---|
| `Maple Mono CN` 400 / 600 / 700 | MapleMonoCN-Regular / SemiBold / Bold | **界面默认字体**（含中文全角）；等宽 |
| `Cromma Sans` 400 / 500 | CrommaSans-Regular / Medium | 仅大字号显示文本（如字标、标题） |

**已实测结论（用 `tools/fontmatch.py`，score 高且 ink 尺寸完全吻合）**：

| 文本 | 字体 | 字号 | 颜色 |
|---|---|---|---|
| 标题栏菜单「文件/编辑/搜索/视图/终端/帮助」 | Maple Mono CN 400 | **13px** | `#1a150f` |
| 侧边栏分区标签「项目」「文件」 | Maple Mono CN 400 | **13px** | `#8e867b` |
| 文件名（build_chart_data.py …） | Maple Mono CN 400 | **15px** | 待各区域实测 |
| 模式条 Westworld / Loom / … | Maple Mono CN 400 | **15px** | 待实测 |
| 侧边栏项目名「test」 | Maple Mono CN 400 | **15px** | 待实测 |
| 导航条项目名「test」 | Maple Mono CN 400 | **14px** | 待实测 |
| 标题栏字标「CrommaCode」 | **不是文字**（是矢量字标 SVG，icon-mapper 在确认） | — | — |

用工具**实测**你区域里每一段文字，不要猜：

```bash
python tools/fontmatch.py --box X0,Y0,X1,Y1 --text "文字内容"
```

输出里的 `css=` 就是该用的 `font-size`；`ref ink starts at native (x,y)` 是字形墨迹左上角
（`client 相对 = (原生 - 13) / 2`），用它定位元素。

> 经验：`--box` 要给足余量，否则字形被裁会让实测高度偏小、字号偏小。
> 汉字字号 ≈ 墨迹高度 / 0.86；等宽字号 ≈ 墨迹宽度 / (字符数 × 0.6)。

## 4. 图标

全部图标都是应用的**真实矢量资产**，已生成模块：

```tsx
import { Icon } from '../svg/Icon';
<Icon name="chevron-down" size={16} />   // 16 = 逻辑 px，与原生 16x16 网格 1:1
```

可用名字见 `src/svg/icons.ts` 的 `IconName` 联合类型（189 个）。
图标默认 `fill="currentColor"`，用外层 `color` 控制颜色。
如需查某个名字的原始 SVG：`../analysis/ui-shell/svgs/icons__<name>.svg`。

## 5. 测量工具

```bash
# 找一行/一列元素的位置（最常用）
python tools/probe.py rows 44 540 520 1100        # 原生坐标 X0 Y0 X1 Y1
python tools/probe.py cols 30 565 520 610
# 单个元素的墨迹包围盒 + 主色
python tools/probe.py bbox 88 570 430 610
# 采样具体像素颜色
python tools/probe.py colors 700,700 2100,900
# 某一行/列的颜色分段（找边框、底色分界）
python tools/probe.py rle --row 1600
python tools/probe.py rle --col 1500
```

## 6. 验证循环（Lead 执行，队友可请求）

```bash
node tools/shoot.mjs                 # 1453x865 @2x 截图 -> shots/shell.png
python tools/diff.py --save          # 分区打分 -> shots/diff/{heat,overlay,side-by-side}.png
```

分区打分里 `CENTER_out_of_scope` 是中间画布，**不参与评分**。
`CHROME SCORE` 越低越好，0 = 完全一致。

> 截图需要在放行完整权限的终端里跑（Chromium 子进程）。队友**不要**自己跑
> `shoot.mjs`，把要验证的区域告诉 Lead，Lead 跑完把分数/叠加图发给你。

## 7. 交付要求

- 每个区域一个文件，`src/regions/<Name>.tsx`，**只改自己的文件**（避免冲突）。
- 组件内用内联 style（几何精确优先），可读性第二；复杂区域可加同名 `.css`。
- 每完成一个区域，写 `docs/region-<name>.md`：元素清单、实测坐标、字体/字号/颜色、
  以及"未做到/不确定"的点。**诚实标注**，不要写"已完成"了事。
- 禁止修改 `src/App.tsx`、`src/geometry.ts`、`src/styles.css`、`tools/*`、`src/svg/icons.ts`
  （这些是共享文件，由 Lead 维护）。需要改动请告诉 Lead。
