# KunlunMeta Agent Visual Engine — Loom

程序化绘制的 AI Agent 视觉世界：每一次真实的工具调用，都在织机上织入一道纬线。
技术栈：TypeScript + React + PixiJS v8。全部画面由代码程序化绘制（Canvas 2D 材质 + Pixi 合成），不使用截图或外部素材。

**唯一交付场景：Loom / 织机**。112 根经线、16 组纱色、右侧三组曲柄滑块伺服（曲柄 25、连杆 75 固定杆长，圆交点求解），
一个 ToolEvent = 一次投梭 = 一次打纬 = 一道纬线。可复用的多模式引擎骨架（事件总线、确定性回放、音频、弹簧动画、程序化绘图库）保留在 `src/engine/core/`，为后续场景预留接口；Chips / Westworld 原型已归档，不在交付内（见文末）。

## 快速开始

本轮视觉版本：**Precision Flat Mechanical**。事件刻度机构与 Loom 共用浅色薄壳、细线轴承、固定安装鞍座和贯通底座。
查看 [视觉规范](docs/PRECISION_FLAT_MECHANICAL.md) 与 [本轮交付、截图和回归结果](review/precision-flat/DELIVERY.md)。
原 DSH 对照点保留在 `feat/loom-event-dial` / `c6d93db`。

## 事件转盘（动态 · 视觉减法版）

Loom 左侧的大型事件刻度机构是「**12 槽索引鼓 + 固定读数器**」：

- 新工具事件 → **105 ms** 显示延迟 → **180 ms** 索引步进（30°/格）→ 读数停留 ≈2 s 后回到 IDLE；
- 同工具调用就地合并为 `×N`（不转轮）；`Sxx/12` 为当前槽位/12 槽；
- 读数窗是 **245×100 的固定矩形窗**，直接坐在盘面静止结构上，只显示工具 / ×N / Sxx/12；没有 rotation、没有悬挂夹具；
- 工具色：Read `#789ED0`、Bash `#77BA89`、Edit `#C686C0`、Write `#D5A868`、Search `#5AB2B6`；
- 遥测：`window.__engine.getModeTelemetry().dial`；细节与证据见 [docs/EVENT_DIAL.md](docs/EVENT_DIAL.md)；
- 回滚：`?motion=off` 关闭步进动效；完整回滚见 [docs/ROLLBACK.md](docs/ROLLBACK.md)（基线 tag `pre-dynamic-dial`）。

```bash
npm run review:dial       # 11 个确定性状态断言 + 截图（review/event-dial/）
npm run shot:dial-motion  # 180 ms 步进逐帧 contact sheet
npm run record:dial       # 30 fps 11 s 录屏（读数器固定、转轮索引/回绕）
```

需要 Node.js 22+。

```bash
npm install
npm run dev            # http://127.0.0.1:5173/
```

生产构建与预览：

```bash
npm run build          # tsc -b + vite build → dist/
npm run preview        # http://127.0.0.1:4173/
```

## 操作

- `Play / Pause / Resume / Stop` 控制织机；`0.5× / 1× / 2×` 速度；`Sound on/off` 静音；`Detail` 放大。
- 底部工具按钮或数字键 `1–5` 注入 Read / Edit / Write / Bash / Search（等价于一次真实 Agent 工具调用）。
- `Space` 播放/暂停，`M` 静音。
- 打纬声只在打纬提交织行时响一次；排队中的事件不发声。12 个回放事件 = 12 次织入 = 12 声。

URL 参数：

| 参数 | 作用 |
|---|---|
| `?noauto=1` | 不自动开始模拟器（等待外部事件/手动注入） |
| `?static=1` | 停住 rAF 时钟，首帧后仅由 `__engine.tick()` 推进（截图/测试） |
| `?deterministic=1` | 同上，但保留完整引擎（确定性回放证明） |
| `?replay=1` | 加载 `public/replay/loom-session.json` 的 12 事件会话 |
| `?session=replay/xxx.json` | 指定回放文件 |
| `?ui=0` | 隐藏 React HUD，只留画布 |
| `?motion=off` | 降低动效 |
| `?feed=ws://127.0.0.1:8765` | 连接真实 Agent 事件桥 |

## 事件从哪来

所有视觉反应消费同一个 `ToolEvent`：`{ id, type: 'Read'|'Edit'|'Write'|'Bash'|'Search', detail, at }`。三种来源可随时切换：

