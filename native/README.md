# 本机 C++ 引擎与离线对照

当前已接入浏览器：在项目根目录执行 `npm start`，打开 http://127.0.0.1:8766/，默认选择 C++。需要保持本机 Node 服务运行；只监听 loopback，不是WebAssembly或第三方引擎。JavaScript 回退须在界面明确选择。接入测试与真实浏览器测量见 [CPP_ENGINE_REPORT.md](../CPP_ENGINE_REPORT.md)。

服务在启动时检查源码/二进制哈希并按需编译；不下载依赖。每次搜索使用独立C++子进程，逐层推送完整迭代，取消、断开、重开及硬时限均终止对应子进程；最多同时2个请求。采样、公开观察、根裁定历史及真实对局控制仍由JS维护，C++实现默认配置的规则、估值和搜索。

服务测试：`npm run test:cpp-ui`；浏览器测试：`npm run test:browser:cpp`（使用已有Chrome/Playwright，配置同主README）。HTTP只接受公开观察，不接受实际暗布局。

2026-10-23 的[将帅安全几何表实验](../docs/experiments/king-geometry.md)保留为独立原型，没有替换默认核心。正确性与内存检查通过，但固定搜索树速度有快有慢；同预算、新布局换色对稳定版及固定Pika的原始记录、限制与复现步骤均见报告。

2026-10-24 的[保留困毙检测的静态截断实验](../docs/experiments/standpat.md)先验证任一合法着，再允许提前返回原静态分。五个固定单线程搜索树中位耗时约提速1.08～1.29倍，实际并行路径另作逐层一致性与内存检查；同预算完整层数未变。原型与新布局换色对赛证据独立保留，尚未启用默认核心。

另有[合法观察残差 NNUE 原型](../docs/experiments/nnue.md)：自有小模型、双视角增量累加器、翻子/私有暗俘库存更新与完整前向一致性检查。首次集成漏扩展分类型库存缓存键，旧试跑单独保留；当前有效实现为 `native/experiments/nnue/build-corrected.mjs`，使用另行冻结的修复阶段对照。默认 HCE 和网页不加载实验权重；训练、误差、推理成本、失败与对赛样本限制均见报告。

当前核心增加单次走法预评分、逐层走法/评分缓冲复用和单子落点栈数组，保持稳定排序与原搜索语义。冻结 `b200995` 的四变体消融、剖析、等时预算及验证见 [NATIVE_PERFORMANCE_REPORT.md](../NATIVE_PERFORMANCE_REPORT.md)。用 `node native/perf-benchmark.mjs fixed` 重跑；脚本会重写该模式的结果文件，先另存正式记录。历史深层脚本若固定旧源码哈希而拒绝执行，应保留其冻结条件，不把新核心冒充旧基线。

新一轮在 `46f83ad` 上增加射线/保守将军检查快路径与循环路径栈，消融和安全条件见 [NATIVE_MOVEGEN_REPORT.md](../NATIVE_MOVEGEN_REPORT.md)。`node native/movegen-benchmark.mjs fixed` 重跑四变体；`guards` 逐着与旧检查复核并对照独立JS规则，`budgets` 测相同1/6/15秒预算。脚本默认覆盖相应模式的JSON，先另存正式记录。

当前在 `a156673` 上采用最多4个搜索线程并行处理固定8个采样布局。每个布局有独立的排序历史、killer、走法缓冲和置换表，汇总顺序固定；全明1样本与显式固定节点上限使用原串行路径。服务输出 `maxThreads` 能力和每次结果的 `threads`，进度及最终响应均报告实际搜索线程数。CPU占用增加，搜索完整层和信息隔离条件不变。完整对照、未采用的窄窗口/置换表实验和限制见 [NATIVE_PARALLEL_REPORT.md](../NATIVE_PARALLEL_REPORT.md)。

后续受控静态将军实验没有接入生产核心：两方案由 `forcing-variants.mjs` 从冻结原版生成，独立规则/战术及ASan/UBSan通过，但完整方案对原版8局为2胜3和3负，未达启用门槛。基准、复现步骤、失败记录和网页仍使用原版的说明见 [QUIET_CHECK_EXPERIMENT.md](../QUIET_CHECK_EXPERIMENT.md)；实验二进制只写 `.cache/quiet/`，不覆盖 `.cache/native/mist-core`。

