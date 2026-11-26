import test from'node:test';import assert from'node:assert/strict';
import{cases,mirror}from'./cases.mjs';import{transitionEvidence,inspectCycle}from'./signals.mjs';
const fixtures=cases(),at=(g,p)=>fixtures.find(c=>c.game===g&&c.ply===p),evidence=c=>transitionEvidence(c.before,c.played,{after:c.after}),find=(e,from,to)=>e.threats.find(t=>t.move.from===from&&t.move.to===to);
test('6:42/150 direct mate and44/148 six-kind geometry vs feasible inventory',()=>{
 for(const p of[42,150]){const e=evidence(at(6,p)),t=find(e,45,81);assert(t);assert.equal(e.givesCheck,false);assert.equal(e.isEvasion,false);assert.equal(e.beforeMateAvailable,false);assert.equal(e.newlyAvailableMate,true);assert.deepEqual(t.mate.identities,['C']);assert.equal(t.mateNovelty,'new-action');}
 for(const p of[44,148]){const e=evidence(at(6,p)),t=find(e,19,82);assert(t);assert.deepEqual(t.noImmediateRecapture.identities,['R','N','B','A','C','P']);assert.deepEqual(t.mate.identities,['C']);assert.deepEqual(t.mate.inventoryFeasibleIdentities,['N','B','C','P']);assert.equal(t.mate.feasibleQuantifier,'some-feasible-identities');assert(t.branches.every(b=>b.directRecaptures.length===0));assert.equal(t.captureNovelty,'new-action');}
 assert(!fixtures.some(c=>c.game===6&&c.ply===152));
});
test('3:106/190 nonchecking rook action is not continuous check or proved idle',()=>{
 for(const p of[106,190]){const c=at(3,p),e=inspectCycle(c.after,{maxMs:Infinity});assert.deepEqual(c.played,{from:80,to:71});assert.equal(e.givesCheck,false);assert.equal(e.afterMateAvailable,false);assert.equal(e.existingRuling.status,'review-required');assert.equal(e.existingRuling.checks.b,15);assert.equal(e.existingRuling.moves.b,18);assert.equal(e.adjudicationChanged,false);assert(!Object.hasOwn(e,'winner'));}
});
test('4:new rook mate actions, old pawn threat continued; checking return is distinct',()=>{
 for(const p of[98,158]){const e=evidence(at(4,p));assert.equal(e.givesCheck,false);assert.equal(find(e,39,41).mateNovelty,'new-action');assert.equal(find(e,0,27).captureNovelty,'continued-action');}
 for(const p of[112,172]){const e=evidence(at(4,p));assert.equal(find(e,39,84).mateNovelty,'new-action');}
 for(const p of[116,176]){const e=evidence(at(4,p));assert.equal(e.givesCheck,true);assert.equal(e.localNoncheckingRiskCandidate,false);assert.equal(e.afterMateAvailable,false);}
});
test('both-color rotation preserves branch facts and novelty',()=>{
 for(const c of fixtures){const a=evidence(c),v=mirror(c.before),after=mirror(c.after),b=transitionEvidence(v,{from:89-c.played.from,to:89-c.played.to},{after});
  assert.equal(a.givesCheck,b.givesCheck);assert.equal(a.isEvasion,b.isEvasion);assert.equal(a.beforeMateAvailable,b.beforeMateAvailable);assert.equal(a.afterMateAvailable,b.afterMateAvailable);
  for(const t of a.threats){const u=find(b,89-t.move.from,89-t.move.to);assert(u);assert.deepEqual(t.mate,u.mate);assert.deepEqual(t.noImmediateRecapture,u.noImmediateRecapture);assert.equal(t.mateNovelty,u.mateNovelty);assert.equal(t.captureNovelty,u.captureNovelty);}
 }
});
test('private dark captures/worlds/seed cannot influence evidence; hidden truth rejected',()=>{
 const c=at(6,44),clean=evidence(c),v=structuredClone(c.before);v.captured.push({side:'b',hidden:false,wasHidden:true,capturedBy:'r',get type(){throw Error('Private capture read');}});Object.defineProperty(v,'worlds',{get(){throw Error('World read');}});Object.defineProperty(v,'seed',{get(){throw Error('Seed read');}});
 const r=transitionEvidence(v,c.played,{after:c.after});delete r.elapsedMs;delete clean.elapsedMs;assert.deepEqual(r,clean);
 const bad=structuredClone(c.before);bad.board.find(p=>p?.hidden).type='R';assert.throws(()=>transitionEvidence(bad,c.played),/Hidden truth/);
});
test('evasion, incomplete scan and disabled mode are never a loss/draw ruling',()=>{
 const board=Array(90).fill(null),p=(side,type)=>({side,type,role:type,hidden:false});board[85]=p('r','K');board[4]=p('b','K');board[76]=p('b','R');const s={board,turn:'r',captured:[],positions:[],quiet:0,ply:0};
 const e=transitionEvidence(s,{from:85,to:84});assert.equal(e.isEvasion,true);assert.equal(e.localNoncheckingRiskCandidate,false);assert.equal(e.adjudicationChanged,false);
 const b=Array(90).fill(null);b[85]=p('r','K');b[4]=p('b','K');b[49]=p('b','R');b[75]=p('r','R');const block=transitionEvidence({...s,board:b},{from:75,to:76});assert(block.isEvasion);assert(block.threats.some(t=>t.move.from===76&&t.move.to===49&&t.captureNovelty==='new-action'));assert.equal(block.adjudicationChanged,false);
 const c=at(6,42),before=structuredClone(c.before),partial=transitionEvidence(c.before,c.played,{maxMs:0});assert.equal(partial.complete,false);assert.equal(partial.beforeMateAvailable,null);assert.equal(partial.localNoncheckingRiskCandidate,null);assert.deepEqual(c.before,before);
 const off=inspectCycle(c.after,{enabled:false});assert.equal(off.enabled,false);assert.equal(off.available,false);assert.equal(off.adjudicationChanged,false);
});
