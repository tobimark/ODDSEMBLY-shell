# KunlunMeta Loom — 评审修正版

保留 Astra 首版构图和品牌风格，修正连杆、密度与声音。完整说明见 [review/mechanics-v2/REVIEW.md](review/mechanics-v2/REVIEW.md)。

## 运行

Node.js 22+。在项目目录执行 `npm install`、`npm run dev`，打开终端显示的本地地址。生产构建 `npm run build`，预览 `npm run preview`。构建临时文件放在 `.tmp/build`。

`npm test` 检查织造时序与固定杆长几何；`npm run review:atelier` 在 Windows Edge 中运行交互检查，并录制带音轨的视频到 `review/mechanics-v2/`。可设置 `EDGE_PATH` 或 `LOOM_SOFTWARE=1`。

## 操作及接口

- Play / Pause / Resume / Stop，0.5× / 1× / 2×。
- Read / Edit / Write / Bash / Search 按钮或数字 1–5 注入事件。
- 空格暂停，M 静音，Detail 放大。
- `?noauto=1` 待机，`?replay=1` 回放原 JSON，`?ui=0` 纯画布，`?static=1` 静帧。
- `window.__loom.inject({ id:1, type:'Write', detail:'test', at:performance.now() })` 接收外部输入。
- `getStatus()`、`getMechanism()`、`tick(dt)` 等原入口保留。

## 实现

112 根经线、16 组纱色。每个事件排队完成开口、投梭、闭口、打纬和卷取。预设菱形底布不计入事件产量。打纬提交织行时触发声音。

右侧三组伺服曲柄滑块使用固定 25 px 曲柄和 75 px 连杆，以圆交点求解关节位置。左侧齿轮不再被错误地连接到综框。代码：`src/engine/loom/atelier/linkage.ts`。

`assembly.ts`、`drawing.ts`、`textile.ts`、`mechanism.ts` 分别负责装配、材料绘制、织物和周期时序；`scene.ts` 负责合成与驱动。当前仍是平面艺术机构，未完成动力学、碰撞或制造校核，也未验证 Chips / Westworld 复用。

原版保留于 master，Astra 首版保留于 visual/atelier-loom，本轮在 fix/loom-mechanics-review。精简验收 ZIP 不含 node_modules、缓存或历史大文件；安装依赖后即可构建。
