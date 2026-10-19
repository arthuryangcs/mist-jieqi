import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import http from 'node:http';
import {createLocalServer,ensureBuild,validateRequest} from './server.mjs';
import {Native,fixture,javascript,compare,observationSeed} from './bridge.mjs';
import {NativeWorker} from '../native-client.js';
import {initial,publicState,move,legalMoves} from '../engine.js';
import {seeded} from '../ai.js';
const built=ensureBuild(),view=publicState(initial(seeded(17)),'r'),payload=(timeMs=1000)=>({token:crypto.randomUUID(),timeMs,view:structuredClone(view)});
const evidence={build:built,tests:[],streamComparisons:[],passed:false};
const service=createLocalServer({buildInfo:built}),address=await service.listen(0),base=`http://127.0.0.1:${address.port}`;
const post=body=>fetch(base+'/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function* messages(response){assert.equal(response.status,200);let buffer='';for await(const chunk of response.body){buffer+=new TextDecoder().decode(chunk);let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(line)yield JSON.parse(line);}}assert.equal(buffer,'');}
async function waitFor(check){for(let i=0;i<60;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert(check(),'状态未按时清理');}
test.after(async()=>{await service.close();evidence.passed=evidence.tests.every(t=>t.passed)&&evidence.streamComparisons.length===3;fs.writeFileSync(process.env.JIEQI_CPP_SERVICE_OUTPUT||'benchmarks/cpp-service-replay.json',JSON.stringify(evidence,null,2)+'\n');});
async function checked(name,fn){try{await fn();evidence.tests.push({name,passed:true});}catch(e){evidence.tests.push({name,passed:false,error:e.message});throw e;}}

test('HTTP边界与公开信息验证',()=>checked('HTTP边界与公开信息验证',async()=>{
 assert.equal(service.server.address().address,'127.0.0.1');
 const status=await(await fetch(base+'/api/status')).json();assert.equal(status.engine,'cpp-native');assert.equal(status.sourceSha256,built.sourceSha256);assert.equal(status.maxThreads,built.threads);assert.equal(status.independentWorldSearch,true);
 for(const url of['/.git/config','/native/server.mjs','/benchmarks/native-build.json'])assert.equal((await fetch(base+url)).status,404);
 assert.equal((await fetch(base+'/api/status',{headers:{Origin:'https://example.com'}})).status,403);
 const foreignHost=await new Promise((resolve,reject)=>{http.get(base+'/api/status',{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(foreignHost,403);
 const real=publicState(initial(seeded(8)),'r');assert.deepEqual(validateRequest({...payload(),view:real}).view,real);
 const bad=payload();bad.view.board[54].type='R';assert.equal((await post(bad)).status,400);
 const excessive=payload();excessive.timeMs=15001;assert.equal((await post(excessive)).status,400);
 assert.equal((await post({...payload(),features:{activity:true}})).status,400,'不支持的配置不得静默忽略');
 const missing=payload();missing.view.captured=[{side:'r',hidden:true}];assert.equal((await post(missing)).status,400);
 const huge=payload();huge.view.positions=['x'.repeat(2*1024*1024)];assert.equal((await post(huge)).status,413);
 let s=move(initial(seeded(17)),{from:64,to:1});s=move(s,{from:25,to:88});
 for(const side of['r','b']){const p={...payload(),view:publicState(s,side)};assert.equal(validateRequest(p).view.captured.filter(x=>x.wasHidden).length,1);const unknown=p.view.captured.find(x=>x.hidden);unknown.type='N';assert.throws(()=>validateRequest(p),/真实暗子/);}
 assert.equal(service.active.size,0);
}));
test('STREAM与参考搜索逐层同分并记录两种节点数',()=>checked('STREAM与完整参考搜索逐着对齐',async()=>{
 const mid=JSON.parse(fs.readFileSync('benchmarks/strength-positions.json'))[1].view;
 const ending={...initial(),board:Array(90).fill(null),captured:[]};for(const[i,side,type]of[[85,'r','K'],[4,'b','K'],[49,'r','P'],[72,'r','R'],[17,'b','R']])ending.board[i]={side,type,role:type,hidden:false};
 const native=new Native();try{for(const [name,v,samples]of[['开局',view,8],['中局',mid,8],['全明残局',publicState(ending,'r'),1]]){
  const f=fixture(v,{seed:observationSeed(v),samples}),progress=[],b=await native.request(f,{mode:'STREAM',depth:3,budget:60000,onProgress:r=>progress.push(r)}),a=await javascript(f,{depth:3});
  assert.equal(b.depth,3);assert.equal(progress.length,3);assert.equal(b.iterations.length,0);const options={requireNodes:!(native.capabilities.independentWorldSearch&&samples>1)},aligned=compare(a,b,options);assert.equal(b.threads,samples>1?4:1);
  for(let i=0;i<progress.length;i++){assert.equal(progress[i].depth,i+1);assert.equal(progress[i].allCandidates.length,legalMoves(v).length);const expected=a.iterations[i],top=expected.allCandidates[0];compare({...expected,samples:f.samples,score:top.score,move:{from:top.from,to:top.to}},progress[i],options);assert.equal(progress[i].threads,b.threads);}
  evidence.streamComparisons.push({name,depth:b.depth,samples:f.samples,nodes:b.nodes,javascriptNodes:a.nodes,threads:b.threads,...aligned});
 }}finally{await native.close();assert.equal(native.stderr,'');}
}));
test('实际HTTP流只传五候选，标记核心且逐层返回完整结果',()=>checked('实际HTTP流与核心证明',async()=>{
 const input=payload(1200),events=[];const start=performance.now();for await(const item of messages(await post(input)))events.push(item);
 assert(events.some(x=>x.progress));const r=events.at(-1).result;assert.equal(r.engine,'cpp-native');assert(r.engineVerified);assert.equal(r.sourceSha256,built.sourceSha256);assert.equal(r.candidates.length,5);assert(!('allCandidates'in r));assert(!('iterations'in r));assert.equal(r.samples,8);assert.equal(r.threads,4);assert.equal(r.maxThreads,4);assert.equal(r.independentWorldSearch,true);assert(r.depth>=1);assert(legalMoves(view).some(m=>m.from===r.move.from&&m.to===r.move.to));
 assert(events.filter(x=>x.progress).every((x,i)=>x.result.depth===i+1));
 evidence.httpTiming={elapsedMs:performance.now()-start,depth:r.depth,nodes:r.nodes,threads:r.threads,firstProgressMs:events[0].result.serviceElapsedMs,serviceElapsedMs:r.serviceElapsedMs,initializationMs:r.initializationMs};await waitFor(()=>service.active.size===0);
}));
test('取消、先取消后到达及限流不会遗留C++子进程',()=>checked('取消/竞态/限流与子进程退出',async()=>{
 const input=payload(15000),response=await post(input);let process;
 for await(const item of messages(response)){if(item.progress){process=service.active.get(input.token).process;const exit=once(process,'exit');assert.equal((await fetch(base+'/api/search/'+input.token,{method:'DELETE'})).status,200);await exit;break;}}
 assert(process);await waitFor(()=>service.active.size===0);assert(process.exitCode!==null||process.signalCode!==null);
 const early=payload();await fetch(base+'/api/search/'+early.token,{method:'DELETE'});assert.equal((await post(early)).status,409);
 const pending=[payload(15000),payload(15000)],responses=await Promise.all(pending.map(post));assert(responses.every(r=>r.status===200));assert.equal((await post(payload())).status,429);for(const p of pending)await fetch(base+'/api/search/'+p.token,{method:'DELETE'});for(const r of responses)await r.text();await waitFor(()=>!service.active.size);
}));
test('浏览器适配器验证C++身份、传递进度、取消不回调',()=>checked('浏览器适配器无静默回退',async()=>{
 const fetcher=(url,options)=>fetch(base+url,options),worker=new NativeWorker({fetcher});let progress=0;
 const result=await new Promise((resolve,reject)=>{worker.onerror=reject;worker.onmessage=({data})=>{assert.equal(data.id,77);if(data.progress)progress++;else resolve(data.result);};worker.postMessage({id:77,view,timeMs:1000});});worker.terminate();assert(progress>=1);assert.equal(result.engine,'cpp-native');
 const fake=new NativeWorker({fetcher:async()=>new Response('{}\n',{status:200,headers:{'X-Engine':'javascript'}})});let fallbackError=await new Promise(resolve=>{fake.onerror=resolve;fake.postMessage({id:1,view,timeMs:1000});});assert.match(fallbackError.message,/未确认/);fake.terminate();
 const broken=new NativeWorker({fetcher:async()=>new Response('',{status:200,headers:{'X-Engine':'cpp-native'}})});fallbackError=await new Promise(resolve=>{broken.onerror=resolve;broken.postMessage({id:1,view,timeMs:1000});});assert.match(fallbackError.message,/提前结束/);broken.terminate();
 const stop=new NativeWorker({fetcher});let callbacks=0;stop.onerror=()=>callbacks++;stop.onmessage=()=>callbacks++;stop.postMessage({id:8,view,timeMs:15000});stop.terminate();await new Promise(r=>setTimeout(r,100));assert.equal(callbacks,0);
}));
test('独立服务时限在模拟核心阻塞时保留完整轮次并杀进程',()=>checked('故障注入：服务硬时限',async()=>{
 // A native stub avoids conflating cold Node/shebang startup with blocking search.
 // Compilation occurs before the unchanged 1200ms service deadline starts.
 const stub=path.resolve('.cache/native/stalled-core-test'),source=stub+'.cpp';
 fs.writeFileSync(source,`#include <iostream>
#include <string>
#include <chrono>
int main(int argc,char**){
 std::cout<<R"({"ready":true,"protocol":2,"streaming":true})"<<std::endl;
 if(argc>1)return 0;
 std::string request;std::getline(std::cin,request);
 std::cout<<R"({"progress":true,"result":{"depth":1,"nodes":1,"samples":8,"elapsedMs":1,"move":{"from":54,"to":45},"score":0,"allCandidates":[{"from":54,"to":45,"score":0,"spread":0}]}})"<<std::endl;
 const auto end=std::chrono::steady_clock::now()+std::chrono::seconds(5);
 while(std::chrono::steady_clock::now()<end){}
}
`);
 let stalled;try{
  const compiled=spawnSync(process.env.CXX||'clang++',[...built.flags,source,'-o',stub],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
  // Isolate a stall after progress from first execution of a new native image.
  // The production service still counts readiness inside its unchanged clock.
  const probeBegin=performance.now(),probe=spawnSync(stub,['--ready-probe'],{input:'',encoding:'utf8',timeout:10000});
  assert.equal(probe.status,0);assert.equal(probe.stderr,'');assert.equal(JSON.parse(probe.stdout).ready,true);const imageProbeMs=performance.now()-probeBegin;
  stalled=createLocalServer({executable:stub,buildInfo:built});const input=payload(1200),addr=await stalled.listen(0),begin=performance.now(),response=await fetch(`http://127.0.0.1:${addr.port}/api/search`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),rows=[];let child,exit;
  for await(const item of messages(response)){rows.push(item);if(item.progress&&!child){child=stalled.active.get(input.token).process;exit=once(child,'exit');}}
  assert(rows.at(-1).result.deadlineStop);assert.equal(rows.at(-1).result.depth,1);assert(performance.now()-begin<1800);assert.equal(stalled.active.size,0);assert(child);await exit;assert(child.exitCode!==null||child.signalCode!==null);
  evidence.watchdog={injected:true,mock:'compiled-local-cpp',imageProbeMs,elapsedMs:performance.now()-begin,depth:1,initializationMs:rows[0].result.initializationMs,processExited:true};
 }finally{if(stalled)await stalled.close();for(const file of[stub,source])fs.rmSync(file,{force:true});}
}));
test('核心未就绪时硬截止返回合法保底并清理进程',()=>checked('故障注入：就绪前截止',async()=>{
 const stub=path.resolve('.cache/native/unready-core-test'),source=stub+'.cpp';
 fs.writeFileSync(source,`#include <iostream>
#include <chrono>
int main(){const auto end=std::chrono::steady_clock::now()+std::chrono::seconds(2);
while(std::chrono::steady_clock::now()<end){};
std::cout<<R"({"ready":true,"protocol":2,"streaming":true})"<<std::endl;}
`);
 let stalled;try{
  const compiled=spawnSync(process.env.CXX||'clang++',[...built.flags,source,'-o',stub],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
  stalled=createLocalServer({executable:stub,buildInfo:built});const input=payload(1200),addr=await stalled.listen(0),begin=performance.now();
  const response=await fetch(`http://127.0.0.1:${addr.port}/api/search`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  const child=stalled.active.get(input.token).process,exit=once(child,'exit'),rows=[];
  for await(const item of messages(response))rows.push(item);
  const result=rows.at(-1).result;assert(result.deadlineStop);assert.equal(result.depth,0);assert.equal(result.engineVerified,false);
  assert(legalMoves(view).some(m=>m.from===result.move.from&&m.to===result.move.to));assert(rows.every(r=>!r.progress));
  assert(performance.now()-begin<1800);assert.equal(stalled.active.size,0);await exit;assert(child.exitCode!==null||child.signalCode!==null);
  evidence.unreadyWatchdog={elapsedMs:performance.now()-begin,depth:0,processExited:true};
 }finally{if(stalled)await stalled.close();for(const f of [stub,source])fs.rmSync(f,{force:true});}
}));
