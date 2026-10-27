import fs from 'node:fs';import assert from 'node:assert/strict';
import {dir,summary} from './common.mjs';
import {initial,publicState,move,legalMoves,rootRules,positionKey} from '../../../engine.js';import {seeded} from '../../../ai.js';
const read=n=>JSON.parse(fs.readFileSync(dir+'/'+n+'.json'));
const m=read('matches'),b=read('benchmark'),v=read('verification'),check=read('check'),sanitized=read('check-sanitized'),unit=read('unit');
const cycleProbe=read('cycle-probe');assert(cycleProbe.passed);const parallel=read('parallel-check');assert(parallel.passed&&parallel.rows.length===10);
assert(m.games.filter(g=>g.result).length===m.tasks.length);assert(v.passed&&v.complete&&b.passed&&check.passed&&sanitized.passed&&unit.passed);
const pct=x=>x==null?'未计算':(100*x).toFixed(2)+'%',n=x=>x.toFixed(1),wdl=x=>`${x.wins}胜${x.draws}和${x.losses}负`;
const groups={internal:m.games.filter(g=>g.kind==='internal'),baselinePika:m.games.filter(g=>g.kind==='pika'&&g.engine==='baseline'),trialPika:m.games.filter(g=>g.kind==='pika'&&g.engine==='trial')};
const stats=Object.fromEntries(Object.entries(groups).map(([k,gs])=>[k,{total:summary(gs),withoutTechnical:summary(gs.filter(g=>!g.result.technicalForfeit))}]));
const quantile=(xs,q)=>{xs=[...xs].sort((a,b)=>a-b);return xs.length?xs[Math.ceil(q*xs.length)-1]:null;};
const timing=Object.fromEntries(Object.entries(groups).map(([k,gs])=>{const rows=gs.flatMap(g=>g.log),xs=rows.map(x=>x.elapsedMs);return [k,{recordedAttempts:xs.length,p50Ms:quantile(xs,.5),p95Ms:quantile(xs,.95),maxMs:Math.max(...xs),overGrace:rows.filter(x=>x.elapsedMs>1060).length,unmeasuredProtocolFailures:gs.filter(g=>g.result.reason==='process-or-protocol-failure').length,fallbacks:rows.filter(x=>x.fallbackUsed).length}];}));
const repetitionDiagnostics=m.games.filter(g=>g.result.reason.includes('重复')).map(g=>{let s=initial(seeded(g.seed));s.positions=[positionKey(s)];for(const row of g.log.slice(0,-1))if(row.applied)s=move(s,row.move);const view=publicState(s,s.turn),ms=legalMoves(view),losing=ms.filter(x=>!view.board[x.from].hidden&&rootRules(view,x).loss);return {index:g.index,side:s.turn,legalRoots:ms.length,immediateRepetitionLosingRoots:losing.length,allLegalRootsLose:losing.length===ms.length};});
const decision={promoted:false,reason:'Fixed-tree medians show no meaningful overall speed benefit, budget screen has no additional complete depth. Two paired layouts only, no independent strength confirmation; keep default unchanged.',statistics:stats,timing,repetitionDiagnostics,cycleProbe,parallelVerification:parallel,verification:{plies:v.plies,privateDarkCaptures:v.privateDarkCaptures,repetitionLosses:v.repetitionLosses,rootGuardUses:v.rootGuardUses},stableSourceSha256:m.stableSourceSha256,trialBuild:m.trialBuild};
fs.writeFileSync(dir+'/decision.json',JSON.stringify(decision,null,2)+'\n');
const table=Object.entries(stats).map(([k,x])=>`| ${{internal:'试验对稳定版',baselinePika:'稳定版对Pika',trialPika:'试验对Pika'}[k]} | ${wdl(x.total)} | ${pct(x.total.scoreRate)} | ${x.total.technical.length} | ${x.total.unresolved} | ${wdl(x.withoutTechnical)} / ${pct(x.withoutTechnical.scoreRate)} |`).join('\n');
const bench=b.summary.map(x=>{const xs=b.fixed.filter(r=>r.position===x.position);return `| ${x.position} | ${x.depth} | ${x.nodes} | ${n(x.baselineMedianMs)} | ${n(x.trialMedianMs)} | ${x.speedup.toFixed(3)}× | ${xs.filter(r=>r.trialCoreMs<r.baselineCoreMs).length}/${xs.length} |`;}).join('\n');
const budgets=[];for(const budgetMs of [1000,6000])for(const position of [...new Set(b.timed.map(x=>x.position))]){const row={budgetMs,position};for(const name of ['baseline','trial'])row[name]=b.timed.filter(x=>x.budgetMs===budgetMs&&x.position===position&&x.name===name).map(x=>x.depth);budgets.push(row);}
const speedups=b.summary.map(x=>x.speedup);
const games=m.games.map(g=>`| ${g.index} | ${g.kind} | ${g.seed} | ${g.engine} | ${g.candidateSide==='r'?'红':'黑'} | ${g.finalState.ply} | ${g.result.status==='unresolved'?'未决':g.result.status==='draw'?'和':g.result.winner===g.candidateSide?'胜':'负'} | ${g.result.reason}${g.result.technicalForfeit?'（技术失败）':''} |`).join('\n');
const doc=`# 同一行棋方循环路径扫描实验（2026-10-27）

本轮固定一个路径循环查询优化，完成同树计时与12局新布局换色筛选，保持非默认。五个固定局面中位速度比为${Math.min(...speedups).toFixed(3)}～${Math.max(...speedups).toFixed(3)}倍（大于1才更快）。不根据输赢换算法、改预算或增加比赛；没有叠加NNUE、插入排序、棋子位图、stand-pat、几何表或预留量实验。算法和规模见[计划](../../native/experiments/cycle-parity/plan.json)。

## 依据与等价边界

稳定基线提交 ${m.baseCommit}，源码SHA-256 \`${m.stableSourceSha256}\`。当前search在每个节点用std::find扫描路径Key；Key包含行棋方，而每条真实搜索边由push翻转行棋方。当前没有空步或不落子而继续追加同方路径项的递归；PVS重搜在前次调用返回、路径撤回后进行。不能相等的另一方历史项因此可以跳过；不改变棋盘、估值或搜索树。既有[走法与路径栈报告](../../NATIVE_MOVEGEN_REPORT.md)保留了路径栈演进证据，本轮不混用其中历史速度比。

新函数根据路径首项行棋方选择起点，保留原前向顺序，再隔一项比较完整Key；不将遍历方向作为额外优化变量。仍比较两个棋盘哈希、行棋方、双方私有库存数量/价值及原扩展字段。即便棋盘相同，私有库存不同也不会误作同一Key。空/单项、奇/偶长度及首项与查询同方/异方均处理。没有新缓存、跨世界/请求信息、节点剪枝或降低样本。

搜索内循环仍增加原cycles计数并返回原0分，影响TT写入的循环保护不变；根第三次公开重复时落子方判负仍由原根元数据与JS裁判执行。深层循环仍是原提前截断近似，不把本轮优化当成更完整的重复责任搜索。路径push/pop、异常/超时撤回、PVS/TT、qsearch、将军延伸及节点检查不变。

本机已有Clang、C++17、-O3、NDEBUG、-ffp-contract=off，不启用fast-math，不安装依赖、不下载第三方代码。编译工具只复用standpat/build.mjs的参数；默认源码与二进制均未覆盖。

## 正确性与性能

发布版与ASan/UBSan各通过 ${check.views} 个视角、${check.transitions} 次走子/撤销、10组固定节点搜索。合法走法、将军、困毙、马腿/象眼/炮架等对照独立JS规则；估值、公私库存、翻子、恢复状态及逐层全部候选/评分/节点与稳定版一致。任意压力摆图不主张库存合法。项目 ${unit.pass}/${unit.tests} 测试通过。

[路径专项探针](../../benchmarks/cycle-parity/cycle-probe.json)发布及内存检查版本各核对 ${cycleProbe.rows[0].cases} 组查询，路径长度0到160、两种起始方、奇偶长度、空/单项、匹配/不匹配与多次重复Key，全部与原std::find一致。另逐项改变完整Key的8个字段，确保四项私有库存字段及扩展字段都未忽略。随机种子固定2026102707，不涉及裁判真实暗布局。

ASan/UBSan与探针在每次查询检查路径行棋方交替，并逐次与原完整扫描比较；发布正式搜索不运行这些诊断。无节点上限的实际最多4线程路径另核对发布版及内存检查版各5局面，逐层全部候选、评分、推荐与节点相同；超时展开后检查每世界状态恢复。全明1样本仍单线程，见[规则检查](../../benchmarks/cycle-parity/check.json)、[内存检查](../../benchmarks/cycle-parity/check-sanitized.json)、[并行检查](../../benchmarks/cycle-parity/parallel-check.json)。

同机五个固定局面、相同观察/无放回样本/种子/节点上限，预热后轮换顺序，各5次串行配对。25对均完整达到指定层数，节点及逐层全部候选相同。core不含协议编码/IPC，wall另存；只用同一搜索树计算纯速度比。

| 局面 | 完整层 | 相同节点 | 稳定中位ms | 试验中位ms | 提速比 | 试验更快的配对次数 |
|---|---:|---:|---:|---:|---:|---:|
${bench}

端到端预算筛选为3局面×2预算×2轮×2版，共24次；只报告完整完成的层，不混未完成层。

| 预算ms | 局面 | 稳定完整层（两次） | 试验完整层（两次） |
|---:|---|---|---|
${budgets.map(x=>`| ${x.budgetMs} | ${x.position} | ${x.baseline.join('/')} | ${x.trial.join('/')} |`).join('\n')}

本轮五处速度比均接近1，四处中位耗时略慢、一处略快，未见可靠整体提速；预算筛选未新增完整层。没有本轮逐项剖析，不能将小幅差异唯一归因于比较次数或循环结构。

详见[原始基准](../../benchmarks/cycle-parity/benchmark.json)。仅此Mac、五局面与五次重复，调度/热状态未完全受控；不外推所有机器，不将比较次数或更深层数当成棋力证据。

## 同预算新布局换色对局

${m.seeds.join('/')} 两个新布局及顺序在对局前冻结，并核对不重复此前已提交matches.json记录的初始布局。每布局红黑互换，4局试验对稳定，另8局稳定/试验各对固定Pika4局，交替执行。所有搜索串行，每手双方名义1000ms、共同60ms宽限；就绪在计时外，公开投影、采样、编码、IPC、FEN/根规则核对及搜索触发的停止/回收在内，局末关闭常驻进程另行完成。宿主额外预留均为0ms；两版C++原有最多35ms核心收尾余量一致。Mist均8样本、全明1样本、最多4世界线程、每世界9万TT、主深度上限8。

固定PikaJieQi仍为已授权二进制 \`bcc83f88\` / \`${m.opponent.binarySha256}\`：HCE、NNUE关闭、4线程、Hash64MiB、MoveOverhead0；已知颜色估值不对称保留。未修改、下载或重编译第三方，未改安全设置。

本轮统一名义时限及最多4个搜索线程；两实现缓存组织不同，没有将峰值RSS限制为完全相同，因此不宣称严格等内存下的优劣。

统一裁判为第三次相同公开棋盘及行棋方出现时最后走子方判负，将死/困毙优先；120闲步和，400步封顶记未决。Pika用共同searchmoves根约束，在有替代时排除直接重复判负根着；两版Mist根评分已处理同一规则。双方深层循环仍各自近似，不代表完整长将/长捉责任搜索。未混入旧判和对局；固定适配器既有空库存FEN格式边界未修订。

| 比较 | 胜和负（含技术） | 得分率 | 技术失败局 | 未决 | 剔除技术后的胜和负/得分率 |
|---|---|---:|---:|---:|---|
${table}

得分率=(胜+0.5×和)/总局数，未决存在时不计算单一值。技术失败不删除；正常子集仅作补充。所有有计时记录的尝试（含失败）的p50/p95/最大值、保底次数与重复判负末步合法根诊断见[决策记录](../../benchmarks/cycle-parity/decision.json)。

| 序号 | 类别 | 布局 | 本方版本 | 本方颜色 | 已走步数 | 本方结果 | 原因 |
|---:|---|---:|---|---|---:|---|---|
${games}

## 信息边界与限制

仅行棋方publicState进入搜索；真暗布局和裁判种子不传引擎。暗俘身份仅吃子方可见；未知离盘身份仍作为库存潜变量，采样无放回。代码拒绝公开暗子/暗俘携带真实身份，真实隐藏布局变化不改变公开观察与固定采样。独立回放 ${v.plies} 步、${v.privateDarkCaptures} 次暗俘信息、${v.repetitionLosses} 次重复判负、${v.rootGuardUses} 次Pika根约束触发通过，见[原始对局](../../benchmarks/cycle-parity/matches.json)及[回放](../../benchmarks/cycle-parity/verification.json)。

本轮试验对稳定版为${wdl(stats.internal.total)}，对Pika为${wdl(stats.trialPika.total)}；同批稳定版对Pika为${wdl(stats.baselinePika.total)}。同树计时和预算层数不代替棋力确认，因此维持默认HCE及原路径扫描实现。

仅两个相关布局对，未完成独立确认；不能从小样本得分率归因算法改动造成棋力提升。较高得分、更多节点或终局高层/零节点元数据均不能证明超越Pika；不据此估算Elo。概率估计仍受8个相关平衡样本、固定HCE对手及搜索循环近似限制。实验发布不等于默认启用。本轮无UI改动，未做真实浏览器验证；项目单元测试不等于浏览器验收。

复现和暂停恢复步骤见[实验README](../../native/experiments/cycle-parity/README.md)。冻结源码和二进制变更会拒绝续跑，已有记录不可覆盖；第三方、构建产物、凭据及账户额度数值不发布。
`;
fs.mkdirSync('docs/experiments',{recursive:true});fs.writeFileSync('docs/experiments/cycle-parity.md',doc);console.log(JSON.stringify({promoted:false,statistics:stats,timing}));
