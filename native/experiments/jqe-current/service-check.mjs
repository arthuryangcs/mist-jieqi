// Build explicitly first, then: node --test native/experiments/jqe-current/service-check.mjs
// Never overwrite a candidate binary another verification job may be using.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {once} from 'node:events';
import {initial,publicState,legalMoves,positionKey} from '../../../engine.js';
import {seeded} from '../../../ai.js';
import {sourceOf,sha,hash,modelSha256} from './build.mjs';
import {previewModule,writePreview,modelFile} from './web.mjs';
assert(fs.existsSync(modelFile),'Install the approved JQE model before running service checks');
const built={...JSON.parse(fs.readFileSync('.cache/jqe-current/candidate-build.json','utf8')),binary:path.resolve('.cache/jqe-current/candidate')};
assert.equal(built.sourceSha256,sha(sourceOf({trial:true})),'Rebuild the candidate after source changes');
assert.equal(built.headerSha256,hash('native/experiments/jqe-current/nnue.hpp'),'Rebuild the candidate after header changes');
assert.equal(built.binarySha256,hash(built.binary),'Candidate binary does not match its manifest');
assert.equal(built.modelSha256,modelSha256);assert.equal(hash(modelFile),modelSha256);
const mod=await previewModule(),staticRoot=writePreview();
// Later ambient environment changes must not redirect a preview's network.
const previousEnvironment=Object.fromEntries(['MIST_JQE_MODEL','MIST_JQE_QUANT','MIST_JQE_FULL'].map(k=>[k,process.env[k]]));
Object.assign(process.env,{MIST_JQE_MODEL:'/nonexistent-jqe-test-model.jqn',MIST_JQE_QUANT:mod.quantized?'0':'1',MIST_JQE_FULL:'1'});
const service=mod.createLocalServer({executable:built.binary,buildInfo:mod.probeBuild(built),staticRoot});
const address=await service.listen(0),base=`http://127.0.0.1:${address.port}`;
const view=publicState(initial(seeded(17)),'r');
const payload=(timeMs=600)=>({token:crypto.randomUUID(),timeMs,view:structuredClone(view),depthMetrics:true});
const post=body=>fetch(base+'/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const evidence={passed:false,sourceSha256:built.sourceSha256,headerSha256:built.headerSha256,binarySha256:built.binarySha256,modelSha256,serviceSourceSha256:hash('native/server.mjs'),previewSourceSha256:hash('native/experiments/jqe-current/web.mjs'),testSourceSha256:hash('native/experiments/jqe-current/service-check.mjs'),tests:[]};
async function checked(name,fn){try{await fn();evidence.tests.push({name,passed:true});}catch(error){evidence.tests.push({name,passed:false,error:error.message.replaceAll(process.cwd(),'<repo>')});throw error;}}
test.after(async()=>{await service.close();for(const [key,value] of Object.entries(previousEnvironment)){if(value===undefined)delete process.env[key];else process.env[key]=value;}evidence.passed=evidence.tests.length===3&&evidence.tests.every(t=>t.passed);fs.mkdirSync('benchmarks/jqe-current-2026-11-09',{recursive:true});fs.writeFileSync('benchmarks/jqe-current-2026-11-09/service.json',JSON.stringify(evidence,null,2)+'\n');});

test('JQE preview is isolated and keeps current HTTP/public-information boundaries',()=>checked('isolation-and-information-boundaries',async()=>{
 assert.equal(address.address,'127.0.0.1');
 const page=await(await fetch(base+'/')).text();
 assert.match(page,/尚未默认启用/);assert.match(page,/http:\/\/127\.0\.0\.1:8766\//);
 for(const file of ['app.js','native-client.js','search-metrics.js'])assert.equal(await(await fetch(base+'/'+file)).text(),fs.readFileSync(new URL('../../../'+file,import.meta.url),'utf8'));
 for(const route of ['/models/jqe/it014.jqn','/.cache/jqe-current/candidate','/native/server.mjs','/.git/config'])assert.equal((await fetch(base+route)).status,404);
 assert.equal((await fetch(base+'/api/status',{headers:{Origin:'https://example.com'}})).status,403);
 assert.equal(await new Promise((resolve,reject)=>{http.get(base+'/api/status',{headers:{Host:'foreign.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);}),403);
 const canonical=positionKey(view);assert.deepEqual(mod.validateRequest({...payload(),view:{...view,positions:[canonical]}}).view.positions,[canonical]);
 for(const history of ['malformed',JSON.stringify([JSON.parse(canonical)[0],[...JSON.parse(canonical)[1],null]])])assert.equal((await post({...payload(),view:{...view,positions:[history]}})).status,400);
 const injected=JSON.parse(canonical);injected[1].find(p=>p?.[2]).push('secret-identity');assert.equal((await post({...payload(),view:{...view,positions:[JSON.stringify(injected)]}})).status,400);
 const bad=payload();bad.view.board.find(p=>p?.hidden).type='R';assert.equal((await post(bad)).status,400);
 for(const extra of [{modelFile:'/tmp/other.jqn'},{MIST_JQE_MODEL:'/tmp/other.jqn'},{quantized:false},{purpose:'play'}])assert.equal((await post({...payload(),...extra})).status,400);
 assert.equal((await post({...payload(),timeMs:15001})).status,400);
 assert.equal(service.active.size,0);
}));

test('JQE uses bounded streaming and returns a legal move without changing depth limits',()=>checked('bounded-streaming-and-legal-move',async()=>{
 const started=performance.now(),response=await post(payload());assert.equal(response.status,200);
 const events=(await response.text()).trim().split('\n').map(JSON.parse);
 assert(events.length);assert(!events.some(x=>x.error));
 const result=events.at(-1).result;assert(result);assert.equal(result.engine,'cpp-native');
 assert.equal(result.binarySha256,built.binarySha256);
 assert(legalMoves(view).some(m=>m.from===result.move?.from&&m.to===result.move?.to));
 assert(performance.now()-started<2000,'Independent service deadline must remain bounded');
 if(result.depth){assert.equal(result.engineVerified,true);assert(result.candidates.length<=5);}
 else assert(result.fallbackUsed,'Cold-start deadline must be explicitly marked as fallback');
 assert.equal(service.active.size,0);
 evidence.streaming={elapsedMs:performance.now()-started,depth:result.depth,engineVerified:result.engineVerified,fallbackUsed:result.fallbackUsed};
}));

test('JQE cancellation and pre-cancellation clean up child processes',()=>checked('cancellation-and-child-cleanup',async()=>{
 const early=payload();await fetch(base+'/api/search/'+early.token,{method:'DELETE'});assert.equal((await post(early)).status,409);
 const input=payload(15000),response=await post(input);
 assert.equal(response.status,200);
 const child=service.active.get(input.token)?.process;assert(child);
 const exited=once(child,'exit');
 assert.equal((await fetch(base+'/api/search/'+input.token,{method:'DELETE'})).status,200);
 await response.text();await exited;
 assert.equal(service.active.size,0);assert(child.exitCode!==null||child.signalCode!==null);
}));
