# 第三方来源与仓库范围

默认网页运行源码为本项目的独立 JavaScript、HTML、CSS 和 SVG 实现，没有打包第三方运行库、字体或图片。可选 JQE 评估实验包含下述明确授权的第三方网络与推理改编代码；默认引擎不加载它。规则和研究参考见 README 与优化报告中的原始链接。

## 自有实验 NNUE 检查点

`models/experimental/observation-nnue-v1.bin` 为本项目本机随机初始化、使用已公开自有模拟裁判对局训练的实验检查点，不是第三方网络转换或蒸馏文件。训练标签使用实际终局，没有导入 Pika 的网络权重或 NNUE 源码；Pika 仅作为部分原始对局的对手。来源、数据分组、哈希、一次训练和集成修复记录见 [实验报告](docs/experiments/nnue.md) 与[模型说明](models/experimental/README.md)。该自有检查点及实验代码随既有 GPLv3 许可证分发；默认网页与稳定 HCE 不加载它。NumPy 仅为本机训练依赖，不随仓库打包。第三方组件原有许可仍各自保留。

## 独立对照引擎（不随本仓库分发）

对赛报告使用以下本机源码构建；本仓库仅保留来源、固定提交、构建哈希、协议适配脚本和测量结果。`external/`、构建二进制、源代码差异与原始构建日志均不纳入 Git。

| 上游 | 固定提交 | 上游许可 |
|---|---|---|
| [official-pikafish/Pikafish](https://github.com/official-pikafish/Pikafish)（`jieqi_old`） | `23b9466c981f0f3a1133f92de1a6f86406c4eccc` | [GPL-3.0-or-later / Copying.txt](https://github.com/official-pikafish/Pikafish/blob/23b9466c981f0f3a1133f92de1a6f86406c4eccc/Copying.txt) |
| [brianhliou/pikafish-jieqi-wasm](https://github.com/brianhliou/pikafish-jieqi-wasm)（`jieqi_old-mistboard`） | `bcc83f88ee18760e60903d1a3aaa61ef6f70f2c9` | [GPL-3.0-or-later / Copying.txt](https://github.com/brianhliou/pikafish-jieqi-wasm/blob/bcc83f88ee18760e60903d1a3aaa61ef6f70f2c9/Copying.txt) |

复跑外部对赛需自行取得对应上游源码并按其构建说明和许可编译，设置 `JIEQI_ENGINE_PATH` 指向可执行文件。上游许可、作者和版权声明须保留；本仓库的排除规则不改变其许可或任何后续分发义务。正常运行网页和 `npm test` 不需要这些引擎。

## 可选浏览器测试工具

`scripts/browser-check.js` 使用单独安装的 [Playwright Core](https://github.com/microsoft/playwright)（Apache-2.0）与用户本机 Chrome。本仓库没有打包它们；安装包自带的许可声明应保留。浏览器测试保持浏览器沙箱，使用独立临时资料目录。

## 保留的测量材料

`benchmarks/` 中的 JSON、独立基线快照、报告和 `browser-evidence/` 中的页面截图属于本项目验证材料。截图仅含本地应用页面；不包含个人浏览器资料。原始本机日志与 CPU 分析文件留在本地，未上传。

## AB-JChess local comparison metadata

The project includes its own comparison adapter and synthetic regression/match reports for AB-JChess v0.2d (`fe35d87c7553fd23e8aab3a1dde7e712f286b416`), upstream https://github.com/lxsgx23/AB-JChess. Upstream source is GPL-3.0; no upstream source, executable, object files or NNUE weights are bundled here. The release network has no separately verified redistribution license and is not distributed. Reproduction requiring that opponent must obtain and review the fixed upstream source and network separately under their applicable terms. Generic search ideas in the independent Mist prototypes were implemented in this project; the comparison does not claim model or engine equivalence across platforms.

## Independent self-play value experiment (2026-11-08)

`models/experimental/selfplay-value-v1.bin` is independently initialized and trained locally on this project's own newly generated synthetic HCE games. Its code and weights are distributed under this repository's GPLv3. No user games, third-party checkpoints, converted weights or teacher outputs were used. See [the report](docs/experiments/selfplay-value.md) for grouped data provenance and negative held-out results.

Conceptual research references: [devinokeefe/jieqi](https://github.com/devinokeefe/jieqi) ([MIT license](https://github.com/devinokeefe/jieqi/blob/main/LICENSE), with separately identified exceptions in [THIRD_PARTY.md](https://github.com/devinokeefe/jieqi/blob/main/THIRD_PARTY.md)) and [lxsgx23/AB-JChess](https://github.com/lxsgx23/AB-JChess) ([GPLv3](https://github.com/lxsgx23/AB-JChess/blob/main/LICENSE)). The selfplay-value experiment did not import source or weights from either project. Their current branches must not be conflated with this repository's older fixed comparison versions, and code licensing does not provide access to unpublished training data.

## Optional JQE evaluator (2026-11-09)

`models/jqe/it014.jqn` is the unchanged original JQE network from [devinokeefe/jieqi](https://github.com/devinokeefe/jieqi) at `331a6e612a038c4a04cf980f7b9482910fd50078`, SHA256 `f90bd44e8ee244405eb08eb4f784e3f156900f0691f651b5124d50032f8ba160`. The pinned upstream README explicitly places **both code and networks** under MIT. Copyright (c) 2026 Devin O'Keefe; the full license is retained in `models/jqe/LICENSE` and `native/experiments/jqe/JQE_LICENSE`.

`native/experiments/jqe/nnue.hpp` adapts the original input format and inference arithmetic into a portable evaluator. Mist retains its own search, move rules, referee, sampling, and private-capture observation semantics. No upstream search code or opponent network is imported. The upstream reference validation source is obtained separately at the fixed commit. Build products remain ignored. The ordinary webpage and default HCE are unchanged. [Integration report](docs/experiments/jqe.md).
