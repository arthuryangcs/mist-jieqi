# 原生 C++ 搜索原型

这是离线性能和一致性实验，当前网页继续使用 JavaScript Worker。没有替换页面，也不包含 WebAssembly 或第三方引擎。结果见仓库根目录的 [NATIVE_SEARCH_REPORT.md](../NATIVE_SEARCH_REPORT.md)。

需要 Node.js 20+ 和本机已有的 C++17 编译器；不需要 npm 依赖。

```sh
npm run build:native
npm run test:native
JIEQI_NATIVE_SANITIZE=1 npm run test:native
npm run benchmark:native
node native/deep-check.mjs
```

编译结果位于被 Git 忽略的 `.cache/native/`。`CXX` 可指定编译器可执行文件路径。macOS 构建脚本读取已有 SDK 路径，若 SDK 内存在 libc++ 头文件就通过本次编译的 `-isystem` 参数引用；不安装工具、不修改全局环境。发布前应核对编译器 Target 和 Node 架构；本轮二者均为 x86-64。

默认优化参数：`-std=c++17 -O3 -DNDEBUG -ffp-contract=off`，未启用 fast-math，单线程。Sanitizer 构建改用 `-O1 -g -fsanitize=address,undefined`，其耗时不计入性能报告。

## 输入与语义边界

`bridge.mjs` 接收 `publicState()` 已过滤的观察，拒绝任何盘上暗子或不可见暗俘携带真实身份。使用 JavaScript 的无放回采样器导出固定样本，再将**同一组样本**分别交给 JavaScript 参考搜索和 C++。样本不是实际暗子布局。

- C++ 实现默认估值、全部规则走子、将军/困毙、增量哈希、走子/撤回、固定根观察者的暗俘库存更新、PVS、吃子搜索、应将延伸、路径循环剪枝、置换表、历史/killer排序、根揭子排序和完整轮次迭代加深。
- 采样、公私信息投影、完整棋谱/根重复与步数和棋判定仍由 JavaScript 提供。C++ 消费相同根和棋元数据，并独立实现搜索路径内的循环判断。
- 只对齐 `aa7644c` 的默认搜索配置；非默认活动度等实验开关、完整游戏控制器和浏览器宿主中断机制没有移植。原型不是完整引擎替换。
- 两种实现使用不同语言和数据结构：C++ 使用数组棋盘、值对象、结构化键和标准库哈希表；JavaScript 使用现有对象和字符串键。测得的是这些实现变化的合并收益，不能单独归因于语言。

## 协议与计时

原生程序从 stdin 顺序读取 `SEARCH` 或 `VERIFY` 请求，向 stdout 输出单行 JSON；启动时有 `ready` 响应。每个进程一次只处理一个请求，不依赖网络。协议字段与边界检查在 `search.cpp`，编码在 `bridge.mjs`。

`cppCoreMs` 是原生搜索函数时间，含根生成、排序、样本状态初始化和迭代搜索，不含文本输入解析、JSON输出及缓存销毁。`cppWallMs` 从 Node 请求编码到完整响应解析，包含每次编码/IPC/解析；进程启动独立记录。JavaScript 时间是同进程参考 `analyze()` 的完整调用，包括固定样本克隆和进度结果保存。

固定预算使用两种核心相同的提前返回预留量和检查频率；不是浏览器硬实时承诺。只报告最后完整根轮次，未完成的候选不会混入排名。完整深度对照必须逐着评分在 `1e-7` 容差内、推荐相同、节点数完全相同，否则脚本报错，不发布等价提速。

## 输出与重跑

脚本默认写到 `benchmarks/*-replay.json`，避免覆盖正式记录：

- `JIEQI_NATIVE_CHECK_OUTPUT`：规则、撤回、搜索与截断输入检查。
- `JIEQI_NATIVE_BENCH_OUTPUT`、`JIEQI_NATIVE_REPEATS`：完整深度多次轮换基准；`JIEQI_NATIVE_SKIP_BUDGETS=1` 可跳过固定时间预算部分。
- `JIEQI_NATIVE_DEEP_OUTPUT`：对已有相同样本的完整1至5层结果复核。历史 JS 耗时只作旧记录，不用于本轮同机速度比。

`native-check.json` 和 Sanitizer 记录包含成功/失败标记；基准及深层检查也会在异常时保存记录并退出失败。旧首版数据及一次测试脚本路径错误保留在 `native-prototype-pilot.json`，不与最终构建结果混合。
