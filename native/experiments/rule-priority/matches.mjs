// Independent prospective current-rules retest.
// Finite, predeclared 2-second paired screen. No engine or server is started by replay.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {initial,publicState,positionKey,legalMoves,move,other,rootRules} from '../../../engine.js';
import {seeded} from '../../../ai.js';
import {DefaultEngine as StableEngine} from '../default-all/client.mjs';
import {FourThreadPika,pikaCommit,pikaHash,verifyPika,canonicalFen,observationToken,assertObservation,fen} from '../search-speed/pika.mjs';
import {safeRoots} from '../coverage-validation/common.mjs';
import {cache as buildCache,dir as buildDir,hash,sha,sourceOf,modelFile,control as frozenControl} from './build.mjs';
import {TrialEngine} from './client.mjs';
import{snapshot}from './selection.mjs';
const modelSha256=hash(modelFile);
export const cache='.cache/rule-priority-20261125',dir='benchmarks/rule-priority-2026-11-25';
// Explicitly whitelist public state fields; referee seeds/truth never enter engines.
export function lawfulView(s,viewer){const p=publicState(s,viewer),view={board:p.board,turn:p.turn,captured:p.captured,ply:p.ply,quiet:p.quiet,result:p.result,positions:p.positions,viewer:p.viewer};for(const piece of [...view.board,...view.captured])assert(!piece?.hidden||!('type' in piece),'Hidden truth in observation');return view;}
process.env.MIST_NNUE_MODEL=modelFile;process.env.MIST_NNUE_FULL='0';
const file=cache+'/matches.json';
const plan=JSON.parse(fs.readFileSync('native/experiments/rule-priority/match-plan.json')),config=plan.matches;
const control=frozenControl,candidate=path.resolve(cache+'/trial');
const publicCapture=p=>p?{side:p.side,hidden:p.hidden,...(!p.hidden?{type:p.type}:{})}:null;
function write(r){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(r)+'\n');fs.renameSync(temp,file);}
export function results(games){return Object.fromEntries(['internal','candidatePika'].map(group=>{
 const a=games.filter(g=>g.group===group&&g.result),decided=a.filter(g=>g.result.status!=='unresolved');
 const count=xs=>({wins:xs.filter(g=>g.result.winner===g.candidateSide).length,draws:xs.filter(g=>g.result.status==='draw').length,losses:xs.filter(g=>g.result.winner&&g.result.winner!==g.candidateSide).length});
 const c=count(decided);return[group,{finished:a.length,...c,technicalFailures:a.filter(g=>g.result.technicalForfeit).length,cleanupFailures:a.reduce((n,g)=>n+(g.cleanupErrors?.length??0),0),unresolved:a.length-decided.length,scoreRate:a.length===decided.length&&a.length?(c.wins+.5*c.draws)/a.length:null,normal:count(decided.filter(g=>!g.result.technicalForfeit))}];}));}
export function tasksForPlan(){const tasks=[];for(const[i,seed]of config.seeds.entries())for(const candidateSide of['r','b'])for(const group of i%2?['candidatePika','internal']:['internal','candidatePika'])tasks.push({seed,candidateSide,group,kind:group==='candidatePika'?'pika':'stable',candidateName:'candidate'});return tasks;}

function verify(r){verifyPika();for(const [p,h]of Object.entries(r.hashes))assert.equal(hash(p),h,p);assert.deepEqual(r.tasks,tasksForPlan());assert.equal(r.games.length,new Set(r.games.map(g=>g.index)).size);for(const g of r.games){assert(r.tasks[g.index]);for(const [k,v]of Object.entries(r.tasks[g.index]))assert.equal(g[k],v,k);}assert.deepEqual(r.summary,results(r.games));for(const k of['budgetMs','graceMs','maxPlies'])assert.equal(r[k],config[k]);}

