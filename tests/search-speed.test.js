import test from 'node:test';import assert from 'node:assert/strict';
import{initial,publicState,pseudo,inCheck,legalMoves,move}from'../engine.js';
import{analyze,seeded}from'../ai.js';
import{legalMoves as oldLegal,inCheck as oldCheck}from'../benchmarks/search-speed-baseline-engine.js';
import{analyze as oldAnalyze}from'../benchmarks/search-speed-baseline-ai.js';

test('将军快速判定与逐子pseudo规则在4000个任意拥挤/稀疏盘面一致',()=>{
 const rng=seeded(7319),types=['R','N','B','A','C','P'];
 for(let n=0;n<4000;n++){
  const board=Array(90).fill(null),r=Math.floor(rng()*90);let b;do b=Math.floor(rng()*90);while(b===r);
  board[r]={side:'r',type:'K',hidden:false};board[b]={side:'b',type:'K',hidden:false};
  for(let j=0;j<n%31;j++){const i=Math.floor(rng()*90);if(board[i])continue;board[i]={side:rng()<.5?'r':'b',type:types[Math.floor(rng()*6)],role:types[Math.floor(rng()*6)],hidden:rng()<.5};}
  for(const side of ['r','b']){const k=side==='r'?r:b,oracle=board.some((p,f)=>p&&p.side!==side&&pseudo(board,f,k));assert.equal(inCheck(board,side),oracle,JSON.stringify({n,side,board}));assert.equal(inCheck(board,side),oldCheck(board,side));}
 }
});
test('合法着法顺序、只吃子、首个合法着法及缓存将帅位置在可达局面保持一致',()=>{
 const rng=seeded(7417);let s=initial(rng);
 for(let n=0;n<450;n++){
  if(s.result||n%75===0)s=initial(rng);
  for(const side of ['r','b'])for(const opts of [{},{capturesOnly:true},{stopAfterOne:true}]){
   const before=JSON.stringify(s.board),expected=oldLegal(s,side,opts);assert.deepEqual(legalMoves(s,side,opts),expected);assert.equal(JSON.stringify(s.board),before);
   const cached={...s,_kings:Object.fromEntries(['r','b'].map(c=>[c,s.board.findIndex(p=>p?.side===c&&!p.hidden&&p.type==='K')]))};assert.deepEqual(legalMoves(cached,side,opts),expected);
  }
  const ms=legalMoves(s);if(ms.length)s=move(s,ms[Math.floor(rng()*ms.length)]);else s=initial(rng);
 }
});
test('完整3层8样本与冻结基线逐着同分、同节点，未减少样本或候选',()=>{
 const view=publicState(initial(seeded(17)),'r'),opts={seed:6101,samples:8,maxDepth:3,timeMs:100000};
 const a=oldAnalyze(view,opts),b=analyze(view,opts);assert.equal(a.depth,3);assert.equal(b.depth,3);assert.equal(a.samples,b.samples);assert.equal(a.nodes,b.nodes);assert.deepEqual(a.allCandidates,b.allCandidates);
});
