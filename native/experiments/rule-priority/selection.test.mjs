import test from'node:test';import assert from'node:assert/strict';
import {counterexample}from'./case.mjs';import{context,selectResult,fallback,key,snapshot}from'./selection.mjs';
import {loadDeadline}from'./entry-source.mjs';import{mergeMetrics}from'./selection.mjs';
test('explicit unscored false is authoritative; missing metrics are not filled from depth',()=>{
 const{view}=counterexample(),c=context(view),m=c.legal.find(m=>!c.losses.has(key(m)));
 const input={move:m,depth:2,score:0,completedDepth:null,comparedCount:0,rootCount:16,selectedHasSameDepthScore:false,candidates:[{...m,score:0}]},x=selectResult(input,c),y=mergeMetrics(x,null,{deadlineStop:true});
 assert.equal(y.selectedHasSameDepthScore,false);assert.equal(y.score,null);assert.equal(y.completedDepth,null);assert.equal(y.comparedCount,0);assert(!Object.hasOwn(y,'samples'));assert(!Object.hasOwn(y,'fullRootDepth'));
});
test('185: proved loss is behind an unproved negative score, including risk-ranked rows',()=>{
 const {view}=counterexample(),c=context(view),bad=c.proofs[0],other=c.legal.find(m=>!c.losses.has(key(m)));
 const r={move:bad,depth:6,samples:15,comparedCount:4,rootCount:16,completedDepth:5,fullRootDepth:5,allCandidates:[{...bad,score:-3594.878728264789},{...other,score:-9999999}]};
 const out=selectResult(r,c);assert.deepEqual(out.move,other);assert.equal(out.score,-9999999);assert.equal(out.selectedHasSameDepthScore,true);assert.equal(out.selectedScoreDepth,6);
 for(const k of['samples','comparedCount','rootCount','completedDepth','fullRootDepth'])assert.equal(out[k],r[k]);
});
test('omitted root can be selected without pretending it has a same-depth score',()=>{
 const {view}=counterexample(),c=context(view),bad=c.proofs[0],r={move:bad,score:-3594,depth:6,comparedCount:4,rootCount:16,completedDepth:5,fullRootDepth:5,candidates:[{...bad,score:-3594}]};
 const out=selectResult(r,c);assert(!c.losses.has(key(out.move)));assert.equal(out.score,null);assert.equal(out.selectedHasSameDepthScore,false);assert.equal(out.selectedScoreDepth,null);assert(!Object.hasOwn(out,'samples'));assert(snapshot(out).missing.includes('samples'));assert.equal(out.comparedCount,4);
});
test('zero score, zero metrics and false are preserved; all-proved still returns legal move',()=>{
 const{view}=counterexample(),c=context(view),m=c.legal.find(m=>!c.losses.has(key(m))),out=selectResult({move:m,depth:1,samples:0,completedDepth:0,fullRootDepth:0,comparedCount:1,rootCount:16,deadlineStop:false,allCandidates:[{...m,score:0}]},c);
 assert.equal(out.score,0);assert.equal(out.samples,0);assert.equal(out.completedDepth,0);assert.equal(out.deadlineStop,false);assert.equal(out.selectedHasSameDepthScore,true);
 const all={...c,losses:new Set(c.legal.map(key))},f=fallback(all);assert(c.legal.some(m=>key(m)===key(f.move)));assert.equal(f.selectedProvenRuleLoss,true);assert.equal(f.selectedHasSameDepthScore,false);
});
test('real deadline entry: cached progress vs JS pre-frame fallback; stale/cancelled results ignored',async()=>{
 const{startTimedSearch}=await loadDeadline(),{view}=counterexample(),c=context(view),bad=c.proofs[0];
 for(const cached of[false,true]){let timer,done,now=0,worker={engine:'javascript',postMessage(){},terminate(){this.stopped=true;}};
  startTimedSearch({worker,id:7,view,timeMs:2000,clock:()=>now,setTimer:f=>(timer=f,1),clearTimer(){},onComplete:r=>{assert(!done);done=r;}});
  if(cached)worker.onmessage({data:{id:7,progress:true,result:{move:bad,score:-3594,depth:6,samples:15,comparedCount:4,rootCount:16,completedDepth:5,fullRootDepth:5,candidates:[{...bad,score:-3594}]}}});
  now=2000;timer();assert(worker.stopped);assert(!c.losses.has(key(done.move)));assert.equal(done.selectedHasSameDepthScore,false);assert.equal(done.score,null);assert.equal(done.samples,cached?15:0);assert.equal(done.comparedCount,cached?4:0);assert.equal(done.rootCount,16);assert.equal(done.completedDepth,cached?5:0);assert.equal(done.fullRootDepth,cached?5:0);assert.equal(done.deadlineStop,true);
  const before=structuredClone(done);worker.onmessage({data:{id:7,result:{move:bad,depth:99}}});assert.deepEqual(done,before);
 }
});
