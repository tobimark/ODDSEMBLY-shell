# 复放入口

## 模拟会话
- 文件：`review/replays/loom-session.json`（12 个事件，带 `at` 毫秒偏移）
- 浏览器：`/?noauto=1&replay=1`
- 截图：`node scripts/capture.mjs replay`
- 手动：`window.__loom.trigger('Read' | 'Edit' | 'Write' | 'Bash' | 'Search')`

## 事件协议（拟）
```json
{ "id": 1, "type": "Edit", "detail": "src/engine/loom/scene.ts · 44 - 61", "at": 900 }
```
`at` 为相对会话起点的毫秒偏移；接入真实 Agent 时替换 `AgentSimulator` 即可。
