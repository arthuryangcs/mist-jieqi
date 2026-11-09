export const TYPES=['R','R','N','N','B','B','A','A','C','C','P','P','P','P','P'];
export const names={r:{K:'帅',R:'车',N:'马',B:'相',A:'仕',C:'炮',P:'兵'},b:{K:'将',R:'車',N:'馬',B:'象',A:'士',C:'砲',P:'卒'}};
const copy=x=>structuredClone(x);
export function shuffle(a,rng=Math.random){a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function initial(rng=Math.random){let board=Array(90).fill(null);for(let side of ['r','b']){let pool=shuffle(TYPES,rng),y=side==='r'?9:0;const put=(x,y,role)=>{board[y*9+x]={side,role,type:role==='K'?'K':pool.pop(),hidden:role!=='K'};};['R','N','B','A','K','A','B','N','R'].forEach((t,x)=>put(x,y,t));[1,7].forEach(x=>put(x,side==='r'?7:2,'C'));[0,2,4,6,8].forEach(x=>put(x,side==='r'?6:3,'P'));}return {board,turn:'r',captured:[],ply:0,quiet:0,result:null,positions:[]};}
// A null viewer gets shared facts only. Each player additionally knows their own dark captures.
export function publicState(s,viewer=s.viewer??null){
 if(![null,'r','b'].includes(viewer))throw Error('无效信息视角');
 return {...copy(s),viewer,positions:publicPositions(s),
  board:s.board.map(p=>p?{side:p.side,role:p.role,hidden:p.hidden,...(!p.hidden?{type:p.type}:{})}:null),
  captured:s.captured.map(p=>{
   if(!p.hidden&&!p.wasHidden)return {...p};
   const captor=p.capturedBy,visible=viewer!==null&&captor===viewer&&!!p.type;
   return {side:p.side,hidden:!visible,...(captor?{capturedBy:captor}:{}),...(visible?{type:p.type,wasHidden:true}:{})};
  })};
}
export const other=s=>s==='r'?'b':'r';
const palace=(x,y,s)=>x>=3&&x<=5&&(s==='r'?y>=7:y<=2);
export function pseudo(board,from,to){let p=board[from],q=board[to];if(!p||from===to||to<0||to>=90||q?.side===p.side)return false;let x=from%9,y=Math.floor(from/9),u=to%9,v=Math.floor(to/9),dx=u-x,dy=v-y,ax=Math.abs(dx),ay=Math.abs(dy),t=p.hidden?p.role:p.type;
let count=0;if(dx===0||dy===0){let step=dx===0?Math.sign(dy)*9:Math.sign(dx);for(let i=from+step;i!==to;i+=step)if(board[i])count++;}
switch(t){case 'K':return ax+ay===1&&palace(u,v,p.side)||q?.type==='K'&&dx===0&&count===0;case 'A':return ax===1&&ay===1&&(!p.hidden||palace(u,v,p.side));case 'B':return ax===2&&ay===2&&!board[(y+dy/2)*9+x+dx/2]&&(!p.hidden||(p.side==='r'?v>=5:v<=4));case 'N':return ax*ay===2&&!board[(y+(ay===2?Math.sign(dy):0))*9+x+(ax===2?Math.sign(dx):0)];case 'R':return (dx===0||dy===0)&&count===0;case 'C':return (dx===0||dy===0)&&count===(q?1:0);case 'P':return dx===0&&dy===(p.side==='r'?-1:1)||ay===0&&ax===1&&(p.side==='r'?y<=4:y>=5);default:return false;}}
const checkRays=[[1,0],[-1,0],[0,1],[0,-1]];
const checkLeapers=Array.from({length:90},(_,k)=>{const x=k%9,y=(k/9)|0;return [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1],[1,1],[1,-1],[-1,1],[-1,-1],[2,2],[2,-2],[-2,2],[-2,-2]].flatMap(([dx,dy])=>{const u=x+dx,v=y+dy;if(u<0||u>8||v<0||v>9)return [];const type=Math.abs(dx)+Math.abs(dy)===3?'N':Math.abs(dx)===1?'A':'B',block=type==='N'?(v-(Math.abs(dy)===2?Math.sign(dy):0))*9+u-(Math.abs(dx)===2?Math.sign(dx):0):(y+dy/2)*9+x+dx/2;return [[v*9+u,type,block]];});});
export function inCheck(board,side,knownKing){const k=knownKing??board.findIndex(p=>p?.side===side&&!p.hidden&&p.type==='K');if(k<0)return true;const x=k%9,y=(k/9)|0;
 // A ray has already counted its screens, so do not rescan it through pseudo().
 for(const [dx,dy]of checkRays){let count=0,distance=0;for(let u=x+dx,v=y+dy;u>=0&&u<9&&v>=0&&v<10;u+=dx,v+=dy){distance++;const p=board[v*9+u];if(!p)continue;count++;if(p.side!==side){const t=p.hidden?p.role:p.type;if(t==='C'&&count===2)return true;if(count===1){if(t==='R')return true;if(t==='K'&&(dx===0&&board[k]?.type==='K'||distance===1&&palace(x,y,p.side)))return true;if(t==='P'&&distance===1&&(dx===0?(p.side==='r'?dy===1:dy===-1):(p.side==='r'?v<=4:v>=5)))return true;}}if(count===2)break;}}
 for(const [from,type,block]of checkLeapers[k]){const p=board[from];if(!p||p.side===side||(p.hidden?p.role:p.type)!==type)continue;if(type==='N'){if(!board[block])return true;}else if(type==='A'){if(!p.hidden||palace(x,y,p.side))return true;}else if(!board[block]&&(!p.hidden||(p.side==='r'?y>=5:y<=4)))return true;}
 return false;}
