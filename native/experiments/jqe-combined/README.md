# Snapshot + FMA：独立 JQE 组合候选

本轮只把两个已单项验证的实现优化组合：有效模式/宽度的神经快照复制，以及只在 `mist_jqe::correction` 上使用 `target("fma")`。没有加入 integer 变体，没有新训练或调权，仍是 it014、原比例、8暗世界/1明世界、原搜索覆盖与计数。原冻结 JQE 确认候选和默认 HCE 均不改。

这是原授权 x86-64 Mac 的可选本地候选，**不是可移植默认程序**。本轮 `sysctl -n machdep.cpu.features` 被沙箱拒绝，没有重试或通过其他接口查询 CPU 特性；沿用同机已保存的 FMA 执行证据，本轮组合的实际数值/搜索运行另外验证。不发布二进制。FMA/AVX 不支持的电脑不应直接执行这种构建。

## 离线公开复核

```sh
node --test native/experiments/jqe-combined/matches.test.mjs
node native/experiments/jqe-combined/matches.mjs replay
node native/experiments/jqe-retest/audit.mjs benchmarks/jqe-combined-2026-11-18/matches.json
```

这些入口不启动搜索或服务，核对实测源码/头文件、两布局12局配对、当前规则棋谱与暗俘记录。CI只运行这些可跨平台复核项，不冒称CI重跑了本机FMA计时。

## 原机实验入口

原始运行要求：原 `.cache/jqe-current` 冻结构建、完整144局复测及32局确认账本、既有FMA普通/消毒器验证均保留，且没有对应运行锁。`common.gate()` 会核验身份并拒绝不完整/变动的前序任务；不能删锁或修改原确认二进制来运行。旧 qcheck 暂停赛事与锁不动。

缓存只写 `.cache/jqe-combined-20261118`，不会修改 `jqe-current`、旧 `jqe-speed` 或任何试玩服务。`pipeline.mjs` 串行构建、验证、规则/线程检查与固定树计时；已有输出时拒绝重跑。`freeze-plan.mjs` 在任何本轮对局结果前只抽取一次两个OS随机布局，并对全部已登记合成布局检查新鲜度。`matches.mjs freeze` 固定源码、二进制、模型与参数；`run-formal.mjs` 按同预算完成12局。`diagnostics.mjs` 仅在比赛完整结束后运行同观察局面的两秒四引擎对照。受控pipeline与正式赛程要求可读额度>=40%，每个受控阶段及每局前检查新鲜额度记录；稳定8766搜索活跃时自身暂停。

同树检查必须完全相等：全部候选、分数、走法、逐层节点；不能扩大容差。规则套件包含揭子、仅吃方可见暗俘、走子撤销；线程套件覆盖1/4工作者、真正127层push/pop与安全保护、8线程16000次只读推理。这些检查及ASan/UBSan不等同TSan。本轮没有扩展到其他网络维度/王位分桶，也没有重跑独立上游推理oracle。

当前比赛只对可证明单方连续三循环长将判负，其他重复待裁，不恢复“最后落子者负”，不当作自动和棋；完整长捉等仍非自动裁判。节点口径、TT条目与总RSS、实际线程利用不同，结果不能包装成全面超过Pika。原JQE32局确认仍只属于原候选，不能与这12局混算。

[完整报告](../../../docs/experiments/jqe-combined.md)与[公开证据](../../../benchmarks/jqe-combined-2026-11-18/)另列速度、胜和负、待裁及技术事件。默认启用需要可靠证据，不另加用户未要求的Pika不劣门槛。
