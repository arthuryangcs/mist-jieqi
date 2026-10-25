# 内部走法稳定插入排序实验

仅替换递归节点对预评分走法的完整稳定排序，严格大于时前移，相同分数保留原次序。根排序、预评分、HCE、规则、样本、预算、TT与节点边界不变；不叠加NNUE或其他实验，默认核心不改。无额外临时排序缓冲；插入排序最坏O(n²)，不能假定在所有长列表上更快。

`plan.json` 在测量前固定算法、5轮同树基准、两种预算及12局新布局换色规模。不按输赢调参或延长赛程。两个版本对固定已批准Pika均1秒、共同60ms宽限、最多4线程；实际布局/裁判真值仅留在裁判记录，搜索只接收合法行棋方观察和独立无放回样本。

项目根目录执行以下命令；正式证据不可覆盖，重跑请先另存证据并使用独立工作副本/新目录。已有本机C++17/Node工具，无下载或安装。

```sh
node native/experiments/insertion-sort/check.mjs
node native/experiments/insertion-sort/check.mjs --sanitize
node native/experiments/insertion-sort/sort-probe.mjs
node native/experiments/insertion-sort/parallel-check.mjs
node native/experiments/insertion-sort/benchmark.mjs
export JIEQI_ENGINE_PATH="$PWD/external/pikafish-jieqi-wasm/src/PikaJieQi"
node native/experiments/insertion-sort/matches.mjs freeze
node native/experiments/insertion-sort/matches.mjs next
node native/experiments/insertion-sort/verify.mjs
node native/experiments/insertion-sort/release-review.mjs
node native/experiments/insertion-sort/report.mjs
```

构建仅写忽略的 `.cache/insertion-sort/`，不覆盖稳定二进制。`next` 一次一局并带进程锁；需暂停时写 `.cache/insertion-sort/STOP`，当前一步完成后保存。恢复前核对额度/进程/指纹，再移除标志。不得覆盖或丢弃失败局。结果与限制见[报告](../../../docs/experiments/insertion-sort.md)。
