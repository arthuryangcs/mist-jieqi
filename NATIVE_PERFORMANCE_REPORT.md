# C++ 搜索性能消融（2026-10-19）

本轮在 `b2009959c20966f9cbde687ec15f0246445e5f6c` 的本机 C++ 引擎上，采用走法缓冲复用与排序预评分的组合。五个固定局面、每种变体五次轮换实测，核心时间约提速 **1.55～2.02 倍**。没有改变估值、采样、根候选、稳定排序、规则或剪枝策略；这不是棋力评级。

基线 C++ SHA-256：`9e65d6d86bf60cde9e0e63973464a913f1a164e7f0193ec02152eddb94207e9e`。
采用版 SHA-256：`d539a5ee025e232c6929a48dd753c4c0045180a5d7e9fea0fc6432fcbfc5cb55`。
旧源码完整冻结在 [baseline.cpp](benchmarks/native-perf/baseline.cpp)，不会根据当前生产源码重新构造基线。

## 测量方法和消融

同一台 Intel Core i7-8750H、x86-64、Node v25.6.0、Apple Clang 17；单线程，`-O3 -DNDEBUG -ffp-contract=off`，没有 fast-math。所有变体以相同编译参数构建；二进制路径不同会影响哈希，分别记录，未混用历史二进制计时。

使用已有 `native-benchmark.json` 的同一组五个完整 fixture，包含公开观察、抽样布局和根裁定元数据。开局种子6101、中局7207，暗局8样本；全明残局1样本。没有重新抽样。先各预热到2层，再轮换四个变体的执行顺序；五次取中位数。以下时间是搜索核心时间；`fixed.json` 另存每次包含编码/IPC/解析的墙钟时间、NPS、所有候选、每层完整候选和执行顺序。进程启动单独于稳态搜索，不计入此表。

| 局面 | 主深度 / 样本 | 相同节点 | 基线 ms | 仅预评分 ms | 仅复用缓冲 ms | 两项合用 ms | 合用提速 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 初始全暗 | 3 / 8 | 217,728 | 553.99 | 580.68 | 321.27 | 274.29 | 2.02× |
| 中局2111 / 20步 | 3 / 8 | 68,709 | 176.93 | 170.30 | 96.33 | 88.71 | 1.99× |
| 中局2111 / 44步 | 3 / 8 | 109,718 | 254.39 | 252.06 | 138.12 | 134.39 | 1.89× |
| 中局2221 / 44步 | 3 / 8 | 207,583 | 456.01 | 452.96 | 262.73 | 255.29 | 1.79× |
| 全明10子残局 | 4 / 1 | 38,033 | 58.19 | 57.46 | 38.34 | 37.58 | 1.55× |

100次搜索（5局面×5轮×4变体）均完成指定层数。所有最终和逐层候选的顺序、分数、样本统计、重复局面/和棋标记逐项完全相同，节点数和推荐相同。没有用提前截断的搜索来计算等深度提速。原始记录：[fixed.json](benchmarks/native-perf/fixed.json)。固定预算和网页数据在后续章节另列。

单独预评分需要额外临时向量分配，开局中位数反而慢约4.8%，其他局面差异较小，因此不单独采用。组合复用预评分存储后，开局比仅缓冲再快约17%；其他局面的附加收益较小，存在系统噪声，不能把五次计时当成严格显著性检验。

## 实现及边界

- 每枚棋子的候选落点改为栈上90格数组，越界显式报错。它只装一个棋子的落点；不以90限制整方合法走法。
- 搜索的合法走法、无吃子时判断困毙的探测走法、预评分分别按128个 ply 保存可增长向量，重复使用容量。父子 ply 使用不同缓冲，不覆盖正在遍历的父层；探测也有独立缓冲。沿用原搜索的128 ply边界，使用 `.at()` 检查。
- 排序前每着计算一次原有 `order`，仍用完整稳定排序，再拷回同一走法列表。没有分阶段舍弃候选、改变同分顺序或引入新走法奖励。`std::stable_sort` 自身仍可能分配工作存储，因此不声称整个搜索零分配。
- 根合法走法共享、PVS、增量哈希、make/unmake、history、killer 均为既有能力，不计作本轮新增优化。
- 明兵位置分、暗子首步角色、揭后士象走法、私人暗俘库存完全沿用基线。没有首手兵位奖励或指定首着。

## 剖析与未采用项

[profile.json](benchmarks/native-perf/profile.json) 是单独插入 RAII 计时器的诊断构建，测量候选生成、合法走法（含候选生成）、估值；计时器自身有开销，嵌套项不能相加，也不拿它计算提速比。

采用版三个位置中，合法走法占插桩核心时间约62.6%～73.8%，估值约7.8%～9.0%；两种版本候选/合法/估值调用次数一致。它支持先处理分配与走法生成的选择。完整增量估值本轮暂缓：揭棋中暗子平均价值、库存、phase及将移动后的近将士象项有全局依赖，局部起终点更新不足以保持原值；浮点加法顺序也可能影响极近分的剪枝。没有冒险替换为未验证的增量版本。

