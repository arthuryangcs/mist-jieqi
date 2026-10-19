import {legalMoves} from './engine.js';

// Host-side deadline: a busy/GC-paused search worker cannot block this timer.
// Only a completed, legal root iteration can replace the precomputed fallback.
export function startTimedSearch({worker,id,view,timeMs,onProgress=()=>{},onComplete,onError=()=>{},clock=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}) {
  const started=clock(),moves=legalMoves(view),allowed=new Set(moves.map(m=>m.from*90+m.to));
  const fallback={move:moves[0]||null,candidates:[],score:moves.length?0:-99999,depth:0,samples:0,nodes:0,terminal:!moves.length};
  let finished=false,timer=null,latest=null,firstProgressMs=null,dispatchMs=0;const hostPreparationMs=clock()-started;
  const valid=r=>r&&(!moves.length?r.terminal:allowed.has(r.move?.from*90+r.move?.to));
  function finish(result,deadlineStop=false) {
    if(finished)return;finished=true;clearTimer(timer);
    const accepted=valid(result)?result:(latest||fallback);
    onComplete({...accepted,engine:accepted.engine??worker.engine??'javascript',engineVerified:accepted.engineVerified??false,searchElapsedMs:accepted.elapsedMs??0,hostPreparationMs,dispatchMs,firstProgressMs,elapsedMs:Math.round(clock()-started),deadlineStop,fallbackUsed:!accepted.depth&&!accepted.terminal});
  }
  worker.onmessage=({data})=>{
    if(finished||data.id!==id)return;
    if(data.error){finished=true;clearTimer(timer);onError(Error(data.error));return;}
    if(data.progress){if(valid(data.result)&&data.result.depth>0){latest=data.result;firstProgressMs??=clock()-started;onProgress(latest);}return;}
    finish(data.result);
  };
  worker.onerror=error=>{if(finished)return;finished=true;clearTimer(timer);onError(error);};
  timer=setTimer(()=>{if(finished)return;worker.terminate();finish(latest||fallback,true);},Math.max(0,timeMs-(clock()-started)));
  const dispatched=clock();worker.postMessage({id,view,timeMs});dispatchMs=clock()-dispatched;
  return {cancel(){if(finished)return;finished=true;clearTimer(timer);}};
}
