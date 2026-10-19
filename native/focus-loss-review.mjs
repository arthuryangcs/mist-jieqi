// Post-hoc diagnostics only, after timed matches finish. No engine tuning.
// Compare recorded completed roots to a full-root reference at the SAME depth,
// SAME samples and SAME tactical/canonical policy. Extra time is diagnostic,
// never substituted into a tournament result or presented as an equal-time win.
import fs from'node:fs';import assert from'node:assert/strict';
import{initial,publicState,move,positionKey}from'../engine.js';import{seeded}from'../ai.js';import{fixture,observationSeed,Native}from'./bridge.mjs';
import{compileFocus,originalBuild,dir,sha}from'./focus-variants.mjs';import{FocusEngine}from'./focus-engine.mjs';
assert(JSON.parse(fs.readFileSync(`${dir}/pika-both.json`)).completedAt,'Do not overlap timed games with diagnostic searches');
const matches=JSON.parse(fs.readFileSync(`${dir}/matches-both-screen-production.json`)),file=`${dir}/loss-review.json`;assert(!fs.existsSync(file),'Keep prior diagnosis');
const cases=[];
for(const g of matches.games.filter(g=>g.result.status==='decided'&&!g.result.technicalForfeit&&g.result.winner!==g.trialSide)){
 let s=initial(seeded(g.seed));s.positions=[positionKey(s)];const choices=[];
 for(const[i,row]of g.log.entries()){
  const reply=g.log[i+1],next=g.log[i+2];
  if(row.engine==='trial'&&row.depth>=4&&row.searchScope==='focused-root')choices.push({row,view:publicState(s,s.turn),moverHidden:s.board[row.move.from].hidden,capture:!!s.board[row.move.to],stableKnownMoves:!row.revealed&&!row.captured&&reply&&!reply.revealed&&!reply.captured,scoreDropToNextTurn:next?.engine==='trial'?row.score-next.score:0});
  s=move(s,row.move);
 }
 // Prioritize a quiet known-move pair with a later own-score fall. Differences
 // across turns/depths only SELECT examples; they never score a root decision.
 const stable=choices.filter(c=>c.stableKnownMoves),pool=stable.length?stable:choices;
 pool.sort((a,b)=>b.scoreDropToNextTurn-a.scoreDropToNextTurn);
 const item=pool[0];if(item)cases.push({seed:g.seed,trialSide:g.trialSide,...item});if(cases.length===3)break;
}
const r={startedAt:new Date().toISOString(),selection:'Post-hoc3 losing games, prioritize known quiet move/reply pairs before an own-score fall. Cross-turn scores schedule diagnostics only. Biased set, not an error-rate estimate.',rows:[],passed:false},build=compileFocus('tacticalCanonical',{audit:true});r.referenceBuild=build;let native;
try{
 native=new Native({binary:build.binary});await native.ready;
 for(const c of cases){
  assert.equal(sha(JSON.stringify(c.view)),c.row.viewSha256);const f=fixture(c.view,{seed:observationSeed(c.view)}),full=await native.request(f,{mode:'PLAY',depth:c.row.depth,budget:300000});assert.equal(full.depth,c.row.depth);assert.equal(full.comparedCount,full.rootCount);
  const selected=full.allCandidates.find(m=>m.from===c.row.move.from&&m.to===c.row.move.to);assert(selected);assert(Math.abs(selected.score-c.row.score)<1e-7,'Recorded partial result must match canonical same-depth full-root score');
  const first=full.allCandidates[0],gap=first.score-selected.score,replays=[];
  for(let repeat=0;repeat<3;repeat++){const base=new FocusEngine({binary:originalBuild().binary,focused:false});try{await base.ready();const x=await base.search(c.view,400),row=full.allCandidates.find(m=>m.from===x.move.from&&m.to===x.move.to);replays.push({repeat,move:x.move,depth:x.depth,elapsedMs:x.elapsedMs,deadlineStop:x.deadlineStop,clock:x.clock,referenceScoreAtRecordedDepth:row?.score});}finally{await base.close();}}
  r.rows.push({seed:c.seed,trialSide:c.trialSide,ply:c.row.ply,stableKnownMoves:c.stableKnownMoves,diagnosticSelectionScoreDrop:c.scoreDropToNextTurn,view:c.view,viewSha256:c.row.viewSha256,recorded:c.row,depth:c.row.depth,samples:f.samples,worldHashes:f.worldHashes,reference:full,selectedScoreMatched:true,selectedAtRecordedDepth:selected,fullBest:first,gap,omittedHigherCandidate:gap>1e-7,baseline400msReplays:replays});
  fs.writeFileSync(file,JSON.stringify(r)+'\n');console.log(JSON.stringify({seed:c.seed,ply:c.row.ply,depth:c.row.depth,selected:c.row.move,fullBest:{from:first.from,to:first.to},gap}));
 }
 r.passed=true;
}catch(e){r.error=e.stack;throw e;}finally{if(native){await native.close();r.stderr=native.stderr;if(native.stderr)r.passed=false;}r.finishedAt=new Date().toISOString();r.limitation='A same-depth model gap demonstrates root-coverage loss, not a proof that an alternative saves the game. Baseline replays do not replace any original game. Added diagnostic time is not a strength result.';fs.writeFileSync(file,JSON.stringify(r)+'\n');console.log(JSON.stringify({passed:r.passed,rows:r.rows.length,error:r.error}));}
