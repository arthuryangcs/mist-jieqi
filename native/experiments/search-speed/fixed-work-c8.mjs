// Fixed-work evidence complements, but never replaces, the two-second benchmark.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Native,fixture} from './bridge.mjs';
import {buildC7} from './build-c7.mjs';
import {buildC8,cache} from './build-c8.mjs';
const positions=JSON.parse(fs.readFileSync(new URL('./fixtures.json',import.meta.url))).positions.slice(0,8);
const built={c7:buildC7(),c8:buildC8()},dir=process.env.MIST_C8_FIXED_DIR??path.join(cache,'fixed-work');
fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'results.json');assert(!fs.existsSync(file),'select a fresh fixed-work output directory');
const record={passed:false,createdAt:new Date().toISOString(),depth:4,repeats:4,samples:8,threadsMaximum:4,ttMiBMaximum:64,sourceHashes:Object.fromEntries(Object.entries(built).map(([n,b])=>[n,b.sourceSha256])),rows:[]};
try{
 for(let repeat=0;repeat<4;repeat++)for(const[index,p]of positions.entries()){
  const f=fixture(p.view,{seed:p.seed,samples:8}),results={};assert(p.view.board.some(piece=>piece?.hidden));
  for(const name of (repeat+index)%2?['c8','c7']:['c7','c8']){
   const engine=new Native({binary:built[name].binary});
   try{await engine.ready;const start=performance.now();const r=await engine.request(f,{mode:'SEARCH_LAZYLEGAL',depth:4,budget:30000});const wallMs=performance.now()-start;assert.equal(r.depth,4);assert.equal(r.ttDenied,0);results[name]=r;record.rows.push({name,repeat,position:p.name,wallMs,coreMs:r.elapsedMs,nodes:r.nodes,score:r.score,move:r.move});}
   finally{await engine.close();assert.equal(engine.stderr,'');}
  }
  assert.equal(results.c8.nodes,results.c7.nodes);
  assert.deepEqual(results.c8.allCandidates,results.c7.allCandidates);
  assert.deepEqual(results.c8.iterations.map(r=>({nodes:r.nodes,rows:r.allCandidates})),results.c7.iterations.map(r=>({nodes:r.nodes,rows:r.allCandidates})));
  fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({done:record.rows.length,position:p.name,repeat}));
 }
 record.passed=true;
}finally{fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');}
