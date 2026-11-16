# KunlunMeta Agent Visual Engine — V2 独立验证报告（草稿）

> 状态：**DRAFT / 未验收**。本文件由 qa-evidence 独立采集，只陈述实际测得的证据；每模式最终完成度与质量结论由 Lead 在最终视觉定稿后补写（见各节 `【Lead 待填】`）。
> 本版不声称通过用户验收，也不声称与参考实现达到像素级一致。

## 1. 结论摘要（截至 2026-11-16 12:07 +08:00）

> 说明：下表“通过”指**在对应 WIP 构建快照上**的全部自动断言通过；最终 `dist/` 重建后需重跑，未重跑前不得作为验收结论。

| 模式 | 验证状态 | 证据基础 | 备注 |
|---|---|---|---|
| 三模式组合 | ✅ 通过（WIP 构建，129/129） | `wip-all/verification.json`（12:00 构建，Loom/Chips/Westworld 均真实） | 跨模式 idle 帧哈希互不相同；无重复世界 |
| Loom | ✅ 通过（PASS） | `wip-all/verification.json`（29/29）、`replay/determinism.json`（14/14）、`recordings/recordings.json`（14/14）、`parity/`（7/7 像素一致） | 机制/连杆 node 测试全通过 |
| Chips | ⚠️ WIP 快照通过（PASS on snapshots） | `wip-all/verification.json`（31/31）、`wip-chips-1147/verification.json`、`wip/verification.json`、`wip/replay/determinism.json`（12/12）、`wip/recordings/recordings.json`（13/13） | 合同断言：totalDealt=12、resolvedHands=2、queued=0、score>0、stage settled、12 个 deal 音拍 |
| Westworld | ⚠️ WIP 快照通过（PASS on snapshot） | `wip-all/verification.json`（34/34）、`wip-westworld/verification.json`、`wip-westworld/replay/determinism.json`（12/12）、`wip-westworld/recordings/recordings.json`（13/13） | charge=12、releases=2、purges=0、STABLE、12 个 ww-actuate 音拍 |
| 引擎/UI 层 | ✅ 通过（WIP 证据） | `wip-all/verification.json` UI 35/35 | 单 canvas、无未捕获异常、三 Tab 切换、响应式 1920×1080 / 768×1024、Loom+Chips 状态保持 |

## 2. 验证方法与环境

- 浏览器：headless Microsoft Edge（`--headless=new`，SwiftShader 可选），CDP 私有端口 4510+；每个模式独立浏览器会话。
- 渲染环境：见 `verification.json` 各模式 `environment.renderer`。
- 确定性时钟：`?deterministic=1&noauto=1`，页面内批量 `window.__engine.tick(dt)`；12 事件 fixture 固定（`scripts/lib/fixtures.mjs`，与 replay/recording 共用）。
- 判定口径：
  - `pass` = 所有断言为真且模式非 stub；
  - `partial` = 通用引擎检查通过但模式专项显式跳过（stub / API 未确认）；
  - `fail` = 任一断言失败或出现未捕获异常。
  - **SKIP 永远不计为通过**，报告中保留跳过原因。
- 确定性回放：同一 `replay/*.json`，两个全新浏览器会话，同一 1/60 s tick 序列，固定虚拟时间截图；比对 PNG SHA-256 与 mode telemetry。
- 录屏：`canvas.captureStream(30)` + `AudioEngine.recordingStream` 音轨，MediaRecorder（VP9/Opus），墙钟播放 replay；MP4 由 ffmpeg 转码（H.264/AAC）。
- 声音验证范围：只证明 `AudioEngine.markBeat` 的因果事件序列（eventId 顺序）与 Opus 音轨存在，**不等于**已校准设备音频输出延迟或主观听感。

## 3. 证据索引（均为本目录相对路径）

