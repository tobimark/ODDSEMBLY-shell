# Loom 场景构图与 CrommaCode 壳尺寸（layout6）

目标：**齿轮机械 / Loom 主体 / 转盘** 三块互不遮挡；齿轮与它背后的驱动箱作为一体左移，
与 Loom 留出可读间隙；场景在 GameView 里不再出现大片底部空白。

## 1. 壳的尺寸事实

| 项 | CSS px |
|---|---|
| 壳 stage | 1453×865 |
| CanvasWell | 730.5×743 |
| GameView 可见画布（到 HUD 上沿） | **730×548** |
| 模式栏 | 730×30，覆盖画布顶部 |
| HUD / 四卡 | 从 stage y≈668 起，覆盖画布下缘 |

场景按 **fit-width** 渲染：`730 / 1472 = 0.496`，设计 1472×1008 显示为 **730×500**，
顶部贴模式栏（stage y≈140），底部到 stage y≈640；HUD 上沿 668，留 28px。
不再使用 730×495 的 letterbox，也不把 Loom 推到右侧面板下面。

## 2. 三分区（设计 px）

| 区域 | bbox | 缩放 | 说明 |
|---|---|---|---|
| DIAL 转盘 | x 0–470, y 0–520 | 0.83 | 可见弧带；读数器悬在蓝弧上 |
| GEAR + DRIVE BOX | x 182–407, y 377–940 | 1.0（随 Loom 1.1 世界） | 飞轮、两级齿轮、张力表、驱动箱、电机整体左移 |
| LOOM 主体 | x 484–1459, y 140–992 | 1.1 | 左框固定在 484；右缘 1459，留 13px |
| READOUT | 显示 x 20–195, y 75–155 | 0.83 | 210×94 局部；TYPE 44 / 第二行 22 |

关键间距：

- **齿轮箱 → Loom 左框：77px**（显示约 38px）；两个 outboard 安装 rail 跨过间隙，
  齿轮/箱子不再贴住 Loom。
- DIAL → LOOM：顶部约 84px，中段更大；不重叠。
- LOOM 右缘 1459，画布 1472，留 **13px**；在 730 宽显示里右缘到 GameView 边约 6px，
  不会藏到 Agent 面板后面（servo 标签仍可能被裁，属于画布边缘）。
- 场景底部内容到 992，HUD 上沿 668（显示），留 28px；旧版约 100px 的空带消失。

## 3. 读数器字号预算

| 行 | 设计字号 | 显示字号 |
|---|---|---|
| TYPE（READ/BASH/…） | 44 | **18.1px** |
| ×N | 22 | **9.1px** |
| Sxx / 12 | 22 | **9.1px** |

场景状态文字的设计字号 ≥20px；Loom 上 7–13px 的铭牌只作纹理。

## 4. 后续改动规则

1. Loom 左框固定在 x=484；齿轮箱右缘不得超过 407（间隙 ≥77）。
2. Loom 右缘不得超过 1460；若壳给画布再留内边距，先降 Loom 到 1.08，再降到 1.05。
3. 转盘缩放上限 0.85；外环在 Loom 顶边 y=140 处必须 < x=484。
4. 顶部 0–60px 是模式栏覆盖区；读数器顶边保持 ≥65px。
5. 不把 Loom 再向右移过 1460；否则会进入 Agent 面板下方。
6. 不新增控制台/灯带/粒子；新增信息放壳的 Agent/Tool Stream。

## 5. 验证资产

- `review/event-dial/layout-v4/full-1x.png` / `full-2x.png`
- `review/event-dial/layout-v4/proportions.png`
- `review/event-dial/layout-v4/shell-context.png`
- `review/event-dial/layout-v4/gear-2x.png`
- `review/event-dial/recording/dial-readout-fixed.mp4`
