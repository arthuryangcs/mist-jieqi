# 兼容全特性默认测试

用户明确要求“把所有新特性都默认打开，测试一下”。`npm start` 已改用 `native/start.mjs` 和 `native/engine-defaults.json`，选择 `all-compatible-v2`；这不是棋力已验证提高的声明。原HCE源码、原JQE候选和模型保持不变；不会重启运行中的8766、v5、旧JQE或刷新用户棋局。

`inventory.json`列出42项决定、全部28个实验目录和9个变体模块。可兼容项真正进入同一生成源码；互斥完整评估网络/根调度/排序实现只选一个。JQE完整价值网不直接加到丰富HCE，JQE快照只适用于其大State，FMA不在未核实支持的平台无条件执行；没有重试已拒CPU查询。C6–C8/v5需要移植其历史终局和不同Key/调度，不能直接套进当前完整库存NNUE组合。

生成基础 `base.cpp` 是已公开旧all-features实现的自包含快照，SHA记录在inventory；`source.mjs`逐锚核对迁移现行根结果0..4和内部静态循环截断，用较新bufferedStableSort替代插入排序，并禁止风险惩罚覆盖规则结果。旧源仅作为可审计构建输入，不能单独执行为当前裁判。没有复制第三方搜索源码或新增权重。

默认包含：丰富活动度/通用机动/8cp明子信息/攻防压力及安全惰性界和库存缓存、自有16隐层增量残差NNUE、最差四分位风险排序、LMR足层复查、受保护空步及验证、每静态路径一次明子将军和关键揭子将军、15合法平衡世界、同深度选根与覆盖补算、自适应窄窗、请求线程池、私有完整库存组相联TT64MiB、占位图/直接走法/王安全几何/射线、缓冲稳定排序。PVS/杀棋距离/合法着/取消/实际半回合遥测和127层安全边界保留。全明1世界仍只用1搜索工作者。样本数和搜索覆盖与原8样本HCE不同，组合效果不能归因于某一个开关。

模型 `models/experimental/observation-nnue-v1.bin` 是既有自有权重，SHA、来源与许可见inventory；仅48自生成整局/8布局，训练集1486观察，不训练新模型，不上传私人棋局。模型不是it014，不能把两者结果混算。

```sh
npm start                         # 下次启动选择组合；不会自动替换旧服务
MIST_ENGINE_PRESET=hce npm start   # 回退原HCE
npm run start:hce                 # 同上
npm run build:default             # 只构建组合，不监听端口
node --test native/experiments/default-all/default.test.mjs
node native/experiments/default-all/matches.mjs replay
```

完整本地验证使用独立 `.cache/default-all-20261118`，自持句柄、阶段退出记录和只读稳定服务优先守卫，不访问系统进程列表，不动旧qcheck4/12暂停锁。`plan.json`先限定2新布局8局；`freeze-plan.mjs`只抽一次、登记历史排重；`matches.mjs freeze`冻结二进制/模型/源码，`run-formal.mjs`有界串行，额度读数必须新鲜且>=40%。这些控制入口拒绝覆盖已有阶段记录；直接检查命令可能覆盖本目录检查输出，正式复现前另存旧证据，不重跑已完成对局抹除故障。

普通和ASan/UBSan规则、完整增量/撤销、独立JS前向、概率/风险与私有暗俘、TT/空步/安全惰性、当前循环责任、实际HTTP重复/取消、适配器取消均独立核对。没有新TSan证据，不将HTTP或模拟测试当成浏览器视觉验收。

[本轮报告](../../../docs/experiments/default-all.md)和[公共证据](../../../benchmarks/default-all-2026-11-18/)记录全部成绩与限制。现行裁判仅对可证明单方连续三个完整循环的长将判负，其他循环待裁，不冒称完整长捉裁判。