| 证据 | 内容 | 复现命令 |
|---|---|---|
| `wip-all/verification.json` | **三模式全真实组合验证**（12:00 WIP 构建，129 检查 0 失败 0 跳过；含跨模式不同帧哈希 + 两条状态保持序列） | `node scripts/verify-v2.mjs --root=.tmp/dist-westworld --out=review/v2/wip-all --port=4594` |
| `verification.json` | 主验证报告（最终 dist 重建后重跑；**当前文件为 11:37 的临时 Chips 单模式快照，勿作最终依据**） | `node scripts/verify-v2.mjs --port=4512` |
| `wip/verification.json` | Chips WIP 快照验证（过期，仅作过程证据） | `node scripts/verify-v2.mjs --modes=chips --root-chips=.tmp/dist-chips --out=review/v2/wip --port=4540` |
| `wip-combined/verification.json` | Loom+Chips 真实模式 + Westworld stub 的组合验证（117 检查，0 失败，westworld partial） | `node scripts/verify-v2.mjs --root=.tmp/dist-chips --out=review/v2/wip-combined --port=4574` |
| `wip-chips-1147/verification.json` | Chips 11:47 构建快照复验（31/31 + 12/12；与 11:34 快照结论一致） | `node scripts/verify-v2.mjs --modes=chips --root-chips=.tmp/dist-chips --out=review/v2/wip-chips-1147 --port=4590` |
| `wip-westworld/verification.json` + `replay/` + `recordings/` | Westworld 12:00 构建：verify 34/34 + UI 9/9、replay 12/12（3/3 像素一致）、录制 13/13（webm/mp4/帧、12 ww-actuate beats） | `node scripts/verify-v2.mjs --modes=westworld --root-westworld=.tmp/dist-westworld --out=review/v2/wip-westworld --port=4580`（replay/record 同参数 `--out .../replay`、`.../recordings`） |
| `wip/replay/determinism.json` | Chips 真实视觉的确定性回放证明（per-mode `chips-session.json`，3/3 mark 像素一致） | `node scripts/replay-proof.mjs --modes=chips --root-chips=.tmp/dist-chips --out=review/v2/wip/replay --port=4562` |
| `wip/recordings/` | Chips 真实动画录屏（26.3 s，webm+mp4+帧，12 deal 音拍，58.9 fps） | `node scripts/record-v2.mjs --modes=chips --root-chips=.tmp/dist-chips --out=review/v2/wip/recordings --port=4570` |
| `shots/<mode>-{idle,burst,settled,1920,768}.png` | 各模式 1472×1008 空闲/12 事件中段/结算/响应式截图（canvas，无 HUD） | 同上 |
| `shots/switch-<mode>{,-1920,-768}.png` | 通过真实 Tab 点击切世界后的截图（含 React HUD） | 同上 |
| `shots/sequence-*.png` | Loom→Chips→Westworld→Loom 状态保持序列；Chips→Loom→Chips 牌桌保持序列 | 同上 |
| `replay/determinism.json` + `<mode>-{a,b}-<t>s.png` | 两次全新会话同虚拟时间的 PNG SHA-256 等价证明 | `node scripts/replay-proof.mjs --port=4522` |
| `recordings/<mode>-live.webm` / `.mp4` / `-frame.png` + `recordings.json` | 真实墙钟回放录屏（webm+mp4+代表帧）、音拍、rAF fps | `node scripts/record-v2.mjs --port=4532` |
| `test-results.json` | Node 纯逻辑测试（51 检查：Loom 机制/连杆、core replay/spring/simulator、回放文件、Chips 卡牌逻辑、Westworld machine/layout） | `node scripts/test-modes.mjs` |
| `comparisons/*-vs-reference.png` + `index.json` | 参考 still 与 v2 截图并排对照（人工评审辅助） | `python scripts/compare-stills.py` |
| `parity/*` | Loom 重构前后像素 parity（由 Lead 采集，7/7 相同） | `node scripts/parity-loom.mjs`（需 `.tmp/dist-baseline`） |

## 4. 分模式记录

### 4.1 Loom

**已实测事实**
- 单 canvas / 无 `fatal` 覆盖 / 无未捕获异常或 console error；1472×1008、1920×1080、768×1024 下画布填满视口且无页面溢出。
- 12 事件爆发：`picks=12`、`queued=0`、`stage=READY`；12 个音拍 eventId `1..12` 严格有序；AudioContext `running`。
- 确定性回放：3 个固定虚拟时间点（2/8/21 s）两个全新浏览器会话 PNG 逐字节相同；replay cursor 12/12；两次运行 mode telemetry 完全一致。
- 录屏：26.2 s，H.264 1472×1008 + AAC 48 kHz 立体声（ffprobe 复核），rAF 平均 ~59.6 fps，12 picks/12 beats；代表帧取自 mp4。
- Node 测试：shed→shuttle 顺序、12 次提交 FIFO、帧步独立性、stop 取消队列、12,003 个连杆姿态固定杆长。
- 状态保持：织完 12 picks 后切 Chips/Westworld 再回 Loom，picks 仍 12、HUD PICKS=12、事件数不变。

