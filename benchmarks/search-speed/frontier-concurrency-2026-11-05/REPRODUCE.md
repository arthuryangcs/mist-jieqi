# 复现边界

所有观察局面、初始布局和棋谱由本项目自行生成，不含用户棋局。没有上传二进制、凭据、进程列表、额度、私人裁判状态或引擎采样世界。暗俘身份仅通过各方合法观察记录；公开逐手记录对暗俘省略 type，复盘使用合成布局种子恢复裁判，而不把种子交给引擎。

## 源码与正确性

从仓库根目录运行：

```sh
node --test native/experiments/search-speed/frontier-concurrency-source.test.mjs
node native/experiments/search-speed/check-frontier-concurrency.mjs search
node native/experiments/search-speed/check-frontier-concurrency.mjs rules
node native/experiments/search-speed/check-frontier-concurrency.mjs reference
node native/experiments/search-speed/frontier-concurrency-proof.mjs
node native/experiments/search-speed/replay-frontier-concurrency.mjs
```

检查可追加 `--sanitize` 或 `--tsan`，取决于工具链支持。proof 读取 `fixed-fixtures.json` 的六个两色难例，在深度3/4对照延迟排序和独立禁TT参考；不会搜索用户棋局。replay 不启动引擎，先验证 engine.js/repetition.js 源码散列，拒绝悄悄用新规则重判旧结果。

`frontierConcurrencySource({revision:'v1'})` 至 v5 及两个时间线源生成器都有精确源码散列测试。只有 v5 提供通用显式构建入口，生产默认不改；失败版本保留可审计补丁和固定工作结果。所有源码均是本项目独立实现，无复制 Pika 代码或权重。

## 数值记录

- fixed-work-v1..v5：预先冻结的九局面、三重复、两引擎54请求；六少根两色为主验收，另外三项为暗局/多根对照。v1–v4失败没有删去。
- performance/fixtures/performance-plan：八个新观察局面加已知全暗初始公开视图，四引擎各三重复108请求，每手2000ms上限。快速确认终局和持续至少1000ms分列，不把浅短样本NPS混入持续吞吐。
- baseline/candidate-task-trace：各三个难例三重复的仪表版任务区间，记录未开始任务、未完成最后迭代及尾部；非仪表发布构建用于吞吐测速。
- memory：自有原生子进程的 BSD time -l 退出记录，包含先触碰32MiB校准单位；无系统进程读取。RSS 不含外层Node控制器；TT分配和进程总RSS分开。
- matches/match-replay：冻结12局、原始技术事件、未决及独立回放。正常初始布局与编辑残局须分开统计，逐手保留新调度实际报告的触发计数和缺失边界。

## 原始本地驱动

scripts/ 保留实际使用的相对路径驱动用于审计，不是跨电脑一键测速器。它们依赖原缓存目录的冻结 plan.json、源码/二进制散列、参考构建和8766端口只读空闲守卫；没有服务或产物不一致会拒绝执行。不要删除现有锁或强行覆写结果来复跑。

在另一台电脑重建性能实验时，应复制公开冻结局面，使用显式构建器和固定Pika版本，建立新的独立目录和包含新编译器/二进制散列的计划后再开始计时。旧记录必须保留；不同电脑/工具链的新数据不能伪称原机逐字节二进制复现，不能仅改旧计划散列覆盖旧结果。固定Pika源码/授权和其独立构建需遵守上游许可，本包未分发它的可执行文件。

资源限制、节点口径、快速终局、实际线程使用、旧构建终态未知、内层循环策略与有限2020公共裁判差异，均见完整报告。没有证明普遍速度领先或棋力超过Pika，也没有据本轮默认启用。
