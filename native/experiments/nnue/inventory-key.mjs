import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {compile} from '../standpat/build.mjs';import {fixture,encode} from '../../bridge.mjs';import {initial,publicState} from '../../../engine.js';import {seeded} from '../../../ai.js';import {modelFile,hash} from './build.mjs';
const results=[];process.env.MIST_NNUE_MODEL=modelFile;
for(const [name,cache,distinct]of [['pilot','.cache/nnue',false],['corrected','.cache/nnue-corrected',true]]){
 const file=path.resolve(cache+'/inventory-key.cpp'),binary=path.resolve(cache+'/inventory-key');fs.writeFileSync(file,`#define EXPECT_DISTINCT_KEYS ${Number(distinct)}\n`+fs.readFileSync(new URL('./inventory-key.cpp',import.meta.url),'utf8'));const compiler=compile(file,binary);
 const f=fixture(publicState(initial(seeded(17)),'r'),{seed:6101,samples:1}),r=spawnSync(binary,[],{input:encode(f,{mode:'VERIFY',depth:1}),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);const x=JSON.parse(r.stdout);assert.equal(x.keysEqual,!distinct);results.push({name,sourceSha256:hash(file),binarySha256:hash(binary),...compiler,...x});
}
fs.writeFileSync('benchmarks/nnue/inventory-key.json',JSON.stringify({passed:true,modelSha256:hash(modelFile),results,scope:'Constructed consistent belief inventories with the same board/count/value; not a claim that a particular pilot game hit the alias.'},null,2)+'\n');console.log(JSON.stringify(results.map(({name,keysEqual,tableEntries,scoreA,scoreB})=>({name,keysEqual,tableEntries,scoreA,scoreB}))));
