# V6 验收数据

## 静态

| 项 | 数值 |
|---|---|
| Loom scale | 1.03 |
| Loom MOUNT | x=125, y=36 |
| Loom 左框 / 帧右缘 | 468 / 1381 |
| 最外伺服右缘 | ≈1421 |
| 730 显示右余量 | 帧 ≈45 CSS，最外伺服 ≈25 CSS |
| 内容底 / 底部余量 | ≈517 / ≈31 CSS |
| 读数窗 | 245×100 → 约 101×41 CSS |
| TYPE / ×N / step | 20.2 / 12.4 / 10.7 CSS px |
| 齿轮箱与 Loom 间隙 | ≈36 CSS |
| 导管 | (209,248)→(235,533)，5 点，2 夹 |
| 传动轴 | y≈582，x≈387–468 |
| 张力管 | y≈430，x≈368–468 |

## 动态（telemetry.json）

| 帧 | 状态 |
|---|---|
| 6 | Read，slot 1，S01，×1 |
| 45 | Bash，moving slot 2，target 60° |
| 85 | Bash ×2，holding slot 2，count 2 |
| 125 | Edit，moving slot 3，target 90° |
| 175 | Read，slot 4 |
| 225 | Search，slot 5 |
| 265 | Edit，slot 6 |

- 300 帧，30fps，10s；真实 canvas 逐帧 `tick(1/30)`。
- 读数窗在裁切边框上逐帧无位移（背景转动导致的亮度差除外）。
- `npm test` 11 条通过；`tsc`/build 通过。

## 已知边界

- 右侧余量约 25 CSS px，正好落在要求的 20–25 上；它包住全部伺服外伸件，不裁切。
- 读数窗是盘面固定叠层，不是独立控制台；不显示文件路径/detail/age。
- 上层经线被有意压到 0.58 alpha；织物纹样本身未改。
- `Sxx/12` 的 12 语义仍为推断。
