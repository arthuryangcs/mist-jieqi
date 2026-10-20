// Run AFTER timed benchmarks/games to avoid performance interference.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {Native} from './bridge.mjs';import {compileFrontier,dir} from './frontier-variants.mjs';
assert(JSON.parse(fs.readFileSync(`${dir}/pipeline.json`)).passed,'Finish serial timed run first');
const file=`${dir}/cap8-exact.json`;assert(!fs.existsSync(file),'Preserve exact audit');
const r={startedAt:new Date().toISOString(),builds:[],checks:[],passed:false},clients={};
try{
 for(const name of ['reference','coverage','cap','combined']){const b=compileFrontier(name,{audit:true});r.builds.push(b);clients[name]=new Native({binary:b.binary});await clients[name].ready;}
 const f=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions[4].fixture;
 const ref=await clients.reference.request(f,{mode:'PLAY',depth:8,budget:300000});assert.equal(ref.depth,8);assert.equal(ref.comparedCount,ref.rootCount);r.reference=ref;
 for(const name of ['coverage','cap','combined']){const x=await clients[name].request(f,{mode:'PLAY',depth:8,budget:300000});assert.equal(x.depth,8);for(const row of x.allCandidates)assert.deepEqual(row,ref.allCandidates.find(q=>q.from===row.from&&q.to===row.to));if(name!=='coverage'){assert.equal(x.comparedCount,x.rootCount);assert.equal(x.fullRootDepth,8);assert(x.capFillRoots>0);}else assert(x.fullRootDepth>=7);r.checks.push({name,result:x,passed:true});}
 r.passed=true;
}catch(e){r.error=e.stack;throw e;}finally{for(const c of Object.values(clients))await c.close();r.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));if(Object.values(r.stderr).some(Boolean))r.passed=false;r.finishedAt=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(r)+'\n');console.log(JSON.stringify({passed:r.passed,checks:r.checks.length,error:r.error}));}