置换表满90000项后仍更新已有 key 的候选，作为独立 `tt-refresh` 变体，与已采用的组合版单独比较，未混入等价速度表。两局均完整5层：开局7,765,366节点，中局2,350,478节点；全部根评分和节点相同。开局两版约10.48/11.15秒，中局3.21/3.17秒，仅各一次，不能据此宣称收益。诊断显示最大的单世界表只有81,479项，**未触及满表分支**，这不是满容量策略验证。本轮不采用该改动；后续需专门饱和测试及独立搜索语义回归。[完整结果与各世界表大小](benchmarks/native-perf/tt.json)。

也未采用 null move、LMR、aspiration、提前 stand-pat、减少样本或漏搜候选；这些改变搜索树或边界条件，需另做实验。尤其提前 stand-pat 必须保留困毙和应将检查。

## 来源核对

本轮只查阅以下原始来源，没有引入、编译或运行第三方引擎代码：

1. Pikafish 固定版本 `545c4e3b251afbb94f493c6c5f32549f900e76fd` 的 [MovePicker::score / partial_insertion_sort](https://github.com/official-pikafish/Pikafish/blob/545c4e3b251afbb94f493c6c5f32549f900e76fd/src/movepick.cpp)：先保存走法分数再排序。本项目独立实现预评分，保留原稳定全排序，未移植其分阶段选择或低分无序策略。
2. 同版本的 [movegen.h](https://github.com/official-pikafish/Pikafish/blob/545c4e3b251afbb94f493c6c5f32549f900e76fd/src/movegen.h) 展示引擎走法容器/评分结构；这里只参考减少短命存储分配的思路，未套用其棋种容量上限。[tt.cpp](https://github.com/official-pikafish/Pikafish/blob/545c4e3b251afbb94f493c6c5f32549f900e76fd/src/tt.cpp) 展示独立的更新/替换策略；本项目未复制短 key、整数压缩分数或替换规则。
3. ElephantEye 固定版本 `a3e6890386aa87ca4a184c4df8f9f13004b71565` 的 [PositionStruct::AddPiece / MovePiece](https://github.com/xqbase/eleeye/blob/a3e6890386aa87ca4a184c4df8f9f13004b71565/eleeye/position.cpp)：核对普通象棋增量状态维护的实现。揭棋还存在库存及揭子全局依赖，不能直接照搬。
4. David-Tabibi、Netanyahu，[Verified Null-Move Pruning](https://arxiv.org/abs/0808.1125)，论文讨论空步搜索与 zugzwang，支持将选择性剪枝单列验证；没有据此假设适用于当前揭棋规则。
5. Cowling、Powley、Whitehouse，[Information Set Monte Carlo Tree Search](https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf)，IEEE TCIAIG 2012：讨论 determinization、信息集和策略融合。当前仍为公开信息约束下多布局抽样搜索，并非 ISMCTS；本轮不改变信息模型。

概率语义复核：`bridge.mjs` 继续使用 `ai.js` 的 `balancedSamples`，从剩余库存无放回生成同一组布局。池减去公开明子及当前观察者已知的捕获；未知离盘子仍在潜变量池中。8个平衡样本近似揭子概率，未穷举全部机会分支；样本相互相关，标准差不能解释成置信区间。C++ 接口只收到公开观察和抽样布局，不收到真实暗布局。

## 复现

```sh
node native/perf-benchmark.mjs fixed
node native/perf-benchmark.mjs profile
node native/perf-benchmark.mjs tt
node native/perf-benchmark.mjs budgets
JIEQI_NATIVE_CHECK_OUTPUT=benchmarks/native-perf/native-check-replay.json npm run test:native
JIEQI_NATIVE_SANITIZE=1 JIEQI_NATIVE_CHECK_OUTPUT=benchmarks/native-perf/native-sanitized-replay.json npm run test:native
npm test
```

性能脚本默认重写对应模式的 `benchmarks/native-perf/*.json`；复现前另存正式记录。`JIEQI_PERF_REPEATS` 仅改变固定深度重复次数，默认5，不改变样本或深度。变体由冻结源码构造，补丁锚点必须唯一，否则报错；编译产物留在忽略目录 `.cache/perf/`。本组消融的冻结编译配置为当前 macOS/SDK，异平台需明确记录新的同等编译配置，不能混入上述速度比。生产构建仍使用跨平台 `native/build.mjs`。

## 相同时间预算

使用上述冻结 fixture、同样的8样本（残局1样本），最大主深度8，两种核心均沿用预算预留及每8节点读时钟。每个位置/预算/变体各一次，轮换先后，不能当作中位数或稳定性能保证。数字为最后一个**全部根候选与样本完成**的主层数，未将正在搜索的下一层计入。

| 局面 | 1秒：基线→采用版 | 6秒：基线→采用版 | 15秒：基线→采用版 |
|---|---:|---:|---:|
| 初始全暗 | 3→3 | 4→4 | **4→5** |
| 中局2111 / 44步 | **3→4** | **4→5** | 5→5 |
| 全明10子残局 | 6→6 | 7→7 | 7→7 |

18次完整原始输出和9组共同完成层的逐项一致性检查见 [budgets.json](benchmarks/native-perf/budgets.json)。所有共同层的节点及全部候选顺序/数值完全相同。更高NPS不会在所有预算上立刻多出一层，残局15秒也未完整8层。此表为持久原生进程的核心预算，不是浏览器端到端时限；请求墙钟含全部结果序列化/IPC，个别超过名义预算约0.12秒。本机HTTP服务有独立时钟，只推送前五候选，其真实流程另行验证。

## 正确性与安全回归

- [`npm test`原始输出](benchmarks/native-perf/unit-tests.txt)：86通过、0失败；包含规则、信息隔离、悔棋/重开及交互状态。这里的UI单元测试使用替身，不冒充浏览器实测。
- [release核心检查](benchmarks/native-perf/native-check.json)：72个规则/视角案例、2172次走子/撤销、16组搜索回归通过，包含马腿、象眼、炮架、将帅照面、将军、困毙/将死、揭子、两方私人暗俘、多种子中局、根和棋及固定节点中断。合法走法及其顺序对照独立JS规则；走子后的估值、库存及回复对照JS；撤销检查棋盘、哈希、人口及将位。未知暗子真实布局变化不改变发送给C++的观察/样本输入。
- [ASan/UBSan同组检查](benchmarks/native-perf/native-sanitized-check.json)：同样72/2172/16全部通过，运行时stderr为空，未报告越界或未定义行为。编译器警告为空。该构建不用于任何速度比。
- [本机服务最终检查](benchmarks/native-perf/service-check.json)：6组通过；三类STREAM对照逐层同分同节点、只传前五候选、拒绝私人暗子真身、Host/Origin边界、取消先到、并发上限、实际子进程退出和独立硬时限均验证。

首次服务检查为5通过1失败，原样保留在 [service-check-first.json](benchmarks/native-perf/service-check-first.json)。失败时Node/shebang模拟阻塞核心未在1200毫秒内产生第一层，得到0层保底；独立启动探测观察到同类模拟器首次约2020毫秒，随后约158/154毫秒（[探测记录](benchmarks/native-perf/mock-startup.json)）。为把启动耗时与搜索阻塞分开，测试改为先编译本项目的微型C++模拟器，读入请求后先发一层再忙等5秒；仍保留1200毫秒硬时限及1800毫秒总响应上限，并补验真实子进程退出。没有放宽服务时限、修改生产看门狗或忽略首轮失败。

浏览器首轮的8组功能流程均通过，覆盖重复点击、思考中悔棋/重开和无迟到落子、流式五候选及缓存隔离、双方自动对战/暂停/单步、私人信息隔离、故障时不静默回退、390px视口；截图和控制台记录见 [首轮记录](benchmarks/native-perf/browser-first-event-timing/results.json)。页面异常/控制台错误为空。该轮还完成20次两引擎的预算测量。

新增15秒测量暴露旧脚本的计时口径问题：若宿主定时器采用最后完整进度并取消，最后一条引擎事件早于界面停止；两次C++15秒记录被标为约11.89/11.73秒的“endToEndMs”，其实是5层进度到达时刻。**首轮这些旧口径耗时不作为真实端到端性能证据**。修正脚本后，`endToEndMs` 从请求发出量到实际观察到界面闲置（含就绪轮询开销），另外记录 `lastEngineEventMs`、是否收到最终消息、是否宿主超时、核心时间来自最终响应还是最后完整进度。没有改变生产搜索或时限；仅定向重测15秒预算，避免重复已通过的功能测试。

修正后的 [Chrome 155记录](benchmarks/native-perf/browser/results.json) 为4次开局测量：两次C++均完整5层、JS均完整4层，都是8样本、公开观察及种子1075149473一致。C++界面停止为15012.9/15014.5毫秒，JS为14997.4/14998.5毫秒。C++最后完整5层进度约在11761.3/11367.9毫秒到达；随后宿主时限采用该层并取消搜索，并未收到最终引擎消息。因此记录中的C++ `coreMs` 是最后完整层的进度时间，不是整次请求耗时，不用它计算端到端提速。控制台/页面错误为空；每次结束后活动C++进程均清零。

这是当前C++与JS回退的浏览器对照，不能将其差异全部归给本轮优化；本轮对旧C++的公平速度比来自上面的固定深度四变体消融。8组功能流程与修正后的端到端组组成这轮真实浏览器验证。保留现有Chrome沙箱、独立临时资料目录，未安装依赖或改变安全设置。

完整浏览器复现：`npm run test:browser:cpp`。本次定向计时命令：

```sh
JIEQI_CPP_BROWSER_OUTPUT=benchmarks/native-perf/browser \
JIEQI_CPP_BROWSER_TIMINGS_ONLY=1 JIEQI_CPP_BROWSER_BUDGET=15000 \
npm run test:browser:cpp
```

仍需按主README配置已有的 `PLAYWRIGHT_CORE_PATH`、`CHROME_PATH` 并保持8766服务运行。没有进行新的Elo/对赛研究，不能据此承诺棋力提升；没有声称15秒完成6层、证明首兵最优或实现WASM。本轮改动及原始结果仅保存在本地，未推送GitHub。
