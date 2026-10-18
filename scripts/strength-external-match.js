import fs from 'node:fs';import{createHash}from'node:crypto';
import{initial,publicState,legalMoves,move,other,positionKey}from'../engine.js';import{seeded}from'../ai.js';import{NodeSearchEngine}from'./node-search-engine.js';import{ExternalEngine,fen,observationToken}from'./external-engine.js';
const seeds=(process.env.JIEQI_EXTERNAL_SEEDS||'2237,2269').split(',').map(Number),variants=(process.env.JIEQI_EXTERNAL_VARIANTS||'baseline,candidate').split(','),budget=Number(process.env.JIEQI_EXTERNAL_BUDGET||250),grace=60,output=process.env.JIEQI_EXTERNAL_OUTPUT||'benchmarks/strength-external-replay.json',enginePath=process.env.JIEQI_ENGINE_PATH;
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const expectedBinary='f32d3c6dfe4d6d90da7728d9cc2af68c3195a1cefb1bc28f3829f174c518dba1';
if(!enginePath||sha(enginePath)!==expectedBinary)throw Error('只允许运行已经审计并获准的bcc83f88本机构建');
const result={engine:'brianhliou/pikafish-jieqi-wasm',commit:'bcc83f88ee18760e60903d1a3aaa61ef6f70f2c9',binarySha256:expectedBinary,variant:'被吃暗子仅吃子方可见；本项目共同规则裁判',budgetMs:budget,graceMs:grace,seeds,variants,sourceHashes:{candidate:sha('ai.js'),baseline:sha('benchmarks/strength-baseline-ai.js')},runtime:process.version,transportHashes:Object.fromEntries(['deadline-search.js','worker.js','scripts/node-search-worker.js','scripts/node-search-engine.js','scripts/external-engine.js'].map(p=>[p,sha(p)])),protocol:'初始全暗公开FEN + 观察方专属6字符历史。逐个外部引擎根节点核对棋盘/行棋方/库存，验证及IPC都计入墙钟，go预算扣除协议验证耗时。外部引擎内部HCE/restPieces近似保持原样，不宣称完整双方信念模型。',games:[]};
for(const version of variants)for(const seed of seeds)for(const jsSide of ['r','b']){
 if(sha('ai.js')!==result.sourceHashes.candidate)throw Error('比赛期间候选源码改变');
 if(!['baseline','candidate'].includes(version))throw Error('invalid version');
 const js=new NodeSearchEngine(version==='baseline'?{moduleUrl:new URL('../benchmarks/strength-baseline-ai.js',import.meta.url).href}:{}),native=new ExternalEngine(),nativeSide=other(jsSide),journal=[],log=[];let s=initial(seeded(seed));s.positions=[positionKey(s)];const initialFen=fen(publicState(s));let outcome,active=version;
 try{
  await js.ready();active='native';await native.init();
  while(!s.result&&s.ply<400){
   const view=publicState(s,s.turn),isJS=s.turn===jsSide;active=isJS?version:'native';for(const p of [...view.board,...view.captured])if(p?.hidden&&'type'in p)throw Error('观察信息泄露');
   const r=isJS?await js.search(view,budget):await native.search(initialFen,journal,budget,fen(view));const legal=legalMoves(view).some(m=>m.from===r.move?.from&&m.to===r.move?.to);
   const row={ply:s.ply+1,side:s.turn,engine:active,move:r.move,elapsedMs:r.elapsedMs,searchElapsedMs:r.searchElapsedMs??null,verificationMs:r.verificationMs??null,nativeBudgetMs:r.nativeBudgetMs??null,depth:r.depth??null,nodes:r.nodes??null,score:r.score??null,fallback:r.fallbackUsed||false,deadlineStop:r.deadlineStop||false,knownDark:view.captured.filter(p=>p.wasHidden).length};
   if(r.elapsedMs>budget+grace||!legal){outcome={winner:other(s.turn),text:legal?'超时技术负':'非法着法技术负',technicalForfeit:true,offender:active};log.push(row);break;}
   const p=s.board[r.move.from],q=s.board[r.move.to],n=move(s,r.move);journal.push(observationToken(s,r.move,n,nativeSide));log.push({...row,reveal:p.hidden?n.board[r.move.to].type:null,capture:q?(q.hidden?'dark':q.type):null,observerToken:journal.at(-1)});s=n;
  }
  outcome??=s.result||{winner:null,text:'400步上限和棋'};
 }catch(error){outcome={winner:active==='native'?jsSide:nativeSide,text:'协议/执行异常技术负',technicalForfeit:true,offender:active,error:error.message};}
 finally{native.close();await js.close();}
 result.games.push({version,seed,jsSide,plies:log.length,result:outcome,log});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({version,seed,jsSide,plies:log.length,result:outcome}));
}
result.summary={};for(const version of variants){const games=result.games.filter(g=>g.version===version),wins=games.filter(g=>g.result.winner===g.jsSide).length,draws=games.filter(g=>!g.result.winner).length,rows=games.flatMap(g=>g.log).filter(r=>r.engine===version),times=rows.map(r=>r.elapsedMs).sort((a,b)=>a-b);result.summary[version]={games:games.length,wins,draws,losses:games.length-wins-draws,scoreRate:(wins+.5*draws)/games.length,technicalForfeits:games.filter(g=>g.result.technicalForfeit).length,jsTechnicalLosses:games.filter(g=>g.result.technicalForfeit&&g.result.offender===version).length,nativeTechnicalLosses:games.filter(g=>g.result.technicalForfeit&&g.result.offender==='native').length,moves:rows.length,fallbacks:rows.filter(r=>r.fallback).length,p95:times[Math.floor((times.length-1)*.95)],max:times.at(-1)};}
result.note='所有技术负纳入成绩，无排除；仅两对布局各4局，不能据此推断长期胜率或Elo。外部源码/二进制不分发。';fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));
