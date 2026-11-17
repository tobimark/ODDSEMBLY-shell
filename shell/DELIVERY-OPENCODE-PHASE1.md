# ODDSEMBLY × OpenCode 第一阶段交付

> 目标：把 ODDSEMBLY 从「静态复刻 + 假数据」变成**由真实 OpenCode 会话驱动的工作台**，同时保留现有视觉设计、不动 Loom 动画。
> 状态：**已完成**。验收在真实会话上跑通 **28/28 断言**，全程 300 帧录屏。

---

## 0. 现在能做什么

打开 `http://127.0.0.1:5180/`（桥接与 Vite 都在跑时）：

1. 在右下角输入任务并回车 → OpenCode 真实执行；
2. 助手文字**逐字流式**出现；工具调用进入「工具流」卡；
3. 顶部 `调用 / 工具 / 文件 / 改动 / 思考 / 输出`、卡②「调用率 / 15 秒」、卡③「Token 流速」、卡④「后台进程」**随真实执行变化**；
4. 执行中按钮变成**停止**，点击即中断（会话状态留下 `interrupted` 与 `Step interrupted`）；
5. 需要授权时（例如读取 `.env`）输入框上方出现**权限卡片**，允许一次 / 总是允许 / 拒绝，agent 不会卡死；
6. 点会话行可切换/新建会话，指标随会话切换且**不串会话、不重复计数**；
7. 桥接重启（模拟断线）后界面显示重连并**全量重同步**，工具调用数不变（实测 6 → 6）。

**Loom 未被本阶段修改一行代码**，动画仍冻结。

---

## 1. 交付物

| 交付物 | 位置 | 说明 |
|---|---|---|
| 演示录屏 | [`tools/demo/out/demo.gif`](tools/demo/out/demo.gif) | 219 帧 / 960px / 7fps，真实浏览器录屏（`Page.startScreencast`），非后期合成 |
| 界面截图（18 张） | [`tools/demo/out/shots/`](tools/demo/out/shots/) | 2906×1730（1453×865 @DSF2），每步一张 |
| 验收断言表 | [`tools/demo/out/ASSERTIONS.md`](tools/demo/out/ASSERTIONS.md) | 28 条，含每条的实测值 |
| 运行记录 | [`tools/demo/out/report.json`](tools/demo/out/report.json) | 每步时间、快照证据、UI/DOM 对照 |
| **数据口径说明** | [`docs/OPENCODE-WORKBENCH-CONTRACT.md`](docs/OPENCODE-WORKBENCH-CONTRACT.md) | §3 指标口径、§4 去重与归属、§2 API、§5 权限、§6 键盘隔离、§7 Game View 接口 |
| 桥接服务说明 | [`server/README.md`](server/README.md) | 运行、环境变量、路由、口径、已知缺口 |
| 修改文件清单 | 本文 §4 | 21 个文件（5 新增目录级模块 + 4 区域改造 + 工具链） |

---

## 2. 怎么运行

```powershell
cd D:\workspace\gamified-flow\kunlun-shell

# 终端 A：桥接（唯一数据源；凭据只在这里被读取）
$env:BRIDGE_PROJECT_DIR = "D:\workspace\gamified-flow\.tmp\demo-project"
$env:BRIDGE_MODEL       = "opencode/deepseek-v4.1-flash-free"
npm run bridge            # http://127.0.0.1:8788

# 终端 B：界面（/api 代理到 :8788）
npm run dev               # http://127.0.0.1:5180
```

- 复跑验收 + 录屏：`node tools/demo/demo.mjs --manage-bridge`（自己启停桥接，含断线重连测试），再 `python tools/demo/gif.py`。
- 单张截图：`node tools/demo/shot.mjs out.png`；控制台/网络体检：`node tools/demo/inspect.mjs`。
- 生产构建：`npm run build` → `✓ 43 modules transformed`，`dist/assets/index-*.js 471.60 kB (gzip 140.71 kB)`。

OpenCode 服务地址与密码自动从 `%USERPROFILE%\.local\state\opencode\service.json` 读取（Basic 用户名固定 `opencode`），可用 `OPENCODE_URL` / `OPENCODE_PASSWORD` 覆盖；**密码永远不会出现在浏览器、快照或日志里**。

