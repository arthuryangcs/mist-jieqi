// Pure adapter tests: no external engine, download or match is started.
import test from 'node:test';import assert from 'node:assert/strict';
import {initial,publicState,move,legalMoves,other} from '../engine.js';import {seeded} from '../ai.js';
import {canonical,canonicalFen,mapMove,observationToken} from '../native/experiments/cluster-tt/pika.mjs';
function mirror(v){v=structuredClone(v);v.board.reverse();for(const p of [...v.board,...v.captured])if(p){p.side=other(p.side);if(p.capturedBy)p.capturedBy=other(p.capturedBy);}v.turn=other(v.turn);v.viewer=other(v.viewer);return v;}
test('固定Pika规范视角：换色镜像输入相同、走法可逆',()=>{
 let s=initial(seeded(2026103011));for(let i=0;i<20&&!s.result;i++){for(const viewer of ['r','b']){const v=publicState(s,viewer),m=mirror(v);assert.equal(canonicalFen(v),canonicalFen(m));assert.deepEqual(canonical(v).board,canonical(m).board);for(const x of legalMoves(v))assert.deepEqual(mapMove(mapMove(x,viewer),viewer),x);}s=move(s,legalMoves(s)[i%legalMoves(s).length]);}
});
test('规范视角暗俘只给吃子方，未知真身扰动不改变历史token，拒绝裁判暗子',()=>{
 let s=initial(seeded(2026102919));for(const m of [{from:64,to:1},{from:25,to:88}]){const n=move(s,m);assert(s.board[m.to]?.hidden);for(const viewer of ['r','b']){const before=publicState(s,viewer),after=publicState(n,viewer),token=observationToken(before,m,after,viewer);assert.equal(token.length,6);if(viewer===s.turn){assert.match(token[5],/^[rnbacp]$/);}else{assert.equal(token[5],'X');const changed=structuredClone(n);changed.captured.at(-1).type=changed.captured.at(-1).type==='R'?'P':'R';assert.equal(token,observationToken(before,m,publicState(changed,viewer),viewer));}}s=n;}
 assert.throws(()=>canonical(initial(),'r'));
});
test('规范坐标从黑方开始时，FEN整步计数跟随变换后的历史递增',()=>{
 let s=initial(seeded(2026103013));assert.equal(canonicalFen(publicState(s,'b')).split(' ').at(-1),'1');s=move(s,legalMoves(s)[0]);assert.equal(canonicalFen(publicState(s,'b')).split(' ').at(-1),'2');s=move(s,legalMoves(s)[0]);assert.equal(canonicalFen(publicState(s,'b')).split(' ').at(-1),'2');s=move(s,legalMoves(s)[0]);assert.equal(canonicalFen(publicState(s,'b')).split(' ').at(-1),'3');
});