最新默认仅修复表满后已有键不能更新的问题，C++与JS同步调整，表仍限制9万项、按采样世界和请求隔离。窄窗和请求内线程池经独立对照未采用，quiet-check保持关闭。完整候选/逐世界审计、JS/C++满表7层同节点、新Pika8局、时限故障调查与7组服务回归见 [TT_CACHE_REPORT.md](../TT_CACHE_REPORT.md)。历史冻结脚本的源码哈希限制保留，不把新核心冒充旧版。

最近的[攻防/将帅压力实验](../DEFENSE_EVAL_EXPERIMENT.md)没有接入默认核心。原型、独立JS几何核对、ASan/UBSan、完整候选/逐世界同分、有界惰性计算消融及新布局换色8局均保留；正常7局得分率50%，另1局基线超时，1秒预算两处掉层，未过启用门槛。用 `node native/defense-check.mjs --lazy` 核验隔离原型；复跑前先另存正式证据，详见报告。

以下保留离线性能及一致性复现方式；旧测量见 [NATIVE_SEARCH_REPORT.md](../NATIVE_SEARCH_REPORT.md)。

新的[候选覆盖与封顶补算修复](../FRONTIER_SEARCH_REPORT.md)保留在 `frontier-*.mjs` 和 `.inc`：覆盖单项保证全候选最多落后一层；封顶后继续补算遗漏根，仍只比较同层同样本精确值。固定6秒残局覆盖从8层12/30扩到27～28/30，组合20/30且全候选7层。覆盖单项对原版4胜4和，组合正常7局3胜3和1负、另1局原版超时；Pika同批原版4胜4负、组合1胜1和6负，技术故障和正常局分开保留。**本轮不替换默认核心。** 用 `PORT=8768 node native/frontier-preview.mjs combined` 启动隔离实验，全部测试与不可用的真实Chrome工具范围见报告，不把工具缺失当成用户浏览器故障。

此前[候选预算与受控战术加深实验](../FOCUS_SEARCH_REPORT.md)保留在 `focus-*.mjs` 和 `.inc`，没有替换默认核心。三项8局筛选都未过启用门槛；组合对原版1胜2和5负，对指定Pika的4布局换色8局为3胜1和4负，同批原版2胜6负。原始失败、全部正式对赛和逐着核验均保留，不据小样本宣称稳定提升。`PORT=8767 node native/focus-preview.mjs both` 启动隔离实验页面；自动走子使用同深度部分候选，手动分析仍为原完整搜索，缓存分离，界面明确显示覆盖率。详见报告中的实际测试、未用满预算等限制和保护旧证据的复现命令。

需要 Node.js 20+ 和本机已有的 C++17 编译器；不需要 npm 依赖。

```sh
npm run build:native
npm run test:native
JIEQI_NATIVE_SANITIZE=1 npm run test:native
node native/parallel-check.mjs
node native/window-benchmark.mjs parallel-fixed
node native/window-benchmark.mjs parallel-deep
node native/window-benchmark.mjs parallel-budgets
```

编译结果位于被 Git 忽略的 `.cache/native/`。`CXX` 可指定编译器可执行文件路径。macOS 构建脚本读取已有 SDK 路径，若 SDK 内存在 libc++ 头文件就通过本次编译的 `-isystem` 参数引用；不安装工具、不修改全局环境。发布前应核对编译器 Target 和 Node 架构；本轮二者均为 x86-64。

默认优化参数：`-std=c++17 -O3 -DNDEBUG -ffp-contract=off`，未启用 fast-math，最多4个搜索线程；非macOS额外传入 `-pthread`。Sanitizer 构建改用 `-O1 -g -fsanitize=address,undefined`，同时启用样本状态完整撤回守卫，其耗时不计入性能报告。

## 输入与语义边界

`bridge.mjs` 接收 `publicState()` 已过滤的观察，拒绝任何盘上暗子或不可见暗俘携带真实身份。使用 JavaScript 的无放回采样器导出固定样本，再将**同一组样本**分别交给 JavaScript 参考搜索和 C++。样本不是实际暗子布局。

