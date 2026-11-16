# KunlunMeta Loom — Mechanical Arts / Series 01

由 Agent 工具事件驱动的程序化机械艺术。TypeScript、React、PixiJS 8；全部零件、纱线和织物由本项目代码生成，未使用参考截图作贴图。

本次视觉重构位于 `visual/atelier-loom`，原版保留在 `master`（起点 `00aeb56`）。交付说明与实际运行证据见 [review/atelier/DESIGN.md](review/atelier/DESIGN.md)。

## 运行

```sh
npm install
npm run dev
```

打开 http://127.0.0.1:5173 。默认稍后启动模拟事件。生产构建：

```sh
npm run build
npm run preview
```

构建脚本自动使用项目内 `.tmp/build`，避免本机 Windows 公共临时目录的 esbuild 文件锁问题。需要 Node.js 22 或更新版本。

## 操作

- Play / Pause / Resume：模拟播放、冻结所有机构及回放时钟、继续。
- Stop：停止输入并清空待织队列，保留已织图样和累计计数。
- 0.5× / 1× / 2×：同步调整机械与事件时钟。
- Read / Edit / Write / Bash / Search，或数字 1–5：手动注入一次事件。
- Detail / Full view：1.65 倍细节观察与全景。
- 空格暂停 / 继续，M 静音。

参数：`?noauto=1` 保持待机；`?replay=1` 回放 `public/replay/loom-session.json`；`?ui=0` 隐藏界面；`?static=1` 仅渲染静帧，用于自动截图。

## 事件与机械

每个事件进入 FIFO 队列，完成一次 1.65 秒织造周期。开口 → 引纬 → 闭口 → 打纬 → 卷取；每次打纬提交一行，Read 也成为一行记录。工具种类决定纬线颜色。初始菱形组织是展示底布，PICKS 从零开始，仅统计后续完成的真实事件。连发排队，不跳过或合并事件。

192 根经线分成 16 组纱色，双综框交替开口；皮带采用 3:1 轮径关系，24:16 齿轮反向联动。前经线遮挡梭子，织物在打纬后平滑移入卷布辊。机构是艺术化的运动学表达，并非可制造的工程仿真。

原有 `ToolEvent`、`EventBus`、`LoomEngine`、模拟器和回放入口保留。外部输入示例：

```js
await window.__loom.ready;
window.__loom.inject({ id: 1, type: 'Write', detail: 'agent completed a file', at: performance.now() });
```

单独注入不会启动模拟事件。暂停时注入的事件进入队列，恢复后处理。`window.__loom.getStatus()` 返回原有状态；新增 `getMechanism()` 返回织造阶段、已织行数、队列和主轴相位。`tick(dt)` 保留为确定性测试接口。

## 验证与证据

```sh
npm test
npm run build
npm run review:atelier
```

最后一个命令在 Windows Edge 中运行浏览器验证、生成 1472×1008 / 1920×1080 / 768×1024 截图，并用 Canvas MediaRecorder 录制约 25 秒真实播放。可通过 `EDGE_PATH` 指定 Chromium 系浏览器路径。默认使用硬件 WebGL；设置 `LOOM_SOFTWARE=1` 可验证 SwiftShader。机器性能会影响录屏帧率。

- `review/atelier/before.png` / `after-idle.png`：同尺寸改造前后。
- `review/atelier/comparison.png`：参考、旧版和新版并排。
- `review/atelier/detail.png`：实际 1.65× 放大视图。
- `review/atelier/loom-live.webm` / `loom-live.mp4`：实际画布录屏，无合成补帧。
- `review/atelier/verification.json`：浏览器断言和最终事件 / 织行数量。

## 实现位置

- `src/engine/loom/scene.ts`：Pixi 层叠、零件变换与联动。
- `src/engine/loom/atelier/assembly.ts`：机架、纱筒、轴承、导轨、综框、筘、梭子。
- `drawing.ts`：切面、紧固件、绕线纹理、金属加工表面。
- `textile.ts`：192 根经线、前后遮挡、2/2 斜纹与事件纬线。
- `mechanism.ts`：独立于渲染的排队与织造周期。
- `src/engine/index.ts` / `events/replay.ts`：引擎生命周期、输入隔离、传输控制和实际时间推进。

旧图形模块仍保留在仓库，未参与当前场景构建。旧版说明和证据位于原有 `review/`、`shots/`；本轮有效证据集中在 `review/atelier/`。
