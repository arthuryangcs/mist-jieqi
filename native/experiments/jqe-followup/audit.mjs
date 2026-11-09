// Offline independent replay: no match runner, engine client, process, or server imports.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {initial, publicState, positionKey, legalMoves, move, inCheck, other, TYPES} from '../historical/referee.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const seeded = seed => () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const equalMove = (a,b) => a?.from === b?.from && a?.to === b?.to;
export const limitation = 'This is the archived 9602155 referee (historical replay only), not complete competition perpetual-check/perpetual-chase adjudication. Repetition wins are not evidence of superior playing strength. Forced means every legal move at the final ply loses immediately by this repetition rule; it says nothing about earlier avoidability.';
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
export function repetitionDetail(before,after,checks){
 const key=positionKey(after),occurrencePlies=after.positions.flatMap((k,i)=>k===key?[i]:[]);
 const legalReplies=legalMoves(before).map(m=>{const n=move(before,m);return {...m,givesCheck:inCheck(n.board,n.turn),repetitionLoss:!!n.result?.text.includes('重复'),result:n.result};});
 const gaps=occurrencePlies.slice(1).map((p,i)=>p-occurrencePlies[i]);
 const start=occurrencePlies.at(-2),cycle=checks.filter(x=>x.ply>start);
 return {terminalPly:after.ply,loser:before.turn,winner:after.result.winner,occurrences:occurrencePlies.length,occurrencePlies,cycleLengths:gaps,lastCycleLength:gaps.at(-1),lastCycle:cycle,lastMoveBySide:Object.fromEntries(['r','b'].map(side=>[side,checks.findLast(x=>x.side===side)??null])),legalReplies,repetitionLosingMoves:legalReplies.filter(x=>x.repetitionLoss).map(({from,to})=>({from,to})),forcedRepetition:legalReplies.length>0&&legalReplies.every(x=>x.repetitionLoss),limitation};
}
export function auditGame(g,initialHash){
 assert(Number.isInteger(g.seed),'missing referee seed');assert(['r','b'].includes(g.candidateSide));assert(Array.isArray(g.log));
 let s=initial(seeded(g.seed));s.positions=[positionKey(s)];const layoutSha256=hash(JSON.stringify(s.board));if(initialHash)assert.equal(layoutSha256,initialHash,'initial layout hash');
 let repetition=null,privateCaptures=0;const checks=[];
 for(const [i,row] of g.log.entries()){
  assert(!s.result,'post-terminal move');assert.equal(row.ply,s.ply+1);assert.equal(row.side,s.turn);
  for(const viewer of [null,'r','b'])observation(s,viewer);
  const v=observation(s,s.turn);assert.equal(row.viewSha256,hash(JSON.stringify(v)),'observation hash');assert.equal(row.visibleFen,visibleFen(v),'visible FEN');
  assert.equal(row.engine,s.turn===g.candidateSide?'candidate':'opponent');
  if(!row.applied){assert.equal(row.applied,false);assert.equal(i,g.log.length-1);assert(g.result?.technicalForfeit,'unapplied row without technical failure');continue;}
  assert(legalMoves(s).some(m=>equalMove(m,row.move)),'illegal move');assert.deepEqual(legalMoves(s),legalMoves(v),'public/truth legal set mismatch');
  const p=s.board[row.move.from],q=s.board[row.move.to],n=move(s,row.move);
  assert.equal(row.revealed,p.hidden?n.board[row.move.to].type:null,'reveal');assert.deepEqual(row.capturedPublic,q?{side:q.side,hidden:q.hidden,...(!q.hidden?{type:q.type}:{})}:null,'public capture');
  assert.equal(row.afterSha256,hash(JSON.stringify(n.board)),'after board hash');assert.equal(row.pikaToken,g.kind==='pika'?token(s,row.move,n,other(g.candidateSide)):null,'Pika private observation token');
  for(const viewer of [null,'r','b'])observation(n,viewer);
  if(q?.hidden)privateCaptures++;
  checks.push({ply:n.ply,side:s.turn,move:row.move,givesCheck:inCheck(n.board,n.turn),moverWasInCheck:inCheck(s.board,s.turn)});
  if(n.result?.text.includes('重复'))repetition=repetitionDetail(s,n,checks);s=n;
 }
 if(g.plies!==undefined)assert.equal(g.plies,s.ply,'plies');
 let category='pending';
 if(g.result?.technicalForfeit){category='technical-failure';assert(!s.result,'technical result overwrites terminal rule result');assert(['decided','unresolved'].includes(g.result.status));const expected=g.result.offender==='setup'?null:g.result.offender==='candidate'?other(g.candidateSide):g.result.offender==='opponent'?g.candidateSide:undefined;assert.notEqual(expected,undefined,'unknown offender');assert.equal(g.result.winner,expected);assert.equal(g.result.status,expected===null?'unresolved':'decided');}
 else if(g.result){let expected;if(s.result?.winner){category=repetition?'repetition':'normal-decisive';expected={status:'decided',winner:s.result.winner,technicalForfeit:false,reason:s.result.text};}else if(s.quiet>=120){category='draw';expected={status:'draw',winner:null,technicalForfeit:false,reason:'120-quiet-plies'};}else{assert(s.ply>=400,'unresolved before cap');category='unresolved';expected={status:'unresolved',winner:null,technicalForfeit:false,reason:'400-ply-cap'};}assert.deepEqual(g.result,expected,'result');}
 else assert(!s.result,'terminal game missing result');
 return {index:g.index,group:g.group,seed:g.seed,candidateSide:g.candidateSide,layoutSha256,plies:s.ply,privateCaptures,category,result:g.result??null,cleanupErrors:g.cleanupErrors??[],repetition,passed:true};
}
export function audit(data){
 assert(Array.isArray(data.games));const seen=new Set(),games=[];
 for(const g of data.games){try{assert(!seen.has(g.index),'duplicate game index');seen.add(g.index);if(data.tasks){assert(data.tasks[g.index],'unknown task');for(const [k,v] of Object.entries(data.tasks[g.index]))assert.deepEqual(g[k],v,`task ${k}`);}const init=data.initials?.find(x=>x.seed===g.seed);if(data.initials)assert(init,'missing initial layout');games.push(auditGame(g,init?.layoutSha256));}catch(e){games.push({index:g.index,group:g.group,passed:false,error:e.message,result:g.result??null});}}
 const categories={};for(const g of games)if(g.passed)categories[g.category]=(categories[g.category]??0)+1;
 return {schemaVersion:1,passed:games.every(g=>g.passed),complete:!!data.completedAt&&data.tasks?.length===games.length&&games.every(g=>g.passed&&g.result),expectedGames:data.tasks?.length??null,auditedGames:games.length,categories,limitations:[limitation,'Replay checks recorded observations against deterministic referee truth, not unrecorded engine memory or actual IPC traffic. Technical failures remain separate, not normal wins.'],games};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2);if(!input)throw Error('Usage: node native/experiments/jqe-followup/audit.mjs INPUT.json [OUTPUT.json]');const raw=fs.readFileSync(input);const report={inputSha256:hash(raw),...audit(JSON.parse(raw))};const json=JSON.stringify(report,null,2)+'\n';if(output)fs.writeFileSync(output,json);else process.stdout.write(json);if(!report.passed)process.exitCode=1;
}
