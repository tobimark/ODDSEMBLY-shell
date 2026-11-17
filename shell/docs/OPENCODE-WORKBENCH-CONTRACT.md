# ODDSEMBLY × OpenCode 工作台契约（第一阶段）

本文是**实现契约**，也是交付要求里的**数据口径说明**。所有数字只有一处计算点：`server/`。前端只渲染快照里的值，不再做第二套计算。

```
┌────────────┐   HTTP Basic   ┌──────────────────────┐   /api/*  same origin   ┌───────────────────────┐
│ OpenCode   │◀──────────────▶│ ODDSEMBLY bridge     │◀───────────────────────▶│ kunlun-shell (browser)│
│ :19474     │  REST + SSE    │ server/index.mjs     │   snapshot / commands   │ React 只读快照          │
│ (managed)  │  /api/event    │ :8788                │                         │ 绝不接触凭据/OpenCode    │
└────────────┘                └──────────────────────┘                         └───────────────────────┘
```

## 1. 进程与端口

| 进程 | 端口 | 作用 | 凭据 |
|---|---|---|---|
| OpenCode managed service | `127.0.0.1:19474` | 真实会话/工具/进程/事件 | 由 OpenCode 自己管理 |
| ODDSEMBLY bridge | `127.0.0.1:8788`（`BRIDGE_PORT` 可覆盖） | 唯一数据源；把 OpenCode 事实归一化为 `WorkbenchSnapshot`，并向前端提供命令 | 仅服务端读取 `~/.local/state/opencode/service.json`，**不下发浏览器** |
| Vite（shell） | `127.0.0.1:5180` | UI；`/api/*` 代理到 8788 | 无 |

启动：`npm run bridge`（一个终端）+ `npm run dev`（另一个终端）。

## 2. 桥接 API（浏览器可见）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | `{opencode, stream, bridge, resyncing}`，不含任何凭据 |
| GET | `/api/workbench` | 全量 `WorkbenchSnapshot`（`src/data/types.ts`） |
| GET | `/api/fs/list?path=` | 活动会话目录下的一级列表：`{directory,path,entries:[{path,type}]}`；`path` 只接受相对路径，绝对路径/`..` 一律 400；返回的 `path` 已统一为 `a/b`（正斜杠、无尾分隔符） |
| GET | `/api/fs/find?query=&limit=` | 全工作区按文件名搜索（`@` 弹层用），只返回文件 |
| GET | `/api/events` | SSE，每帧为一个**完整快照**（合并到 ≤10 Hz）；`retry:` 与心跳注释 |
| POST | `/api/prompt` | `{text, sessionID?, files?}` → 转发 `POST /api/session/{id}/prompt`；`files` 为 `PromptInput.FileAttachment`（`uri` 必须是 `file:///…`，OpenCode 会拒绝裸相对路径） |
| POST | `/api/interrupt` | `{sessionID?}` → `interrupted:boolean` |
| POST | `/api/session/select` | `{sessionID}` 切换活动会话并全量重同步 |
| POST | `/api/session/create` | `{title?, model?}` 新建会话并切换；`model` 缺省用 `BRIDGE_MODEL` |
| POST | `/api/session/model` | `{sessionID?, model:{providerID,id}}` → `POST /api/session/{id}/model`；切的是**真实会话模型** |
| PATCH | `/api/session` | `{sessionID?, title}` → `PATCH /api/session/{id}`；重命名 |
| DELETE | `/api/session/{id}` | 删除会话（OpenCode 会连同子会话一起删）；若删的是活动会话，桥接自动切到最近更新的幸存会话 |
| GET | `/api/models` | 真实模型目录（按 provider 分组）：`{providers:[{id,models:[{id,name,context}]}], current}` |
| GET | `/api/agents` | 可选主 agent（过滤 `hidden` 与 `mode:"subagent"`）：`{agents:[{id,name,description}], current}` |
| POST | `/api/session/agent` | `{sessionID?, agent}` → `POST /api/session/{id}/agent`；切的是**真实会话 agent**（`build` / `plan` …） |
| GET | `/api/commands` | agent 上报的命令（`init` / `review` / `goal` / MCP `rea:*` …）：`{commands:[{name,description}], directory}` |
| GET | `/api/file?path=` | 单个文件给预览：`{path,size,kind:'text'|'image'|'pdf'|'binary'|'too-large',mime,text?,base64?,truncated,lines?}`；文本取前 4 MiB 并标记 `truncated` |
| GET | `/api/projects` | **用户添加的**项目列表 + 当前活动目录：`{current,projects:[{path,name,addedAt,lastUsedAt,exists,current}]}` |
| POST | `/api/projects` | `{path}`：校验绝对路径且目录存在 → 只加入列表（不切换） |
| POST | `/api/project/select` | `{path}`：切到该项目最近会话；没有会话就用 `location.directory` 新建 |
| POST | `/api/projects/remove` | `{path}`：从列表移除（**不动磁盘**，也不删会话） || POST | `/api/command` | `{sessionID?, name, text?, files?}` → `POST /api/session/{id}/command`（204，回合走正常事件流） |
| POST | `/api/permission/{id}/respond` | `{decision:'once'\|'always'\|'reject'}` |
| GET | `/api/gameview/events` | **未来 Game View 接口**：SSE 推送 `{id,type,detail,at}`（与 Loom `ToolEvent` 同形）。本轮无消费者 |

