# 公开历史两步规则证明

独立候选，默认仍是`all-compatible-v2`，不修改`engine.js`裁判、默认配置或8766。原机原工作区，旧qcheck4/12暂停记录保留，不读取系统进程列表、不查询被拒CPU特性。

旧8局中的三次长将负均有效；最后一次将军的即时rootRules.loss为false，但对手存在合法应将，下一手即可按现行三完整循环规则获胜。三处分别有20、33、17个明子不将军合法避着，未承诺这些避着能赢棋。待裁局检查数不满足单方每手将军，仍保留未决。旧局面只作取证/回归，不加入新棋力成绩。

`policy.mjs`只读取共享公开棋面、行棋方、公开位置历史和步数。只处理可逆的明子非吃子根着及明子非吃子应手，用现行规则验证对手存在明确的立即规则胜；未知揭示、已有终局和未经证明的长捉不猜测。证明不使用采样世界、裁判种子、真实暗子、私人暗俘或库存。

`bridge.mjs`在原fixture上重新证明，保留原始0..4即时元数据，只给已证根着编码扩展结果5。`build.mjs`断言原默认生成源码SHA，只改变这个协议扩展、根已知负分及诊断标记，模型/采样/搜索/TT不改。两步损失计作两次真实着法；已证明规则负绕过启发式风险惩罚。它不是完整的深层循环规则搜索，也不是所有长捉裁判。新试赛已有“正确标记仍被选中”的反例：确定负分被现有概率压缩及数值排序处理，不能将本候选称为保证避开长将的修复；细节与完整失败记录见报告。

候选和控制均15暗样本/1明样本、同选根策略，最多4线程、TT64MiB、每手2秒和相同40ms宿主预留，证明成本计入预算。控制是当前实际默认的冻结二进制80b30542，不是更早HCE。固定Pika为bcc83f88/f32d3c6d的4线程/Hash64MiB HCE构建。原生节点含义、总RSS和实际利用仍不同，全明自己的两个版本均1工作者。只核对已登记锁及自持任务，没有读取被拒的系统进程列表或证明所有背景负载已退出；同配置结果不冒称严格隔离硬件。

```sh
node --test native/experiments/rule-reply/policy.test.mjs
node native/experiments/rule-reply/diagnose.mjs
node native/experiments/default-all/build.mjs # 缺少冻结控制时仅在独立复现环境构建
node native/experiments/rule-reply/build.mjs
node native/experiments/rule-reply/build.mjs --sanitize
node native/experiments/rule-reply/check.mjs
node native/experiments/rule-reply/integration.mjs # 临时端口，结束自动关闭
node native/experiments/rule-reply/matches.mjs replay
node native/experiments/rule-reply/audit.mjs benchmarks/rule-reply-2026-11-24/matches.json /tmp/rule-reply-audit.json
```

原机正式入口的phase/freeze/run脚本使用独立`.cache/rule-reply-20261124`、新鲜实际额度>=40%、自持进程/退出记录及稳定服务优先守卫，拒绝覆盖阶段或重跑已完成对局。新布局在正确性通过后一次性抽取、排除已登记历史并冻结；不得按胜负换参数或样本。复现请另存原记录，不覆盖旧试验缓存。

真实临时HTTP检查复用精确校验的现有传输，只替换实验Native桥，不写旧服务或页面。验证实际推荐、重复请求/取消/隐藏真值边界；没有浏览器视觉验收或新TSan证据。

[报告](../../../docs/experiments/rule-reply.md)和[公开证据](../../../benchmarks/rule-reply-2026-11-24/)保留所有胜和负、待裁、技术故障及样本限制。候选发布不代表默认启用或已经超过Pika。
