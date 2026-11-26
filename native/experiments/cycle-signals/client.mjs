import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {Native,fixture,observationSeed} from './bridge.mjs';
import {environment,cache} from './build.mjs';
import path from 'node:path';const defaultBinary=path.resolve('.cache/default-all-20261118/default');
import {legalMoves} from '../../../engine.js';
import {mergeSearchStats,cleanSearchStats} from '../../../search-metrics.js';

const bounded=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('experimental readiness/reap timeout')),ms);timer.unref();})]);
export class DiagnosticEngine{
 constructor({binary=defaultBinary,reserveMs=40,diagnosticDepth=0,signalsEnabled=true,maxSignalMs=100}={}){this.signalsEnabled=signalsEnabled;this.maxSignalMs=maxSignalMs;this.binary=binary;this.reserveMs=reserveMs;this.diagnosticDepth=diagnosticDepth;this.native=null;this.busy=false;this.generation=0;}
 async ready(){environment();if(!this.native){this.native=new Native({binary:this.binary,signalsEnabled:this.signalsEnabled,maxSignalMs:this.maxSignalMs});this.native.reaped=new Promise(resolve=>this.native.process.once('close',resolve));}const n=this.native;try{await bounded(n.ready,10000);assert.equal(n.capabilities.protocol,2);assert.equal(n.capabilities.defaultPreset,'all-compatible-v2');}catch(error){n.stop();if(this.native===n)this.native=null;await bounded(n.reaped,2000);throw error;}}
 async search(view,budget=2000){
  if(this.busy)throw Error('experimental search overlap');this.busy=true;const generation=this.generation;
  try{
   await this.ready();if(generation!==this.generation)throw Error('experimental search cancelled');
   const n=this.native,start=performance.now(),soft=Math.max(0,budget-this.reserveMs),legal=legalMoves(view),allowed=new Set(legal.map(m=>m.from*90+m.to));
   const clock={budgetMs:budget,hostReserveMs:this.reserveMs,softBudgetMs:soft,frames:[]};let latest=null,stats=null,timer,finished=false,killed=false;
   const result=await new Promise((resolve,reject)=>{
    const finish=(r,deadlineStop)=>{if(finished)return;finished=true;clearTimeout(timer);resolve({...mergeSearchStats(r,stats,{deadlineStop}),deadlineStop,fallbackUsed:!r.depth,cycleSignals:r.cycleSignals??n.currentDiagnostics??{enabled:this.signalsEnabled,available:false,reason:'no-diagnostic-frame',signalOnly:true,adjudicationChanged:false},clock});};
    timer=setTimeout(()=>{if(finished)return;clock.timerAt=performance.now()-start;killed=true;if(this.native===n)this.native=null;n.stop();finish(latest||{move:legal[0]??null,depth:0,score:0,nodes:0,samples:0},true);},Math.max(0,soft-(performance.now()-start)));
    const fail=error=>{if(!finished){finished=true;clearTimeout(timer);reject(error);}};
    try{
     const f=fixture(view,{seed:observationSeed(view),samples:15});clock.preparationMs=performance.now()-start;
     const validate=r=>{assert(r.terminal?r.move===null:allowed.has(r.move?.from*90+r.move?.to),'illegal default result');if(r.depth>0){assert.equal(r.samples,f.samples);assert.equal(r.rootCount,legal.length);assert.equal(r.comparedCount,r.allCandidates.length);assert(r.comparedCount>=Math.min(legal.length,Math.max(2,Math.ceil(legal.length/4))));assert(r.fullRootDepth>=r.depth-1);assert(r.ttAllocatedBytes<=67108864);}};
     n.request(f,{mode:'STREAM_PLAY',depth:this.diagnosticDepth,budget:Math.max(0,soft-(performance.now()-start)),onTelemetry:s=>{if(!finished&&generation===this.generation){stats=cleanSearchStats(s);clock.frames.push({kind:'telemetry',at:performance.now()-start,...stats});}},onProgress:r=>{if(finished||generation!==this.generation)return;validate(r);latest=r;clock.frames.push({kind:'progress',at:performance.now()-start,depth:r.depth,completedDepth:r.completedDepth,mainDepth:r.mainDepth,selDepth:r.selDepth,visitedNodes:r.visitedNodes});}}).then(r=>{if(!finished){validate(r);finish(r,false);}}).catch(fail);
    }catch(error){fail(error);}
   });
   if(killed)await bounded(n.reaped,2000);if(generation!==this.generation)throw Error('experimental search cancelled');return{...result,elapsedMs:performance.now()-start};
  }finally{this.busy=false;}
 }
 async stop(){this.generation++;const n=this.native;this.native=null;if(n){n.stop();await bounded(n.reaped,2000);}}
 async close(){if(this.busy)return this.stop();const n=this.native;this.native=null;if(n){await bounded(n.close(),3000);await bounded(n.reaped,2000);}}
}
