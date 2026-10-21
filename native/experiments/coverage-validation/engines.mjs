// Isolated clock instrumentation. No production file, score or rule changes.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {fixture,encode,observationSeed} from '../../bridge.mjs';
import {legalMoves} from '../../../engine.js';
import {PikaEngine} from '../../../scripts/native-match-engine.mjs';
import {parseMove,coordinate} from '../../../scripts/external-engine.js';
const now=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class TraceWire {
 constructor({binary,args=[]}={}){
  this.pending=null;this.closed=false;this.stderr='';this.lastChunkAt=null;
  const start=now();this.process=spawn(binary,args,{stdio:['pipe','pipe','pipe']});
  this.ready=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject;});
  this.process.stdout.prependListener('data',()=>{this.lastChunkAt=now();});
  createInterface({input:this.process.stdout}).on('line',line=>{
   const begin=now();try{const x=JSON.parse(line),parsed=now();
    if(x.ready){this.capabilities=x;this.initializationMs=parsed-start;this.readyResolve();return;}
    const t=this.pending;if(!t){if(!this.closed)throw Error('Unexpected native response');return;}
    const frame={receivedAt:this.lastChunkAt-t.start,callbackAt:begin-t.start,parsedAt:parsed-t.start,parseMs:parsed-begin,coreMs:x.progress?x.result.elapsedMs:x.elapsedMs,progress:!!x.progress};
    t.trace.frames.push(frame);t.trace.parseMs+=frame.parseMs;
    if(x.progress)t.onProgress?.(x.result);else {this.pending=null;t.trace.finalFrameAt=parsed-t.start;t.trace.finalCoreMs=x.elapsedMs;t.resolve(x);}
   }catch(e){this.fail(e);}
  });
  this.process.stderr.on('data',x=>{this.stderr+=x;});
  this.process.stdin.on('error',e=>{if(!this.closed)this.fail(e);});
  this.process.on('error',e=>this.fail(e));
  this.exited=new Promise(resolve=>this.process.once('exit',(code,signal)=>{this.exitAt=now();this.exitInfo={code,signal};if(!this.closed)this.fail(Error('Native exited '+code+'/'+signal));resolve();}));
  this.reaped=new Promise(resolve=>this.process.once('close',()=>{this.closeAt=now();resolve();}));
 }
 fail(e){this.readyReject(e);if(this.pending){const t=this.pending;this.pending=null;t.reject(e);}}
 async request(f,options,trace,start){
  await this.ready;if(this.pending)throw Error('Overlapping native search');
  trace.encodeStartAt=now()-start;const data=encode(f,options);trace.encodeEndAt=now()-start;
  return new Promise((resolve,reject)=>{this.pending={resolve,reject,onProgress:options.onProgress,trace,start};trace.sendAt=now()-start;this.process.stdin.write(data,()=>{trace.writeCallbackAt=now()-start;});});
 }
 stop(){this.closed=true;this.fail(Error('Search cancelled'));this.process.kill();}
 async close(){this.stop();await this.reaped;}
}
export class ClockNative {
 constructor({binary,focused=false,reserveMs=0,fault=null,wireFactory=null}={}){this.binary=binary;this.focused=focused;this.reserveMs=reserveMs;this.fault=fault;this.wireFactory=wireFactory;this.native=null;this.initializations=[];}
 async ready(){if(this.native)return;const n=this.wireFactory?this.wireFactory():new TraceWire({binary:this.binary});this.native=n;await n.ready;this.initializations.push(n.initializationMs);}
 async search(view,budget){
  await this.ready();const n=this.native,start=now(),legal=legalMoves(view),allowed=new Set(legal.map(m=>m.from*90+m.to));
  const soft=Math.max(0,budget-this.reserveMs),trace={nominalBudgetMs:budget,reserveMs:this.reserveMs,softDeadlineAt:soft,frames:[],parseMs:0},lag=monitorEventLoopDelay({resolution:5});lag.enable();
  let latest=null,firstProgressMs=null,staller=null;
  const validate=r=>{if(!allowed.has(r.move?.from*90+r.move?.to))throw Error('Illegal native result');if(this.focused&&r.depth){if(r.samples!==f.samples||r.rootCount!==legal.length||r.comparedCount!==r.allCandidates.length||r.comparisonDepth!==r.depth||r.comparedCount<Math.min(legal.length,Math.max(2,Math.ceil(legal.length/4))))throw Error('Coverage comparison metadata');if(r.depth>3&&r.fullRootDepth<r.depth-1)throw Error('Coverage floor');}};
  let f,result;
  try{
   result=await new Promise((resolve,reject)=>{
    let finished=false;const finish=(r,stopped)=>{if(finished)return;finished=true;clearTimeout(timer);trace.resolveAt=now()-start;resolve({...r,deadlineStop:stopped,fallbackUsed:!r.depth,searchElapsedMs:r.elapsedMs});};
    const timer=setTimeout(()=>{if(finished)return;trace.timerAt=now()-start;trace.timerLateMs=trace.timerAt-soft;trace.killAt=now()-start;this.native=null;n.stop();finish(latest||{move:legal[0],depth:0,score:0,nodes:0,samples:0,allCandidates:[],rootCount:legal.length,comparedCount:0,fullRootDepth:0,searchScope:'unsearched'},true);},Math.max(0,soft-(now()-start)));
    if(this.fault?.stallMs)staller=setTimeout(()=>{trace.injectedStallAt=now()-start;const until=now()+this.fault.stallMs;while(now()<until){}trace.injectedStallEndAt=now()-start;},Math.max(0,soft-10-(now()-start)));
    try{trace.preparationStartAt=now()-start;f=fixture(view,{seed:observationSeed(view),samples:8});trace.preparationEndAt=now()-start;
     n.request(f,{mode:this.focused?'STREAM_PLAY':'STREAM',depth:8,budget:Math.max(0,soft-(now()-start)),onProgress:r=>{if(finished)return;validate(r);latest=r;firstProgressMs??=now()-start;}},trace,start).then(r=>{if(!finished){validate(r);finish(r,false);}}).catch(e=>{if(!finished){finished=true;clearTimeout(timer);reject(e);}});
    }catch(e){finished=true;clearTimeout(timer);reject(e);}
   });
   if(result.deadlineStop){await n.exited;trace.exitAt=n.exitAt-start;await n.reaped;trace.closeAt=n.closeAt-start;if(this.fault?.reapDelayMs){trace.injectedReapDelayMs=this.fault.reapDelayMs;await sleep(this.fault.reapDelayMs);}trace.reapAt=now()-start;}
   return{...result,elapsedMs:now()-start,firstProgressMs,clock:{...trace,eventLoopMaxMs:lag.max/1e6,eventLoopMeanMs:Number.isFinite(lag.mean)?lag.mean/1e6:null,preparationMs:trace.preparationEndAt-trace.preparationStartAt,encodingMs:trace.encodeEndAt-trace.encodeStartAt,writeCallbackLagMs:trace.writeCallbackAt-trace.sendAt,postKillExitMs:trace.exitAt!=null?trace.exitAt-trace.killAt:null,exitToPipeCloseMs:trace.closeAt!=null?trace.closeAt-trace.exitAt:null,finalTransportQueueCleanupMs:trace.finalFrameAt!=null?trace.finalFrameAt-trace.sendAt-trace.finalCoreMs:null}};
  }finally{clearTimeout(staller);lag.disable();}
 }
 async close(){const n=this.native;this.native=null;if(n)await n.close();}
}
export class ClockPika extends PikaEngine {
 constructor({reserveMs=0}={}){super();this.reserveMs=reserveMs;this.activeTrace=null;this.p.stdout.prependListener('data',()=>{if(this.activeTrace)this.activeTrace.lastChunkAt=now()-this.activeTrace.start;});}
 send(line){if(this.activeTrace){const t=this.activeTrace;t.commands.push({at:now()-t.start,command:line.split(' ')[0]});if(line==='stop')t.stopSentAt=now()-t.start;}super.send(line);}
 async search(initialFen,moves,budget,expectedFen,{searchMoves=null}={}){
  const start=now(),soft=Math.max(1,budget-this.reserveMs),offset=this.lines.length,trace={start,nominalBudgetMs:budget,reserveMs:this.reserveMs,softBudgetMs:soft,commands:[]};this.activeTrace=trace;const lag=monitorEventLoopDelay({resolution:5});lag.enable();
  let stop;
  try{
   this.send('position fen '+initialFen+(moves.length?' moves '+moves.join(' '):''));
   const verify=this.wait(x=>x.startsWith('Fen: '),budget+1000);this.send('d');const actual=(await verify).slice(5).trim();trace.verificationEndAt=now()-start;
   if(actual.split(' ').slice(0,3).join(' ')!==expectedFen.split(' ').slice(0,3).join(' '))throw Error('Pika public board/stock mismatch');
   const nativeBudget=Math.max(1,soft-Math.ceil(now()-start)),done=this.wait(x=>x.startsWith('bestmove '),Math.max(1,budget+1000-(now()-start)));
   trace.goAt=now()-start;trace.nativeBudgetMs=nativeBudget;if(searchMoves!==null&&(!searchMoves.length||searchMoves.some(m=>!Number.isInteger(m.from)||!Number.isInteger(m.to))))throw Error('Invalid root whitelist');this.send('go movetime '+nativeBudget+(searchMoves===null?'':' searchmoves '+searchMoves.map(m=>coordinate(m.from)+coordinate(m.to)).join(' ')));trace.stopDueAt=soft+20;
   stop=setTimeout(()=>{trace.stopTimerAt=now()-start;trace.stopTimerLateMs=trace.stopTimerAt-trace.stopDueAt;this.send('stop');},Math.max(0,trace.stopDueAt-(now()-start)));
   const line=await done;trace.bestmoveResolvedAt=now()-start;const lines=this.lines.slice(offset),info=lines.filter(x=>/^info depth /.test(x)).at(-1),m=info?.match(/\btime (\d+)/);
   return{move:parseMove(line.split(' ')[1]),elapsedMs:now()-start,verificationMs:trace.verificationEndAt,nativeBudgetMs:nativeBudget,lines,deadlineStop:trace.stopSentAt!=null,fallbackUsed:false,clock:{...trace,start:undefined,engineReportedMs:m?Number(m[1]):null,eventLoopMaxMs:lag.max/1e6,postStopBestmoveMs:trace.stopSentAt!=null?trace.bestmoveResolvedAt-trace.stopSentAt:null}};
  }finally{clearTimeout(stop);lag.disable();this.activeTrace=null;}
 }
}
