import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initial,publicState,legalMoves,move,positionKey,other,inCheck} from '../engine.js';
import {seeded} from '../ai.js';
const file='benchmarks/quiet-checks/matches.json',r=JSON.parse(fs.readFileSync(file));
const sha=x=>createHash('sha256').update(x).digest('hex');
let played=0,darkCaptures=0;
assert.equal(r.games.length,r.seeds.length*2);
const pairs=new Set();
for(const g of r.games){
  const id=`${g.seed}/${g.trialSide}`;assert(!pairs.has(id));pairs.add(id);
  let s=initial(seeded(g.seed));s.positions=[positionKey(s)];assert.deepEqual(s.board,r.initials.find(x=>x.seed===g.seed).board);
  for(const [i,row] of g.log.entries()){
    const v=publicState(s,s.turn);assert.equal(sha(JSON.stringify(v)),row.viewSha256);
    for(const p of [...v.board,...v.captured])assert(!p?.hidden||!('type'in p));
    assert.equal(row.side,s.turn);assert.equal(row.ply,s.ply+1);assert.equal(row.engine,s.turn===g.trialSide?'trial':'baseline');
    const legal=legalMoves(v).some(m=>m.from===row.move?.from&&m.to===row.move?.to);
    if(g.result.technicalForfeit&&i===g.log.length-1){
      if(g.result.reason==='technical-timeout'){assert(legal);assert(row.elapsedMs>r.budgetMs+r.graceMs);}
      else if(g.result.reason==='illegal-move')assert(!legal);
      assert.equal(g.result.winner,other(s.turn));break;
    }
    assert(legal);assert(row.elapsedMs<=r.budgetMs+r.graceMs);
    const p=s.board[row.move.from],q=s.board[row.move.to],n=move(s,row.move);
    assert.deepEqual(row.captured,q);assert.equal(row.revealed,p.hidden?n.board[row.move.to].type:null);
    assert.equal(row.afterSha256,sha(JSON.stringify(n.board)));if(q?.hidden)darkCaptures++;
    s=n;played++;
  }
  assert.deepEqual(s,g.finalState);
  if(!g.result.technicalForfeit){
    if(s.result?.winner){assert.equal(g.result.winner,s.result.winner);assert.equal(g.result.status,'decided');assert.equal(legalMoves(s).length,0);}
    else if(s.ply>=r.maxPlies)assert.equal(g.result.status,'unresolved');
    else{assert.equal(g.result.status,'draw');assert(s.quiet>=120||s.positions.filter(k=>k===positionKey(s)).length>=3);}
  }
}
const wins=r.games.filter(g=>g.result.winner===g.trialSide).length;
const draws=r.games.filter(g=>g.result.status==='draw').length;
const unresolved=r.games.filter(g=>g.result.status==='unresolved').length;
assert.equal(r.summary.wins,wins);assert.equal(r.summary.draws,draws);assert.equal(r.summary.unresolved,unresolved);
assert.equal(r.summary.losses,r.games.length-wins-draws-unresolved);
const output={passed:true,verifiedAt:new Date().toISOString(),matchSha256:sha(fs.readFileSync(file)),games:r.games.length,played,darkCaptures,summary:r.summary};
fs.writeFileSync('benchmarks/quiet-checks/match-verification.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
