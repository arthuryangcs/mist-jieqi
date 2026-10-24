import fs from 'node:fs';import assert from 'node:assert/strict';
import {dir,summary,hash} from './common.mjs';
const read=n=>JSON.parse(fs.readFileSync(dir+'/'+n+'.json'));
const m=read('corrected/matches'),v=read('corrected/verification'),training=read('training'),data=read('data-manifest'),audit=read('data-check'),check=read('corrected/check'),san=read('corrected/check-sanitized'),b=read('corrected/benchmark'),unit=read('unit'),pilot=read('matches'),pilotReplay=read('verification'),keyAudit=read('inventory-key');
assert(keyAudit.passed&&pilotReplay.passed);const pilotStats={internal:summary(pilot.games.filter(g=>g.kind==='internal')),baselinePika:summary(pilot.games.filter(g=>g.kind==='pika'&&g.engine==='baseline')),nnuePika:summary(pilot.games.filter(g=>g.kind==='pika'&&g.engine==='nnue'))};
assert(v.passed&&v.complete&&audit.passed&&check.passed&&san.passed&&b.passed&&unit.passed);assert.equal(m.games.filter(g=>g.result).length,m.tasks.length);assert.equal(hash('models/experimental/observation-nnue-v1.bin'),training.modelSha256);
const groups={internal:m.games.filter(g=>g.kind==='internal'),baselinePika:m.games.filter(g=>g.kind==='pika'&&g.engine==='baseline'),nnuePika:m.games.filter(g=>g.kind==='pika'&&g.engine==='nnue')};
const stats=Object.fromEntries(Object.entries(groups).map(([name,gs])=>[name,{total:summary(gs),withoutTechnical:summary(gs.filter(g=>!g.result.technicalForfeit))}]));
const percentile=(xs,q)=>{xs=[...xs].sort((a,b)=>a-b);return xs[Math.ceil(q*xs.length)-1];};
const timing=Object.fromEntries(Object.entries(groups).map(([name,gs])=>{const rows=gs.flatMap(g=>g.log),times=rows.map(x=>x.elapsedMs);return [name,{recordedAttempts:rows.length,p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),maxMs:Math.max(...times),overGrace:rows.filter(x=>x.elapsedMs>1060).length,fallbacks:rows.filter(x=>x.fallbackUsed).length}];}));
const technical=m.games.filter(g=>g.result.technicalForfeit).map(g=>({index:g.index,kind:g.kind,engine:g.engine,seed:g.seed,candidateSide:g.candidateSide,playedPlies:g.finalState.ply,result:g.result,lastAttempt:g.log.at(-1)}));
const decision={promoted:false,reason:'Small residual NNUE prototype only; two unseen paired layouts, no independent strength confirmation. Held-out outcome fit is not move quality or Elo. All technical failures retained; default HCE remains unchanged.',modelSha256:training.modelSha256,statistics:stats,timing,technical,pilot:{completed:pilot.games.filter(g=>g.result).length,planned:pilot.tasks.length,statistics:pilotStats,technical:pilot.games.filter(g=>g.result.technicalForfeit).map(g=>({index:g.index,result:g.result,lastAttempt:g.log.at(-1)})),validForStrengthClaim:false},inventoryKeyAudit:keyAudit,heldOut:training.frozenModel.test,heldOutBaseline:training.baseline.test};
fs.writeFileSync(dir+'/decision.json',JSON.stringify(decision,null,2)+'\n');
const pct=x=>x==null?'未计算':(100*x).toFixed(2)+'%',wdl=x=>`${x.wins}胜${x.draws}和${x.losses}负`,num=x=>x.toFixed(4);
const performance=Object.entries(stats).map(([name,s])=>`| ${{internal:'NNUE对稳定HCE',baselinePika:'稳定HCE对Pika',nnuePika:'NNUE对Pika'}[name]} | ${wdl(s.total)} | ${pct(s.total.scoreRate)} | ${s.total.technical.length} | ${s.total.unresolved} | ${wdl(s.withoutTechnical)} / ${pct(s.withoutTechnical.scoreRate)} |`).join('\n');
const metrics=['train','validation','test'].map(name=>{const a=training.baseline[name],z=training.frozenModel[name];return `| ${name} | ${data.splits[name].layoutHashes.length}/${data.splits[name].games}/${data.splits[name].observations} | ${num(a.weightedBCE)} | ${num(z.weightedBCE)} | ${num(a.weightedBrier)} | ${num(z.weightedBrier)} |`;}).join('\n');
const inference=b.inference.map(x=>`| ${x.position} | ${x.mediansNs[0].toFixed(1)} | ${x.mediansNs[1].toFixed(1)} | ${x.mediansNs[2].toFixed(1)} |`).join('\n');
const games=m.games.map(g=>`| ${g.index} | ${g.kind} | ${g.seed} | ${g.engine} | ${g.candidateSide==='r'?'红':'黑'} | ${g.finalState.ply} | ${g.result.status==='unresolved'?'未决':g.result.status==='draw'?'和':g.result.winner===g.candidateSide?'胜':'负'} | ${g.result.reason}${g.result.technicalForfeit?'（技术）':''} |`).join('\n');
const doc=`# 合法观察残差 NNUE 原型

本轮完成一次固定训练、增量实现、留出评估和开销测量。首次7局集成试跑因新增网络输入未完整纳入缓存键而停止并留档；修复后另作12局未见布局换色验证，两个版本成绩不混合。默认HCE源码和二进制保持不变；实验发布不等于启用。没有根据对局结果重训、换权重、延长预算或删除技术失败。

## 实现与真实增量边界

稳定基线 ${m.baseCommit} / \`${m.stableSourceSha256}\`。原型为2597维稀疏观察特征、16单元clipped ReLU、两个共享权重累加器，强制旋转换色反对称。输出为HCE红方分加±256分的学习残差，权重float32、累加及输出float64。它不是HalfKA分桶、量化整数NNUE或Pikafish网络格式。

修复版置换表/路径键额外包含两色完整分类型库存，覆盖网络新增输入依赖；原HCE仅依赖库存均值的键未修改。每个键因此增大，内存成本不能忽略。

初始时完整累加输入嵌入；走子只增删起终点、翻子、合法私有库存和行棋方特征，撤销恢复当步累加器快照。常规评估只计算隐层和输出，输入层不重新扫描。完整重建模式只作参考。因此实现了真正的增量累加器，并非仅全量MLP；维护和快照仍有成本，没有声称整个引擎更快。显式选择独立二进制并设置MIST_NNUE_MODEL才启用，不接入默认网页。

特征只包含明子位置/身份、暗子公开角色和暗明标记、观察者可知库存、行棋方/观察者；双方明暗棋子均可覆盖全棋盘，未套普通象棋士象位置限制。盘上暗子真身、对方私有暗俘、裁判种子、初始布局哈希不作网络输入。搜索假设翻子使用原有无放回样本，不能当作根已知事实。每个世界/请求/根观察者保持独立状态；观察者改变需重建。共享/无观察者编码只用于数值检查，训练与正式对照使用红黑合法私有视角，未验证共享视角的预测质量。

## 数据、标签与一次训练

只使用已公开自有模拟裁判记录：clock-validation、king-geometry、standpat，共48局、8个真实初始布局、3034步。标签为原参与引擎策略下的实际终局红胜1/黑胜0/和0.5，非完美博弈价值或强引擎全信息标签；没有使用对手私有评分作监督。每布局等权，布局内每局等权，局内观察等权。第8步起每2步抽取两方合法观察，整局及同初始布局所有对局锁在同一分区。

| 分区 | 布局/棋局/观察 | HCE BCE | NNUE BCE | HCE Brier | NNUE Brier |
|---|---:|---:|---:|---:|---:|
${metrics}

plan.json 在训练前固定，随机种子1729、单个16单元模型、120步full-batch Adam、学习率0.005、L2=0.0001，未扫参。仅验证BCE选第 ${training.selectedEpoch} 步；冻结float32检查点后才计算测试指标。所有分区JSON一次读入，但测试数据不进入优化/选模；日志testTouchedDuringTraining=false指未在训练中计算/使用测试指标。偶数步采样使原始行棋方偏红；反对称约束不能代替更多局面数据。

本机已有Python ${training.pythonVersion} / NumPy ${training.numpyVersion}，训练 ${training.elapsedSeconds.toFixed(2)} 秒，无安装、云费用或训练数据上传。模型 ${training.modelBytes} 字节、${training.trainableParameters} 个参数，SHA-256 \`${training.modelSha256}\`。留出误差改善不是棋力证据，836个测试观察只有2个独立布局，不能当836个独立样本或已校准胜率。

数据审计重新验证全部48局合法走法、3034步和2672个观察，严格核对字段仅features/base/target/weight、布局分区无交集、样本权重和量化后指标。真布子仅裁判回放和分组用，训练特征文件不含种子/布局字段。来源、冻结计划、数据指纹见[数据清单](../../benchmarks/nnue/data-manifest.json)、[数据审计](../../benchmarks/nnue/data-check.json)、[训练日志](../../benchmarks/nnue/training.json)。

## 正确性与开销

release与ASan/UBSan均通过 ${check.views} 个视角、${check.transitions} 次走子/撤销，含 ${check.reveals} 次翻子和 ${check.privateCaptures} 条暗俘路径；库存与独立JS公开观察重算一致。增量/完整累加器最大差 ${check.maxAccumulatorError}，独立JS前向最大误差 ${check.maxForwardError}。10组串行及实际多线程搜索的增量/完整模式逐层候选、评分和节点一致，含中断恢复；还检查隐藏真身变化隔离、非法真身输入拒绝及旋转换色反对称。项目 ${unit.pass}/${unit.tests} 测试通过。

初次检查在JavaScript模块加载阶段发现遗漏导出patch，未进入引擎执行；已修复并保留[失败记录](../../benchmarks/nnue/check-initial.json)，未因此重训或改变模型。[发布检查](../../benchmarks/nnue/corrected/check.json)与[内存检查](../../benchmarks/nnue/corrected/check-sanitized.json)均通过。

下表为同状态release单次评估纳秒中位数，5轮交替顺序×25000次调用，no-inline及编译器内存屏障防止循环提升；包括相同测量包装，不含make/unmake累加器维护。它只用于推理调用开销，不能据此算不同搜索树的NPS。

| 局面 | 原HCE ns | HCE+增量NNUE ns | HCE+完整重建NNUE ns |
|---|---:|---:|---:|
${inference}

增量比完整重建省时，但比原HCE调用更贵。3局面×2轮×2版的1秒端到端筛选，开局/中局/残局完整层均4/5/6，两版相同；这不是“NNUE增加了层数”的证据。完整原始计时及开销边界见[基准](../../benchmarks/nnue/corrected/benchmark.json)。

## 集成缺口、停存与修复阶段

这是本轮接入新NNUE特征时漏同步缓存键的错误。网络使用分类型库存，但首版仍沿用HCE的库存总数/总价值键。构造相同盘面、相同总数/总值、不同士象库存的状态，模型分数分别为 ${keyAudit.results[0].scoreA.toFixed(4)} 和 ${keyAudit.results[0].scoreB.toFixed(4)}；旧键相等且只能存1项，修复后键不同、可各自存2项。见[库存键回归](../../benchmarks/nnue/inventory-key.json)。这说明结构性输入依赖遗漏，不证明某场试跑实际命中过该冲突，也不能据此解释所有输赢。

发现后停止启动旧版新局，保留7/12已完成试跑及两次技术超时，独立回放通过；剩余5局未运行。没有删除不利局、重训或改权重。修正版正确性及内存检查重过后，用[修复阶段计划](../../native/experiments/nnue/plan-corrected.json)在开赛前冻结两个全新布局和原定规模12局；它是一次必要的集成修复验证，不是原赛程继续，也不是胜负驱动的超参搜索。原训练计划/数据/模型指纹仍保持原值。

| 旧版试跑（无可靠棋力结论） | 胜和负（含技术） | 技术失败局 |
|---|---|---:|
${Object.entries(pilotStats).map(([name,x])=>`| ${name} | ${wdl(x)} | ${x.technical.length} |`).join('\n')}

旧版证据见[原试跑](../../benchmarks/nnue/matches.json)、[试跑回放](../../benchmarks/nnue/verification.json)和[有效性记录](../../benchmarks/nnue/pilot-validity.json)。早期NNUE首局第13次尝试1090.5ms，计时器迟到72.8ms、kill至退出17.5ms；另一局稳定HCE也超时。两次均保留，未重跑替换，不能仅由这些分段断定全部原因。

## 修复版预定同预算对照

两个新布局 ${m.seeds.join('/')} 均不在训练、验证或测试中。训练前已预定的规模仍为4局NNUE对稳定HCE、另8局两版分别对固定Pika各4局；修复阶段新布局另在开赛前冻结，权重和超参没有变化，换色交错，不按胜负提前停止。每手双方名义1000ms、共同60ms宽限、宿主预留0ms；Mist均8样本/全明1样本、最多4世界线程、每世界9万TT、主深度上限8。就绪在计时外，投影、采样、协议、搜索及搜索触发的停止/回收在内；局末关闭常驻进程另行完成。所有搜索串行，不并跑训练或性能测试。

固定Pika仍为已授权HCE二进制bcc83f88 / \`${m.opponent.binarySha256}\`，NNUE关闭、4线程、Hash64MiB、MoveOverhead0；已知颜色估值不对称保留。两者缓存组织不同，未约束完全相同峰值RSS，不能宣称严格等内存。没有下载或使用Pika网络权重。

裁判为当前第三次相同公开棋盘及行棋方出现时最后走子方判负，将死/困毙优先；120闲步和，400步封顶记未决。Pika用共同searchmoves约束直接重复判负根着；深层循环仍为各引擎近似。未混旧重复判和数据，固定适配器空库存FEN边界仍未改。

| 比较 | 胜和负（含技术） | 得分率 | 技术失败局 | 未决 | 剔除技术后的胜和负/得分率 |
|---|---|---:|---:|---:|---|
${performance}

修复版技术超时发生在第6局第23次走子尝试：用时1095.8ms（共同上限1060ms），计时回调迟到81.4ms、kill至退出13.9ms，未落盘。原始分段保留，不把这一个样本推断成唯一根因。

得分率=(胜+0.5×和)/总局数；若有未决则不计算单一得分率。技术失败全部计入正式结果，正常子集仅作补充，详见[决策](../../benchmarks/nnue/decision.json)。下表仅为修复版正式结果；早期试跑与失败已单列。没有中途增加预留来替换任何失败。

| 序号 | 类别 | 布局 | 本方版本 | 本方颜色 | 已走步数 | 本方结果 | 原因 |
|---:|---|---:|---|---|---:|---|---|
${games}

独立回放 ${v.plies} 步、${v.privateDarkCaptures} 次暗俘信息、${v.repetitionLosses} 次重复判负及 ${v.rootGuardUses} 次Pika根约束触发通过，见[对局](../../benchmarks/nnue/corrected/matches.json)及[回放](../../benchmarks/nnue/corrected/verification.json)。

## 来源、发布与结论

源码为本项目独立实现，权重本机随机初始化并训练；没有复制第三方NNUE代码或加载其检查点。训练来源为本项目已公开的合成对局记录，非用户真实私人棋局。只发布必要代码、计划、日志/清单、校验与对赛证据、自有检查点及[模型说明](../../models/experimental/README.md)，沿用仓库GPLv3；第三方源代码、执行文件、原始缓存训练特征、凭据与账户额度数值均不发布。此次公开分发已另获用户明确许可。

本轮NNUE对稳定HCE为${wdl(stats.internal.total)}，对Pika为${wdl(stats.nnuePika.total)}；稳定HCE对Pika为${wdl(stats.baselinePika.total)}。没有观察到可靠棋力收益，因此保持非默认。

这只是首次小数据残差NNUE原型，不是完整专业训练体系。标签受原策略、未知布局运气和稀疏布局样本影响；搜索仍存在采样相关性与策略融合近似，NNUE不会自动修复战术搜索边界。两组新布局不足以证明棋力增益、超越Pika或给Elo。默认HCE不改，不继续无限训练。若继续，优先扩充独立布局和标签质量，再做固定资源的确认实验。

构建、独立开关、数据复现和安全暂停步骤见[实验README](../../native/experiments/nnue/README.md)。本轮未做真实浏览器验证，未改变用户原棋局或标签页。
`;
fs.mkdirSync('docs/experiments',{recursive:true});fs.writeFileSync('docs/experiments/nnue.md',doc);console.log(JSON.stringify({promoted:false,statistics:stats,timing,modelSha256:training.modelSha256}));
