import fs from 'node:fs';import assert from 'node:assert/strict';import {summary} from '../coverage-validation/common.mjs';
const dir='benchmarks/mate-proof',r=JSON.parse(fs.readFileSync(dir+'/matches.json')),v=JSON.parse(fs.readFileSync(dir+'/verification.json')),d=JSON.parse(fs.readFileSync(dir+'/diagnosis.json')),checks=JSON.parse(fs.readFileSync(dir+'/check.json')),san=JSON.parse(fs.readFileSync(dir+'/check-sanitized.json')),quota=JSON.parse(fs.readFileSync(dir+'/quota.json')),bench=JSON.parse(fs.readFileSync(dir+'/benchmark.json')),unit=JSON.parse(fs.readFileSync(dir+'/unit.json'));
assert(v.passed&&checks.passed&&san.passed&&d.passed);const complete=r.games.filter(g=>g.result).length===r.tasks.length,groups=[['试验对稳定',r.games.filter(g=>g.kind==='internal')],['稳定对AB',r.games.filter(g=>g.kind==='ab'&&g.engine==='baseline')],['试验对AB',r.games.filter(g=>g.kind==='ab'&&g.engine==='trial')]],pct=x=>x===null?'—':(x*100).toFixed(2)+'%',wdl=s=>`${s.wins}胜${s.draws}和${s.losses}负`,table=groups.map(([name,gs])=>{const a=summary(gs),b=summary(gs.filter(g=>!g.result?.technicalForfeit&&!g.interruptions?.length));return `| ${name} | ${a.games} | ${wdl(a)} | ${pct(a.scoreRate)} | ${a.technical.length} | ${a.unresolved} | ${wdl(b)} / ${pct(b.scoreRate)} |`;}).join('\n'),allTech=r.games.filter(g=>g.result?.technicalForfeit),interrupted=r.games.filter(g=>g.interruptions?.length),up='https://github.com/lxsgx23/AB-JChess/blob/'+r.ab.commit+'/abjchess/src/';
const branch2=d.iterations.find(x=>x.depth===2),branch4=d.iterations.find(x=>x.depth===4),branch6=d.iterations.find(x=>x.depth===6);const doc=`# AB机制分析与有限明子将军静态搜索实验

状态：${complete?'24局冻结计划已完成':'进行中，完成'+r.games.filter(g=>g.result).length+'/24局'}。独立实验，**不改默认引擎**，不提交、推送或上传。不能用专项回归、更深层数或这四个相关布局推定稳定棋力提高。本轮不是继续训练NNUE。

## 第3局真实原因：修正“漏看一步”的直觉

原16局只作诊断，不混入新验证。输入为第3局第43半回合、红方合法观察；种子从 visibleKey 推导，不是裁判布局种子。对 i0i2 的8个样本恰好覆盖车2、马1、士2、兵3，身份池没有漏采。原算法第2层已经得到6个 -98998 的立即将杀分数，样本败数 ${branch2.reveal.sampleLosses}，效用综合分 ${branch2.reveal.score.toFixed(3)}。逐候选聚合与JS独立公式核对一致，无符号翻转或把99000当材料直接平均的问题。

关键反证：看似避开一步杀的明子着 c3e5，在第4层8个样本全部给出强制败分（${branch4.defense.worldScores.join(', ')}）；其聚合效用约 ${branch4.defense.score.toFixed(3)}。第6层 i0i2 仍是6败2个车分支可继续，综合分 ${branch6.reveal.score.toFixed(3)}，高于全败。因此选揭子是当前样本/模型下的脱困赌博，不能靠禁止高风险揭子或只加风险惩罚“修好”。样本分支的形式证明也不等同于真实信息集下的全局必败；确定化、有限样本和未来策略融合仍是近似。这里的11.29%是启发式效用变换，不是实测胜率。

另有一个明确的搜索前沿缺口：第1层在 i0i2 的所有样本中都未标将杀，因为对手 e3f3 是明车非吃子检查，原静态搜索只搜吃子和应将。第2层才看见它。这一缺口适合做有限的战术延伸实验，但并不意味着旧第3局必能翻盘。详细逐层、逐世界分数和合法观察见 diagnosis.json；复现代码 diagnose.mjs 先与稳定核心核对结果一致。

## 固定AB v0.2d可借鉴机制

分析固定提交 ${r.ab.commit}；配套实际加载的NNUE哈希 ${r.ab.modelSha256}。不混用main或旧标签。

| 机制 | 固定源码依据 | 与Mist的区别及本轮处理 |
| --- | --- | --- |
| 按库存数量展开揭示 | [flip_search](${up}search.cpp#L1979)，逐身份do_flip/undo_flip，按num加权 | AB在每次翻子处展开合法身份；Mist先抽整盘8个确定化世界，再分别minimax，未来动作可能有策略融合。本轮不改概率模型。 |
| 暗俘与观察者隔离 | [observer_tt_key及hidden_capture_candidates](${up}search.cpp#L163)、[hidden_capture_search](${up}search.cpp#L1886) | AB仅为根观察者是吃子方时展开被俘暗子，TT按观察者加盐。Mist已有分方库存与独立世界TT，回归继续验证，不传裁判真值。 |
| 概率和终局分数 | [aggregate_probability](${up}abjnnue/abjnnue_model.cpp#L141) | 使用模型score/mass表加权；同号决定性结果有专门路径，混合结果从父方视角聚合。Mist是sigmoid/平均/logit，已避免直接平均mate，但未宣称概率校准准确。本轮聚合公式不改。 |
| 搜索与资源分配 | [chance_branch_depth](${up}search.cpp#L181)、[主搜索](${up}search.cpp#L630) | AB首身份保留深度、后续分支可少1层，另有迭代加深、aspiration、TT/PVS、空步/ProbCut/晚着减深等。Mist根每着每世界全完成才发布，层数不可直接横比。本轮不叠加这些选择性剪枝。 |
| 静态搜索与终局 | [qsearch](${up}search.cpp#L1577)、[应将/吃子及终局](${up}search.cpp#L1717)、[揭子调整](${up}reveal.cpp#L96) | AB普通qsearch也主要搜吃子与应将，不是本轮明子将军扩展的直接来源；终局值不随意叠加揭子奖励。本轮据Mist实际缺口独立实现有限明子检查。 |
| 估值与王安全 | [NNUE运行值](${up}evaluate.cpp#L68)、[可见威胁特征](${up}abjnnue/abjnnue_feature_encoder.cpp#L197) | AB包含王位变换、库存/暗子阶段、可见明子威胁和神经网；Mist仍是材料、池均值和少量位置/王位项。不能从这轮棋谱单独证明NNUE为主要差距来源。 |

以上是源码机制核对，不是对它们各自收益的因果实验。本试验代码独立编写，没有复制GPL上游代码或重分发第三方模型/二进制；来源如上标注。官方权重未提供单独许可证，继续仅本机使用。

## 实际修改

从固定稳定源码SHA ${r.trial.stableSourceSha256}生成新缓存核心；正式试验SHA ${r.trial.binarySha256}，稳定二进制SHA ${r.stableBinarySha256}。源码差异由 build.mjs 的 trialSource 生成，原文件不覆盖。

只增加一个每条静态搜索线最多1次的明子非吃子将军预算：非将军节点在原stand-pat、困毙处理后，若qleft>0且该预算仍有，枚举合法明子非吃子着，push后确认对方被将军再加入搜索，pop完整恢复；这些新着消耗该预算，吃子和应将沿用原规则。分支中尚未揭开的子不按隐藏真身生成检查着。主深度、估值、采样、身份池、原终局聚合、重复判负、原有着法的排序权重和时限不变。没有同时启用旧风险惩罚、几何表、插入排序或NNUE试验。

## 正确性与代价

release与ASan/UBSan均通过：红黑镜像中稳定第1层0/8识别、第2层6/8识别，试验第1层就识别6/8；24个视角、518次VERIFY走子撤销、23次私有信息核对，每构建2次正式二进制结果一致性检查。44个带逐样本分数的候选按独立JS效用公式核对。时间预算0/1/15/150ms及固定节点中断覆盖路径、库存、将位、哈希和棋盘恢复；消毒器无诊断。项目 npm test ${unit.passed}/${unit.tests}，失败 ${unit.failed}，跳过 ${unit.skipped}。

新检查在红色诊断第1层节点1225→3155，黑色1241→3259，存在明显开销。另做6次串行2秒端到端成本筛查（仅开发数据，不作强度样本）：

| 局面 | 版本 | 完整主层 | 节点 | 实际ms | 推荐 |
| --- | --- | --- | --- | --- | --- |
${bench.runs.map(x=>`| ${x.name} | ${x.engine} | ${x.depth} | ${x.nodes} | ${x.elapsedMs.toFixed(2)} | ${x.move.from}→${x.move.to} |`).join('\n')}

不同搜索树的节点数不能当纯NPS/速度收益。诊断第3局在2秒下试验仅完成5层、稳定6层，推荐也改变；局部战术覆盖与总主深度存在取舍，必须看独立对局，不以专项过关直接推广。

## 冻结正式对照

布局 ${r.plan.seeds.join('/')} 全部不同于诊断、旧16局及开发检查；每布局2局试验对稳定、稳定/试验各2局对AB，合计24局。每手2000ms，同一60ms技术宽限；Mist8样本、最多4世界线程，全明1样本/线程；AB4搜索线程、Hash64MiB、MoveOverhead0、ChasingRule=github、实际NNUE。就绪在计时外，视图投影、采样、规则过滤、完整历史/FEN校验、IPC、搜索与强停回收计时。双方搜索串行，比赛不与编译/其他实验重叠。不根据中途胜负调整参数或样本，不重赛替换失败。

| 比较 | 完成局数 | 胜和负（含技术） | 得分率 | 技术失败 | 未决 | 无技术且无断连子集（仅补充） |
| --- | --- | --- | --- | --- | --- | --- |
${table}

得分率=(胜+0.5×和)/总局数；有未决时不计算单一得分率。技术失败与未决保留在原记录，补充子集不是替代成绩。当前技术判负${allTech.length}个：${allTech.map(g=>`第${g.index+1}局 ${g.kind}/${g.engine}，${g.result.offender}，${g.result.reason}`).join('；')||'无'}。其中第2局稳定版2078.55ms超限；宿主计时器晚触发73.14ms、事件循环间隔最大101.12ms，未发现残留引擎；不能据此区分GC或OS原因，未改预算也未重赛，不作棋力获胜证据。见 technical-review.json。

断连恢复局${interrupted.length}个（${interrupted.map(g=>'第'+(g.index+1)+'局').join('、')||'无'}），单独列示，不伪称无技术影响。第9局在第25半回合后执行连接断开，原PID确认不存在后备份原始证据，保留全部走法和历史，从持久状态续跑；没有重赛前8局。未持久化的下一次搜索是否完成无法核实，恢复重置TT/进程缓存可能影响后续选择，因此该局从无技术且无断连的补充强度子集中排除。原始成绩仍保留；详见resume.json及该局interruptions字段。

## 回放、限制与交付

已回放 ${v.plies} 个已执行半回合、${v.darkCaptures} 次暗吃，${v.repetitions} 次第三次重复判负、${v.rootGuards} 次AB根重复过滤；逐手核验合法性、实际视角指纹、私有暗俘、历史后缀、FEN库存与回合、终局和计时。完整日志保存在matches.json，每手包括完整层/线程/耗时/观察指纹与原始时钟事件；本地裁判真布局仅供复盘，未发给引擎。

${['baseline','trial','ab'].map(e=>{const t=v.time[e];return `- ${e}：${t.attempts}次，平均 ${Number.isFinite(t.mean)?t.mean.toFixed(2):'—'}ms，P95 ${t.p95?.toFixed(2)||'—'}ms，最大 ${t.max?.toFixed(2)||'—'}ms，超2060ms ${t.over2060}次。`;}).join('\n')}

外部终局统一为第三次相同公开棋盘+行棋方由走子方负、无合法着负、120闲半回合和、400封顶未决；AB根白名单排除有替代时的立即第三次重复负。**AB内部循环、80半回合和及揭子计数仍与Mist不同**，实测${v.quietDifferences}次半回合计数不同，不能声称内部规则完全对齐。双方上限线程及时间相同，不代表内存、算法相同；AB还受本机generic SSE2/scalar NNUE构建限制。此前CPU特性查询被系统拒绝后没有重试或改道，本轮未再查询。

只读额度工具为 mcp__codex_app.get_usage_limits，实际可读七日周期10080分钟，最后记录剩余 ${quota.checks.at(-1).remaining}%，低于40%时停新增工作；未知周期不猜测。本任务模型/推理档位无法从read_thread实际返回的字段核实，没有用默认配置或自我身份推断，也没有更改模型设置。

默认引擎保持稳定版，本轮不公开发布。没有操作用户棋局、页面或其他软件，没有浏览器视觉验收，不绕过先前浏览器限制；没有新提交/推送，CI未触发。若结果有希望，也只构成进一步独立验证的理由；四个相关布局不足以可靠升级默认或声称超过AB。若无收益，保留此单变量负结果，不继续无限调参。

复现步骤见[README](../../native/experiments/mate-proof/README.md)，证据位于benchmarks/mate-proof/；原AB构建、模型哈希和协议检查仍位于benchmarks/ab-jchess/。源代码及必要复现证据保留本地，构建对象/外部模型不加入交付清单。
`;
const points=gs=>gs.length===2&&gs.every(g=>g.result&&g.result.status!=='unresolved')?gs.reduce((n,g)=>n+(g.result.status==='draw'?.5:g.result.winner===g.candidateSide?1:0),0):null,pairs=r.plan.seeds.map(seed=>{const internal=r.games.filter(g=>g.seed===seed&&g.kind==='internal'),base=r.games.filter(g=>g.seed===seed&&g.kind==='ab'&&g.engine==='baseline'),trial=r.games.filter(g=>g.seed===seed&&g.kind==='ab'&&g.engine==='trial'),affected=gs=>gs.some(g=>g.result?.technicalForfeit||g.interruptions?.length);return {seed,internalPoints:points(internal),internalAffected:affected(internal),baselineABPoints:points(base),trialABPoints:points(trial),abAffected:affected([...base,...trial])};});
fs.writeFileSync(dir+'/paired.json',JSON.stringify({pairs,interpretation:'Two color-swapped games per layout are correlated. A self pair of1/2 is no net advantage. Do not treat technical wins as strength. Interrupted layouts excluded from clean paired comparison, never removed from raw records.'},null,2)+'\n');
const pairedText=`\n## 按布局配对核对\n\n| 布局 | 试验自比得分/2 | 自比受技术影响 | 稳定对AB得分/2 | 试验对AB得分/2 | AB配对受技术/断连影响 |\n| --- | --- | --- | --- | --- | --- |\n${pairs.map(p=>`| ${p.seed} | ${p.internalPoints??'待完成'} | ${p.internalAffected?'是':'否'} | ${p.baselineABPoints??'待完成'} | ${p.trialABPoints??'待完成'} | ${p.abAffected?'是':'否'} |`).join('\n')}\n\n同一布局的换色局相关；每个干净自比布局得1/2分时，不是试验净胜。补充子集的布局和颜色可能不齐，不能直接用其百分比对原总成绩作收益推断。原始全部成绩不删除。\n`;
fs.mkdirSync('docs/experiments',{recursive:true});fs.writeFileSync('docs/experiments/mate-proof.md',doc+pairedText);console.log(JSON.stringify({complete,completed:r.games.filter(g=>g.result).length,summary:r.summary,pairs,report:'docs/experiments/mate-proof.md'}));
