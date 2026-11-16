# Git 变更记录 — Loom-only 交付

> 本文件由 Lead 收尾时补全，只列真实存在的提交与标签；可用 `git log --oneline --decorate` 逐条核对。
> 仓库路径：`D:\workspace\gamified-flow\kunlun-loom`；主交付分支：`feat/multi-mode-engine`。

## 标签

| 标签 | 提交 | 含义 |
|---|---|---|
| `review-v2-baseline` | `3a778b9` | Astra Loom 评审修正版交接基线（重构前像素基准） |
| `archive/modes-wip-2026-11-16` | `c503d3a` | 归档：完整三模式原型（Chips / Westworld）+ 全模式 QA 证据 |
| `deliverable/loom-v1` | 见 `git log -1`（收尾证据提交；代码主体 `8f69aec`） | 本次 Loom-only 交付 |

## 提交（旧 → 新）

| 提交 | 类型 | 内容 |
|---|---|---|
| `e90cd88` | chore | 集成 Astra `review-v2` 精简验收包，建立可回退基线 |
| `c2bc455` | feat | 可复用视觉引擎核心（`VisualEngine` / `EventBus` / `ReplayPlayer` / `AudioEngine` / `Spring` / 程序化绘图库 / 模式注册表），Loom 作为第一个模式原样迁移；修复回放像素不确定性（确定性手动 tick） |
| `32efe0a` | feat | 零依赖本地 Agent 事件桥（WebSocket/HTTP、`--tail` JSONL、`--demo`）+ README/键盘单入口修复 |
| `ffbcccb` | fix | 重构后测试脚本路径修正（`modes/loom/atelier/*`），`npm test` 恢复通过 |
| `835fd6f` | feat | Chips 工具调用卡牌世界原型（确定性牌堆/手牌/结算、程序化牌桌、票据、音频）— **已归档** |
| `c503d3a` | archive | 归档 Chips + Westworld 完整原型与三模式 QA 证据（`archive/modes-wip-2026-11-16`） |
| `8f69aec` | feat | Loom-only 交付面：移除 Chips/Westworld 注册与导航、原型移入 `src/engine/gallery/`（排除构建与 tsc）、单展签头部、README/ARCHITECTURE 重写、最终截图 |
| 收尾提交 | docs/evidence | QA Loom-only 证据（`verification.json` 46 项、回放 `14/14`、录屏 `15/15`、`test-results.json` 25/25）、本 GIT_LOG 与 REVIEW 定稿；`deliverable/loom-v1` 指向此提交 |

## 归档物（不在交付内）

- Git：标签 `archive/modes-wip-2026-11-16` = `c503d3a`（完整可复现的三模式源码 + QA 证据）。
- 仓库内：`src/engine/gallery/`（Chips / Westworld 原型，含恢复说明 README；不参与构建与类型检查）。
- 仓库外备份：
  - `D:\workspace\gamified-flow\backup\kunlun-loom-all-2026-11-16.bundle`（全量 Git bundle，含所有分支/标签）
  - `D:\workspace\gamified-flow\backup\kunlun-loom-archive-modes-2026-11-16.zip`（归档模式源码 + 截图/录像/QA 证据，约 138 MB）
  - `D:\workspace\gamified-flow\backup\kunlun-loom-pre-v2.bundle`（重构前备份）
- 归档证据目录：`review/v2/archive/`（三模式 QA 快照、归档 CPU 模式回放/录屏）。

## 交付构建身份

- 源码：`8f69aec` + 收尾证据提交（仅 scripts/review 文档与证据变更，`src/`、`public/` 未再改动）。
- 构建：`dist/`，tree SHA-256 `93ed18b7e3d3e635a4f31b548e9448da49c393e28d26b51b2ca55c0fc9e4e22e`；
  `dist/index.html` SHA-256 `EAA10B01C144C56F87F2859CB6AADA1C2E5117CC71D4CD9829183AF653379F56`；
  `dist/assets/index-l-JrmqNu.js` SHA-256 `88033BF81E7C32BEC9FFD20C791243FCCA157790DB54E67E99DA068A9DE1664D`。
- 重建命令：`npm ci && npm run build`（等价源码状态下应得到同样的 `dist/` 语义；跨机器构建哈希未验证）。

## 回退

```bash
git checkout review-v2-baseline     # 回到 Astra 交接基线（重构前 Loom）
git checkout archive/modes-wip-2026-11-16  # 查看/恢复归档的三模式原型
git checkout deliverable/loom-v1    # 回到本次 Loom 交付
```
