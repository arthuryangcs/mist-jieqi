import fs from'node:fs';import assert from'node:assert/strict';import os from'node:os';
import{initial,publicState,legalMoves,move,other,positionKey}from'../engine.js';import{seeded}from'../ai.js';
import{FocusEngine}from'./focus-engine.mjs';import{compileFocus,originalBuild,dir,sha}from'./focus-variants.mjs';
const variant=process.argv[2]||'root',stage=process.argv[3]||'screen';assert(['root','tactical','both'].includes(variant));assert(['screen','confirm'].includes(stage));
const label=process.env.FOCUS_MATCH_LABEL||'production',file=`${dir}/matches-${variant}-${stage}-${label}.json`,hash=p=>sha(fs.readFileSync(p));
const sources=['native/focus-match.mjs','native/focus-engine.mjs','native/focus-variants.mjs','native/focus-policy.inc','native/focus-tactics.inc','native/bridge.mjs','engine.js','ai.js'];
function summary(gs){const wins=gs.filter(g=>g.result.winner===g.trialSide).length,draws=gs.filter(g=>g.result.status==='draw').length,unresolved=gs.filter(g=>g.result.status==='unresolved').length;return{games:gs.length,wins,draws,losses:gs.length-wins-draws-unresolved,unresolved,scoreRate:unresolved?null:(wins+.5*draws)/gs.length,technical:gs.filter(g=>g.result.technicalForfeit).map(g=>({seed:g.seed,trialSide:g.trialSide,...g.result}))};}
if(!fs.existsSync(file)){
 const check=JSON.parse(fs.readFileSync(`${dir}/check-${variant}-release${variant==='root'?'-v5':''}.json`));assert(check.passed,'Rule and score audit required before games');
 if(stage==='confirm'){const prior=JSON.parse(fs.readFileSync(`${dir}/matches-${variant}-screen-${label}.json`));assert.equal(prior.games.length,8);assert(prior.summary.scoreRate>=.625&&!prior.summary.technical.length&&!prior.summary.unresolved,'Screen gate failed');}
 const seeds=stage==='confirm'?[16001,16007,16033,16057,16061,16063,16067,16069,16073,16087]:variant==='root'?[15401,15413,15427,15439]:variant==='tactical'?[15217,15227,15233,15241]:[15307,15313,15319,15329];
 const builds=[originalBuild(),compileFocus(variant)];
 assert.equal(builds[0].sourceSha256,'73de0d5768fbedd97d46305891a0513f95c7a856aa5aba8edff8a92e2d1798d0');assert.equal(builds[0].binarySha256,'2304327e3cb91987780ab453fa98db5e17383d32c4c39009649092ee9f14c49b');
 const r={createdAt:new Date().toISOString(),variant,stage,builds,budgetMs:stage==='screen'?400:1000,graceMs:60,maxPlies:400,seeds,
  initials:seeds.map(seed=>({seed,board:initial(seeded(seed)).board})),sourceHashes:Object.fromEntries(sources.map(p=>[p,hash(p)])),
  environment:{node:process.version,cpu:os.cpus()[0].model,arch:process.arch,platform:process.platform},
  config:{samples:8,maxThreads:4,fullBrightSamples:1,maxDepth:8,ttEntriesPerWorld:90000,
   gate:'Pre-game: combined screen >=5/8 points, then20 independent-layout1000ms confirm >=12/20, zero technical/unresolved, no forced-win tactical regressions, information/sanitizer/UI checks. Root and tactical separate screens are ablations, not tuning sets. No threshold based on incomparable focused vs full-root depth. Fixed Pika validation only supports a limited target-build conclusion, never stable Elo.',
   clock:'Readiness outside turn clock. Projection, sampling, IPC, native search, host deadline and process reap inside. No concurrent searches by this script. Other applications/scheduling are not controlled.',
   information:'Moving player filtered view only; dark captures known solely to captor; referee setup seed/real allocation not passed to engines.',
   comparison:'Focused results contain exact full-window scores for identical samples at one nominal depth, at least2 roots unless only1 legal root. Other shallow scores schedule exploration only.',
   draws:'Public threefold/120 quiet plies;400 ply cap unresolved; never evaluation adjudication.'},games:[]};fs.writeFileSync(file,JSON.stringify(r)+'\n');
}
const r=JSON.parse(fs.readFileSync(file)),persist=()=>fs.writeFileSync(file,JSON.stringify(r)+'\n');
for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(hash(p),h,'Frozen source changed: '+p);for(const b of r.builds)assert.equal(hash(b.binary),b.binarySha256);
for(const seed of r.seeds)for(const trialSide of['r','b']){
 if(r.games.some(g=>g.seed===seed&&g.trialSide===trialSide))continue;
 let s=initial(seeded(seed));s.positions=[positionKey(s)];assert.deepEqual(s.board,r.initials.find(x=>x.seed===seed).board);
 const es={trial:new FocusEngine({binary:r.builds[1].binary}),baseline:new FocusEngine({binary:r.builds[0].binary,focused:false})},g={seed,trialSide,startedAt:new Date().toISOString(),log:[]};let active='trial';
 try {
  for(const name of['trial','baseline']){active=name;await es[name].ready();}
  while(!s.result&&s.ply<r.maxPlies){
   active=s.turn===trialSide?'trial':'baseline';await es[active].ready();const start=performance.now(),view=publicState(s,s.turn);for(const p of[...view.board,...view.captured])assert(!p?.hidden||!('type'in p));
   const x=await es[active].search(view,Math.max(1,Math.floor(r.budgetMs-(performance.now()-start)))),elapsedMs=performance.now()-start,legal=legalMoves(view).some(m=>m.from===x.move?.from&&m.to===x.move?.to);
   const row={ply:s.ply+1,engine:active,side:s.turn,move:x.move,elapsedMs,depth:x.depth,fullRootDepth:x.fullRootDepth??x.depth,rootCount:x.rootCount??legalMoves(view).length,comparedCount:x.comparedCount??x.allCandidates.length,searchScope:x.searchScope??'full-root',criticalRoot:x.criticalRoot,tacticalSearch:x.tacticalSearch,quietChecks:x.quietChecksSearched,reintroduced:x.reintroducedCount,expanded:x.collapseExpansions,nodes:x.nodes,score:x.score,threads:x.threads,deadlineStop:x.deadlineStop,fallbackUsed:x.fallbackUsed,clock:x.clock,viewSha256:sha(JSON.stringify(view))};
   if(!legal||elapsedMs>r.budgetMs+r.graceMs){g.log.push(row);g.result={status:'decided',winner:other(s.turn),technicalForfeit:true,offender:active,reason:!legal?'illegal-move':'technical-timeout'};break;}
   const p=s.board[row.move.from],q=s.board[row.move.to];s=move(s,row.move);g.log.push({...row,revealed:p.hidden?s.board[row.move.to].type:null,captured:q,afterSha256:sha(JSON.stringify(s.board))});
   fs.writeFileSync(`${dir}/live.json`,JSON.stringify({variant,stage,seed,trialSide,ply:s.ply,completed:r.games.length,last:row})+'\n');
  }
  if(!g.result)g.result=s.result?.winner?{status:'decided',winner:s.result.winner,reason:s.result.text,technicalForfeit:false}:s.ply>=r.maxPlies?{status:'unresolved',winner:null,reason:'400-ply-cap',technicalForfeit:false}:{status:'draw',winner:null,reason:s.quiet>=120?'120-quiet-plies':'threefold-public-position',technicalForfeit:false};
 }catch(e){g.result={status:'decided',winner:active==='trial'?other(trialSide):trialSide,technicalForfeit:true,offender:active,reason:'process-or-protocol-failure',error:e.stack};}
 finally{for(const e of Object.values(es))await e.close();}
 g.finalState=s;g.initializations=Object.fromEntries(Object.entries(es).map(([n,e])=>[n,e.initializations]));g.finishedAt=new Date().toISOString();r.games.push(g);r.summary=summary(r.games);persist();console.log(JSON.stringify({variant,stage,seed,trialSide,plies:s.ply,result:g.result,summary:r.summary}));
}
r.completedAt=new Date().toISOString();persist();if(fs.existsSync(`${dir}/live.json`))fs.unlinkSync(`${dir}/live.json`);
