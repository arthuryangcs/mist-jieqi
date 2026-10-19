// Native-to-native ablation: every variant uses the same frozen source and worlds.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Native,compare} from './bridge.mjs';
import {compileVariant,variantSource} from './perf-variants.mjs';

const mode=process.argv[2]||'fixed',output=`benchmarks/native-perf/${mode}.json`;
assert(['fixed','budgets','profile','tt'].includes(mode),'unknown mode');
const repeats=Number(process.env.JIEQI_PERF_REPEATS||5);
assert(Number.isInteger(repeats)&&repeats>=1&&repeats<=10);
const sha=x=>createHash('sha256').update(x).digest('hex');
assert.equal(sha(variantSource('baseline')),'9e65d6d86bf60cde9e0e63973464a913f1a164e7f0193ec02152eddb94207e9e');
const positions=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
const names=mode==='fixed'?['baseline','scored','buffers','both']:mode==='tt'?['both','tt-refresh']:['baseline','both'];
const record={mode,baselineCommit:'b2009959c20966f9cbde687ec15f0246445e5f6c',cpu:os.cpus()[0].model,runtime:process.version,architecture:process.arch,repeats:mode==='fixed'?repeats:1,protocol:'顺序运行、轮换变体顺序；固定完全相同的公开观察、抽样布局、深度、估值、稳定排序与节点定义。速度仅来自无剖析release构建。core不含IPC，wall含编码/IPC/解析，不含进程启动。',fixtures:positions,builds:[],rows:[],passed:false};
const persist=()=>fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');
const clients={};
function check(a,b){
 const same=compare(a,b);assert.deepEqual(a.allCandidates,b.allCandidates,'final candidate order/values');
 assert.equal(a.iterations.length,b.iterations.length);
 for(let i=0;i<a.iterations.length;i++){
  assert.equal(a.iterations[i].depth,b.iterations[i].depth);assert.equal(a.iterations[i].nodes,b.iterations[i].nodes);
  assert.deepEqual(a.iterations[i].allCandidates,b.iterations[i].allCandidates,'iteration candidate order/values');
 }
 return same;
}
try{
 for(const name of names){const info=compileVariant(name,{profile:mode==='profile',diagnostics:mode==='tt'});clients[name]=new Native({binary:info.binary});delete info.binary;record.builds.push(info);await clients[name].ready;}
 if(mode!=='profile')for(const p of positions)for(const name of names)await clients[name].request(p.fixture,{depth:2});
 if(mode==='fixed'){
  for(let repeat=0;repeat<repeats;repeat++)for(const [i,p]of positions.entries()){
   const results={},offset=(repeat+i)%names.length,order=names.slice(offset).concat(names.slice(0,offset));
   for(const name of order){const r=await clients[name].request(p.fixture,{depth:p.depth});assert.equal(r.depth,p.depth,'fixed depth incomplete');results[name]=r;}
   for(const name of names)check(results.baseline,results[name]);
   record.rows.push({repeat,position:p.name,order,results});persist();console.log(JSON.stringify({repeat,position:p.name,ms:Object.fromEntries(names.map(n=>[n,results[n].elapsedMs])),nodes:results.baseline.nodes,identical:true}));
  }
  const median=a=>{a.sort((x,y)=>x-y);return(a[(a.length-1)>>1]+a[a.length>>1])/2;};
  record.summary=positions.map(p=>{const rows=record.rows.filter(r=>r.position===p.name),base=median(rows.map(r=>r.results.baseline.elapsedMs));return{position:p.name,depth:p.depth,samples:p.fixture.samples,nodes:rows[0].results.baseline.nodes,variants:Object.fromEntries(names.map(n=>{const core=median(rows.map(r=>r.results[n].elapsedMs));return[n,{coreMedianMs:core,wallMedianMs:median(rows.map(r=>r.results[n].wallMs)),npsMedian:median(rows.map(r=>r.results[n].nodes*1000/r.results[n].elapsedMs)),coreSpeedup:base/core}];}))};});
 }else if(mode==='budgets'){
  for(const [i,p]of [positions[0],positions[2],positions[4]].entries())for(const [j,budget]of [1000,6000,15000].entries())for(const name of(i+j)%2?[...names].reverse():names){
   const r=await clients[name].request(p.fixture,{depth:8,budget});record.rows.push({position:p.name,name,budgetMs:budget,result:r});persist();console.log(JSON.stringify({position:p.name,name,budget,depth:r.depth,nodes:r.nodes,elapsed:r.elapsedMs,wall:r.wallMs}));
  }
  record.commonCompletedLayers=[];
  for(const row of record.rows.filter(r=>r.name==='baseline')){
   const optimized=record.rows.find(r=>r.name==='both'&&r.position===row.position&&r.budgetMs===row.budgetMs).result;
   const depth=Math.min(row.result.depth,optimized.depth);
   for(let i=0;i<depth;i++){
    const a=row.result.iterations[i],b=optimized.iterations[i];assert.equal(a.depth,b.depth);assert.equal(a.nodes,b.nodes);assert.deepEqual(a.allCandidates,b.allCandidates);
   }
   record.commonCompletedLayers.push({position:row.position,budgetMs:row.budgetMs,depth,exact:true});
  }
 }else if(mode==='profile'){
  for(const p of [positions[0],positions[2],positions[4]])for(const name of names){
   const client=clients[name],before=client.stderr.length,r=await client.request(p.fixture,{depth:p.depth});
   // Stderr is a separate pipe: wait for its profiling line without changing search timing.
   for(let i=0;i<100&&!client.stderr.slice(before).includes('\n');i++)await new Promise(resolve=>setTimeout(resolve,5));
   const profile=JSON.parse(client.stderr.slice(before).trim()).profile;
   record.rows.push({position:p.name,name,result:r,profile:profile.map((x,i)=>({name:['candidates','legal (inclusive candidates)','evaluate'][i],...x,fractionOfInstrumentedCore:x.nanos/(r.elapsedMs*1e6)}))});persist();console.log(JSON.stringify(record.rows.at(-1).profile));
  }
 }else if(mode==='tt'){
  for(const p of [positions[0],positions[2]]){
   const results={};for(const name of names)results[name]=await clients[name].request(p.fixture,{depth:5,budget:300000});
   const a=results.both,b=results['tt-refresh'];let comparison;
   try{comparison=compare(a,b,{requireNodes:false});}catch(e){comparison={error:e.message};}
   record.rows.push({position:p.name,results,comparison,nodesDifference:b.nodes-a.nodes});persist();console.log(JSON.stringify({position:p.name,comparison,nodesDifference:b.nodes-a.nodes}));
  }
 }else throw Error('unknown mode');
 record.passed=true;console.log(JSON.stringify(record.summary||{mode,rows:record.rows.length,passed:true}));
}catch(error){record.error=error.stack;throw error;}finally{
 for(const client of Object.values(clients))await client.close();
 record.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));
 if(!['profile','tt'].includes(mode))assert(Object.values(clients).every(c=>!c.stderr.trim()),'unexpected stderr');persist();
}
