# 合法观察残差 NNUE 原型

默认引擎保持不变。当前有效实现为 `build-corrected.mjs`；首版 builder/matches 仅作为缓存键遗漏的历史试跑保留，不应再用于新分析或棋力结论。本原型在稳定HCE上添加上限±256分的学习残差：2597个稀疏特征、16单元、红方/旋转换色两个共享权重累加器、clipped ReLU及反对称输出。它没有使用HalfKA将位分桶，也不是Pikafish网络格式。

修复版缓存键包含全部分类型库存，不能只保留HCE使用的库存总数/总价值。`nnue.hpp` 的初始前向建立累加器；走子只增删起终点、翻子后的身份、合法私有库存及行棋方特征；撤销恢复逐步累加器快照。普通评估读取累加器，不重新扫描输入层。因此这是浮点增量NNUE，而非只有全量MLP。`MIST_NNUE_FULL=1` 仅切换独立完整前向参考，用于一致性/开销对照。

特征只取公开明子、暗子的公开角色/暗明标记、当前观察者合法库存、行棋方和观察者。真暗子分配、对方私有暗俘、裁判种子/布局哈希不作为网络输入。搜索中的假设翻子来自原无放回采样器，并不读取实际布子。库存与翻子变化在两个累加器同步更新；根观察者变化会重建独立状态，不能串用累加器。

## 数据与一次训练

数据源固定为三个已公开的自有裁判对局记录，包含48局、8个初始布局。抽取第8步起每两步的两方合法观察，标签只用当时参与策略下的实际终局，不使用引擎评分或全信息最优标签。每布局、布局内每局、局内每观察等权。整个初始布局的所有棋局放在同一分区：训练5布局/30局/1486观察，验证1布局/6局/350观察，测试2布局/12局/836观察。相邻局面没有随机跨分区拆分。

`plan.json` 在训练及正式比赛前固定：随机种子1729，单个16单元模型，120步full-batch Adam，不做超参扫参。仅用验证BCE选epoch；冻结检查点后才计算测试指标。数据JSON一次读入内存，测试分区不进入优化或选模；日志中的 `testTouchedDuringTraining=false` 指未在训练期计算/使用测试指标，不表示文件从未载入内存。采样步数为偶数，原始样本的行棋方偏红；模型的旋转换色反对称约束不能替代更丰富的数据。

没有安装依赖、云训练或外部数据上传。只使用本机已有Python3、NumPy及C++编译器。模型来源和格式见[模型说明](../../../models/experimental/README.md)。

## 复现与独立开关

在项目根目录执行。已提交证据或权重不可覆盖；先在独立工作副本备份它们，或为新轮次选择新目录、计划和布局。数据脚本与训练脚本拒绝覆盖原始数据文件及模型。默认二进制和第三方权重均不写入。

```sh
node native/experiments/nnue/data.mjs
python3 native/experiments/nnue/train.py
node native/experiments/nnue/data-check.mjs
node native/experiments/nnue/check.mjs
node native/experiments/nnue/check-corrected.mjs
node native/experiments/nnue/check-corrected.mjs --sanitize
node native/experiments/nnue/inventory-key.mjs
node native/experiments/nnue/benchmark-corrected.mjs
npm test
export JIEQI_ENGINE_PATH="$PWD/external/pikafish-jieqi-wasm/src/PikaJieQi"
node native/experiments/nnue/matches-corrected.mjs freeze
node native/experiments/nnue/matches-corrected.mjs next
node native/experiments/nnue/verify-corrected.mjs
node native/experiments/nnue/report.mjs
```

构建输出 `.cache/nnue-corrected/mist-nnue`，只有显式选择该二进制并设置 `MIST_NNUE_MODEL` 才加载模型。`common-corrected.mjs` 对实验运行器提供该独立开关，并清除完整前向参考开关；稳定版仍指向原 `.cache/native/mist-core`。没有接入默认网页，未修改用户棋局。

`freeze` 拒绝覆盖正式对局，校验源文件、权重和固定对手哈希，并拒绝复用训练/验证/测试布局。`next` 每次执行一局、锁定防重叠；需要暂停时写 `.cache/nnue-corrected/STOP`，当前一手结束后保存。恢复前核实额度、进程及哈希，再移除停止标志。对局开始后不再训练、换权重或改预算。所有技术失败和未决保留。

本轮样本、计时及许可/隐私核查见[报告](../../../docs/experiments/nnue.md)。发布是保存可复现原型，不表示默认启用或已经超过Pika。

首版7局试跑及两次技术超时保留在 `benchmarks/nnue/`，修复版正式对照在 `benchmarks/nnue/corrected/`；两者不合并成绩。修复不重复训练，模型SHA不变；`plan-corrected.json` 记录一次纠正输入依赖遗漏后的有效性阶段。