1. **内置模拟器**（默认）：空闲 / 单发 / 连续爆发 / 思考停顿，用于演示。
2. **确定性回放**：`?replay=1` 注入仓库内 12 事件真实会话，逐事件可复现。
3. **真实 Agent 桥**：

   ```bash
   npm run bridge -- --demo                    # 无外部 Agent 时循环演示 12 事件
   npm run bridge -- --tail=C:\path\trace.jsonl  # 跟随 Claude Code / Codex 风格 JSONL
   curl -X POST http://127.0.0.1:8765/event -d "{\"type\":\"Bash\",\"detail\":\"npm test\"}"
   ```

   打开 `http://127.0.0.1:5173/?feed=ws://127.0.0.1:8765`。桥只监听 loopback，无鉴权，仅用于本地开发。

浏览器控制台 / 外部脚本也可直接驱动：

```js
window.__engine.inject({ id: 101, type: 'Write', detail: 'README.md · +96 lines' });
window.__engine.trigger('Bash');
window.__engine.tick(1 / 60);      // deterministic/static 模式下手动推进
window.__engine.getStatus();
window.__engine.getTelemetry();    // 织机遥测快照
```

## 架构

```
src/engine/
  core/      VisualEngine · EventBus · ReplayPlayer · AudioEngine · AgentSimulator
             Spring/Tween · 程序化绘图库 · 模式注册表 · 设计空间
  modes/loom/ Precision Flat Loom（保留机构约束、织物与音频；统一装配和绘制）
  gallery/    归档的 Chips / Westworld 原型（不参与构建，可恢复）
  theme.ts    KunlunMeta 品牌色板
```

- React 只读 `EventBus` 状态；画布动画不依赖 React。
- Loom 是一个独立 `VisualMode`：`mount/update/trigger/hud/telemetry/reset/destroy`，引擎只认识接口。
- 设计空间固定 1472×1008，按窗口等比缩放；响应式只缩放不重排。
- 确定性回放：`?deterministic=1` 时引擎时钟只由 `tick(dt)` 推进，模式内无 `performance.now()`/未播种随机数，相同 dt 序列 + 相同事件流 ⇒ 相同像素。
- 详见 [`review/v2/ARCHITECTURE.md`](review/v2/ARCHITECTURE.md)。

## 验证

```bash
npm test                        # 织造时序 + 连杆固定杆长（12,003 姿态）
npm run build                   # 生产构建
node scripts/parity-loom.mjs    # 重构前 vs 重构后 Loom 像素回归（7/7 相同）
node scripts/verify-v2.mjs      # 浏览器验收（默认 loom）
node scripts/replay-proof.mjs   # 确定性回放双次截图 SHA-256
node scripts/record-v2.mjs      # 真实 Canvas + WebAudio 录屏（webm + mp4）
```

证据目录 `review/v2/`：

- `verification.json` — 浏览器验收结果（canvas/UI/响应式/控制/telemetry）
- `replay/` — 确定性回放双次截图与哈希
- `loom/live.webm` / `.mp4` — 真实 Canvas + 音轨录屏
- `loom/hero-final.png` / `ui-1472.png` / `ui-1920.png` / `ui-768.png` — 视觉证据
- `REVIEW.md` — 诚实的完成度评估与已知问题
- `GIT_LOG.md` — 变更记录
- `../takeover/TAKEOVER.md` — 对 Astra review-v2 交接包的接管复核记录
- `../mechanics-v2/` — Astra 原始评审证据（历史基线）

## 基线与回退

| 标签 / 分支 | 内容 |
|---|---|
| `review-v2-baseline` (`3a778b9`) | Astra Loom 评审修正版交接基线 |
| `archive/modes-wip-2026-11-16` (`c503d3a`) | 归档的三模式原型（Chips/Westworld + 全模式 QA 证据） |
| `deliverable/loom-v1` | 本次 Loom 交付 |

全量 Git bundle 备份：`../backup/kunlun-loom-pre-v2.bundle`。回退到交接基线：

```bash
git checkout review-v2-baseline
```

## 归档的探索（不在交付内）

Chips（工具调用卡牌世界）与 Westworld（压力工厂装置）原型保存在 `src/engine/gallery/`，
并从构建与 `tsconfig` 中排除；完整源码、截图与全模式 QA 证据保存在 git tag
`archive/modes-wip-2026-11-16`。恢复步骤见 [`src/engine/gallery/README.md`](src/engine/gallery/README.md)。

## 已知限制

- 平面机构艺术，不做动力学、碰撞或制造校核；连杆只保证几何杆长与位置解算。
- 真实 Agent 桥为本地开发工具（loopback、无鉴权），不是生产级事件服务。
- WebAudio 需要用户手势才能启动；headless 自动化会加 `--autoplay-policy=no-user-gesture-required`。
- 跨机器像素确定性未证明（同机同浏览器已在回放中验证）。
- 逐项完成度与未达标项见 `review/v2/REVIEW.md`。
