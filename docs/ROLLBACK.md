# 回滚手册 — Loom 事件转盘（动态版）

本轮改动被刻意隔离，**有三层回滚**：分支级、运行时开关、文件级。

## 0. 改动边界

功能分支：`feat/event-dial-motion`（从 `visual/precision-flat-integration` 的 `b15dd9a` 切出）。
本轮提交：tag `event-dial-v2`（用 `git rev-parse --short event-dial-v2` 查提交号）。
回滚基线 tag：`pre-dynamic-dial` → `b15dd9a`（静态事件刻度机构，无转轮、无固定矩形读数器）。
预改动文件副本：`D:\workspace\gamified-flow\backup\event-dial-prechange-20261116-205157\`。

本轮涉及：

| 类型 | 文件 |
|---|---|
| 新增 | `src/engine/modes/loom/atelier/{dialGeometry,dialModel,toolPalette}.ts`<br>`scripts/{test-dial,review-event-dial,shot-dial-motion,rollback-event-dial}.mjs`<br>`docs/EVENT_DIAL.md`、`docs/ROLLBACK.md`、`review/event-dial/**` |
| 修改 | `src/engine/modes/loom/atelier/eventDial.ts`（重写）<br>`.../atelier/integration.ts`（鞍座使用 DIAL 常量）<br>`.../atelier/assembly.ts`（移除被面板覆盖的 `00 / EVENT SCALE` 标注）<br>`.../scene.ts`、`.../index.ts`（事件入口 + dial telemetry）<br>`scripts/review-precision.mjs`（dial 断言改为遥测）<br>`package.json`（`test` 串上 test-dial；新增 review/shot 脚本）<br>`README.md`（新增动态转盘说明） |

未提交的 `src/App.tsx` / `src/engine/core/engine.ts` 是**与本功能无关的既有修复**，回滚脚本不会动它们。

## 1. 分支级回滚（推荐，最干净）

```powershell
cd D:\workspace\gamified-flow\kunlun-loom
git status                     # 确认当前在 feat/event-dial-motion
git switch visual/precision-flat-integration
```

效果：工作区回到本轮开始前的静态机构；`feat/event-dial-motion` 留在仓库里可随时再次查看。
未提交的 `App.tsx` / `engine.ts` 修复会跟随工作区保留（如冲突可先 `git stash`）。

若不想切分支，只想撤销本功能提交：

```powershell
git log --oneline -5                    # 找到 feat 分支上的转盘提交
git revert --no-edit <commit-sha>       # 生成一个反向提交，保留历史
```

## 2. 运行时回滚（不切代码，先看效果）

| 开关 | 行为 |
|---|---|
| `?motion=off` | reduced motion：索引步进 0 ms 瞬跳，无 180 ms 转动（保留固定读数器与颜色） |
| `?static=1` | 停 rAF 时钟，仅 `window.__engine.tick()` 推进（截图/回归用） |
| `?noauto=1` | 不自动开始模拟器，等待注入 |

```bash
npm run dev
# http://127.0.0.1:5173/?motion=off
```

## 3. 文件级回滚（脚本，可先 dry-run）

```powershell
node scripts/rollback-event-dial.mjs --dry-run     # 只打印将执行的操作
node scripts/rollback-event-dial.mjs --yes         # 真正执行
```

脚本行为：

1. 校验当前 git 仓库与 tag `pre-dynamic-dial` 存在；
2. 用 `git restore --source=pre-dynamic-dial` 恢复上表中的修改文件；
3. 删除本轮新增文件（源码/脚本/文档；不删 `review/event-dial/` 证据）；
4. 打印后续验证命令。

等价的纯 git 命令：

```powershell
git restore --source=pre-dynamic-dial -- `
  src/engine/modes/loom/atelier/eventDial.ts `
  src/engine/modes/loom/atelier/integration.ts `
  src/engine/modes/loom/atelier/assembly.ts `
  src/engine/modes/loom/scene.ts `
  src/engine/modes/loom/index.ts `
  scripts/review-precision.mjs `
  package.json README.md
Remove-Item src/engine/modes/loom/atelier/dialGeometry.ts,
  src/engine/modes/loom/atelier/dialModel.ts,
  src/engine/modes/loom/atelier/toolPalette.ts,
  scripts/test-dial.mjs, scripts/review-event-dial.mjs,
  scripts/shot-dial-motion.mjs -ErrorAction SilentlyContinue
```

## 4. 备份副本回滚（git 仓库损坏/被清理时）

预改动副本目录结构与本仓库一致：

```powershell
$bak = 'D:\workspace\gamified-flow\backup\event-dial-prechange-20261116-205157'
Copy-Item "$bak\src\engine\modes\loom\atelier\eventDial.ts" `
  'src\engine\modes\loom\atelier\eventDial.ts' -Force
# 其余修改文件同理；然后删除本轮新增文件
```

## 5. 回滚后的验收

```powershell
npm run build
npm test
npm run dev     # 静态版：转盘不转、读数窗为 40° 处的倾斜读数头窗口
```

预期：`scene.dial` 不再有 `pushEvent/update` 的遥测；`window.__engine.getModeTelemetry().dial`
为空（旧版 LoomMode.telemetry 没有 dial 字段）；画面回到 `b15dd9a` 的静态事件刻度机构。

## 6. 本轮验证记录（回滚前）

- `npm test`：mechanism + dial model 全绿。
- `npm run review:dial`：11 个确定性状态断言通过，0 浏览器错误。
- 证据：`review/event-dial/`（idle/arming/moving/hold/合并/过期/12 连发/2× 细节/JSON）。
- 逐帧动效：`review/event-dial/motion/contact-sheet.png`。
