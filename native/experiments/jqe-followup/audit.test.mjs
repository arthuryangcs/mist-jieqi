import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {audit,auditGame,observation,repetitionDetail} from './audit.mjs';
import {initial,positionKey,move,legalMoves,publicState} from '../historical/referee.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../../../benchmarks/jqe/matches.json',import.meta.url)));
const clone=x=>structuredClone(x);
test('independent old 12-game replay preserves normal and repetition categories',()=>{
 const r=audit(data);assert(r.passed);assert(r.complete);assert.deepEqual(r.categories,{'normal-decisive':9,repetition:3});
 assert.deepEqual(r.games.filter(x=>x.repetition).map(x=>x.repetition.occurrencePlies),[[66,70,74],[41,45,49],[54,58,62]]);
 for(const g of r.games.filter(x=>x.repetition)){const r=g.repetition;assert(r.forcedRepetition);assert.equal(r.occurrences,3);assert.deepEqual(r.cycleLengths,[4,4]);assert.equal(r.lastCycle.length,4);assert(r.legalReplies.length);assert(r.legalReplies.every(x=>x.repetitionLoss));assert(r.lastMoveBySide.r&&r.lastMoveBySide.b);}
});
for(const [name,mutate] of [
 ['layout',g=>g.seed++],['observation hash',g=>g.log[0].viewSha256='invalid'],['FEN',g=>g.log[0].visibleFen='invalid'],
 ['move legality',g=>g.log[0].move={from:4,to:85}],['reveal',g=>g.log[0].revealed='K'],
 ['board hash',g=>g.log[0].afterSha256='invalid'],['public capture identity',g=>{const row=g.log.find(x=>x.capturedPublic?.hidden);row.capturedPublic.type='R';}],
 ['private Pika token',g=>g.log[0].pikaToken='a0a1XX'],['result',g=>g.result.winner=g.result.winner==='r'?'b':'r'],['ply',g=>g.plies++],
 ['post-terminal',g=>g.log.push(clone(g.log.at(-1)))],
])test(`rejects tampered ${name}`,()=>{const g=clone(data.games[1]);mutate(g);assert.throws(()=>auditGame(g));});
test('unfinished prefix remains pending, not draw or win',()=>{const g=clone(data.games[0]);g.log=g.log.slice(0,3);delete g.result;g.plies=3;assert.equal(auditGame(g).category,'pending');});
test('technical failed move stays unapplied and separate from normal outcomes',()=>{
 const g=clone(data.games[0]);g.log=g.log.slice(0,4);g.log[3].applied=false;g.plies=3;g.result={status:'decided',winner:'r',technicalForfeit:true,offender:'opponent',reason:'technical-timeout'};
 const r=auditGame(g);assert.equal(r.category,'technical-failure');assert.equal(r.plies,3);assert.equal(r.result.reason,'technical-timeout');
});
test('setup failure remains technical and unresolved',()=>{const g=clone(data.games[0]);g.log=[];g.plies=0;g.result={status:'unresolved',winner:null,technicalForfeit:true,offender:'setup',reason:'process-or-protocol-failure'};assert.equal(auditGame(g).result.status,'unresolved');});
test('cannot disguise a nonterminal prefix as cap-unresolved',()=>{const g=clone(data.games[0]);g.log=[];g.plies=0;g.result={status:'unresolved',winner:null,technicalForfeit:false,reason:'400-ply-cap'};assert.throws(()=>auditGame(g));});
test('duplicate indices fail and invalid results do not enter category totals',()=>{const d=clone(data);d.games=[d.games[0],d.games[0]];const r=audit(d);assert(!r.passed);assert.equal(r.games[1].passed,false);assert.equal(r.categories['normal-decisive'],1);assert(!r.complete);});
test('hidden captures are private only to captor, never public or victim',()=>{
 let s=initial(()=>0.5);s.positions=[positionKey(s)];s=move(s,{from:64,to:1});
 assert(s.captured[0].hidden);for(const viewer of [null,'r','b'])observation(s,viewer);
 assert.equal(publicState(s,'r').captured[0].type,s.captured[0].type);assert(!('type' in publicState(s,'b').captured[0]));assert(!('type' in publicState(s,null).captured[0]));
});
test('forced repetition differentiates avoidable synthetic final choices',()=>{
 const s=initial(()=>0.5),m=legalMoves(s)[0],key=positionKey(move(s,m,false));s.positions=[key,key];
 const n=move(s,m);assert(n.result.text.includes('重复'));const r=repetitionDetail(s,n,[{ply:1,side:'r',move:m,givesCheck:false}]);
 assert(!r.forcedRepetition);assert(r.legalReplies.some(x=>!x.repetitionLoss));assert(r.repetitionLosingMoves.some(x=>x.from===m.from&&x.to===m.to));
});
