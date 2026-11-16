# KunlunMeta Agent Visual Engine

程序化绘制的 AI Agent 视觉世界：同一条真实工具调用事件流，可以被织成布、发成牌、充进压力机器。
技术栈：TypeScript + React + PixiJS v8。所有画面均由代码绘制（Canvas 2D 程序化材质 + Pixi 合成），不使用截图或外部素材。

**当前模式**

| # | 模式 | 一句话 | 状态 |
|---|---|---|---|
| 01 | **Loom** | 每一次工具调用织入一道纬线（112 经线 / 16 组纱色 / 三组固定杆长伺服） | Asta 基线的机械与视觉全保留，像素级回归通过 |
| 02 | **Chips** | 每一次工具调用发一张牌，五张成手、倍率结算 | 开发中（Stage 3） |
| 03 | **Westworld** | 每一次调用给压力装置充能，表盘/管线/罐体/阀门联动 | 开发中（Stage 4） |

> 交付状态、逐模式视觉评估、已知问题以 [`review/v2/REVIEW.md`](review/v2/REVIEW.md) 为准；本 README 只描述如何使用。

## 快速开始

需要 Node.js 22+。

```bash
npm install
npm run dev            # http://127.0.0.1:5173/  默认进入 Loom
```

生产构建与预览：

```bash
npm run build          # tsc -b + vite build → dist/
npm run preview        # http://127.0.0.1:4173/
```

直接进入某个世界：

- `http://127.0.0.1:5173/?mode=loom`
- `http://127.0.0.1:5173/?mode=chips`
- `http://127.0.0.1:5173/?mode=westworld`

## 操作

- 顶部 `01 LOOM / 02 CHIPS / 03 WESTWORLD` 点击切换世界（快捷键 `[` / `]`），切换不销毁状态，切回来会继承累积。
- 底部工具按钮或数字键 `1–5` 注入 Read / Edit / Write / Bash / Search。
- `Space` 播放/暂停；`M` 静音；`Play / Pause / Resume / Stop`、0.5× / 1× / 2× 倍速；`Detail` 放大画布。
- 每个世界有自己的因果音效（Loom 在打纬提交织行时发声，排队不发声）。

URL 参数：

| 参数 | 作用 |
|---|---|
| `?mode=loom\|chips\|westworld` | 直接进入模式 |
| `?noauto=1` | 不自动开始模拟器（等待外部事件/手动注入） |
| `?static=1` | 停住 rAF 时钟，首帧后仅由 `__engine.tick()` 推进（截图/测试） |
| `?deterministic=1` | 同上，但保留完整引擎（用于确定性回放证明） |
| `?replay=1` | 加载 `public/replay/<mode>-session.json` 的 12 事件会话 |
| `?session=replay/xxx.json` | 指定回放文件 |
| `?ui=0` | 隐藏 React HUD，只留画布 |
| `?motion=off` | 降低动效（模式切换瞬切） |
| `?feed=ws://127.0.0.1:8765` | 连接真实 Agent 事件桥（见下） |

## 同一个事件流，三种视觉世界

所有模式消费同一个 `ToolEvent`：`{ id, type: 'Read'|'Edit'|'Write'|'Bash'|'Search', detail, at }`。
事件来源有三种，可随时切换而无需改模式代码：

1. **内置模拟器**（默认）：空闲 / 单发 / 连续爆发 / 思考停顿，用于演示。
2. **确定性回放**：`?replay=1` 注入仓库内 12 事件真实会话，逐事件可复现。
3. **真实 Agent 桥**：

   ```bash
   npm run bridge -- --port=8765 --demo      # 无外部 Agent 时循环演示 12 事件
   npm run bridge -- --tail=C:\path\to\trace.jsonl
   # 或 HTTP 注入：
   curl -X POST http://127.0.0.1:8765/event -d "{\"type\":\"Bash\",\"detail\":\"npm test\"}"
   ```

   然后打开 `http://127.0.0.1:5173/?mode=chips&feed=ws://127.0.0.1:8765`。
   `--tail` 支持 Claude Code / Codex hook 风格的 JSONL（`tool_name` / `tool_input` 会被归一化为五类工具）。桥只监听 loopback，无鉴权，仅用于本地开发。

浏览器控制台 / 外部脚本也可直接驱动：

```js
window.__engine.inject({ id: 101, type: 'Write', detail: 'src/replay.ts · +64 lines' });
window.__engine.trigger('Bash');
window.__engine.setMode('westworld');
window.__engine.tick(1 / 60);         // 手动推进一帧（deterministic/static 模式）
window.__engine.getStatus();
window.__engine.getTelemetry();        // 三模式状态快照
```

## 架构

```
src/engine/
  core/      VisualEngine·EventBus·ReplayPlayer·AudioEngine·AgentSimulator
             Spring/Tween·程序化绘制工具库·模式注册表
  modes/
    loom/        Astra Loom（机构 + 织物 + 音频，几何原样）
    chips/       AI 工具调用卡牌世界
    westworld/   压力工厂装置
  theme.ts     KunlunMeta 品牌色板
```

- React 只读 `EventBus` 状态；画布动画不依赖 React。
- Loom 只是其中一个 `VisualMode`；新模式实现 `src/engine/core/mode.ts` 的接口并在注册表登记即可。
- 同一事件在 Loom 是一次织入、在 Chips 是一张牌、在 Westworld 是一次充能——模式之间不共享视觉实现，只共享事件、时钟、音频与回放骨架。
- 设计空间固定 1472×1008，按窗口等比缩放。

详见 [`review/v2/ARCHITECTURE.md`](review/v2/ARCHITECTURE.md)。

## 验证与证据

```bash
npm test                        # Loom 织造时序 + 连杆固定杆长（12,003 姿态）
npm run build                   # 生产构建
node scripts/parity-loom.mjs    # 重构前 vs 重构后 Loom 像素回归（7/7 相同）
```

完整证据（截图 / 录屏 / 确定性回放 SHA-256 / 浏览器测试报告）见 `review/v2/`：

- `review/v2/verification.json` — 三模式浏览器验证与音频账本
- `review/v2/replay/` — 确定性回放双次截图与哈希
- `review/v2/<mode>/live.webm` / `.mp4` — 真实 Canvas + WebAudio 录屏
- `review/v2/REVIEW.md` — 逐模式完成度与已知问题（诚实评估）
- `review/takeover/TAKEOVER.md` — 对 Astra Loom review-v2 交接包的接管复核记录
- `review/mechanics-v2/` — Astra 原始评审证据（历史基线）

## 基线与回退

| 标签 | 内容 |
|---|---|
| `review-v2-baseline` (`3a778b9`) | Astra Loom 评审修正版交接基线（112 经线、16 纱色、固定杆长伺服、打纬声同步） |
| `visual/atelier-loom` | Astra 视觉首版 |
| `master` | 最初版 Loom 01 |

全量 Git bundle 备份：`../backup/kunlun-loom-pre-v2.bundle`。回退到交接基线：

```bash
git checkout review-v2-baseline
```

## 已知限制

- 所有机构是平面/伪 3D 程序化艺术，不做动力学、碰撞或制造校核；连杆只保证几何杆长与位置解算。
- 真实 Agent 桥为本地开发工具（loopback、无鉴权），不是生产级事件服务。
- WebAudio 需要用户手势才能启动；headless 自动化会加 `--autoplay-policy=no-user-gesture-required`。
- 逐模式完成度、未达标项与后续整改计划见 `review/v2/REVIEW.md`。
