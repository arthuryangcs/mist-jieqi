# 实验模型

`observation-nnue-v1.bin` 是本项目本机随机初始化、使用自有模拟对局记录训练的小型残差 NNUE 检查点。没有下载、转换或混入任何第三方网络权重。代码和该自有检查点随仓库既有 [GPLv3 许可证](../../LICENSE) 分发；NumPy 只作为本机训练依赖，不随模型打包。

它采用本项目自定义 `JQNNUE1` 二进制格式，不能直接作为 Pikafish 的 `EvalFile`。头部为8字节magic、两个little-endian uint32（2597、16）、两个float32（256、600）；之后依次为2597×16输入嵌入、16个隐层偏置、16个输出权重和1个输出偏置，均float32。累加器和输出计算使用float64。文件共166364字节。

模型不是默认引擎的一部分，不会由 `npm start` 加载。实验源码、完整前向/增量一致性、训练和对赛记录见 [NNUE实验说明](../../native/experiments/nnue/README.md) 与[报告](../../docs/experiments/nnue.md)。推理所需模型SHA-256由训练及构建清单冻结，不能在正式对局中换权重。

## selfplay-value-v1（2026-11-08）

`selfplay-value-v1.bin` 是本项目新生成的24初始布局、48局HCE自对弈上的一次随机初始化训练结果。16/4/4布局分训练/验证/测试，另有独立对赛布局。格式仍为上述2597×16 `JQNNUE1`，166364字节；SHA256 `c5d0870e3feb8f7c86f9fb29e601d2ca3e3749099a02c261670f1d0f7e56df0b`。

验证选择第1轮，测试损失略差于HCE，未证明泛化或棋力收益，保持非默认。不含第三方权重、人类私人棋谱或全信息教师标签。沿用本项目GPLv3，来源和完整结果见[自对弈实验报告](../../docs/experiments/selfplay-value.md)。
