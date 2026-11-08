# C8 合成实验依据（2026-11-08）

本目录只保存本轮合成局面和实验输出，没有用户棋局、凭据、编译产物或完整裁判暗子状态。可选 C8 未默认启用。结论与限制以 [实验报告](../../../docs/experiments/search-speed-c8.md) 为准，命令见 [C8 说明](../../../native/experiments/search-speed/README-C8.md)。

## 文件与口径

- `confirmation-plan.json`：计时前冻结的资源、分组、全部六种执行顺序和门槛。平均 NPS 比至少 1.03、最差持续搜索局面至少 0.97；本轮后一个门槛失败。
- `confirmation-fixtures.json`：7 个新生成观察视角、1 个重复全暗初始控制、4 个已见困难残局。后来复跑这些文件不再是新留出。名称中的 `clock-geometry-confirm` 是冻结时沿用的名称，不表示最终候选包含时钟修改。
- `input-hashes.json`：计时前冻结的 C8/C7 源码与二进制、Pika 和局面哈希。
- `confirmation.json`：216 请求的完整顺序、搜索耗时、独立就绪耗时、节点、深度及技术状态；`confirmation-summary.json` 为按局面中位数汇总。跨引擎节点和深度口径不同，不是棋力指标。
- `fixed-work.json`：64 次有限深度请求，逐对完整候选、分数、迭代和节点相同；`fixed-work-summary.json` 汇总各局面核心耗时中位数比。加速比是 C7 耗时除以 C8 耗时。
- `tests.json`：本轮 Release、ASan/UBSan、TSan、无 TT 参考、计时与取消检查。npm 共 157 项通过。路径和编译器安装目录已剔除；哈希保留。不同平台二进制哈希可以不同。
- `match-plan.json`：赛前固定两个新布局、换色、三名对手与 12 局总数，不能按中途比分增减样本。
- `matches.json`：12 局公开观察日志和逐手统计。C8 对 C7 为 1 胜 3 负，对 Pika 为 0 胜 4 负，对生产版诊断组为 2 胜 2 负，无和棋、未决或技术失败。`index` 从 0 开始，`ply` 从 1 开始；`candidateSide` 为 C8 颜色。得分率为（胜 + 0.5 × 和）/ 已决局数。
- `match-statistics.json`：正常局、技术事件、未决、host stop 分开统计。C8 的 2 次 host stop 均合法按时返回，不是技术判负；没有 fallback。未改生产版没有硬 64 MiB TT arena，内部重复处理更旧，仅是诊断，不能混称同资源主对照。
- `replay.json`：独立公开回放通过 12 局、957 手及 27 次暗俘协议检查。合成种子是裁判复现材料，禁止输入引擎；日志不包含对手私人暗俘身份。`pikaToken` 是棋谱协议记号，不是认证令牌。
- `development.json`：已见开发集上的几何候选筛查，只作开发依据，不能当留出。
- `rejected-clock-screen.json`：未采用的时钟间隔筛查。最终 C8 仍保持 C7 的原计时和取消节奏。
- `profile-summary.json`：仅对自建合成进程采样的热点摘要；包含等待线程，计数不是 CPU 占比。原始系统路径与 PID 不发布。

## 最小独立复核

在仓库根目录执行，无需 Pika 或比赛进程：

```sh
node --test native/experiments/search-speed/c8-source.test.mjs
node native/experiments/search-speed/replay-public.mjs benchmarks/search-speed/c8-2026-11-08/matches.json
```

性能复跑需要既有固定 Pika、对应工具链和空闲 CPU，详见构建说明。正式比赛的 `freeze` 会拒绝仓库和本地记录中已见过的布局，不能把本目录种子重赛后称为新实验。`export-c8.mjs` 是本轮已完成缓存的校验/脱敏导出器，需要原本地校验日志与冻结二进制；公开 JSON 和 replay 命令可独立核查比赛，但不能重建已排除的私人路径或原机器计时。
