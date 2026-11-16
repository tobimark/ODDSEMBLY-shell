# Phase 2 — 多模式视觉引擎架构

> 目标：保留 TypeScript / React / PixiJS 技术栈与 Astra Loom 视觉品质，把“公共事件队列、状态、动画时钟、音频、回放、模式切换”整理为可复用引擎，Loom 降为其中一个独立视觉模式。

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
    drawing.ts     程序化绘制工具库（纸面、卡片、印章、管线、表盘、芯片、工具符号…）
    design.ts      1472×1008 设计空间
  modes/
    loom/          Loom 模式（Astra 机构与美术原样保留，仅改挂载接口）
    chips/         Chips 模式（Stage 3）
    westworld/     Westworld 模式（Stage 4）
  theme.ts         KunlunMeta 品牌色板（纸/藏青/青/黄铜/鼠尾草/玫瑰）
  index.ts         对外 API
```

React 只读 `EventBus` 的状态（`EngineStatus`），画布动画不依赖 React。每个模式自己拥有 `root: Container`，Pixi 世界由引擎统一缩放居中。

## 2. 数据流

```
                   ┌──────────── 真实 Agent bridge (WebSocket / inject) ────────────┐
                   │                                                                │
AgentSimulator ──► VisualEngine.receive(ToolEvent) ──► 当前 VisualMode.trigger()   │
  (可选)                 │                                │                        │
                         ├─► EventBus.emitEvent()          ├─ 模式内部队列/状态机     │
                         │      │                          └─ 音频 kit（causal beat） │
                         │      └─► React HUD（~10Hz 轮询 hud()）                     │
ReplayPlayer ──► 同一 receive() 通道（12 事件 → 各模式自己的 12 次因果动作）◄─────────┘
```

- **同一事件流驱动所有模式**：`public/replay/agent-session.json` 的 12 个工具事件同时供 Loom / Chips / Westworld 的 `?replay=1` 使用（`<mode>-session.json` 内容相同、元数据不同）。
- **事件是唯一输入**：模式不得自己读时间/随机数来伪造事件；所有运动由 `dt` 与事件序列决定。
- **手动输入**：底部 1–5 按钮、`Engine.trigger(type)`、`window.__engine.inject({id,type,detail,at})`。
- **真实 Agent 事件**：`?feed=ws://host:port` 时引擎连接 WebSocket，接受 `{type|tool, detail, id}` JSON 帧注入；`window.__engine.inject()` 可供 CLI/扩展调用。

## 3. 确定性回放（对旧版像素不确定问题的修复）

旧版回放由 `requestAnimationFrame` + `performance.now()` 驱动，两次回放截图哈希不同（语义确定、像素不确定）。

新版：

- `?deterministic=1`（或 `?static=1`）时停止 rAF ticker，引擎时钟只由 `window.__engine.tick(dt)` 推进；模式内部禁止 `performance.now()` / `Date.now()` / 未播种随机数。
- 回放事件按**回放时间轴**释放：`ReplayPlayer.advance(dtMs)`，暂停不注入、倍速缩放偏移、stop 取消。
- 因此相同 `dt` 序列 + 相同事件流 ⇒ 相同姿态/像素。QA 用两个独立浏览器会话截图 SHA-256 对比验证。

## 4. 音频

`AudioEngine` 持有 master / 录音目的地 / whir 振荡器；每个模式有自己的 kit（`modes/*/audio.ts`），只在**因果时刻**发声并调用 `audio.markBeat(eventId, kind)` 记账：

- Loom：打纬提交织行时 1 次 beat（12 事件 = 12 声，排队不发声）。
- Chips：发牌落桌 / 结算票据打印 / 铃。
- Westworld：阀门击发 / 释放 / 汽笛。

录音流与旧版一致：`canvas.captureStream(30)` + `MediaRecorder(vp9,opus)`，音频轨取自 `engine.audio.recordingStream`，因此录像中的声音是真实同步音轨。

## 5. 模式切换

- `VisualEngine.setMode(id)` 懒加载 + 常驻实例：切走不销毁、不回退状态，切回继承累积（Westworld 的压力/Chipts 的分数）。
- 过渡：0.42s 交叉淡入（reduced-motion 下瞬时）；渲染层保持同一 Pixi Application，所以没有重建闪光。
- UI：顶部 01/02/03 目录式模式栏、`[`/`]` 快捷键、`?mode=` 深链；左上角品牌、右上遥测、底部 transport/tool 均与模式解耦。
- 新模式接入只需实现 `VisualMode` 并在 `core/mode.ts` 注册一个 factory。

## 6. Loom 回归证明（像素级）

`scripts/parity-loom.mjs`：用 `.tmp/dist-baseline`（重构前构建）与 `dist`（重构后构建）各自运行
`?static=1` + 12 个事件 + 固定步进，在 idle / shed / pick / beat / takeup / mid / after 七个时刻截图。

结果见 `review/v2/parity/parity-report.json`：**7/7 张 PNG SHA-256 完全一致，picks 12=12，无异常**（重构未改变 Astra 的任何像素）。
对照图：`review/v2/parity/baseline-*.png` 与 `v2-*.png`。

## 7. 开发/验证命令

```bash
npm run build                 # tsc -b + vite build → dist/
npm test                      # 织造时序 + 连杆长度约束
node scripts/parity-loom.mjs  # 重构前 vs 重构后 Loom 像素回归
node scripts/shot-mode.mjs --mode=chips --root=.tmp/dist-chips --query="?mode=chips&static=1&ui=0" --name=idle --events=12 --ticks=240
npm run dev                   # 本地交互：http://127.0.0.1:5173/?mode=westworld
```

后续 QA 脚本 (`verify-v2.mjs` / `record-v2.mjs` / `test-modes.mjs`) 由 `qa-evidence` 落地后在同一架构上运行。

## 8. 约束与边界

- 引擎不含任何业务语义（不知道“牌”“压力”），模式之间不互相 import。
- 共享绘图库只提供材料/几何原语，不预设某个模式的构图。
- 设计空间固定 1472×1008，响应式只缩放；真机 DPR 最多 2×。
- 回放确定性依赖调用方提供固定 `dt`；实时模式仍由 rAF 驱动。
