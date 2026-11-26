import{analyze as base}from'../../../ai.js';import{inspectCycle}from'./signals.mjs';
export function analyze(view,options={}){
 const started=performance.now(),cycleSignals=inspectCycle(view,{enabled:options.signalsEnabled!==false,maxMs:options.maxSignalMs??100}),signalPreparationMs=performance.now()-started;
 const diagnostic={...cycleSignals,diagnosticOnly:true,orderingChanged:false,adjudicationChanged:false,signalPreparationMs},decorate=r=>({...r,elapsedMs:(r.elapsedMs??0)+signalPreparationMs,cycleSignals:diagnostic,signalPreparationMs});
 return decorate(base(view,{...options,timeMs:Math.max(0,(options.timeMs??1800)-signalPreparationMs),onProgress:r=>options.onProgress?.(decorate(r))}));
}