export function replay(g){
 let s=initial(seeded(g.seed));s.positions=[positionKey(s)];const pikaSide=other(g.candidateSide);
 for(const [i,row]of g.log.entries()){
  assert(!s.result,'post-terminal move');const view=assertObservation(lawfulView(s,s.turn));assert.equal(row.ply,s.ply+1);assert.equal(row.side,s.turn);assert.equal(row.viewSha256,sha(JSON.stringify(view)));assert.equal(row.visibleFen,fen(view));
  if(!row.applied){assert.equal(i,g.log.length-1);assert(g.result?.technicalForfeit);continue;}
  assert.deepEqual(row.rootResponsibility,rootRules(view,row.move));assert(legalMoves(s).some(m=>m.from===row.move.from&&m.to===row.move.to));const p=s.board[row.move.from],q=s.board[row.move.to],next=move(s,row.move);
  assert.equal(row.revealed,p.hidden?next.board[row.move.to].type:null);assert.deepEqual(row.capturedPublic,publicCapture(q));assert.equal(row.afterSha256,sha(JSON.stringify(next.board)));
  assert.equal(row.pikaToken,g.kind==='pika'?observationToken(lawfulView(s,pikaSide),row.move,lawfulView(next,pikaSide),pikaSide):null);s=next;
 }
 if(g.result&&!g.result.technicalForfeit)assert.deepEqual(g.result,adjudicate(s));if(g.plies!==undefined)assert.equal(g.plies,s.ply);return s;
}
export function adjudicate(s){
 const ruleEvidence=s.adjudication??null;
 if(s.result?.winner)return {status:'decided',winner:s.result.winner,technicalForfeit:false,reason:s.result.text,ruleEvidence};
 if(s.result?.requiresAdjudication||s.result?.status==='unresolved'||s.adjudication?.status==='review-required')return {status:'unresolved',winner:null,technicalForfeit:false,reason:'repetition-needs-ruling',ruleEvidence};
 if(s.quiet>=120)return {status:'draw',winner:null,technicalForfeit:false,reason:'120-quiet-plies',ruleEvidence};
 assert(s.ply>=config.maxPlies);return {status:'unresolved',winner:null,technicalForfeit:false,reason:'400-ply-cap',ruleEvidence};
}
export async function closeEngines(engines){
 const failures=[];for(const [engine,client]of Object.entries(engines))try{await client.close();}catch(error){failures.push({engine,error:String(error).replaceAll(process.cwd(),'<repo>')});}
 return failures;
}
export function assertNoOtherMatch(){for(const p of ['.cache/jqe-retest/match.lock','.cache/jqe-confirm/match.lock','.cache/jqe-speed/run.lock','.cache/default-all-20261118/match.lock','.cache/default-all-20261118/run.lock',cache+'/run.lock',cache+'/match.lock'])assert(!fs.existsSync(p),'Active/unverified experiment lock: '+p);}
// Do not query8766; preserve its service and user state. No system process inventory.
async function idle(){return true;}

