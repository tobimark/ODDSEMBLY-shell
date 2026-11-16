# KunlunMeta Agent Visual Engine — Loom-only 验证报告

> 状态：**证据采集完成 / 待用户验收**。本报告由 qa-evidence 在交付构建上独立采集，只陈述实测证据。
> 用户最终决定：**只交付 Loom 场景**（通过可复用引擎运行）；Chips / Westworld 作为实验归档，不进入交付。
> 本报告不声称通过用户验收，也不声称与参考实现像素级一致；最终视觉与验收结论由 Lead / 用户判定。

## 1. 交付物与构建身份（已核对）

| 项 | 值 |
|---|---|
| 交付构建 | `dist/`，commit `8f69aec`，tag `deliverable/loom-v1` |
| 构建时间 | 2026-11-16T04:13:57Z（12:13:57 +08:00） |
| 构建树 SHA-256 | `93ed18b7e3d3e635a4f31b548e9448da49c393e28d26b51b2ca55c0fc9e4e22e`（13 文件，768,399 B，规范化相对路径+字节） |
| `dist/index.html` SHA-256 | `EAA10B01C144C56F87F2859CB6AADA1C2E5117CC71D4CD9829183AF653379F56` |
| `dist/assets/index-l-JrmqNu.js` SHA-256 | `88033BF81E7C32BEC9FFD20C791243FCCA157790DB54E67E99DA068A9DE1664D` |
| 构建内容 | 仅 Loom 一个 mode；无 Chips/Westworld 字符串；`replay/` 仅 `loom-session.json` + `agent-session.json` |
| 基线标签 | `review-v2-baseline` = `3a778b9`（重构前 Loom 基线） |
| 归档标签 | `archive/modes-wip-2026-11-16` = `c503d3a`（完整 3 模式构建 + 全模式 QA 证据） |

构建哈希详见 `review/v2/build.json`。上述两个文件哈希与 Lead 提供的最终值逐字符一致。

## 2. 结论摘要

| 验证项 | 结果 | 证据 |
|---|---|---|
| Loom 画布 pass（确定性 12 事件） | ✅ PASS 29/29 | `verification.json` |
| 单模式 UI / 响应式 / 异常 | ✅ PASS 17/17（1 项显式 SKIP，见 §4.4） | `verification.json` |
| 确定性回放像素等价（两个全新会话） | ✅ PASS 14/14，3/3 mark 逐字节相同 | `replay/determinism.json` |
| 真实时钟录屏（webm + mp4） | ✅ PASS 15/15 | `recordings/recordings.json` |
| Node 纯逻辑测试（engine + Loom） | ✅ PASS 25/25，0 skip | `test-results.json` |
| 与重构前 Loom 基线像素 parity | ✅ 7/7 逐字节相同 | `parity/parity-report.json`（Lead 采集） |
| 归档模式的 QA 快照 | ⚠️ 归档证据，不属于交付 | `review/v2/archive/` |

**当前无失败项。** 唯一 SKIP 是“多模式切换状态保持”，在单模式交付中不适用（见 §4.4）。

## 3. 验证方法与判定口径

- 环境：Windows 11，headless Microsoft Edge（`--headless=new`），CDP 私有端口 4600+，每项验证使用全新浏览器 profile；GPU renderer 信息见 `verification.json`。
- 确定性时钟：`?mode=loom&deterministic=1&noauto=1`，页面内批量 `window.__engine.tick(1/60)`；12 事件 fixture 固定（`scripts/lib/fixtures.mjs`，与回放/录屏脚本共用）。
- 判定：`pass` = 全部断言为真；`fail` = 任一断言失败或出现未捕获异常；**SKIP 不计为通过**，报告中保留原因。
- 回放：同一 `replay/loom-session.json`，两个全新浏览器，同一 tick 序列，固定虚拟时间（2/8/21 s）截图，比对 PNG SHA-256（分别保存 `loom-a-*.png` / `loom-b-*.png` 后比对真实字节）。
- 录屏：`canvas.captureStream(30)` + `AudioEngine.recordingStream` 音轨，MediaRecorder VP9/Opus；墙钟播放 replay；ffmpeg 转 H.264/AAC MP4。
- 声音只验证因果音拍账本（eventId 顺序）与音轨存在；**不验证设备音频输出延迟或主观听感**。

