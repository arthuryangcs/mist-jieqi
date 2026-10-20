import fs from 'node:fs';import assert from 'node:assert/strict';
import {Native} from './bridge.mjs';import {compileFrontier,dir} from './frontier-variants.mjs';
const suffix=process.env.FRONTIER_RUN_LABEL?'-'+process.env.FRONTIER_RUN_LABEL:'',file=`${dir}/invariants${suffix}.json`;assert(!fs.existsSync(file));
const r={startedAt:new Date().toISOString(),builds:[],checks:[],passed:false},clients={};
try{
 for(const name of ['old','coverage','cap','combined','reference']){const b=compileFrontier(name,{audit:true});r.builds.push(b);clients[name]=new Native({binary:b.binary});await clients[name].ready;}
 const f=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions[0].fixture,reference=await clients.reference.request(f,{mode:'PLAY',depth:4,budget:300000});
 const old=await clients.old.request(f,{mode:'PLAY',depth:4,budget:300000});assert(old.comparedCount<old.rootCount);
 for(const name of ['cap','combined']){const x=await clients[name].request(f,{mode:'PLAY',depth:4,budget:300000});assert.equal(x.depth,4);assert.equal(x.comparedCount,x.rootCount);assert.equal(x.fullRootDepth,4);assert(x.capFillRoots>0);
  for(const row of x.allCandidates)assert.deepEqual(row,reference.allCandidates.find(q=>q.from===row.from&&q.to===row.to));r.checks.push({name:name+' fills ceiling omissions without changing per-world scores',oldCount:old.comparedCount,rootCount:x.rootCount,filled:x.capFillRoots,passed:true});}
 for(const name of ['coverage','combined'])for(const budget of [0,25,100,400,1000]){
  const progress=[],x=await clients[name].request(f,{mode:'STREAM_PLAY',depth:8,budget,onProgress:v=>progress.push(v)});
  for(const [i,row]of [...progress,x].entries()){assert.equal(row.comparedCount,row.allCandidates.length);assert(row.samples===f.samples);if(row.depth){assert(row.comparedCount>=row.minimumComparisonRoots);assert(row.depth<=3||row.fullRootDepth>=row.depth-1);assert.equal(row.comparisonDepth,row.depth);}if(i){const previous=progress[i-1];assert(row.depth>=previous.depth);if(row.depth===previous.depth)assert(row.comparedCount>=previous.comparedCount);}}
  r.checks.push({name:name+' monotone common-depth stream',budget,depth:x.depth,full:x.fullRootDepth,count:x.comparedCount,progress:progress.length,passed:true});
 }
 r.passed=true;
}catch(e){r.error=e.stack;throw e;}finally{for(const c of Object.values(clients))await c.close();r.finishedAt=new Date().toISOString();r.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));if(Object.values(r.stderr).some(Boolean))r.passed=false;fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({passed:r.passed,checks:r.checks.length,error:r.error}));}
