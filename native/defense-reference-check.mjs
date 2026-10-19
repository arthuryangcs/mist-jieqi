import fs from 'node:fs';import assert from 'node:assert/strict';
import {Native,compare,fixture,observationSeed}from'./bridge.mjs';
import {compileDefense,dir}from'./defense-variants.mjs';import{reference}from'./defense-reference.mjs';
const record={startedAt:new Date().toISOString(),rows:[],passed:false};let native;
try {
 const build=compileDefense('kingLazy',{audit:true});record.build=build;native=new Native({binary:build.binary});await native.ready;
 const js=await reference(),positions=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
 for(const p of positions){
  const f=p.fixture,w={...f.view,...f.worlds[0]},v=await native.request(f,{mode:'VERIFY',depth:0});
  for(const [i,side]of ['r','b'].entries())assert(Math.abs(v.sides[i].score-js.evaluate(w,side))<1e-7);
  for(const row of v.transitions)assert(row.restored);
  const iterations=[],a=js.analyze(f.view,{seed:f.seed,samples:f.samples,fixedWorlds:f.worlds,maxDepth:p.depth,timeMs:300000,onProgress:r=>iterations.push(r)}),b=await native.request(f,{depth:p.depth,budget:300000});
  const same=compare(a,b,{requireNodes:f.samples===1});record.rows.push({name:p.name,depth:p.depth,...same,passed:true});
 }
 const ds=JSON.parse(fs.readFileSync('benchmarks/pika-native-match/gap-counterfactuals.json')).cases;
 for(const c of ds){
  const f=fixture(c.view,{seed:observationSeed(c.view)}),depth=2,a=js.analyze(f.view,{seed:f.seed,samples:f.samples,fixedWorlds:f.worlds,maxDepth:depth,timeMs:300000}),b=await native.request(f,{depth,budget:300000});
  const same=compare(a,b,{requireNodes:f.samples===1});record.rows.push({name:`diagnostic/${c.seed}/${c.ply}`,depth,...same,passed:true});
 }
 record.passed=true;
}catch(e){record.error=e.stack;throw e;}finally{
 if(native){await native.close();record.stderr=native.stderr;if(native.stderr)record.passed=false;}
 record.finishedAt=new Date().toISOString();fs.writeFileSync(`${dir}/reference-check.json`,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({passed:record.passed,rows:record.rows.length,error:record.error}));
}