## 4. 已实测事实

### 4.1 Loom 画布（29/29）

- 单 canvas；无 fatal overlay；无未捕获异常 / console error / browser log error。
- 12 事件注入后批量 tick 至 26 s 虚拟时间：`events=12`、`picks=12`、`queued=0`、`stage=READY`；音拍 12 个 `loom-beat`，eventId `1..12` 严格有序；AudioContext `running`。
- 截图：idle（t=0）、burst（t=5 s，动画中段）、settled（t=26 s）均为 1472×1008 canvas。
- 响应式：1920×1080、768×1024 下 canvas 填满视口、页面无溢出。
- **112 经线 / 16 纱筒**：`WEAVE.ends = 112`；creel 循环 16 个独立纱包，每筒 7 根（112 = 16×7）；纱线颜色按 `i/7` 分组。

### 4.2 单模式 UI（17/17 + 1 SKIP）

- 头部无 mode tab（0 个 `.mode-tab`）；`.mode-plaque` = `01 LOOM / EXHIBITION 01 · 112 ENDS`（断言通过）。
- `KUNLUNMETA` brand、Loom caption、telemetry pill + 字段 `PICKS/QUEUE/SHED/MODE` 均存在。
- transport 控件：Play/Stop/0.5×/1×/2×/Sound on/Detail；5 个 tool 触发按钮；hint 行。
- 1920 / 768 UI 截图：canvas 填满、无溢出、单 canvas。
- 零未捕获异常 / console error。
- 单模式初始状态 `modeId=loom` 且该世界处于活动状态。

### 4.3 确定性回放（14/14）

- 两个全新浏览器会话、同一 replay 文件、同一 tick 序列：2 s / 8 s / 21 s 三个 mark 的 PNG **逐字节相同**（SHA-256 分别为 `77023aa1…`、`45a541e3…`、`b7f23adf…`）。
- replay cursor 12/12、done=true；engine 收到恰好 12 个 replay 事件；虚拟时钟一致；mode telemetry 一致（picks=12/queued=0/READY）；12 个 beat eventId 顺序一致；两次运行均无异常/console error。
- 诚实说明：本 harness 在早期版本存在“两次会话写同一 `-a` 文件名、比较读到同一文件”的缺陷；该缺陷已在最终证据前修复，本报告数据来自 `-a`/`-b` 独立文件的真实字节比较（`replay/determinism.json` 的 `harnessNote` 有记录）。

### 4.4 录屏（15/15）

- `review/v2/loom/live.webm`：23,753,211 B，`video/webm;codecs=vp9,opus`；`review/v2/loom/live.mp4`：4,276,764 B，H.264 1472×1008 + AAC 48 kHz 立体声（ffprobe 复核，26.18 s）。
- 12 个 `loom-beat` eventId `1..12`；replay cursor 12/12、picks=12；rAF 平均 59.5 fps（1562 帧 / 26.16 s，p95 帧间隔 16.8 ms）。
- 代表帧 `review/v2/loom/live-frame.png` 从 MP4 于 20.2 s 提取（证明录屏不是静态帧）。
- ffmpeg 使用 imageio-ffmpeg 自带的 gyan.dev 7.1 构建（libx264+aac）；系统 PATH 无 ffmpeg，GhostDownloader 的裁剪版被能力校验拒绝（见 §7）。

### 4.5 Node 逻辑测试（25/25）

