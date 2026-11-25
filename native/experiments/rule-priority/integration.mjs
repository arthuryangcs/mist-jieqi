import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{Worker}from'node:worker_threads';
import{transport}from'./web.mjs';import{Native}from'./bridge.mjs';import{cache}from'./build.mjs';
import{counterexample}from'./case.mjs';import{context,key,snapshot}from'./selection.mjs';import{loadDeadline}from'./entry-source.mjs';import{NativeWorker}from'../../../native-client.js';
const {view}=counterexample(),c=context(view),{startTimedSearch}=await loadDeadline(),b=JSON.parse(fs.readFileSync(cache+'/trial.json')),r={passed:false,cases:[],scope:'Actual loopback HTTP + production NativeWorker + generated experimental deadline entry. No browser DOM/visual verification. Stalled frames/dispatch are explicit fault injection.'},allNative=[];
const bounded=p=>Promise.race([p,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('integration timeout')),7000);t.unref();})]);
class Delayed extends Native{
 constructor(options,mode){super(options);this.mode=mode;allNative.push(this);this.hiddenProgress=0;}
 async request(f,options){const x=await super.request(f,{...options,onTelemetry:this.mode==='silent'?()=>{}:options.onTelemetry,onProgress:this.mode==='silent'?()=>this.hiddenProgress++:options.onProgress});return new Promise((resolve,reject)=>{this.release=()=>reject(Error('controlled delayed frame cancelled'));this.delay=setTimeout(()=>resolve(x),5000);});}
 stop(){clearTimeout(this.delay);this.release?.();super.stop();}
}
const mod=await transport();let mode='normal';
const s=mod.createLocalServer({executable:path.resolve(cache+'/trial'),buildInfo:{...b,threads:4,unlimitedDepth:true,depthMetrics:true,independentWorldSearch:true,safetyMaxPly:127},samples:15,searchMode:'STREAM_PLAY',engineProfile:'rule-priority-experiment',createNative:o=>{if(mode!=='normal')return new Delayed(o,mode);const n=new Native(o);allNative.push(n);return n;}}),address=await s.listen(0),base='http://127.0.0.1:'+address.port;
const post=(token,timeMs=2000,v=view)=>fetch(base+'/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({view:v,token,timeMs,depthMetrics:true}),signal:AbortSignal.timeout(7000)});
const frames=async response=>{assert.equal(response.status,200);const x=(await response.text()).trim().split('\n').map(JSON.parse);assert(!x.some(f=>f.error));return x;};
function verify(x){assert(c.legal.some(m=>key(m)===key(x.move)));assert(!c.losses.has(key(x.move)));assert.equal(x.rootCount,16);}
try{
 assert.equal((await fetch(base+'/')).status,200);
 assert((await(await fetch(base+'/app.js')).text()).includes('所选着尚无同深度评分'));
 assert((await(await fetch(base+'/deadline-search.js')).text()).includes('publicFallback(priority)'));
 assert((await(await fetch(base+'/worker.js')).text()).includes('/native/experiments/rule-priority/javascript.mjs'));
 assert((await fetch(base+'/native/experiments/rule-priority/selection.mjs')).headers.get('content-type').startsWith('text/javascript'));
 const normal=await frames(await post('priority-normal-token')),result=normal.filter(x=>x.result&&!x.progress).at(-1).result;verify(result);assert(result.selectedHasSameDepthScore);assert.equal(result.samples,15);assert.equal(result.selectedScoreDepth,result.depth);r.cases.push({name:'actual-HTTP-normal',...snapshot(result)});
 // Reuse an actual HTTP progress payload in the unchanged timer event flow.
 const cached=normal.filter(x=>x.progress).at(-1).result;let tick,done,worker={engine:'cpp-native',postMessage(){},terminate(){}};
 startTimedSearch({worker,id:9,view,timeMs:2000,setTimer:f=>(tick=f,1),clearTimer(){},clock:()=>0,onComplete:x=>done=x});worker.onmessage({data:{id:9,progress:true,result:cached}});tick();verify(done);assert(done.deadlineStop);for(const k of['samples','comparedCount','rootCount','completedDepth','fullRootDepth','selectedHasSameDepthScore','selectedScoreDepth'])assert.equal(done[k],cached[k]);r.cases.push({name:'deadline-cached-actual-native-progress',...snapshot(done)});
 // End-to-end browser transport adapter over the actual HTTP service.
 const nw=new NativeWorker({fetcher:(url,options)=>fetch(base+url,options)}),progress=[];
 const actual=await bounded(new Promise((resolve,reject)=>startTimedSearch({worker:nw,id:10,view,timeMs:2000,onProgress:x=>progress.push(snapshot(x)),onComplete:resolve,onError:reject})));nw.terminate();verify(actual);r.cases.push({name:'NativeWorker-deadline-HTTP',...snapshot(actual),progressFrames:progress.length});
 // Backend first-frame absence, while a real core is started/searches but all
 // progress/final frames are withheld by the test-only startup factory.
 mode='silent';const silent=await frames(await post('priority-silent-token',500)),noFrame=silent.filter(x=>x.result&&!x.progress).at(-1).result;assert(!silent.some(x=>x.progress));verify(noFrame);assert(noFrame.fallbackUsed);assert(noFrame.deadlineStop);assert.equal(noFrame.engineVerified,false);assert.equal(noFrame.samples,0);assert.equal(noFrame.comparedCount,0);assert.equal(noFrame.completedDepth,0);assert.equal(noFrame.fullRootDepth,0);assert.equal(noFrame.selectedHasSameDepthScore,false);assert.equal(noFrame.score,null);r.cases.push({name:'C++-service-no-first-frame-fault-injection',...snapshot(noFrame),engineVerified:noFrame.engineVerified});
 mode='cached';const kept=await frames(await post('priority-cached-token',700)),last=kept.filter(x=>x.result&&!x.progress).at(-1).result;verify(last);assert(kept.some(x=>x.progress));assert(last.deadlineStop);assert(last.selectedHasSameDepthScore);assert.equal(last.samples,15);r.cases.push({name:'C++-service-cached-progress-delayed-final',...snapshot(last)});
 mode='normal';
 // Load the actual served JS worker. Only module URLs are resolved to local
 // files for Node's worker runtime; dispatch is deliberately delayed until the
 // host has timed out, to exercise a genuine no-message worker deadline.
 let source=await(await fetch(base+'/worker.js')).text();source=source.replace("'/native/experiments/rule-priority/javascript.mjs'",JSON.stringify(new URL('./javascript.mjs',import.meta.url).href));
 const boot=`import{parentPort}from'node:worker_threads';globalThis.self={postMessage:x=>parentPort.postMessage(x)};await import(${JSON.stringify('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))});parentPort.postMessage({ready:true});parentPort.on('message',data=>self.onmessage({data}));`;
 const raw=new Worker(new URL('data:text/javascript;base64,'+Buffer.from(boot).toString('base64')),{type:'module'});await bounded(new Promise((resolve,reject)=>{raw.once('error',reject);raw.once('message',resolve);}));let dispatch,termination;
 const jw={engine:'javascript',postMessage:data=>{dispatch=setTimeout(()=>raw.postMessage(data),3000);},terminate(){clearTimeout(dispatch);termination=raw.terminate();}};raw.on('message',data=>jw.onmessage?.({data}));
 try{const x=await bounded(new Promise((resolve,reject)=>startTimedSearch({worker:jw,id:12,view,timeMs:150,onComplete:resolve,onError:reject})));verify(x);assert.equal(x.engine,'javascript');assert.equal(x.engineVerified,false);assert.equal(x.samples,0);assert.equal(x.selectedHasSameDepthScore,false);assert.equal(x.score,null);r.cases.push({name:'served-JS-worker-before-first-frame-delayed-dispatch',...snapshot(x),engineVerified:x.engineVerified});}finally{jw.terminate();await termination;}
 // Existing transport safety remains active.
 const pending=await post('priority-duplicate-token',1000),drain=pending.text();assert.equal((await post('priority-duplicate-token',1000)).status,409);await fetch(base+'/api/search/priority-duplicate-token',{method:'DELETE'});await drain;
 const bad=structuredClone(view);bad.board.find(p=>p?.hidden).type='R';assert.equal((await post('priority-private-token',100,bad)).status,400);r.duplicateCancelPrivacy=true;r.passed=true;
}finally{await s.close();for(const n of allNative){n.stop();await bounded(n.reaped);}r.ownedProcessesReaped=true;fs.writeFileSync(cache+'/integration.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));}
