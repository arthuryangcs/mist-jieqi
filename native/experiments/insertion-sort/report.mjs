import fs from 'node:fs';import assert from 'node:assert/strict';
import {dir,summary} from './common.mjs';
import {initial,publicState,move,legalMoves,rootRules,positionKey} from '../../../engine.js';import {seeded} from '../../../ai.js';
const read=n=>JSON.parse(fs.readFileSync(dir+'/'+n+'.json'));
const m=read('matches'),b=read('benchmark'),v=read('verification'),check=read('check'),sanitized=read('check-sanitized'),unit=read('unit');
const sortProbe=read('sort-probe');assert(sortProbe.passed);const parallel=read('parallel-check');assert(parallel.passed&&parallel.rows.length===10);
assert(m.games.filter(g=>g.result).length===m.tasks.length);assert(v.passed&&v.complete&&b.passed&&check.passed&&sanitized.passed&&unit.passed);
const pct=x=>x==null?'未计算':(100*x).toFixed(2)+'%',n=x=>x.toFixed(1),wdl=x=>`${x.wins}胜${x.draws}和${x.losses}负`;
const groups={internal:m.games.filter(g=>g.kind==='internal'),baselinePika:m.games.filter(g=>g.kind==='pika'&&g.engine==='baseline'),trialPika:m.games.filter(g=>g.kind==='pika'&&g.engine==='trial')};
const stats=Object.fromEntries(Object.entries(groups).map(([k,gs])=>[k,{total:summary(gs),withoutTechnical:summary(gs.filter(g=>!g.result.technicalForfeit))}]));
const quantile=(xs,q)=>{xs=[...xs].sort((a,b)=>a-b);return xs.length?xs[Math.ceil(q*xs.length)-1]:null;};
const timing=Object.fromEntries(Object.entries(groups).map(([k,gs])=>{const rows=gs.flatMap(g=>g.log),xs=rows.map(x=>x.elapsedMs);return [k,{recordedAttempts:xs.length,p50Ms:quantile(xs,.5),p95Ms:quantile(xs,.95),maxMs:Math.max(...xs),overGrace:rows.filter(x=>x.elapsedMs>1060).length,unmeasuredProtocolFailures:gs.filter(g=>g.result.reason==='process-or-protocol-failure').length,fallbacks:rows.filter(x=>x.fallbackUsed).length}];}));
const repetitionDiagnostics=m.games.filter(g=>g.result.reason.includes('重复')).map(g=>{let s=initial(seeded(g.seed));s.positions=[positionKey(s)];for(const row of g.log.slice(0,-1))if(row.applied)s=move(s,row.move);const view=publicState(s,s.turn),ms=legalMoves(view),losing=ms.filter(x=>!view.board[x.from].hidden&&rootRules(view,x).loss);return {index:g.index,side:s.turn,legalRoots:ms.length,immediateRepetitionLosingRoots:losing.length,allLegalRootsLose:losing.length===ms.length};});
const decision={promoted:false,reason:'No consistent fixed-tree speedup or extra completed depth in the budget screen. Two paired layouts only, no reliable strength improvement or superiority to Pika. Keep prototype non-default.',statistics:stats,timing,repetitionDiagnostics,sortProbe,parallelVerification:parallel,verification:{plies:v.plies,privateDarkCaptures:v.privateDarkCaptures,repetitionLosses:v.repetitionLosses,rootGuardUses:v.rootGuardUses},stableSourceSha256:m.stableSourceSha256,trialBuild:m.trialBuild};
fs.writeFileSync(dir+'/decision.json',JSON.stringify(decision,null,2)+'\n');
const table=Object.entries(stats).map(([k,x])=>`| ${{internal:'试验对稳定版',baselinePika:'稳定版对Pika',trialPika:'试验对Pika'}[k]} | ${wdl(x.total)} | ${pct(x.total.scoreRate)} | ${x.total.technical.length} | ${x.total.unresolved} | ${wdl(x.withoutTechnical)} / ${pct(x.withoutTechnical.scoreRate)} |`).join('\n');
const bench=b.summary.map(x=>{const xs=b.fixed.filter(r=>r.position===x.position);return `| ${x.position} | ${x.depth} | ${x.nodes} | ${n(x.baselineMedianMs)} | ${n(x.trialMedianMs)} | ${x.speedup.toFixed(3)}× | ${xs.filter(r=>r.trialCoreMs<r.baselineCoreMs).length}/${xs.length} |`;}).join('\n');
const budgets=[];for(const budgetMs of [1000,6000])for(const position of [...new Set(b.timed.map(x=>x.position))]){const row={budgetMs,position};for(const name of ['baseline','trial'])row[name]=b.timed.filter(x=>x.budgetMs===budgetMs&&x.position===position&&x.name===name).map(x=>x.depth);budgets.push(row);}
const speedups=b.summary.map(x=>x.speedup);
const games=m.games.map(g=>`| ${g.index} | ${g.kind} | ${g.seed} | ${g.engine} | ${g.candidateSide==='r'?'红':'黑'} | ${g.finalState.ply} | ${g.result.status==='unresolved'?'未决':g.result.status==='draw'?'和':g.result.winner===g.candidateSide?'胜':'负'} | ${g.result.reason}${g.result.technicalForfeit?'（技术失败）':''} |`).join('\n');
const doc=`# 内部走法稳定插入排序实验（2026-10-25）

本轮只试验一种完整稳定插入排序，完成同树计时与12局新布局换色筛选，保持非默认。五局面同树中位速度比为${Math.min(...speedups).toFixed(3)}～${Math.max(...speedups).toFixed(3)}倍（大于1才更快）；不能将去掉排序临时分配自动视为搜索提速。没有更改HCE、概率模型、时限、根排序或默认二进制，没有叠加NNUE、stand-pat、几何表或40ms预留实验。固定算法和规模见[计划](../../native/experiments/insertion-sort/plan.json)，未根据输赢调参或追加比赛。

## 依据与实现

稳定基线提交 ${m.baseCommit}，源码SHA-256 \`${m.stableSourceSha256}\`。此前[NATIVE_PERFORMANCE_REPORT](../../NATIVE_PERFORMANCE_REPORT.md)明确记录：走法预评分缓冲已经复用，但递归节点的std::stable_sort仍可能申请临时存储。这仅作为选择本轮方向的源码依据，未用历史计时计算今天速度比。

本轮仅替换该预评分列表的全量稳定排序：逐个保存当前项，严格大于前项评分时向前移动；相等时不移动，保留原生成次序。算法本身不申请额外排序存储，但整个搜索仍有其他分配；本轮没有记录生产排序的分配次数或实际列表长度分布，不能将总耗时差异唯一归因于分配；最坏复杂度O(n²)，长列表可能更慢，不能假定普遍收益。根排序、走法优先级、浮点求和顺序、PVS、TT、killer/history、采样、节点检查与困毙/应将处理均不变。只对有限优先级排序；探针另覆盖正负无穷的严格弱序，不支持NaN优先级。

构建沿用当前稳定清单的同等C++17、-O3、NDEBUG、-ffp-contract=off参数，不启用fast-math。构建仅写忽略目录，默认源码和二进制未覆盖。

## 正确性与性能

发布版和ASan/UBSan各通过 ${check.views} 个视角、${check.transitions} 次走子/撤销、10组固定节点搜索。合法走法、将军、困毙、马腿/象眼/炮架等对照独立JS规则；评估、翻子、暗俘库存、恢复状态、逐层全部候选/评分和节点对照稳定版。任意压力摆图不主张库存合法。项目 ${unit.pass}/${unit.tests} 测试通过。

独立[排序探针](../../benchmarks/insertion-sort/sort-probe.json)在发布及内存检查构建中各验证1152组、143424项，长度0至1024，包含空/单项、正序/反序、全同分/密集同分/随机、正负零、正负无穷和次正规数；与std::stable_sort逐项核对走法顺序和评分位模式。[规则/搜索检查](../../benchmarks/insertion-sort/check.json)、[内存检查](../../benchmarks/insertion-sort/check-sanitized.json)均通过。

排序探针通过重命名原main复用引擎类型；原main依赖主入口隐式返回0，重命名后编译器对这个未调用包装函数提示return-type警告。警告文本保留，探针未调用该包装函数，正式引擎构建没有此警告。发布审查仅将诊断内本机绝对项目路径替换为&lt;project&gt;，原始诊断保存在忽略目录，源/二进制哈希及结果未改变；处理脚本为release-review.mjs。

固定节点上限强制单线程；另以无节点上限核对实际最多4线程路径，发布版及ASan/UBSan各5局面，共10组，逐层全部候选、评分、推荐、节点和恢复状态一致。全明1样本仍单线程，见[并行核对](../../benchmarks/insertion-sort/parallel-check.json)。

同机五个固定局面、相同观察/无放回样本/种子/排序/节点上限，预热后轮换顺序，各5次串行配对；25对均完整达到指定主层，节点及逐层全部候选一致。core不含协议编码/IPC，wall另存；不拿不同搜索树的NPS计算纯提速。

| 局面 | 完整层 | 相同节点 | 稳定中位ms | 试验中位ms | 提速比 | 试验更快的配对次数 |
|---|---:|---:|---:|---:|---:|---:|
${bench}

端到端预算筛选为3局面×2预算×2轮×2版，共24次；仅报告已完整完成的层，不把未完成层计入。

| 预算ms | 局面 | 稳定完整层（两次） | 试验完整层（两次） |
|---:|---|---|---|
${budgets.map(x=>`| ${x.budgetMs} | ${x.position} | ${x.baseline.join('/')} | ${x.trial.join('/')} |`).join('\n')}

详见[原始基准](../../benchmarks/insertion-sort/benchmark.json)。仅此Mac、五局面与五次重复，调度/热状态未完全受控；不外推全部硬件或局面。

## 同预算新布局换色对局

${m.seeds.join('/')} 两个新布局及顺序在对局前冻结，并核对不重复此前已提交matches.json记录的初始布局。每布局红黑互换，4局试验对稳定，另8局稳定/试验各对固定Pika4局，交替执行。所有搜索串行，每手双方名义1000ms、共同60ms宽限；就绪在计时外，公开投影、采样、编码、IPC、FEN/根规则核对及搜索触发的停止/回收在内，局末关闭常驻进程另行完成。宿主额外预留均为0ms；两版C++原有最多35ms核心收尾余量一致。Mist均8样本、全明1样本、最多4世界线程、每世界9万TT、主深度上限8。

固定PikaJieQi仍为已授权二进制 \`bcc83f88\` / \`${m.opponent.binarySha256}\`：HCE、NNUE关闭、4线程、Hash64MiB、MoveOverhead0；已知颜色估值不对称保留。未修改、下载或重编译第三方，未改安全设置。

本轮统一名义时限及最多4个搜索线程；两实现缓存组织不同，没有将峰值RSS限制为完全相同，因此不宣称严格等内存下的优劣。

统一裁判为第三次相同公开棋盘及行棋方出现时最后走子方判负，将死/困毙优先；120闲步和，400步封顶记未决。Pika用共同searchmoves根约束，在有替代时排除直接重复判负根着；两版Mist根评分已处理同一规则。双方深层循环仍各自近似，不代表完整长将/长捉责任搜索。未混入旧判和对局；固定适配器既有空库存FEN格式边界未修订。

| 比较 | 胜和负（含技术） | 得分率 | 技术失败局 | 未决 | 剔除技术后的胜和负/得分率 |
|---|---|---:|---:|---:|---|
${table}

得分率=(胜+0.5×和)/总局数，未决存在时不计算单一值。技术失败不删除；正常子集仅作补充。所有有计时记录的尝试（含失败）的p50/p95/最大值、保底次数与重复判负末步合法根诊断见[决策记录](../../benchmarks/insertion-sort/decision.json)。

| 序号 | 类别 | 布局 | 本方版本 | 本方颜色 | 已走步数 | 本方结果 | 原因 |
|---:|---|---:|---|---|---:|---|---|
${games}

## 信息边界与限制

仅行棋方publicState进入搜索；真暗布局和裁判种子不传引擎。暗俘身份仅吃子方可见；未知离盘身份仍作为库存潜变量，采样无放回。代码拒绝公开暗子/暗俘携带真实身份，真实隐藏布局变化不改变公开观察与固定采样。独立回放 ${v.plies} 步、${v.privateDarkCaptures} 次暗俘信息、${v.repetitionLosses} 次重复判负、${v.rootGuardUses} 次Pika根约束触发通过，见[原始对局](../../benchmarks/insertion-sort/matches.json)及[回放](../../benchmarks/insertion-sort/verification.json)。

本轮试验对稳定版为${wdl(stats.internal.total)}，对Pika为${wdl(stats.trialPika.total)}；同批稳定版对Pika为${wdl(stats.baselinePika.total)}。同树计时没有一致收益，预算筛选未多完成一层，因此维持默认HCE及原排序实现。

仅两个相关布局对，未完成独立确认；不能从小样本得分率归因算法改动造成棋力提升。较高得分、更多节点或终局高层/零节点元数据均不能证明超越Pika；不据此估算Elo。概率估计仍受8个相关平衡样本、固定HCE对手及搜索循环近似限制。实验发布不等于默认启用。本轮无UI改动，未做真实浏览器验证；项目单元测试不等于浏览器验收。

复现和暂停恢复步骤见[实验README](../../native/experiments/insertion-sort/README.md)。冻结源码和二进制变更会拒绝续跑，已有记录不可覆盖；第三方、构建产物、凭据及账户额度数值不发布。
`;
fs.mkdirSync('docs/experiments',{recursive:true});fs.writeFileSync('docs/experiments/insertion-sort.md',doc);console.log(JSON.stringify({promoted:false,statistics:stats,timing}));