快照永远是**替换**而非增量：前端 `apply()` 丢弃 `version` 更小的帧，因此断线重连不会回退或重复累加。

### 2.1 三个配置项（都可选）

| 环境变量 | 默认 | 作用 |
|---|---|---|
| `BRIDGE_PORT` | `8788` | 桥接端口 |
| `BRIDGE_PROJECT_DIR` | 启动目录 | 新会话的 `location.directory`；启动时据此挑选活动会话；`snapshot.projectDirectory` 来源 |
| `BRIDGE_MODEL` | `opencode/deepseek-v4.1-flash-free` | 新会话使用的模型。**必须显式**：免费账号继承付费默认模型会直接 `403 provider.auth`（实测 `alibaba/qwen4-max`），会话创建成功但根本跑不起来 |

## 3. 指标口径（唯一口径）

| HUD / 卡片 | 字段 | 口径（精确规则） | 来源 |
|---|---|---|---|
| `AGENT` | `counts.agents` | 活动会话的**子会话数**（`parentID` 指向它），即 subagent 数。不是“正在跑的 agent 进程数” | `GET /api/session` |
| `工具` | `counts.tools` | 活动会话内**不同工具名**的个数（`bash`/`read`/`edit`/`write`/`grep`…，按原样小写名去重） | 工具调用集合 |
| `调用` | `counts.calls` | **不同 tool call id** 的个数（OpenCode 的 `call_*`，天然去重；`input.started` 与 `called` 是同一 id，不重复计） | 工具调用集合 |
| `文件` | `counts.files` | 工具入参中 `path`/`filePath`/`file_path`/`notebookPath`/`notebook_path` 的**去重路径集**大小（`pattern`/`query` 不算文件） | 工具调用集合 |
| `改动` | `counts.edits` | 归一化 `kind ∈ {Write, Edit}` 的**调用次数**（`edit`/`write`/`patch`/`multiedit`/`apply_patch` 等别名归一） | 工具调用集合 |
| `思考` | `counts.think` | 会话累计 `tokens.reasoning`（OpenCode 的权威累计值；非推理模型为 0） | `usage.updated` / `Session.Info.tokens` |
| `输出` | `counts.output` | 会话累计 `tokens.output` | 同上 |
| 卡① `工具流` | `toolCalls[]` | 最近工具调用列表（名称 + 摘要 + 状态 + 相对时间 + 耗时），按开始时间倒序取前 40。空态分两种：有消息但无调用 → `本会话尚无工具调用`；无会话 → `等待工具调用`。每条另带 `messageID`（归属的助手消息）与 `output`（工具文本结果前 1 200 字符） | 工具调用集合 + message tool part |
| 卡② `调用率 / 15 秒` | `rate15s` / `rateSeries` | 滑动窗口：**开始时间**落在最近 15 000 ms 内的调用数（整数）；`rateSeries` 为最近 30 个 1 秒桶的计数，用于柱图。墙钟，不是引擎时间 | 工具调用开始时间 |
| 卡③ `Token 流速` | `tokPerSec` + `tokSeries` | 派生量：**最近 8 s 窗口速率** =（当前累计 output − 8 s 前累计 output）÷ 8 s，只对累计值做差、不累加；曲线 = 同一速率按 4 Hz 采样的 30 s 轨迹，**画满整张卡**（x 2→172、y 22→138），细蓝描线 + 柔光 + 淡填充，读数压在曲线之上，无数据时不画。依据：`r3-tokenflow/` 对原版 `cromma-bees.exe` 的真实录制（52.3 tok/s → 8.58 K tok/s）显示原版就是流动描线形态 | 累计 `tokens.output` 差分 |
| 卡③ 内存 | `memoryMB: null` | **不可得**：OpenCode 不暴露进程 RSS（唯一内存接口是 server 堆转储且会暂停服务）。UI 固定显示 `—`，并在 `unavailable` 里登记 | — |
| 卡④ `后台进程` | `processes[]` | `GET /api/shell` 中 `status==='running'` 的 shell（本机范围，带 pid/命令/耗时）+ `GET /api/experimental/job` 中属于活动会话的 job（shell/subagent/image）。空则显示“没有后台进程” | shell / job / pty |
| 上下文 | `contextWindowUsed/contextLimit` | **最近一步**进入模型的 token（`step.ended.tokens.input + cache.read`）vs 当前模型 `limit.context`。`contextUsed` 是会话累计值，会超过上限，**不得**用来算百分比 | 模型目录 + step.ended / message.tokens |
| 成本 | `cost` | OpenCode `cost`（免费模型恒 0）；本轮**不展示**，避免误导 | `Session.Info.cost` |

