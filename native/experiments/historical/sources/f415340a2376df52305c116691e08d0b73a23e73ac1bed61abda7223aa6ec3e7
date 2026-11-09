// Finite, predeclared 2-second paired screen. No engine or server is started by replay.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {initial,publicState,positionKey,legalMoves,move,other} from '../../../engine.js';
import {seeded} from '../../../ai.js';
import {StableEngine} from '../search-speed/stable-client.mjs';
import {FourThreadPika,pikaCommit,pikaHash,verifyPika,canonicalFen,observationToken,assertObservation,fen} from '../search-speed/pika.mjs';
import {safeRoots} from '../coverage-validation/common.mjs';
import {cache,dir,hash,sha,sourceOf,modelFile,modelSha256} from './build.mjs';
// Explicitly whitelist public state fields; referee seeds/truth never enter engines.
export function lawfulView(s,viewer){const p=publicState(s,viewer),view={board:p.board,turn:p.turn,captured:p.captured,ply:p.ply,quiet:p.quiet,result:p.result,positions:p.positions,viewer:p.viewer};for(const piece of [...view.board,...view.captured])assert(!piece?.hidden||!('type' in piece),'Hidden truth in observation');return view;}
process.env.MIST_JQE_MODEL=modelFile;delete process.env.MIST_JQE_QUANT;delete process.env.MIST_JQE_FULL;
const file=cache+'/matches.json';
const plan=JSON.parse(fs.readFileSync('native/experiments/jqe/plan.json')),config=plan.matches;
const control=path.resolve(cache+'/control'),candidate=path.resolve(cache+'/candidate');
const publicCapture=p=>p?{side:p.side,hidden:p.hidden,...(!p.hidden?{type:p.type}:{})}:null;
function write(r){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(r)+'\n');fs.renameSync(temp,file);}
export function results(games){return Object.fromEntries(['internal','candidatePika','controlPika'].map(group=>{
 const a=games.filter(g=>g.group===group&&g.result),decided=a.filter(g=>g.result.status!=='unresolved');
 const count=xs=>({wins:xs.filter(g=>g.result.winner===g.candidateSide).length,draws:xs.filter(g=>g.result.status==='draw').length,losses:xs.filter(g=>g.result.winner&&g.result.winner!==g.candidateSide).length});
 const c=count(decided);return[group,{finished:a.length,...c,technicalFailures:a.filter(g=>g.result.technicalForfeit).length,cleanupFailures:a.reduce((n,g)=>n+(g.cleanupErrors?.length??0),0),unresolved:a.length-decided.length,scoreRate:a.length===decided.length&&a.length?(c.wins+.5*c.draws)/a.length:null,normal:count(decided.filter(g=>!g.result.technicalForfeit))}];}));}
export function tasksForPlan(){const tasks=[];for(const [i,seed]of config.seeds.entries())for(const candidateSide of['r','b'])for(const group of i%2?['controlPika','candidatePika','internal']:['internal','candidatePika','controlPika'])tasks.push({seed,candidateSide,group,kind:group==='internal'?'stable':'pika',candidateName:group==='controlPika'?'control':'candidate'});return tasks;}
function verify(r){verifyPika();for(const [p,h]of Object.entries(r.hashes))assert.equal(hash(p),h,p);assert.deepEqual(r.tasks,tasksForPlan());assert.equal(r.games.length,new Set(r.games.map(g=>g.index)).size);for(const g of r.games){assert(r.tasks[g.index]);for(const [k,v]of Object.entries(r.tasks[g.index]))assert.equal(g[k],v,k);}assert.deepEqual(r.summary,results(r.games));for(const k of['budgetMs','graceMs','maxPlies'])assert.equal(r[k],config[k]);}

