import fs from 'node:fs';import assert from 'node:assert/strict';
import {Native,fixture,encode,compare} from './bridge.mjs';
import {compileAspiration} from './aspiration2-variants.mjs';
import {initial,publicState,move,legalMoves,inCheck} from '../engine.js';import {seeded} from '../ai.js';
const kind=process.argv.includes('--asan')?'asan':process.argv.includes('--tsan')?'tsan':'release';
const variant=process.argv.find(x=>x.startsWith('--variant='))?.split('=')[1]||'bothFast';assert(['bothFast','refreshFast','refreshLookup','asp'].includes(variant));
const sanitizer=kind==='asan'?'address,undefined':kind==='tsan'?'thread':null;
const record={kind,variant,startedAt:new Date().toISOString(),builds:[],rules:[],searches:[],passed:false},clients={};
const ps=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
const layer=(r,i)=>{const x=r.iterations[i],t=x.allCandidates[0];return {...x,samples:r.samples,score:t.score,move:{from:t.from,to:t.to}};};
try {
 for(const n of ['baseline',variant]){const b=compileAspiration(n,{audit:true,sanitizer});const key=n==='baseline'?'baseline':'bothFast';clients[key]=new Native({binary:b.binary});delete b.binary;record.builds.push(b);await clients[key].ready;}
 const cases=[];
 for(const seed of [10007,10009,10037]){const rng=seeded(seed);let s=initial(rng);for(let ply=0;ply<=32&&!s.result;ply++){
  if(ply%8===0)for(const viewer of ['r','b',null])cases.push({name:`${seed}/${ply}/${viewer}`,fixture:fixture(publicState(s,viewer),{seed:10061,samples:4})});
  const ms=legalMoves(s);if(!ms.length)break;s=move(s,ms[Math.floor(rng()*ms.length)]);
 }}
 for(const c of cases){
  const w={...c.fixture.view,...c.fixture.worlds[0]},a=await clients.baseline.request(c.fixture,{mode:'VERIFY',depth:1}),b=await clients.bothFast.request(c.fixture,{mode:'VERIFY',depth:1});
  // Native.request also attaches independently measured IPC wallMs.
  assert.deepEqual({sides:b.sides,transitions:b.transitions},{sides:a.sides,transitions:a.transitions});
  for(const [i,side]of ['r','b'].entries()){assert.deepEqual(b.sides[i].legal,legalMoves(w,side));assert.equal(b.sides[i].check,inCheck(w.board,side));}
  assert(b.transitions.every(t=>t.restored));record.rules.push({name:c.name,transitions:b.transitions.length,passed:true});
 }
 // All exact per-world root scores are retained in diagnostic binaries.
 for(const p of (kind==='release'?ps:[ps[0],ps[2],ps[4]])) {
  const depth=p.depth+1,a=await clients.baseline.request(p.fixture,{depth,budget:300000}),b=await clients.bothFast.request(p.fixture,{depth,budget:300000});
  compare(a,b,{requireNodes:false});for(let i=0;i<a.iterations.length;i++){
   compare(layer(a,i),layer(b,i),{requireNodes:false});
   const xs=a.iterations[i].allCandidates,ys=b.iterations[i].allCandidates;
   for(let j=0;j<xs.length;j++)assert.deepEqual(xs[j].sampleScores,ys[j].sampleScores);
  }
  record.searches.push({name:p.name,depth:b.depth,nodes:b.nodes,windowStats:b.windowStats,passed:true});
 }
 const f=ps[0].fixture;
 for(const nodeLimit of [1000,10000]){const a=await clients.baseline.request(f,{depth:8,nodeLimit}),b=await clients.bothFast.request(f,{depth:8,nodeLimit});compare(a,b);assert.equal(b.threads,1);record.searches.push({nodeLimit,depth:b.depth,nodes:b.nodes,passed:true});}
 const complete=await clients.bothFast.request(f,{depth:4,budget:300000});
 for(const budget of [0,5,25,100]){
  const r=await clients.bothFast.request(f,{depth:8,budget});assert.equal(r.threads,4);assert(r.interruptedDepth>r.depth);
  assert.equal(r.iterations.length,r.depth);for(let i=0;i<r.depth;i++)compare(layer(complete,i),layer(r,i),{requireNodes:false});
  record.searches.push({budget,depth:r.depth,interruptedDepth:r.interruptedDepth,passed:true});
 }
 compare(await clients.baseline.request(f,{depth:2}),await clients.bothFast.request(f,{depth:2}));
 for(const viewer of ['r','b',null])assert.equal(encode(fixture(publicState(initial(seeded(1)),viewer))),encode(fixture(publicState(initial(seeded(999)),viewer))));
 let s=move(initial(seeded(17)),{from:64,to:1});s=move(s,{from:25,to:88});
 const views=['r','b','r'].map(viewer=>fixture(publicState(s,viewer),{seed:10067,samples:8})),results=[];
 for(const f of views){const a=await clients.baseline.request(f,{depth:3}),b=await clients.bothFast.request(f,{depth:3});compare(a,b);results.push(b);}
 compare(results[0],results[2]);assert.notEqual(encode(views[0]),encode(views[1]));record.informationIsolation=true;record.sameProcessRecovery=true;
 record.passed=true;
}catch(e){record.error=e.stack;throw e;}
finally{for(const c of Object.values(clients))await c.close();record.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));if(Object.values(record.stderr).some(Boolean)){record.passed=false;process.exitCode=1;}record.finishedAt=new Date().toISOString();fs.writeFileSync(`benchmarks/aspiration2/check-${variant}-${kind}.json`,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({kind,variant,passed:record.passed,rules:record.rules.length,searches:record.searches.length,error:record.error}));}
