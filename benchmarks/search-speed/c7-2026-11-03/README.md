# C7 合成实验数据

全部局面与棋谱为项目生成的测试输入，不来自用户页面或其他软件。引擎只收到当前观察者视角；裁判随机布局种子仅用于事后回放，不传给搜索器。

- `fixed-work-requests.csv`、`screen-summary.json`：同目标深度 40 请求筛选，另有预热，比较 C6/C7 耗时。暗局节点相同，全明任务存在原有并行调度差异。
- `development-fixtures.json`、`development-requests.csv`：已见开发集，216 请求；原日志中的 `geometry` 表示 C7，`c6` 为 C6。
- `confirmation-fixtures.json`、`confirmation-requests.csv`：252 请求，12 个主要视角加两个已见困难残局；`confirmation-partitions.json` 给出正确分区统计。`confirmation-summary.json` 的全部长局面统计包括困难残局，不能与主要 10 个长局面混用。
- `freshness-proof.json`：冻结的 56 个已见视角哈希及本轮视角分区；只证明相对于所检查项目 fixture 的新颖性。
- `cpu-requests.json`、`cpu-summary.json`：45 次自身子进程 CPU 诊断。`gather` 表示 C7。启动/关闭成本经就绪中位数粗略扣除，不能视为精确系统 CPU 占用率。
- `matches.json`：固定两个新布局、每个布局换色，对 C6、固定 Pika、生产诊断各 4 局；包括原始公开走子、耗时和最后 UCI info。`retained` 表示显式 C6，`production` 仅诊断。
- `match-statistics.json`、`replay.json`、`input-hashes.json`：完整比分、技术事件、回放及固定来源证据。

Mist 的节点数已经合计全部样本，不能再乘 8。Pika 与 Mist 的节点/深度口径不同，NPS 不等于同等有效工作或棋力。短搜索单列延迟，不并入长搜索吞吐结论。完整边界与复现命令见仓库实验报告。
