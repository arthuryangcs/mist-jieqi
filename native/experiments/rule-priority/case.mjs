import fs from 'node:fs';import assert from 'node:assert/strict';
import {initial,positionKey,move,legalMoves}from '../../../engine.js';
import {seeded}from '../../../ai.js';import {observation}from '../jqe-retest/audit.mjs';
import {context,key}from './selection.mjs';
export function counterexample(){
 const data=JSON.parse(fs.readFileSync('benchmarks/rule-reply-2026-11-24/matches.json')),g=data.games.find(g=>g.index===4);
 let s=initial(seeded(g.seed));s.positions=[positionKey(s)];
 for(const row of g.log){if(row.ply===185){const view=observation(s,s.turn),c=context(view);assert.equal(legalMoves(view).length,16);assert.equal(row.comparedCount,4);assert.deepEqual(row.move,{from:31,to:24});assert(c.losses.has(key(row.move)));return {view,row,proofs:c.proofs};}s=move(s,row.move);}
 throw Error('Counterexample missing');
}
