import test from 'node:test';import assert from 'node:assert/strict';
import {cleanSearchStats,mergeSearchStats,depthSummary} from '../search-metrics.js';
import {startTimedSearch} from '../deadline-search.js';import {initial,publicState,legalMoves,TYPES} from '../engine.js';import {analyze} from '../ai.js';
const stats={mainDepth:6,selDepth:13,completedDepth:4,visitedNodes:500,elapsedMs:100};
test('遥测仅传计数，不得替换推荐、评分或完整迭代',()=>{
 const s=cleanSearchStats({...stats,move:{from:1,to:2},score:99999});assert(!('move'in s));assert(!('score'in s));
 const r=mergeSearchStats({move:{from:54,to:45},score:4,depth:3,completedDepth:3,mainDepth:3,selDepth:7},stats,{deadlineStop:true});
 assert.deepEqual(r.move,{from:54,to:45});assert.equal(r.score,4);assert.equal(r.depth,3);assert.equal(r.completedDepth,3);assert.equal(r.mainDepth,6);assert.equal(r.selDepth,13);assert.equal(r.statsExact,false);assert.match(depthSummary(r),/13 半回合.*完成迭代 3.*时间到/);
 assert.equal(cleanSearchStats({...stats,completedDepth:7}),null);assert.equal(cleanSearchStats({...stats,selDepth:Infinity}),null);assert.match(depthSummary({depth:5}),/最深走子 未报告/);
});
test('过期、退步与取消后的遥测不生效，单独遥测不能产生可执行推荐',()=>{
 const view=publicState(initial()),moves=legalMoves(view),out=[],seen=[],worker={postMessage(){},terminate(){this.closed=true;}};let deadline;
 const session=startTimedSearch({worker,id:42,view,timeMs:200,setTimer:f=>(deadline=f,1),clearTimer(){},clock:()=>200,onComplete:r=>out.push(r),onTelemetry:s=>seen.push(s)});
 const send=(id,telemetry)=>worker.onmessage({data:{id,telemetry}});send(41,stats);assert.equal(seen.length,0);send(42,stats);send(42,{...stats,selDepth:1});assert.equal(seen.length,1);assert.equal(out.length,0);
 deadline();assert.equal(out[0].depth,0);assert.equal(out[0].selDepth,13);assert(out[0].fallbackUsed);assert(moves.some(m=>m.from===out[0].move.from&&m.to===out[0].move.to));session.cancel();send(42,{...stats,selDepth:99});assert.equal(seen.length,1);
});
export function brightKings(){const s={board:Array(90).fill(null),captured:[],turn:'r',viewer:'r',ply:0,quiet:0,positions:[],result:null};s.board[85]={side:'r',type:'K',hidden:false};s.board[3]={side:'b',type:'K',hidden:false};for(const side of ['r','b'])for(const type of TYPES)s.captured.push({side,type,hidden:false,capturedBy:side==='r'?'b':'r'});return s;}
test('JS可搜索超过8层；身份分支不加走子层数，时间预算终止无无限结果缓存',()=>{
 const v=brightKings(),r=analyze(v,{maxDepth:10,timeMs:2000,samples:1,nodeLimit:200000});assert.equal(r.depth,10);assert(r.selDepth>=10);assert(r.selDepth<=127);assert.equal(r.completedDepth,10);
 let events=0;const x=analyze(v,{timeMs:100,samples:1,onProgress(){events++;}});assert(x.depth>8);assert(x.elapsedMs<1000);assert(events<=5);assert(x.selDepth<=127);assert(['time-budget','stack-safety','terminal'].includes(x.terminationReason));
});
