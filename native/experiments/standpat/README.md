# 保留困毙检测的静态截断实验

隔离原型，默认核心未修改。仅对非受将的静态节点提前计算原有评分：足以达到beta时，先证明至少有一着合法走法，再返回原评分。困毙仍返回必负分。受将节点、未截断节点、吃子延伸、负深度下限、排序、采样与私人库存规则均沿用稳定版。

不叠加几何表、40ms宿主预留或已知明子奖励，不硬编码开局。构建参数直接取当前稳定构建清单，包含NDEBUG；编译产物只写 `.cache/standpat/`。`qverify.cpp` 和 `diagnostic.mjs` 是测试入口和调用计数，不用于速度测量或正式比赛。发布和ASan/UBSan检查都用独立JS规则核对走法与困毙，并核对原版/试验静态窗口及完整搜索结果。

先在项目根目录确认已有已授权稳定构建和固定对手。首次复现还需 `npm run build:native`；不下载或重编译第三方。哈希不匹配时核实源码和编译环境，不能直接删除冻结条件。

以下命令会生成相应结果。已提交证据必须先另存；在单独工作副本重新生成，或为复跑选择新输出目录、布局和冻结清单，不覆盖正式记录。

```sh
node native/experiments/standpat/check.mjs
node native/experiments/standpat/check.mjs --sanitize
node native/experiments/standpat/parallel-check.mjs
node native/experiments/standpat/benchmark.mjs
npm test
export JIEQI_ENGINE_PATH="$PWD/external/pikafish-jieqi-wasm/src/PikaJieQi"
node native/experiments/standpat/matches.mjs freeze
node native/experiments/standpat/matches.mjs next
node native/experiments/standpat/verify.mjs
node native/experiments/standpat/report.mjs
```

`freeze` 拒绝覆盖对局；`next` 每次只执行一局，先校验源文件和二进制，并用锁防止自身重叠。开始前还需检查其他实验进程。所有搜索串行；Mist两版与Pika均相同名义1000ms、共同60ms宽限，宿主额外预留0ms。两版C++原有的核心提前返回余量保持一致。

在 `.cache/standpat/STOP` 写文件可于当前一手结束后保存暂停。恢复前核实额度、进程及哈希，再移除停止标志。诊断计数只说明调用变化；棋力结果、失败、信息边界和复现依据见[报告](../../../docs/experiments/standpat.md)。发布原型不等于默认启用。
