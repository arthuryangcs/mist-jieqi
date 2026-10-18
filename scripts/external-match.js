import {writeFile}from'node:fs/promises';
import {initial,publicState,legalMoves,move,other}from'../engine.js';
import {seeded}from'../ai.js';
import {ExternalEngine,fen,coordinate}from'./external-engine.js';
import {NodeSearchEngine}from'./node-search-engine.js';
const budget=Number(process.env.JIEQI_MATCH_BUDGET||200),grace=60;
const seeds=(process.env.JIEQI_MATCH_SEEDS||'733,887,947,1021').split(',').map(Number);
const games=[],output=process.env.JIEQI_MATCH_OUTPUT||'benchmarks/external-matches.json';
let result={opponent:process.env.JIEQI_OPPONENT||'official-pikafish/Pikafish jieqi_old',commit:process.env.JIEQI_COMMIT||'23b9466c981f0f3a1133f92de1a6f86406c4eccc',threads:1,hashMB:16,budgetMs:budget,graceMs:grace,cutoffMs:budget+grace,timingProtocol:'Both: public input dispatch through accepted legal answer, including transport/position setup; module/process initialization before the clock, recorded separately. JS host watchdog returns only last complete legal iteration or legal fallback. Any answer later than cutoff is a technical loss.',variant:'双方均不知道被吃暗子身份，明士象全盘；本项目规则裁判',input:'初始公开FEN和公开着法/揭子历史；没有传入真实暗子布局或未知吃子身份',games};
for(let seed of seeds)for(let jsSide of ['r','b']){
 let e=new ExternalEngine(),js=new NodeSearchEngine(),s=initial(seeded(seed)),initialFen=fen(publicState(s)),history=[],log=[],end=null,active='JS',nativeInitMs=0;
 try{
  await js.ready();active='PikaJieQi';let init=performance.now();await e.init();nativeInitMs=Math.round(performance.now()-init);
  for(let ply=0;ply<400&&!s.result;ply++){
   let view=publicState(s),isJS=s.turn===jsSide;active=isJS?'JS':'PikaJieQi';
   let r=isJS?await js.search(view,budget):await e.search(initialFen,history,budget);
   let measurement={ply:ply+1,side:s.turn,engine:active,move:r.move,elapsedMs:r.elapsedMs,searchElapsedMs:r.searchElapsedMs??null,dispatchMs:r.dispatchMs??null,hostPreparationMs:r.hostPreparationMs??null,firstProgressMs:r.firstProgressMs??null,deadlineStop:r.deadlineStop||false,fallbackUsed:r.fallbackUsed||false,depth:r.depth??null,nodes:r.nodes??null,score:r.score??null,info:r.lines??null};
   if(r.elapsedMs>budget+grace){end={winner:other(s.turn),text:'超过相同墙钟预算与宽限，技术负',timingForfeit:true,technicalForfeit:true,offender:active,measurement};break;}
   if(!legalMoves(view).some(m=>m.from===r.move?.from&&m.to===r.move?.to)){end={winner:other(s.turn),text:'非法或不兼容着法，技术负',technicalForfeit:true,invalidMove:r.move,offender:active,measurement};break;}
   let p=s.board[r.move.from],q=s.board[r.move.to],next=move(s,r.move),reveal=p.hidden?next.board[r.move.to].type:null,token=coordinate(r.move.from)+coordinate(r.move.to)+(reveal?(p.side==='r'?reveal:reveal.toLowerCase()):'');history.push(token);
   log.push({...measurement,token,reveal,capture:q?(q.hidden?'unknown':q.type):null});s=next;
   if(ply%40===39)console.log(`external seed ${seed} JS ${jsSide}: ${ply+1}`);
  }
  end??=s.result||{winner:null,text:'截断，未完成',truncated:true};
 }catch(error){end={winner:active==='JS'?other(jsSide):jsSide,text:'执行/通信失败，技术负',technicalForfeit:true,offender:active,error:error.message};}
 finally{e.close();await js.close();}
 games.push({seed,jsSide,initialFen,initializationMs:{JS:js.initializations,PikaJieQi:nativeInitMs},history,plies:log.length,result:end,log});
 console.log(JSON.stringify({seed,jsSide,plies:log.length,result:end}));await writeFile(output,JSON.stringify(result,null,2)+'\n');
}
function wilson(k,n){if(!n)return null;let z=1.96,p=k/n,den=1+z*z/n,mid=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return [Math.max(0,mid-half),Math.min(1,mid+half)];}
function latency(engine){let a=games.flatMap(g=>g.log.concat(g.result.measurement?[g.result.measurement]:[])).filter(x=>x.engine===engine).map(x=>x.elapsedMs).sort((a,b)=>a-b);return {moves:a.length,p50:a[Math.floor((a.length-1)*.5)],p95:a[Math.floor((a.length-1)*.95)],max:a.at(-1),overCutoff:a.filter(t=>t>budget+grace).length};}
let wins=games.filter(g=>g.result.winner===g.jsSide).length,draws=games.filter(g=>!g.result.winner&&!g.result.truncated).length,losses=games.length-wins-draws,n=games.length,score=(wins+.5*draws)/n;
result.summary={total:n,wins,draws,losses,winRate:wins/n,scoreRate:score,technicalLossesJS:games.filter(g=>g.result.technicalForfeit&&g.result.offender==='JS').length,technicalLossesOpponent:games.filter(g=>g.result.technicalForfeit&&g.result.offender==='PikaJieQi').length,normalChessLossesJS:games.filter(g=>!g.result.technicalForfeit&&g.result.winner&&g.result.winner!==g.jsSide).length,truncated:games.filter(g=>g.result.truncated).length,winRateWilson95:wilson(wins,n),scoreRateConservative95:[wilson(wins,n)[0],wilson(wins+draws,n)[1]],latency:{JS:latency('JS'),PikaJieQi:latency('PikaJieQi')},deadlineStops:games.flatMap(g=>g.log).filter(x=>x.engine==='JS'&&x.deadlineStop).length,fallbackMoves:games.flatMap(g=>g.log).filter(x=>x.engine==='JS'&&x.fallbackUsed).length,note:'所有技术负纳入总胜和负与得分率，不排除。有限换色配对样本有相关性；Wilson/保守区间仅作描述性近似，不是可靠长期胜率或Elo。'};
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(result.summary);
