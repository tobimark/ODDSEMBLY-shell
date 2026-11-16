# 转盘 | 区域清单（与 annotated-*.png 编号对应）

状态：`READ ×1 / S01/12 / ring 30° / queue 0`；设计空间 1472×1008，2× 采集 2944×2016。

| # | 区域（中） | Region | 层 | 会动？ | 说明 |
|---|---|---|---|---|---|
| 1 | 内鼓面（静止） | inner drum face · stator | 固定机械 | 否 | 蓝弧以内的静止鼓面：同心导环、径向细线、两个椭圆检视窗；不属于旋转件。 |
| 2 | 蓝弧 + 工具色弧段 | blue reference arc + tool accent | 固定机械 | 否 | r=980 的基准弧固定不动；22°–58° 彩色段随当前工具变色（此处 READ 蓝）。 |
| 3 | 12 槽卡窗索引鼓（会转） | 12-window index drum · rotor | 旋转部件 | 是（ringPhase） | 12 个环扇卡窗，每格 30°；新工具事件前进一格（180 ms）。此帧环相 30°。 |
| 4 | 固定读头 | fixed read head · pointer + mount | 固定机械 | 否 | 40° 处的针+箭头+螺栓座，固定不动；卡窗转到其下标为“读数”。 |
| 5 | 读头导管 | read-head conduit | 固定机械 | 否 | 读头 → 控制箱的静态波纹导管，暗示信号/机械耦合。 |
| 6 | 固定夹块 | fixed clamp blocks | 固定机械 | 否 | 4 块可见夹块把固定外壳锁在盘面上，不随鼓转动。 |
| 7 | 固定读数器 | fixed readout panel | 固定读数器 | 否 | 轴对齐矩形面板，装在共享底座上；TYPE / ×N / Sxx/12 / detail / age + 工具色 chip/rule。 |
| 8 | 控制箱 | control box | 固定前端 | 否 | 线圈模块、张力表、旋钮、按键、穿卡排；波纹导管接入顶端。 |
| 9 | 队列牌 | queue coupler + count | 固定前端 | 否 | 织机 FIFO 队列长度（此帧 0）；与转盘“组”语义不同。 |
| 10 | 共享底座 + 安装鞍座 | shared chassis bed + saddle | 固定机械 | 否 | 转盘外壳与织机共用的床身；40° 处有切向鞍座，把固定外壳锁到机架。 |
| 11 | 织机（非转盘） | loom machine · context | 非转盘上下文 | 否 | 主轴、综框、筘、梭、织物；由 Mechanism 驱动，与转盘只共享事件与底座。 |
| 12 | 图纸底 / 标注 | exhibition sheet + captions | 非转盘上下文 | 否 | 1472×1008 图纸、注册点、FIG.01 与底部目录标注；不是机械件。 |

## 转盘细部编号（annotated-dial.png）

| # | 区域（中） | Region | 层 |
|---|---|---|---|
| D1 | 内鼓面（静止） | inner drum face | 固定机械 |
| D2 | 蓝弧（固定基准 r=980） | blue reference arc | 固定机械 |
| D3 | 工具色弧段 22°–58° | tool accent segment | 固定机械 |
| D4 | 12 环扇卡窗（旋转） | 12 card windows · rotor | 旋转部件 |
| D5 | 当前卡窗叠色（工具色） | current-slot tint | 旋转部件 |
| D6 | 分度隔圈 + 12 索引销 | separator ring + 12 pips | 旋转部件 |
| D7 | 5° 刻度带（旋转） | 5° engraved scale | 旋转部件 |
| D8 | 滚花握持带（固定） | knurled grip band | 固定机械 |
| D9 | 外圈细纹带（固定） | fine-ruled outer band | 固定机械 |
| D10 | 外唇 / 接缝（固定） | outer lip + rim joints | 固定机械 |
| D11 | 固定夹块 ×4 可见 | fixed clamps | 固定机械 |
| D12 | 固定读头（针+箭头+座） | fixed read head | 固定机械 |
| D13 | 读头波纹导管 | read-head conduit | 固定机械 |

## 读数器/控制箱编号（annotated-console.png）

| # | 区域（中） | Region | 层 |
|---|---|---|---|
| C1 | 固定读数器面板 | fixed readout panel (320×150) | 固定读数器 |
| C2 | 控制箱 | control box | 固定前端 |
| C3 | 箱→面板短连线 | box → panel console link | 固定前端 |
| C4 | 面板→队列短连线 | panel → queue console link | 固定前端 |
| C5 | 队列牌 QUEUE n | queue plate + count | 固定前端 |

## 读数器内部编号（annotated-readout.png）

| # | 项目（中） | Item |
|---|---|---|
| R1 | 面板外壳 / 四角螺钉 | enamel shell + 4 corner screws |
| R2 | 标题 EVENT READOUT | 7.5 px header |
| R3 | 工具色 chip | 18×9 colour chip |
| R4 | TYPE 26 px bold | primary readout line |
| R5 | ×N 20 px bold（右对齐） | multiplier, right aligned |
| R6 | 颜色分隔线（工具色） | tool-colour rule |
| R7 | Sxx/12 10 px mono | slot / total |
| R8 | detail 9 px mono | event detail line |
| R9 | age 8 px mono | event age |
| R10 | 12-SLOT INDEX 说明 | fixed caption 6.2 px |
| R11 | 安装耳 + 螺栓 | mounting tab |
