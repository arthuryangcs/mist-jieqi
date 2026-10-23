import fs from 'node:fs';import assert from 'node:assert/strict';
import {dir,summary} from './common.mjs';
import {initial,publicState,move,legalMoves,rootRules,positionKey} from '../../../engine.js';import {seeded} from '../../../ai.js';
const read=n=>JSON.parse(fs.readFileSync(dir+'/'+n+'.json'));
const m=read('matches'),b=read('benchmark'),v=read('verification'),check=read('check'),sanitized=read('check-sanitized'),unit=read('unit');
const compileEquivalence=read('compile-equivalence');assert(compileEquivalence.byteIdentical);assert.equal(compileEquivalence.trialBinarySha256,m.trialBuild.binarySha256);
assert(m.games.filter(g=>g.result).length===m.tasks.length);assert(v.passed&&v.complete&&b.passed&&check.passed&&sanitized.passed&&unit.passed);
const pct=x=>x==null?'未计算':(100*x).toFixed(2)+'%',n=x=>x.toFixed(1),wdl=x=>`${x.wins}胜${x.draws}和${x.losses}负`;
const groups={internal:m.games.filter(g=>g.kind==='internal'),baselinePika:m.games.filter(g=>g.kind==='pika'&&g.engine==='baseline'),trialPika:m.games.filter(g=>g.kind==='pika'&&g.engine==='trial')};
const stats=Object.fromEntries(Object.entries(groups).map(([k,gs])=>[k,{total:summary(gs),withoutTechnical:summary(gs.filter(g=>!g.result.technicalForfeit))}]));
const quantile=(xs,q)=>{xs=[...xs].sort((a,b)=>a-b);return xs.length?xs[Math.ceil(q*xs.length)-1]:null;};
const timing=Object.fromEntries(Object.entries(groups).map(([k,gs])=>{const rows=gs.flatMap(g=>g.log),xs=rows.map(x=>x.elapsedMs);return [k,{attempts:xs.length,p50Ms:quantile(xs,.5),p95Ms:quantile(xs,.95),maxMs:Math.max(...xs),overGrace:rows.filter(x=>x.elapsedMs>1060).length,unmeasuredProtocolFailures:gs.filter(g=>g.result.reason==='process-or-protocol-failure').length}];}));
const repetitionDiagnostics=m.games.filter(g=>g.result.reason.includes('重复')).map(g=>{let s=initial(seeded(g.seed));s.positions=[positionKey(s)];for(const row of g.log.slice(0,-1))if(row.applied)s=move(s,row.move);const view=publicState(s,s.turn),ms=legalMoves(view),losing=ms.filter(x=>!view.board[x.from].hidden&&rootRules(view,x).loss);return {index:g.index,side:s.turn,legalRoots:ms.length,immediateRepetitionLosingRoots:losing.length,allLegalRootsLose:losing.length===ms.length};});
const decision={promoted:false,reason:'Mixed exact-tree timing; no increase in completed layers in the 1s screen; only two paired layouts, below the existing independent 8+20 gate. No reliable strength claim.',statistics:stats,timing,repetitionDiagnostics,compileEquivalence,verification:{plies:v.plies,privateDarkCaptures:v.privateDarkCaptures,repetitionLosses:v.repetitionLosses,rootGuardUses:v.rootGuardUses},stableSourceSha256:m.stableSourceSha256,trialBuild:m.trialBuild};
fs.writeFileSync(dir+'/decision.json',JSON.stringify(decision,null,2)+'\n');
const table=Object.entries(stats).map(([k,x])=>`| ${{internal:'试验对稳定版',baselinePika:'稳定版对Pika',trialPika:'试验对Pika'}[k]} | ${wdl(x.total)} | ${pct(x.total.scoreRate)} | ${x.total.technical.length} | ${x.total.unresolved} | ${wdl(x.withoutTechnical)} / ${pct(x.withoutTechnical.scoreRate)} |`).join('\n');
const bench=b.summary.map(x=>`| ${x.position} | ${x.depth} | ${x.nodes} | ${n(x.baselineMedianMs)} | ${n(x.trialMedianMs)} | ${((x.trialMedianMs/x.baselineMedianMs-1)*100).toFixed(2)}% |`).join('\n');
const games=m.games.map(g=>`| ${g.index} | ${g.kind} | ${g.seed} | ${g.engine} | ${g.candidateSide==='r'?'红':'黑'} | ${g.finalState.ply} | ${g.result.status==='unresolved'?'未决':g.result.status==='draw'?'和':g.result.winner===g.candidateSide?'胜':'负'} | ${g.result.reason}${g.result.technicalForfeit?'（技术失败）':''} |`).join('\n');
const doc=`# 将帅安全几何表实验（2026-10-23）

结论：保留隔离实验，未启用默认版本。固定搜索树结果相同，但速度有快有慢；1秒筛选未增加完整搜索层数。当前证据不足以证明整体提速或棋力提升。

## 变更范围

稳定版基于提交 ${m.baseCommit}，源码哈希为 \`${m.stableSourceSha256}\`。只在试验源码中把合法走子预筛的行列/相邻斜线计算换成启动时生成的90×90字节表（8100字节）。表只取决于坐标，不保存身份或跨局状态；敏感走法仍经过原来的完整将军检查。缺将时不进入快速合法分支。未改变评估、采样、排序、搜索深度、重复规则或默认二进制；未叠加已知明子奖励、40ms预留或兵位开局规则。

## 正确性与速度

发布构建和ASan/UBSan构建均通过 ${check.views} 个视角、${check.transitions} 次走子/撤销，覆盖炮架变化、车线、马腿、象眼、照面、缺将、暗炮解将及随机可达局面。与稳定版及独立JS规则核对；任意摆图只用于几何压力，不主张其库存合法。穷举 ${check.geometryTriples} 组三坐标关系，10组固定节点搜索逐层推荐、完整候选、评分与节点一致。暗布局变化不影响公开输入和采样；对赛另独立检查暗俘信息。完整项目 ${unit.pass}/${unit.tests} 测试通过。

首次检查脚本将两次请求的wallMs也要求相等，导致假失败；已排除该非语义字段，保留[失败记录](../../benchmarks/king-geometry/check-initial.json)，没有修改引擎输出掩盖差异。详见[发布构建检查](../../benchmarks/king-geometry/check.json)、[内存检查](../../benchmarks/king-geometry/check-sanitized.json)、[单测](../../benchmarks/king-geometry/unit.json)。

进行中审查发现试验构建相对稳定版少NDEBUG宏，暂停新增对局核查。最初输出文件名不同，整文件哈希不同，保留[首次比较](../../benchmarks/king-geometry/compile-equivalence-initial.json)。使用相同输出文件名、相同源码及稳定版全部参数重编译后，含NDEBUG的产物与冻结试验二进制逐字节一致（SHA-256也相同），见[编译等价核查](../../benchmarks/king-geometry/compile-equivalence.json)。没有替换冻结产物或丢弃已完成对局；只能说明该宏在本机此构建未改变二进制，不能外推其他环境。核查脚本为compile-check.mjs。

固定树速度使用相同固定世界、种子与节点上限，预热后轮换顺序，串行请求，每局面5次。固定节点上限强制单线程，所有表中指定层均完整完成，25对搜索结果相同。core不含协议编码/IPC；原始数据也记录wall。耗时变化为试验/稳定-1，正数代表更慢。不是多线程实战NPS对比。

| 局面 | 完整层 | 相同节点 | 稳定中位ms | 试验中位ms | 耗时变化 |
|---|---:|---:|---:|---:|---:|
${bench}

另有3局面×2轮×2版的1000ms端到端筛选；完整层均为开局4、中局5、残局6，两版没有差异。没有用不同对局的节点数推导纯提速。详见[基准原始数据](../../benchmarks/king-geometry/benchmark.json)。仅单机小样本，系统负载、热状态和调度未受控制，不能把个别更快点外推为整体提升。

## 同预算换色对局

新布局 ${m.seeds.join('/')} 在对局前连同源码哈希和顺序冻结；每布局红黑互换：4局试验对稳定，另8局稳定/试验分别对Pika。每手双方名义1000ms，共同60ms宽限，额外宿主预留均为0ms；搜索串行。就绪在计时外，投影、采样、编码、IPC、公开FEN核对及搜索触发的停止/回收在计时内；局末常驻进程关闭另行完成。Mist两版均为8个无放回样本、全明1样本、最多4世界线程、每世界9万TT、主深度上限8。

固定第三方为此前已获准执行的PikaJieQi \`bcc83f88\` / \`${m.opponent.binarySha256}\`，HCE、NNUE关闭、4线程、Hash64MiB、MoveOverhead0，已知颜色估值不对称保留。没有修改第三方源码、二进制或安全设置。

裁判为当前规则：同一公开棋盘及行棋方第三次出现，最后走子方判负；将死/困毙优先，120闲步和，400步封顶单列未决。Pika统一用searchmoves排除有替代时直接触发第三次重复判负的根着；稳定版和试验根评分都识别此规则。双方深层循环仍各自近似，不代表完整长将/长捉责任搜索。没有混入旧重复判和结果。固定Pika空未知库存输出空字段、适配器期望短横线的已知边界未改，若触发照实计协议技术失败。

| 比较 | 胜和负（含技术） | 得分率 | 技术失败局 | 未决 | 剔除技术后的胜和负/得分率 |
|---|---|---:|---:|---:|---|
${table}

得分率=(胜+0.5×和)/总局数；未决存在时不计算单一得分率。技术失败不能删除；无技术子集仅作补充。所有有计时记录尝试的p50/p95/最大耗时及失败明细见[决策记录](../../benchmarks/king-geometry/decision.json)。

| 序号 | 类别 | 布局 | 本方版本 | 本方颜色 | 已走步数 | 本方结果 | 原因 |
|---:|---|---:|---|---|---:|---|---|
${games}

## 信息边界、回放与限制

只传行棋方publicState；真实暗布局及裁判种子不传引擎。吃暗子身份只传吃子方，其他方保留未知。独立回放 ${v.plies} 步、${v.privateDarkCaptures} 次暗俘信息、${v.repetitionLosses} 次重复判负、${v.rootGuardUses} 次Pika根约束触发通过；详见[对局](../../benchmarks/king-geometry/matches.json)与[回放](../../benchmarks/king-geometry/verification.json)。终局只有重复判负根着时，元数据中的高层/低节点不能解释为深搜提升。

只有两个相关布局对，未完成既有独立8局筛选与20局确认门槛；不能据此宣称稳定棋力提高、超过Pika或给出Elo。既没有可靠一致提速，也没有完整确认，因此不改默认引擎。本轮无UI改动，没有进行浏览器渲染验证；142项项目回归不等于真实浏览器验收。

## 复现

构建、校验、冻结、逐局执行及停止恢复步骤见[实验说明](../../native/experiments/king-geometry/README.md)。哈希清单包含共同控制器与规则文件，修改后拒绝续跑。已有证据不可覆盖；复跑需新输出目录、布局与清单，不发布第三方构建产物。
`;
fs.mkdirSync('docs/experiments',{recursive:true});fs.writeFileSync('docs/experiments/king-geometry.md',doc);console.log(JSON.stringify({promoted:false,statistics:stats,timing}));
