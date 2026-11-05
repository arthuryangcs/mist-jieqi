// Reconstruct only self-generated synthetic games; never start an engine.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {initial,publicState,positionKey,legalMoves,move,other} from '../../../engine.js';import {seeded} from '../../../ai.js';
import {observationToken,assertObservation,fen} from './pika.mjs';
const file=process.argv[2]||'benchmarks/search-speed/deferred-2026-11-05/matches.json',r=JSON.parse(fs.readFileSync(file)),sha=x=>createHash('sha256').update(x).digest('hex'),digest=x=>sha(JSON.stringify(x));
assert.equal(r.refereePolicy,'cn2020-evidence-v1');assert.equal(r.completeCompetitionRules,false);
for(const[name,expected]of Object.entries(r.refereeSourceHashes)){assert.equal(sha(fs.readFileSync(new URL('../../../'+name,import.meta.url))),expected,'use the recorded referee source, never silently rescore old games');}
let moves=0,privateChecks=0;
for(const g of r.games){let s=initial(seeded(g.seed));s.positions=[positionKey(s)];assert.equal(digest(s.board),r.initials.find(x=>x.seed===g.seed).layoutSha256);
 for(const row of g.log){const v=assertObservation(publicState(s,s.turn));assert.equal(row.ply,s.ply+1);assert.equal(row.side,s.turn);assert.equal(row.viewSha256,digest(v));assert.equal(row.visibleFen,fen(v));if(!row.applied)continue;assert(!s.result);assert(legalMoves(s).some(m=>m.from===row.move.from&&m.to===row.move.to));const p=s.board[row.move.from],q=s.board[row.move.to],next=move(s,row.move);assert.equal(row.revealed,p.hidden?next.board[row.move.to].type:null);assert.equal(row.afterSha256,digest(next.board));if(q?.hidden)assert(!('type'in row.captured));
  if(g.kind==='pika'){const viewer=other(g.candidateSide),token=observationToken(publicState(s,viewer),row.move,publicState(next,viewer),viewer);assert.equal(token,row.pikaToken);if(q?.hidden){assert.equal(token.at(-1)==='X',s.turn!==viewer);privateChecks++;}}
  s=next;moves++;
 }
 assert.equal(s.ply,g.plies);assert.equal(positionKey(s),g.finalPublicPosition);
 if(!g.result.technicalForfeit){if(g.result.status==='decided')assert.equal(s.result?.winner,g.result.winner);else if(g.result.reason==='cn2020-complex-cycle-needs-referee')assert.equal(s.repetition?.kind,'manual-review');else if(g.result.reason==='400-ply-safety-cap')assert(s.ply>=400);else assert(s.result?.winner===null);}
}
console.log(JSON.stringify({passed:true,games:r.games.length,moves,privateChecks,refereePolicy:r.refereePolicy,completeCompetitionRules:false}));
