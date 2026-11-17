# OpenCode → Loom 实时联动（LIVE WEAVE）

外部 OpenCode CLI/TUI 里发生的**真实工具调用**，实时驱动 Loom 现有的机械动画：
事件转盘、固定读数器、飞轮、梭子、经线与织物。没有预制动画、没有模拟事件，
也不需要人工点按。

- 适配层与机械绘制解耦：`src/live/*` 不认识 Pixi，也不认识 Loom；未来其他 Game View
  可以直接复用同一个事件源。
- Loom 的美术、色板、机械结构未改动；本轮只改事件入口、调度与分组语义。
- OpenCode 侧**只读**：`GET /api/event`（SSE）与 `GET /api/session/{id}/message`。
  不读 OpenCode 数据库，密码只存在于本地 bridge 进程，绝不进入浏览器。

---

## 1. 结构

```
 外部 OpenCode CLI / TUI
        │  同一个 server（后台服务或显式 --server）
        ▼
 GET /api/event  (SSE, HTTP Basic)          ← 只读
        │
 ┌──────┴─────────────────────────────────────────────┐
 │ scripts/opencode-loom-bridge.mjs   (本地 Node, 0 依赖)│
 │  · 按 tool-call id 去重 / 关联 start→success|failed  │
 │  · 原始工具名 → Read/Edit/Write/Bash/Search          │
 │  · 未识别工具：原样记账，绝不伪装                     │
 │  · 重连退避 / 断线 gap / 在途调用 resync             │
 │  · 权威账本：即使页面关着也照常计数                   │
 └──────┬─────────────────────────────────────────────┘
        │  ws://127.0.0.1:8787   （JSON，protocol v1）
        ▼
 ┌────────────────────────────────────────────────────┐
 │ 页面                                                 │
 │  src/live/feedClient.ts  重连 / callId 去重 / gap     │
 │  src/live/pacing.ts      视觉预算（唯一节奏来源）      │
 │  src/live/classify.ts    旧协议回退分类               │
 │  engine → LoomMode → LoomScene → Mechanism + EventDial│
 └────────────────────────────────────────────────────┘
```

浏览器只收到 `{callId, tool, cls, detail, status, at}`；没有凭据、没有原始
请求体、没有 OpenCode 内部数据。

---

## 2. 启动与连接

### 2.1 前置：一个 OpenCode server

多数情况下 OpenCode 的后台服务已经在跑：

```powershell
opencode service status          # 打印 http://127.0.0.1:<port>
```

没有的话自己起一个：

```powershell
opencode serve --port 4096 --hostname 127.0.0.1
```

### 2.2 启动 bridge

```powershell
cd kunlun-loom
npm run bridge:opencode            # 自动读取 %USERPROFILE%\.config\opencode\service.json
```

或显式指定：

```powershell
$env:OPENCODE_PASSWORD = '<server password>'
node scripts/opencode-loom-bridge.mjs --server=http://127.0.0.1:4096 --port=8787
```

看到下面三行即就绪：

```
[  0.1s] ODDSEMBLY bridge v1 on ws://127.0.0.1:8787
[  0.1s] OpenCode source: http://127.0.0.1:19474 (from service.json)
[  0.1s] event stream connected · http://127.0.0.1:19474
```

### 2.3 打开 Loom

```powershell
npm run dev        # http://127.0.0.1:5173/?mode=loom&live=ws://127.0.0.1:8787
```

或构建后预览（`npm run build` 然后 `node scripts/serve.mjs 4178`）：
`http://127.0.0.1:4178/?mode=loom&live=ws://127.0.0.1:8787`

页面右下角出现 `LIVE · CONNECTED · 调用 N` 即为真实模式。

### 2.4 让外部 CLI/TUI 连到同一个 server

```powershell
opencode --server http://127.0.0.1:19474                 # TUI
opencode run --server http://127.0.0.1:19474 "任务"       # 一次性
```

`--server` 是全局参数。**关键点：CLI/TUI 必须连到 bridge 订阅的那个 server**，
否则事件流里不会出现它的调用。用 `opencode service status` 确认端口；如果 TUI
自己起独立 server（`--standalone`），就把它换成上面的 `--server` 形式。

