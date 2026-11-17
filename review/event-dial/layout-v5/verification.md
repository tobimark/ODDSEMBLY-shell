# layout v5 验收记录

## 静态装配

| 检查 | 结果 |
|---|---|
| 信号导管起点 | `(209,248)`，读头外壳/读数器悬架之间 |
| 信号导管终点 | `(245,521)`，齿轮箱固定板顶面 |
| 导管路径 | x 178–245；位于转子卡窗外侧（卡窗相关区域 x<132），不压活动卡窗 |
| 固定夹 | 3 个，沿静止外圈布置；无长电线 |
| 传动轴 | 屏幕 y≈582、x≈400–484；含齿轮箱侧轴承、柔性联轴器、输出轴承与 U 形护罩 |
| 结构轨 | 只保留下方一根（y≈795）；未新增第三条大连接 |
| 张力测量管 | x≈381–484、y≈431；从仪表右缘进 Loom 左机架，带一个夹块，无悬空 |
| Loom 缩放 | 1.06；左框 484；帧右缘 1423；在 730 宽中右余量 ≈24.2 CSS px |
| 底部间距 | 场景内容底 ≈517；548 高 GameView 底部余量 ≈31 CSS px |
| 层级 | sheet → dial body → chassis → Loom world → conduit → dial front/readout；导管在 Loom 之上但在读数器之下 |

## 动态

| 检查 | 结果 |
|---|---|
| READ | frame 6：slot 1，angle 0，S01 / ×1 |
| BASH | frame 45：moving 到 slot 2，target 60° |
| BASH ×2 | frame 85：holding slot 2，angle 60，count 2（不推轮） |
| EDIT | frame 125：moving 到 slot 3，target 90° |
| 读数器 | 位置固定；逐帧边框 max channel diff = 21/255（JPEG 压缩级） |
| 驱动同步 | 飞轮 `m.angle`、gearA `3m.angle`、gearB `-4.5m.angle`；轴/联轴器静态装配 |
| 转盘步进 | 30°/格；Bash ×N 不推进；Read→Bash→Edit 对应 slot 1→2→3 |
| 模型测试 | `npm test` 11 条通过 |

## 已知边界

- 730 宽、548 高时引擎按 contain 缩放（0.496，上下各 24px letterbox）；Loom 帧右缘
  1423 → 706，距 730 右缘 24px；最外侧 servo 小支架仍可能贴到画布边。
- 信号导管为静态管线，不参与动画；它跨在转盘容器与 Loom 容器之间，层级为 Loom 之上、
  读数器之下。
- 录屏是真实 canvas 的逐帧 `tick(1/30)` 截屏，不是后期合成。
