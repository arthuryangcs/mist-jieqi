import {writeFile} from 'node:fs/promises';import {initial,publicState,legalMoves,move,positionKey} from '../engine.js';
import {analyze as current,values} from '../ai.js';import {analyze as legacy} from '../benchmarks/reference-ai.js';import {seeded} from './diagnose.js';
const budget=150,games=[],suspects=[];
for(let seed of [211,419])for(let newSide of ['r','b']){
 let s=initial(seeded(seed)),log=[],seen=new Map();
 for(let ply=0;ply<400&&!s.result;ply++){
  let view=publicState(s),isNew=s.turn===newSide,search=isNew?current:legacy,decisionSeed=seed*1000+ply;
  let knownWins=legalMoves(view).filter(m=>!view.board[m.from].hidden&&move(view,m).result?.winner===s.turn);
  let progress=[];let r=search(view,{timeMs:budget,rng:seeded(decisionSeed),onProgress:x=>progress.push({depth:x.depth,elapsedMs:x.elapsedMs})});
  if(!legalMoves(s).some(m=>m.from===r.move?.from&&m.to===r.move?.to))throw Error('非法着法');
  let p=s.board[r.move.from],q=s.board[r.move.to],next=move(s,r.move),flags=[];
  if(knownWins.length&&!knownWins.some(m=>m.from===r.move.from&&m.to===r.move.to)&&next.result?.winner!==s.turn)flags.push('漏掉公开可证的一步制胜');
  if(q&&!q.hidden&&values[q.type]>=420)flags.push('公开大子被吃（需区分交换/弃子）');
  let previous=log.at(-2);if(previous&&Math.abs(r.score-previous.score)>900)flags.push('同方评分变化超过900分');
  let key=positionKey(next),repeated=(seen.get(key)||0)+1;seen.set(key,repeated);if(repeated>1)flags.push('局面重复');
  let item={ply:ply+1,side:s.turn,engine:isNew?'new':'old',decisionSeed,budgetMs:budget,move:r.move,score:r.score,winRate:r.heuristicWinRate??null,depth:r.depth,nodes:r.nodes,samples:r.samples,elapsedMs:r.elapsedMs,firstResultMs:progress[0]?.elapsedMs??null,reveal:p.hidden?next.board[r.move.to].type:null,capture:q?(q.hidden?'unknown':q.type):null,flags};
  log.push(item);if(flags.length)suspects.push({game:games.length,seed,newSide,...item,view});s=next;
  if(ply%40===39)console.log(`seed ${seed} new ${newSide}: ${ply+1} plies`);
 }
 games.push({seed,newSide,budgetMs:budget,result:s.result,plies:log.length,log});console.log(JSON.stringify({seed,newSide,result:s.result,plies:log.length}));
 await writeFile('benchmarks/matches.json',JSON.stringify({budgetMs:budget,games,suspectCount:suspects.length,note:'固定真实布子和逐步采样种子；限时截断会受硬件影响，4局不构成棋力评级。'},null,2));
}
let review=[];const chosen=suspects.filter(x=>x.flags.some(f=>f.includes('漏掉')||f.includes('评分'))).slice(0,4).concat(suspects.filter(x=>x.flags.some(f=>f.includes('大子'))).slice(0,4));
for(let x of chosen){let r=current(x.view,{timeMs:1000,rng:seeded(x.decisionSeed)}),oldChoice=r.allCandidates?.find(m=>m.from===x.move.from&&m.to===x.move.to);review.push({...x,recheck:{move:r.move,score:r.score,depth:r.depth,nodes:r.nodes,samples:r.samples,elapsedMs:r.elapsedMs,originalMoveScore:oldChoice?.score??null,regret:oldChoice?r.score-oldChoice.score:null,candidates:r.candidates},classification:x.reveal?'本步有真实揭子；评分变化包含新信息，不能直接判为错误':'无本步揭子；比较更深搜索，但有限深度仍非最优解证明'});}
await writeFile('benchmarks/reviews.json',JSON.stringify({suspects:suspects.map(({view,...rest})=>rest),review},null,2));
console.log('match and review complete');