---

## 3. 工具分类

以 OpenCode v2.2.x 的内置工具名（实测 `read` / `glob` / `shell`，以及权限规则里的
`edit` / `grep`）为准，做**显式**映射：

| Loom | OpenCode 原始名 |
|---|---|
| `Read` | read, view, open, cat, readfile, notebookread |
| `Edit` | edit, multiedit, patch, applypatch, replace, notebookedit |
| `Write` | write, create, writefile, notebookwrite |
| `Bash` | shell, bash, run, execute, terminal, cmd, pwsh, powershell |
| `Search` | grep, glob, search, find, ripgrep, rg, ls, list, websearch, webfetch |

**未识别工具不伪装。** `task`、`todowrite`、`todoread`、`skill`、`question` 等
不属于这五类材质，桥接层会：

1. 以原始名字写进账本（`tool`、`callId`、时间、status）；
2. 在 `/health` 的 `unmappedTools`、页面的 `live.unmappedTools` 与
   `LIVE · … · 未识别 N` 中显式计数；
3. **不产生**任何 Read/Edit/Bash 之类的动画，也不进入五类计数。

这样可以审计"哪些调用没有被可视化"，而不是让它看起来像个文件读取。

> 验证状态：分类表与"未识别不得伪装"的规则由 `scripts/test-live-link.mjs` 覆盖
> （`task` / `todowrite` / `skill` → `null`，旧协议帧保留原始名字）。真实 `task`
> 调用的端到端验证脚本是 `node scripts/opencode-acceptance.mjs unmapped`；本机在
> 完成 A–E 后免费额度耗尽，该场景在运行时会打印明确的 SKIP 而不是假通过。

---

## 4. 状态关联与去重

一次调用只有一条逻辑记录，以 OpenCode 的 `session.tool.*.data.id`（tool call id）
为唯一键：

| SSE 事件 | 桥接层动作 |
|---|---|
| `session.tool.input.started` | `start`（**status = running，尚未成功**） |
| `session.tool.input.ended` / `caller` | 补全参数 → `detail` 更新（只影响文案） |
| `session.tool.success` | `success` |
| `session.tool.failed`（`error.type = aborted`） | `aborted` |
| `session.tool.failed`（其他） | `failed` |
| `session.execution.interrupted` | 兜底：该会话仍在 running 的调用标记 `aborted` |

- 同一 id 的重复 `start` 被丢弃；同一 id 的重复终态被丢弃（`feedClient` 侧同样）。
- 动画在 `start` 就发生（"调用发生即可表现活动"），但读数器/状态行在收到
  `success` 之前绝不显示成功符号；失败显示 `✕`，中断显示 `⊘`。

---

## 5. 视觉调度（唯一节奏来源：`src/live/pacing.ts`）

参考机（CrommaCode Loom）是"一调用一次织造、静止时完全不动"，尾巴 2–3 s 内归零。
本实现保留 KunlunMeta 放大的 1.65 s 投梭，但给它加了**有界预算**：

| 规则 | 值 |
|---|---|
| 一次调用的完整机械循环 | 1.65 s（`PICK_BASE_SECONDS`） |
| 机械队列上限 | 3 组（`MAX_PENDING_GROUPS`） |
| 投梭开始时队列 1 组 | 全速 1.0×（`pickSecondsFor(1) === 1.65`） |
| 队列 2 / 3 / ≥4 | 0.85× / 0.6× / 0.5× |
| 超出上限 | `fold`：不占队列，折进正在进行的投梭 |

`fold` 不是丢弃：事件在任何折叠判断之前已经进入引擎（`bus` 计数 + 转盘分组），
只是不再为它单独织一行。因此：

- **真实次数永远精确**：`status.counts`、账本、转盘 `×N` 都以真实调用为准；
- 机械上 `PICKS + folded == 调用数`，可自证没有丢事件；
- 队列上界 3，爆发结束后 2–4 s 内必然静止，不会"Agent 早完成、织机还在织"。

