import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {Native,compare} from '../../bridge.mjs';
import {ClockNative} from '../coverage-validation/engines.mjs';
import {baseline,cache,dir,hash} from './build.mjs';
const binary=path.resolve(cache+'/mist-geometry'),manifest=JSON.parse(fs.readFileSync(cache+'/build.json'));assert.equal(hash(binary),manifest.binarySha256);
const positions=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
const r={passed:false,build:manifest,runtime:process.version,cpu:os.cpus()[0].model,fixtureHash:hash('benchmarks/native-benchmark.json'),repeats:5,protocol:'Same fixed worlds and ordering, warmed clients, alternating order, serial requests; fixed node cap forces single lane. Wall includes encode/IPC; core excludes them. No reserve change.',fixed:[],timed:[]};
const clients={baseline:new Native({binary:baseline}),trial:new Native({binary})};
const median=a=>{a=[...a].sort((a,b)=>a-b);return a[(a.length-1)>>1];};
const persist=()=>fs.writeFileSync(dir+'/benchmark.json',JSON.stringify(r,null,2)+'\n');
try{
 for(const p of positions)for(const c of Object.values(clients))await c.request(p.fixture,{depth:2,nodeLimit:3000});
 for(let repeat=0;repeat<5;repeat++)for(const [i,p]of positions.entries()){
  const pair={};for(const name of (repeat+i)%2?['trial','baseline']:['baseline','trial'])pair[name]=await clients[name].request(p.fixture,{depth:p.depth,nodeLimit:250000});
  const same=compare(pair.baseline,pair.trial);r.fixed.push({repeat,position:p.name,requestedDepth:p.depth,depth:pair.baseline.depth,nodes:pair.baseline.nodes,...same,baselineCoreMs:pair.baseline.elapsedMs,trialCoreMs:pair.trial.elapsedMs,baselineWallMs:pair.baseline.wallMs,trialWallMs:pair.trial.wallMs});persist();
 }
 for(const c of Object.values(clients))await c.close();
 r.summary=positions.map(p=>{const xs=r.fixed.filter(x=>x.position===p.name),a=median(xs.map(x=>x.baselineCoreMs)),b=median(xs.map(x=>x.trialCoreMs));return {position:p.name,depth:xs[0].depth,nodes:xs[0].nodes,baselineMedianMs:a,trialMedianMs:b,speedup:a/b};});
 const timed={baseline:new ClockNative({binary:baseline}),trial:new ClockNative({binary})};
 try{for(const repeat of [0,1])for(const [i,p]of [positions[0],positions[1],positions.at(-1)].entries())for(const name of (repeat+i)%2?['trial','baseline']:['baseline','trial']){
  await timed[name].ready();const result=await timed[name].search(p.fixture.view,1000);assert(result.depth>0);r.timed.push({repeat,name,position:p.name,depth:result.depth,nodes:result.nodes,elapsedMs:result.elapsedMs,fallbackUsed:result.fallbackUsed,clock:result.clock});persist();
 }}finally{for(const c of Object.values(timed))await c.close();}
 r.passed=true;
}catch(e){r.error=e.stack.replaceAll(process.cwd(),'<project>');throw e;}finally{for(const c of Object.values(clients))await c.close();persist();console.log(JSON.stringify({passed:r.passed,summary:r.summary,timed:r.timed.map(x=>({position:x.position,name:x.name,depth:x.depth,elapsedMs:x.elapsedMs}))}));}
