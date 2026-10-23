# 将帅安全几何表实验

隔离原型，默认核心未修改。把 `legalInto()` 的行列/相邻斜线判断换成启动时计算的 90×90 字节表。表只含棋盘坐标，不含棋子身份、采样结果或跨局信息。仍由原来的完整将军检查决定敏感走法是否合法。

`build.mjs` 对稳定源码做精确补丁，只生成 `.cache/king-geometry/` 中的二进制。稳定版、试验版与固定第三方的源码/二进制哈希均核实；不下载第三方，不覆盖默认二进制。固定对手需使用此前已经审计并获授权的本机 PikaJieQi。哈希不匹配时先查明版本及编译环境，不能直接删掉核验。

```sh
node native/experiments/king-geometry/check.mjs
node native/experiments/king-geometry/check.mjs --sanitize
node native/experiments/king-geometry/benchmark.mjs
node native/experiments/king-geometry/compile-check.mjs
export JIEQI_ENGINE_PATH="$PWD/external/pikafish-jieqi-wasm/src/PikaJieQi"
node native/experiments/king-geometry/matches.mjs freeze
node native/experiments/king-geometry/matches.mjs next
node native/experiments/king-geometry/verify.mjs
node native/experiments/king-geometry/report.mjs
```

已提交记录不可覆盖。复跑前另存证据并选择新输出目录、布局和冻结清单。`freeze` 拒绝覆盖对局文件；`next` 每次只跑一局，执行前核对源文件与二进制，并用进程锁防止自身重叠。比赛前还需检查其他实验是否正在运行。所有搜索串行，每手双方相同名义1000ms、共同60ms宽限；本轮双方宿主额外预留均为0ms，没有重复40ms预留试验。

在 `.cache/king-geometry/STOP` 写入文件可在当前一手结束后保存并暂停。恢复前检查额度、进程和源码哈希，再移除停止文件。报告工具只读比赛记录，生成独立的决策摘要和实验报告。信息边界、重复判负近似、未决与样本限制见[报告](../../../docs/experiments/king-geometry.md)。