---

## 3. 架构：为什么没有"再写一个 agent"

```
┌────────────┐   HTTP Basic + SSE    ┌──────────────────────┐    /api/* 同源     ┌────────────────────┐
│ OpenCode   │◀─────────────────────▶│ ODDSEMBLY bridge     │◀──────────────────▶│ kunlun-shell (UI)  │
│ :19474     │  REST + /api/event    │ :8788  (Node 22 ESM) │  快照 / 命令        │ React 只读快照      │
│ 真实执行    │                       │ 唯一计算点            │                    │ 不碰凭据/不直连      │
└────────────┘                       └──────────────────────┘                    └────────────────────┘
```

三条设计原则（也是这次能"数字可信"的原因）：

1. **单一口径**：所有指标只在 `server/metrics.mjs` 算一次；前端只格式化渲染，不做第二套计算。验收里专门有一条断言直接对比 DOM 与快照（`dom=3 snap=3`、`dom=333 snap=333`）。
2. **凭据不出服务端**：Basic 认证只发生在 Node 进程内；浏览器只看到 `/api/*` 的 JSON/SSE。
3. **快照替换而非增量**：每帧是完整 `WorkbenchSnapshot` 且 `version` 单调；前端丢弃旧版本。断线/重连时桥接**全量重同步**（会话列表 + 消息 + `session/stats`），工具调用按 OpenCode `call_*` id 去重 —— 因此重连不可能重复累加（实测 6 → 6）。

---

## 4. 修改文件清单

### 新增：桥接服务（5 个文件，零依赖、无构建）
| 文件 | 作用 |
|---|---|
| `server/index.mjs` | HTTP :8788、9 条路由、浏览器 SSE（完整快照、≤10Hz 合并、心跳、`retry:1000`）、优雅退出 |
| `server/opencode.mjs` | OpenCode v2 客户端：凭据发现、Basic、超时、错误脱敏、`/api/event` 流式订阅（指数退避 + 45s 停滞看门狗）、`modelRef()` |
| `server/store.mjs` | 状态/去重/会话切换/全量重同步/快照构建（上限 50/120/200/12、文本 4000、detail 160、`version` 单调） |
| `server/metrics.mjs` | 纯函数口径（唯一计算点；`memoryMB` 恒 `null` + `unavailable`） |
| `server/README.md` | 运行、环境变量、路由、口径、缺口 |

### 新增：前端数据层（4 个文件）
| 文件 | 作用 |
|---|---|
| `src/data/types.ts` | `WorkbenchSnapshot` 等契约类型（前后端唯一形状，另有 `GameViewToolEvent`） |
| `src/data/store.tsx` | 单例 store：`EventSource` 订阅、版本丢弃、轮询兜底、命令方法、`useWorkbench/useNow` |
| `src/data/client.ts` | `/api/*` 命令封装 |
| `src/data/format.ts` | 宽度安全格式化（`compactCount`、`formatTokPerSec`、`relativeTime`、`truncateMiddle`…） |