**质量评估** 【Lead 待填】：与 Astra 基线及参考 still 的最终视觉对比结论、是否达到验收标准。

### 4.2 Chips

**已实测事实（基于 11:34 / 11:47 两个 WIP 构建快照，最终版未定稿）**
- 12 事件爆发：`totalDealt=12`、`resolvedHands=2`、`queued=0`、`score=926`、`stage=idle`（结算完成）；2 手结算票据与 HUD 台账渲染正常。11:47 构建复验同为 31/31 + 12/12 通过。
- 音拍：12 个 `chips-deal`（eventId 1..12 有序），结算 cash 标记为记号（eventId 900000，非 agent 事件，未计入 1..12）。
- 响应式/异常/单 canvas 全部通过；Cards 逻辑 node 测试 12 项（RankDeck 确定性/45 张/洗牌、10 种牌型、数值公式、配额、预览、布局）全通过。
- 状态保持：牌桌 12 事件结算后切 Loom 再切回，mode telemetry（含 hand 牌面、score、resolvedHands、totalDealt）逐字段不变。
- 确定性回放（真实 Chips 视觉，per-mode `chips-session.json`）：两个全新会话在 2/8/16 s 三个 mark PNG 逐字节相同；12/12 cursor；mode telemetry 一致；12 deal beats 有序；16 s 时 resolvedHands=2、score=993。
- 录屏（真实 Chips 动画，11:34 快照）：26.3 s，VP9/Opus → H.264/AAC 1472×1008；12 deal beats；rAF 平均 58.9 fps；代表帧位于 `wip/recordings/chips-frame.png`（结算票据 HIGH CARD +483、配额条、HUD 台账可见）。

**质量评估** 【Lead 待填】。
**过程观察**：该快照下 12 事件 2 手均未达配额（successHands=0, missHands=2，quota 1160 vs 408/518），属于数值平衡观察而非渲染失败；最终版是否调整由 Lead 决定。

### 4.3 Westworld

**已实测事实（基于 12:00 的 WIP 构建快照，最终版未定稿）**
- 12 事件爆发：`charge=12`、`total=12`、`releases=2`、`purges=0`、`queued=0`、`stage=STABLE`；`pressure=0.249`、`heat=0.04` 均在 [0,1]；`lastRelease.index=2` 且含 5 个 family 与票据文本；`lastPurge=0`。
- 音拍：12 个 `ww-actuate`（eventId 1..12 有序），AudioContext `running`。
- 确定性回放（per-mode `westworld-session.json`）：两个全新会话在 2/8/16 s 三个 mark PNG 逐字节相同；12/12 cursor；mode telemetry 一致。
- 录屏（真实动画）：26.3 s，webm→mp4（H.264/AAC），12 ww-actuate beats，rAF 平均 59.0 fps；代表帧 `wip-westworld/recordings/westworld-frame.png`（大表盘/罐体液位/RELIEF 票据/计数器可见）。
- Node 测试：机器确定性、5 子系统路由、5 呼释放、20 呼 purge（4 releases + 1 purge）、reset 确定性、fx 消费、表盘角度映射、布局边界，Westworld 组 10/10。
- 观察（非失败项）：t=20 s 时票据板显示 “RELEASE 01 OK”，而 telemetry `lastRelease.index=2`，疑似打印板保留第一张票据而非最新一张；由 Lead 判断是否修复。

**质量评估** 【Lead 待填】。

## 5. 与参考 still 的对照说明

