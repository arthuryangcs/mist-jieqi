# 循环上手风险证据（独立、可关闭）

基于 ed47bd0，候选仍调用原 `all-compatible-v2` 默认二进制。只添加循环门槛处最后一个明子非吃子转移的公开诊断：移动前/后的下一步将杀机会、吃明子后对方是否有合法立即反吃、新动作/原有动作、将军/应将。**不修改排序、搜索分、裁判或生产默认。**无立即反吃不等于无偿得子；未找到一步杀不等于不存在连续将军杀。未证实追捉责任时保持待裁。

`signals.mjs` 抛弃双方暗俘私有身份，盘上暗子有真身字段则拒绝。暗子下一步按当前角色走，再分别假设六种几何身份，另标公共库存可行身份；这是分支事实，不是六种等概率，也不使用裁判布局。明子移动前后比较对应来源，避免仅因坐标改变把原威胁记作新威胁。应将产生的新威胁仍保留证据，但不由此判闲或判捉。只检查最后一手，不声称完整循环责任分析。

`bridge/client/javascript` 在原预算中扣除诊断耗时；默认扫描目标100ms（在动作/身份边界检查时间，单次合法着计算不可抢占），未完成显式保留未知，不能当安全。生产代码文件不改；`web/entry-source` 只在独立服务覆盖所服务的模块，文案标明“仅诊断，不是判决”。保留 Host/Origin、合法局面、暗子真身拒绝和取消检查。`signalsEnabled:false` 可关闭，原启动入口是回退基线。

在独立工作目录复现，勿覆盖活跃服务的构建：

```sh
node --test native/experiments/cycle-signals/signals.test.mjs native/experiments/cycle-signals/ui.test.mjs
node native/experiments/default-all/build.mjs
node native/experiments/cycle-signals/forensics.mjs
node native/experiments/cycle-signals/check.mjs
node native/experiments/cycle-signals/integration.mjs
node native/experiments/cycle-signals/matches.mjs replay
node native/experiments/cycle-signals/audit.mjs benchmarks/cycle-signals-2026-11-26/matches.json /tmp/cycle-signals-audit.json
```

`check/integration` 需要已有默认二进制及自有网络评估文件。CI在自己的新目录构建默认版；本轮原机没有重编C++。`phase/freeze/run` 是原机实验管理入口，要求新鲜官方实际额度、无登记运行锁，禁止覆盖已有阶段和布局；不要重启旧qcheck暂停赛程。HTTP 测试只监听随机本机端口并关闭自身服务。JS Worker 在 Node worker_threads 运行，UI是DOM逻辑测试，均不是真实浏览器视觉验收。

[规则、边界与结果报告](../../../docs/experiments/cycle-signals.md) · [合成公开证据](../../../benchmarks/cycle-signals-2026-11-26/)
