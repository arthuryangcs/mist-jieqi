# JQE 独立确认批次（已完成）

**最终结果：默认保持HCE。** 16新布局32局、2233半回合，16胜0和13负3待裁，技术/清理失败0。布局4正4负8平，精确单侧p=0.63671875，最坏得分50%，即使未决全赢也只有59.375%；两个预注册门槛均未达到，不扩样本、不改阈值。完整重放及独立审计通过，见[中文确认报告](../../docs/experiments/jqe-confirm.md)、[逐字节导出与哈希清单](export-manifest.json)。Pika不劣是助手旧附加标准，并非用户要求，本确认仅比较HCE。

前144局作为探索，不合并到本批显著性检验，也不改变其原有“未达到默认启用门槛”结论。本批是独立的新确认实验，不是对旧批次事后放宽判据。

赛前固定16个OS加密随机新布局，每布局红黑换色，共32局，仅原冻结JQE候选对原HCE对照。候选/对照使用 `.cache/jqe-current` 原二进制，plan.json固定其原144局哈希及模型/关键源码哈希。每步2秒、最多4搜索线程、64MiB TT，暗局8世界/全明1世界。当前规则、私有观测、长将责任、重复待裁决保持不变。没有Pika对赛或Pika二进制依赖。冻结时检查全部已登记历史布局，包括前144局。

## 固定判据

每布局两局平均分，未决对JQE按0，仅用于保守统计，不改原裁决。均值大于0.5为positive、小于0.5为negative、等于0.5为tie。排除ties后，n=positive+negative，单侧精确符号检验 p=P[Binomial(n,0.5)>=positive]。要求 p<=0.05 且全部32局最坏情形总得分率>=0.60。

必须完成全部16布局32局，无技术/规则/隐私回归，完整重放和独立审计均通过，才能交给另一步默认启用审查；分析不修改默认值或8766服务。不允许提前停赛、追加样本、改参数或按结果替换布局。未完整结束不输出中期p值或通过结论。若基础设施故障必须暂停诊断，保留结果，不补抽替代局。

符号检验检验独立布局中，条件于非平局布局的获胜倾向，不是总体平均分的精确置信区间，更不是Elo置信区间。全部ties时p=1。数学例：5positive/0negative的p=0.03125；4positive/0negative的p=0.0625。

## 接口

- 轻量测试：`node --test native/experiments/jqe-confirm/matches.test.mjs`。
- 独占CPU任务结束、前置检查完毕才可冻结：`node native/experiments/jqe-confirm/matches.mjs freeze`。
- `run`串行运行；`next`仅运行一局；`status`查看；`.cache/jqe-confirm/STOP`在安全边界暂停。
- 账本 `.cache/jqe-confirm/matches.json`；只增新证据，不改历史批次。
- 重放：`node native/experiments/jqe-confirm/matches.mjs replay INPUT.json`。
- 独立审计复用已修正的纯离线审计器：`node native/experiments/jqe-retest/audit.mjs INPUT.json OUTPUT.json`，支持任意任务数。
- 分析：`node native/experiments/jqe-confirm/analysis.mjs INPUT.json REPLAY.json AUDIT.json`。完整性与输入哈希必须一致；无这两份证据时最多报告统计门槛，不能满足默认审查条件。

预估时间依实际局长而定，32×400×2秒的理论搜索上限约7.11小时，另加开销。冻结后不改源、二进制、计划和判据；快照位于忽略缓存，不公开原生二进制。
