import fs from 'node:fs';import assert from 'node:assert/strict';
import {Native,compare} from './bridge.mjs';import {compileAspiration} from './aspiration2-variants.mjs';
const mode=process.argv[2]||'screen',names=mode.startsWith('lookup')?['baseline','refreshLookup']:mode.startsWith('pool')?['baseline','asp','pool','poolasp']:mode.startsWith('final')?['baseline','asp','refreshFast','bothFast']:['baseline','asp','refresh','both'],dir='benchmarks/aspiration2';
assert(['screen','deep','budgets','audit','cap','saturated','pool','pooldeep','poolaudit','poolbudgets','final','finalsaturated','finalbudgets','lookup','lookupsaturated','lookupbudgets'].includes(mode));
const audit=['audit','cap','saturated','poolaudit','finalsaturated','lookupsaturated'].includes(mode),cap=mode==='cap'?128:90000;
const fixtures=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
const clients={},record={mode,startedAt:new Date().toISOString(),baselineCommit:'93f617e',builds:[],fixtures,rows:[],passed:false};
const persist=()=>fs.writeFileSync(`${dir}/${mode}.json`,JSON.stringify(record)+'\n');
function layer(r,i){const l=r.iterations[i],top=l.allCandidates[0];return {...l,move:{from:top.from,to:top.to},score:top.score,samples:r.samples};}
function check(a,b){
 const same=compare(a,b,{requireNodes:false});assert.deepEqual(a.allCandidates.map(m=>[m.from,m.to]),b.allCandidates.map(m=>[m.from,m.to]));
 for(let i=0;i<Math.min(a.iterations.length,b.iterations.length);i++){
  compare(layer(a,i),layer(b,i),{requireNodes:false});
  if(audit)for(let j=0;j<a.iterations[i].allCandidates.length;j++){
   const x=a.iterations[i].allCandidates[j],y=b.iterations[i].allCandidates[j];assert.equal(x.sampleScores.length,y.sampleScores.length);
   for(let k=0;k<x.sampleScores.length;k++)assert(Math.abs(x.sampleScores[k]-y.sampleScores[k])<=1e-7,`individual score mismatch ${i}/${j}/${k}: ${x.sampleScores[k]}/${y.sampleScores[k]}`);
  }
 }
 return same;
}
try {
 for(const n of names){const b=compileAspiration(n,{audit,cap});clients[n]=new Native({binary:b.binary});delete b.binary;record.builds.push(b);await clients[n].ready;}
 for(const p of fixtures)for(const n of names)await clients[n].request(p.fixture,{depth:2});
 if(mode.endsWith('budgets')){
  for(const p of [fixtures[0],fixtures[2],fixtures[4]])for(const budget of [1000,6000]){
   const results={};for(const n of names)results[n]=await clients[n].request(p.fixture,{depth:8,budget});
   const common=Math.min(...Object.values(results).map(r=>r.depth));const comparisons={};
   for(const n of names.slice(1))for(let i=0;i<common;i++)try{compare(layer(results.baseline,i),layer(results[n],i),{requireNodes:false});}catch(e){comparisons[n]=e.message;}
   record.rows.push({position:p.name,budget,results,comparisons});persist();console.log(JSON.stringify({position:p.name,budget,depths:Object.fromEntries(names.map(n=>[n,results[n].depth])),comparisons}));
  }
 }else for(let repeat=0;repeat<(['screen','pool','final','finalsaturated','lookup','lookupsaturated'].includes(mode)?3:1);repeat++)for(const [i,p]of (mode.endsWith('saturated')?[fixtures[2],fixtures[4]]:fixtures).entries()){
  const depth=mode.endsWith('saturated')?p.depth+3:['deep','pooldeep','final','lookup'].includes(mode)?p.depth+2:p.depth+1;
  const order=names.slice((repeat+i)%names.length).concat(names.slice(0,(repeat+i)%names.length)),results={},comparisons={};
  for(const n of order){results[n]=await clients[n].request(p.fixture,{depth,budget:300000});assert.equal(results[n].depth,depth);}
  for(const n of names.slice(1))try{comparisons[n]=check(results.baseline,results[n]);}catch(e){comparisons[n]={error:e.message};}
  record.rows.push({repeat,position:p.name,depth,order,results,comparisons});persist();
  console.log(JSON.stringify({repeat,position:p.name,depth,results:Object.fromEntries(names.map(n=>[n,{ms:results[n].elapsedMs,nodes:results[n].nodes,windows:results[n].windowStats,cacheSizes:results[n].cacheSizes}])),comparisons}));
 }
 record.passed=record.rows.every(r=>Object.values(r.comparisons).every(c=>typeof c!=='string'&&!c.error));
}catch(e){record.error=e.stack;throw e;}
finally{for(const c of Object.values(clients))await c.close();record.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));if(Object.values(record.stderr).some(Boolean))record.passed=false;record.finishedAt=new Date().toISOString();persist();console.log(JSON.stringify({mode,passed:record.passed,rows:record.rows.length}));}
