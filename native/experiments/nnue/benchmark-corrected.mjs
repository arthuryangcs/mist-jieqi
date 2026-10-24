import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {compile} from '../standpat/build.mjs';import {cache,dir,baseline,modelFile,hash} from './build-corrected.mjs';import {Native} from '../../bridge.mjs';import {ClockNative} from '../coverage-validation/engines.mjs';
process.env.MIST_NNUE_MODEL=modelFile;delete process.env.MIST_NNUE_FULL;const binary=path.resolve(cache+'/mist-nnue');assert.equal(hash(binary),JSON.parse(fs.readFileSync(cache+'/build.json')).binarySha256);
fs.copyFileSync(new URL('./inference.cpp',import.meta.url),cache+'/inference.cpp');const benchBinary=path.resolve(cache+'/inference'),compiler=compile(path.resolve(cache+'/inference.cpp'),benchBinary);
const positions=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions,record={passed:false,modelSha256:hash(modelFile),compiler,protocol:'Release-only, same fixed state per inference microbenchmark, 25000 calls, 5 rotated repeats; no-inline wrapper plus compiler memory fence prevents loop hoisting. Evaluation call cost excludes incremental make/unmake maintenance. Budget searches may have different trees; no same-tree HCE/NNUE NPS claim.',inference:[],timed:[]},client=new Native({binary:benchBinary});
const median=a=>{a=[...a].sort((a,b)=>a-b);return a[a.length>>1];};const persist=()=>fs.writeFileSync(dir+'/benchmark.json',JSON.stringify(record,null,2)+'\n');
try{
 for(const p of positions){const x=await client.request(p.fixture,{mode:'VERIFY',depth:1});record.inference.push({position:p.name,...x,wallMs:undefined,mediansNs:Object.fromEntries([0,1,2].map(mode=>[mode,median(x.rows.filter(r=>r.mode===mode).map(r=>r.nsPerCall))]))});persist();}
 await client.close();const clients={baseline:new ClockNative({binary:baseline}),nnue:new ClockNative({binary})};
 try{for(const repeat of [0,1])for(const [i,p]of [positions[0],positions[1],positions.at(-1)].entries())for(const name of (repeat+i)%2?['nnue','baseline']:['baseline','nnue']){
  await clients[name].ready();const r=await clients[name].search(p.fixture.view,1000);assert(r.depth>0);record.timed.push({repeat,name,position:p.name,elapsedMs:r.elapsedMs,depth:r.depth,nodes:r.nodes,move:r.move,fallbackUsed:r.fallbackUsed,clock:r.clock});persist();
 }}finally{for(const c of Object.values(clients))await c.close();}
 record.passed=true;
}catch(e){record.error=e.stack.replaceAll(process.cwd(),'<project>');throw e;}finally{await client.close();assert(!client.stderr.trim(),client.stderr);persist();console.log(JSON.stringify({passed:record.passed,inference:record.inference.map(x=>({position:x.position,mediansNs:x.mediansNs})),timed:record.timed.map(x=>({position:x.position,name:x.name,depth:x.depth,elapsedMs:x.elapsedMs}))}));}
