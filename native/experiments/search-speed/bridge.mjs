// Protocol3 adds public repetition/clock context to the existing safe wire format.
import {performance} from 'node:perf_hooks';
import {Native as BaseNative,encode as encodeBase} from '../../bridge.mjs';
import {positionKey} from '../../../engine.js';
import {binary as experimentBinary} from './build.mjs';
export {fixture,observationSeed} from '../../bridge.mjs';

const types='KRNBCAP',side=x=>x==='r'?0:x==='b'?1:-1;
let rng=817331;const next=()=>rng=(Math.imul(rng,1664525)+1013904223)>>>0;
const z1=Array.from({length:90*112},next),z2=Array.from({length:90*112},next);
export function positionHash(position){
 const [turn,board]=typeof position==='string'?JSON.parse(position):position;
 if(!['r','b'].includes(turn)||board.length!==90)throw Error('invalid public position');
 let h1=0,h2=0;
 for(let i=0;i<90;i++){const p=board[i];if(!p)continue;const [s,t,hidden]=p,kind=types.indexOf(t);if(side(s)<0||kind<0)throw Error('invalid public piece');const code=i*112+side(s)*56+(hidden?7+kind*8:kind);h1^=z1[code];h2^=z2[code];}
 return[h1>>>0,h2>>>0,side(turn)];
}
export function context(view){
 const current=positionKey(view),board=JSON.parse(current)[1],count=b=>[b.filter(Boolean).length,b.filter(p=>p?.[2]).length],target=count(board);
 const positions=(view.positions??[]).filter(k=>{const n=count(JSON.parse(k)[1]);return n[0]===target[0]&&n[1]===target[1];});
 if(positions.at(-1)!==current)positions.push(current);
 const quiet=view.quiet??0,ply=view.ply??0;
 if(!Number.isInteger(quiet)||quiet<0||quiet>120||!Number.isInteger(ply)||ply<0||ply>400||positions.length>512)throw Error('game context out of range');
 return{quiet,ply,positions:positions.map(positionHash)};
}
export function encode(f,options={}){const c=context(f.view);return encodeBase(f,options).trim()+' '+[c.quiet,c.ply,c.positions.length,...c.positions.flat()].join(' ')+'\n';}
export class Native extends BaseNative{
 constructor({binary=experimentBinary}={}){super({binary});this.reaped=new Promise(resolve=>this.process.once('close',resolve));}
 async request(f,options={}){
  await this.ready;if(this.pending.length)throw Error('overlapping experimental search');
  const start=performance.now(),data=encode(f,options);
  return new Promise((resolve,reject)=>{const task={resolve,reject,start,onProgress:options.onProgress,onTelemetry:options.onTelemetry,timer:setTimeout(()=>{this.process.kill();this.fail(Error('experimental request timeout'));},(options.budget??60000)+10000)};this.pending.push(task);this.process.stdin.write(data);});
 }
}
