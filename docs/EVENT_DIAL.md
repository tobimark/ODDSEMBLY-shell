# 事件转盘（Loom Event Dial）— 动态转轮 + 固定读数器

本轮把 Loom 左侧的大型事件刻度机构从「静态读数窗」做成可回滚的动态转盘：

- **会动的是 12 槽索引鼓**（`ringPhase`，每个新工具组前进 30°；180 ms `easeInOutCubic`）。
- **读数器结构上不可旋转**：轴对齐 210×94 面板，悬架在 40° 读头旁的盘面上；类型里没有 rotation 字段，只显示工具 / ×N / 槽位。
- **颜色=当前工具**：统一 `ToolPalette`（取原版运行时实测色）。
- **动效参数来自原版实测**：105 ms 显示延迟 → 70–200 ms 换卡过渡放大为 180 ms → 单卡 ≈2 s 停留；同工具事件合并为 `×N`，不转轮。
- 原版依据与逐条差异：`CrommaCode-Loom事件转盘-研究.md`（研究）§6、§8、§9。

设计立场（不混淆原版与选择）：

| 议题 | 原版（已观察） | 本实现（KunlunMeta 选择） |
|---|---|---|
| 稳态 | 盘面零位移 | 转轮停在目标槽位，同样静止 |
| 换卡 | 70–200 ms 卡片沿弧掠过 | 放大成 180 ms 索引步进（有原版依据） |
| 读数窗 | 环带扇段、固定位置 | **固定轴对齐矩形面板**（有意不同，保证文字水平且结构上不会转） |
| 转动件 | 仅共享刻度环相位能力，Loom 内不可见 | 12 窗索引鼓可见转动 |
| 颜色 | 弧段=当前工具，不累积 | 同一段弧 + 当前卡窗着色 |
| ×N | 同工具调用聚合次数 | 同（`mergeWindowMs` 窗口内合并） |
| Sxx/12 | 组序 / 运行时总数 | 槽位 / 12（10 组后在 12 内回绕） |
| idle | 无卡、无动效 | `holdMs` 后清空读数、回归 IDLE |

## 结构

```
EventDial.body (在织机后面)                 EventDial.front (压在织机上)
├── statorSprite   环带/滚花/蓝弧/内鼓/夹块   └── readout (★ 盘面悬架读数器)
├── rotor          12 个环扇卡窗 + 5° 刻度        ├── panelSprite（210×94，bezel + 安装轨）
│   └── slotTint   当前卡窗的细小色边/叠色        ├── typeText 44px bold
├── accent         37°–43° 工具色弧段             ├── multText ×N 22px
├── pointer        固定读头（座/臂/读数窗口）      └── stepText Sxx/12 22px
└── mount          蓝弧两点夹具 + 读头短连杆
```

不变量：

1. **任何 `Text` 都不在 rotor 子树里**（水平文字只能出现在不旋转层；反向旋转会发虚）。
2. **`ReadoutPanel` 几何没有 rotation/parent-rotor 字段**；构造期定位在盘面局部
   `(80,170)`、210×94，由固定蓝弧上的两个夹具与一根短连杆悬挂；转盘整体缩放 0.83
   不改变其“不旋转”性质；它允许压在卡窗上方，但绝不随盘旋转。
3. 所有旋转件姿态 = `f(state.angleDeg)` 的纯投影；模型是纯函数，可 node 直测。
4. 「固定」指**设计空间**固定（1472×1008 等比缩放），不是 DOM 浮层。

## 状态机

```
IDLE ──event──► ARMING(105 ms) ──► MOVING(180 ms) ──► HOLD(≤2000 ms)
  ▲                                    │                    │
  │                                    └─ 同工具聚合：跳过 MOVING，×N++
  └──────────────── 超时清空 ◄──────────┴────────────────────┘
```

| 相位 | 进入 | 时长 | 行为 |
|---|---|---|---|
| `arming` | 新工具组 | `armDelayMs=105` | 读数先更新；转轮不动 |
| `moving` | 延时到 | `moveMs=180` | `angle = lerp(from,target,easeInOutCubic(k))`，目标 `ordinal*30°` |
| `holding` | 到位 | `holdMs=2000`（同工具事件续期） | 零位移；`×N` 就地递增 |
| `idle` | 超时 | — | 读数清空、卡窗叠色清除、弧回缺省蓝 |

