// The normalization changes allocation only; compare exact complete search trees.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {Native,compare} from '../../bridge.mjs';import {cache,dir,hash,stableSource} from './build.mjs';
const a=new Native({binary:path.resolve('.cache/native/mist-core')}),b=new Native({binary:path.resolve(cache+'/control')}),out={passed:false,stableSourceSha256:stableSource,productionBinarySha256:hash('.cache/native/mist-core'),controlBinarySha256:hash(cache+'/control'),rows:[]};
assert.equal(hash('native/search.cpp'),stableSource);
try{for(const p of JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions){
 const o={depth:2,nodeLimit:0,budget:60000},x=await a.request(p.fixture,o),y=await b.request(p.fixture,o);const parity=compare(x,y);assert.equal(y.ttBudgetBytes,64*1024*1024);assert.equal(y.ttDenied,0);out.rows.push({name:p.name,...parity,depth:x.depth,nodes:x.nodes});
 }out.passed=true;
}finally{await a.close();await b.close();assert(!a.stderr&&!b.stderr);fs.writeFileSync(dir+'/control-check.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));}
