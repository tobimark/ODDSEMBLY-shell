# Git 记录

```
git log --oneline
1e0806b feat(loom): widen composition, clean overlaps, add deterministic replay + review pack
e29a6f7 chore: proper gitignore (exclude node_modules/dist/tmp)
24c53f3 chore: baseline Loom 01 (stage 1 initial, before fidelity pass)
```

每个阶段完成后提交；回滚点：`git reset --hard 24c53f3`（基线）、`e29a6f7`（清理后）、`1e0806b`（当前视觉+回放+评审包）。
