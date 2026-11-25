# 已证规则负的独立优先级

非默认候选，基线9291ea0。不是更换NNUE、减样本或加深显示数字。只修正公开已证规则负和数值评分的优先级，并让正常/缓存/首帧前回退与显示保持一致。未证负不等于安全；全证负仍返回合法着。原默认、裁判、权重、8766和用户棋局不变。

`build.mjs`基于精确SHA的前轮源码，C++先比较规则类别再比较风险分。若新部分表只含已证负而其他合法根尚未评分，保留旧有效表。`raw.mjs`只供回归，直接观察C++，不执行JS修正。`selection.mjs`给宿主、JS和缓存提供相同门槛，并明确实选着的评分来源及字段缺失。

`entry-source.mjs`和`web.mjs`仅在独立临时服务中覆盖所服务的app/Worker/截止器源码，不修改生产文件，不增加HTTP可选引擎或关闭Host/Origin/隐私边界。未知评分不显示成0分；真实0保留。实际入口测试使用临时HTTP、生产NativeWorker、实际app报告/分析缓存回调的DOM桩，明确不是浏览器视觉验收。受控无首帧/延迟终帧是故障注入。

```sh
node --test native/experiments/rule-priority/selection.test.mjs native/experiments/rule-priority/ui.test.mjs
node native/experiments/rule-priority/prepare.mjs
node native/experiments/default-all/build.mjs
node native/experiments/rule-reply/build.mjs
node native/experiments/rule-priority/build.mjs
node native/experiments/rule-priority/build.mjs --sanitize
node native/experiments/rule-priority/check.mjs
node native/experiments/rule-priority/direct.mjs
node native/experiments/rule-priority/reproduce.mjs
node native/experiments/rule-priority/integration.mjs
node native/experiments/rule-priority/matches.mjs replay
node native/experiments/rule-priority/audit.mjs benchmarks/rule-priority-2026-11-25/matches.json /tmp/rule-priority-audit.json
```

复现请用独立工作目录，勿覆盖正在使用的基线二进制或旧实验记录。原机顺序phase/freeze/run入口还要求新鲜实际额度≥40%及无自身/登记实验锁，禁止覆盖阶段和重复已结束对局。不访问8766，不读取系统进程列表；旧qcheck4/12保持暂停。预算/线程/内存配置一致，不表示实际利用或背景负载严格隔离。

[完整报告](../../../docs/experiments/rule-priority.md) · [合成公开证据](../../../benchmarks/rule-priority-2026-11-25/)
