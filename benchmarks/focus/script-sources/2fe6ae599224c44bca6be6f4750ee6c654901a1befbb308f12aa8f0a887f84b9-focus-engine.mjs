// Same end-to-end clock for full and focused native builds. Readiness is outside
// the turn clock; projection/sampling/IPC/search/stop/reap stay inside it.
import{Native,fixture,observationSeed}from'./bridge.mjs';import{legalMoves}from'../engine.js';
export class FocusEngine {
 constructor({binary,focused=true}={}){this.binary=binary;this.focused=focused;this.native=null;this.initializations=[];}
 async ready(){if(this.native)return;const n=new Native({binary:this.binary});n.exited=new Promise(resolve=>n.process.once('exit',resolve));this.native=n;await n.ready;this.initializations.push(n.initializationMs);}
 async search(view,budget){
  await this.ready();const n=this.native,start=performance.now(),legal=legalMoves(view),allowed=new Set(legal.map(m=>m.from*90+m.to));
  let latest=null,firstProgressMs=null,timerAt=null,resolveAt=null,reapAt=null,preparationMs=null;
  const fallback={move:legal[0]||null,depth:0,nodes:0,samples:0,score:0,allCandidates:[],searchScope:'unsearched',rootCount:legal.length,comparedCount:0,fullRootDepth:0};
  const validate=(r,samples)=>{
   if(!allowed.has(r.move?.from*90+r.move?.to))throw Error('Native returned an illegal root move');
   if(this.focused&&r.depth){
    if(r.rootCount!==legal.length||r.samples!==samples||r.comparedCount!==r.allCandidates.length||r.comparisonDepth!==r.depth||r.fullRootDepth>r.depth||r.comparedCount<Math.min(2,legal.length))throw Error('Invalid focused comparison metadata');
    if(r.searchScope!==(r.comparedCount===r.rootCount?'full-root':'focused-root'))throw Error('Misleading root coverage');
   }
  };
  const result=await new Promise((resolve,reject)=>{
   let finished=false,timer;
   const finish=(r,deadlineStop=false)=>{if(finished)return;finished=true;clearTimeout(timer);resolveAt=performance.now()-start;resolve({...r,searchElapsedMs:r.elapsedMs,deadlineStop,fallbackUsed:r.depth===0});};
   timer=setTimeout(()=>{if(finished)return;timerAt=performance.now()-start;this.native=null;n.stop();finish(latest||fallback,true);},Math.max(0,budget-(performance.now()-start)));
   try {
    const f=fixture(view,{seed:observationSeed(view),samples:8});preparationMs=performance.now()-start;
    n.request(f,{mode:this.focused?'STREAM_PLAY':'STREAM',depth:8,budget:Math.max(0,budget-(performance.now()-start)),onProgress:r=>{if(finished)return;validate(r,f.samples);latest=r;firstProgressMs??=performance.now()-start;}}).then(r=>{validate(r,f.samples);finish(r);}).catch(e=>{if(!finished){finished=true;clearTimeout(timer);reject(e);}});
   }catch(e){finished=true;clearTimeout(timer);reject(e);}
  });
  if(result.deadlineStop){await n.exited;reapAt=performance.now()-start;}
  return{...result,elapsedMs:performance.now()-start,firstProgressMs,clock:{preparationMs,timerAt,resolveAt,reapAt}};
 }
 async close(){const n=this.native;this.native=null;if(n){n.stop();await n.exited;}}
}
