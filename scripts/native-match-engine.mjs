import {cleanSearchStats,mergeSearchStats} from '../search-metrics.js';
import {Native,fixture,observationSeed}from'../native/bridge.mjs';import{legalMoves}from'../engine.js';import{ExternalEngine}from'./external-engine.js';
export class CandidateEngine {
 constructor(){this.native=null;this.initializations=[];}
 async ready(){if(this.native)return;const n=new Native();n.exited=new Promise(resolve=>n.process.once('exit',resolve));await n.ready;this.initializations.push(n.initializationMs);this.native=n;}
 async search(view,budget){
  await this.ready();const n=this.native,start=performance.now(),legal=legalMoves(view),allowed=new Set(legal.map(m=>m.from*90+m.to));let latest=null,latestStats=null,firstProgressMs=null;
  const fallback={move:legal[0]||null,depth:0,nodes:0,samples:0,score:0,allCandidates:[]};
  const result=await new Promise((resolve,reject)=>{
   let finished=false,timer;const finish=(r,deadlineStop=false)=>{if(finished)return;finished=true;clearTimeout(timer);resolve({...mergeSearchStats(r,latestStats,{deadlineStop}),searchElapsedMs:r.elapsedMs,elapsedMs:performance.now()-start,firstProgressMs,deadlineStop,fallbackUsed:r.depth===0});};
   timer=setTimeout(()=>{if(finished)return;this.native=null;n.stop();finish(latest||fallback,true);},Math.max(0,budget-(performance.now()-start)));
   try{const f=fixture(view,{seed:observationSeed(view),samples:8});n.request(f,{mode:'STREAM',depth:0,budget:Math.max(0,budget-(performance.now()-start)),onTelemetry:s=>{if(!finished)latestStats=cleanSearchStats(s);},onProgress:r=>{if(finished)return;if(!allowed.has(r.move?.from*90+r.move?.to))throw Error('C++进度非法');latest=r;firstProgressMs??=performance.now()-start;}}).then(r=>{if(!allowed.has(r.move?.from*90+r.move?.to))throw Error('C++最终着法非法');finish(r);}).catch(e=>{if(!finished){finished=true;clearTimeout(timer);reject(e);}});}catch(e){finished=true;clearTimeout(timer);reject(e);}
  });
  if(result.deadlineStop)await n.exited;
  return{...result,elapsedMs:performance.now()-start};
 }
 async close(){const n=this.native;this.native=null;if(n){n.stop();await n.exited;}}
}
export class PikaEngine extends ExternalEngine {
 constructor(){super();this.exited=new Promise(resolve=>this.p.once('exit',resolve));this.initializationMs=null;}
 async init(){const start=performance.now();await super.init();if(!this.lines.some(x=>/^option name Threads type spin .*max (\d+)/.test(x)&&Number(x.match(/max (\d+)/)[1])>=4))throw Error('固定对手不支持4线程');this.send('setoption name Threads value 4');this.send('setoption name Hash value 64');this.send('setoption name Move Overhead value 0');this.send('ucinewgame');const ready=this.wait(x=>x==='readyok');this.send('isready');await ready;this.initializationMs=performance.now()-start;}
 async stopAndClose(){this.close();await this.exited;}
}