### 改造：界面区域（保留测量几何与配色）
| 文件 | 改动 |
|---|---|
| `src/regions/Cards.tsx` | HUD 7 项 + 四张卡接真实数据；卡②计数+30 桶柱图；卡①工具流 3 行滚动；卡④后台进程；`data-metric` / `data-testid` 钩子 |
| `src/regions/AgentPanel.tsx` | 真实输入框（Enter/Shift+Enter/**IME 守卫**）、流式消息列表（按 message id 就地更新）、会话下拉、停止/发送双态、权限卡片、诚实降级横幅 |
| `src/regions/Sidebar.tsx` | 项目名/路径来自 `projectDirectory`；三枚徽章 = 会话时长 / tokens / 调用数 |
| `src/regions/NavBar.tsx` | 项目名 = 目录 basename（未知回落 `test`） |
| `src/App.tsx` | 仅新增 `WorkbenchProvider` 包裹（布局与区域顺序未变） |
| `vite.config.ts` | `/api` 代理到 :8788（含 SSE，超时关闭） |
| `package.json` | 新增 `bridge` / `demo` 脚本 |

### 新增：文档与工具链
| 文件 | 作用 |
|---|---|
| `docs/OPENCODE-WORKBENCH-CONTRACT.md` | 契约 + **数据口径**（本阶段验收依据） |
| `tools/demo/cdp.mjs` | 零依赖 CDP 驱动（Node 22 全局 `WebSocket`） |
| `tools/demo/demo.mjs` | 验收/录屏脚本：驱动真实 UI、切会话、停执行、过权限、断线重连、键盘隔离 |
| `tools/demo/inspect.mjs` | 控制台/网络/异常体检 |
| `tools/demo/shot.mjs` | CDP 截图（替代会挂住的 `--screenshot`） |
| `tools/demo/gif.py` | 帧序列 → GIF（去重、缩放、调色板量化） |

---

## 5. 数据口径（摘要，完整见契约 §3）

| HUD / 卡 | 口径 | 来源 |
|---|---|---|
| `AGENT` | 活动会话的**子会话数**（subagent） | `/api/session` |
| `工具` | 不同工具名数 | 工具调用集 |
| `调用` | **不同 `call_*` id 数**（天然去重） | 工具调用集 |
| `文件` | 工具入参中 `path/filePath/file_path/notebookPath` 去重数 | 工具调用集 |
| `改动` | 归一化为 Write/Edit 的调用数 | 工具调用集 |
| `思考` / `输出` | 会话累计 `tokens.reasoning` / `tokens.output`（**只赋值累计值，绝不相加**） | `usage.updated` / `Session.Info` |
| 卡① 工具流 | 最近调用（名称/摘要/状态/耗时/相对时间），3 行可见可滚动 | 工具调用集 |
| 卡② 调用率 | **开始时间**落在最近 15 000 ms 的调用数；30 个 1 秒桶画柱图；无调用时如实显示 `0 次 · 最近 15 秒无调用`，**不画假柱子** | 墙钟 |
| 卡③ Token 流速 | 数字：**最近 8 s 窗口**输出速率（累计 output 差分 ÷ 8 s）。曲线：同一速率 4 Hz 采样，画满整张卡（x 2→172 / y 22→138），细蓝描线 + 柔光 + 淡填充，读数压在曲线上；无数据不画。形态依据 `r3-tokenflow/` 对原版的真实录制 | 累计 output 差分 |
| 卡③ 内存 | **不可得** → 恒 `—`（OpenCode 无进程 RSS 接口） | `unavailable` |
| 卡④ 后台进程 | 运行中的 shell（本机范围，带 pid/命令/耗时）+ 活动会话的 job（shell/subagent/image），按 `kind` 区分 | `/api/shell`、`/api/experimental/job` |

**诚实性规则**：算不出来的键写入 `metrics.unavailable`（当前恒含 `memoryMB`），UI 只显示 `—`，绝不用虚构值填充。

---

## 6. 验收（真实会话，非 Mock）

复跑命令 `node tools/demo/demo.mjs --manage-bridge` 的实测结果（时间戳为 UTC）：

| # | 断言 | 结果 | 实测 |
|---|---|---|---|
| 1–2 | 桥接健康 / OpenCode 可达 | PASS | `opencode:"ok" stream:"connected"` |
| 3 | UI 新建真实会话 | PASS | `ses_e182a1cd… → ses_e1825221…` |
| 4–5 | 输入并开始执行 | PASS | 116 字符，`busy=true` |
| 6 | 工具调用入库 | PASS | 3 个：`shell, write, read` |
| 7 | HUD 计数真实 | PASS | `tools:3 calls:3 files:2 edits:1 think:165 output:333` |
| 8–9 | Token / 调用率真实 | PASS | `total=43826`，`rate15s=3` |
| 10 | 内存如实不可得 | PASS | `memoryMB=null` |
| 11 | 工具流有摘要 | PASS | `node -e "console.log('loom-ok')"` |
| 12–14 | **UI 与快照一致** | PASS | `dom=3/3/333` 对应 `snap=3/3/333` |
| 15 | 卡②与快照一致 | PASS | `"调用率 / 15 秒 3 次"` |
| 16 | 聊天渲染真实消息 | PASS | 5 行 |
| 17–18 | 后台进程可见 | PASS | `node -e "setTimeout(...45000)"`，1 行 |
| 19–20 | 停止生效且留痕 | PASS | `busy=false`，`outcome=interrupted`，`Step interrupted` |
| 21–23 | 权限全链路 | PASS | `read .env` → 卡片渲染 → 允许一次 → 清空并继续 |
| 24 | 会话切换 | PASS | 切到旧会话并切回，指标随之变化 |
| 25–26 | 重连不重复计数 | PASS | 工具调用 `before=6 after=6`，`stream=connected` |
| 27–28 | 键盘隔离 | PASS | 输入框保留 `1 2 3 m space test`；`window.__engine/__loom` 均不存在 |

汇总：**28/28 通过**（[ASSERTIONS.md](tools/demo/out/ASSERTIONS.md)）。

---

## 7. 已知问题与限制（如实）

1. **侧栏文件树仍是设计复刻的静态内容**（蜂群/排行榜同理）。本轮按"不重做 UI"未接数据；下一阶段可用 `GET /api/fs/list` 只读绑定。项目名、路径、徽章已经是真实值。
2. **进程内存不可得**：OpenCode 不暴露 RSS（唯一接口是会暂停服务的 heap dump），因此卡③固定 `— MB`，并在 `unavailable` 登记。
3. **HUD 数值位宽只有 19.5 px**：3 位数字降到 11.5 px（实测字距 3 原生 px），≥4 位（如 `1.2k`）横向压缩到槽内；**精确值在 `title`** 里。这是"真实数据不能撑破设计"的折中，极端大数观感偏紧。
4. **shell 的 pid 有时缺失**（`shell.created` 不带 pid，靠重同步补齐）；pty `startedAt` 常缺。
5. **权限 `requestedAt`** 对"桥接启动前就存在"的请求等于首次观测时间（OpenCode 列表不带时间戳）。
6. **Game View 事件流的 id 每次桥接重启从 1 开始**：它是有损视觉投影，只给动画用；精确指标永远走 `/api/workbench`。
7. **模型不可在界面选择**（下拉是装饰）：新会话模型由 `BRIDGE_MODEL` 决定。原因很实际 —— 免费账号继承付费默认模型（`alibaba/qwen4-max`）会立刻 `403 provider.auth`，界面会如实显示该错误，但会话跑不起来。
8. **多行草稿**：输入框沿用冻结的 78 px 测量盒，2 行以上内部滚动，首行可能被裁约 7 px（修它要改测量盒，超出本轮范围）。
9. **聊天里的工具活动行只表示"最近活动"**，不归属到具体气泡（`ToolCallView` 无 messageID）；完整工具流在卡①。
10. **Loom**：本阶段未接入动画、未修改 `kunlun-loom/**`。工作树中仍有 6 个 Loom 视觉文件处于**他人未提交编辑状态**（11:37–11:39，`dialGeometry/finish/eventDial/assembly/integration/scene`），`:5173` 仍是 WIP 画面 —— 与本阶段无关，也未回滚，需要时 `git checkout -- src` 可回到 HEAD 的一致画面。

---

## 8. 为 Game View 预留的接口（本轮不联动）

`GET /api/gameview/events`（SSE）逐条推送：

```json
{"id":41,"type":"Bash","detail":"npm test","at":1794886015411}
```

- `type ∈ Read|Edit|Write|Bash|Search`，与 `kunlun-loom/src/engine/core/types.ts` 的 `ToolEvent` **完全同形**，接入是 drop-in；
- 视觉侧只消费这条流（可自由节流/合并），**执行与聊天反馈永不等待动画**；
- 必须注意：Loom 的 `bindKeyboard()` 目前直接绑 `window` 且无焦点守卫，挂载前要加守卫（本轮已验证输入框不受影响，因为 Loom 根本没加载）。

---

## 9. 下一步建议

1. 侧栏接 `fs/list`（只读）+ 文件点击插入 `@` 引用；
2. 模型选择器（`/api/model` + 会话模型 PATCH），把 `BRIDGE_MODEL` 变成默认值而非唯一值；
3. 上下文占用/成本展示（`contextUsed/contextLimit/cost` 已在快照里）；
4. Game View 挂载 + 焦点守卫 + 节流，先做"工具调用 → 一个 pick"的最小联通；
5. 多会话并行指标（当前是单活动会话模型）。
