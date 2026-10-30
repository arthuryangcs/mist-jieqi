// Fixed-node comparison beyond the original 90k/world cache capacity.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {Native,compare} from '../../bridge.mjs';import {baseline,cache,dir} from './build.mjs';
const f=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions.at(-1).fixture;
const a=new Native({binary:baseline}),b=new Native({binary:path.resolve(cache+'/control')}),out={passed:false,nodeBudget:3000000};
try{const options={depth:12,nodeLimit:out.nodeBudget,budget:60000},x=await a.request(f,options),y=await b.request(f,options);out.parity=compare(x,y);assert.equal(y.ttDenied,0);assert.equal(y.nodes,3000001);out.raw={depth:x.depth,nodes:x.nodes,score:x.score,move:x.move};out.control={depth:y.depth,nodes:y.nodes,score:y.score,move:y.move,ttAllocatedBytes:y.ttAllocatedBytes,ttDenied:y.ttDenied};out.passed=true;}finally{await a.close();await b.close();fs.writeFileSync(dir+'/control-saturation.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));}
