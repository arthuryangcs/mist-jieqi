import assert from 'node:assert/strict';
import {legalMoves,move,rootRules,positionKey,readPositionKey} from '../../../engine.js';
// The proof consumes shared public board/history only. It never reads worlds,
// private captures, referee seed, or the identity of an unrevealed piece.
export function shared(view){
 assert(!view.board.some(p=>p?.hidden&&'type'in p),'Hidden truth rejected');
 assert(!(view.captured??[]).some(p=>p.hidden&&'type'in p),'Private hidden capture truth rejected');
 return {board:structuredClone(view.board),turn:view.turn,positions:[...(view.positions??[])],quiet:view.quiet??0,ply:view.ply??0,captured:[],viewer:null,result:null};
}
export function ruleReplyLosses(view,entries){
 const s=shared(view),history=s.positions;if(history.length<12||history.at(-1)!==positionKey(s)||history.some(k=>!readPositionKey(k)))return[];
 const roots=entries??legalMoves(s).map(m=>({...m,...rootRules(s,m)})),proofs=[];
 for(const r of roots){
  // A reversible result must already occur twice before a third full cycle
  // can finish one reply later. Irreversible/uncertain reveals cannot qualify.
  if(r.count<2||r.loss||r.win||r.draw||s.board[r.from]?.hidden||s.board[r.to])continue;
  const after=move(s,r);if(after.result)continue;
  for(const reply of legalMoves(after)){
   if(after.board[reply.from].hidden||after.board[reply.to])continue;
   const rule=rootRules(after,reply);if(!rule.win)continue;
   const end=move(after,reply),e=end.adjudication;
   if(e?.status!=='loss'||e.reason!=='perpetual-check'||e.loser!==s.turn||end.result?.winner!==after.turn)continue;
   proofs.push({from:r.from,to:r.to,reply,loser:e.loser,winner:after.turn,plies:2,evidence:e});break;
  }
 }
 return proofs;
}
