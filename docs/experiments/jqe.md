# JQE it014 可选评估器接入

日期：2026-11-09。**实验代码可用，但不替换默认 HCE；试玩服务默认关闭。** 这是把 jqe 的网络评估接进 Mist 原有搜索，不是把 jqe 整个引擎换名。上游公布的战绩不能移用为本项目战绩。

## 来源、许可与冻结范围

- 上游：[devinokeefe/jieqi](https://github.com/devinokeefe/jieqi)，固定提交 `331a6e612a038c4a04cf980f7b9482910fd50078`。
- 原始网络 `engine/nets/it014.jqn`，1,547,356 字节，SHA256 `f90bd44e8ee244405eb08eb4f784e3f156900f0691f651b5124d50032f8ba160`。本仓库 `models/jqe/it014.jqn` 字节不变。
- 固定上游 README 明确代码和网络均为 MIT。保留 Copyright (c) 2026 Devin O'Keefe、完整 MIT 文本与来源。见 [模型说明](../../models/jqe/README.md)、[许可](../../models/jqe/LICENSE)、[第三方声明](../../THIRD_PARTY_NOTICES.md)。
- 默认 C++ 搜索源码 SHA256 `3fa98d62f3c1636b831680fcd5dcbf88f9339e966ed1b8e2f8a170b83afcbfb0` 未改。实验控制组复用既有 64 MiB 有界 map arena，候选只替换静态评估并增加所需库存缓存键、累加器和撤销存储。
- 不引入上游搜索、走子规则、裁判、训练数据或对手网络。参照推理只在测试时链接固定上游 `nnue.cpp`，不把上游规则/搜索作为 oracle 的一部分。

## 输入、信息边界与分值

JQN1 v1：每视角 1470 个输入，16 种相对棋子 × 90 格，加双方各 15 个库存阈值；共享 256 列加 PSQT，随后 `[行棋方,对手]` 的 512→16→32→1。隐藏棋子只输入 DARK，既不输入采样身份，也不输入真实身份。Mist 的 y=0 是黑方底线；适配按视角作竖直翻转，文件不反转。Mist 的 C/A 顺序与上游 A/C 顺序显式映射。

库存始终属于固定根观察者：揭子从对应类型库存扣除；根观察者吃到对方暗子，扣除已知被吃类型；自己暗子被对方吃掉且不可见时，身份仍留在未知池。搜索中未来揭子来自本项目无放回采样世界，并非实际暗布局。根 HTTP/JS 桥拒绝携带真实暗子身份的观察。

网络自然输出是给定行棋方分值，不强行假设两个视角反对称。固定变换为 `raw × 600 / 430`：600 是 Mist 原有根汇总 logistic 标度，430 是上游公布 it014 训练拟合标度。没有按本轮对赛结果调参。将死、困毙、根重复判负、合法走法、搜索循环近似、采样和根候选汇总仍由 Mist 决定。

默认实验模式为便携量化推理：int16 特征累加器、int8 第一层，模拟上游整数环绕及反量化/FMA 次序。另提供浮点对照，未更换原始网络文件。模型只在进程启动加载；丢失、截断、非有限字段、尺寸不合法或多余数据明确报错，不静默回退 HCE。

分类型库存加入置换表与路径键，避免同总数/同 HCE 价值、不同类型池碰撞。每个 Search 的神经撤销快照一次性分配在堆上，递归层只持引用，避免 macOS 小工作线程栈被大累加器压满；超时沿原异常路径完整撤销。模型只读共享，状态按采样世界隔离。

## 验证

机器：x86-64 macOS，Apple clang 17，Node 25.6.0；无 fast-math。普通和 AddressSanitizer/UndefinedBehaviorSanitizer 都运行。记录在 [benchmarks/jqe](../../benchmarks/jqe/)。

- `check.json` / `check-sanitized.json`：两模式合计 72 个观察、2448 个合法转换、1416 次揭子、28 次观察者已知暗吃、56 次不可见暗吃。逐局面与未修改的上游 `nnue.cpp` 对照，原始整数分值差最大 **0**，上游累加器差 **0**，量化增量/重建严格相同；浮点增量累加最大误差 2.18e-6。还验证特征索引、竖直换色、未知身份不影响根输入、三组完整搜索增量/重建一致、五类坏文件清洁拒绝。
- `rules.json` / `rules-sanitized.json`：414 组观察规则检查、11874 个走子/撤销转换，与独立 JS 规则逐着比较，含将死、困毙、马腿/象眼/炮架、私有暗吃和可达局面。
- `thread-check.json`：五局面 1/4 工作线程逐层候选、分值、节点完全一致。全明局面专门复制同一世界以强制多线程测试，不把它当正常对局采样。ASan/UBSan 超时撤销和后续请求恢复通过；异步线程上 127 层实际 push/pop 与安全界限通过；16000 次并发只读评估相同。这不是深度127完整搜索，也不是 ThreadSanitizer 证明。
- `control-check.json`：有界控制组与稳定核心五个固定局面完整2层同节点同分。
- `integration.json`：8 个根重复裁定、类型池同总值不同键、完整候选、取消与恢复。2秒预算下初始局两组均4层、中局均5层；全明10子残局控制组7层、候选5～6层。不同评估改变搜索树，不能据此宣称纯推理速度比。12次请求全部在约1.929～1.934秒内完成；取消回收约4毫秒，恢复完成3层。
- `service.json`：隔离 HTTP、Origin/Host 边界、暗子身份拒绝、模型参数不可由请求/后续环境变化改写、合法流式返回与取消通过。短暂测试服务已关闭，未启动长期试玩服务。该检查不是完整真实浏览器视觉 QA。
- 既有回归：`npm test -- --test-concurrency=1` 171/171；原生规则72组、2172转换、16搜索检查；稳定服务8/8。默认页面和引擎文件未改。

## 同资源新布局换色筛选

计划提前冻结在 [plan.json](../../native/experiments/jqe/plan.json)。2个新布局、每布局双方换色；候选对控制4局、候选对固定Pika4局、控制对同Pika4局，共12局。种子只由本项目合成裁判使用，从不送给引擎；输入只含各自合法观察。布局哈希与历史实验/训练记录查重后才冻结。

每步均2000毫秒，最多4搜索线程，64 MiB TT预算。Mist 暗局8样本、全明1样本，两臂相同40毫秒host预留和最多35毫秒核心预留。准备观察、采样、协议、搜索和结束回收计入着时；持久进程 ready 在着时外。不同实现总RSS不等，候选神经快照、模型和更大库存键占额外内存；相同TT字节不代表同条目数。

固定Pika为项目既有 `23b9466c981f0f3a1133f92de1a6f86406c4eccc` classical build，4线程64MiB，二进制哈希和实际配置记录在对赛清单。公共裁判使用本项目规则：将死/困毙优先，第三次同公开盘面+行棋方由造成者判负，120半回合无吃子和棋，400半回合上限记未决而非和棋；内部循环近似与Pika内部规则仍有差异。

全部12局、1075半回合完成并逐着重放通过，未调整参数或补赛替换失败局。原始 [matches.json](../../benchmarks/jqe/matches.json)、[统计](../../benchmarks/jqe/match-statistics.json)、[重放检查](../../benchmarks/jqe/replay.json) 均保留。

| 比较（前者视角） | 胜 | 和 | 负 | 得分率 | 技术失败 / 未决 |
|---|---:|---:|---:|---:|---:|
| JQE候选 vs 稳定HCE控制 | 1 | 0 | 3 | 25% | 0 / 0 |
| JQE候选 vs 固定Pika | 2 | 0 | 2 | 50% | 0 / 0 |
| 同批稳定HCE控制 vs 固定Pika | 1 | 0 | 3 | 25% | 0 / 0 |

**重要：候选的三场胜局（对控制1场、对Pika2场）全部是公共重复规则判对手负，不是将死/困毙胜。** [终局审计](../../benchmarks/jqe/repetition-outcomes.json)记录重复前合法应手；两场Pika均只剩一个合法应手且该着必然第三次重复。这是本项目固定裁判下的合法得分，不是协议故障，也不能移植为另一套重复规则下的胜局。候选对稳定版为1胜3负，因此这批结果**不支持默认替换或“已超越”结论**；相对Pika多1分只是两个布局的小样本结果。

全部1075个着法合法；技术失败、清理失败、未决均0。候选357次请求，host截止杀进程0、保底0；候选着时p50 1931.32毫秒、p95 1932.05、最大1934.44。控制320次，最大1934.10；Pika398次，最大1961.68。均在2000毫秒预算内，也未使用60毫秒技术宽限。候选/控制整批完整深度中位数均5，但对局局面不同，这不是同树性能比较。

结论：输入和推理接入得到验证，量化版可以作为独立研究/试玩选项；收益不稳定，保持默认HCE与关闭试玩的状态。

## 使用与复现

所有命令在仓库根目录运行。普通网页仍用 `npm start`，不会读取本网络。实验不会自动启动；若主动需要试玩，可执行：

```sh
node native/experiments/jqe/preview.mjs
# 手动打开 http://127.0.0.1:8771/；Ctrl+C 关闭。
```

实验页有“退出实验，返回稳定版”入口，稳定版需要另行运行；选 JS 回退就不使用 JQE。不要把实验服务当作默认部署。当前未启动该服务。

正确性复现需要固定上游源码供原始推理 oracle 使用，且该 oracle 需要 x86 AVX2/FMA；便携候选本身不要求AVX2，但尚未在原生ARM硬件验证。

```sh
git clone https://github.com/devinokeefe/jieqi.git external/jqe
git -C external/jqe checkout --detach 331a6e612a038c4a04cf980f7b9482910fd50078
node --test native/experiments/jqe/source.test.mjs
node native/experiments/jqe/check.mjs
node native/experiments/jqe/check.mjs --sanitize
node native/experiments/jqe/rules.mjs
node native/experiments/jqe/rules.mjs --sanitize
node native/experiments/jqe/thread-check.mjs
node native/experiments/jqe/build.mjs --control
node native/experiments/jqe/control-check.mjs
node native/experiments/jqe/integration.mjs
node --test native/experiments/jqe/service-check.mjs
```

检查脚本会写对应实验JSON；正式结果先另存或使用独立checkout。对赛 `freeze` 拒绝覆盖已有 `.cache/jqe/matches.json`，逐局可恢复；使用 `run` 前须满足同源码/头文件/模型/二进制的全部前置检查并准备固定Pika。`matches.mjs replay` 只复核已公开合成棋谱，不启动引擎。

限制：采样搜索仍有既有信息集/策略融合近似；本次没有改换搜索来消除它。仅两个独立布局，换色局相关；没有大样本置信证明或跨机器棋力结论。上游训练分布、规则、分值标定和本项目存在差异；未重新训练或调参。正确性通过不等于棋力改善，实验交付不等于默认启用。
