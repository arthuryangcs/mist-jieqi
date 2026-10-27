# 同一行棋方循环路径扫描实验

当前搜索每条边调用push并翻转行棋方，路径Key含行棋方、两个棋盘哈希、双方私有库存数量/价值及延伸字段。只在判定搜索内路径循环时，按首项与当前方的关系选起点，保持原前向顺序，再隔一项比较完整Key。循环仍返回原0分并增加原cycles计数；路径push/pop与超时恢复不变。没有更改根第三次公开重复判负、规则、概率、估值、排序、TT或预算，不叠加其他实验。

前提是搜索路径行棋方交替，当前核心没有空步或不落子而继续追加同方路径项的递归。PVS重搜在前次调用返回、路径撤回后进行，不破坏交替。ASan/UBSan及探针对每次查询检查此前提，并将结果与原std::find完整扫描比较。仅筛掉行棋方不匹配的历史项；私有库存等键字段仍完整比较，不能只比较棋盘哈希。本小样本不自动启用默认引擎。

在项目根目录执行，重跑前先备份已提交证据并用独立工作副本/新目录。不得覆盖正式结果或按输赢调参。

```sh
node native/experiments/cycle-parity/check.mjs
node native/experiments/cycle-parity/check.mjs --sanitize
node native/experiments/cycle-parity/cycle-probe.mjs
node native/experiments/cycle-parity/parallel-check.mjs
npm test
node native/experiments/cycle-parity/benchmark.mjs
export JIEQI_ENGINE_PATH="$PWD/external/pikafish-jieqi-wasm/src/PikaJieQi"
node native/experiments/cycle-parity/matches.mjs freeze
node native/experiments/cycle-parity/matches.mjs next
node native/experiments/cycle-parity/verify.mjs
node native/experiments/cycle-parity/report.mjs
```

`next` 一次一局并加锁；写 `.cache/cycle-parity/STOP` 可在当前一步后保存暂停。恢复前检查额度、进程、指纹，再移除标志。全部技术失败与未决保留。构建只用本机已有C++17/Node工具，产物在忽略目录，不改稳定源码和二进制。编译工具复用standpat/build.mjs参数，不启用其stand-pat语义。

结果、资源口径与小样本限制见[报告](../../../docs/experiments/cycle-parity.md)。本轮不改界面，不做浏览器验收或绕过先前访问限制。
