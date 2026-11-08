# 自对弈合法观察评估实验

独立、非默认的有限原型。使用本项目 HCE 自对弈生成新合成棋局，训练16隐单元残差评估器；没有使用人类私人棋谱、第三方权重或全信息教师标签。`npm start` 不加载本模型，也不启动实验网页。

## 边界

- `plan.json` 在48局生成前冻结。24个初始暗子布局，每布局2个独立策略种子；16/4/4布局分训练/验证/测试，另2布局用于正式换色赛。真实布局哈希仅作分组身份。
- 裁判真状态与元数据分开。每步重新通过 `lawfulView(state, viewer)` 取字段白名单，盘上暗子真身和观察者不知道的暗俘身份不进入搜索或特征。采样种子只依赖合法观察，绝不使用裁判布局种子。
- 生成使用暗局8样本/全明1样本、主深度上限2层、30000节点上限、单线程固定工作量；若节点耗尽，保留已完成的上一层。前8半回合在完成搜索的前三候选间按独立策略随机数选择；之后选第一。10秒只是安全超时，超时不作有效样本。生成预算与2秒正式对赛不可混称。
- 将死/困毙优先，第三次公开盘面与行棋方重复由最后走子方判负，120闲步和，400步封顶未决。技术失败、未决及无足够观察的局保留日志但不训练。正式结果从回放重新计算，禁止终局后走子。
- 第8半回合起，每步抽取红黑各自合法视角，包括奇偶行棋方。分区文件只有features/base/target/weight。每布局等权、布局内每局等权、局内每个观察等权。
- 网络沿用本项目已有2597输入、16单元 clipped ReLU、两套同权重朝向累加器，HCE加有界±256分残差。权重float32，累加float64，随机初始化。完整分类型库存进入TT键，避免同总数/总值不同库存碰撞。
- 网络不读取重复历史、quiet或ply；其HCE搜索宿主仍保留深层循环提前记0分的近似。根重复由共同裁判元数据处理。这不是完整长将/长捉裁定，也不等同于新search-speed核心的历史规则。

## 构建和验证

在仓库根目录运行，需要已有Node20+、C++17编译器。训练另需已有Python与NumPy；不自动下载任何权重。

```sh
node native/experiments/selfplay-value/build.mjs --control
node native/experiments/selfplay-value/build.mjs
node --test native/experiments/selfplay-value/dataset.test.mjs
node native/experiments/selfplay-value/replay-data.mjs
node native/experiments/selfplay-value/check.mjs
node native/experiments/selfplay-value/rules.mjs
node native/experiments/selfplay-value/check.mjs --sanitize
node native/experiments/selfplay-value/rules.mjs --sanitize
```

`replay-data.mjs` 可在不同系统重建并核对每条样本及分区文件哈希、合法性、隐私与冻结模型损失。它核对已提交源码及重新生成的control.cpp，不声称重现原Mac编译器生成的可执行字节。加`--materialize`只将核对后的分区写入忽略缓存；已有不同内容拒绝覆盖。

`control-check.mjs` 检查本机当前生产二进制和64MiB规范化对照的同树结果；仅在已有对应生产构建时运行。`integration.mjs` 和 `benchmark.mjs` 应在没有生成、训练或比赛时单独运行。时间门槛是本机实测，不在共享CI上要求硬实时。

候选以独立二进制和显式环境变量启用：`MIST_NNUE_MODEL=models/experimental/selfplay-value-v1.bin .cache/selfplay-value/candidate`。它使用原生文本协议，不是交互终端游戏。

## 数据与训练复现

已发布的是本轮冻结的合成日志和本项目自训权重。生成器、数据提取器及训练器会拒绝覆盖已有冻结产物，不要在原记录上直接重跑或挑有利种子替换。若开展下一轮，应创建新实验目录与计划，并重新固定分区。

原轮次顺序如下，仅供方法复现：

```sh
node native/experiments/selfplay-value/generate.mjs freeze
node native/experiments/selfplay-value/generate.mjs run
node native/experiments/selfplay-value/data.mjs
node native/experiments/selfplay-value/data-check.mjs
python3 native/experiments/selfplay-value/train.py
node native/experiments/selfplay-value/data-check.mjs --model
```

训练仅120个预定Adam epoch，验证集BCE选模；训练进程写出float32权重和冻结记录后才首次读取测试文件。此前完整性/隐私审计会读取测试行，但不计算模型测试损失、不参与选模；此后独立审计重算也不参与选模。不能把局面数当独立布局数，也不能从留出损失改善推出棋力提高。

正式赛程先通过所有验证，再`matches.mjs freeze`，之后`matches.mjs run`，全部结束后`export-matches.mjs`。每手2000ms、60ms共同宽限、最多4线程、64MiB TT预算；Mist两臂均40ms宿主预留。12局包含候选对规范化稳定版4局、两者分别对固定Pika各4局，交错换色，不因输赢提前停止或换模型。

生成/训练/比赛通过锁阻止互相重叠。`SIGINT`或`SIGTERM`让比赛完成当前手后停止，日志可重放恢复；创建`.cache/selfplay-value/STOP`也可阻止新手。生成器有自己的安全停止/锁处理。不要删除仍由活进程持有的锁。没有任何脚本会重启用户关闭的试玩版。

对赛中的FEN、协议token和clock.position是**合成棋局中对应玩家合法可知的观察**，可能含吃子方私人暗俘身份；它们不是双方共享信息，也从不发送给不知情的一方。公开日志包含合成裁判种子以便重放，不包含用户真实棋局。
