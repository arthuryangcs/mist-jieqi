import fs from'node:fs';import assert from'node:assert/strict';
import{initial,publicState,legalMoves,move,positionKey,other}from'../engine.js';import{seeded}from'../ai.js';import{dir,sha}from'./frontier-variants.mjs';
const variant=process.argv[2]||'combined',stage=process.argv[3]||'screen',label=process.env.FOCUS_MATCH_LABEL||'production',file=`${dir}/matches-${variant}-${stage}-${label}.json`,r=JSON.parse(fs.readFileSync(file));
assert.equal(r.games.length,r.seeds.length*2);for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(sha(fs.readFileSync(p)),h,p);for(const b of r.builds){assert.equal(sha(fs.readFileSync(b.binary)),b.binarySha256);assert.equal(sha(fs.readFileSync(`${dir}/sources/${b.sourceSha256}.cpp`)),b.sourceSha256);}
assert.equal(r.builds[0].sourceSha256,'73de0d5768fbedd97d46305891a0513f95c7a856aa5aba8edff8a92e2d1798d0');assert.equal(r.builds[0].binarySha256,'2304327e3cb91987780ab453fa98db5e17383d32c4c39009649092ee9f14c49b');
let played=0,darkCaptures=0,focusedMoves=0;const pairs=new Set();
for(const g of r.games){
 const id=`${g.seed}/${g.trialSide}`;assert(!pairs.has(id));pairs.add(id);let s=initial(seeded(g.seed));s.positions=[positionKey(s)];assert.deepEqual(s.board,r.initials.find(x=>x.seed===g.seed).board);
 for(const[i,row]of g.log.entries()){
  const view=publicState(s,s.turn);assert.equal(sha(JSON.stringify(view)),row.viewSha256);assert.equal(row.ply,s.ply+1);assert.equal(row.side,s.turn);assert.equal(row.engine,s.turn===g.trialSide?'trial':'baseline');for(const p of[...view.board,...view.captured])assert(!p?.hidden||!('type'in p));for(const p of view.captured)if(p.wasHidden){assert.equal(p.capturedBy,view.viewer);assert.notEqual(p.side,view.viewer);}
  const ms=legalMoves(view),legal=ms.some(m=>m.from===row.move?.from&&m.to===row.move?.to);
  if(g.result.technicalForfeit&&i===g.log.length-1&&['technical-timeout','illegal-move'].includes(g.result.reason)){if(g.result.reason==='technical-timeout'){assert(legal);assert(row.elapsedMs>r.budgetMs+r.graceMs);}else assert(!legal);assert.equal(g.result.winner,other(s.turn));break;}
  assert(legal);assert(row.elapsedMs<=r.budgetMs+r.graceMs);assert.equal(row.rootCount,ms.length);assert(row.fullRootDepth<=row.depth);if(row.depth)assert(row.comparedCount>=Math.min(2,ms.length));assert(row.comparedCount<=row.rootCount);
  if(row.engine==='trial'&&row.depth&&variant!=='cap'){assert(row.comparedCount>=Math.min(ms.length,Math.max(2,Math.ceil(ms.length/4))));assert(row.depth<=3||row.fullRootDepth>=row.depth-1);}if(row.searchScope==='focused-root'){focusedMoves++;assert(row.comparedCount<row.rootCount);assert.equal(row.engine,'trial');}else if(row.depth)assert.equal(row.comparedCount,row.rootCount);
  const p=s.board[row.move.from],q=s.board[row.move.to],n=move(s,row.move);assert.deepEqual(row.captured,q);assert.equal(row.revealed,p.hidden?n.board[row.move.to].type:null);assert.equal(row.afterSha256,sha(JSON.stringify(n.board)));if(q?.hidden)darkCaptures++;s=n;played++;
 }
 assert.deepEqual(s,g.finalState);if(!g.result.technicalForfeit){if(s.result?.winner){assert.equal(g.result.winner,s.result.winner);assert.equal(legalMoves(s).length,0);}else if(s.ply>=r.maxPlies)assert.equal(g.result.status,'unresolved');else{assert.equal(g.result.status,'draw');assert(s.quiet>=120||s.positions.filter(k=>k===positionKey(s)).length>=3);}}
}
const wins=r.games.filter(g=>g.result.winner===g.trialSide).length,draws=r.games.filter(g=>g.result.status==='draw').length,unresolved=r.games.filter(g=>g.result.status==='unresolved').length;
assert.equal(r.summary.wins,wins);assert.equal(r.summary.draws,draws);assert.equal(r.summary.unresolved,unresolved);assert.equal(r.summary.losses,r.games.length-wins-draws-unresolved);
const out={passed:true,verifiedAt:new Date().toISOString(),matchSha256:sha(fs.readFileSync(file)),variant,stage,games:r.games.length,played,darkCaptures,focusedMoves,summary:r.summary};fs.writeFileSync(`${dir}/verification-${variant}-${stage}-${label}.json`,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
