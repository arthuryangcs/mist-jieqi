// Isolated single-state inference timings; not a playing-strength measurement.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {compile,cache,dir,modelFile,hash} from './build.mjs';import {Native} from '../../bridge.mjs';
process.env.MIST_NNUE_MODEL=modelFile;delete process.env.MIST_NNUE_FULL;
fs.copyFileSync('native/experiments/nnue/inference.cpp',cache+'/inference.cpp');const binary=path.resolve(cache+'/inference'),compiler=compile(path.resolve(cache+'/inference.cpp'),binary),client=new Native({binary});
const record={passed:false,modelSha256:hash(modelFile),sourceSha256:hash(cache+'/candidate.cpp'),compiler,protocol:'Five rotated repeats of 25000 inference calls with no-inline wrapper and compiler barrier. Excludes make/unmake accumulator maintenance and TT/key overhead. HCE and NNUE search trees differ; these numbers are not NPS or strength gains.',rows:[]};
const median=a=>a.sort((a,b)=>a-b)[a.length>>1];
try{for(const p of JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions){const r=await client.request(p.fixture,{mode:'VERIFY',depth:1});record.rows.push({name:p.name,iterations:r.iterations,raw:r.rows,mediansNs:Object.fromEntries([0,1,2].map(mode=>[mode,median(r.rows.filter(x=>x.mode===mode).map(x=>x.nsPerCall))]))});}record.passed=true;}
finally{await client.close();assert(!client.stderr);fs.writeFileSync(dir+'/benchmark.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record.rows.map(({name,mediansNs})=>({name,mediansNs}))));}
