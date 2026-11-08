// Finite, predeclared 2-second paired screen. Never runs training concurrently.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {initial,publicState,positionKey,legalMoves,move,other} from '../../../engine.js';
import {seeded} from '../../../ai.js';
import {StableEngine} from '../search-speed/stable-client.mjs';
import {FourThreadPika,pikaCommit,pikaHash,verifyPika,canonicalFen,observationToken,assertObservation,fen} from '../search-speed/pika.mjs';
import {safeRoots} from '../coverage-validation/common.mjs';
import {cache,dir,modelFile,hash,sha,sourceOf} from './build.mjs';
import {lawfulView} from './data.mjs';
const file=cache+'/matches.json',mode=process.argv[2]??'status';
const plan=JSON.parse(fs.readFileSync('native/experiments/selfplay-value/plan.json')),config=plan.matches;
const control=path.resolve(cache+'/control'),candidate=path.resolve(cache+'/candidate');
process.env.MIST_NNUE_MODEL=modelFile;delete process.env.MIST_NNUE_FULL;
const publicCapture=p=>p?{side:p.side,hidden:p.hidden,...(!p.hidden?{type:p.type}:{})}:null;
function write(r){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(r)+'\n');fs.renameSync(temp,file);}
function results(games){return Object.fromEntries(['internal','candidatePika','controlPika'].map(group=>{
 const a=games.filter(g=>g.group===group&&g.result),decided=a.filter(g=>g.result.status!=='unresolved');
 const count=xs=>({wins:xs.filter(g=>g.result.winner===g.candidateSide).length,draws:xs.filter(g=>g.result.status==='draw').length,losses:xs.filter(g=>g.result.winner&&g.result.winner!==g.candidateSide).length});
 const c=count(decided);return[group,{finished:a.length,...c,technicalFailures:a.filter(g=>g.result.technicalForfeit).length,unresolved:a.length-decided.length,scoreRate:a.length===decided.length&&a.length?(c.wins+.5*c.draws)/a.length:null,normal:count(decided.filter(g=>!g.result.technicalForfeit))}];}));}
function tasksForPlan(){const tasks=[];for(const [i,seed]of config.seeds.entries())for(const candidateSide of['r','b'])for(const group of i%2?['controlPika','candidatePika','internal']:['internal','candidatePika','controlPika'])tasks.push({seed,candidateSide,group,kind:group==='internal'?'stable':'pika',candidateName:group==='controlPika'?'control':'candidate'});return tasks;}
function verify(r){verifyPika();for(const [p,h]of Object.entries(r.hashes))assert.equal(hash(p),h,p);assert.deepEqual(r.tasks,tasksForPlan());assert.equal(r.games.length,new Set(r.games.map(g=>g.index)).size);for(const g of r.games){assert(r.tasks[g.index]);for(const [k,v]of Object.entries(r.tasks[g.index]))assert.equal(g[k],v,k);}assert.deepEqual(r.summary,results(r.games));for(const k of['budgetMs','graceMs','maxPlies'])assert.equal(r[k],config[k]);}

