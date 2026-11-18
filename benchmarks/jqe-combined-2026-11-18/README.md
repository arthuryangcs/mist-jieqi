# JQE组合实验公开证据

本包只有合成布局、合法观察、数值与审计，没有用户棋局、原始裁判私有状态、采样世界、PID、额度、原始CPU采样或可执行文件。模型it014仍引用已有固定MIT权重，不上传新模型。

`matches.json`保留12局和1128半回合。只把三个仓库内构建哈希的绝对路径键规范为相对路径；游戏、参数和结果字段完全一致，见`redaction.json`。`replay.json`和`audit.json`针对公开账本重新生成，输入字节哈希与公开文件匹配；原私有账本仍留在本机，不伪称整个公开账本逐字节未改。其他JSON证据从本轮脱敏输出按字节复制。

- `fixed-work.json`、`summary.json`：60次固定深度4计时，ABBA/BAAB，严格同树。
- `focused-verify.json`、两份`rules`与`thread-check.json`：所述浮点/量化、恢复、规则、ASan/UBSan及并发只读检查；不是TSan。
- `diagnostics.json`、`diagnostics-summary.json`：五同观察局面四引擎各三次、两秒，共60请求；节点单位/报告窗口不同。
- `differential.json`：20个事后诊断、14个不同公开视图，固定步数抽样；不是扩大棋力样本。
- `report.json`：胜和负、待裁范围、技术事件及默认不启用结论；待裁积分范围不是置信区间。
- `freshness.json`：对已登记合成布局的新鲜度检查，不保证外部网络训练数据绝无重叠。

离线执行：`node native/experiments/jqe-combined/matches.mjs replay`，以及`node native/experiments/jqe-retest/audit.mjs benchmarks/jqe-combined-2026-11-18/matches.json`。它们不启动引擎或服务。完整方法与限制见`docs/experiments/jqe-combined.md`；本机原运行复现前提见`native/experiments/jqe-combined/README.md`。不要修改旧缓存锁、原JQE确认候选或用户服务以复跑。