**诚实性规则**：`metrics.unavailable` 明确列出无法获取的键（当前恒含 `memoryMB`）。UI 对这些键只显示 `—` 或说明，绝不补数。

## 4. 去重与归属（避免“数字在动但不对”）

1. **工具调用**：唯一键 = OpenCode `call id`。全量重同步用 `GET /api/session/{id}/message` 的 `tool` part 重建；实时路径只应用**未见过的 id**，因此 SSE 重放/重连不会重复计数。
2. **Token**：只接受**累计值**（`usage.updated{tokens}`、`Session.Info.tokens`）直接赋值；`step.ended.tokens` 仅用于计算 `tokPerSec` 的差分，**不累加到总数**。重同步后再以会话累计值为准，天然幂等。`tokPerSec` 的基线是**该步骤自己的** `step.started` 时间（不是上一步结束时间）——否则会话的**第一个步骤**没有前序样本，任何单步回合（例如只回一句「你好」）都会恒为 0。
3. **消息**：唯一键 = message id；流式文本按 `assistantMessageID` 就地更新，不追加新消息。
4. **会话切换**：`activeSessionId` 变化 → 清空该会话的派生窗口（`rateSeries`/`tokPerSec`）→ 用该会话的消息与统计重建；旧会话数据不参与新会话指标。
5. **后台进程**：shell 列表是**本机**范围（OpenCode 不给 shell 的 sessionID），job 列表按 `sessionID` 过滤——两类在 UI 上以 `kind` 区分，避免把别的会话的进程算进来。
6. **重连**：SSE `onerror` → 退避重连 + 全量重同步（`/api/session`、活动会话 messages、`session/stats`）；`health.stream` 如实显示 `connecting/reconnecting/connected`。

## 5. 权限

`permission.asked` 事件与 `GET /api/permission/request` 都进入 `permissions[]`；UI 在输入框上方以内联卡片展示 `action + resources`，提供 `允许一次 / 总是允许 / 拒绝`，回 `POST /api/session/{id}/permission/{requestID}/reply`。未决权限必须可见，否则真实工具会一直等待。

## 6. 输入与 Loom 快捷键隔离

- 本轮 `kunlun-shell` **不加载 Loom**，页面里不存在 `engine.bindKeyboard` 的 `window` 监听；输入框中的空格、数字键、`M` 均为普通输入。
- 未来把 Game View 挂进 `CanvasWell` 时，其键盘监听必须加焦点守卫（`event.target` 在输入框内则不处理，或只在 canvas 聚焦时绑定）；`/api/gameview/events` 已把事件契约固定为 `{id,type,detail,at}`，动画侧无需了解 OpenCode。