export function replay(g){
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
export async function closeEngines(engines){
 const failures=[];for(const [engine,client]of Object.entries(engines))try{await client.close();}catch(error){failures.push({engine,error:String(error).replaceAll(process.cwd(),'<repo>')});}
 return failures;
}
export async function main(mode=process.argv[2]??'status'){
if(mode==='freeze'){
 assert(!fs.existsSync(file),'match plan already frozen');
 const read=name=>JSON.parse(fs.readFileSync(dir+'/'+name+'.json'));
 const built=JSON.parse(fs.readFileSync(cache+'/candidate-build.json')),controlBuilt=JSON.parse(fs.readFileSync(cache+'/control-build.json'));
 assert.equal(hash('native/experiments/jqe/nnue.hpp'),built.headerSha256);assert.equal(hash(cache+'/nnue.hpp'),built.headerSha256);assert.equal(built.modelSha256,modelSha256);
 assert.equal(hash(candidate),built.binarySha256);assert.equal(hash(control),controlBuilt.binarySha256);
 assert.equal(hash(cache+'/candidate.cpp'),built.sourceSha256);assert.equal(hash(cache+'/control.cpp'),controlBuilt.sourceSha256);
 assert.equal(sha(sourceOf()),built.sourceSha256);assert.equal(sha(sourceOf({trial:false})),controlBuilt.sourceSha256);
 for(const name of ['check','check-sanitized','rules','rules-sanitized']){const r=read(name);assert(r.passed,name);const b=r.build??r;assert.equal(b.sourceSha256,built.sourceSha256,name+' source');assert.equal(b.headerSha256,built.headerSha256,name+' header');assert.equal(r.modelSha256??b.modelSha256,modelSha256,name+' model');if(name.startsWith('rules')){assert.equal(r.mode,'quantized-incremental');assert.equal(r.testSourceSha256,hash('native/experiments/jqe/rules.mjs'));}else for(const[p,h]of Object.entries(r.testSourceHashes))assert.equal(hash('native/experiments/jqe/'+p),h,p);if(!name.includes('sanitized'))assert.equal(b.binarySha256,built.binarySha256,name+' binary');}
 const controlCheck=read('control-check');assert(controlCheck.passed);assert.equal(controlCheck.controlBinarySha256,controlBuilt.binarySha256);
 const integration=read('integration');assert(integration.passed);assert.equal(integration.candidateBinarySha256,built.binarySha256);assert.equal(hash(modelFile),modelSha256);assert.equal(integration.headerSha256,built.headerSha256);assert.equal(integration.mode,'quantized-incremental');assert.equal(integration.testSourceSha256,hash('native/experiments/jqe/integration.mjs'));
 for(const name of['thread-check','service']){const r=read(name);assert(r.passed);assert.equal(r.sourceSha256,built.sourceSha256);assert.equal(r.headerSha256,built.headerSha256);assert.equal(r.modelSha256,modelSha256);if(name==='service'){assert.equal(r.binarySha256,built.binarySha256);assert.equal(r.testSourceSha256,hash('native/experiments/jqe/service-check.mjs'));assert.equal(r.previewSourceSha256,hash('native/experiments/jqe/web.mjs'));assert.equal(r.serviceSourceSha256,hash('native/server.mjs'));}}
 const known=new Set(),evidence=[];
 for(const base of ['benchmarks','.cache'])for(const name of fs.readdirSync(base,{recursive:true}).filter(x=>x.endsWith('/matches.json')||x.endsWith('/games.json')||x.endsWith('/data-manifest.json'))){
  const f=base+'/'+name;if(f===file)continue;const data=JSON.parse(fs.readFileSync(f));let found=0;
  for(const game of data.games??[])if(Number.isInteger(game.seed)){known.add(sha(JSON.stringify(initial(seeded(game.seed)).board)));found++;}
  for(const item of data.initials??[])if(item.layoutSha256){known.add(item.layoutSha256);found++;}
  for(const split of Object.values(data.splits??{}))for(const h of [...(split.layoutHashes??[]),...(split.plannedLayoutHashes??[])]){known.add(h);found++;}
  if(found)evidence.push({file:f,sha256:hash(f),entries:found});
 }
 const seeds=config.seeds,tasks=tasksForPlan();assert.equal(tasks.length,config.totalGames);
 const initials=seeds.map(seed=>({seed,layoutSha256:sha(JSON.stringify(initial(seeded(seed)).board))}));for(const x of initials)assert(!known.has(x.layoutSha256),'Layout already recorded');assert.equal(new Set(initials.map(x=>x.layoutSha256)).size,seeds.length);
 const freshness={passed:true,checkedAt:new Date().toISOString(),existingLayoutHashes:known.size,initials,evidence};fs.writeFileSync(dir+'/freshness.json',JSON.stringify(freshness,null,2)+'\n');
 const sources=['engine.js','ai.js','native/bridge.mjs','search-metrics.js','native/search.cpp','native/experiments/cluster-tt/table.hpp','native/experiments/selfplay-value/build.mjs','native/experiments/search-speed/stable-client.mjs','native/experiments/search-speed/client.mjs','native/experiments/search-speed/bridge.mjs','native/experiments/search-speed/pika.mjs','native/experiments/all-features/pika.mjs','native/experiments/cluster-tt/pika.mjs','native/experiments/tactical-lmr/pika.mjs','native/experiments/ab-jchess/adapter.mjs','native/experiments/coverage-validation/engines.mjs','native/experiments/coverage-validation/common.mjs','scripts/external-engine.js','scripts/native-match-engine.mjs',...fs.readdirSync('native/experiments/jqe').filter(f=>/\.(mjs|cpp|hpp|json)$/.test(f)).map(f=>'native/experiments/jqe/'+f),cache+'/control',cache+'/candidate','models/jqe/it014.jqn',...['check','check-sanitized','rules','rules-sanitized','control-check','integration','thread-check','service','freshness'].map(n=>dir+'/'+n+'.json')];
 const r={synthetic:true,refereeSeedsMustNotBeEngineInputs:true,createdAt:new Date().toISOString(),budgetMs:config.budgetMs,graceMs:config.graceMs,maxPlies:config.maxPlies,planSha256:hash('native/experiments/jqe/plan.json'),tasks,initials,opponent:{commit:pikaCommit,binarySha256:pikaHash,threads:4,TTMiB:64,HCE:true},resourceNotes:{all:'2000 ms per move, at most 4 search threads, 64 MiB TT budget. Persistent readiness outside clock; observation, sampling, protocol, search, stop/reap inside clock.',mist:'Both arms are current production HCE search with the same bounded map arena; candidate replaces only static evaluation with the pinned JQE network, including typed pool keys. 8 worlds when dark, 1 when fully revealed. Same 40 ms host and up-to-35 ms core reserves. Candidate has neural accumulators and larger typed pool keys; total RSS and effective TT entry capacity are not equal.',rules:'Common referee: mate/stalemate first, third same public board+turn loses for mover, 120 quiet draw, 400 cap unresolved. Both Mist engines retain legacy internal cycle=draw approximation. Pika own repetition search differs; common safeRoots filter forbids immediate repetition loss when alternatives exist.'},hashes:Object.fromEntries(sources.map(p=>[p,hash(p)])),builds:{candidate:built,control:controlBuilt},games:[],summary:results([])};
 // Compiler diagnostics are reproducible metadata; remove host paths before publication.
 r.builds=JSON.parse(JSON.stringify(r.builds).replaceAll(process.cwd(),'<repo>'));verify(r);write(r);console.log(JSON.stringify({frozen:true,tasks:tasks.length,initials}));
}else if(mode==='next'||mode==='run'){
 assert(!fs.existsSync(cache+'/validation.lock'),'Validation is still active');
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
 finally{
 const failures=await closeEngines({candidate:own,opponent});
 if(failures.length){g.cleanupErrors=[...(g.cleanupErrors??[]),...failures];stop=true;}
 // Persist the established outcome even when cleanup fails. Do not retry a finished game.
 if(g.result)g.finishedAt=new Date().toISOString();persist();
 if(failures.length)fs.writeFileSync(cache+'/STOP','Inspect cleanup failure before continuing\n');
 }
 if(g.result)g.finishedAt=new Date().toISOString();persist();if(r.games.filter(g=>g.result).length===r.tasks.length){r.completedAt=new Date().toISOString();write(r);}console.log(JSON.stringify({index,group:g.group,plies:s.ply,result:g.result,summary:r.summary}));
 if(mode==='next'||stop)break;
 }while(true);}finally{release();}
}else if(mode==='replay'){
 const input=process.argv[3]??dir+'/matches.json',r=JSON.parse(fs.readFileSync(input));
 assert(r.completedAt);assert.deepEqual(r.tasks,tasksForPlan());assert.equal(r.games.length,r.tasks.length);assert.equal(new Set(r.games.map(g=>g.index)).size,r.tasks.length);assert.equal(r.planSha256,hash('native/experiments/jqe/plan.json'));assert.deepEqual(r.summary,results(r.games));
 let moves=0,privateChecks=0;for(const g of r.games){assert(g.result);for(const[k,v]of Object.entries(r.tasks[g.index]))assert.equal(g[k],v);assert.equal(sha(JSON.stringify(initial(seeded(g.seed)).board)),r.initials.find(x=>x.seed===g.seed).layoutSha256);replay(g);moves+=g.log.filter(x=>x.applied).length;privateChecks+=g.log.filter(x=>x.applied&&x.capturedPublic?.hidden&&g.kind==='pika').length;}
 for(const[p,h]of Object.entries(r.hashes))if(!p.startsWith('.cache/'))assert.equal(hash(p),h,p);
 console.log(JSON.stringify({passed:true,complete:true,games:r.games.length,moves,privateChecks,matchesSha256:hash(input),planSha256:r.planSha256,summary:r.summary}));
}else if(mode==='status'){const r=JSON.parse(fs.readFileSync(file));console.log(JSON.stringify({completed:r.games.filter(g=>g.result).length,total:r.tasks.length,summary:r.summary,active:r.games.filter(g=>!g.result).map(g=>({index:g.index,plies:g.plies}))}));}else throw Error('freeze|next|run|status|replay');

}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
