# Loom 事件转盘 — 本轮证据

动态转轮 + 盘面悬架读数器（视觉减法版），实现说明见 [docs/EVENT_DIAL.md](../../docs/EVENT_DIAL.md)，回滚见 [docs/ROLLBACK.md](../../docs/ROLLBACK.md)。

## 确定性状态截图（1472×1008，`?mode=loom&static=1&ui=0`，手动 tick）

| 文件 | 状态 |
|---|---|
| `01-idle.png` | 无事件：读数面板空态，转轮 0° |
| `02-arming.png` | 事件后 50 ms：显示延迟内，转轮仍未动 |
| `03-moving.png` | 步进中：转轮角度严格在 30° × 槽位之间 |
| `04-hold-s01.png` | 落位 `READ ×1 / S01/12`，30° |
| `05-merge-x2.png` | 同工具聚合 `×2`，槽位/角度不变 |
| `06-hold-s02-bash.png` | 新工具 `BASH ×1 / S02/12`，60°，实测 Bash 色 |
| `07-idle-expired.png` | 停留到期：读数清空、转轮停在 60° |
| `08-burst-moving.png` / `09-burst-settled.png` | 12 连发：连续步进 / 结算于整圈 |
| `10-detail-2x.png` | 2× 全画面 |
| `11-dial-detail-2x.png` | 2× 转轮 + 悬架读数器 + 固定读头 |
| `12-readout-detail-2x.png` | 2× 悬架读数面板（TYPE / ×N / Sxx） |
| `verification.json` | 11 条断言、逐状态遥测、0 浏览器错误 |

`motion/contact-sheet.png`：一次 180 ms 索引步进的 6 帧拼图（2×，帧文件可由
`npm run shot:dial-motion` 重新生成，已 gitignore）。

## 评审标注

给 ChatGPT / 设计评审的区域标注与说明稿：[annotation/README.md](annotation/README.md)，
可直接粘贴的评审请求：[annotation/review-brief.md](annotation/review-brief.md)。



## 视觉减法前后对比（2026-11-17）

| 文件 | 内容 |
|---|---|
| `visual-subtraction/before-full.png` | 旧版全场景：Loom 0.92× + 控制箱 + 床身读数器 + 长线缆 |
| `visual-subtraction/after-full.png` | 新版全场景：Loom 1.0× 主体 + 删控制箱/队列/长线 + 盘面悬架读数器 |
| `visual-subtraction/comparison-before-after.png` | 左右等比例前后对比 |
| `visual-subtraction/comparison-dial-before-after.png` | 盘面/读数器细节前后对比 |
| `visual-subtraction/after-dial-2x.png` / `after-readout-2x.png` | 新版盘面与读数器 2× |


## 三分区构图（layout v3，2026-11-17）

按 CrommaCode 壳的真实 GameView `730×495` 重新分配内部比例：Loom `1.0×` 右移，
转盘 `0.83×` 留在左上，齿轮组在左下，三者不重叠。完整比例与字号预算见
[layout-v3/README.md](layout-v3/README.md) 和 [docs/LAYOUT.md](../../docs/LAYOUT.md)。

| 文件 | 内容 |
|---|---|
| `layout-v3/full-1x.png` | 最终全场景 |
| `layout-v3/proportions.png` | 三分区 bbox / 间距 / 显示尺寸标注 |
| `layout-v3/shell-context.png` | 场景合入 1453×865 壳的示意 |
| `layout-v3/readout-2x.png` | 读数器 2×（210×94，TYPE 44 / 第二行 22） |
| `layout-v3/comparison-before-after.png` | 上一版 → 本版 |

## 动态录屏（读数器固定）

| 文件 | 内容 |
|---|---|
| `recording/dial-readout-fixed.mp4` | 30 fps / 11 s / 330 帧真实画布录屏：READ → BASH 步进 → BASH ×N（不推轮）→ EDIT/WRITE/SEARCH → 12 组整圈 → READ；读数器位置全程不动 |
| `recording/static-full-2x.png` | 录屏末态的全场景 2× 静帧 |
| `recording/static-dial-2x.png` | 录屏末态的盘面 2× 放大 |
| `recording/contact-sheet.jpg` | 7 个关键时刻拼图 |
| `recording/recording-telemetry.json` | 末态遥测（angleDeg / slot / ordinal / count） |

重建：`npm run record:dial`（需要 bundled ffmpeg 或 `FFMPEG` 环境变量）。
逐帧 jpg 在 `recording/frames/`，可重建且未入库。

## 复现

```bash
npm run build
npm run review:dial
npm run shot:dial-motion
```

断言覆盖：idle 空态、105 ms 延时、中间角、`S01/12`、同工具 `×2` 不转轮、`S02/12` 与
Bash 色、停留过期、12 组整圈、reset、reduced-motion、0 浏览器错误。
