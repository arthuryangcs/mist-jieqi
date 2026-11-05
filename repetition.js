// Evidence-based subset of Chinese Competition Rules 2020, not a full referee.
// Only public position keys are inspected. Hidden identities/private captures
// never participate in responsibility. Unsupported kill/chase cases need review.
export const repetitionPolicy = 'cn2020-evidence-v1';
const sides=['r','b'], label=s=>s==='r'?'红':'黑';
const decoded=new Map(),transitions=new Map();
function remember(map,key,value){if(map.size>=2048)map.delete(map.keys().next().value);map.set(key,value);return value;}
function decode(key){
 if(decoded.has(key))return decoded.get(key);
 try{const [turn,raw]=JSON.parse(key);if(!sides.includes(turn)||!Array.isArray(raw)||raw.length!==90)throw Error();
  const board=raw.map(p=>{if(p===null)return null;if(!Array.isArray(p)||p.length!==3||!sides.includes(p[0])||!('KRNBCAP'.includes(p[1]))||p[1].length!==1||typeof p[2]!=='boolean'||p[2]&&p[1]==='K')throw Error();return{side:p[0],role:p[1],hidden:p[2],...(!p[2]?{type:p[1]}:{})};});
  if(sides.some(side=>board.filter(p=>p?.side===side&&p.type==='K'&&!p.hidden).length!==1))throw Error();
  return remember(decoded,key,{board,turn});
 }catch{return remember(decoded,key,null);}
}
const copyBoard=b=>b.map(p=>p?{...p}:null);
function captures(board,side,h){return h.legalMoves({board:copyBoard(board),turn:side},side,{capturesOnly:true});}
function afterBoard(board,m){const out=copyBoard(board);out[m.to]=out[m.from];out[m.from]=null;return out;}
function quietCertificate(board,side,h){
 // No direct capture AND no legal next checking move excludes the direct
 // and checking-sequence threats in 24.2/24.3. Check stalemate threats too.
 // Absence of a direct capture alone is never a quiet certificate.
 const own=board.filter(p=>p?.side===side);
 if(own.some(p=>p.hidden))return false;
 if(captures(board,side,h).length)return false;
 for(const m of h.legalMoves({board:copyBoard(board),turn:side},side)){
  const next=afterBoard(board,m);
  if(h.inCheck(next,h.other(side)))return false;
  if(!h.legalMoves({board:next,turn:h.other(side)},h.other(side),{stopAfterOne:true}).length)return false;
 }
 return true;
}
function simpleChase(before,after,m,side,h){
 if(before.some(p=>p?.hidden)||after.some(p=>p?.hidden))return null;
 const opponent=h.other(side),victims=after.map((p,i)=>({p,i})).filter(x=>x.p?.side===opponent&&x.p.type!=='K');
 // Prove only a direct newly created capture of the opponent's sole non-king
 // piece. Protected/exchanged/pawn/joint/hidden cases remain unclassified.
 if(victims.length!==1)return null;
 // 26.2 has an additional drawing-defender exception for incidental chases
 // of advisors/elephants. We do not prove that exception's prerequisites,
 // so these targets cannot establish an automatic forbidden chase here.
 const {p:target,i:to}=victims[0];if(['P','A','B'].includes(target.type))return null;
 const old=captures(before,side,h),now=captures(after,side,h);
 for(const c of now){if(c.to!==to)continue;const attacker=after[c.from];
  if(!attacker||['K','P'].includes(attacker.type)||attacker.type===target.type)continue;
  const previousFrom=c.from===m.to?m.from:c.from;
  if(old.some(x=>x.from===previousFrom&&x.to===to))continue;
  if(captures(after,opponent,h).some(x=>x.from===to&&x.to===c.from))continue;
  const taken=afterBoard(after,c);
  if(captures(taken,opponent,h).some(x=>x.to===to))continue;
  // With only the opposing king left and both kings legal, the capture cannot
  // lose the attacker immediately by exchange or a counter-mating army.
  return{target:opponent+':'+target.type,attacker:attacker.type};
 }
 return null;
}
function transition(a,b,h){
 const key=a+'\n'+b;if(transitions.has(key))return transitions.get(key);
 const before=decode(a),after=decode(b);let result=null;
 if(before&&after&&after.turn===h.other(before.turn)){
  const diff=[];for(let i=0;i<90;i++)if(JSON.stringify(before.board[i])!==JSON.stringify(after.board[i]))diff.push(i);
  if(diff.length===2){const from=diff.find(i=>before.board[i]?.side===before.turn&&!after.board[i]),to=diff.find(i=>after.board[i]?.side===before.turn);
   if(from!==undefined&&to!==undefined&&h.legalMoves({board:copyBoard(before.board),turn:before.turn}).some(m=>m.from===from&&m.to===to)){
    const p=before.board[from],q=before.board[to],m={from,to},moved=after.board[to];
    if(!p.hidden&&moved.type===p.type&&!moved.hidden||p.hidden&&!moved.hidden){
     const check=h.inCheck(after.board,after.turn),progress=!!q||p.hidden;
     let kind='unknown',chase=null;
     if(check)kind='check';else if(!progress){chase=simpleChase(before.board,after.board,m,before.turn,h);if(chase)kind='chase';else if(quietCertificate(after.board,before.turn,h))kind='quiet';}
     result={side:before.turn,from,to,check,kind,chase,progress,capture:!!q};
    }
   }
  }
 }
 return remember(transitions,key,result);
}
// This policy-level function is separately testable. Its inputs must be
// validated move evidence, never just attack counts or repeated board hashes.
export function classifyCycle(events){
 const classes={};for(const side of sides){const e=events.filter(x=>x.side===side);
  classes[side]=e.length>=3&&e.every(x=>x.kind==='check')?'check':e.length&&e.every(x=>x.kind==='quiet')?'allowed':e.length>=3&&e.every(x=>x.kind==='check'||x.kind==='chase')?'forbidden':e.length&&e.every(x=>x.kind!=='unknown')&&e.some(x=>x.kind==='quiet')?'allowed':'unknown';
 }
 const checking=sides.filter(s=>classes[s]==='check');
 if(checking.length===1)return{kind:'perpetual-check',liable:checking[0],classes};
 if(checking.length===2)return{kind:'mutual-check',draw:true,classes};
 const liable=sides.filter(s=>classes[s]==='forbidden'&&classes[s==='r'?'b':'r']==='allowed');
 if(liable.length===1)return{kind:'proven-direct-chase',liable:liable[0],classes};
 if(sides.every(s=>classes[s]==='allowed'))return{kind:'allowed-cycle',draw:true,classes};
 return{kind:'manual-review',classes};
}
function cycleAt(keys,index,h){
 const matches=[];for(let i=0;i<=index;i++)if(keys[i]===keys[index])matches.push(i);if(matches.length<3)return null;
 const [a,b,c]=matches.slice(-3),period=b-a;if(!period||c-b!==period)return{kind:'manual-review',count:matches.length,reason:'循环着法不一致'};
 for(let i=0;i<=period;i++)if(keys[a+i]!==keys[b+i])return{kind:'manual-review',count:matches.length,reason:'盘面重复但着法序列不同'};
 const events=[];for(let i=a+1;i<=c;i++){const e=transition(keys[i-1],keys[i],h);if(!e||e.progress)return{kind:'manual-review',count:matches.length,reason:'历史不完整或循环内有吃子揭子'};events.push(e);}
 // 23.2: count an actual entering move, never invent one for an edited initial
 // board. A captured entering move is excluded. Otherwise await another full
 // verified cycle. This conservative boundary is explicitly documented.
 const entering=a>0?transition(keys[a-1],keys[a],h):null;
 if(!entering||entering.capture)return{kind:'insufficient-entry',count:matches.length,reason:'首着进入循环的证据不足，继续记录'};
 return{...classifyCycle(events),count:matches.length,period,pattern:keys.slice(a,b),events};
}
export function adjudicateRepetition(state,h){
 const keys=state.positions||[],base={policy:repetitionPolicy,completeRules:false,status:'none',result:null};if(keys.length<3)return base;
 const origin=Number.isInteger(state.ply)?state.ply-keys.length+1:-1;let warning=null,last=base;
 for(let i=0;i<keys.length;i++){
  if(warning&&i>warning.start){const expected=warning.pattern[(i-warning.start)%warning.period],e=transition(keys[i-1],keys[i],h);
   if(!e||keys[i]!==expected){warning=null;last={...base,status:'changed',message:'已离开原循环；复杂杀捉仍需复核'};}
   else{warning.used[e.side]++;const expired=warning.liable?warning.used[warning.liable]>=2:sides.every(s=>warning.used[s]>=2);
    if(expired){const result=warning.liable?{winner:h.other(warning.liable),text:label(warning.liable)+'方应变着而两次行棋未变（重复棋例）'}:{winner:null,text:'和棋（双方允许着法，提醒后两回合不变）'};return{...base,status:'decided',kind:warning.kind,liable:warning.liable||null,result,message:result.text};}
   }
  }
  const c=cycleAt(keys,i,h);if(!c)continue;
  if(c.kind==='perpetual-check'){const result={winner:h.other(c.liable),text:label(c.liable)+'方单方长将判负（2020棋例）'};return{...base,status:'decided',kind:c.kind,liable:c.liable,result,message:result.text};}
  if(c.kind==='manual-review'||c.kind==='insufficient-entry'){if(!warning)last={...base,status:'review',kind:c.kind,count:c.count,message:c.kind==='manual-review'?'重复局面待裁定：未能可靠认定长杀、复杂长捉或双方责任':c.reason};continue;}
  if(!warning){const early=c.draw&&origin>=0&&origin+i<=50;warning={...c,liable:early?'r':c.liable,start:i,used:{r:0,b:0},kind:early?'early-allowed-cycle':c.kind};}
 }
 if(warning){const liable=warning.liable||null;return{...base,status:'warning',kind:warning.kind,liable,count:warning.count,remaining:{r:Math.max(0,2-warning.used.r),b:Math.max(0,2-warning.used.b)},message:liable?label(liable)+'方应变着：尚有'+Math.max(0,2-warning.used[liable])+'次行棋机会'+(warning.kind==='early-allowed-cycle'?'（25回合内双方不变作和，按4.3由红方变着）':''):'双方允许着法循环：各有两次行棋机会变着，不变判和'};}
 return last;
}
