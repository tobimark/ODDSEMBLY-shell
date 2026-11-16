# Phase 1 — 正式接管记录（Astra review-v2 → DSH）

日期：2026-11-16。接手基线：`KunlunMeta-Loom-评审修正版-精简验收包.zip`（12,521,853 B，内含 `版本信息.json.commit = 3a778b9ad7a747ce71700e1b94684cd1c34359f2`）。

## 1. 交接包完整性

- 解包到 `.tmp/incoming` 后与工作树逐文件 SHA-256 对比：**57/61 个文件完全一致**；不一致的 4 个只是包内附带的说明/对照图（`先读我.md`、`版本信息.json`、`对照/修正前.png`、`对照/CrommaCode原版.png`），不在源码树中。
- 上述 4 个文件已原样收入 `review/handoff/`，未覆盖任何既有文件。
- 基线提交即 `3a778b9`，与交接包 `版本信息.json` 一致；另有 `a0ef1eb`（伺服杆长约束 + 打纬声同步）、`eda1b00`、`1e0806b` 等历史提交。

## 2. Git 状态保护

| 项 | 值 |
|---|---|
| 基线 tag | `review-v2-baseline` → `3a778b9` |
| 接管提交 | `chore(handoff): integrate review-v2 slim package as new baseline` |
| 全量备份 bundle | `D:\workspace\gamified-flow\backup\kunlun-loom-pre-v2.bundle`（--all） |
| 保留分支 | `master`（最初版）、`visual/atelier-loom`（Astra 视觉首版）、`fix/loom-mechanics-review`（评审修正版） |
| 后续开发分支 | `feat/multi-mode-engine` |

未直接覆盖任何既有实现；`shots/replay.png` 等截图工件作为新一次的运行产物保留。交接包 ZIP 与历史大文件（`.webm`/`__MACOSX` 等）不入库，`.gitignore` 已登记。

## 3. 接管复核（在 DSH 环境重跑，不引用 Astra 的结论）

### 3.1 构建与单元测试

| 检查 | 命令 | 结果 |
|---|---|---|
| 织造时序 / FIFO / 停止取消 / 帧步长无关 | `npm test` | PASS |
| 12,003 个连杆姿态：曲柄 25、连杆 75 固定长度、非法位置拒绝 | `npm test` | PASS（最大长度误差 2.27e-13） |
| 生产构建 | `npm run build` | PASS（793 modules） |

### 3.2 真实运行 + 回放 + 音频（headless Edge，实拍）

`npm run review:atelier` 在本机重新执行（产物备份于 `review/takeover/loom-rerun/`，其中 `verification.json` 为重跑结果）：

- 单 canvas 初始化；无 `Runtime.exceptionThrown`。
- UI Play 注入模拟事件；Pause 冻结状态与相位；2× 速度；静音；Detail 视图。
- 单事件：开口(shed) 先于投梭(travel)，一事件一织入；12 连发按 FIFO 排空。
- 回放：`?noauto=1&replay=1` 只注入 12 个事件（无模拟器污染），**12 事件 → 12 次织入（picks=12）**。
- 录音：canvas.captureStream(30) + MediaRecorder VP9/Opus，**真实音轨**同时录制；`audioProof.beats.length = 12`，eventId 顺序 1..12；AudioContext = running；25.04s、1495 帧、实测 rAF 帧率 ≈59.7fps。
- 桌面 1920×1080 / 平板 768×1024 渲染截图各一张。

### 3.3 视觉与机械基线确认

- `review/handoff/对照/修正前.png` vs `review/takeover/loom-rerun/after-hero.png` 对比确认：112 根经线、16 组纱色、右侧三组 SERVO A/B/R 曲柄滑块（固定 25/75 杆长）、左侧齿轮不再假装驱动综框、织入时打纬声同步。
- 原先评审指出的“假连杆”问题未复现：`src/engine/modes/loom/atelier/linkage.ts` 由圆交点求解固定杆长，测试覆盖 12,003 姿态。

## 4. 已知限制（继承自基线，未在本轮修复）

- 平面机构艺术，无动力学/碰撞/制造校核；伺服连杆只验证几何约束，不验证力矩、间隙与噪声。
- 回放为**语义确定**；像素级确定性在旧版由真实时间驱动，不保证。此项在 Phase 2 已用 `deterministic` 手动时钟解决（见 `review/v2/ARCHITECTURE.md`、`review/v2/parity/`）。
- 音频触发时序已证明，跨设备输出延迟未校准。
- 浏览器需用户手势后才能启动 WebAudio（headless/自动录制时通过 `--autoplay-policy=no-user-gesture-required` 规避）。

## 5. 关于压缩包内未包含内容

Astra 精简包刻意不含 `node_modules`、缓存、`.git`、历史大文件与原始 WebM；本机重新 `npm install` 后构建通过。历史证据目录 `review/atelier/` 保留在仓库中，但仅对 Astra 首版机械结构有效，**不适用于本轮修正版**。
