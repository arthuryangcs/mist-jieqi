// Match-only control adapter. Uses the unchanged protocol-2 stable binary.
import assert from 'node:assert/strict';
import {Native} from '../../bridge.mjs';
import {ExperimentalEngine} from './client.mjs';
export class StableEngine extends ExperimentalEngine {
 async ready(){
  if(!this.native){const n=new Native({binary:this.binary});n.reaped=new Promise(resolve=>n.process.once('close',resolve));this.native=n;}
  const n=this.native;let timer;
  try{await Promise.race([n.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('stable readiness timeout')),10000);})]);assert.equal(n.capabilities.protocol,2);}
  catch(error){n.stop();if(this.native===n)this.native=null;await n.reaped;throw error;}
  finally{clearTimeout(timer);}
 }
}
