# Loom layout v5 — 机械连接与构图整改

以 layout v4 为基础，只做机械关系补全和比例微调；视觉减法、固定读数器、12 槽转盘、
事件聚合、织机/飞轮/齿轮组全部保留。

## 六项任务的落点

1. **信号导管**：`(209,248)` → `(245,521)`，沿固定外圈走 8 个折点，3 个固定夹，
   不穿过转子卡窗（路径 x≥178，卡窗区域 x<132）。
2. **上方安装轨改传动轴**：原 y≈530 的 rail 替换为 `bearing → coupling → bearing → frame`
   的输出轴，带 U 形护罩；屏幕 y≈582、x≈400–484；只保留下方结构轨。
3. **张力测量管**：仪表右缘 → Loom 左机架，屏幕 x≈381–484、y≈431，一个夹块。
4. **Loom 1.06×**：左框 484；帧右缘 1423；730 宽下右侧余量约 24 CSS px；下方内容
   到 y≈517，548 高 GameView 底部余量约 31 CSS px。
5. **底部间距**：24–32 CSS px，不再为了消灭留白继续放大 Loom。
6. **验收**：`full-1x/2x`、`gameview-730`、`connection/shaft/gauge/conduit-2x`、
   `read-bash-edit-v5.mp4`、`telemetry.json`、`verification.md`。

## 文件

| 文件 | 内容 |
|---|---|
| `full-1x.png` / `full-2x.png` | 1472×1008 全场景 |
| `gameview-730.png` | 730×548 真实运行截图（非合成） |
| `connection-2x.png` | 转盘→齿轮箱→Loom 连接区 |
| `conduit-2x.png` | 信号导管与固定夹 |
| `shaft-2x.png` | 传动轴、联轴器、输出轴承 |
| `gauge-2x.png` | 张力表测量管 |
| `read-bash-edit-v5.mp4` | 30fps / 10s，Read→Bash×2→Edit→Write→Search |
| `readout-bash-x2.png` | 730 截屏中的 BASH S02 ×2 读数器 |
| `contact-sheet.jpg` | 录屏关键帧 |
| `telemetry.json` | 每个关键帧的 dial 遥测 |
| `verification.md` | 静态/动态验收记录 |

## 构图

- 设计 1472×1008；GameView 730×548 时按 contain 显示（0.496，上下各 24px）。
- 转盘 `0.83×`：x 0–470、y 0–520；读数器 210×94 → 约 87×40 CSS。
- 齿轮+驱动箱：x≈243–400；Loom 左框 484；间隙约 84 设计 px。
- Loom 1.06×：左框 484、右缘 1423（730 中约 706，右侧余 24）。
- 底部内容到 517，画面底 548，余 31。
