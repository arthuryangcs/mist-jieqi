# 有限明子将军静态搜索实验

本轮为本地独立实验，默认 `native/search.cpp` 与 `.cache/native/mist-core` 保持原样。没有提交、推送、上传代码或数据；用户棋局和页面不参与实验。

## 诊断结论与单一改动

先前 AB 对照的第3局只用于诊断。过滤后的红方观察、可见信息种子和8个平衡样本可复现 `i0i2` 的选择。该格恰好采到车2、马1、士2、兵3；稳定版到第2层已识别6个立即将杀分支，终局效用聚合与独立JS公式一致。明子防守 `c3e5` 到第4层在8个样本中全败，故不能把选择揭子视作漏看一步，也不能强加“少冒险就更好”的结论。各层逐样本分数保存在 `benchmarks/mate-proof/diagnosis.json`，不是裁判暗子分配。

可验证的前沿缺口是：静态搜索只搜吃子/应将，在非将军叶子漏掉对手的非吃子将杀。本试验在静态搜索中加入**每条线最多一次、仅已明置棋子的合法非吃子将军着**，仍受原有qleft与总深度/时间限制。检查stand-pat和困毙的原次序保留；只在需要继续静态搜索且预算尚有时生成检查着。不为暗子读隐藏身份寻找检查着，不改变估值、身份池/采样、终局聚合、主深度、排序中原有着法权重或重复规则，也不叠加旧几何表、插入排序、风险惩罚、NNUE等试验。

这是针对Mist的独立实现，不是复制AB的静态搜索。AB普通静态搜索同样主要搜吃子和应将；其优势机制包含明确的库存概率节点、分支归一化与NNUE局面信息，不能说“AB用了这种明子将军扩展”。上游固定源码引用和差异在实验报告中说明；没有把GPL第三方源码或模型放入本实验目录。

## 代码与复现

在项目根目录运行。已有冻结证据不可覆盖；复跑需另建工作副本/输出目录并使用新的验证布局。

```sh
node native/experiments/mate-proof/build.mjs
node native/experiments/mate-proof/diagnose.mjs
node native/experiments/mate-proof/build.mjs --trial --trace
node native/experiments/mate-proof/build.mjs --trial
node native/experiments/mate-proof/check.mjs
node native/experiments/mate-proof/build.mjs --trial --sanitize
node native/experiments/mate-proof/check.mjs --sanitize
npm test
node native/experiments/mate-proof/benchmark.mjs
node native/experiments/mate-proof/matches.mjs freeze
node native/experiments/mate-proof/matches.mjs next
node native/experiments/mate-proof/matches.mjs status
node native/experiments/mate-proof/verify.mjs
node native/experiments/mate-proof/report.mjs
```

`build.mjs`仅从固定SHA的稳定源码生成新缓存文件，复用本机已有编译参数，不安装工具。无算法变化的diagnostic版本只增加每个根候选的逐样本分数输出；正式trial不携带该跟踪开销。release/诊断/ASan+UBSan结果的一致性检查使用固定节点上限，排除计时字段。

`check.mjs`覆盖红黑镜像、6/8立即将杀分支、概率聚合、合法走法、暗俘的分方可见性、改动未知真身不影响编码、正常与超时/节点中断后的棋盘/将位/库存/哈希/路径恢复。镜像局面不带旧方重复历史，不作为正式比赛布局。

正式对手仍为先前固定的AB-JChess v0.2d/fe35d87c，原权重哈希05c13ac6…、本机通用SSE2构建，4搜索线程、64MiB Hash、github规则，不改源码/模型。准备步骤及许可范围见 `native/experiments/ab-jchess/README.md`。模型已实际加载，不是只设置文件名。

## 冻结验证方案

`plan.json`在正式比赛前固定4个新布局、24局：8局试验对稳定；稳定/试验分别对AB各8局，均换色配对。每手2000ms+统一60ms技术宽限，Mist暗局8样本/最多4世界线程、全明1样本/线程，AB4线程；就绪在计时外，视图、采样、根规则、完整历史/FEN校验、IPC、搜索和强停/回收计时。与诊断样本、旧16局不同，不能混算。

`next`加锁并只下一局，记录每手耗时、线程数、合法观察指纹、公开揭示与暗吃令牌、真实终局/技术失败/未决。向 `.cache/mate-proof/STOP` 写标志可在当前一步后保存；恢复前检查实际额度、进程、指纹再移除标志。额度工具实际可读剩余低于40%停止新增工作，未知周期不猜测。不要删除活跃PID的锁。

外部裁判统一第三次公开重复走子方负、将死/困毙优先、120闲半回合和、400封顶未决。AB根约束过滤直接第三次重复判负的走法；内部循环、80半回合及揭子计数差异保持披露。完整回放验证独立核对每步及私有暗俘。全部技术失败和未决保留，不选择性重赛，不按途中胜负改变参数或样本。

这是筛查，不凭4个相关布局或更深层数宣称棋力提升，不自动切换默认版本；负结果也完整报告。没有浏览器UI改动或视觉验收，不绕过此前访问限制。