- core/replay（5）：事件按时间排序释放、cursor/done/elapsed、reset、零/负推进、稳定 eventId。
- core/spring（7）：双弹簧逐位一致并收敛、min/max 与 snap、缓动函数端点、mulberry32 确定性、hashString 稳定、tween 生命周期。
- core/simulator（4）：相同步序列产生相同事件、id 1..N 有序、stop/pause/resume 语义。
- loom/mechanism（4）：12 事件中 shed 先于 shuttle、无提前提交、12 picks FIFO、2400×0.01 s 与单步 22 s 等价、stop 取消队列。
- loom/linkage（2）：4002 姿态 × 3 组 = 12,006 组约束下杆长 75 / 曲柄 25 最大误差 < 1e-9；不可达几何抛错而非伪造。
- fixtures/replay（3）：`loom-session.json` 存在、12 事件、类型合法、时间单调、detail 非空。
- 补充：`npm test`（`scripts/test-mechanism.mjs`）12,003 个连杆姿态通过。

### 4.6 与重构前基线 parity（Lead 采集）

- `review/v2/parity/parity-report.json`：headless Edge + SwiftShader、`?static=1`、12 事件、1/60 s tick；idle/shed/pick/beat/takeup/mid/after 七个 mark 与 `review-v2-baseline` 逐字节相同（7/7），picks=12、stage=READY、异常 0，`pass:true`。
- 并排图：`comparisons/loom-vs-reference.png`（左侧参考 still 为相机裁切视图，右侧为 v2 全幅设计帧；仅用于视觉语言对照，不作为像素一致性声明）。

## 5. 质量评估（诚实版）

**已达成的（可复现）**：Loom 交付构建在功能、确定性、交互、响应式、音画同步与基线 parity 上全部通过；112 经线/16 纱筒、固定杆长伺服连杆、事件驱动织造循环、12 事件→12 次打纬、beat 音拍与录屏音轨均成立；与重构前 Loom 基线 7/7 像素一致，说明“引擎重构未改变 Loom 视觉”。

**与 Astra 参考的主观质量差距（沿用并复核前轮评审结论，非本轮自动化可判定项）**：
1. 参考织物在画面中的占比更大、纸面柔光/环境光遮蔽更强；本版仍偏“工程制图”，线条层次与纸面柔和度不足。
2. 参考经线有更明显的分组染色变化；本版按 7 根一组分色，但整体均匀度仍高于参考。
3. 综框/提综线/卷布辊为几何约束正确的示意级装配，未做动力学、关节间隙、碰撞与制造可行性求解。
4. 面板局部文字仍可能有轻微重叠；未做逐像素 UI 文案重叠核对。
5. 参考 still 是相机裁切视图，无法与全幅交付帧逐像素对齐；“像参考”的最终判断需人工并排评审。
6. 最终验收结论、视觉定稿与是否达到 Astra 标准由 Lead / 用户判定；本报告不替代。

## 6. 证据索引（均可复现）

| 证据 | 内容 |
|---|---|
| `verification.json` | 46 检查（29 canvas + 17 UI），0 失败，1 SKIP；含 build 哈希、telemetry、音频、截图哈希、异常 |
| `replay/determinism.json` | 14/14；A/B 两套独立截图 + SHA-256；marks 2/8/21 s |
| `recordings/recordings.json` | 15/15；媒体哈希、rAF、beats、ffmpeg 身份、代表帧 |
| `loom/live.webm` / `loom/live.mp4` / `loom/live-frame.png` | 真实墙钟录屏与代表帧（交付用） |
| `loom/ui-{1472,1920,768}.png` 等 | Lead 采集的 UI 截图（hero-final/idle-final/replay-* 同目录） |
| `shots/loom-{idle,burst,settled,1920,768}.png` | qa 采集的 canvas 截图 |
| `shots/switch-loom*.png` | 单模式交付下的 Loom 活动状态 UI 截图 |
| `test-results.json` | Node 25/25，6 组，0 skip |
| `parity/parity-report.json` + `parity/*.png` | 重构前后 7/7 像素 parity（Lead 采集） |
| `comparisons/loom-vs-reference.png` + `index.json` | 参考 still 并排对照 |
| `build.json` | 交付构建身份（树哈希、commit、tag、双文件哈希） |
| `archive/` | 归档模式的全部 WIP QA 证据（不属于交付） |

复现命令（全部在 `kunlun-loom/` 下）：

