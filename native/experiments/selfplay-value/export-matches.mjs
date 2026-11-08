// These are synthetic per-player observations, not private human games.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {initial,positionKey,legalMoves,move,other} from '../../../engine.js';import {seeded} from '../../../ai.js';
import {lawfulView,refereeResult,plan} from './data.mjs';import {hash,sha,cache,dir} from './build.mjs';
import {assertObservation,observationToken,fen} from '../search-speed/pika.mjs';
const r=JSON.parse(fs.readFileSync(cache+'/matches.json'));assert(r.completedAt&&r.games.length===r.tasks.length&&r.games.every(g=>g.result));for(const [file,value]of Object.entries(r.hashes))assert.equal(hash(file),value,file);
const expected=[];for(const [i,seed]of plan.matches.seeds.entries())for(const candidateSide of['r','b'])for(const group of i%2?['controlPika','candidatePika','internal']:['internal','candidatePika','controlPika'])expected.push({seed,candidateSide,group,kind:group==='internal'?'stable':'pika',candidateName:group==='controlPika'?'control':'candidate'});
assert.deepEqual(r.tasks,expected);assert.equal(r.games.length,plan.matches.totalGames);assert.deepEqual(r.games.map(g=>g.index).sort((a,b)=>a-b),expected.map((_,i)=>i));for(const g of r.games){for(const [k,v]of Object.entries(expected[g.index]))assert.equal(g[k],v,k);assert(g.finishedAt);}
const count=xs=>({wins:xs.filter(g=>g.result.winner===g.candidateSide).length,draws:xs.filter(g=>g.result.status==='draw').length,losses:xs.filter(g=>g.result.winner&&g.result.winner!==g.candidateSide).length});
for(const group of['internal','candidatePika','controlPika']){const a=r.games.filter(g=>g.group===group),decided=a.filter(g=>g.result.status!=='unresolved'),c=count(decided);assert.deepEqual(r.summary[group],{finished:a.length,...c,technicalFailures:a.filter(g=>g.result.technicalForfeit).length,unresolved:a.length-decided.length,scoreRate:a.length===decided.length&&a.length?(c.wins+.5*c.draws)/a.length:null,normal:count(decided.filter(g=>!g.result.technicalForfeit))});}
let moves=0,privateCaptureChecks=0,repetitionLosses=0,technicalFailures=0;
for(const g of r.games){
 let s=initial(seeded(g.seed));s.positions=[positionKey(s)];assert.equal(sha(JSON.stringify(s.board)),r.initials.find(x=>x.seed===g.seed).layoutSha256);const pikaSide=other(g.candidateSide);
 for(const [index,row]of g.log.entries()){
  assert(!s.result);const view=assertObservation(lawfulView(s,s.turn));assert.equal(row.ply,s.ply+1);assert.equal(row.side,s.turn);assert.equal(row.viewSha256,sha(JSON.stringify(view)));assert.equal(row.visibleFen,fen(view));
  if(!row.applied){assert.equal(index,g.log.length-1);assert(g.result.technicalForfeit);continue;}
  assert(legalMoves(view).some(m=>m.from===row.move.from&&m.to===row.move.to));assert(row.elapsedMs<=r.budgetMs+r.graceMs);assert(row.threads<=4);
  const p=s.board[row.move.from],q=s.board[row.move.to],n=move(s,row.move);assert.equal(row.revealed,p.hidden?n.board[row.move.to].type:null);assert.deepEqual(row.capturedPublic,q?{side:q.side,hidden:q.hidden,...(!q.hidden?{type:q.type}:{})}:null);assert.equal(row.afterSha256,sha(JSON.stringify(n.board)));
  if(g.kind==='pika'){const token=observationToken(lawfulView(s,pikaSide),row.move,lawfulView(n,pikaSide),pikaSide);assert.equal(row.pikaToken,token);if(q?.hidden){assert.equal(token.at(-1)==='X',p.side!==pikaSide);privateCaptureChecks++;}}
  moves++;s=n;
 }
 assert.equal(s.ply,g.plies);if(g.result.technicalForfeit)technicalFailures++;else{const derived=refereeResult(s);assert(derived);assert.equal(derived.status,g.result.status);assert.equal(derived.winner,g.result.winner);if(derived.reason==='third-public-repetition')repetitionLosses++;}
}
const root=process.cwd(),clean=x=>typeof x==='string'?x.replaceAll(root+'/', '').replaceAll(root,'<repo>'):Array.isArray(x)?x.map(clean):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[clean(k),clean(v)])):x;
const pub=clean({...r,observationEvidence:'Synthetic referee seeds and lawful per-player observations. FEN, capture tokens and clock.position can contain that player\'s legitimately known private captures. These were not shared with the opposing player; raw hidden identities are not model inputs. No user games or user personal data.'});
fs.writeFileSync(dir+'/matches.json',JSON.stringify(pub)+'\n');const report={passed:true,games:r.games.length,moves,privateCaptureChecks,repetitionLosses,technicalFailures,matchesSha256:hash(dir+'/matches.json')};fs.writeFileSync(dir+'/replay.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