function replay(g){
 let s=initial(seeded(g.seed));s.positions=[positionKey(s)];const pikaSide=other(g.candidateSide);
 for(const [i,row]of g.log.entries()){
  assert(!s.result,'post-terminal move');const view=assertObservation(lawfulView(s,s.turn));assert.equal(row.ply,s.ply+1);assert.equal(row.side,s.turn);assert.equal(row.viewSha256,sha(JSON.stringify(view)));assert.equal(row.visibleFen,fen(view));
  if(!row.applied){assert.equal(i,g.log.length-1);assert(g.result?.technicalForfeit);continue;}
  assert(legalMoves(s).some(m=>m.from===row.move.from&&m.to===row.move.to));const p=s.board[row.move.from],q=s.board[row.move.to],next=move(s,row.move);
  assert.equal(row.revealed,p.hidden?next.board[row.move.to].type:null);assert.deepEqual(row.capturedPublic,publicCapture(q));assert.equal(row.afterSha256,sha(JSON.stringify(next.board)));
  assert.equal(row.pikaToken,g.kind==='pika'?observationToken(lawfulView(s,pikaSide),row.move,lawfulView(next,pikaSide),pikaSide):null);s=next;
 }
 if(g.result&&!g.result.technicalForfeit)assert.deepEqual(g.result,adjudicate(s));if(g.plies!==undefined)assert.equal(g.plies,s.ply);return s;
}
function adjudicate(s){if(s.result?.winner)return{status:'decided',winner:s.result.winner,technicalForfeit:false,reason:s.result.text};if(s.quiet>=120)return{status:'draw',winner:null,technicalForfeit:false,reason:'120-quiet-plies'};assert(s.ply>=config.maxPlies);return{status:'unresolved',winner:null,technicalForfeit:false,reason:'400-ply-cap'};}
if(mode==='freeze'){
 assert(!fs.existsSync(file),'match plan already frozen');
 const read=name=>JSON.parse(fs.readFileSync(dir+'/'+name+'.json'));
 const built=JSON.parse(fs.readFileSync(cache+'/candidate-build.json')),controlBuilt=JSON.parse(fs.readFileSync(cache+'/control-build.json'));
 assert.equal(hash(candidate),built.binarySha256);assert.equal(hash(control),controlBuilt.binarySha256);
 assert.equal(hash(cache+'/candidate.cpp'),built.sourceSha256);assert.equal(hash(cache+'/control.cpp'),controlBuilt.sourceSha256);assert.equal(sha(sourceOf()),built.sourceSha256);assert.equal(sha(sourceOf({trial:false})),controlBuilt.sourceSha256);assert.equal(built.headerSha256,hash('native/experiments/nnue/nnue.hpp'));
 const controlCheck=read('control-check');assert(controlCheck.passed);assert.equal(controlCheck.controlBinarySha256,controlBuilt.binarySha256);
 for(const name of['check','check-sanitized','rules','rules-sanitized']){const r=read(name);assert(r.passed,name);assert.equal(r.modelSha256,hash(modelFile),name+' model');const b=r.build??r;assert.equal(b.sourceSha256,built.sourceSha256,name+' source');if(!name.includes('sanitized'))assert.equal(b.binarySha256,built.binarySha256,name+' binary');}
 const integration=read('integration');assert(integration.passed);assert.equal(integration.sourceSha256,built.sourceSha256);assert.equal(integration.candidateBinarySha256,built.binarySha256);assert.equal(integration.controlBinarySha256,controlBuilt.binarySha256);assert.equal(integration.modelSha256,hash(modelFile));
 const dataCheck=read('data-check'),modelCheck=read('data-check-model');assert(dataCheck.passed&&modelCheck.passed&&modelCheck.modelMetricsAudited);
 const training=JSON.parse(fs.readFileSync(dir+'/training.json'));assert.equal(hash(modelFile),training.modelSha256);assert.equal(training.planSha256,hash('native/experiments/selfplay-value/plan.json'));assert.equal(training.dataManifestSha256,hash(dir+'/data-manifest.json'));assert.equal(modelCheck.dataManifestSha256,training.dataManifestSha256);assert.equal(modelCheck.planSha256,training.planSha256);
 const seeds=config.seeds,tasks=tasksForPlan();
 assert.equal(tasks.length,config.internalGames+config.candidatePikaGames+config.controlPikaGames);
 const manifest=JSON.parse(fs.readFileSync(dir+'/data-manifest.json'));assert.equal(manifest.planSha256,training.planSha256);assert.equal(dataCheck.planSha256,training.planSha256);const known=new Set(Object.values(manifest.splits).flatMap(x=>x.plannedLayoutHashes));
 const initials=seeds.map(seed=>({seed,layoutSha256:sha(JSON.stringify(initial(seeded(seed)).board))}));for(const x of initials)assert(!known.has(x.layoutSha256));
 const sources=['engine.js','ai.js','native/bridge.mjs','search-metrics.js','native/search.cpp','native/experiments/cluster-tt/table.hpp','native/experiments/nnue/nnue.hpp','native/experiments/search-speed/stable-client.mjs','native/experiments/search-speed/client.mjs','native/experiments/search-speed/bridge.mjs','native/experiments/search-speed/pika.mjs','native/experiments/all-features/pika.mjs','native/experiments/cluster-tt/pika.mjs','native/experiments/tactical-lmr/pika.mjs','native/experiments/ab-jchess/adapter.mjs','native/experiments/coverage-validation/engines.mjs','native/experiments/coverage-validation/common.mjs','scripts/external-engine.js','native/experiments/selfplay-value/plan.json','native/experiments/selfplay-value/build.mjs','native/experiments/selfplay-value/data.mjs','native/experiments/nnue/features.mjs','native/experiments/selfplay-value/matches.mjs',...fs.readdirSync('native/experiments/selfplay-value').filter(f=>/\.(mjs|py|json)$/.test(f)).map(f=>'native/experiments/selfplay-value/'+f),control,candidate,modelFile,...['training','model-frozen','data-manifest','data-check','data-check-model','control-check','check','check-sanitized','rules','rules-sanitized','integration'].map(n=>dir+'/'+n+'.json')];
 const r={synthetic:true,refereeSeedsMustNotBeEngineInputs:true,createdAt:new Date().toISOString(),budgetMs:config.budgetMs,graceMs:config.graceMs,maxPlies:config.maxPlies,planSha256:hash('native/experiments/selfplay-value/plan.json'),tasks,initials,opponent:{commit:pikaCommit,binarySha256:pikaHash,threads:4,TTMiB:64,HCE:true},resourceNotes:{all:'2000ms each move, at most4 threads,64MiB TT budget. Persistent readiness outside clock; observation,sampling,protocol,search,stop/reap inside clock.',mist:'Both arms current production HCE search with bounded map arena; candidate adds residual network and typed inventory TT key.8 worlds when dark,1 when all revealed.40ms host reserve both arms. Total RSS not equal; neural accumulators/cache-key sizes differ.',rules:'Common referee:mate/stalemate first,third same public board+turn loses for mover,120 quiet draw,400 cap unresolved. Both Mist engines retain legacy internal cycle=draw approximation. Pika own repetition search differs; common safeRoots filter forbids immediate repetition loss when alternatives exist.'},hashes:Object.fromEntries(sources.map(p=>[p,hash(p)])),modelSha256:training.modelSha256,games:[],summary:results([])};verify(r);write(r);console.log(JSON.stringify({frozen:true,tasks:tasks.length,initials}));
}else if(mode==='next'||mode==='run'){
 for(const name of['generation.lock','training.lock'])assert(!fs.existsSync(cache+'/'+name),'Other selfplay-value work active: '+name);
 const lock=cache+'/match.lock';const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));fs.closeSync(fd);const release=()=>{try{if(JSON.parse(fs.readFileSync(lock)).pid===process.pid)fs.unlinkSync(lock);}catch{}};process.once('exit',release);
 let stop=false;for(const sig of['SIGINT','SIGTERM'])process.once(sig,()=>{stop=true;});
 try{do{if(fs.existsSync(cache+'/STOP'))break;const r=JSON.parse(fs.readFileSync(file));verify(r);for(const done of r.games)replay(done);const index=r.tasks.findIndex((_,i)=>!r.games.some(g=>g.index===i&&g.result));if(index<0)break;
 let g=r.games.find(g=>g.index===index);if(!g){g={...r.tasks[index],index,startedAt:new Date().toISOString(),log:[]};r.games.push(g);}let s=replay(g),active='setup';const pikaSide=other(g.candidateSide),first=initial(seeded(g.seed)),initialFen=canonicalFen(lawfulView(first,pikaSide)),journal=g.log.filter(x=>x.applied&&x.pikaToken).map(x=>x.pikaToken);
 const own=new StableEngine({binary:g.candidateName==='candidate'?candidate:control,reserveMs:config.hostReserveMs}),opponent=g.kind==='pika'?new FourThreadPika():new StableEngine({binary:control,reserveMs:config.hostReserveMs});
 const persist=()=>{g.plies=s.ply;r.summary=results(r.games);write(r);fs.writeFileSync(cache+'/match-live.json',JSON.stringify({index,group:g.group,ply:s.ply,completed:r.games.filter(g=>g.result).length,at:new Date().toISOString()})+'\n');};
 try{await own.ready();g.candidateCapabilities=own.native.capabilities;if(g.kind==='pika')g.pikaConfig=await opponent.init();else await opponent.ready();persist();
 while(!s.result&&s.ply<config.maxPlies&&!stop&&!fs.existsSync(cache+'/STOP')){
 active=s.turn===g.candidateSide?'candidate':'opponent';const engine=active==='candidate'?own:opponent,isPika=g.kind==='pika'&&active==='opponent',start=performance.now(),view=assertObservation(lawfulView(s,s.turn)),roots=isPika?safeRoots(view):null,budget=Math.max(1,config.budgetMs-Math.ceil(performance.now()-start));
 const x=isPika?await engine.search(initialFen,journal,view,budget,{searchMoves:roots.moves}):await engine.search(view,budget),elapsedMs=performance.now()-start,allowed=legalMoves(view).some(m=>m.from===x.move?.from&&m.to===x.move?.to);
 const clock=x.clock?Object.fromEntries(Object.entries(x.clock).filter(([k])=>!['frames','commands','start'].includes(k))):null;
 const row={ply:s.ply+1,side:s.turn,engine:active,move:x.move,elapsedMs,depth:x.depth??null,completedDepth:x.completedDepth??null,selDepth:x.selDepth??null,nodes:x.nodes??null,visitedNodes:x.visitedNodes??null,threads:x.threads??null,samples:x.samples??null,score:x.score??null,ttBudgetBytes:x.ttBudgetBytes??null,ttAllocatedBytes:x.ttAllocatedBytes??null,ttDenied:x.ttDenied??null,deadlineStop:!!x.deadlineStop,fallbackUsed:!!x.fallbackUsed,clock,excludedRepeatRoots:roots?.excluded??0,viewSha256:sha(JSON.stringify(view)),visibleFen:fen(view)};
 if(!allowed||elapsedMs>config.budgetMs+config.graceMs){g.log.push({...row,applied:false});g.result={status:'decided',winner:other(s.turn),technicalForfeit:true,offender:active,reason:!allowed?'illegal-move':'technical-timeout'};break;}
 assert(x.threads==null||x.threads<=4);if(!isPika&&x.depth>0)assert.equal(x.samples,view.board.some(p=>p?.hidden)?config.samples:config.brightSamples);if(roots)assert(roots.moves.some(m=>m.from===x.move.from&&m.to===x.move.to));
 const p=s.board[x.move.from],q=s.board[x.move.to],next=move(s,x.move),token=g.kind==='pika'?observationToken(lawfulView(s,pikaSide),x.move,lawfulView(next,pikaSide),pikaSide):null;if(token)journal.push(token);
 g.log.push({...row,applied:true,revealed:p.hidden?next.board[x.move.to].type:null,capturedPublic:publicCapture(q),pikaToken:token,afterSha256:sha(JSON.stringify(next.board))});s=next;persist();
 if(s.ply%20===0)console.log(JSON.stringify({index,group:g.group,ply:s.ply,at:new Date().toISOString()}));
 }
 if(!g.result&&(s.result||s.ply>=config.maxPlies))g.result=adjudicate(s);
 }catch(e){g.result={status:active==='setup'?'unresolved':'decided',winner:active==='setup'?null:active==='candidate'?other(g.candidateSide):g.candidateSide,technicalForfeit:true,offender:active,reason:'process-or-protocol-failure',error:String(e).replaceAll(process.cwd(),'<repo>')};fs.writeFileSync(cache+'/STOP','Inspect infrastructure failure before continuing\n');}
 finally{await own.close();await opponent.close();}
 if(g.result)g.finishedAt=new Date().toISOString();persist();if(r.games.filter(g=>g.result).length===r.tasks.length){r.completedAt=new Date().toISOString();write(r);}console.log(JSON.stringify({index,group:g.group,plies:s.ply,result:g.result,summary:r.summary}));
 if(mode==='next'||stop)break;
 }while(true);}finally{release();}
}else if(mode==='status'){const r=JSON.parse(fs.readFileSync(file));console.log(JSON.stringify({completed:r.games.filter(g=>g.result).length,total:r.tasks.length,summary:r.summary,active:r.games.filter(g=>!g.result).map(g=>({index:g.index,plies:g.plies}))}));}else throw Error('freeze|next|run|status');