export function legalMoves(s,side=s.turn,{capturesOnly=false,stopAfterOne=false}={}){let out=[],b=s.board,king=s._kings?.[side]??b.findIndex(p=>p?.side===side&&!p.hidden&&p.type==='K');for(let f=0;f<90;f++){let p=b[f];if(p?.side!==side)continue;for(let t of candidates(b,f,capturesOnly)){if(!pseudo(b,f,t))continue;let q=b[t];b[t]=p;b[f]=null;let safe=!inCheck(b,side,!p.hidden&&p.type==='K'?t:king);b[f]=p;b[t]=q;if(safe){out.push({from:f,to:t});if(stopAfterOne)return out;}}}return out;}
function candidates(b,f,capturesOnly=false){let p=b[f],t=p.hidden?p.role:p.type,x=f%9,y=Math.floor(f/9),out=[];const add=(u,v)=>{if(u>=0&&u<9&&v>=0&&v<10&&(!capturesOnly||b[v*9+u]))out.push(v*9+u);};if(t==='R'||t==='C'){for(let [dx,dy] of checkRays){let screen=false;for(let u=x+dx,v=y+dy;u>=0&&u<9&&v>=0&&v<10;u+=dx,v+=dy){let q=b[v*9+u];if(t==='R'){if(!capturesOnly||q)add(u,v);if(q)break;}else if(!screen){if(q)screen=true;else if(!capturesOnly)add(u,v);}else if(q){add(u,v);break;}}}}else if(t==='N'){for(let [dx,dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]])add(x+dx,y+dy);}else if(t==='A'||t==='B'){let d=t==='A'?1:2;for(let dx of [-d,d])for(let dy of [-d,d])add(x+dx,y+dy);}else if(t==='P'){add(x,y+(p.side==='r'?-1:1));add(x+1,y);add(x-1,y);}else{for(let [dx,dy] of checkRays)add(x+dx,y+dy);let k=b.findIndex(q=>q?.side!==p.side&&q?.type==='K');if(k>=0&&!out.includes(k))out.push(k);}return out;}
export function positionKey(s){return JSON.stringify([s.turn,s.board.map(p=>p?[p.side,p.hidden?p.role:p.type,p.hidden]:null)]);}
// A rule decision needs the sequence of public positions, not an occurrence count.
// These keys never contain the true identity of an unrevealed piece.
export function readPositionKey(key){
 try{const x=JSON.parse(key);if(!Array.isArray(x)||x.length!==2||!['r','b'].includes(x[0])||!Array.isArray(x[1])||x[1].length!==90)return null;
 const board=x[1].map(p=>{if(p===null)return null;if(!Array.isArray(p)||p.length!==3||!['r','b'].includes(p[0])||typeof p[2]!=='boolean'||typeof p[1]!=='string'||!(p[2]?/^[RNBCAP]$/:/^[KRNBCAP]$/).test(p[1]))throw Error('invalid public history');return {side:p[0],role:p[1],hidden:p[2],...(!p[2]?{type:p[1]}:{})};});
 const state={turn:x[0],board};return positionKey(state)===key?state:null;
 }catch{return null;}
}
export function publicPositions(s){const ps=s.positions;if(!Array.isArray(ps)||ps.length>401||ps.some(k=>typeof k!=='string'||k.length>12000||!readPositionKey(k)))return [];return [...ps];}
function currentHistory(s){const ps=publicPositions(s),key=positionKey(s);return ps.at(-1)===key?ps:[key];}
function publicTransition(before,after){
 if(after.turn!==other(before.turn))return null;
 const changed=[];for(let i=0;i<90;i++)if(JSON.stringify(before.board[i])!==JSON.stringify(after.board[i]))changed.push(i);
 if(changed.length!==2)return null;
 const from=changed.find(i=>before.board[i]?.side===before.turn&&!after.board[i]),to=changed.find(i=>after.board[i]?.side===before.turn);
 if(from===undefined||to===undefined||from===to)return null;
 const p=before.board[from],q=after.board[to];if(q.hidden||(!p.hidden&&p.type!==q.type))return null;
 if(!legalMoves(before).some(m=>m.from===from&&m.to===to))return null;
 return {side:before.turn,capture:!!before.board[to],check:inCheck(after.board,after.turn)};
}
export function repetitionStatus(s){
 const ps=publicPositions(s),end=ps.length-1;if(end<12||ps[end]!==positionKey(s))return null;
 // Three complete cycles of resulting positions. The incoming non-capture
 // move at an external entry point counts (2020 23.2), not an earlier capture.
 for(let period=4;period*3<=end;period+=2){
  const start=end-period*3+1;let repeated=true;
  for(let i=start+period;i<=end;i++)if(ps[i]!==ps[i-period]){repeated=false;break;}
  if(!repeated)continue;
  const checks={r:0,b:0},moves={r:0,b:0};let valid=true;
  for(let i=start;i<=end;i++){const step=publicTransition(readPositionKey(ps[i-1]),readPositionKey(ps[i]));if(!step||step.capture){valid=false;break;}moves[step.side]++;checks[step.side]+=Number(step.check);}
  if(!valid)continue;
  const long=['r','b'].filter(side=>moves[side]>0&&checks[side]===moves[side]);
  const evidence={cycles:3,period,moves,checks};
  if(long.length===1)return {status:'loss',reason:'perpetual-check',loser:long[0],...evidence};
  // Chase, mating threats, mutual duties and the two-round change procedure
 // need a referee. Absence of continuous check is NOT proof of a legal draw.
  return {status:'review-required',reason:'repetition-needs-ruling',...evidence};
 }
 return null;
}
function applyRules(s,n){
 if(!legalMoves(n,n.turn,{stopAfterOne:true}).length){n.result={winner:s.turn,text:inCheck(n.board,n.turn)?'将死':'困毙'};delete n.adjudication;return;}
 const ruling=repetitionStatus(n);if(ruling)n.adjudication=ruling;else delete n.adjudication;
 if(ruling?.status==='loss')n.result={winner:other(ruling.loser),text:(ruling.loser==='r'?'红':'黑')+'方长将判负'};
 // The legacy move limit cannot turn an unresolved repetition into a draw.
 else if(n.quiet>=120||n.ply>=400)n.result=ruling?.status==='review-required'?{winner:null,text:'重复局面待裁决',status:'unresolved',requiresAdjudication:true}:{winner:null,text:'和棋（步数上限）'};
}
export function move(s,m,finish=true){let n=copy(s),p=n.board[m.from],q=n.board[m.to];if(!p)throw Error('空起点');if(q)n.captured.push(q.hidden?{side:q.side,hidden:true,type:q.type,capturedBy:p.side}:{...q,capturedBy:p.side});n.quiet=q||p.hidden?0:n.quiet+1;p.hidden=false;n.board[m.to]=p;n.board[m.from]=null;n.turn=other(s.turn);n.ply++;if(finish){n.positions=[...currentHistory(s),positionKey(n)];applyRules(s,n);}return n;}
export class Game{constructor(){this.reset();}reset(){this.state=initial();this.state.positions=[positionKey(this.state)];this.history=[];}play(m){if(this.state.result||!legalMoves(this.state).some(x=>x.from===m.from&&x.to===m.to))return false;this.history.push(copy(this.state));this.state=move(this.state,m);return true;}undo(single=false){if(!this.history.length)return false;do{this.state=this.history.pop();}while(!single&&this.state.turn!=='r'&&this.history.length);return true;}}

export function rootRules(view,m){
 const n=move(view,m,false),key=positionKey(n),history=currentHistory(view),count=history.filter(k=>k===key).length;
 // Revealing a piece cannot repeat the current reversible public history.
 if(view.board[m.from]?.hidden)return {count:0,loss:false,win:false,draw:false,reviewRequired:false,limit:n.ply>=400};
 n.positions=[...history,key];n.result=null;applyRules(view,n);
 const loss=n.adjudication?.status==='loss'&&n.adjudication.loser===view.turn,win=n.adjudication?.status==='loss'&&n.adjudication.loser!==view.turn;
 return {count,loss:!!loss,win:!!win,draw:!!(n.result&&!n.result.winner&&!n.result.requiresAdjudication),reviewRequired:n.adjudication?.status==='review-required'};
}
