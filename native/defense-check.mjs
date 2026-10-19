import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initial,publicState,pseudo,other,move,legalMoves,inCheck} from '../engine.js';
import {seeded,values,remaining} from '../ai.js';
import {Native,fixture,encode,compare} from './bridge.mjs';
import {compileDefense,dir,sha} from './defense-variants.mjs';
const sanitizer=process.argv.includes('--asan')?'address,undefined':process.argv.includes('--tsan')?'thread':null;
const kind=sanitizer==='thread'?'tsan':sanitizer?'asan':'release',clients={},fast=process.argv.includes('--fast'),cached=process.argv.includes('--cache'),lazy=process.argv.includes('--lazy');
const variants=lazy?['kingFast','kingLazy']:cached?['kingFast','kingCached']:fast?['hanging','kingFast','combinedFast']:['threats','king','both'];
const record={kind,startedAt:new Date().toISOString(),builds:[],cases:[],searches:[],passed:false};
const types='KRNBCAP';
export function referenceDefense(s){
 const counts=[Array(90).fill(0),Array(90).fill(0)],cheapest=[Array(90).fill(1000000),Array(90).fill(1000000)];
 const means=['r','b'].map(side=>{const pool=remaining(s,side);return pool.length?pool.reduce((a,t)=>a+values[t],0)/pool.length:0;});
 const material=p=>p.hidden?means[p.side==='r'?0:1]:values[p.type];
 // Independent exhaustive target enumeration using the JS rules, with a virtual
 // opposing occupant at each target. This includes defenses and cannon controls.
 for(let f=0;f<90;f++){
  const p=s.board[f];if(!p)continue;const side=p.side==='r'?0:1,b=[...s.board];
  for(let t=0;t<90;t++)if(t!==f){const old=b[t];b[t]={side:other(p.side),type:old?.type==='K'&&!old.hidden?'K':'P',hidden:false};
   if(pseudo(b,f,t)){counts[side][t]++;cheapest[side][t]=Math.min(cheapest[side][t],material(p));}b[t]=old;
  }
 }
 const threats=[0,0],king=[0,0],hanging=[0,0];
 for(let i=0;i<90;i++){const p=s.board[i];if(!p||(!p.hidden&&p.type==='K'))continue;const side=p.side==='r'?0:1;if(!counts[side^1][i])continue;
  threats[side]+=counts[side][i]?0.10*Math.max(0,material(p)-cheapest[side^1][i]):0.18*material(p);
  if(!counts[side][i])hanging[side]+=0.18*material(p);
 }
 for(const [side,color]of ['r','b'].entries()){
  const k=s.board.findIndex(p=>p?.side===color&&!p.hidden&&p.type==='K');if(k<0)continue;
  let controlled=0,safe=0;for(let t=0;t<90;t++){
   const x=t%9,y=Math.floor(t/9);if(Math.abs(x-k%9)+Math.abs(y-Math.floor(k/9))!==1||x<3||x>5||!(side===0?y>=7:y<=2))continue;
   if(counts[side^1][t])controlled++;else if(s.board[t]?.side!==color)safe++;
  }
  king[side]=20*Number(counts[side^1][k]>0)+12*controlled+(controlled?18*Math.max(0,2-safe):0);
 }
 return {attacks:counts,cheapest,threats,king,hanging};
}
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
try {
 for(const name of ['baseline',...variants]){const b=compileDefense(name,{audit:true,sanitizer});record.builds.push(b);clients[name]=new Native({binary:b.binary});await clients[name].ready;}
 const cases=[];
 for(const seed of [12007,12011,12037,12041]){const rng=seeded(seed);let s=initial(rng);for(let ply=0;ply<=48&&!s.result;ply++){
  if(ply%12===0)for(const viewer of ['r','b',null])cases.push({name:`${seed}/${ply}/${viewer}`,fixture:fixture(publicState(s,viewer),{seed:12071,samples:4})});
  const ms=legalMoves(s);if(!ms.length)break;s=move(s,ms[Math.floor(rng()*ms.length)]);
 }}
 // Explicit paired geometries: screen count, friendly defense, horse/elephant
 // blockers, dark advisor/elephant limits, revealed cross-river advisors.
 for(const role of types)for(const hidden of [false,true])for(const mirrored of [false,true]){
  if(hidden&&role==='K')continue;
  let board=Array(90).fill(null),put=(i,side,type,h=false)=>board[i]={side,type,role:type,hidden:h};
  put(85,'r','K');put(4,'b','K');put(40,'r',role,hidden);put(49,'r','P');put(22,'b','C');put(58,'b','N');put(50,'r','A');put(60,'b','B');put(31,'b','P');
  if(role==='K')board[85]=null;
  if(mirrored)board=board.reverse().map(p=>p?{...p,side:other(p.side)}:null);
  const s={board,captured:[],turn:mirrored?'b':'r',ply:0,quiet:0,positions:[],result:null};
  cases.push({name:`geometry/${role}/${hidden}/${mirrored}`,fixture:fixture(publicState(s,s.turn),{seed:12097,samples:2})});
 }
 for(const c of cases){
  const w={...c.fixture.view,...c.fixture.worlds[0]},reference=referenceDefense(w),base=await clients.baseline.request(c.fixture,{mode:'VERIFY',depth:0});
  assert.deepEqual(base.defense.attacks,reference.attacks);assert.deepEqual(base.defense.cheapest,reference.cheapest);
  for(let i=0;i<2;i++){close(base.defense.threats[i],reference.threats[i]);close(base.defense.king[i],reference.king[i]);}
  for(const name of variants){
   const r=await clients[name].request(c.fixture,{mode:'VERIFY',depth:0});assert.deepEqual(r.defense,base.defense);
   for(const [side,color]of ['r','b'].entries()){
    assert.deepEqual(r.sides[side].legal,legalMoves(w,color));assert.equal(r.sides[side].check,inCheck(w.board,color));
    const threatTerms=fast?reference.hanging:reference.threats;
    const delta=(!['king','kingFast','kingCached','kingLazy'].includes(name)?threatTerms[side^1]-threatTerms[side]:0)+(!['threats','hanging'].includes(name)?reference.king[side^1]-reference.king[side]:0);
    close(r.sides[side].score,base.sides[side].score+delta);
   }
   close(r.sides[0].score,-r.sides[1].score);
   assert(r.transitions.every(t=>t.restored));
   const rotated=structuredClone(c.fixture);rotated.view.board.reverse();rotated.worlds=rotated.worlds.map(w=>({...w,board:w.board.toReversed()}));
   for(const b of [rotated.view.board,...rotated.worlds.map(w=>w.board)])for(const p of b)if(p)p.side=other(p.side);
   rotated.view.turn=other(rotated.view.turn);rotated.view.viewer=rotated.view.viewer?other(rotated.view.viewer):null;
   rotated.view.captured=rotated.view.captured.map(p=>({...p,side:other(p.side),...(p.capturedBy?{capturedBy:other(p.capturedBy)}:{})}));
   const mirror=await clients[name].request(rotated,{mode:'VERIFY',depth:0});close(r.sides[0].score,mirror.sides[1].score);
   const changed=structuredClone(c.fixture);for(const world of changed.worlds)for(const p of world.board)if(p?.hidden)p.type='R';
   const masked=await clients[name].request(changed,{mode:'VERIFY',depth:0});assert.deepEqual(masked.defense,r.defense);close(masked.sides[0].score,r.sides[0].score);
  }
  record.cases.push({name:c.name,transitions:base.transitions.length,passed:true});
 }
 const ps=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
 for(const name of variants){
  for(const p of [ps[0],ps[2],ps[4]]){
   const full=await clients[name].request(p.fixture,{depth:3,budget:300000});assert.equal(full.depth,3);assert(legalMoves(p.fixture.view).some(m=>m.from===full.move.from&&m.to===full.move.to));
   const again=await clients[name].request(p.fixture,{depth:3,budget:300000});compare(full,again);
   for(const nodeLimit of [1000,10000]){const r=await clients[name].request(p.fixture,{depth:8,nodeLimit});assert.equal(r.threads,1);assert(r.interruptedDepth>r.depth);}
   record.searches.push({name,position:p.name,depth:full.depth,passed:true});
  }
  for(const budget of [0,5,25,100]){const r=await clients[name].request(ps[0].fixture,{depth:8,budget});assert(r.interruptedDepth>r.depth);assert.equal(r.iterations.length,r.depth);}
  // Private captured-piece contexts must not persist in a later request.
  let s=move(initial(seeded(17)),{from:64,to:1});s=move(s,{from:25,to:88});const views=['r','b','r'].map(v=>fixture(publicState(s,v),{seed:12097}));
  const rows=[];for(const f of views)rows.push(await clients[name].request(f,{depth:3}));compare(rows[0],rows[2]);assert.notEqual(encode(views[0]),encode(views[1]));
 }
 for(const viewer of ['r','b',null])assert.equal(encode(fixture(publicState(initial(seeded(1)),viewer))),encode(fixture(publicState(initial(seeded(999)),viewer))));
 if(cached)for(const p of ps){
  const depth=p.depth+1,a=await clients.kingFast.request(p.fixture,{depth,budget:300000}),b=await clients.kingCached.request(p.fixture,{depth,budget:300000});compare(a,b);
  for(let i=0;i<a.iterations.length;i++)assert.deepEqual(b.iterations[i].allCandidates,a.iterations[i].allCandidates);
  assert(b.pressureCacheHits>0);record.searches.push({name:'cached-exact',position:p.name,depth,hits:b.pressureCacheHits,misses:b.pressureCacheMisses,passed:true});
 }
 if(lazy)for(const p of [...ps,...JSON.parse(fs.readFileSync('benchmarks/pika-native-match/gap-counterfactuals.json')).cases.filter(c=>[49,31,70].includes(c.ply)).map(c=>({name:`diagnostic/${c.seed}/${c.ply}`,fixture:fixture(c.view,{seed:12097}),depth:c.actual.depth-1}))]){
  const depth=p.depth+1,a=await clients.kingFast.request(p.fixture,{depth,budget:300000}),b=await clients.kingLazy.request(p.fixture,{depth,budget:300000});compare(a,b,{requireNodes:false});
  for(let i=0;i<a.iterations.length;i++)assert.deepEqual(b.iterations[i].allCandidates,a.iterations[i].allCandidates);
  record.searches.push({name:'lazy-exact',position:p.name,depth,nodes:[a.nodes,b.nodes],passed:true});
 }
 record.informationIsolation=true;record.passed=true;
}catch(e){record.error=e.stack;throw e;}
finally{
 for(const c of Object.values(clients))await c.close();record.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));if(Object.values(record.stderr).some(Boolean))record.passed=false;
 record.finishedAt=new Date().toISOString();fs.writeFileSync(`${dir}/check-${lazy?'lazy-':cached?'cached-':fast?'fast-':''}${kind}.json`,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({kind,fast,cached,lazy,passed:record.passed,cases:record.cases.length,searches:record.searches.length,error:record.error}));
}
