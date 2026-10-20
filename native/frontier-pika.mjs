import fs from'node:fs';import assert from'node:assert/strict';import{execFileSync}from'node:child_process';
import{initial,publicState,legalMoves,move,positionKey,other}from'../engine.js';import{seeded}from'../ai.js';
import{PikaEngine}from'../scripts/native-match-engine.mjs';import{fen,observationToken}from'../scripts/external-engine.js';
import{FocusEngine}from'./focus-engine.mjs';import{originalBuild,compileFocus,dir,sha}from'./frontier-variants.mjs';
const variant=process.argv[2]||'combined',mode=process.argv[3]||'freeze',file=`${dir}/pika-${variant}.json`,hash=p=>sha(fs.readFileSync(p));assert(['coverage','cap','combined'].includes(variant));
const opponent=process.env.JIEQI_ENGINE_PATH;assert(opponent,'Use only the already approved fixed opponent path');assert.equal(hash(opponent),'f32d3c6dfe4d6d90da7728d9cc2af68c3195a1cefb1bc28f3829f174c518dba1');
assert.equal(execFileSync('git',['-C','external/pikafish-jieqi-wasm','rev-parse','HEAD'],{encoding:'utf8'}).trim(),'bcc83f88ee18760e60903d1a3aaa61ef6f70f2c9');
const summary=gs=>{const wins=gs.filter(g=>g.result.winner===g.candidateSide).length,draws=gs.filter(g=>g.result.status==='draw').length,unresolved=gs.filter(g=>g.result.status==='unresolved').length;return{games:gs.length,wins,draws,losses:gs.length-wins-draws-unresolved,unresolved,scoreRate:unresolved?null:(wins+.5*draws)/gs.length,technical:gs.filter(g=>g.result.technicalForfeit).map(g=>({seed:g.seed,candidateSide:g.candidateSide,engine:g.engine,...g.result}))};};
if(mode==='freeze'){
 assert(!fs.existsSync(file),'Never overwrite a frozen Pika validation');const normal=JSON.parse(fs.readFileSync(`${dir}/check-${variant}-release${variant==='root'?'-v5':''}.json`));assert(normal.passed);
 const seeds=[20011,20021,20023,20029],builds=[originalBuild(),compileFocus(variant)],sources=['native/frontier-pika.mjs','native/frontier-variants.mjs','native/frontier-policy.inc','native/focus-engine.mjs','native/focus-variants.mjs','native/focus-policy.inc','native/focus-tactics.inc','native/bridge.mjs','scripts/native-match-engine.mjs','scripts/external-engine.js','engine.js','ai.js'];
 const r={createdAt:new Date().toISOString(),variant,builds,seeds,budgetMs:1000,graceMs:60,maxPlies:400,initials:seeds.map(seed=>({seed,trueInitialBoard:initial(seeded(seed)).board})),sourceHashes:Object.fromEntries(sources.map(p=>[p,hash(p)])),
  opponent:{commit:'bcc83f88ee18760e60903d1a3aaa61ef6f70f2c9',binarySha256:hash(opponent),threads:4,hashMiB:64,moveOverheadMs:0,eval:'Previously approved unchanged HCE USE_NNUEEVAL=0',limitation:'Known color-evaluation asymmetry retained; no repair/exclusion.'},
  config:{samples:8,threads:4,ttEntriesPerWorld:90000,brightSamples:1,maxDepth:8,
   clock:'Both process readiness outside clock; projection, sampling, protocol/FEN verification, IPC/search, stop/reap inside.1000ms plus common60ms grace.',
   order:'Baseline and candidate interleaved for each layout/color, order rotated; no overlapping searches by this script. Other applications/scheduling not controlled.',
   information:'Only moving side publicState with captor-private dark captures. Real initial seed/allocation stays in referee. Pika board/turn/inventory checked each turn.',
   draws:'Public threefold/120 quiet plies;400 ply cap unresolved; no score adjudication.',
   inference:'Four paired layouts per implementation. No stable Elo, no claim of exceeding Pika from small samples; focused depth is not comparable to full-root or UCI depth.'},games:[]};fs.writeFileSync(file,JSON.stringify(r)+'\n');console.log(JSON.stringify({frozen:true,variant,seeds,games:16}));
}else if(mode==='run'){
 const r=JSON.parse(fs.readFileSync(file)),persist=()=>fs.writeFileSync(file,JSON.stringify(r)+'\n');for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(hash(p),h,p);for(const b of r.builds)assert.equal(hash(b.binary),b.binarySha256);
 for(const [seedIndex,seed]of r.seeds.entries())for(const [sideIndex,candidateSide]of['r','b'].entries())for(const engine of (seedIndex+sideIndex)%2?['trial','baseline']:['baseline','trial']){
  if(r.games.some(g=>g.seed===seed&&g.candidateSide===candidateSide&&g.engine===engine))continue;
  const build=r.builds[engine==='trial'?1:0],candidate=new FocusEngine({binary:build.binary,focused:engine==='trial'}),pika=new PikaEngine(),g={seed,candidateSide,engine,startedAt:new Date().toISOString(),log:[]};let active='candidate';
  let s=initial(seeded(seed));s.positions=[positionKey(s)];assert.deepEqual(s.board,r.initials.find(x=>x.seed===seed).trueInitialBoard);const initialFen=fen(publicState(s)),journal=[];
  try{
   await candidate.ready();active='pika';await pika.init();g.initializations={candidate:candidate.initializations,pikaMs:pika.initializationMs};
   while(!s.result&&s.ply<r.maxPlies){
    active=s.turn===candidateSide?'candidate':'pika';if(active==='candidate')await candidate.ready();const start=performance.now(),view=publicState(s,s.turn);for(const p of[...view.board,...view.captured])assert(!p?.hidden||!('type'in p));
    const budget=Math.max(1,Math.floor(r.budgetMs-(performance.now()-start))),x=active==='candidate'?await candidate.search(view,budget):await pika.search(initialFen,journal,budget,fen(view)),elapsedMs=performance.now()-start;
    const ms=legalMoves(view),legal=ms.some(m=>m.from===x.move?.from&&m.to===x.move?.to);
    const row={ply:s.ply+1,side:s.turn,engine:active,move:x.move,elapsedMs,depth:x.depth??null,nodes:x.nodes??null,score:x.score??null,rootCount:x.rootCount??null,comparedCount:x.comparedCount??null,fullRootDepth:x.fullRootDepth??null,searchScope:x.searchScope??null,criticalRoot:x.criticalRoot,tacticalSearch:x.tacticalSearch,quietChecks:x.quietChecksSearched,reintroduced:x.reintroducedCount,minimumComparisonRoots:x.minimumComparisonRoots,coverageRefreshes:x.coverageRefreshes,capFillRoots:x.capFillRoots,threads:x.threads??4,deadlineStop:!!x.deadlineStop,fallbackUsed:!!x.fallbackUsed,clock:x.clock,verificationMs:x.verificationMs,viewSha256:sha(JSON.stringify(view)),visibleFen:fen(view),pikaInfo:active==='pika'?x.lines.filter(l=>l.startsWith('info depth')).slice(-1):null};
    if(!legal||elapsedMs>r.budgetMs+r.graceMs){g.log.push(row);g.result={status:'decided',winner:other(s.turn),technicalForfeit:true,offender:active,reason:!legal?'illegal-move':'technical-timeout'};break;}
    const p=s.board[row.move.from],q=s.board[row.move.to],n=move(s,row.move),token=observationToken(s,row.move,n,other(candidateSide));journal.push(token);g.log.push({...row,revealed:p.hidden?n.board[row.move.to].type:null,captured:q,pikaToken:token,afterSha256:sha(JSON.stringify(n.board))});s=n;
    fs.writeFileSync(`${dir}/pika-live.json`,JSON.stringify({variant,seed,candidateSide,engine,ply:s.ply,completed:r.games.length,last:row})+'\n');
   }
   if(!g.result)g.result=s.result?.winner?{status:'decided',winner:s.result.winner,reason:s.result.text,technicalForfeit:false}:s.ply>=400?{status:'unresolved',winner:null,reason:'400-ply-cap',technicalForfeit:false}:{status:'draw',winner:null,reason:s.quiet>=120?'120-quiet-plies':'threefold-public-position',technicalForfeit:false};
  }catch(e){g.result={status:'decided',winner:active==='candidate'?other(candidateSide):candidateSide,technicalForfeit:true,offender:active,reason:'process-or-protocol-failure',error:e.stack};}
  finally{await candidate.close();await pika.stopAndClose();}
  g.finalState=s;g.finishedAt=new Date().toISOString();r.games.push(g);r.summary=Object.fromEntries(['baseline','trial'].map(name=>[name,summary(r.games.filter(g=>g.engine===name))]));persist();console.log(JSON.stringify({variant,seed,candidateSide,engine,plies:s.ply,result:g.result,summary:r.summary}));
 }
 r.completedAt=new Date().toISOString();persist();if(fs.existsSync(`${dir}/pika-live.json`))fs.unlinkSync(`${dir}/pika-live.json`);
}else throw Error('Use freeze or run');
