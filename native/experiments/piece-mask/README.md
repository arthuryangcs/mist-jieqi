# 增量己方棋子位图实验

仅将递归节点中扫描90格查找己方棋子，替换为按格号递增遍历两个64位字；按颜色缓存占位，在stateOf建立、push/pop按起终点与被吃子异或维护。每世界增加32字节派生状态和每次走子/撤销的位操作。根走法生成、棋子候选、合法性、HCE、排序、采样和时限沿用稳定版，不叠加其他实验。位图只有占位/颜色，不包含暗子身份。

`plan.json` 在测量前固定算法、5轮同树基准、两种预算及12局新布局换色规模。不按结果调参。默认源码和二进制不改，不从本小样本自动启用。位图是棋盘派生缓存，不改变TT键语义。ASan/UBSan与专项探针在每次生成时用完整棋盘重建位图，并核对原扫描生成器的完整着法及顺序；中断展开后也检查恢复。

在项目根目录执行。重跑前先另存已提交证据，使用独立工作副本或新计划目录，不覆盖正式结果。

```sh
node native/experiments/piece-mask/check.mjs
node native/experiments/piece-mask/check.mjs --sanitize
node native/experiments/piece-mask/mask-probe.mjs
node native/experiments/piece-mask/parallel-check.mjs
npm test
node native/experiments/piece-mask/benchmark.mjs
export JIEQI_ENGINE_PATH="$PWD/external/pikafish-jieqi-wasm/src/PikaJieQi"
node native/experiments/piece-mask/matches.mjs freeze
node native/experiments/piece-mask/matches.mjs next
node native/experiments/piece-mask/verify.mjs
node native/experiments/piece-mask/report.mjs
```

`next` 一次执行一局并加进程锁；写 `.cache/piece-mask/STOP` 会在当前一步后保存暂停，恢复前核实额度、进程、指纹，再移除标志。布局、权重、参数和代码在正式对局中不得更换，技术失败与未决全部保留。编译器为本机已有Clang，使用ctzll内建，C++17；未验证其他编译器，不下载依赖；产物只写被忽略的 `.cache/piece-mask/`。源码派生与编译器记录包含哈希。共享的standpat/build.mjs只复用当前稳定编译参数与补丁工具，没有启用stand-pat改动。

完整结果及限制见[报告](../../../docs/experiments/piece-mask.md)。本轮不修改界面，也不绕过先前浏览器限制。
