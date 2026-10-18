import fs from 'node:fs';import {createHash} from 'node:crypto';
import {initial,publicState,legalMoves,move,other,positionKey} from '../engine.js';
import {seeded} from '../ai.js';import {NodeSearchEngine} from './node-search-engine.js';
const seeds=(process.env.JIEQI_STRENGTH_SEEDS||'1709,1741,1783,1811').split(',').map(Number),budget=Number(process.env.JIEQI_STRENGTH_BUDGET||250),grace=60,output=process.env.JIEQI_STRENGTH_OUTPUT||'benchmarks/strength-internal-replay.json';
const features=process.env.JIEQI_STRENGTH_FEATURES?JSON.parse(process.env.JIEQI_STRENGTH_FEATURES):undefined;
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const result={variant:'被吃暗子仅吃子方可见；红先；本项目将死/困毙及和棋裁判',budgetMs:budget,graceMs:grace,samples:8,seeds,features:features||'defaults',sourceHashes:{baseline:hash('benchmarks/strength-baseline-ai.js'),candidate:hash('ai.js')},runtime:process.version,transportHashes:Object.fromEntries(['deadline-search.js','worker.js','scripts/node-search-worker.js','scripts/node-search-engine.js','scripts/external-engine.js'].map(p=>[p,hash(p)])),timing:'相同宿主时限控制器与独立Node线程。初始化排除在每步计时外，公开视角构造后派发至收到合法着法的全部时间均计入；超时、非法或异常均判负且计入总成绩。',games:[]};
for(const seed of seeds)for(const candidateSide of ['r','b']){
 if(hash('ai.js')!==result.sourceHashes.candidate||hash('benchmarks/strength-baseline-ai.js')!==result.sourceHashes.baseline)throw Error('对赛中源代码已改变，请保存本次记录并另开实验');
 const engines={candidate:new NodeSearchEngine({features}),baseline:new NodeSearchEngine({moduleUrl:new URL('../benchmarks/strength-baseline-ai.js',import.meta.url).href})};
 let s=initial(seeded(seed));s.positions=[positionKey(s)];const log=[];let outcome,active;
 try{
  await engines.candidate.ready();await engines.baseline.ready();
  while(!s.result&&s.ply<400){
   const view=publicState(s,s.turn);active=s.turn===candidateSide?'candidate':'baseline';
   for(const p of [...view.board,...view.captured])if(p?.hidden&&'type'in p)throw Error('观察信息泄露');
   const r=await engines[active].search(view,budget),legal=legalMoves(view).some(m=>m.from===r.move?.from&&m.to===r.move?.to);
   const row={ply:s.ply+1,side:s.turn,engine:active,move:r.move,elapsedMs:r.elapsedMs,depth:r.depth,nodes:r.nodes,score:r.score,searchElapsedMs:r.searchElapsedMs,hostPreparationMs:r.hostPreparationMs,dispatchMs:r.dispatchMs,firstProgressMs:r.firstProgressMs,fallback:r.fallbackUsed,deadlineStop:r.deadlineStop,knownDark:view.captured.filter(p=>p.wasHidden).length};
   if(r.elapsedMs>budget+grace||!legal){outcome={winner:other(s.turn),text:legal?'超时技术负':'非法着法技术负',technicalForfeit:true,offender:active};log.push(row);break;}
   const p=s.board[r.move.from],q=s.board[r.move.to],n=move(s,r.move);log.push({...row,reveal:p.hidden?n.board[r.move.to].type:null,capture:q?(q.hidden?'dark':q.type):null});s=n;
   if(s.ply%40===0)console.log(JSON.stringify({seed,candidateSide,ply:s.ply}));
  }
  outcome??=s.result||{winner:null,text:'400步上限和棋'};
 }catch(error){outcome={winner:active==='candidate'?other(candidateSide):candidateSide,text:'异常技术负',technicalForfeit:true,offender:active,error:error.message};}
 finally{await engines.candidate.close();await engines.baseline.close();}
 result.games.push({seed,candidateSide,plies:log.length,result:outcome,log});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({seed,candidateSide,plies:log.length,result:outcome}));
}
function stats(name){const rows=result.games.flatMap(g=>g.log).filter(r=>r.engine===name),times=rows.map(r=>r.elapsedMs).sort((a,b)=>a-b);return {moves:rows.length,fallbacks:rows.filter(r=>r.fallback).length,deadlineStops:rows.filter(r=>r.deadlineStop).length,p50:times[Math.floor((times.length-1)*.5)],p95:times[Math.floor((times.length-1)*.95)],max:times.at(-1),meanDepth:rows.reduce((a,r)=>a+r.depth,0)/rows.length};}
const n=result.games.length,wins=result.games.filter(g=>g.result.winner===g.candidateSide).length,draws=result.games.filter(g=>!g.result.winner).length,losses=n-wins-draws;
const wilson=(k,n)=>{let z=1.96,p=k/n,d=1+z*z/n,m=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return[Math.max(0,m-h),Math.min(1,m+h)];};
result.summary={games:n,wins,draws,losses,scoreRate:(wins+draws*.5)/n,winRateWilson95:wilson(wins,n),technicalForfeits:result.games.filter(g=>g.result.technicalForfeit).length,timing:{candidate:stats('candidate'),baseline:stats('baseline')},note:'固定少量布局换色相关，不能推出长期胜率/Elo；所有技术负均纳入结果，未排除不利局。'};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));
