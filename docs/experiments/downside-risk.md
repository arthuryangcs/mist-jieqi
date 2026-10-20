# 严重亏损风险评分：隔离原型

状态：完成短测试，未启用默认核心，未进行新的自对战或 Pika 对赛，不能据此宣称棋力提升。

实现位于 `native/experiments/downside-risk/`，从稳定 `native/search.cpp` 按固定 SHA256 生成独立核心，只写 `.cache/downside-risk/`。此前 `coverage-validation/engines.mjs` 未测试的计时草稿保留原样，不参与本轮构建。

## 评分规则

候选仍完成同一深度、同一组固定采样后才参与排序。原有样本效用汇总分保留为 `baseScore`。

1. 按每个候选的样本分排序，取最差四分之一的平均严重亏损。非四的倍数使用分数权重，保持严格四分之一质量。
2. 单样本严重亏损为 `max(0, -clamp(score, -3600, 3600) - 450)`。450 是暂定的较大损失门槛，3600 限制将杀值的影响；这是启发式，不能把采样将杀当真实必败证明。
3. 同一完整层中，用最高原始综合分估计局面优势，所有候选共享权重：`0.30 + 0.20 × clamp(advantage / 600, -1, 1)`。优势大时更保守，劣势时减少惩罚，但仍保留非零风险权重。
4. 最终分为 `baseScore - weight × tailLoss`。全明局面不改变原分。全部样本为非负的高波动候选不受惩罚，不直接惩罚方差。

不增加真实暗子信息输入；仍使用 `fixture(publicState(...))` 的无放回采样，拒绝暗子和不可见暗俘携带真实身份。确定的非法送将由既有合法走子规则排除。当前原型没有增加“风险高就加样本”的自适应搜索，也不证明有限样本外不存在危险。

参数均是本轮初始假设，尚未按对赛调参。评分中的综合优势、亏损阈值及不同局面的风险权重还需独立验证；过度保守也可能错失攻击机会。

## 短测试结果

原始结果：[release](../../benchmarks/downside-risk/check.json)、[ASan / UBSan](../../benchmarks/downside-risk/check-sanitized.json)。

- 10 条 C++ 策略断言：严重亏损、罕见采样将杀、分数样本权重、优势/劣势权重、纯正收益不罚、全明局面不改分、非法空输入等。
- 7 个固定二层局面、252 个根候选：每个候选原始分与稳定核心一致，风险分按独立 JS 公式复核。包括初始暗局、双向暗俘的红/黑观察、4 个全明战术局面。
- 初始暗局 6 个候选、暗俘黑视角 1 个候选受严重亏损惩罚；7 个局面的第一推荐均未改变。
- 改变真实暗布局不改变公开输入与候选结果；带不可见暗俘身份的输入被拒绝。
- release 与 ASan / UBSan 均通过，无核心 stderr 诊断；sanitizer 构建启用搜索状态撤回守卫。
- 默认源码与 `.cache/native/mist-core` 未替换。少量短测耗时不作为提速或棋力证据。

## 复现

```sh
node native/experiments/downside-risk/build.mjs
node native/experiments/downside-risk/check.mjs
node native/experiments/downside-risk/check.mjs --sanitize
```

检查默认写 `check-replay.json` / `check-sanitized-replay.json`，不会覆盖正式结果；需要自定义文件时设置 `JIEQI_RISK_CHECK_OUTPUT`。构建依赖已有 C++17 编译器和本机 SDK，不下载第三方程序。后续采用前仍须在额度条件满足时完成独立局面与同资源对赛验证。