`reducedMotion`（`?motion=off` 或 `engine.setReducedMotion(true)`）：`armDelay=0, move=0`，角度瞬跳。

模型见 `src/engine/modes/loom/atelier/dialModel.ts`：`createDialState / dialPush / dialTick / dialReadout / dialTelemetry`，不读时钟、不用随机数；60 fps、30 fps 或单个 1 s tick 得到同一终态（`scripts/test-dial.mjs` 断言）。

## 工具色板

`src/engine/modes/loom/atelier/toolPalette.ts`（运行时帧采样，非源码常量）：

| Tool | 色 | 依据 |
|---|---|---|
| Read | `#789ED0` | 用户截图 `READ ×21` + `arc-colours.csv` |
| Bash | `#77BA89` | 运行时弧采样 |
| Edit | `#C686C0` | 同 |
| Write | `#D5A868` | 同 |
| Search | `#5AB2B6` | 原版无 Search 单列；取 grep/glob/task 观察到的青绿 |

`textile.ts` 的纬线色是另一套纱线材质色板，本轮**未合并**（避免改动织物外观）。


## 视觉减法（2026-11-17）

按最新评审，本轮不增加机械件，只做减法与重新构图：

- **三分区构图**：Loom `scale 1.06`、`MOUNT {x:131.02, y:9}`，左框 x=484、右缘 1423；
  转盘缩到 **0.83**、平移到 `center(-553,-390)`，可见弧带占 x 0–470；
  齿轮、飞轮、张力表与驱动箱作为一体左移，齿轮箱右缘约 400，与 Loom 留约 **84px** 间隙；
  上方一根改为输出传动轴，下方一根保留结构轨；另加信号导管与张力测量管。三者无像素级重叠；显示比例见 [LAYOUT.md](LAYOUT.md)。
- **删除左下控制箱与队列牌**：连同箱脚、接线盒、箱→队列线、读头→控制箱导管一起删除；
  事件引擎与 queue 遥测保留，只是不再有可见外壳。共享床身缩到 Loom 脚下
  （x≈460–1380，y=840）。
- **读数器重做**：盘面局部 `x=80, y=170, 210×94`；只保留 `TYPE / ×N / Sxx / 12`，
  删除标题 `EVENT / 01`、文件路径、detail、age、chip、动态分隔线。
  字号 **TYPE 44 / ×N 22 / step 22**；经 0.83 缩放并在 730×495 中显示为
  约 18.1 / 9.1 / 9.1 px，仍可读。
- **悬架**：不再用长线缆。固定蓝弧上 30°/44° 两处夹具 + 两根短杆托住面板，右下再以
  一根短连杆接到读头臂；面板有 bezel、投影与底部安装轨。
- **弱化卡窗**：卡窗填充 alpha 0.62、描边 1.1→0.8；当前槽只保留 `alpha .025` 的极浅叠色
  + 外沿 2.4 px 工具色短边；不再出现一整块醒目的蓝色玻璃板。
- **转盘减负**：外圈细纹步长 0.45°、索引楔只保留 12 个、去掉外圈螺栓阵与轮缘接缝；
  滚花步长 0.5°；内鼓去掉检查槽与密集径向线，只留 3 条同心导环 + 3 条径向缝；
  固定夹块只保留 30°/57° 两处，缩小并降低对比度。
- **读头简化**：一个外壳螺栓座 + 一根上抬臂 + 一个读数窗口（白孔/针）+ 一个
  `r≈1136` 的短定位缺口；删除叉形窗口、长导管和多余支架。

动态验证：`review/event-dial/recording/dial-readout-fixed.mp4`（30 fps，11 s，330 帧）
包含 READ→BASH→BASH×N（不推轮）→EDIT/WRITE/SEARCH→12 组整圈→READ；读数器位置不变。
前后对比：`review/event-dial/visual-subtraction/comparison-before-after.png`；
壳内尺寸与三分区比例：[LAYOUT.md](LAYOUT.md)。
壳内示意：`review/event-dial/layout-v4/shell-context.png`（合成图，非运行时集成）。

