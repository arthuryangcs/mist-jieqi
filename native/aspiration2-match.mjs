import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {initial,publicState,legalMoves,move,positionKey,other} from '../engine.js';import {seeded} from '../ai.js';
import {Native} from './bridge.mjs';import {CandidateEngine,PikaEngine} from '../scripts/native-match-engine.mjs';import {fen,observationToken} from '../scripts/external-engine.js';
const dir='benchmarks/aspiration2',file=`${dir}/pika-matches.json`,mode=process.argv[2]||'run',variant='refreshLookup';
const sha=x=>createHash('sha256').update(x).digest('hex'),hash=p=>sha(fs.readFileSync(p)),read=p=>JSON.parse(fs.readFileSync(p));
const opponentBinary=process.env.JIEQI_ENGINE_PATH,opponentSha='f32d3c6dfe4d6d90da7728d9cc2af68c3195a1cefb1bc28f3829f174c518dba1';
assert(opponentBinary&&hash(opponentBinary)===opponentSha,'Only the previously approved fixed Pika binary is allowed');
assert.equal(execFileSync('git',['-C','external/pikafish-jieqi-wasm','rev-parse','HEAD'],{encoding:'utf8'}).trim(),'bcc83f88ee18760e60903d1a3aaa61ef6f70f2c9');
const candidateBinary=fs.realpathSync('.cache/native/mist-core');
class Candidate extends CandidateEngine {
 async ready(){if(this.native)return;const n=new Native({binary:candidateBinary});n.exited=new Promise(resolve=>n.process.once('exit',resolve));this.native=n;await n.ready;this.initializations.push(n.initializationMs);}
}
function summary(games){const stat=gs=>{const wins=gs.filter(g=>g.result.winner===g.candidateSide).length,draws=gs.filter(g=>g.result.status==='draw').length,losses=gs.filter(g=>g.result.winner===other(g.candidateSide)).length,unresolved=gs.length-wins-draws-losses;return{games:gs.length,wins,draws,losses,unresolved,winRate:wins/gs.length,scoreRate:unresolved?null:(wins+.5*draws)/gs.length};};return {overall:stat(games),red:stat(games.filter(g=>g.candidateSide==='r')),black:stat(games.filter(g=>g.candidateSide==='b'))};}
if(mode==='freeze'){
 assert(!fs.existsSync(file),'Do not overwrite frozen match record');
 for(const name of [`check-${variant}-release`,`check-${variant}-asan`,`check-${variant}-tsan`,'lookup','lookupsaturated','lookupbudgets','watchdog','production-native','production-sanitized','production-service','production-deep-reference','unit','browser/results'])assert(read(`${dir}/${name}.json`).passed,name);
 const med=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)],fixed=read(`${dir}/lookup.json`),full=read(`${dir}/lookupsaturated.json`);
 const ratios=fixed.fixtures.map(p=>{const rows=fixed.rows.filter(r=>r.position===p.name);return med(rows.map(r=>r.results[variant].elapsedMs))/med(rows.map(r=>r.results.baseline.elapsedMs));});
 assert(Math.max(...ratios)<1.05);assert(Math.exp(ratios.reduce((s,v)=>s+Math.log(v),0)/ratios.length)<1.02);
 assert(full.rows.some(r=>r.results[variant].nodes<r.results.baseline.nodes*.8));
 for(const r of read(`${dir}/lookupbudgets.json`).rows)assert(r.results[variant].depth>=r.results.baseline.depth);
 const build=read('.cache/native/build.json'),prototype=read(`.cache/aspiration2/${variant}.json`);
 assert.equal(hash(candidateBinary),build.binarySha256);assert.equal(hash('native/search.cpp'),build.sourceSha256);assert.equal(build.sourceSha256,prototype.sourceSha256);
 fs.copyFileSync('native/search.cpp',`${dir}/candidate.cpp`);
 const seeds=[11003,11027,11047,11057],sources=['native/aspiration2-match.mjs','native/aspiration2-variants.mjs','native/bridge.mjs','scripts/native-match-engine.mjs','scripts/external-engine.js','engine.js','ai.js',`${dir}/candidate.cpp`,`${dir}/baseline.cpp`];
 const record={createdAt:new Date().toISOString(),baselineCommit:'93f617e',variant,build:{...build,binary:undefined},
  opponent:{commit:'bcc83f88ee18760e60903d1a3aaa61ef6f70f2c9',binarySha256:opponentSha,threads:4,hashMiB:64,moveOverheadMs:0,eval:'Existing approved unchanged HCE; USE_NNUEEVAL=0',knownLimitation:'Previously reproduced color-evaluation asymmetry; no repair or exclusion.'},
  budgetMs:1000,graceMs:60,maxPlies:400,seeds,sourceHashes:Object.fromEntries(sources.map(p=>[p,hash(p)])),
  config:{candidateThreads:4,samples:8,fullInformationSamples:1,ttEntriesPerWorld:90000,maxDepth:8,
    clock:'Process readiness outside clock; view projection, sampling, position verification, IPC, search, stop and reap inside clock for both. No simultaneous performance tests.',
    information:'Current player publicState only; captured hidden identity visible solely to captor. True setup seeds never sent to engines.',
    draws:'Threefold public board/turn or120 quiet plies. 400 ply cap reported unresolved.',
    uncertainty:'Only4 paired layouts at one budget. New seeds differ from prior baseline Pika20, so no causal win-rate delta or Elo claim.'},
  initials:seeds.map(seed=>{const s=initial(seeded(seed));s.positions=[positionKey(s)];return{seed,trueInitialBoard:s.board};}),games:[]};fs.writeFileSync(file,JSON.stringify(record)+'\n');console.log(JSON.stringify({frozen:true,seeds,variant,budgetMs:1000}));
}else if(mode==='run'){
 const r=read(file),persist=()=>fs.writeFileSync(file,JSON.stringify(r)+'\n');
 for(const [p,h]of Object.entries(r.sourceHashes))assert.equal(hash(p),h,'Frozen source changed: '+p);assert.equal(hash(candidateBinary),r.build.binarySha256);
 for(const seed of r.seeds)for(const candidateSide of ['r','b']){
  if(r.games.some(g=>g.seed===seed&&g.candidateSide===candidateSide))continue;
  const candidate=new Candidate(),pika=new PikaEngine(),game={seed,candidateSide,startedAt:new Date().toISOString(),log:[]};
  let s=initial(seeded(seed));s.positions=[positionKey(s)];assert.deepEqual(s.board,r.initials.find(x=>x.seed===seed).trueInitialBoard);
  const initialFen=fen(publicState(s)),journal=[];let active='candidate';
  try{
   await candidate.ready();active='pika';await pika.init();game.initializations={candidateMs:candidate.initializations,pikaMs:pika.initializationMs};
   while(!s.result&&s.ply<r.maxPlies){
    active=s.turn===candidateSide?'candidate':'pika';if(active==='candidate')await candidate.ready();
    const start=performance.now(),view=publicState(s,s.turn);for(const p of [...view.board,...view.captured])assert(!p?.hidden||!('type'in p));
    const prepMs=performance.now()-start,budget=Math.max(1,Math.floor(r.budgetMs-prepMs));
    const response=active==='candidate'?await candidate.search(view,budget):await pika.search(initialFen,journal,budget,fen(view));
    const elapsedMs=performance.now()-start,legal=legalMoves(view).some(m=>m.from===response.move?.from&&m.to===response.move?.to);
    const row={ply:s.ply+1,side:s.turn,engine:active,move:response.move,elapsedMs,depth:response.depth??null,nodes:response.nodes??null,score:response.score??null,
      threads:response.threads??4,deadlineStop:!!response.deadlineStop,fallbackUsed:!!response.fallbackUsed,verificationMs:response.verificationMs??null,nativeBudgetMs:response.nativeBudgetMs??null,
      viewSha256:sha(JSON.stringify(view)),visibleFen:fen(view),pikaInfo:active==='pika'?response.lines.filter(x=>x.startsWith('info depth')).slice(-1):null};
    if(!legal||elapsedMs>r.budgetMs+r.graceMs){game.log.push(row);game.result={status:'decided',winner:other(s.turn),technicalForfeit:true,offender:active,reason:!legal?'illegal-move':'technical-timeout'};break;}
    const p=s.board[response.move.from],q=s.board[response.move.to],next=move(s,response.move),token=observationToken(s,response.move,next,other(candidateSide));journal.push(token);
    game.log.push({...row,revealed:p.hidden?next.board[response.move.to].type:null,captured:q,pikaToken:token,positionAfterSha256:sha(JSON.stringify(next.board))});s=next;
    fs.writeFileSync(`${dir}/pika-live.json`,JSON.stringify({seed,candidateSide,ply:s.ply,completed:r.games.length,last:row})+'\n');
   }
   if(!game.result)game.result=s.result?.winner?{status:'decided',winner:s.result.winner,reason:s.result.text,technicalForfeit:false}:s.ply>=400?{status:'unresolved',winner:null,reason:'400-ply-cap',technicalForfeit:false}:{status:'draw',winner:null,reason:s.quiet>=120?'120-quiet-plies':'threefold-public-position',technicalForfeit:false};
  }catch(e){game.result={status:'decided',winner:active==='candidate'?other(candidateSide):candidateSide,reason:'protocol-or-process-failure',technicalForfeit:true,offender:active,error:e.stack};}
  finally{await candidate.close();await pika.stopAndClose();}
  game.finalState=s;game.plies=s.ply;game.finishedAt=new Date().toISOString();r.games.push(game);r.summary=summary(r.games);persist();console.log(JSON.stringify({seed,candidateSide,plies:s.ply,result:game.result,summary:r.summary.overall}));
 }
 r.completedAt=new Date().toISOString();persist();
}else throw Error('Unknown mode');