转盘的 12 槽 / 30° 步进、固定读数器、同工具 `×N`、颜色与美学均保持原样；
仅把"同工具分组"的生命周期与"卡片显示"分开（详见 `docs/EVENT_DIAL.md`）：
卡片 2 s 后消失，但分组保留 12 s，所以真实 Agent 跨模型步的两次 `read`
仍然是同一个槽位上的 `×2`。

---

## 6. 断线恢复

- 上游 SSE 断开 → 指数退避重连（0.4 s → 8 s，带抖动），页面收到 `reconnecting`；
- 重连成功 → 先 `reconnected`，再发 `gap`（`missed: partial|unknown`）；
- 对**在途调用**（断线时仍 running）做有界 resync：读最近 6 条 message，
  把已有结果的调用补终态、把没见过的调用标 `recovered`；
- 已经处理过的 `callId` 永不重播（页面与桥接层双重去重）；
- 服务端也查不到的调用标 `aborted · unrecoverable after reconnect`，
  **不伪装成完整回放**。

---

## 7. 真实模式保护

页面一旦配置了 `?live=`：

- `engine.trigger()` 直接返回 —— 键盘 `1–5`、底栏工具按钮、`window.__loom.trigger`
  都不会产生事件；
- 模拟器停止，`play()` 不再启动模拟；autoplay 在初始化阶段就被跳过；
- 桥接层 `POST /event` 默认 **403**，只有 `--allow-inject`（测试模式）才接受合成事件；
- 页面底部 `LIVE · …` 行显示链路状态与真实计数，方便核对。

---

## 8. 验收结果

由 `node scripts/opencode-acceptance.mjs` 驱动真实 CLI 与真实页面（CDP 读引擎遥测），
不使用任何手写事件。最近一次全量运行：**32/32 通过**。

| 场景 | 真实操作 | 结果 |
|---|---|---|
| A 最小序列 | 一次 CLI 回合：read → shell → shell → edit | 观察到 `Read → Bash → Bash → Edit`；4 次调用 4 次投梭；转盘 3 组 = 90°；两段 shell 落在同一槽 `×2`；读数器/转盘/计数一致；结束静止 |
| B 同工具 ×2 | 一次 CLI 回合内两次 `read`（间隔 2.4 s，超过卡片 2 s） | 读数器 `Read ×2`，转盘只走 1 格 / 30°，计数 Read=2 不丢失 |
| C 高频 | 一次 CLI 回合内 **18 次**真实 shell 调用 | 队列峰值 3（≤ 上限）；14 次折叠、4 次完整投梭；18 次全部计数；`picks + folded = 18`；最后一次调用后约 3 s 内回到静止 |
| D 失败 / 中断 | 读取不存在的文件；随后长命令被 `POST /interrupt` | 失败记 `failed`、中断记 `aborted`，success 增量 0；机械回到静止，无重复播放 |
| E 断线恢复 | 长命令执行中 `POST /admin/drop` 断流 | 检测到断流→退避重连→`gap` 上报；已处理 `callId` 无重播；恢复后继续接收；结束静止 |
| F 未识别工具（可选） | `task`（子代理）| 记入账本、页面 `未识别` 计数、保留原始名字、不给它任何 Loom 类别或槽位；`node scripts/opencode-acceptance.mjs unmapped`。本机跑完 A–E 后免费额度耗尽，运行时打印 SKIP |

证据：`.tmp/accept-*.json`（每次场景的引擎遥测快照）、`.tmp/accept-final.json`
（最终快照 + 完整账本）、`shots/live-<scenario>.png`（场景结束时的画面）、
`scripts/../.tmp/live-bridge.log`（桥接层逐调用日志）。

---

## 9. 录屏

同一束真实运行的两个"面"被合成到一条时间轴上（不是桌面抓屏，避免把无关窗口录进去）：

```powershell
node scripts/capture-live-demo.mjs     # 真实 CLI 输出逐行 + 真实 Loom 页面 CDP 截帧
python scripts/compose-live-demo.py    # 左侧终端转录 / 右侧织机帧，按同一时钟合成
```

- 左：`opencode run` 的真实 stdout/stderr（逐行到达时间）；
- 右：同一次运行中 Loom 页面的真实渲染帧（`Page.startScreencast`）；
- 音轨：无。

