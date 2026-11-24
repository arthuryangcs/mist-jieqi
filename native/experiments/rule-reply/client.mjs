import assert from 'node:assert/strict';import path from 'node:path';import {DefaultEngine} from '../default-all/client.mjs';import {Native} from './bridge.mjs';import {environment,cache} from './build.mjs';
const bounded=(p,ms)=>Promise.race([p,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('rule reply readiness/reap timeout')),ms);t.unref();})]);
export class TrialEngine extends DefaultEngine{
 constructor(options={}){super({binary:path.resolve(cache+'/trial'),...options});}
 async ready(){environment();if(!this.native)this.native=new Native({binary:this.binary});const n=this.native;try{await bounded(n.ready,10000);assert.equal(n.capabilities.protocol,2);assert(n.capabilities.ruleReplyGuard);}catch(e){n.stop();this.native=null;await bounded(n.reaped,2000);throw e;}}
}