## 7. 未来 Game View 接入点（本轮不实现联动）

`GET /api/gameview/events`（SSE）逐条推送：

```json
{"id":41,"type":"Bash","detail":"npm test","at":1794886015411}
```

- `type` ∈ `Read|Edit|Write|Bash|Search`（与 `kunlun-loom/src/engine/core/types.ts` 的 `ToolEvent` 完全同形）；
- `id` 单调递增，`at` 为墙钟毫秒；
- 该流是**有损投影**（用于视觉），精确指标永远来自 `/api/workbench`，两者不互相污染；
- 视觉侧如需节流/合并，在本流的下游做，不反向影响执行。

## 8. 对话面板行为（本轮新增）

### 8.1 `@` 文件引用

- 在输入框里输入 `@`（或用输入框左下角的纸夹 / `@` 图标）会打开引用弹层；弹层数据来自 `GET /api/fs/find`（有查询词）或 `GET /api/fs/list`（空查询，列目录）。
- ↑/↓ 移动、Enter/Tab 插入、Esc 关闭；插入的是**纯文本** `@相对路径`，可继续编辑或删除。
- 弹层只列出 `type === 'file'` 的条目；目录不递归展开（需要时可先输入路径片段再搜）。

### 8.2 附件（`files[]`）

- 发送时从正文解析 `@token`，**只把弹层里出现过的路径**转成附件：`{uri:'file:///<会话目录>/<相对路径>', name}`；未知 token（`@someone`、邮箱）保持纯文本，不产生假的附件。
- `uri` 必须是 `file:///…`：OpenCode 对裸相对路径回 `400 Invalid attachment URI`（已实测）；`file:///` 会被接受并把文件内容内联为 base64 交给模型。
- 正文与 `files[]` 是**同一份事实**：用户在输入框看到什么，OpenCode 就收到什么。

### 8.3 消息渲染

- 助手正文走轻量 markdown：围栏代码、行内代码、粗体/斜体、标题、有序/无序列表、引用、分隔线；不注入 HTML，不支持链接跳转。
- 每条工具调用渲染在**它所属的消息**下面（`toolCalls[].messageID`），可点击展开 `output`（前 1 200 字符）；状态点/耗时/非 0 退出码直接可见。
- 只有"桥接启动后、重同步前观测到的调用"（无 `messageID`）才落到消息列表末尾的单行活动提示。
- 流式中未闭合的代码围栏按代码渲染到结尾，避免逐帧在"代码/散文"之间闪回。

### 8.4 模型选择与会话重命名

- **模型**：输入框底部的 `provider / model` 区域是一个按钮，打开真实模型目录（`GET /api/models`，当前 666 个可用条目 / 4 家 provider）。选择即调用 `POST /api/session/{id}/model`，成功后快照里的 `model` 与 `contextLimit` 一起更新。
- 目录**不做可用性预过滤**：所有条目在 OpenCode 侧都是 `active/enabled`，真正的 403（如 `provider.auth`）只会在调用时暴露。因此选择失败时弹层保留并显示 OpenCode 的原始原因，而不是静默回滚。
- **重命名**：会话菜单里有"重命名当前会话"，提交 `PATCH /api/session/{id}`；成功后才关闭菜单，失败在菜单内显示原因。
- 两者都走"乐观更新 + 重同步"：先改本地 raw 记录让界面立刻响应，再 `resync` 以服务端为准。
- **新建会话沿用当前模型**：`＋ 新建会话` 会把底栏显示的模型一起传给 `POST /api/session/create`；否则每个新会话都会悄悄退回 `BRIDGE_MODEL`。
- **删除**：菜单内两步确认（`删除当前会话` → `确认删除`），删除后桥接自动选中最近的幸存会话；子会话一并删除，不可恢复。
- **键盘**：模型弹层里 `↑/↓` 移动、`Enter` 选中、`Esc` 关闭，搜索框保持焦点；会话菜单 `Esc` 关闭（重命名中 `Esc` 先退出编辑）。

### 8.5 输入框底部两个胶囊：agent 与 model

