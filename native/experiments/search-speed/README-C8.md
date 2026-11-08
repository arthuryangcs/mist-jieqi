# C8：马、象、士、兵走法几何预计算

C8 是可显式选择的实验版本。默认网页、生产服务、C6/C7 客户端和用户棋局均不变，不启动任何试玩服务。

只把与局面无关的几何计算预先存为 24,480 字节不可变表：马腿、象眼、边界、暗士九宫、暗象不过河，以及兵的前/右/左候选顺序。实际阻挡、目标方和吃子限制仍逐局面检查。将帅与车炮沿用 C7；不安全的王位提示保留旧路径。

搜索、评价、采样、完整根着覆盖、TT、走撤和计时策略均与 C7 相同。没有减少暗子样本、改变节点定义或写死开局。曾筛查的时钟及全延迟排序方案未进入 C8。

## 构建与验证

需要已有 Node.js 20+、C++17 编译器。沿用 GPL-3.0，没有新依赖或第三方代码。

```sh
node --test native/experiments/search-speed/c8-source.test.mjs
node native/experiments/search-speed/build-c8.mjs
node native/experiments/search-speed/check-c8.mjs
node native/experiments/search-speed/rules-c8.mjs
node native/experiments/search-speed/reference-check-c8.mjs
node native/experiments/search-speed/check-c8.mjs --sanitize
node native/experiments/search-speed/rules-c8.mjs --sanitize
node native/experiments/search-speed/reference-check-c8.mjs --sanitize
node native/experiments/search-speed/check-c8.mjs --tsan
node native/experiments/search-speed/rules-c8.mjs --tsan
node native/experiments/search-speed/deadline-c8-check.mjs
```

生成源码 SHA-256 为 `a17db66bebc4cfabe9bc0d48a5f4b1693bb9306b1af5397907a0c601afc80047`。构建结果只写 `.cache/native/search-speed/c8/`。基线 C7 生成源码有独立校验，发生变化时停止构建并要求重新审查。

```js
import { C8Engine } from './native/experiments/search-speed/c8-client.mjs';
import { initial, publicState } from './engine.js';
const engine = new C8Engine();
try {
  console.log(await engine.search(publicState(initial(), 'r'), 2000));
} finally {
  await engine.close();
}
```

客户端只接收当前观察者可见信息，不接收裁判种子、真实暗子布局或对手私人暗俘。

## 复测

先确认没有其他实验占用 CPU。下面两个基准应串行运行，不与编译、测试或对战重叠。

```sh
MIST_C8_FIXED_DIR=.cache/c8-fixed-repeat node native/experiments/search-speed/fixed-work-c8.mjs
MIST_C8_BENCH_DIR=.cache/c8-confirm-repeat node native/experiments/search-speed/benchmark-c8.mjs
```

基准需要已有固定 Pika `bcc83f88`，不会安装或下载。每次选择新的输出目录，旧结果不会被覆盖。公开确认局面已见过，复跑不能再称新留出。

相同工作量验证使用 8 个暗局面、完整 4 层、每个 4 次换序，要求每次逐层节点和完整候选顺序/分数相同。两秒比较另使用冻结的 12 局面与三引擎全部六种顺序。原生节点口径、预留时间、线程利用率与总 RSS 不同，不能把 NPS 比值当棋力。

完整性能、正式对局、负结果、所有测试与限制见 [C8 实验报告](../../../docs/experiments/search-speed-c8.md)。本轮没有 UI 改动，也没有真实浏览器视觉验收。

## 公开棋谱与正式对战入口

无需再次比赛即可独立回放本轮全部公开证据：

```sh
node native/experiments/search-speed/replay-public.mjs benchmarks/search-speed/c8-2026-11-08/matches.json
```

`matches-c8.mjs` 支持 `freeze`、`next`、`status`，以 `MIST_MATCH_DIR` 选择独立目录。新一轮须先完成上述检查，在目录放入 `production` 的诊断用冻结副本、`selection.json`（当前源码/二进制与生产版哈希）和 `plan.json`（结构见本轮 `match-plan.json`，换用未见布局）。然后冻结、逐局串行执行 `next`，不得基于中途比分改变样本；基础设施失败会保留事件并写 STOP 标记。候选、对手、裁判与相关源文件哈希每局检查，改动后不能接着使用旧冻结计划。不要覆盖本轮缓存或用户棋局。

本轮 `export-c8.mjs` 只校验和导出已完成的原实验缓存。可用 `MIST_C8_EXPORT_DIR` 选择新的输出目录；源局面仍按冻结哈希核对，所有棋谱先回放通过再写入目标。构建/计时重跑与历史公开导出不是同一操作。
