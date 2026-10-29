import fs from 'node:fs';import assert from 'node:assert/strict';
const dir='benchmarks/ab-jchess',r=JSON.parse(fs.readFileSync(dir+'/matches.json')),v=JSON.parse(fs.readFileSync(dir+'/verification.json')),check=JSON.parse(fs.readFileSync(dir+'/check.json')),quota=JSON.parse(fs.readFileSync(dir+'/quota.json')),post=JSON.parse(fs.readFileSync(dir+'/postmortem.json')),tests=JSON.parse(fs.readFileSync(dir+'/tests.json'));
assert(v.passed&&check.passed);const games=r.games.filter(g=>g.result),wins=games.filter(g=>g.result.winner===g.mistSide).length,losses=games.filter(g=>g.result.winner&&g.result.winner!==g.mistSide).length,draws=games.filter(g=>g.result.status==='draw').length,unresolved=games.filter(g=>g.result.status==='unresolved').length,technical=games.filter(g=>g.result.technicalForfeit),score=unresolved?null:(wins+.5*draws)/games.length;assert.equal(r.summary.wins,wins);assert.equal(r.summary.losses,losses);assert.equal(r.summary.draws,draws);assert.equal(r.summary.scoreRate,score);
const rows=games.map(g=>`| ${g.index+1} | ${g.seed} | ${g.mistSide==='r'?'红':'黑'} | ${g.finalState.ply} | ${g.result.status==='unresolved'?'未决':g.result.status==='draw'?'和':g.result.winner===g.mistSide?'胜':'负'} | ${g.result.reason} | ${g.result.technicalForfeit?'是':'否'} |`).join('\n');
const text=`# Mist 对 AB-JChess：2026-10-28 本地对照

已完成 ${games.length} 局、${new Set(games.map(g=>g.seed)).size} 个新布局，换色配对。Mist **${wins} 胜 ${draws} 和 ${losses} 负**，得分率 **${score===null?'不可计算（含未决）':(score*100).toFixed(2)+'%'}**。技术失败 ${technical.length}，未决 ${unresolved}。这是固定版本、固定配置的小样本，不能据此推定总体 Elo 或已超过对手。没有根据输赢改参数或替换对局。

## 冻结配置

- Mist：稳定默认 HCE，仓库基线 ${r.baseCommit}；源码 SHA ${r.mist.sourceSha256}；二进制 SHA ${r.mist.binarySha256}。本轮没有改变默认引擎。
- 对手：[AB-JChess v0.2d](https://github.com/lxsgx23/AB-JChess/releases/tag/v0.2d)，固定提交 [${r.ab.commit.slice(0,8)}](https://github.com/lxsgx23/AB-JChess/commit/${r.ab.commit})，本机源码编译，二进制 SHA ${r.ab.binarySha256}；未混用 main 或 v0.2b。
- 真正启用的官方 NNUE：abjchess-20261010.nnue，143667546 字节，SHA ${r.ab.modelSha256}。4 个数据块均独立校验，运行时确认 inference_complete=true、probability_tables=true。
- 每手名义 **2000ms**，统一技术宽限 **60ms**。双方搜索线程上限 4；AB 实设 Threads=4、Hash=64MiB、Move Overhead=0、ChasingRule=github，其他搜索参数沿用该标签默认。Mist 暗局面 8 样本、最多 4 世界线程；明棋 1 样本/线程。实际返回线程计数见 verification.json。Node 调度，无浏览器 JS Worker，不并发跑双方搜索。
- 启动、模型预加载、线程就绪在计时外。视图投影、根重复过滤、采样、历史/FEN 校验、IPC、搜索、停止及进程回收在计时内。没有同时运行其他实验或编译。
- 预先固定 4 布局/8 局试赛；全部无技术故障、无未决且实际额度 >=40% 才扩展另 4 布局至 16 局。扩展检查保存在 matches.json gates，未按胜负决定是否扩展。

## 逐局结果（Mist 视角）

| 局 | 布局种子 | Mist 方 | 半回合 | 结果 | 终止原因 | 技术失败 |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

## 验证

- 赛前 ${check.positionChecks} 次完整历史/FEN 检查、${check.legalSetChecks} 个局面的合法走法集合比对、${check.privateCaptures} 次暗吃观察者隔离检查通过；4/5/6 字符历史协议均覆盖。第三次重复裁判与 AB 根白名单经过实际搜索验证。
- 赛后从初始真布局独立回放 ${v.plies} 个已执行半回合，${v.privateDarkCaptures} 次暗吃，${v.repetitionLosses} 次重复判负，${v.rootGuardUses} 次根重复过滤触发。核对每手合法性、视角指纹、公开揭示、私有俘虏、历史令牌、FEN 库存、终局及耗时。通过状态见 verification.json。
- 项目原有 npm test：${tests.pass}/${tests.tests} 通过，失败 ${tests.fail}、跳过 ${tests.skipped}。在两阶段比赛之间运行，没有与正式搜索并发。没有进行或声称真实浏览器视觉验收，本轮没有界面改动。
- 实际计时：Mist ${v.time.mist.attempts} 次，平均 ${v.time.mist.mean.toFixed(2)}ms，P95 ${v.time.mist.p95.toFixed(2)}ms，最大 ${v.time.mist.max.toFixed(2)}ms；AB ${v.time.ab.attempts} 次，平均 ${v.time.ab.mean.toFixed(2)}ms，P95 ${v.time.ab.p95.toFixed(2)}ms，最大 ${v.time.ab.max.toFixed(2)}ms。超 2060ms 次数分别 ${v.time.mist.over2060}/${v.time.ab.over2060}。
- 额度来源 mcp__codex_app.get_usage_limits，实际可读周期 10080 分钟；最后记录剩余 ${quota.checks.at(-1).remaining}%。未知周期没有猜测，也没有作为阻塞条件。阶段记录见 quota.json。

## 实质局限及权限记录

外部终局统一采用当前 Mist 规则：无合法着为负；第三次相同公开棋盘/行棋方由走子方判负；120 无吃子、无揭子半回合判和；400 半回合上限记未决。AB 根 searchmoves 排除立即第三次重复判负的走法（仍有其他选择时）。**内部搜索规则没有完全对齐**：AB github 循环规则及其 80 半回合判和与 Mist 不同，暗子移动时的无吃子计数也不同，实测记录 ${v.quietCounterDifferences} 次计数差异。保留完整历史并如实记录，不改固定上游、不重置计数掩盖差异。所以这是统一外部裁判下的实用比较，不是严格内部同规则棋力估计。

固定上游依据：[可变身份后缀的历史解析](https://github.com/lxsgx23/AB-JChess/blob/${r.ab.commit}/abjchess/src/engine.cpp#L82)、[内部循环判定](https://github.com/lxsgx23/AB-JChess/blob/${r.ab.commit}/abjchess/src/position.cpp#L5014)、[80 半回合阈值](https://github.com/lxsgx23/AB-JChess/blob/${r.ab.commit}/abjchess/src/position.cpp#L5117)。

CPU 特性查询 sysctl 被系统拒绝（Operation not permitted），没有重试或改道。已完成的构建和比赛使用 x86_64 基线 SSE2，NNUE head_backend=scalar，无 BMI2/AVX2。结果不代表对手官方优化版最高性能。两方上限线程和时间相同，但评估网络、采样方法和内存用量不同，未宣称相同总内存。

源码 GPL-3.0；发行权重无独立许可文件，启动横幅还写禁止转售。仅本地使用，没有重新分发对手模型、二进制或源码，也不据此推定权重公开许可。仅做必要源码审阅和完整性检查，没有安装软件、运行上游安装/训练脚本或上传数据。

本轮只新增独立适配与本地证据，没有修改用户棋局、页面或稳定核心，没有提交/推送/触发 CI，也没有尝试绕过先前浏览器限制。后续若要对方最佳性能或严格内部规则一致，应先明确构建与规则方案，再预注册更多独立布局，避免把本轮小样本直接用于调参并当独立验证。

## 棋谱中的主要失利模式

15 局败局的直接终止原因均为将死；其中 ${post.summary.finalMatingPieces.R} 局由明车完成最后将杀，${post.summary.finalMatingPieces.N} 局由明马、${post.summary.finalMatingPieces.A} 局由明士完成。${post.summary.lossesWithin60Plies} 局在 60 半回合内结束，败局半回合中位数 ${post.summary.medianLossPlies}。最明显的棋谱模式是王侧防守很快被突破，尤其车的直线压迫。仅凭终结棋子不能证明更早的战略失误，更不能归因于 NNUE 单一因素。

后验核对只枚举过滤后的合法观察、合法明子回复，以及当时身份池中各个可能揭示，不给新引擎搜索输入裁判真值。找到 ${post.summary.selectedMoveAllowedVisibleMateWithBrightAlternative} 个末段：选中的暗子揭示有立即明子将杀的风险，而存在能避开这一层明子将杀的明子着法。以下不是“已证明最佳防守”，也未排除替代着法面对暗子揭示或更深强制杀：

${post.examples.map(e=>`- 第 ${e.index} 局，布局 ${e.seed}，Mist 执${e.mistSide==='r'?'红':'黑'}：第 ${e.plies-1} 半回合选择 ${e.lastMistMove}，完成搜索深度 ${e.lastMistDepth}。按当时可见身份池，${e.possibleIdentityCount} 个身份条目中有 ${e.immediateMateIdentityCount} 个会允许对方下一手明子将杀；实战以 ${e.finalMove} 结束。可见明子候选 ${e.alternative} 能避开所有立即明子将杀，未证明能保住更远局面。具体 FEN、完整合法观察与各身份分支见 postmortem.json。`).join('\n')}

身份条目计数按本项目的库存均匀假设解释，未从对手决策反推更复杂的策略后验，也没有利用实际未揭身份。

这显示需要进一步区分“被迫赌揭子”与“风险估值/采样/搜索漏防”，不能把失败简单说成只差层数：上述有些推荐已完成 5–6 层，但不是每条分支都等深；日志没有保存完整分支评分，无法从现有证据把三者分开作因果判断。没有开展新的调参或对战。

协议/规则方面：787 半回合回放的棋盘、库存和身份权限全部一致，没有非法走法或输入失败，未发现协议差错解释这些败局。实战没有第三次重复终局，AB 搜索前实测半回合计数最大 17，低于其内部 80 阈值，外部裁判也没有闲步和棋。但深层搜索的循环与计数规则差异仍可能影响选择，不能据此排除所有规则影响。

## 本地复现证据

运行方式见 [README](../../native/experiments/ab-jchess/README.md)。证据保存在 benchmarks/ab-jchess/：audit.json、build.json、smoke.json、check.json、matches.json、verification.json、postmortem.json、tests.json、quota.json。matches.json 含每手耗时、观察视图指纹、完整身份后缀和本地裁判真布局，后者只用于复盘，绝未发给引擎，不可直接作为合法观察者训练输入。外部源码、权重、编译对象和运行锁保留于忽略目录 external/ 与 .cache/。
`;
fs.mkdirSync('docs/experiments',{recursive:true});fs.writeFileSync('docs/experiments/ab-jchess.md',text);console.log(JSON.stringify({games:games.length,wins,draws,losses,scoreRate:score,technical:technical.length,unresolved,report:'docs/experiments/ab-jchess.md'}));
