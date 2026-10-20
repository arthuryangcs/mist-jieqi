import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,publicState} from '../engine.js';
import {syncObservedMove} from '../editor.js';
import {validateRequest} from '../native/server.mjs';

const start=viewer=>publicState(initial(()=>.5),viewer);
test('辅助盘揭子必须手动填写，取消和缺少身份不会修改原局面',()=>{
 const s=start('r'),before=structuredClone(s),m={from:54,to:45};
 assert.throws(()=>syncObservedMove(s,m),/实际揭开/);assert.deepEqual(s,before);
 const n=syncObservedMove(s,m,{revealed:'R'});assert.equal(n.board[45].type,'R');assert.equal(n.turn,'b');assert.equal(n.ply,1);assert.deepEqual(s,before);
});
test('辅助盘填写暗俘时，只向吃子方保留身份',()=>{
 const s=start('r'),m={from:64,to:1};
 const n=syncObservedMove(s,m,{revealed:'C',captured:'N'});assert.equal(n.board[1].type,'C');assert.equal(n.captured[0].type,'N');assert.equal(n.captured[0].wasHidden,true);
 assert(!('type'in publicState(n,'b').captured[0]));
});
test('辅助盘被吃暗子可留空作为未知，移动暗子仍必须填写实际身份',()=>{
 const s=start('r'),m={from:64,to:1};assert.throws(()=>syncObservedMove(s,m,{captured:'N'}),/实际揭开/);
 const n=syncObservedMove(s,m,{revealed:'C'});assert.equal(n.board[1].type,'C');assert.equal(n.captured[0].hidden,true);assert.equal(n.captured[0].capturedBy,'r');assert(!('type'in n.captured[0]));
 assert.throws(()=>syncObservedMove(s,m,{revealed:'C',captured:'K'}),/仅接受/);
 const checked=validateRequest({token:'unknown-capture-123',timeMs:1000,view:n});assert.equal(checked.view.captured[0].hidden,true);assert(!('type'in checked.view.captured[0]));
});
test('辅助盘对手吃己方暗子无需也不接受身份，未知库存仍包含它',()=>{
 const a=syncObservedMove(start('r'),{from:64,to:1},{revealed:'C',captured:'N'});
 const n=syncObservedMove(a,{from:25,to:88},{revealed:'R',captured:'P'});
 assert.equal(n.board[88].type,'R');assert.equal(n.captured[1].hidden,true);assert(!('type'in n.captured[1]));
});
test('辅助盘拒绝非法着法和超额身份，不改变输入',()=>{
 const s=start('b');assert.throws(()=>syncObservedMove(s,{from:54,to:46},{revealed:'R'}),/不合法/);
 assert.throws(()=>syncObservedMove(s,{from:54,to:45},{revealed:'K'}),/实际揭开/);
 const a=syncObservedMove(start('r'),{from:54,to:45},{revealed:'R'});
 const b=syncObservedMove(a,{from:27,to:36},{revealed:'P'});
 const c=syncObservedMove(b,{from:56,to:47},{revealed:'R'});
 const d=syncObservedMove(c,{from:29,to:38},{revealed:'P'});
 assert.throws(()=>syncObservedMove(d,{from:58,to:49},{revealed:'R'}),/超过初始数量/);
});
test('辅助盘同步后的真实观察可通过C++服务公开信息校验，裁定历史保留',()=>{
 const a=syncObservedMove(start('r'),{from:64,to:1},{revealed:'C',captured:'N'});
 const b=syncObservedMove(a,{from:25,to:88},{revealed:'R'});
 const checked=validateRequest({token:'sync-test-123',timeMs:1000,view:b});
 assert.deepEqual(checked.view.board,b.board);assert.equal(checked.view.ply,2);assert.equal(checked.view.positions.length,3);
 assert.equal(checked.view.captured[0].wasHidden,true);assert(!('type'in checked.view.captured[1]));
});
