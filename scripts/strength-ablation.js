import fs from 'node:fs';import{createHash}from'node:crypto';import{initial,publicState,legalMoves,move}from'../engine.js';
import{analyze,seeded}from'../ai.js';import{analyze as baseline}from'../benchmarks/strength-baseline-ai.js';
const positions=[{name:'初始全暗',view:publicState(initial(seeded(2111)),'r')}];
for(const seed of [2111,2221]){let rng=seeded(seed),s=initial(rng);for(let i=0;i<44&&!s.result;i++){const ms=legalMoves(s);s=move(s,ms[Math.floor(rng()*ms.length)]);if([20,44].includes(i+1))positions.push({name:'可达中局 '+seed+' / '+s.ply+'步',view:publicState(s,s.turn)});}}
positions.push({name:'原超时前的黑方观察局面',view:JSON.parse(fs.readFileSync('benchmarks/strength-timeout-position.json')).view});
fs.writeFileSync('benchmarks/strength-positions.json',JSON.stringify(positions,null,2)+'\n');
const variants=[{name:'baseline',fn:baseline},{name:'inventory',fn:analyze,features:{activity:false,safety:false,leaperActivity:false,checkExtensions:false,killers:false}},{name:'forcing',fn:analyze,features:{activity:false,safety:false,leaperActivity:false}},{name:'default',fn:analyze},{name:'leaper',fn:analyze,features:{leaperActivity:true}},{name:'full',fn:analyze,features:{activity:true}},{name:'ray',fn:analyze,features:{activity:true,slidingMobility:true}}];
const rows=[];
for(const v of variants)v.fn(positions[0].view,{timeMs:100000,maxDepth:1,samples:2,seed:444,features:v.features});
for(let repeat=0;repeat<3;repeat++)for(const p of positions)for(let j=0;j<variants.length;j++){
 const v=variants[(j+repeat)%variants.length],r=v.fn(p.view,{timeMs:100000,maxDepth:2,samples:4,seed:444,features:v.features});
 rows.push({repeat,position:p.name,variant:v.name,features:v.features||null,depth:r.depth,nodes:r.nodes,elapsedMs:r.elapsedMs,move:r.move,score:r.score,rootTableBytes:Buffer.byteLength(JSON.stringify(r)),wireBytes:Buffer.byteLength(JSON.stringify((({allCandidates,...wire})=>wire)(r)))});
}
const tactics=[];for(const p of JSON.parse(fs.readFileSync('benchmarks/tactical-positions.json')))for(const v of variants){const r=v.fn(p.state,{timeMs:10000,maxDepth:2,samples:1,seed:444,features:v.features});tactics.push({position:p.name,variant:v.name,depth:r.depth,nodes:r.nodes,elapsedMs:r.elapsedMs,mateFound:r.score>98000,oracleMove:p.winningMoves.some(m=>m.from===r.move.from&&m.to===r.move.to),move:r.move});}
const timed=[];for(const p of positions.filter((_,i)=>[0,2,5].includes(i)))for(const v of variants){const r=v.fn(p.view,{timeMs:250,samples:8,seed:444,features:v.features});timed.push({position:p.name,variant:v.name,depth:r.depth,nodes:r.nodes,elapsedMs:r.elapsedMs,move:r.move});}
const result={sourceSha256:createHash('sha256').update(fs.readFileSync('ai.js')).digest('hex'),variant:'被吃暗子仅吃子方可见',protocol:'固定6个观察局面，4样本、名义深度至多2；预热后3次轮换执行次序，取中位数；战术有独立穷举制胜集合。耗时仅搜索核心，不含线程传输。',rows,tactics,timed};fs.writeFileSync(process.env.JIEQI_ABLATION_OUTPUT||'benchmarks/strength-ablation-replay.json',JSON.stringify(result,null,2)+'\n');
for(const v of variants){const xs=rows.filter(x=>x.variant===v.name),median=xs.map(x=>x.elapsedMs).sort((a,b)=>a-b);console.log(JSON.stringify({variant:v.name,medianMs:(median[Math.floor((median.length-1)/2)]+median[Math.floor(median.length/2)])/2,nodes:xs.reduce((a,b)=>a+b.nodes,0)/3,matesAtDepth2:tactics.filter(x=>x.variant===v.name&&x.mateFound&&x.oracleMove).length}));}
