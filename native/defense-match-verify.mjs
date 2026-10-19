import fs from 'node:fs';import assert from 'node:assert/strict';
import {initial,publicState,legalMoves,move,positionKey,other} from '../engine.js';
import {seeded} from '../ai.js';import {dir,sha} from './defense-variants.mjs';
const stage=process.argv[2]||'screen',file=`${dir}/matches-${stage}.json`,r=JSON.parse(fs.readFileSync(file));
for(const [p,h]of Object.entries(r.sourceHashes))assert.equal(sha(fs.readFileSync(p)),h,'Frozen match source changed: '+p);
for(const b of r.builds){assert.equal(sha(fs.readFileSync(b.binary)),b.binarySha256);assert.equal(sha(fs.readFileSync(`${dir}/sources/${b.sourceSha256}.cpp`)),b.sourceSha256);}
assert.equal(r.games.length,r.seeds.length*2);let played=0,darkCaptures=0;const pairs=new Set();
for(const g of r.games){
 const id=`${g.seed}/${g.trialSide}`;assert(!pairs.has(id));pairs.add(id);let s=initial(seeded(g.seed));s.positions=[positionKey(s)];assert.deepEqual(s.board,r.initials.find(x=>x.seed===g.seed).board);
 for(const [i,row]of g.log.entries()){
  const view=publicState(s,s.turn);assert.equal(sha(JSON.stringify(view)),row.viewSha256);for(const p of [...view.board,...view.captured])assert(!p?.hidden||!('type'in p));
  for(const p of view.captured)if(p.wasHidden){assert.equal(p.capturedBy,view.viewer);assert.notEqual(p.side,view.viewer);}
  assert.equal(row.ply,s.ply+1);assert.equal(row.side,s.turn);assert.equal(row.engine,s.turn===g.trialSide?'trial':'baseline');
  const legal=legalMoves(view).some(m=>m.from===row.move?.from&&m.to===row.move?.to);
  if(g.result.technicalForfeit&&i===g.log.length-1){if(g.result.reason==='technical-timeout'){assert(legal);assert(row.elapsedMs>r.budgetMs+r.graceMs);}else if(g.result.reason==='illegal-move')assert(!legal);assert.equal(g.result.winner,other(s.turn));break;}
  assert(legal);assert(row.elapsedMs<=r.budgetMs+r.graceMs);const p=s.board[row.move.from],q=s.board[row.move.to],next=move(s,row.move);
  assert.deepEqual(row.captured,q);assert.equal(row.revealed,p.hidden?next.board[row.move.to].type:null);assert.equal(row.afterSha256,sha(JSON.stringify(next.board)));if(q?.hidden)darkCaptures++;s=next;played++;
 }
 assert.deepEqual(s,g.finalState);
 if(!g.result.technicalForfeit){
  if(s.result?.winner){assert.equal(g.result.winner,s.result.winner);assert.equal(g.result.status,'decided');assert.equal(legalMoves(s).length,0);}
  else if(s.ply>=r.maxPlies)assert.equal(g.result.status,'unresolved');else {assert.equal(g.result.status,'draw');assert(s.quiet>=120||s.positions.filter(k=>k===positionKey(s)).length>=3);}
 }
}
const wins=r.games.filter(g=>g.result.winner===g.trialSide).length,draws=r.games.filter(g=>g.result.status==='draw').length,unresolved=r.games.filter(g=>g.result.status==='unresolved').length;
assert.equal(r.summary.wins,wins);assert.equal(r.summary.draws,draws);assert.equal(r.summary.unresolved,unresolved);assert.equal(r.summary.losses,r.games.length-wins-draws-unresolved);
const result={passed:true,verifiedAt:new Date().toISOString(),matchSha256:sha(fs.readFileSync(file)),games:r.games.length,played,darkCaptures,summary:r.summary};
fs.writeFileSync(`${dir}/verification-${stage}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
