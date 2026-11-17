# Loom 场景 · layout v4

针对上一版两个问题：
1. 底部空白过大 → 场景按 fit-width 放入 730×548 的 GameView 可见区，顶部贴模式栏，
   底部到 stage y≈640，距 HUD 28px；不再用 730×495 的 letterbox。
2. 齿轮和 Loom 太近 → **齿轮、飞轮、张力表、驱动箱、电机整体左移 60px**，
   驱动箱右缘 407，与 Loom 左框 484 留 **77px**；两根 outboard rail 跨过间隙。

## 关键尺寸（设计 px）

| 区域 | bbox | 缩放 | 备注 |
|---|---|---|---|
| DIAL | 0–470 × 0–520 | 0.83 | 可见弧带 + 读数器 |
| GEAR + DRIVE BOX | 182–407 × 377–940 | 随 Loom 1.1 | 整体左移；不再贴 Loom |
| LOOM | 484–1459 × 140–992 | 1.1 | 左框 484；右缘 1459（画布 1472） |
| READOUT | 显示 20–195 × 75–155 | 0.83 | 210×94；TYPE 44 / 第二行 22 |

显示映射：`730/1472 = 0.496`，设计 1472×1008 → 730×500；GameView 可见高 548，
场景上贴模式栏（stage y=140），底部 640，HUD 上沿 668，留 28px。

## 本次改动

- `MOUNT = {x:117.7, y:-3, scale:1.1}`：Loom 放大到 1.1，右缘 1459，仍完整在画布内。
- 驱动箱（原 `loomPlate` 左侧 cassette + 张力表 + worm/motor）坐标整体 -60，
  与齿轮/飞轮/皮带对齐；更新 `needle` 到新表心 (186,392)，删除悬空的 sensor cable。
- 齿轮/飞轮/皮带 -60；新增两根 outboard mounting rails，跨过 77px 间隙。
- 共享床身随 Loom 新落脚点到 `(480,921,990,30)`；draw call 与螺栓同步。
- 读数器仍 210×94，未再改字号。

## 文件

| 文件 | 内容 |
|---|---|
| `full-1x.png` / `full-2x.png` | 最终全场景 |
| `proportions.png` | 三分区 bbox、77px 间隙、显示映射 |
| `shell-context.png` | 按 730×500 fit-width 放入 1453×865 壳的示意 |
| `gear-2x.png` | 齿轮/驱动箱/间隙 2× |
| `dial-2x.png` / `readout-2x.png` | 转盘与读数器 2× |
| `comparison-before-after.png` | 上一版 → 本版 |
| `contact-sheet.jpg` / `readout-fixed-strip.png` | 录屏证据 |
| `../../recording/dial-readout-fixed.mp4` | 30fps / 11s 录屏 |

## 已知边界

- Loom 右缘 1459/1472，显示到 GameView 右缘只剩约 6px；servo 文字仍可能被裁。
  如果壳再给画布内边距，先降 Loom 到 1.08，再降 1.05（规则见 `docs/LAYOUT.md`）。
- `shell-context.png` 是合成示意，不是 `kunlun-shell` 运行时接入。
- HUD 卡片覆盖画布下缘；场景内容在 y≈640 结束，不会被 HUD 遮住。
