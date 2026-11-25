// Regression-only direct wire client: deliberately has no JS move correction.
import assert from'node:assert/strict';import {performance}from'node:perf_hooks';
import {Native as Base}from'../../bridge.mjs';import{guarded,encode}from'./bridge.mjs';
export class Raw extends Base{
 constructor(options){super(options);this.reaped=new Promise(resolve=>this.process.once('close',resolve));}
 async line(data,{budget=60000,onProgress}={}){await this.ready;assert.equal(this.pending.length,0);return new Promise((resolve,reject)=>{this.pending.push({resolve,reject,start:performance.now(),onProgress,timer:setTimeout(()=>{this.stop();reject(Error('bounded direct wire timeout'));},budget+5000)});this.process.stdin.write(data);});}
 async request(f,options={}){return this.line(encode(guarded(f),options),options);}
}
