// Node caps select the serial engine path. Check the actual parallel path separately.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {Native,compare} from '../../bridge.mjs';import {baseline,cache,dir,hash,stableBinary} from './build.mjs';
assert.equal(hash(baseline),stableBinary);
const positions=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
const record={passed:false,fixtureSha256:hash('benchmarks/native-benchmark.json'),rows:[]};
try{for(const sanitize of [false,true]){
 const binary=path.resolve(cache+'/mist-cycle'+(sanitize?'-sanitized':'')),manifest=JSON.parse(fs.readFileSync(cache+`/build${sanitize?'-sanitized':''}.json`));assert.equal(hash(binary),manifest.binarySha256);
 const a=new Native({binary:baseline}),b=new Native({binary});
 try{for(const p of positions){
  const options={depth:p.depth+1,budget:60000},x=await a.request(p.fixture,options),y=await b.request(p.fixture,options);assert.equal(x.depth,options.depth);assert.equal(y.depth,options.depth);assert.equal(x.interruptedDepth,0);assert.equal(y.interruptedDepth,0);
  const aligned=compare(x,y);assert.equal(x.iterations.length,y.iterations.length);for(let i=0;i<x.iterations.length;i++){assert.equal(x.iterations[i].nodes,y.iterations[i].nodes);assert.deepEqual(x.iterations[i].allCandidates,y.iterations[i].allCandidates);}
  assert.equal(y.threads,Math.min(p.fixture.samples,4));record.rows.push({position:p.name,sanitize,depth:y.depth,samples:y.samples,threads:y.threads,nodes:y.nodes,...aligned});
  fs.writeFileSync(dir+'/parallel-check.json',JSON.stringify(record,null,2)+'\n');
 }}finally{await a.close();await b.close();assert(!b.stderr.trim(),b.stderr);}
}record.passed=true;
}catch(e){record.error=e.stack.replaceAll(process.cwd(),'<project>');throw e;}finally{fs.writeFileSync(dir+'/parallel-check.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({passed:record.passed,rows:record.rows}));}