```bash
npm run build                       # 标准构建入口（qa 不修改 src）
node scripts/verify-v2.mjs          # Loom 默认：46 检查 → review/v2/verification.json
node scripts/replay-proof.mjs       # Loom 默认：确定性回放 → review/v2/replay/determinism.json
node scripts/record-v2.mjs          # Loom 默认：→ review/v2/loom/live.webm|mp4 + recordings.json
node scripts/test-modes.mjs         # engine+Loom 纯逻辑 → review/v2/test-results.json
npm test                            # test-mechanism（连杆/织造语义）
python scripts/compare-stills.py    # 参考并排图 → review/v2/comparisons/
node scripts/build-hash.mjs         # 可选：重算 dist 树哈希
```

## 7. 已知限制与未验证项

1. **验收状态**：未验收；最终视觉质量结论归 Lead / 用户。
2. **跨机器确定性未验证**：只证明同一机器、同一浏览器构建内两个全新会话 PNG 一致。
3. **音频未做听感/设备校准**：只证明 beat 账本顺序、AudioContext running、Opus 音轨存在与 MP4 含 AAC 立体声；未验证输出延迟、响度、跨设备播放。
4. **`?feed=ws://…` 真实 agent WebSocket 未做端到端验证**（本轮全部 fixture/replay 注入）。
5. **`?motion=off`、键盘快捷键全量、zoom/Detail 视图、长时间（>5 min）稳定性与内存**未系统验证。
6. **UI 文案重叠**未逐像素评审；建议人工看 `loom/ui-*.png` 与录屏。
7. **物理/制造层**：连杆只验证平面几何约束（75/25 固定长度、可达性），未验证动力学、间隙、碰撞、制造可行性。
8. **参考对照限制**：参考 still 为相机裁切，v2 为全幅设计帧；并排仅作视觉语言参考。
9. **ffmpeg 环境依赖**：系统 PATH 无 ffmpeg；MP4 由 imageio-ffmpeg v7.1 生成；换机器需设 `FFMPEG_PATH`，裁剪版需通过能力校验。
10. **git 提交/Tag 由 Lead 提供**：QA 会话按规则未运行 git；`GIT_LOG.md` 中列表来自 Lead，未编造。
11. **归档模式不属于交付**：Chips / Westworld 的通过快照仅证明“曾被实现并可运行”，不构成交付声明；其源码归档于 tag `archive/modes-wip-2026-11-16`，原型在 `src/engine/gallery/`（排除于 build/tsc）。

## 8. 归档实验附录（Archived experiments — not part of delivery）

- **归档 tag**：`archive/modes-wip-2026-11-16` = commit `c503d3a`：完整 3 模式构建、Chips + Westworld 实验源码与全模式 QA 证据。
- **原型位置**：`src/engine/gallery/`（Chips/Westworld 视觉原型，被排除在构建与 tsc 之外）。
- **本地保留的归档证据**：`review/v2/archive/`
  - `wip-all/`：12:00 三模式全真构建的 verify 快照（129 检查，0 失败，0 跳过；三世界 idle 帧哈希互异）。
  - `wip/`、`wip-chips-1147/`、`wip-combined/`、`wip-westworld/`：Chips/Westworld 各构建的通过快照、回放确定性与录屏证据。
  - `recordings-archived-modes/`、`replay-archived-modes/`、`shots-archived-modes/`：归档模式的媒体/截图。
  - `test-results-with-archived-modes.json`：含 Chips/Westworld 纯逻辑测试的 51 检查快照。
  - `stale-verification-chips-1137.json`：scope 变更前的临时报告，保留以说明历史。
  - `comparisons-all-modes/`：三模式参考并排图。
- 归档模式**不进入**最终 `dist`（已核对 bundle 无 Chips/Westworld 字符串），其证据**不作为交付验收依据**。

## 9. 声明

本报告是**独立验证证据包**，不是验收结论。所有 PASS 均可用 §6 命令复现；所有 SKIP、未验证项与限制均已显式列出，未使用推断或占位数据替代实测。最终交付、提交记录与视觉定稿由 Lead 负责；QA 未运行 git、未修改 `src/**`、`App.tsx`、`styles.css`、`public/**`、`package.json`。