- **左胶囊 = agent**（`build` / `plan` …），数据来自 `GET /api/agents`，选择走 `POST /api/session/{id}/agent`；文案显示当前 agent 的名称。
  - 只列**可见的主 agent**：`hidden:true` 的内部助手（`title` / `summary` / `compaction`）和 `mode:"subagent"`（`general` / `explore`）不会出现——subagent 由主 agent 派生，不能直接选给会话。
  - 会话没有显式 `agent` 时按 OpenCode 默认 `build` 显示。
- **右胶囊 = model**（`provider/model`），行为见 8.4。
- 两个胶囊是**两个独立点击区**（左 80–168，右 168–354，面板坐标），互不覆盖；打开一个会关掉另一个。

### 8.6 `/` 命令

- 命令列表**不是前端写死的**：`GET /api/commands` 转发 OpenCode `GET /api/command`，返回 agent 配置里的命令（本机为 `init` / `review` / `goal` + REA MCP 提供的 `rea:*`）。这正是参考客户端从 ACP `available_commands_update` 渲染的同一份数据（`AvailableCommand` / `UnstructuredCommandInput`）。
- 输入 `/` 打开命令弹层；`↑↓` 选择、`Enter`/`Tab` 插入、`Esc` 关闭。匹配排序：名字前缀 > 名字包含 > 描述包含（所以 `/rev` 命中 `review`，不会被描述里带 “review” 的 `rea:*` 抢走）。
- 发送时只把**确实在列表里的** `/name` 当作命令，走 `POST /api/session/{id}/command`；不认识的 `/xxx` 仍是普通文本（不会凭空发一个命令）。
- 命令名允许 `:` `_` `-` `.`（如 `rea:verify_reconstruction`），不要用只含字母数字的正则。
- `@` 附件同样适用于命令：`text` 是参数，`files[]` 照常解析并随命令提交。

### 8.7 文件预览（文件模式）

- **交互**：点侧边栏文件 → 顶部模式从「氛围」切到「文件」，中间 well 换成文件视图；点「氛围」或预览右上角 `×` 回到游戏视图；再点「文件」回到上次打开的文件（没有打开过时该 tab 不可用，tooltip 说明原因）。
- **视图**：Markdown 默认渲染预览（`Source` / `Preview` 切换，与参考客户端一致）；其它文本显示带行号的源码（`Wrap` 可切换换行）；图片按 data URL 显示；PDF 明确显示「PDF 预览暂不支持 ·」；二进制显示「无法预览二进制文件 ·」；超过 8 MiB 的图片显示「文件过大，无法预览 ·」。
- **截断**：文本只取前 4 MiB，底部标注「N 行 · 仅显示前 4 MB」——与参考客户端的 `# lines · first 4 MB` 同一预算。
- **数据**：`GET /api/file?path=` → OpenCode `GET /api/fs/read/*`（流式、带 Range），路径校验只允许会话目录内的相对路径。
- 预览布局复用 well 的实测盒子（x265..995.5, y100..843）；参考程序没有文件态的截图可用，所以这一层没有逐像素对照。

### 8.8 项目管理（侧边栏「项目」块）

- **列表只包含用户添加过的目录**，不会把 OpenCode `GET /api/project` 发现的 22 个目录倒出来（那些是"任何会话用过的目录"，含 `C:\Users\51159` 之类噪音）。列表持久化在 `kunlun-shell/.state/projects.json`。
- **添加**：点右上角文件夹图标 → 输入绝对路径 → 校验"存在且是目录" → **只加入列表，不切换**（添加后列表自动打开，点了才切）。
- **切换**：选中该目录最近更新的会话；没有会话就用 `POST /api/session {location:{directory}}` 建一个。因为 OpenCode 没有"打开项目"的接口，**项目 = 会话所在目录**。
- **移除**：列表里的 `×` 只是"忘掉"，不删目录、不删会话。
- **当前项目**由活动会话的 `location.directory` 决定；切换后文件树、预览、`@`/`/` 命令、agent 的 cwd 全部跟着变，文件视图会退回「氛围」（旧目录里的文件不该继续显示）。
- 「项目」行右侧的 `+` 是**在当前项目新建会话**（之前只是装饰）。
