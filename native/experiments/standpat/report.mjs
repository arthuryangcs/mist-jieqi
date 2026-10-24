import fs from 'node:fs';import assert from 'node:assert/strict';
import {dir,summary} from './common.mjs';
import {initial,publicState,move,legalMoves,rootRules,positionKey} from '../../../engine.js';import {seeded} from '../../../ai.js';
const read=n=>JSON.parse(fs.readFileSync(dir+'/'+n+'.json'));
const m=read('matches'),b=read('benchmark'),v=read('verification'),check=read('check'),sanitized=read('check-sanitized'),unit=read('unit');
const parallel=read('parallel-check');assert(parallel.passed&&parallel.rows.length===10);
assert(m.games.filter(g=>g.result).length===m.tasks.length);assert(v.passed&&v.complete&&b.passed&&check.passed&&sanitized.passed&&unit.passed);
const pct=x=>x==null?'未计算':(100*x).toFixed(2)+'%',n=x=>x.toFixed(1),wdl=x=>`${x.wins}胜${x.draws}和${x.losses}负`;
const groups={internal:m.games.filter(g=>g.kind==='internal'),baselinePika:m.games.filter(g=>g.kind==='pika'&&g.engine==='baseline'),trialPika:m.games.filter(g=>g.kind==='pika'&&g.engine==='trial')};
const stats=Object.fromEntries(Object.entries(groups).map(([k,gs])=>[k,{total:summary(gs),withoutTechnical:summary(gs.filter(g=>!g.result.technicalForfeit))}]));
const quantile=(xs,q)=>{xs=[...xs].sort((a,b)=>a-b);return xs.length?xs[Math.ceil(q*xs.length)-1]:null;};
const timing=Object.fromEntries(Object.entries(groups).map(([k,gs])=>{const rows=gs.flatMap(g=>g.log),xs=rows.map(x=>x.elapsedMs);return [k,{recordedAttempts:xs.length,p50Ms:quantile(xs,.5),p95Ms:quantile(xs,.95),maxMs:Math.max(...xs),overGrace:rows.filter(x=>x.elapsedMs>1060).length,unmeasuredProtocolFailures:gs.filter(g=>g.result.reason==='process-or-protocol-failure').length,fallbacks:rows.filter(x=>x.fallbackUsed).length}];}));
const repetitionDiagnostics=m.games.filter(g=>g.result.reason.includes('重复')).map(g=>{let s=initial(seeded(g.seed));s.positions=[positionKey(s)];for(const row of g.log.slice(0,-1))if(row.applied)s=move(s,row.move);const view=publicState(s,s.turn),ms=legalMoves(view),losing=ms.filter(x=>!view.board[x.from].hidden&&rootRules(view,x).loss);return {index:g.index,side:s.turn,legalRoots:ms.length,immediateRepetitionLosingRoots:losing.length,allLegalRootsLose:losing.length===ms.length};});
const decision={promoted:false,reason:'Exact-tree speed benefit on five positions; budget screen has no extra completed layer. Four paired layouts only, no independent 20-game confirmation. No claim of surpassing Pika or reliable strength gain.',statistics:stats,timing,repetitionDiagnostics,diagnosticSummary:check.diagnosticSummary,parallelVerification:parallel,verification:{plies:v.plies,privateDarkCaptures:v.privateDarkCaptures,repetitionLosses:v.repetitionLosses,rootGuardUses:v.rootGuardUses},stableSourceSha256:m.stableSourceSha256,trialBuild:m.trialBuild};
fs.writeFileSync(dir+'/decision.json',JSON.stringify(decision,null,2)+'\n');
const table=Object.entries(stats).map(([k,x])=>`| ${{internal:'试验对稳定版',baselinePika:'稳定版对Pika',trialPika:'试验对Pika'}[k]} | ${wdl(x.total)} | ${pct(x.total.scoreRate)} | ${x.total.technical.length} | ${x.total.unresolved} | ${wdl(x.withoutTechnical)} / ${pct(x.withoutTechnical.scoreRate)} |`).join('\n');
const bench=b.summary.map(x=>{const xs=b.fixed.filter(r=>r.position===x.position);return `| ${x.position} | ${x.depth} | ${x.nodes} | ${n(x.baselineMedianMs)} | ${n(x.trialMedianMs)} | ${x.speedup.toFixed(3)}× | ${xs.filter(r=>r.trialCoreMs<r.baselineCoreMs).length}/${xs.length} |`;}).join('\n');
const budgets=[];for(const budgetMs of [1000,6000])for(const position of [...new Set(b.timed.map(x=>x.position))]){const row={budgetMs,position};for(const name of ['baseline','trial'])row[name]=b.timed.filter(x=>x.budgetMs===budgetMs&&x.position===position&&x.name===name).map(x=>x.depth);budgets.push(row);}
const games=m.games.map(g=>`| ${g.index} | ${g.kind} | ${g.seed} | ${g.engine} | ${g.candidateSide==='r'?'红':'黑'} | ${g.finalState.ply} | ${g.result.status==='unresolved'?'未决':g.result.status==='draw'?'和':g.result.winner===g.candidateSide?'胜':'负'} | ${g.result.reason}${g.result.technicalForfeit?'（技术失败）':''} |`).join('\n');
const q=check.diagnosticSummary;
const doc=`# 保留困毙检测的静态截断实验（2026-10-24）

本轮完成同树效率验证和24局新布局换色筛选，原型保持非默认。五个固定局面同树耗时中位数改善，但1秒/6秒筛选未增加完整层数；尚无独立20局确认，不能宣称可靠棋力提高或超过Pika。

## 优化依据与边界

稳定版基于提交 ${m.baseCommit}，源码哈希为 \`${m.stableSourceSha256}\`。既有[NATIVE_PERFORMANCE_REPORT](../../NATIVE_PERFORMANCE_REPORT.md)的历史插桩显示走法生成占比较高，这仅用来选择方向，不与今天计时混算。原版先生成完整合法吃子列表，再判断静态评分是否已达到beta。本轮只调整该非受将静态节点的执行顺序：先计算相同评分；足以截断时，用首次合法走法探测排除困毙，再返回原评分，跳过完整吃子列表。没有合法走法仍返回必负分。

应将节点保持原流程，未截断节点仍生成原完整走法；qleft、负深度下限、延伸、路径循环、TT、排序、评分公式及浮点求和顺序均不变。没有降低样本或遗漏根着，没有叠加几何表、40ms宿主预留、已知明子奖励或兵位开局规则。构建参数直接采用当前稳定清单（含NDEBUG，未用fast-math），默认源码与二进制均未覆盖。

## 正确性、诊断与性能

发布构建与ASan/UBSan均通过 ${check.views} 个公开视角、${check.transitions} 次走子/撤销、${check.qCases} 组静态窗口和10组固定节点搜索。走法、将军和困毙对照独立JS规则；评估、公开与私人库存、恢复状态、逐层候选/评分和节点对照稳定版。静态窗口覆盖两色、qleft=0/3、beta在静态分的-1/0/+1，包含受将、将死及非受将困毙，防止错误地直接接受stand-pat。任意摆图仅用于规则压力，不主张其库存合法。

诊断窗口中完整吃子列表生成由 ${q.baseline.captureLists} 降到 ${q.trial.captureLists}，首次合法探测由 ${q.baseline.firstLegalProbes} 到 ${q.trial.firstLegalProbes}，单子候选生成由 ${q.baseline.candidateCalls} 到 ${q.trial.candidateCalls}，两版搜索节点同为 ${q.baseline.nodes}。这些测试计数用于验证机制，不是实战NPS或速度结果。诊断入口与插桩未用于正式性能/对局。完整项目 ${unit.pass}/${unit.tests} 项测试通过。详见[发布检查](../../benchmarks/standpat/check.json)、[内存检查](../../benchmarks/standpat/check-sanitized.json)、[项目测试](../../benchmarks/standpat/unit.json)。

同机固定树对照使用相同观察、无放回样本、种子、节点上限和排序；预热后轮换先后、串行请求，每局面7次。固定节点上限强制单线程，35对均完整完成指定主深度，节点、每层候选及评分一致。core不含协议编码/IPC，wall另有原始记录；只用相同搜索树计算速度比。

固定节点会关闭并行，因此第一组6局结束后，在局间另用无节点上限核对实际最多4线程路径，未中止正常对局或并行启动测试。发布版和ASan/UBSan版各5局面，共10组，逐层候选、评分、推荐、节点及恢复状态通过；全明1样本仍为1线程。这是额外正确性核对，不用于速度表，详见[并行核对](../../benchmarks/standpat/parallel-check.json)。正式对局源码和参数未修改。

| 局面 | 完整层 | 相同节点 | 稳定中位ms | 试验中位ms | 提速比 | 试验更快的配对次数 |
|---|---:|---:|---:|---:|---:|---:|
${bench}

24次端到端预算筛选（3局面×2预算×2轮×2版）的完整层如下；未将未完成层计入，也不将对局中的节点差异用作纯提速证据。

| 预算ms | 局面 | 稳定完整层（两次） | 试验完整层（两次） |
|---:|---|---|---|
${budgets.map(x=>`| ${x.budgetMs} | ${x.position} | ${x.baseline.join('/')} | ${x.trial.join('/')} |`).join('\n')}

详见[基准](../../benchmarks/standpat/benchmark.json)。仅此台Mac和五个局面；系统调度、负载及热状态未完全受控，不能外推所有棋局或硬件。

## 同预算新布局换色对局

${m.seeds.join('/')} 四个新布局及顺序在对局前冻结。每布局红黑互换，8局试验对稳定，另16局稳定/试验各对固定Pika8局，交替执行。所有搜索串行，每手双方名义1000ms、共同60ms宽限；就绪在计时外，公开投影、采样、编码、IPC、FEN/根规则核对及搜索触发的停止/回收在内，局末关闭常驻进程另行完成。宿主额外预留均为0ms；两版C++原有最多35ms核心收尾余量一致。Mist均8样本、全明1样本、最多4世界线程、每世界9万TT、主深度上限8。

第19局第42步曾因额度工具暂不可读保存暂停，恢复可读并核实门槛后从同一检查点续跑。两方均为每手重建搜索状态的Mist，未重置棋局、重新抽样布局、丢弃已走步或重跑已完成局；暂停不计入任一方思考时间。

固定PikaJieQi仍为已授权二进制 \`bcc83f88\` / \`${m.opponent.binarySha256}\`：HCE、NNUE关闭、4线程、Hash64MiB、MoveOverhead0；已知颜色估值不对称保留。未修改、下载或重编译第三方，未改安全设置。

本轮统一名义时限及最多4个搜索线程；两实现缓存组织不同，没有将峰值RSS限制为完全相同，因此不宣称严格等内存下的优劣。

统一裁判为第三次相同公开棋盘及行棋方出现时最后走子方判负，将死/困毙优先；120闲步和，400步封顶记未决。Pika用共同searchmoves根约束，在有替代时排除直接重复判负根着；两版Mist根评分已处理同一规则。双方深层循环仍各自近似，不代表完整长将/长捉责任搜索。未混入旧判和对局；固定适配器既有空库存FEN格式边界未修订。

| 比较 | 胜和负（含技术） | 得分率 | 技术失败局 | 未决 | 剔除技术后的胜和负/得分率 |
|---|---|---:|---:|---:|---|
${table}

得分率=(胜+0.5×和)/总局数，未决存在时不计算单一值。技术失败不删除；正常子集仅作补充。所有有计时记录的尝试（含失败）的p50/p95/最大值、保底次数与重复判负末步合法根诊断见[决策记录](../../benchmarks/standpat/decision.json)。

| 序号 | 类别 | 布局 | 本方版本 | 本方颜色 | 已走步数 | 本方结果 | 原因 |
|---:|---|---:|---|---|---:|---|---|
${games}

## 信息边界与限制

仅行棋方publicState进入搜索；真暗布局和裁判种子不传引擎。暗俘身份仅吃子方可见；未知离盘身份仍作为库存潜变量，采样无放回。代码拒绝公开暗子/暗俘携带真实身份，真实隐藏布局变化不改变公开观察与固定采样。独立回放 ${v.plies} 步、${v.privateDarkCaptures} 次暗俘信息、${v.repetitionLosses} 次重复判负、${v.rootGuardUses} 次Pika根约束触发通过，见[原始对局](../../benchmarks/standpat/matches.json)及[回放](../../benchmarks/standpat/verification.json)。

仅四个相关布局对，未完成独立20局确认。较高得分、更多节点或终局高层/零节点元数据均不能证明超越Pika；不据此估算Elo。概率估计仍受8个相关平衡样本、固定HCE对手及搜索循环近似限制。实验发布不等于默认启用。本轮无UI改动，未做真实浏览器验证；项目单元测试不等于浏览器验收。

复现和暂停恢复步骤见[实验README](../../native/experiments/standpat/README.md)。冻结源码和二进制变更会拒绝续跑，已有记录不可覆盖；第三方、构建产物、凭据及账户额度数值不发布。
`;
fs.mkdirSync('docs/experiments',{recursive:true});fs.writeFileSync('docs/experiments/standpat.md',doc);console.log(JSON.stringify({promoted:false,statistics:stats,timing}));
