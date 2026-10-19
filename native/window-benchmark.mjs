import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
import {Native,compare}from'./bridge.mjs';import{compileVariant,variantSource}from'./window-variants.mjs';
const mode=process.argv[2]||'pilot';assert(['pilot','fixed','tt','budgets','deep','screen','rays','ray-pilot','parallel','parallel-deep','parallel-fixed','parallel-budgets'].includes(mode));
const names=mode==='parallel-budgets'?['baseline','parallel4']:mode.startsWith('parallel')?['baseline','parallel1','parallel4']:mode==='tt'?['baseline','reserve','refresh']:mode==='screen'?['baseline','adaptive','reserve','flat']:mode==='deep'||mode==='fixed'?['baseline','adaptive','flat']:['rays','ray-pilot','budgets'].includes(mode)?['baseline','raycheck']:['baseline','asp75','asp200'];
const positions=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
const dir='benchmarks/native-windows',output=`${dir}/${mode}.json`,sha=x=>createHash('sha256').update(x).digest('hex');
assert.equal(sha(variantSource('baseline')),'1bc5e0185ab172858c538ac6cff207f25ec903537464acbea0288190096192ba');
const record={mode,baselineCommit:'a156673',startedAt:new Date().toISOString(),runtime:process.version,cpu:os.cpus()[0].model,fixtureFile:'benchmarks/native-benchmark.json',fixtureSha256:sha(fs.readFileSync('benchmarks/native-benchmark.json')),builds:[],rows:[],passed:false},clients={};
const persist=()=>fs.writeFileSync(output,JSON.stringify(record)+'\n');
function compareScores(a,b){const result=compare(a,b,{requireNodes:false});assert.deepEqual(a.allCandidates.map(m=>[m.from,m.to]),b.allCandidates.map(m=>[m.from,m.to]));assert.equal(a.iterations.length,b.iterations.length);for(let i=0;i<a.iterations.length;i++){const x=a.iterations[i],y=b.iterations[i],top=x.allCandidates[0],other=y.allCandidates[0];compare({...x,samples:a.samples,score:top.score,move:{from:top.from,to:top.to}},{...y,samples:b.samples,score:other.score,move:{from:other.from,to:other.to}},{requireNodes:false});assert.deepEqual(x.allCandidates.map(m=>[m.from,m.to]),y.allCandidates.map(m=>[m.from,m.to]));}return result;}
try{
 for(const name of names){const build=compileVariant(name);clients[name]=new Native({binary:build.binary});delete build.binary;record.builds.push(build);await clients[name].ready;}
 for(const p of positions)for(const name of names)await clients[name].request(p.fixture,{depth:2});
 if(!['budgets','parallel-budgets'].includes(mode)){
  const repeats=['fixed','rays','parallel-fixed','parallel-budgets'].includes(mode)?5:1,ps=mode==='tt'?[positions[0],positions[2]]:positions;record.repeats=repeats;
  for(let repeat=0;repeat<repeats;repeat++)for(const [i,p]of ps.entries()){
   const offset=(i+repeat)%names.length,order=names.slice(offset).concat(names.slice(0,offset)),results={},comparisons={};
   const targetDepth=mode==='tt'?6:['deep','parallel-deep'].includes(mode)?p.depth+2:mode==='rays'?p.depth+1:p.depth;
   for(const name of order){results[name]=await clients[name].request(p.fixture,{depth:targetDepth,budget:300000});assert.equal(results[name].depth,targetDepth,'固定深度须完整完成');}
   for(const name of names){try{comparisons[name]=compareScores(results.baseline,results[name]);if(['reserve','flat','raycheck'].includes(name))assert.equal(results.baseline.nodes,results[name].nodes);}catch(e){comparisons[name]={error:e.message};}}
   if(mode.startsWith('parallel')){comparisons.hardware=compareScores(results.parallel1,results.parallel4);assert.equal(results.parallel1.nodes,results.parallel4.nodes);}
   record.rows.push({position:p.name,repeat,order,results,comparisons});persist();console.log(JSON.stringify({position:p.name,comparisons,ms:Object.fromEntries(names.map(n=>[n,results[n].elapsedMs])),nodes:Object.fromEntries(names.map(n=>[n,results[n].nodes])),windows:Object.fromEntries(names.map(n=>[n,results[n].windowStats]))}));
  }
 }else{
  for(const p of[positions[0],positions[2],positions[4]])for(const budget of[1000,6000,15000]){
   const results={};for(const name of names){const r=await clients[name].request(p.fixture,{depth:8,budget});results[name]=r;console.log(JSON.stringify({position:p.name,name,budget,depth:r.depth,nodes:r.nodes}));}
   const comparisons={};for(const name of names){const a=results.baseline,b=results[name],depth=Math.min(a.depth,b.depth),as=a.iterations.slice(0,depth),bs=b.iterations.slice(0,depth);if(depth){const x=as.at(-1),y=bs.at(-1);comparisons[name]=compareScores({...a,...x,iterations:as,score:x.allCandidates[0].score,move:{from:x.allCandidates[0].from,to:x.allCandidates[0].to}},{...b,...y,iterations:bs,score:y.allCandidates[0].score,move:{from:y.allCandidates[0].from,to:y.allCandidates[0].to}});}else comparisons[name]={depth:0};}
   record.rows.push({position:p.name,budgetMs:budget,results,comparisons});persist();
  }
 }
 const median=xs=>{const x=[...xs].sort((a,b)=>a-b);return(x[(x.length-1)>>1]+x[x.length>>1])/2;};
 if(record.repeats)record.summary=positions.filter(p=>record.rows.some(r=>r.position===p.name)).map(p=>{const rows=record.rows.filter(r=>r.position===p.name),ms=Object.fromEntries(names.map(n=>[n,median(rows.map(r=>r.results[n].elapsedMs))]));return{position:p.name,medianMs:ms,baselineSpeedup:ms.parallel4?ms.baseline/ms.parallel4:null,hardwareSpeedup:ms.parallel4?ms.parallel1/ms.parallel4:null};});
 record.passed=record.rows.every(r=>!r.comparisons||Object.values(r.comparisons).every(v=>!v.error));
}catch(e){record.error=e.stack.replaceAll(process.cwd(),'<project>');throw e;}finally{
 for(const c of Object.values(clients))await c.close();record.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));if(Object.values(clients).some(c=>c.stderr))record.passed=false;record.finishedAt=new Date().toISOString();persist();if(!record.passed)process.exitCode=1;
}
