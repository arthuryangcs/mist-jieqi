import {TYPES,shuffle,legalMoves,other,inCheck,rootRules} from './engine.js';
export const values={K:100000,R:900,N:420,C:450,B:210,A:210,P:110};
const MATE=99000,TIMEOUT=Symbol('timeout');
export function remaining(view,side){let pool=[...TYPES];for(let p of [...view.board,...view.captured])if(p&&p.side===side&&!p.hidden&&p.type!=='K'){let i=pool.indexOf(p.type);if(i>=0)pool.splice(i,1);}return pool;}
export function knowledge(view,side){let live=view.board.filter(p=>p?.side===side),dead=view.captured.filter(p=>p.side===side),pool=remaining(view,side),counts=Object.fromEntries(['R','N','B','A','C','P'].map(t=>[t,pool.filter(x=>x===t).length])),aliveDark=live.filter(p=>p.hidden).length,deadDark=dead.filter(p=>p.hidden).length,knownDead=dead.filter(p=>!p.hidden&&p.type!=='K'),knownDark=knownDead.filter(p=>p.wasHidden).length,revealed=live.filter(p=>!p.hidden&&p.type!=='K').length+knownDead.length-knownDark;return {revealed,knownDark,aliveDark,deadDark,knownDead:knownDead.map(p=>p.type),counts,poolSize:pool.length,expectedAlive:Object.fromEntries(Object.entries(counts).map(([t,n])=>[t,pool.length?n*aliveDark/pool.length:0])),consistent:revealed+knownDark+pool.length===15&&pool.length===aliveDark+deadDark};}
export function visibleKey(view){return JSON.stringify([view.viewer??null,view.turn,view.board.map(p=>p?[p.side,p.hidden?p.role:p.type,p.hidden]:null),view.captured.map(p=>p.hidden?[p.side,'?']:[p.side,p.type])]);}
export function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function hashText(text){let h=2166136261;for(let c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function sample(view,rng=Math.random){let s=structuredClone(view);for(let side of ['r','b']){let pool=shuffle(remaining(view,side),rng);for(let p of s.board)if(p?.side===side&&p.hidden){if(!pool.length)throw Error('未知棋子池不足');p.type=pool.pop();}}return s;}
// Rotating a shuffled pool balances each hidden square's marginal identities.
export function balancedSamples(view,count,rng){let worlds=Array.from({length:count},()=>structuredClone({board:view.board,turn:view.turn,captured:view.captured}));for(let side of ['r','b']){let pool=shuffle(remaining(view,side),rng),slots=shuffle(view.board.map((p,i)=>p?.side===side&&p.hidden?i:-1).filter(i=>i>=0),rng);if(slots.length>pool.length)throw Error('未知棋子池不足');for(let n=0;n<count;n++){if(n&&n%pool.length===0)pool=shuffle(pool,rng);for(let j=0;j<slots.length;j++)worlds[n].board[slots[j]].type=pool[(n+j)%pool.length];}}return worlds;}
function means(s){return ['r','b'].map(side=>{let pool=remaining(s,side);return [pool.length,pool.reduce((a,t)=>a+values[t],0)];});}
const jumps=Array.from({length:90},(_,i)=>{const x=i%9,y=(i/9)|0,make=(steps)=>steps.flatMap(([dx,dy])=>{let u=x+dx,v=y+dy;if(u<0||u>8||v<0||v>9)return [];return [[v*9+u,Math.abs(dx)+Math.abs(dy)===3?(y+(Math.abs(dy)===2?Math.sign(dy):0))*9+x+(Math.abs(dx)===2?Math.sign(dx):0):(y+dy/2)*9+x+dx/2]];});return {N:make([[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]),B:make([[2,2],[2,-2],[-2,2],[-2,-2]]),A:make([[1,1],[1,-1],[-1,1],[-1,-1]])};});
const rayDirections=[[1,0],[-1,0],[0,1],[0,-1]];
function mobility(board,p,i,fullSliding=false){
 if(p.type==='P'){const x=i%9,y=(i/9)|0,forward=p.side==='r'?-1:1;let n=0;const v=y+forward;if(v>=0&&v<10&&board[v*9+x]?.side!==p.side)n++;if(p.side==='r'?y<=4:y>=5)for(const u of [x-1,x+1])if(u>=0&&u<9&&board[y*9+u]?.side!==p.side)n++;return n;}
 if(p.type==='N'||p.type==='B'||p.type==='A'){let n=0;for(const [to,block] of jumps[i][p.type]){const u=to%9,v=(to/9)|0,allowed=!p.hidden||(p.type==='A'?u>=3&&u<=5&&(p.side==='r'?v>=7:v<=2):p.type!=='B'||(p.side==='r'?v>=5:v<=4));if(allowed&&(p.type==='A'||!board[block])&&board[to]?.side!==p.side)n++;}return n;}
 if(p.type!=='R'&&p.type!=='C')return 0;
 let n=0,x=i%9,y=(i/9)|0;
 if(!fullSliding){for(const [dx,dy] of rayDirections){const u=x+dx,v=y+dy;if(u<0||u>8||v<0||v>9)continue;const q=board[v*9+u];if(p.type==='R'?q?.side!==p.side:!q)n++;}return n;}
 for(const [dx,dy] of rayDirections){let screen=false;for(let u=x+dx,v=y+dy;u>=0&&u<9&&v>=0&&v<10;u+=dx,v+=dy){const q=board[v*9+u];if(p.type==='R'){if(q?.side!==p.side)n++;if(q)break;}else if(!screen){if(q)screen=true;else n++;}else if(q){if(q.side!==p.side)n+=2;break;}}}
 return n;
}
// A move-ordering estimate only: average over the observer's remaining identities.
// It values options gained at the destination minus the public role's options used
// up by revealing. No original-square, pawn-role, opening or first-move preference.
export function revealOrderingValue(view,m){
 const p=view.board[m.from];if(!p?.hidden)return 0;
 const pool=remaining(view,p.side);if(!pool.length)return 0;
 const before=mobility(view.board,{...p,type:p.role},m.from,true),board=[...view.board];
 board[m.from]=null;let after=0;
 for(const type of pool){const revealed={side:p.side,type,hidden:false};board[m.to]=revealed;after+=mobility(board,revealed,m.to,true);}
 return 3*(after/pool.length-before);
}
function simpleEvaluate(s,side,pools){
 const config=s._config||{},safety=config.safety!==false,leapers=config.leaperActivity===true;let val=0,phase=0,kings=s._kings;
 if(safety){let count=s._population;if(count===undefined){count=0;kings={};s.board.forEach((p,i)=>{if(p){if(!p.hidden&&p.type==='K')kings[p.side]=i;else count++;}});}phase=Math.min(1,count/24);}
 for(let i=0;i<90;i++){
  const p=s.board[i];if(!p)continue;const x=i%9,y=(i/9)|0,progress=p.side==='r'?9-y:y,pool=pools[p.side==='r'?0:1];
  let bonus=p.hidden?0:p.type==='P'?progress*12+(progress>=5?35:0):p.type==='N'||p.type==='C'?18-Math.abs(x-4)*4:p.type==='R'?progress*2:0;
  if(!p.hidden){
   if(safety&&p.type==='K')bonus-=Math.abs(x-4)*6+progress*phase*8;
   if(safety&&(p.type==='A'||p.type==='B')){const king=kings[p.side];if(king!==undefined&&Math.abs(x-king%9)+Math.abs(y-((king/9)|0))<=2)bonus+=phase*8;}
   if(leapers&&p.type==='N')bonus+=(mobility(s.board,p,i)-4)*3;
  }
  // The same mobility value applies to every non-king: a dark piece retains its
  // public role's one-move options; after revealing, its actual movement replaces them.
  if(config.mobility&&(p.hidden||p.type!=='K'))bonus+=Math.min(14,mobility(s.board,p.hidden?{...p,type:p.role}:p,i,true))*3;
  val+=(p.side===side?1:-1)*((p.hidden?(pool[0]?pool[1]/pool[0]:0):values[p.type])+bonus);
 }
 return val;
}
export function evaluate(s,side){
 const pools=s._pools||means(s),b=s.board;if(s._config?.activity!==true)return simpleEvaluate(s,side,pools);let val=0,count=s._population,kings=s._kings;
 if(count===undefined){count=0;kings={};for(let i=0;i<90;i++){const p=b[i];if(p){if(!p.hidden&&p.type==='K')kings[p.side]=i;else count++;}}}
 const phase=Math.min(1,count/24);
 for(let i=0;i<90;i++){
  const p=b[i];if(!p)continue;const x=i%9,y=(i/9)|0,progress=p.side==='r'?9-y:y,pool=pools[p.side==='r'?0:1];let material=p.hidden?(pool[0]?pool[1]/pool[0]:0):values[p.type],bonus=0;
  if(!p.hidden){const central=4-Math.abs(x-4),m=mobility(b,p,i,s._config?.slidingMobility===true);
   if(p.type==='P'){bonus=progress*10+(progress>=5?25+central*4:0)-(progress===9?35:0);const enemy=kings[other(p.side)];if(enemy!==undefined&&Math.abs(x-enemy%9)+Math.abs(y-((enemy/9)|0))<=2)bonus+=18;}
   else if(p.type==='N')bonus=central*4+m*5+(1-phase)*16;
   else if(p.type==='R')bonus=Math.min(m,18)*2+progress*2;
   else if(p.type==='C')bonus=Math.min(m,16)*1.5+phase*20-12;
   else if(p.type==='A'||p.type==='B'){bonus=m*3+central*2;const king=kings[p.side];if(king!==undefined&&Math.abs(x-king%9)+Math.abs(y-((king/9)|0))<=2)bonus+=phase*10;}
   else if(p.type==='K')bonus=-Math.abs(x-4)*8-progress*phase*10;
  }
  val+=(p.side===side?1:-1)*(material+bonus);
 }
 return val;
}
const zr=seeded(817331),Z1=Uint32Array.from({length:90*112},()=>zr()*4294967296),Z2=Uint32Array.from({length:90*112},()=>zr()*4294967296);
const types='KRNBCAP';
function code(p,i){return i*112+(p.side==='r'?0:56)+(p.hidden?7+types.indexOf(p.role)*7+types.indexOf(p.type):types.indexOf(p.type));}
const searchKey=s=>s._h1+','+s._h2+','+s.turn+','+s._pools[0][0]+','+s._pools[0][1]+','+s._pools[1][0]+','+s._pools[1][1];
function xor(s,p,i){if(p){let c=code(p,i);s._h1^=Z1[c];s._h2^=Z2[c];}}
function push(s,m){let p=s.board[m.from],q=s.board[m.to],old=[p,q,s._h1,s._h2];if(!p.hidden&&p.type==='K')s._kings[p.side]=m.to;if(q){if(!q.hidden&&q.type==='K')delete s._kings[q.side];else s._population--;}xor(s,p,m.from);xor(s,q,m.to);s.board[m.to]={...p,hidden:false};s.board[m.from]=null;xor(s,s.board[m.to],m.to);if(p.hidden){let pool=s._pools[p.side==='r'?0:1];pool[0]--;pool[1]-=values[p.type];}if(q?.hidden&&p.side===s._viewer){let pool=s._pools[q.side==='r'?0:1];pool[0]--;pool[1]-=values[q.type];}s.turn=other(s.turn);return old;}
function pop(s,m,old){let p=old[0],q=old[1];if(!p.hidden&&p.type==='K')s._kings[p.side]=m.from;if(q){if(!q.hidden&&q.type==='K')s._kings[q.side]=m.to;else s._population++;}if(q?.hidden&&p.side===s._viewer){let pool=s._pools[q.side==='r'?0:1];pool[0]++;pool[1]+=values[q.type];}if(p.hidden){let pool=s._pools[p.side==='r'?0:1];pool[0]++;pool[1]+=values[p.type];}s.turn=other(s.turn);s.board[m.from]=p;s.board[m.to]=old[1];s._h1=old[2];s._h2=old[3];}
function orderingValue(s,p){const pool=s._pools[p.side==='r'?0:1];return p.hidden?(s._config?.inventoryOrdering===false?330:pool[0]?pool[1]/pool[0]:0):values[p.type];}
function priority(s,m){const p=s.board[m.from],q=s.board[m.to];return (q?10*orderingValue(s,q)-orderingValue(s,p):0)+(p.hidden?35:0);}
const probability=v=>v>98000?1:v< -98000?0:1/(1+Math.exp(-v/600));
// Terminal outcomes are probabilities, not 99,000 points of imaginary material.
export function summarizeScores(scores,uncertain){let winRate=scores.reduce((a,v)=>a+probability(v),0)/scores.length;let finite=scores.map(v=>Math.max(-3600,Math.min(3600,v))),mean=finite.reduce((a,b)=>a+b,0)/finite.length;return {score:uncertain?600*Math.log(Math.max(.0025,winRate)/Math.max(.0025,1-winRate)):scores[0],spread:Math.sqrt(finite.reduce((a,v)=>a+(v-mean)**2,0)/finite.length),heuristicWinRate:winRate*100,sampleWins:scores.filter(v=>v>98000).length,sampleLosses:scores.filter(v=>v< -98000).length};}
export function analyze(view,{timeMs=1800,rng,seed,maxDepth=8,samples=8,nodeLimit=Infinity,onProgress=()=>{},features={}}={}){
const config={captureKnowledge:true,inventoryOrdering:true,activity:false,safety:true,leaperActivity:false,slidingMobility:false,mobility:false,revealOrdering:true,checkExtensions:true,killers:true,...features};
const start=performance.now(),deadline=start+Math.max(0,timeMs-Math.min(35,timeMs*.10));let nodes=0;const root=legalMoves(view);if(!root.length)return {move:null,candidates:[],score:-99999,heuristicWinRate:0,depth:0,samples:0,nodes:0,elapsedMs:0,terminal:true};
const rootContext={...view,_pools:means(view),_config:config},revealOrder=new Map(config.revealOrdering?root.map(m=>[m.from*90+m.to,revealOrderingValue(view,m)]):[]);
if(config.inventoryOrdering||config.revealOrdering){const rank=m=>(config.inventoryOrdering?priority(rootContext,m):0)+(revealOrder.get(m.from*90+m.to)||0);root.sort((a,b)=>rank(b)-rank(a));}
const uncertain=view.board.some(p=>p?.hidden);rng??=seeded(seed??hashText(visibleKey(view)));let worlds=balancedSamples(view,uncertain?samples:1,rng),tables=new WeakMap(),history=new Uint32Array(16200),killers=[];
for(let s of worlds){s._h1=0;s._h2=0;s._config=config;s._viewer=config.captureKnowledge?(view.viewer??null):null;s._pools=means(s);s._population=0;s._kings={};s.board.forEach((p,i)=>{xor(s,p,i);if(p){if(!p.hidden&&p.type==='K')s._kings[p.side]=i;else s._population++;}});s._path=new Set([searchKey(s)]);s._cycles=0;tables.set(s,new Map());}
function tick(){nodes++;if(nodes>nodeLimit||((nodes&7)===0&&performance.now()>deadline))throw TIMEOUT;}
function search(s,depth,alpha,beta,ply,qleft=3,extensions=2){tick();let pathKey=searchKey(s);if(s._path.has(pathKey)){s._cycles++;return 0;}s._path.add(pathKey);try{return searchNode(s,depth,alpha,beta,ply,qleft,extensions);}finally{s._path.delete(pathKey);}}
function searchNode(s,depth,alpha,beta,ply,qleft,extensions){let check=inCheck(s.board,s.turn);if(config.checkExtensions&&check&&depth>0&&extensions>0){depth++;extensions--;}let cycleStart=s._cycles,table=tables.get(s),key=null,entry=null,originalAlpha=alpha;
if(depth>0){key=searchKey(s)+','+extensions;entry=table.get(key);if(entry&&entry.depth>=depth){let value=entry.score;if(value>98000)value-=ply;else if(value< -98000)value+=ply;if(entry.flag==='exact')return value;if(entry.flag==='lower')alpha=Math.max(alpha,value);else beta=Math.min(beta,value);if(alpha>=beta)return value;}}
let quiet=depth<=0&&!check,moves=legalMoves(s,s.turn,{capturesOnly:quiet});
if(!moves.length&&(!quiet||!legalMoves(s,s.turn,{stopAfterOne:true}).length))return -MATE+ply;
if(quiet){let stand=evaluate(s,s.turn);if(stand>=beta)return stand;alpha=Math.max(alpha,stand);if(qleft<=0||!moves.length)return alpha;}
if(depth<=-6)return evaluate(s,s.turn)-(check?180:0);
let hbase=s.turn==='r'?0:8100;const order=m=>(entry?.best?.from===m.from&&entry?.best?.to===m.to?10000000:priority(s,m)+(s.board[m.to]?0:history[hbase+m.from*90+m.to]+(config.killers&&killers[ply]?.some(k=>k.from===m.from&&k.to===m.to)?3000:0)));moves.sort((a,b)=>order(b)-order(a));let bestMove=null,first=true;
function save(score,flag,best){if(key&&cycleStart===s._cycles&&(table.size<90000||table.has(key)))table.set(key,{depth,score:score>98000?score+ply:score< -98000?score-ply:score,flag,best});}
for(let m of moves){let capture=!!s.board[m.to],old=push(s,m),v;try{if(first||!Number.isFinite(alpha))v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions);else{v=-search(s,depth-1,-alpha-1,-alpha,ply+1,quiet?qleft-1:qleft,extensions);if(v>alpha&&v<beta)v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions);}}finally{pop(s,m,old);}first=false;if(v>=beta){if(!capture&&depth>0){let h=hbase+m.from*90+m.to;history[h]=Math.min(2000,history[h]+depth*depth);if(config.killers){let ks=killers[ply]??=[];if(!ks.some(k=>k.from===m.from&&k.to===m.to))ks.unshift(m);ks.length=Math.min(ks.length,2);}}save(v,'lower',m);return v;}if(v>alpha){alpha=v;bestMove=m;}}
save(alpha,alpha<=originalAlpha?'upper':'exact',bestMove);return alpha;}
const repeats=new Map();for(let m of root){if(!view.board[m.from].hidden){repeats.set(m.from*90+m.to,rootRules(view,m));}}
let result={move:root[0],candidates:[],score:0,depth:0,samples:worlds.length,nodes:0,elapsedMs:0,uncertain,seed:seed??hashText(visibleKey(view)),scoreKind:uncertain?'expected-utility':'material',sampleWins:0,sampleLosses:0};
for(let depth=1;depth<=maxDepth;depth++){
let rows=[];try{for(let m of root){let scores=[],repetition=repeats.get(m.from*90+m.to);if(repetition?.draw||repetition?.loss){rows.push({...m,...summarizeScores([repetition.loss?-MATE+1:0],uncertain),...(repetition.loss?{repetitionLoss:true}:{draw:true}),repetitionCount:repetition.count});continue;}for(let s of worlds){if(performance.now()>deadline)throw TIMEOUT;let old=push(s,m),v;try{v=-search(s,depth-1,-Infinity,Infinity,1);}finally{pop(s,m,old);}scores.push(v);}rows.push({...m,...summarizeScores(scores,uncertain),repetitionCount:repetition?.count||0});}}catch(e){if(e!==TIMEOUT)throw e;break;}
rows.sort((a,b)=>b.score-a.score);let top=rows[0];result={...result,...top,move:{from:top.from,to:top.to},candidates:rows.slice(0,5),allCandidates:rows,depth,nodes,elapsedMs:Math.round(performance.now()-start)};onProgress(result);if((!uncertain&&Math.abs(result.score)>98000)||performance.now()>deadline)break;
let ranks=new Map(rows.map((m,i)=>[m.from*90+m.to,i]));root.sort((a,b)=>ranks.get(a.from*90+a.to)-ranks.get(b.from*90+b.to));}
return {...result,nodes,elapsedMs:Math.round(performance.now()-start)};
}
export const choose=(view,rng)=>analyze(view,{rng}).move;
