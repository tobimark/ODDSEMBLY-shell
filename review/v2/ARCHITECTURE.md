# 架构 — Loom 交付版

> 目标：保留 TypeScript / React / PixiJS 与 Astra Loom 的视觉与机械品质，把“事件队列、状态、动画时钟、音频、回放、模式切换”整理为可复用引擎骨架；Loom 是当前唯一交付的视觉模式。

## 1. 目录

```
src/engine/
  core/
    types.ts       ToolEvent / ToolName / ModeId / EngineStatus / ModeHud 等共享词汇
    bus.ts         EventBus：React HUD 与测试的唯一状态源
    engine.ts      VisualEngine：Pixi 应用、设计空间、事件队列、模拟器、回放、
                   音频图、遥测、模式切换与过渡
    mode.ts        VisualMode 接口 + ModeContext/ModeRuntime + 模式注册表
    replay.ts      ReplayPlayer：按“回放毫秒”推进，暂停/倍速/手动步进一致
    simulator.ts   AgentSimulator：无外部事件时的确定性演示源
    audio.ts       AudioEngine：主输出、录音流、whir 总线、合成原语、beat 账本
    spring.ts      Spring / tween / easings / mulberry32 / hashString
    drawing.ts     程序化绘制工具库（纸面、线、齿轮、管线、表盘、卡片、芯片、工具符号…）
    design.ts      1472×1008 设计空间
  modes/
    loom/          Loom 模式（Astra 机构与美术原样保留，仅改挂载接口）
  gallery/         归档的 Chips / Westworld 原型（不参与构建）
  theme.ts         KunlunMeta 品牌色板
  index.ts         对外 API
```

React 只读 `EventBus` 的状态（`EngineStatus`），画布动画不依赖 React。模式自己拥有 `root: Container`，Pixi 世界由引擎统一缩放居中。

## 2. 数据流

```
                   ┌──────────── 真实 Agent bridge (WebSocket / inject) ────────────┐
                   │                                                                │
AgentSimulator ──► VisualEngine.receive(ToolEvent) ──► LoomMode.trigger()           │
  (可选)                 │                                │                        │
                         ├─► EventBus.emitEvent()          ├─ mechanism.queue      │
                         │      │                          └─ audio.markBeat()      │
                         │      └─► React HUD（~10Hz 轮询 hud()）                     │
ReplayPlayer ──► 同一 receive() 通道（12 事件 → 12 次织入）◄──────────────────────────┘
```

- 事件是唯一输入：模式不得自己读时钟/随机数来伪造事件；所有运动由 `dt` 与事件序列决定。
- 手动输入：底部 1–5 按钮、`Engine.trigger(type)`、`window.__engine.inject(...)`。
- 真实 Agent 事件：`?feed=ws://host:port` 时引擎连接 WebSocket，接受 `{type|tool, detail, id}` JSON 帧注入。

## 3. 确定性回放（对旧版像素不确定问题的修复）

旧版回放由 `requestAnimationFrame` + `performance.now()` 驱动，两次回放截图哈希不同（语义确定、像素不确定）。

新版：

- `?deterministic=1`（或 `?static=1`）时停止 rAF ticker，引擎时钟只由 `window.__engine.tick(dt)` 推进；模式内部禁止 `performance.now()` / `Date.now()` / 未播种随机数。
- 回放事件按回放时间轴释放：`ReplayPlayer.advance(dtMs)`，暂停不注入、倍速缩放偏移、stop 取消。
- 因此相同 `dt` 序列 + 相同事件流 ⇒ 相同姿态/像素；QA 用两个独立浏览器会话截图 SHA-256 验证。

## 4. 音频

`AudioEngine` 持有 master / 录音目的地 / whir 振荡器；Loom 的 kit 只在打纬提交织行时发声并 `audio.markBeat(eventId, 'loom-beat')` 记账，排队事件不发声。12 事件回放 = 12 声，eventId 顺序 1..12。

录音流：`canvas.captureStream(30)` + `MediaRecorder(vp9,opus)`，音频轨取自 `engine.audio.recordingStream`，录像中的声音是真实同步音轨。

## 5. 模式接口

- `VisualMode`：`meta / root / mount / enter / exit / update / trigger / setState? / hud / telemetry / reset / sample / destroy`。
- 引擎懒加载模式、切走不销毁（状态累积），切换时 0.42s 交叉淡入（reduced-motion 瞬切）。
- 当前注册表只有 `loom`；React 头部显示单展签而非模式标签页。新增模式只需实现接口并在 `core/mode.ts` 注册，同时恢复头部标签。
- 归档的 Chips / Westworld 原型在 `src/engine/gallery/`（构建与 tsc 排除），恢复步骤见该目录 README。

## 6. Loom 回归证明（像素级）

`scripts/parity-loom.mjs`：用 `.tmp/dist-baseline`（重构前构建）与重构后构建各自运行
`?static=1` + 12 个事件 + 固定步进，在 idle / shed / pick / beat / takeup / mid / after 七个时刻截图。

结果见 `review/v2/parity/parity-report.json`：**7/7 张 PNG SHA-256 完全一致，picks 12=12，无异常**（重构未改变 Astra 的任何像素）。

## 7. 验证命令

```bash
npm test                      # 织造时序 + 连杆长度约束
npm run build                 # 生产构建 → dist/
node scripts/parity-loom.mjs  # 重构前 vs 重构后 Loom 像素回归
node scripts/verify-v2.mjs    # 浏览器验收（默认 loom）
node scripts/replay-proof.mjs # 确定性回放双次截图哈希
node scripts/record-v2.mjs    # 录屏（webm+mp4，真实音轨）
npm run dev                   # 本地交互
```

## 8. 约束与边界

- 引擎不含业务语义（不知道“经线”“打纬”），Loom 的全部机构在模式内部。
- 共享绘图库只提供材料/几何原语，不预设构图。
- 设计空间固定 1472×1008，响应式只缩放；真机 DPR 最多 2×。
- 回放确定性依赖调用方提供固定 `dt`；实时模式仍由 rAF 驱动。
- 归档模式（Chips/Westworld）不属于交付质量承诺，仅作为探索记录。
