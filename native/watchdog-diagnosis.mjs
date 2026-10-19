// Instrument an in-memory copy of the existing service; do not change its clock.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {initial,publicState} from '../engine.js';import {seeded} from '../ai.js';
const dir='benchmarks/aspiration2',build=JSON.parse(fs.readFileSync(`${dir}/baseline-build.json`));
const original=fs.readFileSync('native/server.mjs','utf8');let source=original;
const patch=(a,b)=>{assert.equal(source.split(a).length,2,a);source=source.replace(a,b);};
for(const p of ['./build.mjs','./bridge.mjs','../engine.js','../editor.js'])source=source.replace(`'${p}'`,JSON.stringify(new URL(p,new URL('./server.mjs',import.meta.url)).href));
patch("if(process.argv[1]===fileURLToPath(import.meta.url)){",'if(false){');
patch('const f=fixture(input.view,{seed:observationSeed(input.view),samples:8}),native=new Native({binary:executable});',`globalThis.__mistWatchdog('before-fixture');
    const f=fixture(input.view,{seed:observationSeed(input.view),samples:8});globalThis.__mistWatchdog('after-fixture');
    const native=new Native({binary:executable});globalThis.__mistWatchdog('constructed');
    native.process.on('spawn',()=>globalThis.__mistWatchdog('spawn'));
    native.process.stdout.on('data',x=>globalThis.__mistWatchdog('stdout',{bytes:x.length,prefix:String(x).slice(0,72)}));
    native.process.on('exit',(code,signal)=>globalThis.__mistWatchdog('exit',{code,signal}));`);
patch('const cleanup=()=>{clearTimeout(timer);active.delete(input.token);native.stop();};',"const cleanup=()=>{globalThis.__mistWatchdog('cleanup');clearTimeout(timer);active.delete(input.token);native.stop();};");
patch('if(finished)return;finished=true;\n     // Independent',"globalThis.__mistWatchdog('deadline');if(finished)return;finished=true;\n     // Independent");
patch('await native.ready;if(finished)return;',"await native.ready;globalThis.__mistWatchdog('ready',{finished,initializationMs:native.initializationMs});if(finished)return;");
patch('const r=await native.request(f,',"globalThis.__mistWatchdog('send');const r=await native.request(f,");
patch('onProgress:r=>{if(finished)return;latest=wire(r);',"onProgress:r=>{globalThis.__mistWatchdog('progress',{depth:r.depth});if(finished)return;latest=wire(r);");
const {createLocalServer}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const record={startedAt:new Date().toISOString(),originalServiceSha256:sha(original),instrumentedServiceSha256:sha(source),rows:[],passed:false,
 limits:['This cannot reconstruct the unrecorded first failure from the previous round.','Cold/warm observations identify intervals, not macOS security subsystem root causes.','Instrumentation is only in memory; production source and1200ms deadline unchanged.']};
let current;
globalThis.__mistWatchdog=(event,data={})=>current?.events.push({event,ms:performance.now()-current.begin,...data});
try {
 for(const [caseIndex,cfg] of [{readyDelay:0,progressDelay:0,repeats:3},{readyDelay:1500,progressDelay:0,repeats:1},{readyDelay:0,progressDelay:1500,repeats:1}].entries())for(let repeat=0;repeat<cfg.repeats;repeat++) {
  const file=path.resolve(`.cache/aspiration2/watchdog-${caseIndex}-${repeat}`),cpp=file+'.cpp';
  const text=`#include <iostream>
#include <string>
#include <chrono>
#include <thread>
int main(int argc,char**){
 if(argc>1){std::cout<<R"({"ready":true,"protocol":2,"streaming":true})"<<std::endl;return 0;}
 std::this_thread::sleep_for(std::chrono::milliseconds(${cfg.readyDelay}));
 std::cout<<R"({"ready":true,"protocol":2,"streaming":true,"buildNonce":${caseIndex*100+repeat}})"<<std::endl;
 std::string request;std::getline(std::cin,request);
 std::this_thread::sleep_for(std::chrono::milliseconds(${cfg.progressDelay}));
 std::cout<<R"({"progress":true,"result":{"depth":1,"nodes":1,"samples":8,"elapsedMs":1,"move":{"from":54,"to":45},"score":0,"allCandidates":[{"from":54,"to":45,"score":0,"spread":0}]}})"<<std::endl;
 const auto end=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(std::chrono::steady_clock::now()<end){}
}`;
  fs.writeFileSync(cpp,text);const compiled=spawnSync(process.env.CXX||'clang++',[...build.flags,cpp,'-o',file],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
  for(const warm of (caseIndex===0?[false,true]:[false])) {
   if(warm){const probe=spawnSync(file,['--probe'],{encoding:'utf8',timeout:10000});assert.equal(probe.status,0);}
   const service=createLocalServer({executable:file,buildInfo:build}),addr=await service.listen(0),row={caseIndex,repeat,warm,readyDelay:cfg.readyDelay,progressDelay:cfg.progressDelay,events:[],begin:performance.now()};current=row;
   let last=performance.now(),maxHeartbeatGapMs=0;const heartbeat=setInterval(()=>{const now=performance.now();maxHeartbeatGapMs=Math.max(maxHeartbeatGapMs,now-last);last=now;},20);
   try {
    const body={token:crypto.randomUUID(),timeMs:1200,view:publicState(initial(seeded(17)),'r')};
    const response=await fetch(`http://127.0.0.1:${addr.port}/api/search`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);
    const rows=(await response.text()).trim().split('\n').map(JSON.parse);row.endToEndMs=performance.now()-row.begin;row.response=rows;row.active=service.active.size;
    for(let i=0;i<50&&!row.events.some(e=>e.event==='exit');i++)await new Promise(r=>setTimeout(r,10));
    row.maxHeartbeatGapMs=maxHeartbeatGapMs;row.processExited=row.events.some(e=>e.event==='exit');
    assert(rows.at(-1).result.deadlineStop);assert(row.endToEndMs<1800);assert.equal(row.active,0);assert(row.processExited);
    const depth=rows.at(-1).result.depth;assert.equal(depth,row.events.some(e=>e.event==='progress')?1:0);
    if(caseIndex>0)assert.equal(depth,0);row.passed=true;
   }finally{clearInterval(heartbeat);await service.close();delete row.begin;record.rows.push(row);fs.writeFileSync(`${dir}/watchdog.json`,JSON.stringify(record,null,2)+'\n');}
  }
 }
 record.passed=true;
}catch(e){record.error=e.stack;throw e;}
finally{delete globalThis.__mistWatchdog;record.finishedAt=new Date().toISOString();fs.writeFileSync(`${dir}/watchdog.json`,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({passed:record.passed,rows:record.rows.map(r=>({caseIndex:r.caseIndex,repeat:r.repeat,warm:r.warm,depth:r.response?.at(-1).result.depth,ms:r.endToEndMs,events:r.events}))}));}
