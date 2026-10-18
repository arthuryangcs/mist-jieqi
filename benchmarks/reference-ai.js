import {TYPES,shuffle,legalMoves,other,inCheck} from './reference-engine.js';
export const values={K:100000,R:900,N:420,C:450,B:210,A:210,P:110};
export function remaining(view,side){let pool=[...TYPES];for(let p of [...view.board,...view.captured])if(p&&p.side===side&&!p.hidden&&p.type!=='K'){let i=pool.indexOf(p.type);if(i>=0)pool.splice(i,1);}return pool;}
export function sample(view,rng=Math.random){let s=structuredClone(view);for(let side of ['r','b']){let pool=shuffle(remaining(view,side),rng);for(let p of s.board)if(p?.side===side&&p.hidden){if(!pool.length)throw Error('未知棋子池不足');p.type=pool.pop();}}return s;}
export function evaluate(s,side){let val=0;s.board.forEach((p,i)=>{if(p){let x=i%9,y=Math.floor(i/9),progress=p.side==='r'?9-y:y;let bonus=p.hidden?0:p.type==='P'?progress*12+(progress>=5?35:0):p.type==='N'||p.type==='C'?18-Math.abs(x-4)*4:p.type==='R'?progress*2:0;val+=(p.side===side?1:-1)*((p.hidden?330:values[p.type])+bonus);}});return val;}
function push(s,m){let p=s.board[m.from],q=s.board[m.to],hidden=p.hidden;s.board[m.to]={...p,hidden:false};s.board[m.from]=null;s.turn=other(s.turn);return [p,q,hidden];}
function pop(s,m,old){s.turn=other(s.turn);s.board[m.from]=old[0];s.board[m.to]=old[1];}
function priority(s,m){let p=s.board[m.from],q=s.board[m.to];return (q?10*(q.hidden?330:values[q.type])-(p.hidden?330:values[p.type]):0)+(p.hidden?35:0);}
const TIMEOUT=Symbol('timeout');
export function analyze(view,{timeMs=1800,rng=Math.random,maxDepth=7,samples=4,onProgress=()=>{}}={}){
const start=performance.now(),deadline=start+timeMs;let nodes=0;const root=legalMoves(view);if(!root.length)return {move:null,candidates:[],score:-99999,depth:0,samples:0,nodes:0,elapsedMs:0,terminal:true};
const uncertain=view.board.some(p=>p?.hidden);let worlds=Array.from({length:uncertain?samples:1},()=>sample(view,rng));const tables=new WeakMap(worlds.map(s=>[s,new Map()]));
function tick(){nodes++;if((nodes&127)===0&&performance.now()>deadline)throw TIMEOUT;}
function search(s,depth,alpha,beta,ply,qleft=3){tick();let table=tables.get(s),key=null,entry=null,originalAlpha=alpha;
if(depth>0){key=s.turn+s.board.map(p=>p?(p.side==='r'?'r':'b')+(p.hidden?p.role+p.type:p.type):'.').join('');entry=table.get(key);if(entry&&entry.depth>=depth){let value=entry.score;if(entry.flag==='exact')return value;if(entry.flag==='lower')alpha=Math.max(alpha,value);else beta=Math.min(beta,value);if(alpha>=beta)return value;}}
let check=inCheck(s.board,s.turn);let moves=legalMoves(s);if(!moves.length)return -99000+ply;if(depth<=0&&!check){let stand=evaluate(s,s.turn);if(stand>=beta)return stand;alpha=Math.max(alpha,stand);if(qleft<=0)return alpha;moves=moves.filter(m=>s.board[m.to]);if(!moves.length)return alpha;}
if(depth<=-3)return evaluate(s,s.turn);moves.sort((a,b)=>((entry?.best?.from===b.from&&entry?.best?.to===b.to)?1000000:priority(s,b))-((entry?.best?.from===a.from&&entry?.best?.to===a.to)?1000000:priority(s,a)));let bestMove=null;for(let m of moves){let old=push(s,m),v;try{v=-search(s,depth-1,-beta,-alpha,ply+1,depth<=0?qleft-1:qleft);}finally{pop(s,m,old);}if(v>=beta){if(key&&table.size<60000)table.set(key,{depth,score:v,flag:'lower',best:m});return v;}if(v>alpha){alpha=v;bestMove=m;}}if(key&&table.size<60000)table.set(key,{depth,score:alpha,flag:alpha<=originalAlpha?'upper':'exact',best:bestMove});return alpha;}
// Complete equal-depth rounds over every root action and every sampled world.
let result={move:root[0],candidates:[],score:0,depth:0,samples:worlds.length,nodes:0,elapsedMs:0,uncertain};
for(let depth=1;depth<=maxDepth;depth++){
let rows=[];try{for(let m of root){let scores=[];for(let s of worlds){let old=push(s,m),v;try{v=-search(s,depth-1,-Infinity,Infinity,1);}finally{pop(s,m,old);}scores.push(v);}let mean=scores.reduce((a,b)=>a+b,0)/scores.length;let deviation=Math.sqrt(scores.reduce((a,v)=>a+(v-mean)**2,0)/scores.length);rows.push({...m,score:mean,spread:deviation});}}catch(e){if(e!==TIMEOUT)throw e;break;}
rows.sort((a,b)=>b.score-a.score);result={...result,move:{from:rows[0].from,to:rows[0].to},score:rows[0].score,candidates:rows.slice(0,5),depth,nodes,elapsedMs:Math.round(performance.now()-start)};onProgress(result);if(Math.abs(result.score)>98000||performance.now()>deadline)break;
// Strong actions first in the next round, preserving all candidates.
root.sort((a,b)=>rows.findIndex(x=>x.from===a.from&&x.to===a.to)-rows.findIndex(x=>x.from===b.from&&x.to===b.to));}
return {...result,nodes,elapsedMs:Math.round(performance.now()-start)};
}
export const choose=(view,rng=Math.random)=>analyze(view,{rng}).move;