- 参考包：`D:\workspace\gamified-flow\analysis\r2-canvas-package\stills\`（Loom/Chips/Westworld `*_canvas_1472x1008.png`）与 montage/gifs/sequences。
- 注意：参考 still 是**相机裁切视图**（局部放大），v2 证据为 1472×1008 全幅设计帧（cam zoom 1.0），因此并排图只用于人工对照视觉语言，不作为像素一致性声明。
- 可对照的共同语言：暖纸底、细灰墨线、藏青结构色 + 青绿活动色 + 黄铜点缀、等宽/衬线排版、分层纸卡阴影、事件驱动刻度与台账。
- 已生成并排图：`comparisons/{loom,chips,westworld}-vs-reference.png`（自动选取最新证据：Loom 主套件、Chips 11:47 快照、Westworld 12:00 快照；左侧参考为相机裁切视图，右侧为全幅 v2 帧）。

## 6. 已知限制与未验证项（诚实清单）

1. **未定稿**：Westworld 仅验证过 12:00 WIP 构建；最终 dist 必须重跑（最终版视觉/数值可能变化）。
2. **未定稿**：Chips 仅验证过 11:34/11:47 WIP 快照；Lead 已确认构建仍在推进，最终版必须用新构建哈希重跑（含 `wip/` 下的录像与回放证据）。
3. **未验证**：跨机器/跨 GPU 的渲染确定性；本报告只证明同一台机器、同一浏览器构建内两个全新会话的 PNG 一致。
4. **未验证**：真实 agent WebSocket feed（`?feed=ws://…`）端到端；本次全部由 fixture/replay 注入。
5. **未验证**：`?motion=off` reduced-motion 分支、键盘快捷键全量、缩放/Detail 视图、长时间（>5 min）稳定性与内存。
6. **未验证主观听感/设备音频校准**：只验证 beat 账本顺序与 Opus 音轨存在；未做音频输出延迟、响度或跨设备播放验证。
7. **回放文件缺口**：`public/replay/chips-session.json`、`westworld-session.json` 尚未提供。Chips/Westworld 的确定性证明当前通过 `?session=replay/loom-session.json`（引擎显式 URL 与模式无关）完成，报告内已标注 fallback。
8. **ffmpeg 环境差异**：系统 PATH 无 ffmpeg；`C:\...\GhostDownloader\FFmpeg\ffmpeg.exe` 为裁剪版（无 libx264，已拒绝）。MP4 由 imageio-ffmpeg 自带 gyan.dev 构建（v7.1，libx264+aac）转码；换机器需设置 `FFMPEG_PATH`。
9. **对照限制**：参考 still 为相机裁切，和全幅 v2 帧无法逐像素比较；参考实现专有字体/像素未复用（符合任务约束）。
10. **未提交**：QA 会话按规则未运行 git；`GIT_LOG.md` 中 v2 提交清单待 Lead 补全，本文件不含任何推测的 commit hash。
11. **工程性未覆盖**：机械连杆只验证平面几何约束（固定杆长/可达性），未验证动力学、关节间隙、碰撞、制造可行性；Chips 数值平衡非验收项。
12. **截图评审范围**：未做逐像素 UI 文案重叠核对；最终视觉验收需 Lead/用户人工过目 `shots/` 与录屏。

## 7. 复现命令（全部在 `kunlun-loom/` 下）

```bash
# 0) 构建（标准入口；qa 不改 src，仅消费 dist）
npm run build

# 1) 三模式验证（主报告）
node scripts/verify-v2.mjs --port=4512
# 单模式 / WIP 构建（不入主报告）
node scripts/verify-v2.mjs --modes=chips --root-chips=.tmp/dist-chips --out=review/v2/wip --port=4540

# 2) 确定性回放像素等价
node scripts/replay-proof.mjs --port=4522

# 3) 真实回放录屏（webm + mp4 + 音拍 + rAF）
node scripts/record-v2.mjs --port=4532
# FFMPEG_PATH=C:\path\to\ffmpeg.exe 可覆盖转码器

# 4) Node 纯逻辑测试
node scripts/test-modes.mjs

# 5) 参考对照并排图
python scripts/compare-stills.py

# 6) Loom 与重构前基线 parity（Lead 采集）
node scripts/parity-loom.mjs
```

## 8. 声明

本报告为**独立验证证据包**，不是验收结论。所有 PASS 均可由上述命令复现；所有 SKIP/未验证项已显式标注，未用推断或占位数据替代实测。最终版本、视觉定稿与提交记录由 Lead 负责。
