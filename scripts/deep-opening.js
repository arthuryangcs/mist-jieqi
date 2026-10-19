// Offline fixed-depth experiment. Production/browser code and budgets stay unchanged.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,publicState,legalMoves} from '../engine.js';
import {balancedSamples,seeded} from '../ai.js';

const seed=Number(process.env.JIEQI_DEEP_SEED||6101);
const samples=Number(process.env.JIEQI_DEEP_SAMPLES||8);
const maxDepth=Number(process.env.JIEQI_DEEP_DEPTH||5);
const budgetMs=Number(process.env.JIEQI_DEEP_BUDGET_MS||180000);
const tableLimit=Number(process.env.JIEQI_DEEP_TABLE_LIMIT||90000);
const refresh=process.env.JIEQI_DEEP_REFRESH==='1';
const output=process.env.JIEQI_DEEP_OUTPUT||`benchmarks/deep-opening-${seed}-s${samples}-replay.json`;
if(![seed,samples,maxDepth,budgetMs,tableLimit].every(Number.isFinite)||![samples,maxDepth,tableLimit].every(Number.isInteger)||samples<1||samples>30||maxDepth<1||maxDepth>6||budgetMs<1||budgetMs>300000||tableLimit<1||tableLimit>300000)throw Error('实验参数超出有限资源范围');
const sha=x=>createHash('sha256').update(x).digest('hex');
const source=fs.readFileSync(new URL('../ai.js',import.meta.url),'utf8');
const engineSha256=sha(fs.readFileSync(new URL('../engine.js',import.meta.url)));
// Add counters and an optional generic TT-capacity experiment to an in-memory copy.
// The default keeps the exact production cache policy; there is no move/eval bonus.
const patches=[
 ['let nodes=0;', 'let nodes=0,interruptedDepth=null;const ttStats={probes:0,usableHits:0,blockedWrites:0,writes:0};'],
 ['entry=table.get(key);if(entry&&entry.depth>=depth){', 'entry=table.get(key);ttStats.probes++;if(entry&&entry.depth>=depth){ttStats.usableHits++;'],
 ["function save(score,flag,best){if(key&&cycleStart===s._cycles&&table.size<90000)table.set(key,{depth,score:score>98000?score+ply:score< -98000?score-ply:score,flag,best});}",
  `function save(score,flag,best){if(key&&cycleStart===s._cycles){if(table.size<${tableLimit}${refresh?'||table.has(key)':''}){ttStats.writes++;table.set(key,{depth,score:score>98000?score+ply:score< -98000?score-ply:score,flag,best});}else ttStats.blockedWrites++;}}`],
 ['catch(e){if(e!==TIMEOUT)throw e;break;}', 'catch(e){if(e!==TIMEOUT)throw e;interruptedDepth=depth;break;}'],
 ['onProgress(result);', 'onProgress({...result,diagnostics:{...ttStats,tableSizes:worlds.map(s=>tables.get(s).size),heapBytes:process.memoryUsage().heapUsed,rssBytes:process.memoryUsage().rss}});'],
 ['return {...result,nodes,elapsedMs:Math.round(performance.now()-start)};', 'return {...result,nodes,interruptedDepth,diagnostics:{...ttStats,tableSizes:worlds.map(s=>tables.get(s).size),heapBytes:process.memoryUsage().heapUsed,rssBytes:process.memoryUsage().rss},elapsedMs:Math.round(performance.now()-start)};']
];
let instrumented=source;for(const [from,to]of patches){if(instrumented.split(from).length!==2)throw Error('诊断补丁不唯一，未运行');instrumented=instrumented.replace(from,to);}
instrumented=instrumented.replace("'./engine.js'",JSON.stringify(new URL('../engine.js',import.meta.url).href));
const {analyze}=await import('data:text/javascript;base64,'+Buffer.from(instrumented).toString('base64'));
const view=publicState(initial(seeded(17)),'r');
if(JSON.stringify(view)!==JSON.stringify(publicState(initial(seeded(999)),'r')))throw Error('公开输入依赖真实暗子布局');
if(view.board.some(p=>p?.hidden&&'type'in p))throw Error('暗子身份泄露');
const moves=legalMoves(view),worlds=balancedSamples(view,samples,seeded(seed));
const record={baselineCommit:'5c71c95a78bddbd4754ea9b17a0be1b7a6132c22',sourceSha256:sha(source),engineSha256,instrumentedSha256:sha(instrumented),seed,samples,requestedDepth:maxDepth,budgetMs,tableLimit,refresh,runtime:process.version,observationSha256:sha(JSON.stringify(view)),sampleWorldHashes:worlds.map(w=>sha(JSON.stringify(w))),rootMoveCount:moves.length,protocol:'离线固定样本；同一analyze调用逐层加深，缓存跨层/根着法复用。仅在全部合法首着和全部样本完成同一主深度时记录该层。深度不含吃子/应将延伸；分数为搜索启发式而非实战胜率。内存诊断副本不修改生产代码。',startedAt:new Date().toISOString(),iterations:[]};
const persist=()=>fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');persist();
const result=analyze(view,{seed,samples,maxDepth,timeMs:budgetMs,onProgress:r=>{
 if(r.allCandidates.length!==moves.length||r.samples!==samples)throw Error('根轮次或样本不完整，拒绝排名');
 const prior=record.iterations.at(-1);
 const candidates=r.allCandidates.map((m,i)=>({...m,rank:i+1,role:view.board[m.from].hidden?view.board[m.from].role:'K',capture:!!view.board[m.to],gap:r.score-m.score}));
 const row={depth:r.depth,elapsedMs:r.elapsedMs,iterationMs:r.elapsedMs-(prior?.elapsedMs||0),nodes:r.nodes,iterationNodes:r.nodes-(prior?.nodes||0),best:r.move,bestRole:candidates[0].role,bestScore:r.score,pawns:candidates.filter(m=>m.role==='P'),bestByRole:Object.fromEntries([...new Set(candidates.map(m=>m.role))].map(role=>[role,candidates.find(m=>m.role===role)])),diagnostics:r.diagnostics,candidates};
 record.iterations.push(row);persist();console.log(JSON.stringify({seed,samples,depth:row.depth,elapsedMs:row.elapsedMs,nodes:row.nodes,bestRole:row.bestRole,best:row.best,pawns:row.pawns.map(p=>({from:p.from,to:p.to,rank:p.rank,score:Math.round(p.score),gap:Math.round(p.gap)})),ttSizes:row.diagnostics.tableSizes}));
}});
record.finishedAt=new Date().toISOString();record.completedTarget=result.depth>=maxDepth;record.final={depth:result.depth,nodes:result.nodes,elapsedMs:result.elapsedMs,interruptedDepth:result.interruptedDepth,diagnostics:result.diagnostics};
if(sha(fs.readFileSync(new URL('../ai.js',import.meta.url)))!==record.sourceSha256||sha(fs.readFileSync(new URL('../engine.js',import.meta.url)))!==engineSha256)throw Error('运行中生产源码改变');persist();console.log(JSON.stringify({finished:true,seed,samples,completedTarget:record.completedTarget,final:record.final}));
