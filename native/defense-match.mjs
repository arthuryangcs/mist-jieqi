// Paired trial against the frozen default. No third-party process is launched.
import fs from 'node:fs';import assert from 'node:assert/strict';import os from 'node:os';
import {initial,publicState,legalMoves,move,other,positionKey} from '../engine.js';
import {seeded} from '../ai.js';import {Native} from './bridge.mjs';
import {CandidateEngine} from '../scripts/native-match-engine.mjs';
import {compileDefense,dir,sha} from './defense-variants.mjs';
const stage=process.argv[2]||'screen';assert(['screen','confirm'].includes(stage));
const file=`${dir}/matches-${stage}.json`,selection=JSON.parse(fs.readFileSync(`${dir}/selection.json`));
assert(['threats','king','both','kingFast','kingCached','kingLazy'].includes(selection.variant));
const hash=p=>sha(fs.readFileSync(p));
const sources=['native/defense-match.mjs','native/defense-variants.mjs','native/defense-eval.inc','native/bridge.mjs','scripts/native-match-engine.mjs','engine.js','ai.js'];
class TrialEngine extends CandidateEngine {
 constructor(binary){super();this.binary=binary;}
 async ready(){if(this.native)return;const n=new Native({binary:this.binary});n.exited=new Promise(resolve=>n.process.once('exit',resolve));this.native=n;await n.ready;this.initializations.push(n.initializationMs);}
}
export function summary(games){
 const wins=games.filter(g=>g.result.winner===g.trialSide).length,draws=games.filter(g=>g.result.status==='draw').length,unresolved=games.filter(g=>g.result.status==='unresolved').length;
 return {games:games.length,wins,draws,losses:games.length-wins-draws-unresolved,unresolved,scoreRate:unresolved?null:(wins+0.5*draws)/games.length,technical:games.filter(g=>g.result.technicalForfeit).map(g=>({seed:g.seed,trialSide:g.trialSide,...g.result}))};
}
if(!fs.existsSync(file)){
 const check=JSON.parse(fs.readFileSync(`${dir}/check-${selection.variant==='kingLazy'?'lazy-':selection.variant==='kingCached'?'cached-':''}release.json`));assert(check.passed);
 if(stage==='confirm'){const s=JSON.parse(fs.readFileSync(`${dir}/matches-screen.json`));assert.equal(s.games.length,8);assert(s.summary.scoreRate>=0.625&&!s.summary.technical.length&&!s.summary.unresolved);}
 const seeds=stage==='screen'?[13001,13003,13007,13009]:[13103,13109,13121,13127,13147,13151,13159,13163,13171,13177];
 const builds=['baseline',selection.variant].map(name=>compileDefense(name));
 const r={stage,createdAt:new Date().toISOString(),trial:selection.variant,selectionSha256:hash(`${dir}/selection.json`),builds,budgetMs:stage==='screen'?400:1000,graceMs:60,maxPlies:400,seeds,
  sourceHashes:Object.fromEntries(sources.map(p=>[p,hash(p)])),initials:seeds.map(seed=>({seed,board:initial(seeded(seed)).board})),
  environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model},
  config:{samples:8,maxDepth:8,maxThreads:4,ttEntriesPerWorld:90000,singleBrightSample:true,
   promotionGate:'Predeclared: screen >=5/8 points, then independent20-game confirm >=12/20 points, no technical failures/unresolved games, no >=1-depth loss in two of three1s representative positions, independent rule/map/information/sanitizer and integration checks. No weight tuning after screen. This is an engineering gate, not statistical proof.',
   clock:'Readiness excluded; projection, sampling, IPC, search, host stop and process reap included. One search at a time.',
   draws:'Public threefold/120 quiet plies;400 ply cap unresolved, never evaluation adjudication.',
   information:'Only moving side filtered observation, private dark captures only for captor; real setup seed/allocation stays in referee.'},games:[]};
 fs.writeFileSync(file,JSON.stringify(r)+'\n');
}
const r=JSON.parse(fs.readFileSync(file)),persist=()=>fs.writeFileSync(file,JSON.stringify(r)+'\n');
assert.equal(r.selectionSha256,hash(`${dir}/selection.json`));for(const [p,h]of Object.entries(r.sourceHashes))assert.equal(hash(p),h,p);for(const b of r.builds){assert.equal(hash(b.binary),b.binarySha256);assert.equal(hash(b.binary+'.cpp'),b.sourceSha256);}
for(const seed of r.seeds)for(const trialSide of ['r','b']){
 if(r.games.some(g=>g.seed===seed&&g.trialSide===trialSide))continue;
 let s=initial(seeded(seed));s.positions=[positionKey(s)];assert.deepEqual(s.board,r.initials.find(x=>x.seed===seed).board);
 const engines={trial:new TrialEngine(r.builds[1].binary),baseline:new TrialEngine(r.builds[0].binary)},g={seed,trialSide,startedAt:new Date().toISOString(),log:[]};let active='trial';
 try {
  for(const name of ['trial','baseline']){active=name;await engines[name].ready();}
  while(!s.result&&s.ply<r.maxPlies){
   active=s.turn===trialSide?'trial':'baseline';await engines[active].ready();
   const start=performance.now(),view=publicState(s,s.turn);for(const p of [...view.board,...view.captured])assert(!p?.hidden||!('type'in p));
   const result=await engines[active].search(view,Math.max(1,Math.floor(r.budgetMs-(performance.now()-start)))),elapsedMs=performance.now()-start;
   const legal=legalMoves(view).some(m=>m.from===result.move?.from&&m.to===result.move?.to);
   const row={ply:s.ply+1,engine:active,side:s.turn,move:result.move,elapsedMs,depth:result.depth,nodes:result.nodes,score:result.score,threads:result.threads,deadlineStop:result.deadlineStop,fallbackUsed:result.fallbackUsed,viewSha256:sha(JSON.stringify(view))};
   if(!legal||elapsedMs>r.budgetMs+r.graceMs){g.log.push(row);g.result={status:'decided',winner:other(s.turn),technicalForfeit:true,offender:active,reason:!legal?'illegal-move':'technical-timeout'};break;}
   const p=s.board[row.move.from],q=s.board[row.move.to];s=move(s,row.move);
   g.log.push({...row,revealed:p.hidden?s.board[row.move.to].type:null,captured:q,afterSha256:sha(JSON.stringify(s.board))});
   fs.writeFileSync(`${dir}/live.json`,JSON.stringify({stage,seed,trialSide,ply:s.ply,completed:r.games.length,last:row})+'\n');
  }
  if(!g.result){
   if(s.result?.winner)g.result={status:'decided',winner:s.result.winner,reason:s.result.text,technicalForfeit:false};
   else if(s.ply>=r.maxPlies)g.result={status:'unresolved',winner:null,reason:'400-ply-cap',technicalForfeit:false};
   else g.result={status:'draw',winner:null,reason:s.quiet>=120?'120-quiet-plies':'threefold-public-position',technicalForfeit:false};
  }
 }catch(e){g.result={status:'decided',winner:active==='trial'?other(trialSide):trialSide,reason:'process-or-protocol-failure',technicalForfeit:true,offender:active,error:e.stack};}
 finally{for(const e of Object.values(engines))await e.close();}
 g.initializations=Object.fromEntries(Object.entries(engines).map(([n,e])=>[n,e.initializations]));g.finalState=s;g.finishedAt=new Date().toISOString();r.games.push(g);r.summary=summary(r.games);persist();
 console.log(JSON.stringify({stage,seed,trialSide,plies:s.ply,result:g.result,summary:r.summary}));
}
r.completedAt=new Date().toISOString();persist();if(fs.existsSync(`${dir}/live.json`))fs.unlinkSync(`${dir}/live.json`);
