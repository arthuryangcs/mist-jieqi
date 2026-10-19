// Loopback API/static-asset integration. No browser or security setting changes.
import fs from'node:fs';import assert from'node:assert/strict';import http from'node:http';
import{initial,publicState,legalMoves}from'../engine.js';import{seeded}from'../ai.js';import{Native}from'./bridge.mjs';
import{compileFocus,dir,sha}from'./focus-variants.mjs';import{writePreview,previewModule}from'./focus-web.mjs';
const variant=process.argv[2]||'both',record={variant,startedAt:new Date().toISOString(),checks:[],passed:false};let service;
try{
 const build=compileFocus(variant);record.build=build;const warm=new Native({binary:build.binary});await warm.ready;record.warmInitializationMs=warm.initializationMs;await warm.close();
 const root=writePreview(),mod=await previewModule();service=mod.createLocalServer({executable:build.binary,buildInfo:{...build,threads:4,independentWorldSearch:true,focusedPlay:true,rootBudget:variant!=='tactical',criticalTactics:variant!=='root'},staticRoot:root});
 const address=await service.listen(0),url=`http://127.0.0.1:${address.port}`;record.binding=address;
 const status=await(await fetch(url+'/api/status')).json();assert.equal(status.sourceSha256,build.sourceSha256);assert.equal(status.binarySha256,build.binarySha256);assert(status.focusedPlay);assert.equal(status.active,0);
 const html=await(await fetch(url+'/')).text(),app=await(await fetch(url+'/app.js')).text();assert.match(html,/实验页面/);assert.match(app,/候选主深度/);assert.match(app,/purpose:auto/);record.checks.push({name:'loopback status and experimental assets',passed:true});
 const view=publicState(initial(seeded(15013)),'r'),ms=legalMoves(view),post=(body,headers={})=>fetch(url+'/api/search',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 const token=()=>crypto.randomUUID();assert.equal((await post({token:token(),view,timeMs:1000,purpose:'invalid'})).status,400);const bad=structuredClone(view);bad.board[0].type='R';assert.equal((await post({token:token(),view:bad,timeMs:1000,purpose:'play'})).status,400);assert.equal((await post({token:token(),view,timeMs:1000,purpose:'play'},{Origin:'https://example.invalid'})).status,403);
 let observedHost;service.server.once('request',req=>{observedHost=req.headers.host;});const normalized=await fetch(url+'/api/status',{headers:{Host:'foreign.invalid'}});record.fetchHostControl={status:normalized.status,sentHost:observedHost};await normalized.text();
 const rawHostStatus=await new Promise((resolve,reject)=>{const request=http.get(url+'/api/status',{headers:{Host:'foreign.invalid'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});assert.equal(rawHostStatus,403);record.checks.push({name:'purpose, real-hidden identity, cross-origin and raw HTTP foreign-host rejection',passed:true});
 for(const purpose of['analysis','play']){
  const start=performance.now(),response=await post({token:token(),view,timeMs:1000,purpose});assert.equal(response.status,200);assert.equal(response.headers.get('X-Engine'),'cpp-native');
  const lines=(await response.text()).trim().split('\n').map(x=>JSON.parse(x));assert(lines.length);assert(!lines.some(x=>x.error));assert(lines.some(x=>!x.progress));
  for(const line of lines){const r=line.result;assert.equal(r.engine,'cpp-native');assert.equal(r.sourceSha256,build.sourceSha256);assert.equal(r.engineVerified,true);assert(!('allCandidates'in r));assert(r.candidates.length<=5);assert(ms.some(m=>m.from===r.move?.from&&m.to===r.move?.to));
   if(purpose==='play'&&r.depth){assert.equal(r.rootCount,ms.length);assert.equal(r.comparisonDepth,r.depth);assert(r.comparedCount>=2);assert(r.comparedCount<=r.rootCount);assert(r.fullRootDepth<=r.depth);}
  }
  record.checks.push({name:purpose+' real C++ stream',elapsedMs:performance.now()-start,frames:lines.length,last:lines.at(-1).result,passed:true});
 }
 const id=token(),response=await post({token:id,view,timeMs:6000,purpose:'play'});assert.equal(response.status,200);assert.equal((await post({token:id,view,timeMs:6000,purpose:'play'})).status,409);assert.equal((await fetch(url+'/api/search/'+id,{method:'DELETE'})).status,200);await response.text();
 assert.equal((await(await fetch(url+'/api/status')).json()).active,0);record.checks.push({name:'duplicate search rejected and cancellation cleans active process',passed:true});
 record.previewFiles=Object.fromEntries(['index.html','app.js','native-client.js'].map(f=>[f,sha(fs.readFileSync(root+'/'+f))]));record.passed=true;
}catch(e){record.error=e.stack;throw e;}finally{if(service)await service.close();record.finishedAt=new Date().toISOString();fs.writeFileSync(`${dir}/service-${variant}.json`,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({variant,passed:record.passed,checks:record.checks.length,error:record.error}));}
