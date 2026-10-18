import test from 'node:test';import assert from 'node:assert/strict';
import {initial,publicState,inCheck,legalMoves,move} from '../engine.js';
import {inCheck as originalCheck,legalMoves as originalMoves} from '../benchmarks/reference-engine.js';
import {seeded} from '../scripts/diagnose.js';
test('优化将军检测与独立旧规则在240个可达局面逐项一致',()=>{let rng=seeded(817),s=initial(rng);for(let n=0;n<240;n++){for(let side of ['r','b'])assert.equal(inCheck(s.board,side),originalCheck(s.board,side));let ms=legalMoves(s),expected=originalMoves(s);const key=x=>x.from*90+x.to;assert.deepEqual(ms.map(key).sort((a,b)=>a-b),expected.map(key).sort((a,b)=>a-b));assert.equal(inCheck(publicState(s).board,s.turn),originalCheck(publicState(s).board,s.turn));if(s.result||!ms.length)s=initial(rng);else s=move(s,ms[Math.floor(rng()*ms.length)]);}});
