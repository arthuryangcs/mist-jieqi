// Offline independent replay: no match runner, engine client, process, or server imports.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {initial, publicState, positionKey, legalMoves, move, inCheck, other, TYPES, rootRules} from '../../../engine.js';
const hash = x => createHash('sha256').update(x).digest('hex');
const seeded = seed => () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const equalMove = (a,b) => a?.from === b?.from && a?.to === b?.to;
export const limitation='Independent public-cycle verification of current supported long-check rules, not complete competition chase/threat adjudication. Forced/optional describes immediate final-ply alternatives only. Recorded observations cannot prove unrecorded process-memory privacy.';
export function observation(s, viewer) {
 const p=publicState(s,viewer);
 const v={board:p.board,turn:p.turn,captured:p.captured,ply:p.ply,quiet:p.quiet,result:p.result,positions:p.positions,viewer:p.viewer};
 for(let i=0;i<90;i++)if(s.board[i]?.hidden)assert(!('type' in v.board[i]),'hidden board identity leaked');
 for(let i=0;i<s.captured.length;i++)if(s.captured[i].hidden){const q=s.captured[i],seen=v.captured[i];if(q.capturedBy===viewer){assert.equal(seen.type,q.type);assert.equal(seen.wasHidden,true);}else assert(!('type' in seen),'private capture identity leaked');}
 return v;
}
function visibleFen(v){
 const rows=[];for(let y=0;y<10;y++){let row='',empty=0;for(let x=0;x<9;x++){const p=v.board[y*9+x];if(!p){empty++;continue;}if(empty){row+=empty;empty=0;}const t=p.hidden?'X':p.type;row+=p.side==='r'?t:t.toLowerCase();}rows.push(row+(empty||''));}
 let pool='';for(const side of ['r','b']){const left=[...TYPES];for(const p of [...v.board,...v.captured])if(p?.side===side&&!p.hidden&&p.type!=='K'){const i=left.indexOf(p.type);assert(i>=0,'invalid visible inventory');left.splice(i,1);}for(const t of ['R','A','C','P','N','B']){const n=left.filter(x=>x===t).length;if(n)pool+=(side==='r'?t:t.toLowerCase())+n;}}
 return `${rows.join('/')} ${v.turn==='r'?'w':'b'} ${pool||'-'} ${v.quiet} ${Math.floor(v.ply/2)+1}`;
}
function token(s,m,n,viewer){
 const p=s.board[m.from],q=s.board[m.to];const coord=i=>String.fromCharCode(97+i%9)+(9-Math.floor(i/9));
 const letter=(t,side)=>(viewer==='b'?other(side):side)==='r'?t:t.toLowerCase();
 return coord(viewer==='b'?89-m.from:m.from)+coord(viewer==='b'?89-m.to:m.to)+(p.hidden?letter(n.board[m.to].type,p.side):'X')+(q?.hidden&&p.side===viewer?letter(q.type,q.side):'X');
}
// Independently reconstruct every transition in three equal complete public cycles.
// Do not call repetitionStatus/rootRules to establish responsibility.
export function cycleEvidence(s){
 const ps=s.positions??[],end=ps.length-1;if(end<12||ps[end]!==positionKey(s))return null;
 const decode=key=>{const [turn,entries]=JSON.parse(key);assert(['r','b'].includes(turn));assert.equal(entries.length,90);const board=entries.map(p=>{if(p===null)return null;assert(Array.isArray(p)&&p.length===3&&['r','b'].includes(p[0])&&typeof p[2]==='boolean'&&typeof p[1]==='string'&&(p[2]?/^[RNBCAP]$/:/^[KRNBCAP]$/).test(p[1]));return {side:p[0],role:p[1],hidden:p[2],...(!p[2]?{type:p[1]}:{})};});const v={turn,board,captured:[],ply:0,quiet:0};assert.equal(positionKey(v),key);return v;};
 for(let period=4;period*3<=end;period+=2){
  const start=end-period*3+1;if(!ps.slice(start+period).every((key,j)=>key===ps[start+j]))continue;
  const checks={r:0,b:0},moves={r:0,b:0},transitions=[];let valid=true;
  for(let i=start;i<=end;i++){
   let before,after;try{before=decode(ps[i-1]);after=decode(ps[i]);}catch{valid=false;break;}
   if(after.turn!==other(before.turn)){valid=false;break;}
   const changed=before.board.flatMap((p,j)=>JSON.stringify(p)!==JSON.stringify(after.board[j])?[j]:[]);
   if(changed.length!==2){valid=false;break;}
   const from=changed.find(j=>before.board[j]?.side===before.turn&&!after.board[j]),to=changed.find(j=>after.board[j]?.side===before.turn);
   if(from===undefined||to===undefined||before.board[to]||!legalMoves(before).some(m=>m.from===from&&m.to===to)){valid=false;break;}
   // The external incoming noncapture may reveal a piece. Legality above uses
   // its PRE-reveal role. Reconstruct only from the now-public successor identity,
   // never referee truth. Reveals inside equal repeated cycles cannot match.
   const shown=after.board[to];if(shown.hidden){valid=false;break;}
   if(before.board[from].hidden)before.board[from].type=shown.type;
   if(positionKey(move(before,{from,to},false))!==ps[i]){valid=false;break;}
   const givesCheck=inCheck(after.board,after.turn);moves[before.turn]++;checks[before.turn]+=Number(givesCheck);transitions.push({historyIndex:i,side:before.turn,from,to,givesCheck});
  }
  if(!valid)continue;
  const responsible=['r','b'].filter(side=>moves[side]>0&&checks[side]===moves[side]);
  return {status:responsible.length===1?'loss':'review-required',reason:responsible.length===1?'perpetual-check':'repetition-needs-ruling',...(responsible.length===1?{loser:responsible[0]}:{}),cycles:3,period,moves,checks,transitions,start,end};
 }
 return null;
}
export function repetitionDetail(before,after,evidence=cycleEvidence(after)){
 if(!evidence)return null;
 const occurrencePlies=after.positions.flatMap((key,i)=>key===positionKey(after)?[i]:[]);
 const legalReplies=legalMoves(before).map(m=>{const n=move(before,m),e=cycleEvidence(n);return {...m,givesCheck:inCheck(n.board,n.turn),responsibleSide:e?.loser??null,repetitionLoss:!!n.result?.winner&&e?.loser===before.turn,reviewRequired:e?.status==='review-required',result:n.result};});
 return {terminalPly:after.ply,lastMover:before.turn,responsibleSide:evidence.loser??null,responsibleIsLastMover:evidence.loser?evidence.loser===before.turn:null,occurrencePlies,occurrences:occurrencePlies.length,cycle:evidence,legalReplies,forcedImmediateLoss:legalReplies.length>0&&legalReplies.every(x=>x.repetitionLoss),optionalImmediateLoss:legalReplies.some(x=>x.repetitionLoss)&&legalReplies.some(x=>!x.repetitionLoss),limitation};
}
export function auditGame(g,initialHash){
 assert(Number.isInteger(g.seed),'missing referee seed');assert(['r','b'].includes(g.candidateSide));assert(Array.isArray(g.log));
 let s=initial(seeded(g.seed));s.positions=[positionKey(s)];const layoutSha256=hash(JSON.stringify(s.board));if(initialHash)assert.equal(layoutSha256,initialHash,'initial layout hash');
 let repetition=null,privateCaptures=0;const checks=[],reviewRequiredHistory=[];
 for(const [i,row] of g.log.entries()){
  assert(!s.result,'post-terminal move');assert.equal(row.ply,s.ply+1);assert.equal(row.side,s.turn);
  for(const viewer of [null,'r','b'])observation(s,viewer);
  const v=observation(s,s.turn);assert.equal(row.viewSha256,hash(JSON.stringify(v)),'observation hash');assert.equal(row.visibleFen,visibleFen(v),'visible FEN');
  assert.equal(row.engine,s.turn===g.candidateSide?'candidate':'opponent');
  if(!row.applied){assert.equal(row.applied,false);assert.equal(i,g.log.length-1);assert(g.result?.technicalForfeit,'unapplied row without technical failure');continue;}
  assert(legalMoves(s).some(m=>equalMove(m,row.move)),'illegal move');assert.deepEqual(row.rootResponsibility,rootRules(v,row.move),'root responsibility metadata');assert.deepEqual(legalMoves(s),legalMoves(v),'public/truth legal set mismatch');
  const p=s.board[row.move.from],q=s.board[row.move.to],n=move(s,row.move);
  assert.equal(row.revealed,p.hidden?n.board[row.move.to].type:null,'reveal');assert.deepEqual(row.capturedPublic,q?{side:q.side,hidden:q.hidden,...(!q.hidden?{type:q.type}:{})}:null,'public capture');
  assert.equal(row.afterSha256,hash(JSON.stringify(n.board)),'after board hash');assert.equal(row.pikaToken,g.kind==='pika'?token(s,row.move,n,other(g.candidateSide)):null,'Pika private observation token');
  for(const viewer of [null,'r','b'])observation(n,viewer);
  if(q?.hidden)privateCaptures++;
  checks.push({ply:n.ply,side:s.turn,move:row.move,givesCheck:inCheck(n.board,n.turn),moverWasInCheck:inCheck(s.board,s.turn)});
  const e=cycleEvidence(n);if(n.adjudication){assert(e,'missing independently verified cycle');const {transitions,start,end,...ruling}=e;assert.deepEqual(ruling,n.adjudication,'independent ruling mismatch');}if(e?.status==='review-required')reviewRequiredHistory.push({ply:n.ply,...e});if(e&&(n.result||e.status==='loss'))repetition=repetitionDetail(s,n,e);s=n;
 }
 if(g.plies!==undefined)assert.equal(g.plies,s.ply,'plies');
 let category='pending';
 if(g.result?.technicalForfeit){category='technical-failure';assert(!s.result,'technical result overwrites terminal rule result');assert(['decided','unresolved'].includes(g.result.status));const expected=g.result.offender==='setup'?null:g.result.offender==='candidate'?other(g.candidateSide):g.result.offender==='opponent'?g.candidateSide:undefined;assert.notEqual(expected,undefined,'unknown offender');assert.equal(g.result.winner,expected);assert.equal(g.result.status,expected===null?'unresolved':'decided');}
 else if(g.result){let expected;const ruleEvidence=s.adjudication??null;
 if(s.result?.winner){category=ruleEvidence?.status==='loss'?'long-check':'normal-decisive';expected={status:'decided',winner:s.result.winner,technicalForfeit:false,reason:s.result.text,ruleEvidence};}
 else if(s.result?.requiresAdjudication||s.result?.status==='unresolved'||ruleEvidence?.status==='review-required'){category='unresolved-repetition';expected={status:'unresolved',winner:null,technicalForfeit:false,reason:'repetition-needs-ruling',ruleEvidence};}
 else if(s.quiet>=120){category='draw';expected={status:'draw',winner:null,technicalForfeit:false,reason:'120-quiet-plies',ruleEvidence};}
 else{assert(s.ply>=400,'unresolved before cap');category='unresolved-cap';expected={status:'unresolved',winner:null,technicalForfeit:false,reason:'400-ply-cap',ruleEvidence};}assert.deepEqual(g.result,expected,'result');}
 else assert(!s.result,'terminal game missing result');
 return {index:g.index,group:g.group,seed:g.seed,candidateSide:g.candidateSide,layoutSha256,plies:s.ply,privateCaptures,category,result:g.result??null,cleanupErrors:g.cleanupErrors??[],reviewRequiredCount:reviewRequiredHistory.length,reviewRequiredHistory,repetition,passed:true};
}
export function audit(data){
 assert(Array.isArray(data.games));const seen=new Set(),games=[];
 for(const g of data.games){try{assert(!seen.has(g.index),'duplicate game index');seen.add(g.index);if(data.tasks){assert(data.tasks[g.index],'unknown task');for(const [k,v] of Object.entries(data.tasks[g.index]))assert.deepEqual(g[k],v,`task ${k}`);}const init=data.initials?.find(x=>x.seed===g.seed);if(data.initials)assert(init,'missing initial layout');games.push(auditGame(g,init?.layoutSha256));}catch(e){games.push({index:g.index,group:g.group,passed:false,error:e.message,result:g.result??null});}}
 const categories={};for(const g of games)if(g.passed)categories[g.category]=(categories[g.category]??0)+1;
 return {schemaVersion:2,defaultPromotion:false,technicalFailures:games.filter(g=>g.result?.technicalForfeit),cleanupFailures:games.filter(g=>g.cleanupErrors?.length),reviewRequiredCount:games.reduce((n,g)=>n+(g.reviewRequiredCount??0),0),passed:games.every(g=>g.passed),complete:!!data.completedAt&&data.tasks?.length===games.length&&games.every(g=>g.passed&&g.result),expectedGames:data.tasks?.length??null,auditedGames:games.length,categories,limitations:[limitation,'Replay checks recorded observations against deterministic referee truth, not unrecorded engine memory or actual IPC traffic. Technical failures remain separate, not normal wins.'],games};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2);if(!input)throw Error('Usage: node native/experiments/jqe-retest/audit.mjs INPUT.json [OUTPUT.json]');const raw=fs.readFileSync(input);const report={inputSha256:hash(raw),...audit(JSON.parse(raw))};const json=JSON.stringify(report,null,2)+'\n';if(output)fs.writeFileSync(output,json);else process.stdout.write(json);if(!report.passed)process.exitCode=1;
}
