import fs from 'node:fs';import assert from 'node:assert/strict';
import {dir,summary} from './common.mjs';
import {initial,publicState,move,legalMoves,rootRules,positionKey} from '../../../engine.js';import {seeded} from '../../../ai.js';
const read=n=>JSON.parse(fs.readFileSync(dir+'/'+n+'.json'));
const m=read('matches'),b=read('benchmark'),v=read('verification'),check=read('check'),sanitized=read('check-sanitized'),unit=read('unit');
const maskProbe=read('mask-probe');assert(maskProbe.passed);const parallel=read('parallel-check');assert(parallel.passed&&parallel.rows.length===10);
assert(m.games.filter(g=>g.result).length===m.tasks.length);assert(v.passed&&v.complete&&b.passed&&check.passed&&sanitized.passed&&unit.passed);
const pct=x=>x==null?'未计算':(100*x).toFixed(2)+'%',n=x=>x.toFixed(1),wdl=x=>`${x.wins}胜${x.draws}和${x.losses}负`;
const groups={internal:m.games.filter(g=>g.kind==='internal'),baselinePika:m.games.filter(g=>g.kind==='pika'&&g.engine==='baseline'),trialPika:m.games.filter(g=>g.kind==='pika'&&g.engine==='trial')};
const stats=Object.fromEntries(Object.entries(groups).map(([k,gs])=>[k,{total:summary(gs),withoutTechnical:summary(gs.filter(g=>!g.result.technicalForfeit))}]));
const quantile=(xs,q)=>{xs=[...xs].sort((a,b)=>a-b);return xs.length?xs[Math.ceil(q*xs.length)-1]:null;};
const timing=Object.fromEntries(Object.entries(groups).map(([k,gs])=>{const rows=gs.flatMap(g=>g.log),xs=rows.map(x=>x.elapsedMs);return [k,{recordedAttempts:xs.length,p50Ms:quantile(xs,.5),p95Ms:quantile(xs,.95),maxMs:Math.max(...xs),overGrace:rows.filter(x=>x.elapsedMs>1060).length,unmeasuredProtocolFailures:gs.filter(g=>g.result.reason==='process-or-protocol-failure').length,fallbacks:rows.filter(x=>x.fallbackUsed).length}];}));
const repetitionDiagnostics=m.games.filter(g=>g.result.reason.includes('重复')).map(g=>{let s=initial(seeded(g.seed));s.positions=[positionKey(s)];for(const row of g.log.slice(0,-1))if(row.applied)s=move(s,row.move);const view=publicState(s,s.turn),ms=legalMoves(view),losing=ms.filter(x=>!view.board[x.from].hidden&&rootRules(view,x).loss);return {index:g.index,side:s.turn,legalRoots:ms.length,immediateRepetitionLosingRoots:losing.length,allLegalRootsLose:losing.length===ms.length};});
const decision={promoted:false,reason:'Four of five fixed-tree medians slower, no extra completed depth in the budget screen. Two paired layouts only; no reliable strength benefit. Keep default HCE unchanged.',statistics:stats,timing,repetitionDiagnostics,maskProbe,parallelVerification:parallel,verification:{plies:v.plies,privateDarkCaptures:v.privateDarkCaptures,repetitionLosses:v.repetitionLosses,rootGuardUses:v.rootGuardUses},stableSourceSha256:m.stableSourceSha256,trialBuild:m.trialBuild};
fs.writeFileSync(dir+'/decision.json',JSON.stringify(decision,null,2)+'\n');
const table=Object.entries(stats).map(([k,x])=>`| ${{internal:'试验对稳定版',baselinePika:'稳定版对Pika',trialPika:'试验对Pika'}[k]} | ${wdl(x.total)} | ${pct(x.total.scoreRate)} | ${x.total.technical.length} | ${x.total.unresolved} | ${wdl(x.withoutTechnical)} / ${pct(x.withoutTechnical.scoreRate)} |`).join('\n');
const bench=b.summary.map(x=>{const xs=b.fixed.filter(r=>r.position===x.position);return `| ${x.position} | ${x.depth} | ${x.nodes} | ${n(x.baselineMedianMs)} | ${n(x.trialMedianMs)} | ${x.speedup.toFixed(3)}× | ${xs.filter(r=>r.trialCoreMs<r.baselineCoreMs).length}/${xs.length} |`;}).join('\n');
const budgets=[];for(const budgetMs of [1000,6000])for(const position of [...new Set(b.timed.map(x=>x.position))]){const row={budgetMs,position};for(const name of ['baseline','trial'])row[name]=b.timed.filter(x=>x.budgetMs===budgetMs&&x.position===position&&x.name===name).map(x=>x.depth);budgets.push(row);}
const speedups=b.summary.map(x=>x.speedup);
const games=m.games.map(g=>`| ${g.index} | ${g.kind} | ${g.seed} | ${g.engine} | ${g.candidateSide==='r'?'红':'黑'} | ${g.finalState.ply} | ${g.result.status==='unresolved'?'未决':g.result.status==='draw'?'和':g.result.winner===g.candidateSide?'胜':'负'} | ${g.result.reason}${g.result.technicalForfeit?'（技术失败）':''} |`).join('\n');
const doc=`# 增量己方棋子位图实验（2026-10-26）

本轮固定一个派生占位缓存假设，完成同树效率测量与12局新布局换色对照，保持非默认。五个固定局面中位速度比为${Math.min(...speedups).toFixed(3)}～${Math.max(...speedups).toFixed(3)}倍（大于1才更快）。没有叠加插入排序、NNUE、stand-pat、几何表或宿主预留实验；不根据输赢调参或追加比赛。算法与规模见[冻结计划](../../native/experiments/piece-mask/plan.json)。

## 依据与实现

稳定基线提交 ${m.baseCommit}，源码SHA-256 \`${m.stableSourceSha256}\`。当前legalInto每次从0到89扫描棋盘来枚举己方棋子；此前[NATIVE_PERFORMANCE_REPORT](../../NATIVE_PERFORMANCE_REPORT.md)的插桩显示合法走法生成开销较高，这仅用作选择方向，不混入本轮计时。昨日插入排序没有提速，本轮保留原std::stable_sort。

仅给每个采样State新增两色各两个64位字，记录90格的占位；stateOf建立，push/pop对走子起终点及被吃子按颜色异或维护。以ctzll依次取最低有效位，从低字再到高字，保持原升序格号及走法顺序；不对零字调用ctzll。翻子只改变身份，不改变颜色或占位。每世界占位字段32字节，并增加make/unmake位操作；没有把这些维护成本排除在搜索计时外。

递归合法走法及困毙首次合法着探测采用位图枚举；棋子候选、pseudo、将军安全检查与早返回逻辑从冻结原扫描器派生，原扫描器保留为诊断对照。根生成、估值扫描、排序、PVS/TT、killer/history、采样、节点定义、时限和全部规则不变。占位是棋盘的派生缓存，不是额外信息输入，不改变TT键语义，也不包含暗子真实身份。

构建沿用当前稳定清单的C++17、-O3、NDEBUG、-ffp-contract=off参数，不启用fast-math；仅用本机已有Clang及其ctzll内建，不安装依赖、不下载第三方代码；未验证其他编译器。编译工具复用standpat/build.mjs的参数，不启用其stand-pat语义。默认源码与二进制均未改。

## 正确性与性能

发布版和ASan/UBSan各通过 ${check.views} 个视角、${check.transitions} 次走子/撤销、10组固定节点搜索。VERIFY实际走缓存路径，初始、走子后和撤销后均重建位图核对；合法走法及吃子次序、将军、困毙、马腿/象眼/炮架等对照独立JS规则，估值、翻子、公私库存与稳定版一致。任意压力摆图不主张库存合法。项目 ${unit.pass}/${unit.tests} 测试通过。

[位图专项探针](../../benchmarks/piece-mask/mask-probe.json)发布及内存检查版本各完成1090组位边界用例，覆盖空/满图、所有单格、63/64/89格；33个样本世界连续走子64步后完整撤销，共4224次变化、318次翻子、48次暗俘、340次跨字移动。16896组两色/全走法/吃子/首次合法着对照原扫描器，顺序相同。每次生成前都从棋盘重建位图，重放后检查棋盘、库存键、行棋方、将位、人口和占位恢复。

ASan/UBSan及探针还在每次缓存生成后与原扫描器做完整对照。无节点上限的实际最多4线程路径另核对发布版及内存检查版各5局面，逐层候选、评分、推荐及节点一致；中断展开后的世界恢复含位图。全明1样本仍为1线程，见[并行检查](../../benchmarks/piece-mask/parallel-check.json)、[规则检查](../../benchmarks/piece-mask/check.json)、[内存检查](../../benchmarks/piece-mask/check-sanitized.json)。诊断与重建守卫不用于性能测量或正式对赛。

专项探针首次ASan编译有调试宏重复定义警告，数值检查仍通过；修正为条件定义后只重跑探针，保留[首次记录](../../benchmarks/piece-mask/mask-probe-first.json)，其中本机路径已替换为项目占位符。未改搜索算法、计时基准、参数或棋局。

首轮JavaScript构建脚本生成时出现换行转义错误，未进入C++编译或引擎执行，已修复并保留[失败记录](../../benchmarks/piece-mask/check-initial.json)；没有因此重跑正式棋局或改变预定算法。

同机五局面、同一观察/无放回样本/种子/节点上限，预热后交替顺序，各5次串行配对；25对均完整达到指定主层，节点及逐层全部候选一致。core不含协议编码/IPC，wall另存；只拿相同搜索树计算速度比。

| 局面 | 完整层 | 相同节点 | 稳定中位ms | 试验中位ms | 提速比 | 试验更快的配对次数 |
|---|---:|---:|---:|---:|---:|---:|
${bench}

端到端预算筛选为3局面×2预算×2轮×2版，共24次；只报告完整完成的层，不混未完成层。

| 预算ms | 局面 | 稳定完整层（两次） | 试验完整层（两次） |
|---:|---|---|---|
${budgets.map(x=>`| ${x.budgetMs} | ${x.position} | ${x.baseline.join('/')} | ${x.trial.join('/')} |`).join('\n')}

五个局面有四个中位耗时变慢，只有全明残局约快2.3%，没有一致提速，预算筛选也未多完成一层。没有做本轮分项剖析，不能将总耗时差异唯一归因于位图维护成本。

详见[原始基准](../../benchmarks/piece-mask/benchmark.json)。仅此Mac、五局面、五次重复；调度/热状态未完全受控，不外推全部硬件或局面，也不把NPS或层数等同棋力。

## 同预算新布局换色对局

${m.seeds.join('/')} 两个新布局及顺序在对局前冻结，并核对不重复此前已提交matches.json记录的初始布局。每布局红黑互换，4局试验对稳定，另8局稳定/试验各对固定Pika4局，交替执行。所有搜索串行，每手双方名义1000ms、共同60ms宽限；就绪在计时外，公开投影、采样、编码、IPC、FEN/根规则核对及搜索触发的停止/回收在内，局末关闭常驻进程另行完成。宿主额外预留均为0ms；两版C++原有最多35ms核心收尾余量一致。Mist均8样本、全明1样本、最多4世界线程、每世界9万TT、主深度上限8。

固定PikaJieQi仍为已授权二进制 \`bcc83f88\` / \`${m.opponent.binarySha256}\`：HCE、NNUE关闭、4线程、Hash64MiB、MoveOverhead0；已知颜色估值不对称保留。未修改、下载或重编译第三方，未改安全设置。

本轮统一名义时限及最多4个搜索线程；两实现缓存组织不同，没有将峰值RSS限制为完全相同，因此不宣称严格等内存下的优劣。

统一裁判为第三次相同公开棋盘及行棋方出现时最后走子方判负，将死/困毙优先；120闲步和，400步封顶记未决。Pika用共同searchmoves根约束，在有替代时排除直接重复判负根着；两版Mist根评分已处理同一规则。双方深层循环仍各自近似，不代表完整长将/长捉责任搜索。未混入旧判和对局；固定适配器既有空库存FEN格式边界未修订。

| 比较 | 胜和负（含技术） | 得分率 | 技术失败局 | 未决 | 剔除技术后的胜和负/得分率 |
|---|---|---:|---:|---:|---|
${table}

得分率=(胜+0.5×和)/总局数，未决存在时不计算单一值。技术失败不删除；正常子集仅作补充。所有有计时记录的尝试（含失败）的p50/p95/最大值、保底次数与重复判负末步合法根诊断见[决策记录](../../benchmarks/piece-mask/decision.json)。

| 序号 | 类别 | 布局 | 本方版本 | 本方颜色 | 已走步数 | 本方结果 | 原因 |
|---:|---|---:|---|---|---:|---|---|
${games}

## 信息边界与限制

仅行棋方publicState进入搜索；真暗布局和裁判种子不传引擎。暗俘身份仅吃子方可见；未知离盘身份仍作为库存潜变量，采样无放回。代码拒绝公开暗子/暗俘携带真实身份，真实隐藏布局变化不改变公开观察与固定采样。独立回放 ${v.plies} 步、${v.privateDarkCaptures} 次暗俘信息、${v.repetitionLosses} 次重复判负、${v.rootGuardUses} 次Pika根约束触发通过，见[原始对局](../../benchmarks/piece-mask/matches.json)及[回放](../../benchmarks/piece-mask/verification.json)。

本轮试验对稳定版为${wdl(stats.internal.total)}，对Pika为${wdl(stats.trialPika.total)}；同批稳定版对Pika为${wdl(stats.baselinePika.total)}。同树计时及层数筛选只能说明本轮效率，不能代替棋力确认，因此维持默认HCE及原扫描实现。

仅两个相关布局对，未完成独立确认；不能从小样本得分率归因算法改动造成棋力提升。较高得分、更多节点或终局高层/零节点元数据均不能证明超越Pika；不据此估算Elo。概率估计仍受8个相关平衡样本、固定HCE对手及搜索循环近似限制。实验发布不等于默认启用。本轮无UI改动，未做真实浏览器验证；项目单元测试不等于浏览器验收。

复现和暂停恢复步骤见[实验README](../../native/experiments/piece-mask/README.md)。冻结源码和二进制变更会拒绝续跑，已有记录不可覆盖；第三方、构建产物、凭据及账户额度数值不发布。
`;
fs.mkdirSync('docs/experiments',{recursive:true});fs.writeFileSync('docs/experiments/piece-mask.md',doc);console.log(JSON.stringify({promoted:false,statistics:stats,timing}));
