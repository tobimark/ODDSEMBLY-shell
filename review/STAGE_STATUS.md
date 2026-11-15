# KunlunMeta Agent Visual Engine — Review

## 阶段完成情况

| 阶段 | 状态 | 说明 |
|---|---|---|
| 1. Loom 高保真静态 | ⚠️ 部分完成 | 构图/比例/机械结构/106 经线/品牌色已完成；与参考相比仍偏"工程制图"，纸面柔光与线条层次不足 |
| 2. Loom 完整动态 | ✅ 完成（Loom） | 弹簧物理、飞轮-齿轮-凸轮-综框-钢筘-梭子传动链、布面累积、仪表/计数/速率/账本、WebAudio；idle/single/burst/dense/stop/resume 均已跑通 |
| 3. 统一事件与视觉引擎 | ⚠️ 部分完成 | 事件源/事件队列/调度/状态机/场景/音效已解耦；提供确定性 replay JSON 与 `?replay=1`；尚未抽象出多模式 `VisualMode` 注册表 |
| 4. Chips | ⏸ 未开始 | 为保证 Loom 质量，未开工 |
| 5. Westworld | ⏸ 未开始 | 同上 |
| 6. 整体质量提升 | ⏸ 部分 | 仅完成 Loom 的构图/面板/清理；高 DPI/性能/跨模式一致性未做 |

## 真实运行证据

- `review/screenshots/loom-hero.png`：运行中（含 HUD）
- `review/screenshots/loom-hero-art.png`：纯画布
- `review/screenshots/loom-idle.png`：idle
- `review/screenshots/loom-replay.png`：确定性 replay 12 事件后
- `review/screenshots/loom-vs-reference.png`：与 CrommaCode Loom 参考裁切并排
- `review/recordings/loom-recording.gif`：40 帧动画录屏（实际 Edge 无头渲染逐帧截图）
- `review/replays/loom-session.json`：可复放会话

## 复放入口

- 浏览器：`http://127.0.0.1:5173/?noauto=1&replay=1`（确定性 12 事件）
- 截图：`node scripts/capture.mjs replay`
- 手动事件：控制台按钮 / 键盘 1–5 / `window.__loom.trigger('Edit')`

## 已知视觉问题（对照参考）

1. 参考织物占比更大、线条更轻、纸面更柔；本版机架偏重、织物偏密。
2. 缺少参考那种"整张纸的柔光/环境光遮蔽"；目前为程序化噪点 + 径向渐变。
3. 经线色彩仍偏"彩色铅笔"但均匀；参考有更明显的分组/染色变化。
4. 综框/提综线/卷布辊的装配关系仍是示意级，未做运动学求解。
5. 面板局部仍有文字与图形轻微重叠（已多轮修复，仍需像素级校对）。

## 已知技术问题

- 构建在部分 Windows 环境需把 `TEMP` 指到项目目录（esbuild 临时文件权限）。
- 音频需用户手势后启动；headless 截图不验证声音。
- 未做 FPS/内存基准（仅确认 40 帧抓取与回放稳定）；未做移动端触控。
- 无真实 Agent bridge；事件源为模拟器 + replay JSON。

## 下一步建议

1. 用 Canvas2D 绘制织物以外的柔和背景/阴影层，提升纸面质感。
2. 将 Loom 重构为 `VisualMode` 接口 + `ModeRegistry`，再实现 Chips/Westworld。
3. 加入 `requestAnimationFrame` 时间基准的确定性录像与 FPS 统计面板。
4. 对参考做逐区域 diff（构图/线宽/色彩/密度）并记录每轮改进。
