import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initial,publicState,legalMoves,move,TYPES} from '../engine.js';
import {analyze,balancedSamples,evaluate,revealOrderingValue,seeded} from '../ai.js';
const rotate=v=>({...v,viewer:v.viewer==='r'?'b':'r',turn:v.turn==='r'?'b':'r',board:[...v.board].reverse().map(p=>p?{...p,side:p.side==='r'?'b':'r'}:null),captured:v.captured.map(p=>({...p,side:p.side==='r'?'b':'r',...(p.capturedBy?{capturedBy:p.capturedBy==='r'?'b':'r'}:{})}))});

test('初始每个暗子在15个平衡样本中完整覆盖同一身份袋，5兵位没有额外先验',()=>{
 const view=publicState(initial(seeded(5)),'r'),worlds=balancedSamples(view,15,seeded(77));
 for(const side of ['r','b']){const expected=worlds.map(w=>w.board[side==='r'?54:27].type).sort();for(let i=0;i<90;i++)if(view.board[i]?.hidden&&view.board[i].side===side)assert.deepEqual(worlds.map(w=>w.board[i].type).sort(),expected);}
});
test('通用揭子排序不依赖暗子真身、原始兵位、手数或视角颜色',()=>{
 const view=publicState(initial(seeded(9)),'r'),changed=structuredClone(view);changed.ply=199;for(const p of changed.board)if(p?.hidden)p.type='R';
 const reversed=rotate(view);
 for(const m of legalMoves(view)){assert.equal(revealOrderingValue(view,m),revealOrderingValue(changed,m));assert(Math.abs(revealOrderingValue(view,m)-revealOrderingValue(reversed,{from:89-m.from,to:89-m.to}))<1e-9);}
});
test('揭子排序只影响访问顺序，完整根轮次每着搜索分与关闭排序一致',()=>{
 const v=publicState(initial(seeded(81)),'r'),opts={seed:77,samples:3,maxDepth:1,timeMs:100000};
 const scores=r=>r.allCandidates.map(m=>({from:m.from,to:m.to,score:m.score})).sort((a,b)=>a.from-b.from||a.to-b.to);
 assert.deepEqual(scores(analyze(v,opts)),scores(analyze(v,{...opts,features:{revealOrdering:false}})));
});
test('通用活动度估值对任意手数及红黑对称，暗子只按公开角色计算',()=>{
 let s=initial(seeded(33));for(let i=0;i<10;i++){const ms=legalMoves(s);s=move(s,ms[(i*7)%ms.length]);}
 const v=publicState(s,s.turn),r=rotate(v);v._config={mobility:true};r._config={mobility:true};
 assert(Math.abs(evaluate(v,'r')-evaluate(r,'b'))<1e-8);
 const changed=structuredClone(v);changed.ply=227;for(const p of changed.board)if(p?.hidden)p.type='R';assert.equal(evaluate(v,'r'),evaluate(changed,'r'));
});
test('有兵位暗子可走时仍选择强制将杀，不强制走兵',()=>{
 const f=JSON.parse(fs.readFileSync(new URL('../benchmarks/tactical-positions.json',import.meta.url)))[0],s=structuredClone(f.state);
 s.board[54]={side:'r',type:'P',role:'P',hidden:true};s.captured=[];
 for(const side of ['r','b']){const bag=[...TYPES];for(const p of s.board)if(p?.side===side&&p.type!=='K')bag.splice(bag.indexOf(p.type),1);for(const type of bag)s.captured.push({side,type,hidden:false});}
 const view=publicState(s,'r'),r=analyze(view,{samples:3,maxDepth:2,timeMs:10000,seed:9});assert.equal(view.board[r.move.from].type,'R');assert.equal(r.sampleWins,r.samples);assert(f.winningMoves.some(m=>m.from===r.move.from&&m.to===r.move.to));
});
