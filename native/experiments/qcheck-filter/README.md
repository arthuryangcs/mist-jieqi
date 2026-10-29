# 明子将军候选的精确过滤

这是上一轮 `mate-proof` 隔离候选的实现优化，仍保留每条静态搜索线最多一次明子非吃子将军。生产稳定HCE、上一候选及其24局记录均不修改；不提交推送，不触碰用户棋局和页面。

## 唯一变化

原候选每个相关q节点先生成全部合法走法，再丢弃暗子走法和吃子着，最后试走检查是否将军。新候选为同一个查询加入 `brightQuietOnly` 参数，在生成前跳过暗子，在合法性检查前跳过有棋子的目标格。默认参数为false，主搜索、吃子、困毙探测和普通合法走子不变；原来的合法性规则、顺序、分支预算、估值、采样、身份池、分数聚合、重复规则与时间控制不变。

不是增加第二项策略或评分。优化前后需要相同节点预算下完整候选、评分、节点和推荐一致。ASan/UBSan版在每次新查询内部再调用原全量查询后过滤，检查结果向量与顺序逐项相同，并保留原状态撤回守卫。过滤仅用side/hidden/目标是否有子；不读取真实暗子分配或对方私有俘虏。

优化的算法参照是未默认启用的上一候选 `30dcd1ce…`，**不是生产稳定版**。新的正式对局仍以生产HCE `5c68913e…` 和固定AB为对手。源程序只由本项目已有代码生成，没有拷贝GPL第三方实现；AB研究与许可证说明见前一报告。

## 重现

根目录执行；旧冻结证据不能覆盖。复跑请另用工作副本/输出目录和新布局。

```sh
node native/experiments/qcheck-filter/build.mjs --reference
node native/experiments/qcheck-filter/build.mjs --trace
node native/experiments/qcheck-filter/build.mjs
node native/experiments/qcheck-filter/diagnose.mjs
node native/experiments/qcheck-filter/check.mjs
node native/experiments/qcheck-filter/build.mjs --sanitize
node native/experiments/qcheck-filter/check.mjs --sanitize
node native/experiments/qcheck-filter/benchmark.mjs
npm test
node native/experiments/qcheck-filter/matches.mjs freeze
node native/experiments/qcheck-filter/matches.mjs next
node native/experiments/qcheck-filter/verify.mjs
node native/experiments/qcheck-filter/report.mjs
```

只用已有Node/clang++/SDK，不安装依赖。`--reference`构建原候选的计数诊断版，不覆盖原二进制；`--trace`是优化版计数和逐世界分数跟踪，不用于比赛。正式比赛使用无跟踪版本，固定哈希。固定节点上限强制单线程；诊断计数只解释这种模式，不把它当4线程吞吐。

诊断覆盖开局与原第3局，开发检查使用新的2861/2863/2867等种子；正式布局2871/2873均为未参与调参的新布局。12局固定为4局新候选对生产稳定，生产稳定/新候选各4局对固定AB，换色配对，顺序交替。每手2000ms+60ms统一技术宽限、最多4搜索线程，Mist暗局8样本、全明1样本/线程。初始化在计时外，其余投影、采样、根规则、IPC、搜索、停止回收均计时。外部统一第三次公开重复走子方负、120闲半回合和、400封顶未决；AB内部循环/80计数差异继续披露。

`next`一次一局且加锁。写 `.cache/qcheck-filter/STOP` 可在当前一步后保存；恢复前检查进程、额度和指纹再移除。技术失败和断连必须保留，不重赛抹除、不按中途胜负调参。只按额度工具实际可读余量判断，低于40%停止新增工作；未知周期不猜测。

该12局只是小规模筛查，不启用默认；实现提速不等于策略已可靠优于HCE或AB。固定节点基准和2秒端到端测试的统计口径不同，不能用被中断的节点数比较NPS。实测、限制和全部对局见 `docs/experiments/qcheck-filter.md`。
