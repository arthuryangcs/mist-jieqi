# 独立搜索速度实验

保持原 HCE、暗局 8 个合法采样世界和全部根着覆盖。全明局面只需 1 个世界。没有 NNUE、LMR、空步剪枝或静态主动将军。

这是**非默认**的完整实验核心。`npm start`、页面、默认二进制及用户棋局均不切换。代码沿用本项目 GPL-3.0；没有新增第三方代码、权重或依赖。

## 构建与检查

需要已有 Node.js 20+、C++17 编译器；默认 clang++，可设置 CXX。不自动安装或联网。所有产物写入被忽略的 `.cache/native/search-speed/`。

```sh
node native/experiments/search-speed/build.mjs
node native/experiments/search-speed/check.mjs
node native/experiments/search-speed/reference-check.mjs
node native/experiments/search-speed/rules.mjs
node native/experiments/search-speed/check.mjs --sanitize
node native/experiments/search-speed/reference-check.mjs --sanitize
node native/experiments/search-speed/rules.mjs --sanitize
node native/experiments/search-speed/check.mjs --tsan
```

TSan 与 ASan 分开构建。CI 不下载 Pika，只做独立规则、参考搜索、隐私、取消及 ASan/UBSan 检查。本机另实测 TSan。

`check` 使用固定世界的无 TT / 无 PVS alpha-beta 参考；`reference-check` 另含 JS 穷举、TT 窄窗转全窗、精确剩余深度、杀棋距离、双方重复判负及零节点结算。`rules` 与 JS 核对合法着、将军、HCE、翻子、暗俘库存及撤销。

## 搜索边界

- 4 个搜索线程上限。暗局按根着×世界调度，同一世界状态始终独占；全明局面按私有根状态调度，少根着时拆分下一实际走子。概率身份展开不增加走子层数。
- TT 总分配预算 64 MiB，包含表节点和桶；这不是整个进程 RSS。缓存身份包含样本棋盘、观察者、库存、规则计数与重复历史，只复用相同剩余深度的评分。线程不共享可变棋盘、TT 或历史排序表。
- 原 HCE 用等价增量更新。仅正深度节点构造 TT 键；静态搜索仍保留完整规则历史。静态 stand-pat 剪枝前证明存在合法着，困毙仍判负。
- 时间控制无人工主深度上限；保留 127 半回合路径的栈/整数安全保护。主深度、选择性路径、完整迭代和规则零节点结算分别统计。静态延伸包含在 selDepth 中。
- `ExperimentalEngine.search(publicState, 2000)` 只接收合法观察者信息，采样种子由可见信息决定。未知被吃暗子和棋盘暗子不得携带 `type`。40 ms 主机预留和原核心最多 35 ms 预留保持；重叠请求拒绝，取消回收自持进程，旧结果不得更新新请求。

## 性能复现

`benchmark-fixtures.json` 是 12 个合成公开局面，包含全暗、合法随机走子的中局和库存合法的编辑残局；后者不声称可达。没有用户棋局或裁判暗子分配。固定工作、固定时间和棋力结论须分开。

```sh
node native/experiments/search-speed/benchmark.mjs
```

该命令有实际计算成本：12 局面×3 次×2 引擎，每次 2 秒，串行执行且拒绝覆盖旧结果。需要本机已有固定 Pika `bcc83f88ee18760e60903d1a3aaa61ef6f70f2c9`，并通过已有适配器的精确二进制哈希检查；不下载、不编译、不上传 Pika。该哈希对应本次 Mac 的 HCE 构建，其他平台需单独审核对照构建，不能伪装成同一二进制。Pika 设 Threads=4、Hash=64 MiB、Move Overhead=0，并规范为自身红方视角。

各引擎使用自己的原生节点定义，Mist 节点已经累加世界，不能再乘 8。原生 NPS 不能当作等量工作或棋力；短终局证明与持续 2 秒搜索单列。FEN 单局面测速不重建 Pika 历史，对局测试才传完整合法观察历史。

历史实测、负结果、新布局对战与限制见 [实验报告](../../../docs/experiments/search-speed.md)。本地比赛脚本 `matches.mjs` 采用预先冻结计划、串行锁和逐手持久化；需要独立缓存目录里的 `plan.json`、`selection.json` 与稳定二进制副本，且拒绝已参与旧赛的布局，不是默认应用入口。旧暂停赛事不会被恢复。

## C6 可选实验

[C6 构建与复现说明](README-C6.md) · [2026-11-03 报告](../../../docs/experiments/search-speed-c6.md)。C6 必须显式选择，默认引擎不变。