export async function main(mode=process.argv[2]??'status'){
if(['freeze','run','next'].includes(mode)){fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});}
if(mode==='freeze'){
 assertNoOtherMatch();assert(!fs.existsSync(file));assert.equal(JSON.parse(fs.readFileSync(cache+'/check.json')).passed,true);assert.equal(JSON.parse(fs.readFileSync(cache+'/integration.json')).passed,true);assert.equal(JSON.parse(fs.readFileSync(cache+'/phase-npm-v2.json')).state,'completed');
 for(const gate of ['check-v2','integration-v2','direct'])assert.equal(JSON.parse(fs.readFileSync(cache+'/phase-'+gate+'.json')).state,'completed');
 const built=JSON.parse(fs.readFileSync(cache+'/trial.json')),controlBuilt=JSON.parse(fs.readFileSync('.cache/default-all-20261118/default.json'));assert.equal(hash(candidate),built.binarySha256);assert.equal(hash(control),controlBuilt.binarySha256);assert.equal(hash(control),'80b3054276e4a53b59b40915bfdab627e2a19a628ab1e4614885c3f9d5dd68c3');assert.equal(built.sourceSha256,sha(sourceOf()));assert.equal(hash(modelFile),modelSha256);
 const tasks=tasksForPlan();assert.equal(tasks.length,8);const initials=config.seeds.map(seed=>({seed,layoutSha256:sha(JSON.stringify(initial(seeded(seed)).board))}));
 const sources=['app.js','deadline-search.js','native-client.js','worker.js','engine.js','ai.js','native/bridge.mjs','native/server.mjs','native/start.mjs','native/engine-defaults.json','search-metrics.js','native/search.cpp','native/experiments/search-speed/stable-client.mjs','native/experiments/search-speed/client.mjs','native/experiments/search-speed/pika.mjs','native/experiments/jqe-retest/audit.mjs',modelFile,cache+'/trial.cpp',cache+'/nnue.hpp',candidate,control,...['source.mjs','build.mjs','client.mjs'].map(n=>'native/experiments/default-all/'+n),'native/experiments/rule-reply/policy.mjs','native/experiments/rule-reply/build.mjs',...['selection.mjs','bridge.mjs','client.mjs','build.mjs','matches.mjs','entry-source.mjs','javascript.mjs','web.mjs','match-plan.json','plan.json'].map(n=>'native/experiments/rule-priority/'+n)];
 const r={synthetic:true,sampling:plan.sampling,adoption:{defaultEnable:false,phase:'lexicographic public proven-loss selection pilot only'},refereeSeedsMustNotBeEngineInputs:true,createdAt:new Date().toISOString(),budgetMs:config.budgetMs,graceMs:config.graceMs,maxPlies:config.maxPlies,planSha256:hash('native/experiments/rule-priority/match-plan.json'),tasks,initials,opponent:{commit:pikaCommit,binarySha256:pikaHash,threads:4,TTMiB:64,HCE:true},resourceNotes:{all:'2000ms at most4 workers64MiBTT,same40ms hostreserve; actual utilization/RSS differs; all-known own engines1worker vsPika4; unregistered background/old unknown build not excluded; no8766 query',candidate:'Exact all-compatible-v2 plus public proof + lexicographic loss tier across native/host fallback,15dark/1bright; full preparation inside budget',control:'Frozen actual default all-compatible-v2 binary80b30542,15dark/1bright,not old HCE',rules:'Same unchanged proof-only three-cycle long-check responsibility; other cycles unresolved; no referee seed/hidden truth'},hashes:Object.fromEntries(sources.map(p=>[p,hash(p)])),builds:JSON.parse(JSON.stringify({candidate:built,control:controlBuilt}).replaceAll(process.cwd(),'<repo>')),games:[],summary:results([])};verify(r);write(r);console.log(JSON.stringify({frozen:true,tasks:tasks.length,initials}));
}else if(mode==='next'||mode==='run'){
 assertNoOtherMatch();
 assert(!fs.existsSync(buildCache+'/validation.lock'),'Validation is still active');
 const lock=cache+'/match.lock';const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));fs.closeSync(fd);const release=()=>{try{if(JSON.parse(fs.readFileSync(lock)).pid===process.pid)fs.unlinkSync(lock);}catch{}};process.once('exit',release);
 let stop=false;for(const sig of['SIGINT','SIGTERM'])process.once(sig,()=>{stop=true;});
 try{do{if(fs.existsSync(cache+'/STOP'))break;const q=JSON.parse(fs.readFileSync(cache+'/quota.json'));if(q.remainingPercent<40||Date.now()-Date.parse(q.at)>600000)break;if(!await idle())break;const r=JSON.parse(fs.readFileSync(file));verify(r);for(const done of r.games)replay(done);const index=r.tasks.findIndex((_,i)=>!r.games.some(g=>g.index===i&&g.result));if(index<0)break;
 let g=r.games.find(g=>g.index===index);if(!g){g={...r.tasks[index],index,startedAt:new Date().toISOString(),log:[]};r.games.push(g);}let s=replay(g),active='setup',userBusy=false;const pikaSide=other(g.candidateSide),first=initial(seeded(g.seed)),initialFen=canonicalFen(lawfulView(first,pikaSide)),journal=g.log.filter(x=>x.applied&&x.pikaToken).map(x=>x.pikaToken);
 const own=new TrialEngine({binary:candidate,reserveMs:config.hostReserveMs}),opponent=g.kind==='pika'?new FourThreadPika():new StableEngine({binary:control,reserveMs:config.hostReserveMs});
 const persist=()=>{g.plies=s.ply;r.summary=results(r.games);write(r);fs.writeFileSync(cache+'/match-live.json',JSON.stringify({index,group:g.group,ply:s.ply,completed:r.games.filter(g=>g.result).length,at:new Date().toISOString()})+'\n');};
 try{await own.ready();g.candidateCapabilities=own.native.capabilities;if(g.kind==='pika')g.pikaConfig=await opponent.init();else await opponent.ready();persist();
 while(!s.result&&s.ply<config.maxPlies&&!stop&&!fs.existsSync(cache+'/STOP')){
 if(!await idle()){stop=true;g.pauseReason='stable service active';break;}
 active=s.turn===g.candidateSide?'candidate':'opponent';const engine=active==='candidate'?own:opponent,isPika=g.kind==='pika'&&active==='opponent',start=performance.now(),view=assertObservation(lawfulView(s,s.turn)),roots=isPika?safeRoots(view):null,budget=Math.max(1,config.budgetMs-Math.ceil(performance.now()-start));
 let checking=false;const guard=setInterval(async()=>{if(checking)return;checking=true;try{if(!await idle()){userBusy=true;if(engine.p)engine.p.kill();else engine.stop().catch(()=>{});}}catch{userBusy=true;if(engine.p)engine.p.kill();else engine.stop().catch(()=>{});}finally{checking=false;}},250);let x;try{x=isPika?await engine.search(initialFen,journal,view,budget,{searchMoves:roots.moves}):await engine.search(view,budget);}finally{clearInterval(guard);}if(userBusy){stop=true;g.pauseReason='stable service interrupted own experiment';break;}const elapsedMs=performance.now()-start,allowed=legalMoves(view).some(m=>m.from===x.move?.from&&m.to===x.move?.to);
 const clock=x.clock?Object.fromEntries(Object.entries(x.clock).filter(([k])=>!['frames','commands','start'].includes(k))):null;
 const row={selectionMetrics:snapshot(x),ply:s.ply+1,side:s.turn,engine:active,move:x.move,elapsedMs,depth:x.depth??null,mainDepth:x.mainDepth??null,completedDepth:x.completedDepth??null,selDepth:x.selDepth??null,nodes:x.nodes??null,visitedNodes:x.visitedNodes??null,threads:x.threads??null,samples:x.samples??null,score:x.score??null,ruleReplyProofs:x.ruleReplyProofs??null,rulePreparationMs:x.rulePreparationMs??null,features:x.features??null,comparedCount:x.comparedCount??null,rootCount:x.rootCount??null,fullRootDepth:x.fullRootDepth??null,searchScope:x.searchScope??null,ttBudgetBytes:x.ttBudgetBytes??null,ttAllocatedBytes:x.ttAllocatedBytes??null,ttDenied:x.ttDenied??null,deadlineStop:!!x.deadlineStop,fallbackUsed:!!x.fallbackUsed,clock,excludedRepeatRoots:roots?.excluded??0,viewSha256:sha(JSON.stringify(view)),visibleFen:fen(view)};
 if(!allowed||elapsedMs>config.budgetMs+config.graceMs){g.log.push({...row,applied:false});g.result={status:'decided',winner:other(s.turn),technicalForfeit:true,offender:active,reason:!allowed?'illegal-move':'technical-timeout'};break;}
 assert(x.threads==null||x.threads<=4);if(!isPika){assert(x.ttBudgetBytes==null||x.ttBudgetBytes<=config.ttBudgetBytes);assert(x.ttAllocatedBytes==null||x.ttAllocatedBytes<=config.ttBudgetBytes);}if(!isPika&&x.depth>0)assert.equal(x.samples,view.board.some(p=>p?.hidden)?(active==='candidate'?config.samples:config.controlSamples):config.brightSamples);if(roots)assert(roots.moves.some(m=>m.from===x.move.from&&m.to===x.move.to));
 row.rootResponsibility=rootRules(view,x.move);const p=s.board[x.move.from],q=s.board[x.move.to],next=move(s,x.move),token=g.kind==='pika'?observationToken(lawfulView(s,pikaSide),x.move,lawfulView(next,pikaSide),pikaSide):null;if(token)journal.push(token);
 g.log.push({...row,applied:true,revealed:p.hidden?next.board[x.move.to].type:null,capturedPublic:publicCapture(q),pikaToken:token,afterSha256:sha(JSON.stringify(next.board))});s=next;persist();
 if(s.ply%20===0)console.log(JSON.stringify({index,group:g.group,ply:s.ply,at:new Date().toISOString()}));
 }
 if(!g.result&&(s.result||s.ply>=config.maxPlies))g.result=adjudicate(s);
 }catch(e){if(userBusy){stop=true;g.pauseReason='stable service interrupted own experiment';}else{g.result={status:active==='setup'?'unresolved':'decided',winner:active==='setup'?null:active==='candidate'?other(g.candidateSide):g.candidateSide,technicalForfeit:true,offender:active,reason:'process-or-protocol-failure',error:String(e).replaceAll(process.cwd(),'<repo>')};fs.writeFileSync(cache+'/STOP','Inspect infrastructure failure before continuing\n');}}
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
 assert(r.completedAt);assert.deepEqual(r.tasks,tasksForPlan());assert.equal(r.games.length,r.tasks.length);assert.equal(new Set(r.games.map(g=>g.index)).size,r.tasks.length);assert.equal(r.planSha256,hash('native/experiments/rule-priority/match-plan.json'));assert.deepEqual(r.summary,results(r.games));
 let moves=0,privateChecks=0;for(const g of r.games){assert(g.result);for(const[k,v]of Object.entries(r.tasks[g.index]))assert.equal(g[k],v);assert.equal(sha(JSON.stringify(initial(seeded(g.seed)).board)),r.initials.find(x=>x.seed===g.seed).layoutSha256);replay(g);moves+=g.log.filter(x=>x.applied).length;privateChecks+=g.log.filter(x=>x.applied&&x.capturedPublic?.hidden&&g.kind==='pika').length;}
 for(const[p,h]of Object.entries(r.hashes))if(!p.startsWith('.cache/'))assert.equal(hash(p),h,p);
 console.log(JSON.stringify({passed:true,complete:true,games:r.games.length,moves,privateChecks,matchesSha256:hash(input),planSha256:r.planSha256,summary:r.summary}));
}else if(mode==='status'){const r=JSON.parse(fs.readFileSync(file));console.log(JSON.stringify({completed:r.games.filter(g=>g.result).length,total:r.tasks.length,summary:r.summary,active:r.games.filter(g=>!g.result).map(g=>({index:g.index,plies:g.plies}))}));}else throw Error('freeze|next|run|status|replay');

}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
