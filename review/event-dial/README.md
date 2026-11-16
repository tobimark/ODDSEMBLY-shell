# Loom 事件转盘 — 本轮证据

动态转轮 + 固定读数器，实现说明见 [docs/EVENT_DIAL.md](../../docs/EVENT_DIAL.md)，回滚见 [docs/ROLLBACK.md](../../docs/ROLLBACK.md)。

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
| `11-dial-detail-2x.png` | 2× 转轮 + 固定读头 |
| `12-readout-detail-2x.png` | 2× 固定读数面板 |
| `verification.json` | 11 条断言、逐状态遥测、0 浏览器错误 |

`motion/contact-sheet.png`：一次 180 ms 索引步进的 6 帧拼图（2×，帧文件可由
`npm run shot:dial-motion` 重新生成，已 gitignore）。

## 评审标注

给 ChatGPT / 设计评审的区域标注与说明稿：[annotation/README.md](annotation/README.md)，
可直接粘贴的评审请求：[annotation/review-brief.md](annotation/review-brief.md)。

## 复现

```bash
npm run build
npm run review:dial
npm run shot:dial-motion
```

断言覆盖：idle 空态、105 ms 延时、中间角、`S01/12`、同工具 `×2` 不转轮、`S02/12` 与
Bash 色、停留过期、12 组整圈、reset、reduced-motion、0 浏览器错误。
