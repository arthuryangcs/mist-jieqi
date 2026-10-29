import test from 'node:test';import assert from 'node:assert/strict';
import {initial,publicState} from '../engine.js';import {NativeWorker} from '../native-client.js';
test('旧页面调用新JS Worker只收推荐，新页面明确请求后才收遥测',async()=>{
 const out=[];globalThis.self={postMessage:x=>out.push(x)};await import('../worker.js?protocol-test');const view=publicState(initial());
 self.onmessage({data:{id:1,view,timeMs:50}});assert(out.length);assert(out.every(x=>!x.telemetry));assert(out.at(-1).result);
 out.length=0;self.onmessage({data:{id:2,view,timeMs:50,depthMetrics:true}});assert(out.some(x=>x.telemetry));assert(out.at(-1).result);assert(out.every(x=>x.id===2));delete globalThis.self;
});
test('新native客户端明确协商遥测，仍核对C++来源',async()=>{
 let body;const worker=new NativeWorker({fetcher:async(url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({result:{engine:'cpp-native',engineVerified:true,move:{from:54,to:45},depth:1}})+'\n',{headers:{'X-Engine':'cpp-native'}});}});
 await new Promise((resolve,reject)=>{worker.onerror=reject;worker.onmessage=()=>resolve();worker.postMessage({id:1,view:publicState(initial()),timeMs:500});});assert.equal(body.depthMetrics,true);assert(!body.view.board.some(p=>p?.hidden&&'type'in p));
});
