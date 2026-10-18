import fs from 'node:fs';import {createHash} from 'node:crypto';
import {initial,legalMoves,move,publicState} from '../engine.js';
import {analyze,seeded} from '../ai.js';import {analyze as baseline} from '../benchmarks/opening-baseline-ai.js';
const positions=[];
const mode=process.env.JIEQI_VALIDATION_MODE||'midgames';
if(mode==='branches')for(const [i,m]of[{from:54,to:45},{from:82,to:65},{from:64,to:1}].entries()){const seed=4019+i*12,s=move(initial(seeded(seed)),m);positions.push({seed,ply:s.ply,openingMove:m,view:publicState(s,s.turn)});}
else for(const seed of [4001,4003,4007,4013]){const rng=seeded(seed);let s=initial(rng);for(let i=0;i<37&&!s.result;i++){const ms=legalMoves(s);s=move(s,ms[Math.floor(rng()*ms.length)]);if([19,37].includes(s.ply))positions.push({seed,ply:s.ply,view:publicState(s,s.turn)});}}
const variants=[{name:'baseline',fn:baseline},{name:'ordering',fn:analyze},{name:'mobility',fn:analyze,features:{mobility:true}}],rows=[],tactics=[];
for(const v of variants)v.fn(positions[0].view,{maxDepth:1,samples:2,timeMs:100000,seed:999,features:v.features});
for(let repeat=0;repeat<3;repeat++)for(const [i,p] of positions.entries())for(let k=0;k<variants.length;k++){
 const v=variants[(k+repeat+i)%variants.length],r=v.fn(p.view,{maxDepth:2,samples:4,timeMs:100000,seed:999,features:v.features});
 if(!legalMoves(p.view).some(m=>m.from===r.move.from&&m.to===r.move.to))throw Error('非法推荐');
 rows.push({repeat,position:i,variant:v.name,elapsedMs:r.elapsedMs,nodes:r.nodes,depth:r.depth,move:r.move,score:r.score,rootScores:r.allCandidates.map(x=>({from:x.from,to:x.to,score:x.score})).sort((a,b)=>a.from-b.from||a.to-b.to)});
}
for(const f of JSON.parse(fs.readFileSync('benchmarks/tactical-positions.json')))for(const v of variants){const r=v.fn(f.state,{maxDepth:2,samples:1,timeMs:10000,seed:999,features:v.features});tactics.push({fixture:f.name,variant:v.name,oracleMove:f.winningMoves.some(x=>x.from===r.move.from&&x.to===r.move.to),mate:r.score>98000,elapsedMs:r.elapsedMs});}
const summary={};for(const v of variants){const xs=rows.filter(x=>x.variant===v.name),times=xs.map(x=>x.elapsedMs).sort((a,b)=>a-b);summary[v.name]={runs:xs.length,medianMs:(times[(times.length-1)>>1]+times[times.length>>1])/2,totalMs:xs.reduce((a,x)=>a+x.elapsedMs,0),tacticsPassed:tactics.filter(x=>x.variant===v.name&&x.oracleMove&&x.mate).length};}
const changed=[];for(let i=0;i<positions.length;i++){const a=rows.find(x=>x.position===i&&x.variant==='baseline'),b=rows.find(x=>x.position===i&&x.variant==='ordering');if(JSON.stringify(a.rootScores)!==JSON.stringify(b.rootScores))changed.push(i);}
const result={sourceSha256:createHash('sha256').update(fs.readFileSync('ai.js')).digest('hex'),protocol:mode==='branches'?'3个独立可达首着后局面（兵/马/炮位，黑方分别可见视角），其余配置与中局消融相同。':'事先固定8个未用于开局比较的可达观察局面；3次轮换执行顺序，4个同批样本，完整名义2层。通用揭子排序不改搜索评分，活动度仅试验。耗时是核心而非完整宿主墙钟。',positions,rows,tactics,summary,orderingChangedScorePositions:changed};
fs.writeFileSync(process.env.JIEQI_OPENING_VALIDATION_OUTPUT||'benchmarks/opening-validation-replay.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({summary,orderingChangedScorePositions:changed}));
