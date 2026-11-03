// Explicit optional experiment. No production or stable experimental default changes.
import {ExperimentalEngine} from './client.mjs';import {binary} from './build-c6.mjs';
export class C6Engine extends ExperimentalEngine{
 constructor(options={}){super({binary,...options});}
 async search(...args){const generation=this.generation;try{return await super.search(...args);}catch(error){if(generation!==this.generation)throw Error('experimental search cancelled');throw error;}}
 async ready(){await super.ready();const n=this.native;if(!n)return;if(!n.c6ModePatched){const request=n.request.bind(n);n.request=(f,o={})=>request(f,{...o,mode:o.mode==='STREAM'?'STREAM_LAZYLEGAL':o.mode==='SEARCH'?'SEARCH_LAZYLEGAL':o.mode});n.c6ModePatched=true;}}
}
