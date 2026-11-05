// Replay a published synthetic ledger, without starting either engine.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initial,publicState,positionKey,legalMoves,move,other} from './legacy-engine-20261103.js';
import {seeded} from '../../../ai.js';
import {observationToken,assertObservation,fen} from './pika.mjs';
const input=process.argv[2]??'benchmarks/search-speed/matches.json',r=JSON.parse(fs.readFileSync(input)),sha=x=>createHash('sha256').update(x).digest('hex');
let moves=0,privateChecks=0;
for(const g of r.games){
 let s=initial(seeded(g.seed));s.positions=[positionKey(s)];assert.equal(sha(JSON.stringify(s.board)),r.initials.find(x=>x.seed===g.seed).layoutSha256);
 const pikaSide=other(g.candidateSide);
 for(const row of g.log){
  const v=assertObservation(publicState(s,s.turn));assert.equal(row.side,s.turn);assert.equal(row.ply,s.ply+1);assert.equal(row.viewSha256,sha(JSON.stringify(v)));assert.equal(row.visibleFen,fen(v));
  if(!row.applied)continue;
  assert(!s.result);assert(legalMoves(s).some(m=>m.from===row.move.from&&m.to===row.move.to));
  const p=s.board[row.move.from],q=s.board[row.move.to],n=move(s,row.move);
  assert.equal(row.revealed,p.hidden?n.board[row.move.to].type:null);assert.equal(row.afterSha256,sha(JSON.stringify(n.board)));
  if(g.kind==='pika'){
   const token=observationToken(publicState(s,pikaSide),row.move,publicState(n,pikaSide),pikaSide);assert.equal(token,row.pikaToken);
   if(q?.hidden){assert.equal(token.at(-1)==='X',p.side!==pikaSide);privateChecks++;}
  }
  moves++;s=n;
 }
 assert.equal(s.ply,g.plies);
 if(!g.result.technicalForfeit){if(g.result.status==='decided')assert.equal(s.result?.winner,g.result.winner);else if(g.result.status==='draw')assert(s.quiet>=120);else assert(s.ply>=400);}
}
console.log(JSON.stringify({passed:true,games:r.games.length,moves,privateChecks}));
