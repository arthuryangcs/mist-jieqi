import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,publicState,legalMoves,move,pseudo,other} from '../engine.js';
import {analyze,balancedSamples,remaining,seeded,values} from '../ai.js';
import {analyze as baseline} from '../benchmarks/opening-baseline-ai.js';

const seeds=(process.env.JIEQI_OPENING_SEEDS||'3109,3163,3181,3221').split(',').map(Number);
const budgets=(process.env.JIEQI_OPENING_BUDGETS||'250,2000').split(',').map(Number);
const samples=Number(process.env.JIEQI_OPENING_SAMPLES||15);
const output=process.env.JIEQI_OPENING_OUTPUT||'benchmarks/opening-analysis-replay.json';
const variants=[{name:'baseline',fn:baseline},{name:'ordering',fn:analyze},{name:'mobility',fn:analyze,features:{mobility:true}}];
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const results={sourceSha256:sha('ai.js'),baselineCommit:'3a46d42e01611b09921f014d7c74a5bc3b90a80c',baselineSnapshotSha256:sha('benchmarks/opening-baseline-ai.js'),protocol:'初始全暗公开观察，黑方为对称假想先行对照而非实际黑方首手。不同采样种子，所有候选与各配置共用同批无放回样本；15样本时每个暗子边际完整覆盖初始身份袋。固定墙钟预算，保留最后完整根轮次；评分为启发式效用，不是胜率或最优性证明。',seeds,budgets,samples,rows:[],geometry:[]};
for(const side of ['r','b']){
 const state=initial(seeded(999));state.turn=side;const view=publicState(state,side);
 const pool=remaining(view,side),entropy=-[...new Set(pool)].reduce((v,t)=>{const p=pool.filter(x=>x===t).length/pool.length;return v+p*Math.log2(p);},0);
 const worlds=balancedSamples(view,15,seeded(3109));
 for(const m of legalMoves(view)){
  const identities=[];let immediateRisk=0;
  for(const world of worlds){
   const next=move({...world,captured:[],ply:0,quiet:0,positions:[]},m,false),p=next.board[m.to];
   const destinations=[];for(let t=0;t<90;t++)if(pseudo(next.board,m.to,t))destinations.push(t);
   const threatened=legalMoves(next).some(reply=>reply.to===m.to);
   identities.push({type:p.type,pseudoMobility:destinations.length,threatened});
   if(threatened)immediateRisk+=values[p.type]/15;
  }
  results.geometry.push({side,...m,role:view.board[m.from].role,capture:!!view.board[m.to],identityEntropyBits:entropy,meanMobility:identities.reduce((a,x)=>a+x.pseudoMobility,0)/15,immediateExposureExpectedValue:immediateRisk,identityDetails:identities});
 }
 for(const seed of seeds)for(const budget of budgets)for(let k=0;k<variants.length;k++){
  const variant=variants[(k+seeds.indexOf(seed))%variants.length];
  const r=variant.fn(view,{timeMs:budget,seed,samples,maxDepth:5,features:variant.features});
  const rows=(r.allCandidates||[]).map(x=>({...x,role:view.board[x.from].role,capture:!!view.board[x.to]}));
  results.rows.push({side,seed,budget,variant:variant.name,depth:r.depth,nodes:r.nodes,elapsedMs:r.elapsedMs,move:r.move,role:view.board[r.move.from].role,score:r.score,candidates:rows});
  fs.writeFileSync(output,JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({side,seed,budget,variant:variant.name,depth:r.depth,role:view.board[r.move.from].role,move:r.move,score:Math.round(r.score)}));
 }
}
results.summary=Object.fromEntries(variants.map(({name})=>[name,budgets.map(budget=>{const rows=results.rows.filter(x=>x.variant===name&&x.budget===budget);return {budget,runs:rows.length,pawnChoices:rows.filter(x=>x.role==='P').length,roles:rows.reduce((a,x)=>(a[x.role]=(a[x.role]||0)+1,a),{}),meanDepth:rows.reduce((a,x)=>a+x.depth,0)/rows.length,maxElapsedMs:Math.max(...rows.map(x=>x.elapsedMs))};})]));
fs.writeFileSync(output,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.summary));
