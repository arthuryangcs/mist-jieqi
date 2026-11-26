import{performance}from'node:perf_hooks';import{Native as Base}from'../../bridge.mjs';import{inspectCycle}from'./signals.mjs';
export{fixture,observationSeed}from'../../bridge.mjs';
export class Native extends Base{
 constructor({signalsEnabled=true,maxSignalMs=100,...options}={}){super(options);this.signalsEnabled=signalsEnabled;this.maxSignalMs=maxSignalMs;this.reaped=new Promise(resolve=>this.process.once('close',resolve));}
 async request(f,options={}){await this.ready;const started=performance.now(),cycleSignals=inspectCycle(f.view,{enabled:this.signalsEnabled,maxMs:this.maxSignalMs}),signalPreparationMs=performance.now()-started;this.currentDiagnostics={...cycleSignals,diagnosticOnly:true,orderingChanged:false,adjudicationChanged:false,signalPreparationMs};
  const decorate=r=>({...r,cycleSignals:this.currentDiagnostics,signalPreparationMs});
  return decorate(await super.request(f,{...options,budget:Math.max(0,(options.budget??60000)-signalPreparationMs),onProgress:r=>options.onProgress?.(decorate(r))}));
 }
}
