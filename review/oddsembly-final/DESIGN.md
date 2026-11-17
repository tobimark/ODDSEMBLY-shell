# ODDSEMBLY / 嵌套定子读数器

设计空间 1472×1008；实际验收窗口 730×548，均由真实 PixiJS 场景渲染。

本轮保留原有 112 根经线、16 组纱轴、织物组织、传动轮和三组固定杆长伺服。以 B 案的 0.90 转盘 / 1.06 织机嵌套布局为基础，恢复经线完整显示，立柱加入窄深蓝承重面，飞轮恢复深蓝轮缘，纱筒恢复纱色实体。没有统一降低透明度或删去经线。

读数器采用圆鼻、切角安装端的横向铸壳，读取窗与壳体分开；安装端通过同一铸件抵达机架侧。它属于固定定子层，文字不进入 rotor，也不使用反向旋转补偿。SEARCH 采用 36 设计像素，在 730 窗口约 16px；次数约 12.5px，槽号约 9.8px。只保留两个安装端紧固点，不添加长线路与层叠轴承。

删除 V6 长导管和共享底板；仅保留织机原有机脚及一处 ODDSEMBLY 铭牌。第一轮实拍后修改安装端与纱筒线距；iteration-1-730.png 保留供比较。

## 文件清单
- scene.ts：嵌套构图、经线可见性、移除导管与底板、避开底部文字。
- atelier/eventDial.ts：固定仪器壳、安装端及水平信息排版。
- atelier/dialGeometry.ts、finish.ts：读窗尺寸与装配变换。
- atelier/assembly.ts、drawing.ts：机架主次、纱筒、轮缘与铭牌清理。
- atelier/integration.ts：旧公共底板停用，兼容导出保留。
- scripts/shot-oddsembly.mjs：分别初始化实际尺寸与 DPR，避免静态时钟下视口切换的旧画布裁切。
- scripts/review-oddsembly.mjs：真实浏览器截图、逐帧录屏和与 V6 的状态对照。

## 验证与证据
- final-1472.png / final-730.png：同一 SEARCH 状态，真实浏览器尺寸。
- connection-2x.png：初始化 DPR=2 的读头—读数器—传动局部。
- READ-BASH-BASH2-EDIT-SEARCH.mp4：真实 Canvas 每秒 30 帧、引擎每帧推进 1/30 秒，8 秒；没有静态覆盖图，没有合成机械场景。此录屏无音轨，不是墙钟性能测试。
- regression.json：与修改前运行产物的六个时间点遥测逐字段一致，包括 dial 状态、角度、聚合计数及织造状态；读窗父层固定检查。
- dial-tests.txt / mechanism-tests.txt / build.txt：事件模型、固定杆长与构建结果。

## 复现
npm run build；npm test。
截图：node scripts/shot-oddsembly.mjs。录屏：node scripts/review-oddsembly.mjs；若浏览器长采集中断，可依次传入 0 24、24 72、72 120、120 168、168 216、216 240 生成各段帧，最终一次编码为完整 240 帧。每段从相同初态推进，未拼接不同事件状态。前后比较需要修改前构建放在 .tmp/dist-oddsembly-baseline；本机已保存。脚本需要 Edge 和 imageio_ffmpeg（或相应环境配置）。

## 范围和不足
浅灰次级刻线在 730px 下仍属于纹理，不能逐字阅读；槽号比工具名小。定子与机架的安装端是视觉装配设计，没有做制造公差或负载分析。保留原有传动动画，未声称外环和飞轮之间具有新增加的齿轮运动约束。

工作区原有 src/App.tsx、src/engine/core/engine.ts 初始化修复未改动，也不纳入此次提交。截图运行包含这些既有修复。最终艺术品质仍由用户根据实拍验收，测试通过不代表已经超过 Astra 原版。