- C++ 实现默认估值、全部规则走子、将军/困毙、增量哈希、走子/撤回、固定根观察者的暗俘库存更新、PVS、吃子搜索、应将延伸、路径循环剪枝、置换表、历史/killer排序、根揭子排序和完整轮次迭代加深。
- 采样、公私信息投影、完整棋谱/根重复判负与步数和棋判定仍由 JavaScript 提供。C++ 消费相同根终局元数据（0继续、1和棋、2重复落子方判负），并独立实现搜索路径内的循环判断。
- 对齐 `aa7644c` 的默认搜索配置；非默认活动度等离线实验开关未移植，也不在网页/API提供。完整游戏控制器仍由既有JS负责，浏览器硬时限和本机取消通过新增服务及适配器接通，已形成可用的一版。
- 两种实现使用不同语言和数据结构：C++ 使用数组棋盘、值对象、结构化键和标准库哈希表；JavaScript 使用现有对象和字符串键。测得的是这些实现变化的合并收益，不能单独归因于语言。

## 协议与计时

原生程序从 stdin 顺序读取 `SEARCH` 或 `VERIFY` 请求，向 stdout 输出单行 JSON；启动时有 `ready` 响应。每个进程一次只处理一个请求，不依赖网络。协议字段与边界检查在 `search.cpp`，编码在 `bridge.mjs`。

`cppCoreMs` 是原生搜索函数时间，含根生成、排序、样本状态初始化和迭代搜索，不含文本输入解析、JSON输出及缓存销毁。`cppWallMs` 从 Node 请求编码到完整响应解析，包含每次编码/IPC/解析；进程启动独立记录。JavaScript 时间是同进程参考 `analyze()` 的完整调用，包括固定样本克隆和进度结果保存。

固定预算使用两种核心相同的提前返回预留量和检查频率；不是浏览器硬实时承诺。只报告最后完整根轮次，未完成的候选不会混入排名。完整深度对照必须逐着评分在 `1e-7` 容差内、推荐相同、节点数完全相同，否则旧同树脚本报错，不发布等价提速。新并行版本的历史排序按布局隔离，不能与原参考强求同节点；规则/搜索检查仍核对全部候选评分和推荐，并记录双方节点数。`parallel-fixed` 另以相同布局分工的1线程/4线程版本逐层核对全部评分、候选顺序和节点完全相同，区分硬件并行与排序变化。旧 `benchmark:native` / `deep-check.mjs` 明确拒绝当前多核核心，须使用冻结旧版复现历史数据。

## 输出与重跑

脚本默认写到 `benchmarks/*-replay.json`，避免覆盖正式记录：

- `JIEQI_NATIVE_CHECK_OUTPUT`：规则、撤回、搜索与截断输入检查。
- `JIEQI_NATIVE_BENCH_OUTPUT`、`JIEQI_NATIVE_REPEATS`：完整深度多次轮换基准；`JIEQI_NATIVE_SKIP_BUDGETS=1` 可跳过固定时间预算部分。
- `JIEQI_NATIVE_DEEP_OUTPUT`：对已有相同样本的完整1至5层结果复核。历史 JS 耗时只作旧记录，不用于本轮同机速度比。

`native-check.json` 和 Sanitizer 记录包含成功/失败标记；基准及深层检查也会在异常时保存记录并退出失败。旧首版数据及一次测试脚本路径错误保留在 `native-prototype-pilot.json`，不与最终构建结果混合。

## 可用版流式接口

协议2增加 `STREAM`，每完成一层输出一条 `{progress:true,result:...}`，最后输出最终结果。全部根候选完成前不推送该层。普通 `SEARCH` / `VERIFY` 仍保持原对照格式。HTTP `/api/search` 使用同一观察的默认种子和8样本（全明1样本），只向页面返回前五候选，标记 C++ 源码及二进制哈希；未完成搜索的合法保底不会冒称核心已确认。`DELETE /api/search/<token>` 取消，断线同时清理，取消先到也不会启动迟到请求。`GET /api/status` 可检查核心版本和活动请求数。

本机服务仅提供前端必需文件，不暴露仓库、构建目录、测试材料或任意文件读取；拒绝异源Origin及非loopback Host，不提供CORS接口。本轮没有浏览器WASM测量。

本轮重复规则回归：`node native/repetition-check.mjs`，可用 `JIEQI_NATIVE_SANITIZE=1` 执行 ASan/UBSan 版。同一公开盘面与行棋方第三次出现时，造成重复的落子方判负；不推断长将或长捉责任。JS/C++ 根候选均对直接重复判负返回必负评分和 `repetitionLoss` 标记；内部路径循环仍为提前截断近似。历史冻结实验的构建与对赛报告保留原规则，未据此重跑棋力对赛。
