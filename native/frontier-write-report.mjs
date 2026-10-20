import fs from 'node:fs';
const dir='benchmarks/frontier',read=n=>JSON.parse(fs.readFileSync(`${dir}/${n}.json`));
const s=read('summary'),freeze=read('freeze'),pct=x=>x==null?'未计算（含未决）':(100*x).toFixed(2).replace(/\.00$/,'')+'%',score=x=>`${x.wins}胜${x.draws}和${x.losses}负`,range=xs=>{const ys=[...new Set(xs)].sort((a,b)=>a-b);return ys.length===1?String(ys[0]):`${ys[0]}～${ys.at(-1)}`;};
const names={baseline:'实际生产原版',old:'旧组合',coverage:'仅覆盖修复',cap:'仅封顶修复',combined:'两项组合'};
const rows=[];for(const position of [...new Set(s.budgets.map(x=>x.position))])for(const budget of [1000,6000]){const xs=s.budgets.filter(x=>x.position===position&&x.budget===budget);rows.push(`| ${position} / ${budget/1000}秒 | `+['baseline','old','coverage','cap','combined'].map(n=>{const vs=xs.map(x=>x.variants[n]);return `${range(vs.map(x=>x.depth))}层 ${range(vs.map(x=>x.comparedCount))}/${vs[0].rootCount}，全${range(vs.map(x=>x.fullRootDepth))}`;}).join(' | ')+' |');}
const screenRows=Object.entries(s.self).map(([n,x])=>`| ${names[n]} | ${score(x.summary)} | ${pct(x.summary.scoreRate)} | ${x.faults.timeouts}/${x.faults.illegal}/${x.faults.protocolOrProcess}/${x.faults.unresolved} |`).join('\n');
const pikaColorLine=['baseline','trial'].map(name=>`${name==='baseline'?'原版':'组合'}执红${score(s.pikaColors[name].r)}、执黑${score(s.pikaColors[name].b)}`).join('；');
const normalLines=Object.entries(s.self).map(([name,x])=>`${names[name]}正常${x.normalSummary.games}局为${score(x.normalSummary)}（${pct(x.normalSummary.scoreRate)}）`).join('；');
const fmt=x=>Number.isFinite(x)?x.toFixed(2)+'ms':'未记录';
const timeoutLines=s.timeoutReview.rows.map(x=>`- ${x.file} / ${x.seed} / 试验执${x.trialSide==='r'?'红':'黑'}：${x.result.offender}，${x.result.reason}；最后尝试第${x.lastAttempt?.ply??'?'}步，墙钟${fmt(x.lastAttempt?.elapsedMs)}，超共同宽限${fmt(x.overGraceMs)}，计时器触发于${fmt(x.lastAttempt?.clock?.timerAt)}，完成结果到退出回收间隔${fmt(x.postResolveReapMs)}。底层原因未确认，正式判负保留。`).join('\n');
const bright=s.budgets.filter(x=>x.position.includes('10子')&&x.budget===6000),time=n=>range(bright.map(x=>Math.round(x.variants[n].elapsedMs)));
const diag=s.diagnostic.filter(x=>['4003/r/49','4057/r/31','4057/r/41','4001/b/70'].includes(x.position));
const diagLines=[...new Set(diag.map(x=>x.position))].map(p=>{const xs=diag.filter(x=>x.position===p);return `- ${p}：`+['baseline','old','coverage','cap','combined'].map(n=>`${names[n]} ${[...new Set(xs.map(x=>`${x.variants[n].move.from}→${x.variants[n].move.to}`))].join('/')}（${range(xs.map(x=>x.variants[n].depth))}层）`).join('；')+'。';}).join('\n');
const internalPassed=s.gates.combinedScreen&&s.gates.confirmation;
const decision=internalPassed?'内部筛选及20局确认通过，但本轮指定Pika只有4个配对布局，且真实Chrome工具仍不可用。本轮保留可运行的隔离实验，不替换默认核心；不把通过必要门槛写成已超过Pika。':'内部启用门槛未通过，本轮不启用为默认引擎。修复的工程性质已验证，但尚无足够净棋力证据。';
const confirmText=s.confirm?`已执行确认，结果为${score(s.confirm)}，得分率${pct(s.confirm.scoreRate)}。`:s.self.combined.summary.scoreRate>=.625&&s.self.combined.summary.technical.length?'组合得分已过5/8门槛，但出现原版技术超时，未过零技术故障条件；未启动20局确认，未降低门槛。':'组合未过筛选，未启动20局确认，未降低门槛。';
const text=`# 候选覆盖与封顶预算修复

${decision} 代码、原始记录、失败与未知范围保留；默认源码和二进制仍为73de…/2304…。没有推送GitHub，没有改第三方对手或加入新估值。

本轮不启用当前组合候选。覆盖单项${score(s.self.coverage.summary)}是积极信号，但仅4个布局，未做该单项的独立20局确认和Pika对照，保留为实验。封顶修复解决了已复现的资源闲置问题，单项得分率${pct(s.self.cap.summary.scoreRate)}未证明净棋力提升；组合对Pika得分率${pct(s.pika.summaries.trial.scoreRate)}，低于同批原版${pct(s.pika.summaries.baseline.scoreRate)}。这些有限样本不支持宣称已超过Pika。

## 定位与因果边界

从上一轮组合内部8局和组合对Pika8局中，检查16局460次本方搜索：386次部分候选，154次比较范围小于合法候选的四分之一。仅有1次达到8层，发生在和棋中且只有一着合法走法；没有封顶后明显提前返回的对局暴露。[完整暴露统计](${dir}/prior-exposure.json)。

对9盘败局事后抽取27处（首个部分搜索、最大后续自身评分下降附近、最后一次部分搜索），每处按原深度、原8样本、原战术/缓存策略，用额外最多5秒补齐全部候选。27处均完成，精算评分与原记录逐项一致，遗漏更高评分候选为0。[原始复盘](${dir}/prior-impact.json)。这是一组有偏的事后样例：不能证明所有根选择正确，也不能断言其他走法能救盘；没有确认这两项工程问题造成了上述败局。跨回合评分仅用于选取样例。

封顶闲置可在固定全明残局6秒预算下复现；它值得修复，但不能未经证据用来解释上一轮1秒对赛的败绩。

## 两项独立修复

1. **覆盖修复**：进入下一个更深层前，把遗漏候选补齐到上一层，保证全候选完成深度最多落后一层；接受新深度至少需要 \`min(N,max(2,ceil(N/4)))\` 着完成。四分之一是本轮冻结的工程选择，不是已证明最优参数。前列、危险候选、轮换探索及前列崩落时全体重新纳入机制保留。
2. **封顶补算**：在请求的最大深度（网页8层）继续加入所有遗漏根候选，按同一深度使用剩余预算；完成全部候选后可正常返回，预算耗尽则保留最后可比较结果。不提升封顶层数，也不混排浅层候选。

旧组合、仅覆盖、仅封顶、两项组合形成2×2消融，另加实际生产二进制作控制。保留旧组合的受控静态将军门控；没有叠加已弃用的防守估值，也未调门控、样本、缓存或对子项赛后改参数。

每个发布层内所有根走法用同一名义深度、相同固定样本和完整窗口评分；缓存仍按根重置、精确深度读取，逐世界核对规范全候选参考。浅层分数只排访问顺序，不进入深层排名。手动完整分析 \`SEARCH/STREAM\` 保持原语义；实战 \`PLAY/STREAM_PLAY\` 才用实验调度。深度与候选覆盖分别展示，分析/实战缓存分离。

## 同预算消融

[普通局面原始数据](${dir}/budgets.json)：3局面 × 1/6秒 × 3轮轮换 × 5版；[旧战术局面](${dir}/diagnostic.json)：7局面 × 1秒 × 3轮 × 5版。矩阵是C++请求内时间，公开观察和固定采样已准备好；不能冒充浏览器墙钟提速。正式比赛则计入准备、IPC、停止及进程回收。

表内格式为“该层精算数/全部合法数，全候选层数”，部分层数不能当完整层数比较。

| 局面/预算 | 实际原版 | 旧组合 | 仅覆盖 | 仅封顶 | 两项组合 |
|---|---|---|---|---|---|
${rows.join('\n')}

全明残局6秒：旧组合耗时${time('old')}ms，覆盖单项${time('coverage')}ms，封顶单项及组合约${time('cap')}/${time('combined')}ms。封顶单项8层覆盖27～28/30，组合20/30并保证全部完成7层，旧组合仅12/30、全候选3层。三轮推荐走法相同：修复确认了覆盖和资源利用变化，未证明残局胜率提高。开局覆盖修复降低了部分候选名义深度，恢复更广搜索；没有首兵奖励或强制首着。

旧局面推荐（0～89棋盘索引）如下，具体共同深度、候选与节点见JSON。推荐变化不等于独立证明胜负改变。

${diagLines}

## 配对实战

基线固定为本轮前实际生产二进制SHA256 \`2304327e3cb91987780ab453fa98db5e17383d32c4c39009649092ee9f14c49b\`，源码 \`73de0d5768fbedd97d46305891a0513f95c7a856aa5aba8edff8a92e2d1798d0\`。各实验源码和二进制哈希、编译器与参数在 [freeze.json](${dir}/freeze.json)；源码按哈希归档在 [sources/](${dir}/sources/)。对手仍为已授权的Pika \`bcc83f88ee18760e60903d1a3aaa61ef6f70f2c9\`、二进制 \`f32d3c6dfe4d6d90da7728d9cc2af68c3195a1cefb1bc28f3829f174c518dba1\`，HCE/NNUE关闭、4线程、Hash64MiB、MoveOverhead0，已知颜色估值不对称保持原样。

本轮内部三项用相同4个新布局18013/18041/18043/18047，各红黑换色8局；每步均为1秒，8采样、最多4世界线程、每世界9万项缓存，全明1样本。共同60ms收尾宽限，就绪在回合外，投影、采样、协议、IPC、搜索、宿主停止及回收计入。每次搜索串行执行，其他应用和系统调度未受控制。简化公开三次重复/120闲步判和，400步上限记未决，不用评分裁定。

| 候选对原版 | 胜和负 | 得分率 | 超时/非法/进程协议/未决 |
|---|---|---|---|
${screenRows}

正式成绩包含全部技术胜负，不删除不利记录。另列正常结束局作辅助说明：${normalLines}。[计时证据复核](${dir}/timeout-review.json)记录${s.timeoutReview.technicalGames}局技术故障；复核通过只说明记录自洽，不表示没有时限故障。

${timeoutLines||'本轮未记录技术故障。'}

实战触发：覆盖单项有${s.self.coverage.refreshMoves}次搜索进行了覆盖补算；仅封顶有${s.self.cap.capFillMoves}次搜索追加了封顶遗漏候选；组合有${s.self.combined.refreshMoves}次覆盖补算、${s.self.combined.capFillMoves}次封顶补算。未触发的修复不能用来解释该盘胜负；固定残局的工程改进和实际对局收益分开判断。

[同布局首次分歧](${dir}/paired-divergence.json)另比较覆盖与组合8组配对：${s.pairedDivergence.firstMoveDifferences}组出现走法分歧，其中${s.pairedDivergence.firstDifferenceOnBaseline}组首先发生在字节不变的基线一方，${s.pairedDivergence.capActiveAtFirstDifference}组在首次分歧处已记录额外封顶根补算。这里只记录相同输入下的首次不同走法、搜索范围与耗时；不同深度评分不混排，不把时限边界差异直接当成某项修复造成胜负的证据。

预先门槛：组合筛选至少5/8分，且技术故障和未决为0，才能运行独立10布局换色20局1秒确认，至少12/20分；规则、信息和UI条件亦必须满足。${confirmText}

原始比赛与独立回放： [覆盖](${dir}/matches-coverage-screen-production.json) / [核验](${dir}/verification-coverage-screen-production.json)，[封顶](${dir}/matches-cap-screen-production.json) / [核验](${dir}/verification-cap-screen-production.json)，[组合](${dir}/matches-combined-screen-production.json) / [核验](${dir}/verification-combined-screen-production.json)。每着核对合法性、公私观察哈希、揭子/暗俘、同层覆盖和时限。未确认原因的正常败局仍记为正常败局，不虚构因果归因。

另以新布局20011/20021/20023/20029，各版本对同一Pika红黑换色，原版和组合交错执行16局，仍均1秒加共同60ms宽限：实际原版${score(s.pika.summaries.baseline)}，得分率${pct(s.pika.summaries.baseline.scoreRate)}；组合${score(s.pika.summaries.trial)}，得分率${pct(s.pika.summaries.trial.scoreRate)}。技术超时${s.pika.faults.timeouts}、非法${s.pika.faults.illegalMoves}、进程/协议${s.pika.faults.protocolOrProcess}、未决${s.pika.faults.unresolved}。红黑拆分：${pikaColorLine}。只有4个相关布局对，不能宣称超越Pika、稳定Elo或单个组件的胜率贡献。

[Pika原始16局](${dir}/pika-combined.json) / [规则、FEN与暗俘私人协议核验](${dir}/pika-combined-verification.json)。技术失败原样保留，宿主按时停止且返回已完成合法结果另列，不等同技术超时。历史不同预算/布局的成绩没有合并。

Pika正常结束局另列：原版${score(s.pikaNormal.baseline)}（${pct(s.pikaNormal.baseline.scoreRate)}），组合${score(s.pikaNormal.trial)}（${pct(s.pikaNormal.trial.scoreRate)}）；不替换上面的正式总成绩。

## 验证范围与限制

- \`npm test\` 86项通过，0失败：[日志](${dir}/unit.json)。
- 三项发布构建各69个规则/视角和19组搜索通过；三项ASan/UBSan、组合TSan通过。沿用独立JS走法/将军与非吃子将军全集、撤回守卫、三层强制胜、原完整分析逐候选同分同节点、同层同样本逐世界精确评分与信息隔离检查。
- [12项覆盖/封顶专项](${dir}/invariants.json)：封顶补齐、逐世界精确分、0/25/100/400/1000ms截断，以及深度和覆盖单调流通过；[8层全候选规范参考](${dir}/cap8-exact.json)另核对实际封顶深度的每个精算走法，补齐全部时可正常提前返回。
- [控制器4组](${dir}/ui-controller.json)与[服务5组](${dir}/service-combined.json)通过：覆盖标注、低于比较门槛的帧拒绝、分析/实战隔离、重复点击、悔棋/重开、过期结果、真实C++流、取消与重复请求。初次服务检查沿用旧页面标签而断言失败，保留在 \`service-combined-initial.json\`；修正检查目标后通过，没有改安全策略或掩盖引擎故障。
- [浏览器工具清单](${dir}/browser-availability.json)仍不提供Chrome。因此本轮实际渲染、真人点击与真实浏览器端到端回归未完成；模拟DOM/HTTP不能替代它。用户自己的Chrome此前可访问，不把工具缺失称为用户浏览器或页面故障，也未使用替代自动化绕过限制。
- 前一轮样例没有确认遗漏更好模型走法；增加覆盖不保证改善有限样本/估值/策略融合。受控战术门控仍只看请求起点；这项既有局限没有在本轮另行调整。

## 本机运行与复现

默认不变：\`npm start\`，打开 [http://127.0.0.1:8766/](http://127.0.0.1:8766/)。隔离实验：\`PORT=8768 node native/frontier-preview.mjs combined\`，打开 [http://127.0.0.1:8768/](http://127.0.0.1:8768/)。需要保持服务进程运行；只绑定本机，不公开部署。实验页面仍支持人机、自动对战和完整分析，标签明确“尚未作为默认启用”。

复跑应使用新标签，勿覆盖正式证据；性能和比赛应串行，勿同时从页面发起搜索。

\`\`\`sh
FRONTIER_VARIANT=combined FOCUS_RUN_LABEL=replay node native/frontier-check.mjs
FRONTIER_VARIANT=combined FOCUS_RUN_LABEL=replay node native/frontier-check.mjs --asan
FRONTIER_VARIANT=combined FOCUS_RUN_LABEL=replay node native/frontier-check.mjs --tsan
FRONTIER_RUN_LABEL=replay node native/frontier-invariants.mjs
FRONTIER_RUN_LABEL=replay node native/frontier-benchmark.mjs budgets
FRONTIER_RUN_LABEL=replay node native/frontier-benchmark.mjs diagnostic
node native/frontier-match-verify.mjs combined screen
node native/frontier-pika-verify.mjs combined
node native/frontier-report.mjs
node native/frontier-write-report.mjs
\`\`\`

正式对赛冻结输入与执行脚本；已完成比赛再次运行不会另开局。新比赛需独立记录，不覆盖旧成绩。匹配实际生产二进制要求本机保留冻结构建；异机编译不可冒称二进制字节一致。第三方对手不分发。[机器汇总](${dir}/summary.json)包含实际用时、宿主停止、完整配对、技术故障及源码/证据哈希。
`;
fs.writeFileSync('FRONTIER_SEARCH_REPORT.md',text);console.log(JSON.stringify({written:'FRONTIER_SEARCH_REPORT.md',defaultUnchanged:s.defaultUnchanged,internalPassed}));
