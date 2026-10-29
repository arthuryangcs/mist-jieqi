# AB-JChess 本地对战适配

固定对手为 [AB-JChess v0.2d](https://github.com/lxsgx23/AB-JChess/releases/tag/v0.2d)，提交 `fe35d87c7553fd23e8aab3a1dde7e712f286b416`。不混用 main 或 v0.2b。源码 GPL-3.0；官方发行包没有为 NNUE 提供单独许可证，运行时还带有禁止转售提示。本任务只在本机使用，未分发对手源码、模型或二进制，也不据此推定权重再发布许可。

## 版本和构建

已有安装的 Node、clang++ 和项目 SDK 头文件足够，无新增软件安装。`build.mjs` 检查固定提交、上游工作区干净和模型 SHA 后，直接编译 27 个 C++ 源文件；不运行上游安装、训练或 PGO 脚本。模型取自该标签的官方 `0.2d_bmi2.zip`，仅提取 `.nnue`，不执行包内 Windows EXE。

- NNUE `abjchess-20261010.nnue`：143667546 字节，SHA256 `05c13ac64f5b8ede77cfdc408d399d1f235564ba0999e2c768bebaeedb1db761`。
- 官方压缩包 SHA256：`01d3d539b1d3c50371132401d70c441364ae1c2e9d6e4121f83143f2fe1b3a4e`。
- 本机 AB 二进制 SHA256：`a48c64cd4d959c3fa5e51b32a2260c27cb93023551d0a90e075577c29e86cf42`。
- 固定稳定 Mist 二进制 SHA256：`5c68913e2035093465cb3807ea81604839023daa884d0c0c66ba65f5958a2d23`，HCE，未改变默认核心。

CPU 特性 `sysctl` 查询被系统拒绝，没有重试或改道查询。构建使用已知 x86_64 基线 SSE2，不启用 BMI2/AVX2；NNUE 实测 `head_backend=scalar`。因此结果只代表此通用 Mac 构建，不能当作官方 BMI2 发行版本的最佳性能。完整编译参数和文件 SHA 在 `benchmarks/ab-jchess/build.json`，审计范围在 `audit.json`。源码检查不构成无风险保证。

## 信息与规则

`adapter.mjs` 接受经过 `publicState` 过滤的观察者视图。移动暗子时追加公开身份；暗吃仅对固定 AB 方是吃子方时追加其合法知道的俘虏身份。未知暗吃不追加占位符。本版本长度为 4/5/6 的可变后缀协议，不能复用旧 Pika 的固定 `XX` 协议。每次搜索回放完整合法历史，并校验棋盘、行棋方、剩余池及回合数。裁判隐藏布局和种子只保存在本地复盘数据，不传给引擎。

AB 设置 `Threads=4`、`Hash=64`、`ChasingRule=github`、`Move Overhead=0`。Mist 暗局面 8 样本、最多 4 个世界搜索线程；明棋只用 1 样本/线程。两者不是相同的算法或相同总内存。JS 使用 Node 调度，不使用浏览器 Web Worker；每次只运行一方搜索。

外部裁判统一使用当前 Mist 规则：无合法着为负；同一公开棋盘及行棋方第三次出现由走子方判负；120 个无吃子、无揭子半回合为和；400 半回合上限为未决。AB 根节点通过 `searchmoves` 排除立即第三次重复判负的走法（有其他选择时）。**深层内部规则未做到相同**：AB github 循环规则不等同于无条件第三次判负；其内部 80 半回合判和及暗子走动时的计数方式也与裁判不同。保留而不隐藏计数差异，不修改固定上游或清空历史。这是比较局限。

每手名义预算 2000ms，统一 60ms 技术宽限。预加载模型、线程就绪放在计时外；观察视图、根过滤、采样、完整历史/FEN 校验、IPC、搜索和强停后的进程回收均计时。每手保存实际耗时、内部报告、线程数及日志。技术失败保留并单列，不能删除重赛替换。

## 复现与检查

在工程根目录运行；已冻结证据不得覆盖。重跑应备份结果并另用工作副本及新布局。

```sh
node native/experiments/ab-jchess/build.mjs
node native/experiments/ab-jchess/check.mjs
node native/experiments/ab-jchess/matches.mjs freeze
node native/experiments/ab-jchess/matches.mjs next
node native/experiments/ab-jchess/matches.mjs status
node native/experiments/ab-jchess/verify.mjs
```

`freeze` 固定新布局、文件哈希、2 秒预算和 8 局后按无技术故障及实际额度决定是否扩至 16 局的计划。`next` 加锁并只下一局；扩展阶段还需在证据中记录受支持额度工具的真实新检查。向 `.cache/ab-jchess/STOP` 写入标记，在当前一步后保存暂停，恢复前先检查额度、进程及指纹。不要删除有活跃 PID 的锁。

`check.mjs` 检查完整历史、合法走法、可变身份后缀、未知暗吃不泄漏、相同观察视图不受真实暗子分配影响，以及第三次重复的裁判和根过滤。`verify.mjs` 从原布局逐步独立回放每局，核验观察视图、俘虏权限、令牌、合法性、耗时、终局、线程上限和实际 FEN。日志含裁判真值是为了本地复盘，不可把该文件当引擎输入或合法观察者训练数据。

本轮仅交付本地代码和报告，不提交或推送，不更改用户棋局、页面、默认引擎，不绕过此前浏览器访问限制。小样本无法给出总体棋力或 Elo 结论。