依次执行三组真实任务：`read / shell / shell / edit`、两次 `read`、10 次 `shell`。
产物：`shots/opencode-loom-live.mp4`（约 55 s）。合成脚本见
`scripts/compose-live-demo.py`，所有输入留在 `.tmp/demo-session.json`。

---

## 10. 修改文件清单

新增：

| 文件 | 作用 |
|---|---|
| `scripts/opencode-loom-bridge.mjs` | OpenCode SSE → WS 桥接、分类、去重、账本、重连/resync |
| `src/live/protocol.ts` | 桥接层 ↔ 页面的消息与状态类型 |
| `src/live/classify.ts` | 页面侧分类回退（旧协议）+ 未识别规则 |
| `src/live/feedClient.ts` | 重连、callId 去重、gap 处理 |
| `src/live/pacing.ts` | 视觉预算（队列上限 / 变速 / 折叠判定） |
| `scripts/test-live-link.mjs` | 适配层契约测试（去重/重连/gap/兼容） |
| `scripts/opencode-acceptance.mjs` | 真实 CLI + 真实页面的验收脚本 |
| `scripts/capture-live-demo.mjs` | 录屏素材：真实 CLI 输出 + Loom CDP 截帧 |
| `scripts/compose-live-demo.py` | 把两侧按同一时钟合成 mp4 |
| `docs/OPENCODE_LIVE.md` | 本文 |

修改：

| 文件 | 改动 |
|---|---|
| `src/engine/core/engine.ts` | `?live=` 接入、真实模式、视觉调度、live 快照、`inject(e, opts)` |
| `src/engine/core/types.ts` | `TriggerOptions`、`EngineStatus.live` |
| `src/engine/core/mode.ts` | `trigger(e, opts?)` |
| `src/engine/modes/loom/index.ts` / `scene.ts` | 传递触发选项；转盘始终收到调用 |
| `src/engine/modes/loom/atelier/mechanism.ts` | 有界队列、`fold`、按积压变速 |
| `src/engine/modes/loom/atelier/dialModel.ts` | 分组与卡片分离（`groupTimeoutMs`） |
| `src/App.tsx` | `?live=`、真实模式禁用合成触发、`LIVE` 状态行、`window.__loom.live()` |
| `docs/EVENT_DIAL.md` | 分组语义 |
| `scripts/test-mechanism.mjs` / `test-dial.mjs` | 折叠/变速/跨卡片生命周期聚合的新契约 |
| `package.json` | `bridge:opencode` / `accept:live` / 测试链 |

---

## 11. 已知限制

1. **必须连同一个 server。** bridge 订阅哪个 OpenCode server，就只看得见连到它的
   TUI/CLI。用 `--standalone` 起独立 server 的客户端不会被自动发现。
2. **SSE 是易失的。** 断线期间的事件无法从事件流补回；resync 只覆盖"断线时仍在
    running"的调用（读最近 6 条 message）。其余情况显式上报 `gap`，不假装完整。
3. **`/api/session/{id}/message` 是恢复用接口**，不是数据库读取；不解析 OpenCode
   的 SQLite。
4. **只认五类材质。** `task` / `todowrite` 等按设计不映射，虽被记账但不会驱动机械
   动画——这是刻意的，避免"看起来像 Read"。
5. **高频折叠**时 `PICKS < 调用数`（`PICKS + folded == 调用数`）。这是视觉摘要，
   不是统计；真实计数与账本始终精确。
6. **Bridge 无鉴权**（仅监听回环）。不要把 8787 暴露到网络。
7. **Windows 优先。** 脚本按 Windows（pwsh / Edge / gdigrab）编写；SSE 与页面逻辑
   本身与平台无关。
8. 画面仍是 KunlunMeta 的程序化复刻，不是参考机的像素级复制；本轮以参考机的
   **行为**（逐调用一次织造、静止归零、2–3 s 收敛）为对标基准。
9. **验收依赖 OpenCode 的可用额度。** A–E 全部用免费模型真实执行；额度用尽后
   `unmapped` 场景会打印 SKIP。换一个可用 provider 后可直接重跑，无需改代码。