## 遥测 / 调试

`window.__engine.getModeTelemetry().dial`：

```json
{ "phase": "holding", "angleDeg": 60, "targetDeg": 60, "slot": 2,
  "ordinal": 2, "type": "Bash", "count": 1, "events": 3, "ageMs": 300,
  "stepTotal": 12, "queue": 0 }
```

确定性截图：`?mode=loom&static=1&ui=0` + `window.__engine.tick(1/60)`。
`scripts/review-event-dial.mjs` 覆盖 11 个状态断言并输出 `review/event-dial/` 证据；
`scripts/shot-dial-motion.mjs` 输出 2× 步进逐帧（`review/event-dial/motion/`）。

## 验证

```bash
npm run build
npm test                    # mechanism + dial model
npm run review:dial         # 浏览器内 11 状态断言 + 截图
npm run shot:dial-motion    # 180 ms 步进逐帧
```

- `npm test`：dialog 模型 11 条纯逻辑断言（idle/arm/move/hold/过期、同工具 ×N、Sxx/12、帧步长无关、reduced motion、12 组整圈、索引落位 40° 不变式）。
- `review:dial`：idle、105 ms 延时、步进中间角、S01/12、×2 合并、S02/12、idle 过期、12 连发、reset、reduced motion、2× 细节；0 浏览器错误。
- 机械/织物链路未改：`scene.update` 仍先推进 `Mechanism`，转盘只是多一个 `dial.update(dt)`。

## 性能与修复

- 转子/卡窗/刻度用 **Pixi Graphics 一次性建几何**，运行时只改 `rotation`；不再有 `setAngle()` 每帧 `clear()` 重画。
- 定子纹理从全画布 1472×1008（≈23.8 MB）裁到可见 bbox 700×820（≈9 MB）。
- `EventDial.destroy()` 显式销毁 2 张 CanvasTexture（stator + readout；旧实现漏销毁 ≈25 MB / reset）。
- idle 时 `apply()` 只做读值比较，无每帧文本重排；读数器只有 3 个 Text。


## 外部评审标注

最新版（视觉减法/盘面悬架读数器）的评审图在
[review/event-dial/visual-subtraction/](../review/event-dial/visual-subtraction/)：
`comparison-before-after.png`、`after-full.png`、`after-dial-2x.png`、`after-readout-2x.png`。
旧区域标注图集中在 [review/event-dial/annotation/](../review/event-dial/annotation/README.md)（已过期）：
`annotated-overview.png`（1–12 总览）、`annotated-dial.png`（D1–D13 细部）、
`annotated-console.png`（C1–C5）、`annotated-readout.png`（R1–R11）、
`04-hold-s01.annotated.png`（原尺寸编号版）。直接可粘贴的评审说明见
[review-brief.md](../review/event-dial/annotation/review-brief.md)。

> 注：`annotation/` 下的旧标注图对应“底部远程读数器”版本（2026-11-16 22:00 之前），
> 已不再代表当前版本；最新版请使用 `review/event-dial/visual-subtraction/` 下的
> `after-full.png`、`comparison-before-after.png`。

## 与原实现的关系 / 回滚

旧静态实现（`c6d93db` 引入、`b15dd9a` 最终形态）保留在 tag `pre-dynamic-dial` 与分支
`visual/precision-flat-integration`。回滚命令见 `docs/ROLLBACK.md`，预改动文件副本在
`D:\workspace\gamified-flow\backup\event-dial-prechange-20261116-205157\`。

## 已知边界

- 交互式 60 fps 下过渡轨迹未重新实测（研究 P7 仍开放）；180 ms 取原版 70–200 ms 的中值偏大端，是**放大**而非复刻。
- 原版读数窗的绘制函数未定位（P2），因此本实现是几何重构，不是逐点复刻。
- `×N` 是否跨 session 重置未知（P3 残留），本实现按「进程内当前组」计数。
- `Sxx/12` 的 `12` 语义仍是推断（页容量/环等分共用），本实现明确采用「12 槽环」。
- 铭牌文案（EVENT SCALE / KH-00、KM / 01 等）为自创设计，不是原版观察。
