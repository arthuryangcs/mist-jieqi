import fs from'node:fs';import{createHash}from'node:crypto';
const dir='benchmarks/pika-native-match',read=p=>JSON.parse(fs.readFileSync(p)),r=read(`${dir}/matches.json`),v=read(`${dir}/verification.json`),environment=read(`${dir}/environment.json`);if(!v.passed||r.games.length!==20)throw Error('正式20局及复核尚未完成');
const pct=x=>x===null?'未决，见上下界':(x*100).toFixed(1)+'%',num=x=>Number(x).toFixed(2),score=g=>g.result.winner===g.candidateSide?1:g.result.status==='draw'?.5:g.result.status==='unresolved'?'未决':0;
const lines=[
'# 新版原生4线程与固定 PikaJieQi 的20局对赛',
'',`本轮测试代码版本 **bb7b7f5**，对手为此前获准的 **bcc83f88** 本机构建；新版源码和二进制哈希分别为 \`${r.build.sourceSha256}\`、\`${r.build.binarySha256}\`。GitHub 已推送并核实到 bb7b7f5；本轮对赛脚本、棋谱及报告只保留本地，没有再次推送。`,
'',`实际完成 **${v.summary.overall.games}局：新版${v.summary.overall.wins}胜${v.summary.overall.draws}和${v.summary.overall.losses}负，未决${v.summary.overall.unresolved}局**。纯胜率 W/N 为 **${pct(v.summary.overall.winRate)}**，得分率 (W+0.5D)/N 为 **${pct(v.summary.overall.scoreRate)}**。技术故障列在下方，全部保留，没有排除不利局。`,
'', '## 比赛配置与公平性',
'', `环境：${environment.cpu}，${environment.physicalCpus}物理核/${environment.logicalCpus}逻辑核，${Math.round(environment.totalMemoryBytes/1024**3)}GiB；Node ${environment.runtime} ${environment.architecture}，${environment.osType} ${environment.osRelease}。编译器与参数见比赛数据的build字段。实时物理核数查询被沙箱拒绝（sysctl: Operation not permitted），6核取自此前本机环境记录；本轮没有改权限，对赛不受此可选元数据查询影响。`,
'',`- 10个事先冻结的初始布局：${r.seeds.join('、')}。每个布局同一真实布子换色两局，新版各执红黑10局。完整初始布子、种子、逐手着法/翻子/吃子、观察哈希、耗时和终局均在 [matches.json](${dir}/matches.json)。真实布子只用于裁判，不输入引擎。`,
'- 每步1000ms墙钟预算，双方同为60ms裁判宽限。双方进程初始化/线程就绪在步钟之外，分别记录；步钟内包含信息投影、采样或FEN/历史设置、协议核对、IPC与返回。宽限不是给任何一方增加目标思考时间。',
'- 新版：默认4个搜索线程，8个假想布局，全明1布局，最大完整主深度8，每布局最多90000条置换表项。直接用同一个原生核心及STREAM接口，未走HTTP；每手新建Search，沿用网页的每次搜索状态重置，不保留跨步置换表。使用独立宿主计时器，只接受完整层或明确标记的合法保底。',
'- PikaJieQi：4线程、Hash 64MiB、Move Overhead 0，保持原有HCE构建（USE_NNUEEVAL=0），没有新权重。每局新进程/ucinewgame，局内正常保留其置换表和历史。内存配置不严格相同，不能将本轮描述为严格等内存；双方只有行棋方在计算，没有并跑其他性能基准。',
'- 新版宿主强停时，该比赛适配器会等待子进程退出后返回，因此回收耗时也在记录的墙钟里；这与浏览器在到期时立即采纳末条进度的时点不同。没有单独保存原始计时回调/进程回收分段，不能把某次长尾直接归因于核心计算、GC或系统调度。此配置及失败局均保留，不中途改钟或重赛。',
'- 对手源码/二进制保持原样，固定二进制 SHA-256：`'+r.opponent.binarySha256+'`。没有换成官方另一分支、重编译对手、改参数迎合结果或自动改新版引擎。来源及许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，第三方源码、二进制不分发。',
'- 被吃暗子仅吃子方知道；对手只收到最初公开FEN和本方专属6字符历史。每手搜索前核对对手重放出的棋盘/行棋方/库存，未知字段显式为X。新版只收到当前行棋方publicState投影及其产生的假想布局。双方均不收到真实暗子分配或布子种子。',
'- 共同裁判使用当前JS规则：将帅明置；暗子按位置角色走首步后揭开；明士/象全盘斜走，象仍塞眼；将死和困毙判负。公开盘面/行棋方三次重复、连续120闲步为简化和棋。400步上限单列未决，不冒称正常和棋。Pika内部估值、重复搜索和信念近似仍按其原样，不能宣称与裁判的全部历史/信息集推理完全同构。',
'', '## 赛前检查与对手已知问题',
'', '- 同一固定二进制/4线程设置下，24步强制及后续合法走子形成48个红黑观察视角，含暗俘。FEN棋盘/行棋方/库存及根全部合法着逐项一致；9个专项局面的马腿、象眼、炮隔子、明士象过河、暗士象限制、应将和照面挡子也一致。',
'- 双方100ms/1000ms实测均在同一宽限内，着法合法；详情见 [smoke.json]('+dir+'/smoke.json)。初始实际暗子布局改变而公开输入相同的采样隔离检查通过。',
'- 对手的颜色评分不对称此前已在同一个二进制上复现，六个旋转换色局面的白方分数之和约1.98～4.13，见 [既有记录](benchmarks/native-symmetry.json) 与 [分析](OPENING_ANALYSIS_REPORT.md#指定外部引擎的对称性复核)。静态代码中DarkPieces为评估对象成员，但每次单色initialize清空双方缓存；不是据此断言全部偏差来源或多线程竞态。此次未修对手，采用配对换色、分别列红黑成绩；结果只代表这个指定构建，不能推广为所有Pikafish的实力。',
'', '## 结果',
'', '| 新版阵营 | 局数 | 胜 | 和 | 负 | 未决 | 纯胜率 | 得分率 |', '|---|---:|---:|---:|---:|---:|---:|---:|'];
for(const [label,key]of[['全部','overall'],['红方','red'],['黑方','black']]){const s=v.summary[key];lines.push(`| ${label} | ${s.games} | ${s.wins} | ${s.draws} | ${s.losses} | ${s.unresolved} | ${pct(s.winRate)} | ${pct(s.scoreRate)} |`);}
lines.push('', '| 布局种子 | 新版执红：手数/结果 | 新版执黑：手数/结果 | 新版每对得分（满分2） |','|---|---|---|---:|');
for(const seed of r.seeds){const pair=r.games.filter(g=>g.seed===seed),describe=g=>g.finalState.ply+' / '+(g.result.status==='unresolved'?'未决':g.result.status==='draw'?'和':g.result.winner===g.candidateSide?'胜':'负')+'（'+g.result.reason+'）';lines.push(`| ${seed} | ${describe(pair.find(g=>g.candidateSide==='r'))} | ${describe(pair.find(g=>g.candidateSide==='b'))} | ${pair.some(g=>g.result.status==='unresolved')?'未决':pair.reduce((s,g)=>s+score(g),0)} |`);}
lines.push('', '上表手数为实际合法落子数；技术负最后一次未提交的尝试另计入原始日志。');
for(const g of r.games.filter(g=>g.result.technicalForfeit)){const last=g.log.at(-1);lines.push('', `技术负详情：布局${g.seed}，新版${g.candidateSide==='r'?'红':'黑'}方，${g.result.reason}，责任方${g.result.offender}；实际已落${g.finalState.ply}手，最后尝试第${last?.ply??'无'}手，记录墙钟${last?.elapsedMs?.toFixed(3)??'无'}ms。`);}
lines.push('', '技术统计：'+Object.entries(v.faultCounts).map(([k,n])=>k+'='+n).join('；')+'。技术负纳入胜负与得分率；若有上限未决则总得分率留空，并报告上下界，另列已决局得分率。没有按评估分提前认输或主观截断。', '', '## 实际时限与回放复核', '', '| 引擎 | 实际落子/尝试数 | 耗时中位数ms | p95 ms | 最大ms | 超过1060ms | 宿主停止 | 合法保底 |', '|---|---:|---:|---:|---:|---:|---:|---:|');
for(const [label,key]of[['新版','candidate'],['PikaJieQi','pika']]){const t=v.timing[key];lines.push(`| ${label} | ${t.moves} | ${num(t.medianMs)} | ${num(t.p95Ms)} | ${num(t.maxMs)} | ${t.overGrace} | ${t.hostStops} | ${t.fallbacks} |`);}
lines.push('', '宿主停止表示到期采用最后完整层并终止进程，不等于技术超时；只有墙钟超过共同1060ms上限才在本批判超时负。合法保底与强停分别计数，未把未完成层当作有效深度。');
lines.push('', `逐手独立回放验证 ${v.legalPlies} 手合法走子，${v.darkCaptures} 次暗子被吃。重新构造全部观察哈希、专属历史token、翻子/吃子结果、棋盘哈希、终局和分项成绩均一致。证据见 [verification.json](${dir}/verification.json)。Pika日志原有UCI深度与新版“全部8样本/全部根候选完成的主深度”含义不同，不横向比较其层数。`, '', '## 不确定性与复现', '', '这是一个预算档、10对事先选定布局、一次运行的小样本。配对局存在相关性，不以20局独立伯努利样本计算置信区间，也不声称稳定Elo或长期胜率。即使本批纯胜率为0，也不能推出任何布局下胜率都为0；提高搜索速度也不会自动带来成熟引擎水平。', '', '历史JS对赛的预算、线程数、布局和代码版本与本轮不同，不能据两批得分直接计算提升幅度。本轮只测试和报告，没有根据对赛结果修改任一引擎。新版的布局采样仍有策略融合/信息集近似，Pika也有已知颜色估值偏差。不能仅凭单局/单个估值分认定双方的开局着法最优。', '', '使用已有获准二进制重跑（不会自动下载或编译第三方）：', '', '```sh', 'JIEQI_ENGINE_PATH=./external/pikafish-jieqi-wasm/src/PikaJieQi node scripts/native-pika-match.mjs smoke', 'JIEQI_ENGINE_PATH=./external/pikafish-jieqi-wasm/src/PikaJieQi node scripts/native-pika-match.mjs freeze', 'JIEQI_ENGINE_PATH=./external/pikafish-jieqi-wasm/src/PikaJieQi node scripts/native-pika-match.mjs run', 'node scripts/native-pika-verify.mjs', 'node scripts/native-pika-report.mjs', '```', '', '先另存本轮正式目录：freeze拒绝覆盖既有matches.json，run只续跑缺失的配对局，不重复已完成比赛。脚本核对双方固定版本、二进制和核心/裁判源码哈希；改变参赛核心会拒绝。比赛首次冻结的脚本哈希也保留在数据里。', '', '本机8766服务保持运行；本轮棋谱、脚本及报告尚未推送。');
fs.writeFileSync('PIKA_NATIVE_MATCH_REPORT.md',lines.join('\n')+'\n');const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');fs.writeFileSync(`${dir}/report-hashes.json`,JSON.stringify({reportSha256:sha('PIKA_NATIVE_MATCH_REPORT.md'),verificationSha256:sha(`${dir}/verification.json`),matchSha256:sha(`${dir}/matches.json`),generatedAt:new Date().toISOString()},null,2)+'\n');console.log('报告已生成');
