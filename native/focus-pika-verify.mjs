import fs from'node:fs';import assert from'node:assert/strict';
import{initial,publicState,legalMoves,move,other,positionKey}from'../engine.js';import{seeded}from'../ai.js';import{fen,observationToken}from'../scripts/external-engine.js';import{dir,sha}from'./focus-variants.mjs';
const variant=process.argv[2]||'both',file=`${dir}/pika-${variant}.json`,r=JSON.parse(fs.readFileSync(file));assert.equal(r.games.length,16);
for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(sha(fs.readFileSync(p)),h,p);for(const b of r.builds){assert.equal(sha(fs.readFileSync(b.binary)),b.binarySha256);assert.equal(sha(fs.readFileSync(`${dir}/sources/${b.sourceSha256}.cpp`)),b.sourceSha256);}
assert.equal(r.builds[0].binarySha256,'2304327e3cb91987780ab453fa98db5e17383d32c4c39009649092ee9f14c49b');
let played=0,darkCaptures=0,focusedMoves=0;const ids=new Set();
for(const g of r.games){
 const id=`${g.engine}/${g.seed}/${g.candidateSide}`;assert(!ids.has(id));ids.add(id);let s=initial(seeded(g.seed));s.positions=[positionKey(s)];assert.deepEqual(s.board,r.initials.find(x=>x.seed===g.seed).trueInitialBoard);const pikaSide=other(g.candidateSide);
 for(const[i,row]of g.log.entries()){
  assert.equal(row.ply,s.ply+1);assert.equal(row.side,s.turn);assert.equal(row.engine,s.turn===g.candidateSide?'candidate':'pika');const view=publicState(s,s.turn);assert.equal(row.viewSha256,sha(JSON.stringify(view)));assert.equal(row.visibleFen,fen(view));for(const p of[...view.board,...view.captured])assert(!p?.hidden||!('type'in p));for(const p of view.captured)if(p.wasHidden){assert.equal(p.capturedBy,view.viewer);assert.notEqual(p.side,view.viewer);}
  const ms=legalMoves(view),legal=ms.some(m=>m.from===row.move?.from&&m.to===row.move?.to);
  if(g.result.technicalForfeit&&i===g.log.length-1&&['illegal-move','technical-timeout'].includes(g.result.reason)){if(g.result.reason==='technical-timeout'){assert(legal);assert(row.elapsedMs>r.budgetMs+r.graceMs);}else assert(!legal);assert.equal(g.result.winner,other(s.turn));break;}
  assert(legal);assert(row.elapsedMs<=r.budgetMs+r.graceMs);
  if(row.engine==='candidate'&&g.engine==='trial'&&row.depth){assert.equal(row.rootCount,ms.length);assert(row.comparedCount>=Math.min(2,ms.length));assert(row.comparedCount<=ms.length);assert(row.fullRootDepth<=row.depth);if(row.searchScope==='focused-root'){assert(row.comparedCount<ms.length);focusedMoves++;}}
  const p=s.board[row.move.from],q=s.board[row.move.to],n=move(s,row.move);assert.equal(row.revealed,p.hidden?n.board[row.move.to].type:null);assert.deepEqual(row.captured,q);assert.equal(row.pikaToken,observationToken(s,row.move,n,pikaSide));assert.equal(row.pikaToken.length,6);if(!(q?.hidden&&s.turn===pikaSide))assert.equal(row.pikaToken[5],'X');assert.equal(row.afterSha256,sha(JSON.stringify(n.board)));if(q?.hidden)darkCaptures++;s=n;played++;
 }
 assert.deepEqual(s,g.finalState);if(!g.result.technicalForfeit){if(s.result?.winner){assert.equal(g.result.winner,s.result.winner);assert.equal(legalMoves(s).length,0);}else if(s.ply>=400)assert.equal(g.result.status,'unresolved');else{assert.equal(g.result.status,'draw');assert(s.quiet>=120||s.positions.filter(p=>p===positionKey(s)).length>=3);}}
}
for(const seed of r.seeds)for(const engine of['baseline','trial'])assert.deepEqual(r.games.filter(g=>g.seed===seed&&g.engine===engine).map(g=>g.candidateSide).sort(),['b','r']);
const stat=gs=>{const wins=gs.filter(g=>g.result.winner===g.candidateSide).length,draws=gs.filter(g=>g.result.status==='draw').length,unresolved=gs.filter(g=>g.result.status==='unresolved').length;return{games:gs.length,wins,draws,losses:gs.length-wins-draws-unresolved,unresolved,scoreRate:unresolved?null:(wins+.5*draws)/gs.length};};
const summaries={},timing={},pairs=[];
for(const engine of['baseline','trial']){
 const gs=r.games.filter(g=>g.engine===engine);summaries[engine]=stat(gs);for(const[k,v]of Object.entries(summaries[engine]))assert.equal(r.summary[engine][k],v);
 timing[engine]={};for(const actor of['candidate','pika']){const xs=gs.flatMap(g=>g.log).filter(x=>x.engine===actor),ms=xs.map(x=>x.elapsedMs).sort((a,b)=>a-b);timing[engine][actor]={attempts:xs.length,medianMs:(ms[(ms.length-1)>>1]+ms[ms.length>>1])/2,p95Ms:ms[Math.floor((ms.length-1)*.95)],maxMs:ms.at(-1),hostStops:xs.filter(x=>x.deadlineStop).length,fallbacks:xs.filter(x=>x.fallbackUsed).length,overGrace:ms.filter(x=>x>r.budgetMs+r.graceMs).length};}
}
for(const seed of r.seeds)pairs.push({seed,...Object.fromEntries(['baseline','trial'].map(engine=>[engine,r.games.filter(g=>g.seed===seed&&g.engine===engine).reduce((a,g)=>a+(g.result.winner===g.candidateSide?1:g.result.status==='draw'?.5:0),0)]))});
const faults={timeouts:r.games.filter(g=>g.result.reason==='technical-timeout').length,illegalMoves:r.games.filter(g=>g.result.reason==='illegal-move').length,protocolOrProcess:r.games.filter(g=>g.result.reason==='process-or-protocol-failure').length,unresolved:r.games.filter(g=>g.result.status==='unresolved').length};
const out={passed:true,verifiedAt:new Date().toISOString(),variant,matchSha256:sha(fs.readFileSync(file)),played,darkCaptures,focusedMoves,summaries,timing,pairs,faults,limitation:'Four correlated layout pairs per implementation, one target build with known color asymmetry. No stable Elo or claim of exceeding Pika; all technical results retained.'};fs.writeFileSync(`${dir}/pika-${variant}-verification.json`,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({passed:true,played,darkCaptures,summaries,faults}));
