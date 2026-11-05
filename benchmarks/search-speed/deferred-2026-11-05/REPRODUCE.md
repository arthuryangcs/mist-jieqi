# 复现与证据边界

此目录只含自生成合成局面，不含用户试玩棋局、账户额度或本机构建文件。
`matches.json` 删除裁判内部状态及完整隐藏布局；合成种子仅供独立回放，棋手接口仍只接收各自合法观察。

先在独立工作区检出记录此报告的提交，避免覆盖正在使用的服务。

```sh
npm test -- --test-concurrency=1
node native/experiments/search-speed/check-deferred-order.mjs search
node native/experiments/search-speed/check-deferred-order.mjs rules
node native/experiments/search-speed/check-deferred-order.mjs reference
node native/experiments/search-speed/replay-deferred-order.mjs
```

前三个独立实验检查可追加 `--sanitize` 或 `--tsan`；线程消毒器以本机工具链支持情况为准，本轮本机两种消毒器都实际通过，GitHub CI运行Release和ASan/UBSan。
固定源码与同分稳定顺序的属性检查在 `deferred-order-source.test.mjs`；可选构建入口为 `build-deferred-order.mjs`。被淘汰的堆源码通过 `rejectedIndexHeapSource()` 精确再生，不作为默认或候选启用。

原始筛选为两种排序原型各六局面、三轮配对。`fixed-work.json` 是最终候选36次固定工作量，`heap-negative-screen.json` 是完整负结果。已知筛选输入不能称为新留出局面。
`performance-fixtures.json`、`plan.json`和`performance.json`包含八个冻结公共局面与96次两秒测试，四个引擎每局面各三次；`distribution.json`保留各次范围，`performance-summary.json`仅作汇总。
初始全暗公共控制是已知重复观察，其余七局面在测量前固定；三个残局为库存合法编辑盘，不声明可达。快速制胜的短搜索预先单列，不用于普通NPS目标。

候选建立在固定C7；原稳定对照来自基础提交 `fe810c7a265c6e5e2f0b3b2e51d283959d2f71a9` 的原生源码，SHA256 `3fa98d62f3c1636b831680fcd5dcbf88f9339e966ed1b8e2f8a170b83afcbfb0`。
若重新测速，请在另一目录重建此对照，使用相同编译选项、Pika固定版本和两秒预算；平台变化应记录新二进制摘要，不能改写原账本冒充原结果。
C7/候选与Pika使用最多四线程和64MiB TT上限，原稳定版实际线程及散列表不同。跨引擎原生节点、选择性深度和静态延伸不是同一个工作单位，不可由此推算Elo或专业棋力。

`script-sources/manifest.json`给出本轮原始本地脚本的源码摘要与原相对路径，供审计测量流程。它们依赖原相对`.cache`目录、记录中的二进制与独立试玩保护，**不是自动跨平台启动器**。若另做复现，应建立新计划、新输出和新摘要并保留其与本报告的区别，不覆盖这些结果。
棋谱回放脚本不启动任一引擎，并检查裁判源码摘要、每手合法性、观察信息摘要、暗俘字段和终局原因；如果裁判实现后来变更，应检出记录版本回放，不能静默重判旧赛果。

共同裁定器仍为证据受限 `cn2020-evidence-v1`，复杂循环记未决。完整长杀、联合捉子及所有国规例外没有实现；本报告不是完整国规合规证明。
