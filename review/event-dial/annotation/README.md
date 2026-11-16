# 事件转盘标注图（给外部评审用）

> ⚠️ 本目录的 `annotated-*.png` 对应 **22:00 之前**的“底部远程读数器”布局，已被
> **盘面安装版**取代。新版静帧/放大/录屏见 `../recording/static-full-2x.png`、
> `../11-dial-detail-2x.png`、`../recording/dial-readout-fixed.mp4`；
> 本目录保留用于对照上一轮评审。

本目录把 `../04-hold-s01.png`（READ ×1 / S01/12 / ring 30°）拆成可评审的区域标注。
实现与回滚见 [docs/EVENT_DIAL.md](../../../docs/EVENT_DIAL.md)、[docs/ROLLBACK.md](../../../docs/ROLLBACK.md)。
直接发给 ChatGPT 的说明稿：[review-brief.md](review-brief.md)。

## 文件

| 文件 | 用途 |
|---|---|
| `annotated-overview.png` | 2× 全场景 + 右侧 1–12 区域图例；主交付 |
| `04-hold-s01.annotated.png` | 与原截图同尺寸（1472×1008）的编号版；编号对照 `regions.md` |
| `annotated-dial.png` | 转盘细部 D1–D13：定子/转子/读头/导管/夹块 |
| `annotated-console.png` | C1–C5：固定读数器、控制箱、队列牌、短连线 |
| `annotated-readout.png` | R1–R11：面板内部排版（TYPE/×N/Sxx/12/detail/age…） |
| `regions.md` / `regions.json` | 区域清单；bbox 均为 1472×1008 设计像素 |
| `base-telemetry.json` | 本帧遥测（phase/angle/slot/count/queue） |

## 复现

```bash
npm run build
node scripts/shot-dial-annotate.mjs          # 生成 base-2x.png（2944×2016）
python scripts/annotate_event_dial.py        # 生成全部标注图（需要 Pillow + 中文字体）
```

说明：

- 标注脚本使用系统字体 `C:/Windows/Fonts/msyh*.ttc`（Microsoft YaHei）。
- `base-2x.png` 是中间采集，体积大且可重建，未纳入 git；其余标注图已提交。
- 坐标直接使用设计像素：1× 截图 = 1472×1008，2× 采集 = 2944×2016。
- 若要给 ChatGPT 复用：优先附 `annotated-overview.png` + `annotated-dial.png` +
  `annotated-readout.png` + `review-brief.md`；其余作为补充。
