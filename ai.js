import {TYPES,shuffle,legalMoves,other,inCheck,move,positionKey} from './engine.js';
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
export function evaluate(s,side){let pools=s._pools||means(s),val=0;for(let i=0;i<90;i++){let p=s.board[i];if(!p)continue;let x=i%9,y=(i/9)|0,progress=p.side==='r'?9-y:y,pool=pools[p.side==='r'?0:1];let bonus=p.hidden?0:p.type==='P'?progress*12+(progress>=5?35:0):p.type==='N'||p.type==='C'?18-Math.abs(x-4)*4:p.type==='R'?progress*2:0;val+=(p.side===side?1:-1)*((p.hidden?(pool[0]?pool[1]/pool[0]:0):values[p.type])+bonus);}return val;}
const zr=seeded(817331),Z1=Uint32Array.from({length:90*112},()=>zr()*4294967296),Z2=Uint32Array.from({length:90*112},()=>zr()*4294967296);
const types='KRNBCAP';
function code(p,i){return i*112+(p.side==='r'?0:56)+(p.hidden?7+types.indexOf(p.role)*7+types.indexOf(p.type):types.indexOf(p.type));}
const searchKey=s=>s._h1+','+s._h2+','+s.turn+','+s._pools[0][0]+','+s._pools[0][1]+','+s._pools[1][0]+','+s._pools[1][1];
function xor(s,p,i){if(p){let c=code(p,i);s._h1^=Z1[c];s._h2^=Z2[c];}}
function push(s,m){let p=s.board[m.from],q=s.board[m.to],old=[p,q,s._h1,s._h2];xor(s,p,m.from);xor(s,q,m.to);s.board[m.to]={...p,hidden:false};s.board[m.from]=null;xor(s,s.board[m.to],m.to);if(p.hidden){let pool=s._pools[p.side==='r'?0:1];pool[0]--;pool[1]-=values[p.type];}s.turn=other(s.turn);return old;}
function pop(s,m,old){let p=old[0];if(p.hidden){let pool=s._pools[p.side==='r'?0:1];pool[0]++;pool[1]+=values[p.type];}s.turn=other(s.turn);s.board[m.from]=p;s.board[m.to]=old[1];s._h1=old[2];s._h2=old[3];}
function priority(s,m){let p=s.board[m.from],q=s.board[m.to];return (q?10*(q.hidden?330:values[q.type])-(p.hidden?330:values[p.type]):0)+(p.hidden?35:0);}
const probability=v=>v>98000?1:v< -98000?0:1/(1+Math.exp(-v/600));
// Terminal outcomes are probabilities, not 99,000 points of imaginary material.
export function summarizeScores(scores,uncertain){let winRate=scores.reduce((a,v)=>a+probability(v),0)/scores.length;let finite=scores.map(v=>Math.max(-3600,Math.min(3600,v))),mean=finite.reduce((a,b)=>a+b,0)/finite.length;return {score:uncertain?600*Math.log(Math.max(.0025,winRate)/Math.max(.0025,1-winRate)):scores[0],spread:Math.sqrt(finite.reduce((a,v)=>a+(v-mean)**2,0)/finite.length),heuristicWinRate:winRate*100,sampleWins:scores.filter(v=>v>98000).length,sampleLosses:scores.filter(v=>v< -98000).length};}
export function analyze(view,{timeMs=1800,rng,seed,maxDepth=8,samples=8,nodeLimit=Infinity,onProgress=()=>{}}={}){
const start=performance.now(),deadline=start+Math.max(0,timeMs-Math.min(12,timeMs*.06));let nodes=0;const root=legalMoves(view);if(!root.length)return {move:null,candidates:[],score:-99999,heuristicWinRate:0,depth:0,samples:0,nodes:0,elapsedMs:0,terminal:true};
const uncertain=view.board.some(p=>p?.hidden);rng??=seeded(seed??hashText(visibleKey(view)));let worlds=balancedSamples(view,uncertain?samples:1,rng),tables=new WeakMap(),history=new Uint32Array(16200);
for(let s of worlds){s._h1=0;s._h2=0;s._pools=means(s);s.board.forEach((p,i)=>xor(s,p,i));s._path=new Set([searchKey(s)]);s._cycles=0;tables.set(s,new Map());}
function tick(){nodes++;if(nodes>nodeLimit||((nodes&15)===0&&performance.now()>deadline))throw TIMEOUT;}
function search(s,depth,alpha,beta,ply,qleft=3){tick();let pathKey=searchKey(s);if(s._path.has(pathKey)){s._cycles++;return 0;}s._path.add(pathKey);try{return searchNode(s,depth,alpha,beta,ply,qleft);}finally{s._path.delete(pathKey);}}
function searchNode(s,depth,alpha,beta,ply,qleft){let cycleStart=s._cycles,table=tables.get(s),key=null,entry=null,originalAlpha=alpha;
if(depth>0){key=searchKey(s);entry=table.get(key);if(entry&&entry.depth>=depth){let value=entry.score;if(value>98000)value-=ply;else if(value< -98000)value+=ply;if(entry.flag==='exact')return value;if(entry.flag==='lower')alpha=Math.max(alpha,value);else beta=Math.min(beta,value);if(alpha>=beta)return value;}}
let check=inCheck(s.board,s.turn),quiet=depth<=0&&!check,moves=legalMoves(s,s.turn,{capturesOnly:quiet});
if(!moves.length&&(!quiet||!legalMoves(s,s.turn,{stopAfterOne:true}).length))return -MATE+ply;
if(quiet){let stand=evaluate(s,s.turn);if(stand>=beta)return stand;alpha=Math.max(alpha,stand);if(qleft<=0||!moves.length)return alpha;}
if(depth<=-6)return evaluate(s,s.turn)-(check?180:0);
let hbase=s.turn==='r'?0:8100;const order=m=>(entry?.best?.from===m.from&&entry?.best?.to===m.to?10000000:priority(s,m)+(s.board[m.to]?0:history[hbase+m.from*90+m.to]));moves.sort((a,b)=>order(b)-order(a));let bestMove=null,first=true;
function save(score,flag,best){if(key&&cycleStart===s._cycles&&table.size<90000)table.set(key,{depth,score:score>98000?score+ply:score< -98000?score-ply:score,flag,best});}
for(let m of moves){let capture=!!s.board[m.to],old=push(s,m),v;try{if(first||!Number.isFinite(alpha))v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft);else{v=-search(s,depth-1,-alpha-1,-alpha,ply+1,quiet?qleft-1:qleft);if(v>alpha&&v<beta)v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft);}}finally{pop(s,m,old);}first=false;if(v>=beta){if(!capture&&depth>0){let h=hbase+m.from*90+m.to;history[h]=Math.min(2000,history[h]+depth*depth);}save(v,'lower',m);return v;}if(v>alpha){alpha=v;bestMove=m;}}
save(alpha,alpha<=originalAlpha?'upper':'exact',bestMove);return alpha;}
const repeats=new Map();for(let m of root){if(!view.board[m.from].hidden){let n=move(view,m,false),key=positionKey(n),count=view.positions?.filter(k=>k===key).length||0;repeats.set(m.from*90+m.to,{count,draw:(count>=2||n.quiet>=120||n.ply>=400)&&legalMoves(n,n.turn,{stopAfterOne:true}).length>0});}}
let result={move:root[0],candidates:[],score:0,depth:0,samples:worlds.length,nodes:0,elapsedMs:0,uncertain,seed:seed??hashText(visibleKey(view)),scoreKind:uncertain?'expected-utility':'material',sampleWins:0,sampleLosses:0};
for(let depth=1;depth<=maxDepth;depth++){
let rows=[];try{for(let m of root){let scores=[],repetition=repeats.get(m.from*90+m.to);if(repetition?.draw){rows.push({...m,...summarizeScores([0],uncertain),draw:true,repetitionCount:repetition.count});continue;}for(let s of worlds){let old=push(s,m),v;try{v=-search(s,depth-1,-Infinity,Infinity,1);}finally{pop(s,m,old);}scores.push(v);}rows.push({...m,...summarizeScores(scores,uncertain),repetitionCount:repetition?.count||0});}}catch(e){if(e!==TIMEOUT)throw e;break;}
rows.sort((a,b)=>b.score-a.score);let top=rows[0];result={...result,...top,move:{from:top.from,to:top.to},candidates:rows.slice(0,5),allCandidates:rows,depth,nodes,elapsedMs:Math.round(performance.now()-start)};onProgress(result);if((!uncertain&&Math.abs(result.score)>98000)||performance.now()>deadline)break;
let ranks=new Map(rows.map((m,i)=>[m.from*90+m.to,i]));root.sort((a,b)=>ranks.get(a.from*90+a.to)-ranks.get(b.from*90+b.to));}
return {...result,nodes,elapsedMs:Math.round(performance.now()-start)};
}
export const choose=(view,rng)=>analyze(view,{rng}).move;
