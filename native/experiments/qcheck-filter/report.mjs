import fs from 'node:fs';import assert from 'node:assert/strict';import {summary} from '../coverage-validation/common.mjs';
const dir='benchmarks/qcheck-filter',r=JSON.parse(fs.readFileSync(dir+'/matches.json')),v=JSON.parse(fs.readFileSync(dir+'/verification.json')),d=JSON.parse(fs.readFileSync(dir+'/diagnosis.json')),check=JSON.parse(fs.readFileSync(dir+'/check.json')),san=JSON.parse(fs.readFileSync(dir+'/check-sanitized.json')),b=JSON.parse(fs.readFileSync(dir+'/benchmark.json')),quota=JSON.parse(fs.readFileSync(dir+'/quota.json')),unit=JSON.parse(fs.readFileSync(dir+'/unit.json'));assert(v.passed&&d.passed&&check.passed&&san.passed&&b.passed);
const groups=[['新候选对生产稳定',r.games.filter(g=>g.kind==='internal')],['生产稳定对AB',r.games.filter(g=>g.kind==='ab'&&g.engine==='baseline')],['新候选对AB',r.games.filter(g=>g.kind==='ab'&&g.engine==='trial')]],pct=x=>x===null?'—':(x*100).toFixed(2)+'%',wdl=s=>`${s.wins}胜${s.draws}和${s.losses}负`,complete=r.games.filter(g=>g.result).length===12;
const doc=`# 明子将军查询精确过滤：本地独立后续

状态：${complete?'12局计划已完成':'完成'+r.games.filter(g=>g.result).length+'/12局，进行中'}。生产默认HCE保持不变，没有提交、推送、上传或新模型训练。

## 依据与修改

前一轮24局已完整交付：[原因、机制和对照](mate-proof.md)。其中原第3局已证明不是漏采：深2已见6/8将杀，明子防守到深4在8个样本中全败；不能直接禁止揭子。有限明子将军候选有初步希望，但有1次技术超时和1局断连，4个相关布局不足以默认推广。

本轮优先处理它的实现成本。只把“明子、非吃子”过滤提前到合法候选生成内：跳过不需要的暗子来源格、在目标格检查时跳过吃子着，沿用原合法性判定与顺序。新增查询参数默认false，因此原主搜索、吃子、困毙、普通规则API不变。不改每线1次静态将军预算、估值、概率、身份池、聚合、排序权重或时间，不叠加新风险策略。

算法等价参照是上一隔离候选SHA ${b.referenceSha256}，不是生产稳定版。正式新二进制SHA ${b.trialSha256}；生产HCE仍为 ${r.stableBinarySha256}。两者都不替换默认。源码生成器独立保存在 native/experiments/qcheck-filter/，未复制AB第三方源码或权重。

## 专项与一致性证据

在相同30001节点前缀、固定合法观察和世界样本下，查询次数、相关候选数、完整迭代候选/顺序/评分和节点数一致：

| 诊断 | q查询数 | 原来生成的合法候选 | 过滤后生成 | 避免的无用合法候选 |
| --- | --- | --- | --- | --- |
${d.work.map(x=>`| ${x.name} | ${x.reference.lists} | ${x.reference.generated} | ${x.trial.generated} | ${x.discardedBeforeLegality} |`).join('\n')}

这些计数是原查询最终输出的合法候选，尚未计入更早被裁掉的非法伪走法，所以不是全部节省的指令数。统计限固定节点串行模式。

release及ASan/UBSan均通过：红黑镜像6/8立即将杀识别保留，节点3155/3259分别与原候选相同；${check.fixedTreeChecks}组固定节点搜索逐层比较、${check.views}个观察视角、${check.transitions}次走子撤销、${check.privacyChecks}次私有信息检查、2次正式/诊断构建一致性。${check.aggregationChecks}个逐样本候选按独立JS效用公式核对。消毒器版本在每次过滤查询中用原全量生成再过滤作为参考向量，连同棋盘、将位、哈希、路径和库存恢复守卫检查；无诊断。项目测试${unit.passed}/${unit.tests}通过，失败${unit.failed}、跳过${unit.skipped}。

## 相同工作量的速度

每局面预热后5轮，顺序交替，串行请求；节点上限30000（越限检查使返回30001），全明短树完整3层15913节点。比较相同工作前缀与全部已完成迭代，而非不同对局节点。固定节点模式为单搜索线程，非多线程实战NPS结论。

| 局面 | 完整主层 | 相同节点 | 原候选中位ms | 新候选中位ms | 比值 原/新 |
| --- | --- | --- | --- | --- | --- |
${b.summary.map(x=>`| ${x.name} | ${x.depth} | ${x.nodes} | ${x.referenceMedianMs.toFixed(3)} | ${x.trialMedianMs.toFixed(3)} | ${x.speedup.toFixed(3)} |`).join('\n')}

含暗子4局面约1.05–1.53倍，全明残局基本持平（约0.996倍）；不能把最大值当所有局面的收益，单机调度/热状态未严格控制。3局面的双版本2秒筛查均未增加完整主层（4/5/5层）；强停会返回最后完整进度，正常返回的nodes还可能包含中断层，故该组节点数不作NPS比较。说明实现提速尚未直接换成完整层数，更不能直接当棋力。

## 12局冻结对照（与旧24局分开）

布局 ${r.plan.seeds.join('/')} 未参与调参，也不与旧24局、旧16局或开发种子重复。4局新候选对**生产稳定HCE**，稳定/新候选分别对固定AB各4局；换色配对且顺序交替。每手2秒、统一60ms宽限，搜索上限4线程，暗局8样本、全明1样本/线程。就绪外，其余视图、采样、规则、IPC、搜索、停止/回收内计时；串行，不与编译/其他实验重叠。没有按中途胜负改参数或样本。

| 比较 | 局数 | 胜和负（含技术） | 得分率 | 技术失败 | 未决 | 无技术子集（辅助） |
| --- | --- | --- | --- | --- | --- | --- |
${groups.map(([name,gs])=>{const s=summary(gs),clean=summary(gs.filter(g=>!g.result?.technicalForfeit&&!g.interruptions?.length));return `| ${name} | ${s.games} | ${wdl(s)} | ${pct(s.scoreRate)} | ${s.technical.length} | ${s.unresolved} | ${wdl(clean)} / ${pct(clean.scoreRate)} |`;}).join('\n')}

原始技术失败/未决不得删除或用重赛替换，辅助子集不替代总成绩，也不能在布局/颜色不齐时直接比较百分比。断连记录：${r.games.filter(g=>g.interruptions?.length).map(g=>'第'+(g.index+1)+'局').join('、')||'无'}。所有终止原因及每手记录在matches.json。

已独立回放${v.plies}个已执行半回合、${v.darkCaptures}次暗吃、${v.repetitions}次重复判负、${v.rootGuards}次AB根约束；逐步核对合法性、视角指纹、身份权限、揭子/暗吃历史、FEN、终局和时限。

${['baseline','trial','ab'].map(e=>{const t=v.time[e];return `- ${e}：${t.attempts}次，平均${Number.isFinite(t.mean)?t.mean.toFixed(2):'—'}ms，P95 ${t.p95?.toFixed(2)||'—'}ms，最大${t.max?.toFixed(2)||'—'}ms，超过2060ms ${t.over2060}次。`;}).join('\n')}

## 限制和交付

固定AB v0.2d/${r.ab.commit}，模型SHA ${r.ab.modelSha256}，已实际加载；4线程、Hash64MiB、ChasingRule=github。外部统一第三次公开重复走子方负、无合法着负、120闲半回合和、400封顶未决。AB根过滤直接第三次重复负；其内部循环和80计数差异依旧存在，记录${v.quietDifferences}次计数不同。通用SSE2/scalar NNUE构建不代表官方最优性能，上限线程和时间相同不代表内存相同。

仅合法观察者输入和派生样本，未知暗俘身份只给吃子方。改动不知道的真身份不影响编码；棋谱的裁判真布局只供本地回放，不发给引擎、不直接用于合法观察者训练。没有拷贝第三方实现、模型或二进制到本实验交付目录。

额度来源受支持 get_usage_limits，可读七日10080分钟，最后记录剩余${quota.checks.at(-1).remaining}%，门槛40%；未知周期不猜测。默认稳定版不改：两个新布局的小规模对局无法可靠证明超越AB或足够默认推广。即使有改善也只作为更多独立验证的依据；实现等价/提速也不替代策略验证。

用户棋局、页面和其他软件未操作，没有浏览器验收，也不绕过旧访问限制。未提交推送，CI未触发。源码、README及必要复现证据留在本地，编译对象/外部模型仍在忽略目录。见[复现说明](../../native/experiments/qcheck-filter/README.md)及benchmarks/qcheck-filter/。
`;
fs.mkdirSync('docs/experiments',{recursive:true});fs.writeFileSync('docs/experiments/qcheck-filter.md',doc);console.log(JSON.stringify({complete,completed:r.games.filter(g=>g.result).length,summary:r.summary,report:'docs/experiments/qcheck-filter.md'}));
