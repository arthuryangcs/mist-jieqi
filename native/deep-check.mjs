import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {initial,publicState} from '../engine.js';import {seeded} from '../ai.js';
import {Native,fixture,compare} from './bridge.mjs';
const output=process.env.JIEQI_NATIVE_DEEP_OUTPUT||'benchmarks/native-deep-replay.json',reference=JSON.parse(fs.readFileSync('benchmarks/deep-opening-6101-s8-fast.json'));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(reference.sourceSha256,sha('ai.js'));assert.equal(reference.engineSha256,sha('engine.js'));
const f=fixture(publicState(initial(seeded(17)),'r'),{samples:8,seed:6101});assert.deepEqual(f.worldHashes,reference.sampleWorldHashes);
const native=new Native(),record={protocol:'使用此前同源码固定样本完整1–5层根表做独立核对。旧JS耗时不用于本轮同机提速比，仅核对树与评分；C++耗时是本轮单次观察。',seed:f.seed,samples:f.samples,worldHashes:f.worldHashes,sourceHashes:{javascript:sha('ai.js'),rules:sha('engine.js'),cpp:sha('native/search.cpp')},comparisons:[]};
try{
 const result=await native.request(f,{depth:5,budget:60000});
 for(const expected of reference.iterations){const actual=result.iterations.find(r=>r.depth===expected.depth);assert(actual,`未完成${expected.depth}层`);const a={depth:expected.depth,nodes:expected.nodes,move:expected.best,score:expected.bestScore,samples:f.samples,allCandidates:expected.candidates},best=actual.allCandidates[0],b={...actual,move:{from:best.from,to:best.to},score:best.score,samples:f.samples};record.comparisons.push({depth:expected.depth,...compare(a,b)});}
 record.result=result;record.passed=true;console.log(JSON.stringify({depth:result.depth,nodes:result.nodes,elapsedMs:result.elapsedMs,wallMs:result.wallMs,comparisons:record.comparisons}));
}catch(error){record.error=error.stack;throw error;}finally{await native.close();fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');}
