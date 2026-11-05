# 少根残局并行原型

独立、显式构建的研究入口；不会被网页或稳定服务自动载入。最终 v5 基于延迟稳定排序，不叠加上一轮有退化的 lazy-history。8 个暗棋样本、HCE、全部根走法覆盖、计数定义和取消/内存防护保持。

```sh
node native/experiments/search-speed/build-frontier-concurrency.mjs
node --test native/experiments/search-speed/frontier-concurrency-source.test.mjs
node native/experiments/search-speed/check-frontier-concurrency.mjs search
node native/experiments/search-speed/check-frontier-concurrency.mjs rules
node native/experiments/search-speed/check-frontier-concurrency.mjs reference
node native/experiments/search-speed/frontier-concurrency-proof.mjs
node native/experiments/search-speed/replay-frontier-concurrency.mjs
```

前三类检查及专项 proof 可追加 `--sanitize` 或 `--tsan`，需要本机编译器和相应运行库。Node.js 24、C++17；构建器在独立 `.cache/native/search-speed/frontier-concurrency/` 写入产物，校验源码和二进制散列，不覆盖稳定引擎。

`frontierConcurrencySource({revision:'v1'})` 至 `v5` 可精确重建各次实测源码；通用构建器只构建 v5。v1–v4 均未通过预设最差局面门槛，保留来源和负结果。两个 profile 源码只测任务时间线，不拿仪表版 NPS 代替发布版测速。

v5 只在全明单世界且根着数 1–3 时，把首应手再展开一层。先完成每个父节点的首个有序子分支，再动态领取其余分支；有限已证界用于窄窗探测，必要时重搜。棋盘、撤销、历史、杀手着均线程私有；同一个固定父局面内用互斥保护完整键 TT 快照。最多 4 个搜索线程、12 个额外上下文，总 TT backing 上限 64 MiB。暗局八世界调度不改。

本轮未实现通用递归任务窃取，也未实现 Pika 式独立搜索。规则测试验证现有契约及未回归，不等于完整国规认证。内层搜索仍有历史遗留循环启发式；外围使用 `cn2020-evidence-v1`，复杂长杀、联合捉等待人工复核。不能把公共裁判一致说成内层规则已完全统一。

[测量与结果](../../../docs/experiments/frontier-concurrency.md)、[原始数值及复现边界](../../../benchmarks/search-speed/frontier-concurrency-2026-11-05/REPRODUCE.md)。只有新布局、同预算对照和足够证据支持时才考虑默认采用；本轮保持可选。
