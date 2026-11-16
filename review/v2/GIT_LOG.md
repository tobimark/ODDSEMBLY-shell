# V2 Git 记录（草稿 — 待 Lead 补全）

> **本文件不是 git 输出。** QA 会话按任务规则**未运行 git**，因此这里不包含任何推测或编造的 commit hash。
> 历史基线记录见 `review/GIT_LOG.md`（阶段 1 的 3 个提交：`24c53f3` → `e29a6f7` → `1e0806b`），这些是**重构前**的 Loom 基线，不代表 V2 多模式改动。

## 1. V2 变更清单（事实描述，非提交）

以下来自本轮实际落盘文件与任务记录，供 Lead 提交时核对：

**引擎核心 / 架构**
- `src/engine/core/`：`engine.ts`（VisualEngine、模式注册/切换、确定性 tick、telemetry）、`bus.ts`、`audio.ts`（master/recording bus + beats 账本）、`replay.ts`（ReplayPlayer + 12 事件回放）、`simulator.ts`、`spring.ts`、`drawing.ts`、`mode.ts`（VisualMode 接口 + 注册表）、`types.ts`、`design.ts`
- `src/engine/index.ts`、`src/engine/theme.ts`、`src/App.tsx`、`src/styles.css`、`index.html`
- `src/engine/modes/loom/**`：Loom 移植（scene/audio/atelier，含 parity 一致的几何与机械连杆）
- `src/engine/modes/chips/**`：卡牌世界（cards.ts 纯逻辑、table/cardsView/art 渲染、audio、layout）
- `src/engine/modes/westworld/**`：当前仍为 stub（待 Lead 实现）
- `public/replay/loom-session.json`：12 事件确定性回放

**QA 工具（本次新增/修改）**
- 新增：`scripts/verify-v2.mjs`、`scripts/replay-proof.mjs`、`scripts/record-v2.mjs`、`scripts/test-modes.mjs`、`scripts/compare-stills.py`、`scripts/lib/fixtures.mjs`
- 扩展：`scripts/lib/browser.mjs`（错误收集/等待/渲染器探测）、`scripts/shot-mode.mjs`（保持可用）
- 测试修复：`scripts/test-mechanism.mjs` 路径由 Lead 修正为 `src/engine/modes/loom/atelier/*`
- 未修改：`src/**`、`App.tsx`、`styles.css`、`public/**`、`package.json`（QA 写域外）

**审查产物（review/v2/，可作为一次性提交或按模式拆分）**
- `verification.json`、`test-results.json`、`REVIEW.md`、`GIT_LOG.md`
- `shots/`（各模式 idle/burst/settled/1920/768/switch/sequence）
- `wip/`（Chips WIP 快照验证，过程证据）
- `replay/`（determinism.json + a/b 截图）
- `recordings/`（webm/mp4/代表帧 + recordings.json）
- `comparisons/`（参考 still 并排图 + index.json）
- `parity/`（由 Lead 采集的 Loom 重构前后像素 parity）

## 2. 待 Lead 补全：最终提交清单

请在最终提交后把 `git log --oneline` 结果补到这里（含 V2 多模式与最终视觉定稿提交），并注明：

```
【Lead 待填】git log --oneline <base>..HEAD
【Lead 待填】最终构建哈希 / dist 构建时间
【Lead 待填】Chips 稳定版快照（用于替换 wip/ 证据）
【Lead 待填】Westworld 实现提交（实现落地后 QA 重跑并更新 verification.json）
```

## 3. 回滚点提示

- 重构前基线（历史）：`24c53f3`（初始基线）、`e29a6f7`（.gitignore 清理）、`1e0806b`（Loom 视觉+回放+评审包）。
- V2 回滚点：**【Lead 待填】**（需在最终提交后提供）。
