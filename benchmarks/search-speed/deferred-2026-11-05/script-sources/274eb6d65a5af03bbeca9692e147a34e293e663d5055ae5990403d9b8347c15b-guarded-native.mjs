import assert from 'node:assert/strict';
import {Native} from '../../native/experiments/search-speed/bridge.mjs';
async function idle(){const s=await(await fetch('http://127.0.0.1:8766/api/status',{signal:AbortSignal.timeout(3000)})).json();assert.equal(s.sourceSha256,'3fa98d62f3c1636b831680fcd5dcbf88f9339e966ed1b8e2f8a170b83afcbfb0');assert.equal(s.active,0,'user-service-busy: pause own diagnostics');}
export class GuardedNative extends Native{
 async request(...args){await idle();let checking=false,interrupted=false;const poll=setInterval(async()=>{if(checking)return;checking=true;try{await idle();}catch{interrupted=true;this.stop();}finally{checking=false;}},150);try{const r=await super.request(...args);assert(!interrupted);return r;}finally{clearInterval(poll);}}
}
