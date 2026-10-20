import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {performance} from 'node:perf_hooks';
import {binary as defaultBinary,root} from './build.mjs';
import {legalMoves,rootRules} from '../engine.js';
import {balancedSamples,seeded,visibleKey} from '../ai.js';

const types='KRNBCAP',side=s=>s==='r'?0:s==='b'?1:-1;
const piece=p=>p?[side(p.side),types.indexOf(p.type),types.indexOf(p.role),Number(p.hidden)]:[-1,-1,-1,0];
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function fixture(view,{seed=6101,samples=8}={}) {
 if(view.board.some(p=>p?.hidden&&'type'in p))throw Error('公开输入含真实暗子身份');
 if(view.captured.some(p=>p.hidden&&'type'in p))throw Error('公开输入含不可见暗俘身份');
 const worlds=balancedSamples(view,view.board.some(p=>p?.hidden)?samples:1,seeded(seed));
 const repetitions=[];
 for(const m of legalMoves(view))if(!view.board[m.from].hidden){repetitions.push({...m,...rootRules(view,m)});}
 return{view:structuredClone(view),worlds,seed,samples:worlds.length,repetitions,observationHash:digest(view),worldHashes:worlds.map(digest)};
}
// Match analyze()'s visible-information seed for the playable service.
export function observationSeed(view){let h=2166136261;for(const c of visibleKey(view))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function encode(f,{mode='SEARCH',depth=3,budget=60000,nodeLimit=Infinity}={}) {
 const parts=[mode,depth,budget,Number.isFinite(nodeLimit)?nodeLimit:0,side(f.view.turn),side(f.view.viewer),f.view.captured.length,f.worlds.length,f.repetitions.length];
 for(const p of f.view.board)parts.push(...piece(p));for(const p of f.view.captured)parts.push(...piece(p));for(const w of f.worlds)for(const p of w.board)parts.push(...piece(p));
 for(const r of f.repetitions)parts.push(r.from,r.to,r.count,r.loss?2:Number(r.draw));return parts.join(' ')+'\n';
}
let reference;
export async function loadReference() {
 if(reference)return reference;
 let source=fs.readFileSync(new URL('../ai.js',import.meta.url),'utf8');
 const patches=[['features={}}={})','features={},fixedWorlds}={})'],['worlds=balancedSamples(view,uncertain?samples:1,rng)','worlds=fixedWorlds?structuredClone(fixedWorlds):balancedSamples(view,uncertain?samples:1,rng)']];
 for(const [from,to]of patches){if(source.split(from).length!==2)throw Error('固定样本参考接口不匹配');source=source.replace(from,to);}
 source=source.replace("'./engine.js'",JSON.stringify(new URL('../engine.js',import.meta.url).href));
 reference=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).analyze;return reference;
}
export async function javascript(f,{depth=3,budget=60000,nodeLimit=Infinity}={}) {
 const analyze=await loadReference(),iterations=[],start=performance.now();
 const result=analyze(f.view,{seed:f.seed,samples:f.samples,fixedWorlds:f.worlds,maxDepth:depth,timeMs:budget,nodeLimit,onProgress:r=>iterations.push({depth:r.depth,nodes:r.nodes,allCandidates:structuredClone(r.allCandidates)})});
 return{...result,elapsedMs:performance.now()-start,iterations};
}
export class Native {
 constructor({binary=defaultBinary}={}) {
  this.pending=[];this.stderr='';this.closed=false;const start=performance.now();this.process=spawn(binary,[],{stdio:['pipe','pipe','pipe'],cwd:root});
  this.ready=new Promise((resolve,reject)=>{this.readyReject=reject;this.resolveReady=()=>{this.initializationMs=performance.now()-start;resolve();};});
  this.process.stderr.on('data',x=>this.stderr+=x);
  this.process.stdin.on('error',e=>{if(!this.closed)this.fail(e);});
  createInterface({input:this.process.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready){this.capabilities=r;this.resolveReady();}else if(r.progress){const task=this.pending[0];if(!task)throw Error('unexpected native progress');task.onProgress?.({...r.result,wallMs:performance.now()-task.start});}else{const task=this.pending.shift();if(!task)throw Error('unexpected native response');clearTimeout(task.timer);task.resolve({...r,wallMs:performance.now()-task.start});}}catch(e){this.fail(e);}});
  this.process.on('error',e=>this.fail(e));this.process.on('exit',(code,signal)=>{if(!this.closed)this.fail(Error(`native退出 ${code}/${signal}: ${this.stderr}`));});
 }
 fail(error){this.readyReject(error);for(const t of this.pending){clearTimeout(t.timer);t.reject(error);}this.pending=[];}
 async request(f,options={}) {
  await this.ready;if(this.pending.length)throw Error('每个原生进程只顺序处理一个请求');const start=performance.now(),data=encode(f,options);
  return new Promise((resolve,reject)=>{const task={resolve,reject,start,onProgress:options.onProgress,timer:setTimeout(()=>{this.process.kill();this.fail(Error('原生请求超时'));},(options.budget??60000)+10000)};this.pending.push(task);this.process.stdin.write(data);});
 }
 stop(){this.closed=true;this.fail(Error('native request cancelled'));this.process.kill();}
 async close(){this.closed=true;this.process.stdin.end();if(this.process.exitCode!==null)return;await new Promise(resolve=>{this.process.once('exit',resolve);setTimeout(()=>this.process.kill(),2000).unref();});}
}
export function compare(a,b,{tolerance=1e-7,requireNodes=true}={}) {
 if(a.depth!==b.depth)throw Error(`深度不同 JS=${a.depth}, C++=${b.depth}`);
 if(requireNodes&&a.nodes!==b.nodes)throw Error(`节点不同 JS=${a.nodes}, C++=${b.nodes}`);
 if(a.samples!==b.samples)throw Error('样本数不同');
 if(Math.abs(a.score-b.score)>tolerance||Boolean(a.terminal)!==Boolean(b.terminal))throw Error('总体评分或终局标记不同');
 if(JSON.stringify(a.move)!==JSON.stringify(b.move))throw Error(`推荐不同 ${JSON.stringify([a.move,b.move])}`);
 const rows=x=>(x.allCandidates||[]).slice().sort((m,n)=>m.from-n.from||m.to-n.to),x=rows(a),y=rows(b);if(x.length!==y.length)throw Error('根候选不全');
 let maxDifference=0;for(let i=0;i<x.length;i++){if(x[i].from!==y[i].from||x[i].to!==y[i].to)throw Error('候选不同');for(const key of['score','spread','heuristicWinRate']){const d=Math.abs(x[i][key]-y[i][key]);maxDifference=Math.max(maxDifference,d);if(d>tolerance)throw Error(`候选${x[i].from}->${x[i].to} ${key} 不同 ${x[i][key]} / ${y[i][key]}`);}for(const key of['sampleWins','sampleLosses','repetitionCount'])if(x[i][key]!==y[i][key])throw Error(`候选${key}不同`);if(Boolean(x[i].draw)!==Boolean(y[i].draw))throw Error('和棋标记不同');if(Boolean(x[i].repetitionLoss)!==Boolean(y[i].repetitionLoss))throw Error('重复判负标记不同');}
 return{nodesEqual:a.nodes===b.nodes,candidates:x.length,maxDifference};
}
