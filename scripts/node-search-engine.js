import {Worker} from 'node:worker_threads';import {startTimedSearch} from '../deadline-search.js';
export class NodeSearchEngine {
  constructor({moduleUrl=new URL('../ai.js',import.meta.url).href,features}={}){this.moduleUrl=moduleUrl;this.features=features;this.worker=null;this.id=0;this.initializations=[];}
  async ready(){
    if(this.worker)return;const started=performance.now(),raw=new Worker(new URL('./node-search-worker.js',import.meta.url),{workerData:{moduleUrl:this.moduleUrl}});
    let adapter={postMessage:data=>raw.postMessage({...data,...(this.features?{features:this.features}:{})}),terminate:()=>{if(!adapter.terminated){adapter.terminated=true;adapter.termination=raw.terminate();}return adapter.termination;},terminated:false,onmessage:null,onerror:null};
    await new Promise((resolve,reject)=>{let timer=setTimeout(()=>{adapter.terminate();reject(Error('JS worker initialization timeout'));},10000);raw.on('message',data=>{if(data.ready){clearTimeout(timer);resolve();}else adapter.onmessage?.({data});});raw.on('error',error=>{clearTimeout(timer);reject(error);adapter.onerror?.(error);});});
    this.worker=adapter;this.initializations.push(Math.round(performance.now()-started));
  }
  async search(view,budget){await this.ready();let worker=this.worker;return new Promise((resolve,reject)=>{startTimedSearch({worker,id:++this.id,view,timeMs:budget,onComplete:r=>{if(r.deadlineStop)this.worker=null;resolve({...r,overBudget:r.elapsedMs>budget+60});},onError:reject});});}
  async close(){if(this.worker)await this.worker.terminate();this.worker=null;}
}
