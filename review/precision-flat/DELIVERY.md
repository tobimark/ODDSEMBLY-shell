# Loom 机械一体化 · 本轮交付

基线：`feat/loom-event-dial` / `c6d93db`。工作分支：`visual/precision-flat-integration`。基线分支保持原样。

## 实现与证据

- `before-0s.png` 与 `after-0s.png`：同为 1472×1008、待机、0 次输入。原 DSH 刻度窗的 READ ×21 是静态占位文字，不是该截图有 21 次事件；新版显示真实计数。
- `comparison-three.png`：CrommaCode 原始画布 / DSH / 本轮版本。原参考来自随附证据，构图本身不同；DSH 与本轮为同状态严格对照。
- `comparison-before-after.png`：原尺寸并排，便于检查材质和共同底座。
- `connection-detail-2x.png`：同一 0.7 秒投梭状态，连接区域的真实 2× 渲染。初始化画布为 2944×2016，再裁取对应区域，没有将低分辨率截图插值放大。
- `loom-detail-2x.png`：导轨、轴承、纱线的同状态细节。
- `after-with-ui.png`、`panel-960.png`：完整应用和较窄工作区实拍。
- `recording/live.mp4`：实际回放录屏，含音轨；原始 WebM 与记录也在 recording 目录。
- 视觉规范：`../../docs/PRECISION_FLAT_MECHANICAL.md`。

## 设计迭代

第一轮重建了薄壳板、平面钢件、沉入式螺栓、减重孔齿轮、细辐条轮和纱筒绕线。去掉厚立柱侧面、宽镜面高光与整机面板投影；共同底座、控制箱机脚、固定外壳鞍座和接线接口让左右系统拥有装配关系。

第一次实拍（iteration-01）显示纱筒横架仍缺立脚，滑架杆偏重，状态文字与伺服轴承重叠。第二轮补足立脚、加导轨凹床、重绘滑架杆并移动状态文字（iteration-02）。高清审查纠正了截图启动后的 DPR 切换问题，改为从页面初始化时用 2× 分辨率渲染。

## 回归结果

- `kinematics.txt`：事件织造时序与 12,003 个固定杆长姿态测试通过。
- `regression.json`：基线与新版用相同 12 次输入，在 0 / 0.4 / 0.7 / 1.4 / 2.1 / 8 / 21 秒比较。机械遥测、综框/筘/梭子坐标、织物行记录完全一致；最后 12 道织行且队列清空。另检查暂停、复位、读头输入计数和队列显示。
- `replay/determinism.json`：两次全新浏览器实际加载回放，14/14 检查通过；2、8、21 秒截图逐像素相同。
- `recording/recordings.json`：实时回放录屏 15/15 检查通过，包含事件顺序、实际织入、音轨、错误记录和播放完成状态。

数据层、运动约束、事件桥和回放程序未改。织物只改绘制颜色；行序列与组织计算保持不变。新增的是读头真实输入计数与队列文本更新，替换旧静态占位。

## 复现本轮检查

`npm run build` 后运行 `npm test`、`node scripts/replay-proof.mjs --modes=loom` 和 `node scripts/record-v2.mjs --modes=loom --strict`。

严格前后对照使用 `npm run review:precision -- --baseline=PATH`，PATH 为 `c6d93db` 单独构建后的 dist 目录。默认使用本机 `.tmp/dist-precision-baseline`。如需重建基线，可先 `git worktree add --detach .tmp/precision-baseline c6d93db`，在该目录运行 `npm ci`、`npm run build`，然后回到本目录运行 `npm run review:precision -- --baseline=.tmp/precision-baseline/dist`。

`python scripts/compare-precision.py` 使用 Pillow 生成对比拼图；所需原始参考已经保存在本目录。运行时画面不使用这些截图。

## 尚未解决

- 目前大刻度外壳固定、读头保持既有 40° 位置；未新做整圈转动或读头扫描运动。这是本轮静态视觉优先的范围，不能把真实计数更新称为完整转轮运动仿真。
- 固定鞍座和底座建立了可读的装配关系，但未做承载计算、全场碰撞、加工公差或制造验证。
- 960 px 工作区可显示全景，但微型标注较小。正式三栏工作台仍需独立的相机/局部导航设计。
- 部分转轮内部刻线仍使用原实现的暖灰色细分，后续可继续收敛到公共 token；没有为追求一致而全局替换所有色值。
- 浅色线条在低对比显示器上可能偏淡；本轮按当前屏幕和实际截图审查，未做跨屏校色。
- 图像质量与动态验证通过不等于用户最终艺术验收；仍保留 DSH 原分支用于继续比较。
