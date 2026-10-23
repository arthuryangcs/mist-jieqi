import fs from 'node:fs';import assert from 'node:assert/strict';
import {build,baseline,dir,hash,stableBinary} from './build.mjs';
import {Native,fixture,encode,compare} from '../../bridge.mjs';
import {initial,publicState,move,legalMoves,inCheck} from '../../../engine.js';
import {seeded,evaluate,remaining,values} from '../../../ai.js';
const sanitize=process.argv.includes('--sanitize'),built=build({sanitize});
const r={passed:false,build:{...built,binary:undefined},sanitize,geometryTriples:0,views:0,transitions:0,searches:[],privacyChecks:0};
const cases=[];
const targeted=[
 ['cannon screen added',[[85,'r','K'],[3,'b','K'],[4,'b','C'],[72,'r','R']]],
 ['cannon second screen removed',[[85,'r','K'],[3,'b','K'],[4,'b','C'],[76,'r','R'],[49,'r','P']]],
 ['rook line vacated',[[85,'r','K'],[3,'b','K'],[4,'b','R'],[76,'r','R']]],
 ['horse leg vacated',[[85,'r','K'],[3,'b','K'],[66,'b','N'],[75,'r','R']]],
 ['elephant eye vacated',[[85,'r','K'],[3,'b','K'],[65,'b','B'],[75,'r','R']]],
 ['kings facing',[[85,'r','K'],[4,'b','K']]],
 ['missing king',[[4,'b','K'],[72,'r','R']]],
 ['hidden cannon evasion',[[85,'r','K'],[3,'b','K'],[4,'b','R'],[12,'b','R'],[14,'b','R'],[64,'r','N',true,'C']]]
];
for(const [name,pieces]of targeted){const s={...initial(),board:Array(90).fill(null),captured:[],positions:[],result:null};for(const [i,side,type,hidden=false,role=type]of pieces)s.board[i]={side,type,role,hidden};cases.push({name,state:s,arbitrary:true});}
// Exhaust all 90 king positions, all origins/destinations, and missing-king guard.
for(let k=0;k<90;k++)for(let f=0;f<90;f++)for(let t=0;t<90;t++){
 const g=i=>(i%9===k%9||Math.floor(i/9)===Math.floor(k/9)?1:0)|(Math.abs(i%9-k%9)===1&&Math.abs(Math.floor(i/9)-Math.floor(k/9))===1?2:0);
 const old=f%9===k%9||Math.floor(f/9)===Math.floor(k/9)||t%9===k%9||Math.floor(t/9)===Math.floor(k/9)||(Math.abs(f%9-k%9)===1&&Math.abs(Math.floor(f/9)-Math.floor(k/9))===1);
 assert.equal(!!(g(f)||(g(t)&1)),old);r.geometryTriples++;
}
for(const seed of [2026102307,2026102311,2026102319]){
 const rng=seeded(seed);let s=initial(rng);cases.push({name:`reachable/${seed}/0`,state:structuredClone(s)});
 for(let ply=1;ply<=64&&!s.result;ply++){
  const ms=legalMoves(s);s=move(s,ms[Math.floor(rng()*ms.length)]);
  if(ply%8===0)cases.push({name:`reachable/${seed}/${ply}`,state:structuredClone(s)});
 }
}
// Existing tactical/rule fixtures are independently checked by the JS oracle.
for(const p of JSON.parse(fs.readFileSync('benchmarks/tactical-positions.json')))cases.push({name:p.name,state:p.state});
for(const p of JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions)cases.push({name:p.name,state:p.fixture.view});
// Arbitrary geometry stress: legal inventory is not claimed for these diagrams.
const rng=seeded(2026102323),types=['K','R','N','B','C','A','P'];
for(let i=0;i<100;i++){
 const s={...initial(),board:Array(90).fill(null),captured:[],positions:[],result:null};
 for(let n=0;n<20;n++){const square=Math.floor(rng()*90),type=types[1+Math.floor(rng()*6)];s.board[square]={side:rng()<.5?'r':'b',type,role:types[1+Math.floor(rng()*6)],hidden:rng()<.5};}
 for(const [side,squares]of [['r',[84,85,86,75,76,77,66,67,68]],['b',[3,4,5,12,13,14,21,22,23]]]){const square=squares[Math.floor(rng()*9)];s.board[square]={side,type:'K',role:'K',hidden:false};}
 cases.push({name:`diagram/${i}`,state:s,arbitrary:true});
}
const native=new Native({binary:built.binary}),stable=new Native({binary:baseline});
try{
 for(const c of cases)for(const viewer of ['r','b',null]){
  const f=c.arbitrary?{view:publicState(c.state,viewer),worlds:[{board:c.state.board}],repetitions:[]}:fixture(publicState(c.state,viewer),{seed:6101,samples:1});
  const x=await native.request(f,{mode:'VERIFY',depth:1}),y=await stable.request(f,{mode:'VERIFY',depth:1});
  // Transport timings are observations, not part of VERIFY rule semantics.
  assert.deepEqual({...x,wallMs:undefined},{...y,wallMs:undefined},c.name);
  const w={...f.view,...f.worlds[0]},v=publicState(w,viewer);
  for(const [i,side]of ['r','b'].entries()){
   assert.equal(x.sides[i].check,inCheck(w.board,side),c.name);
   assert.deepEqual(x.sides[i].legal,legalMoves(w,side),c.name);
   assert.deepEqual(x.sides[i].captures,legalMoves(w,side,{capturesOnly:true}),c.name);
   if(!c.arbitrary)assert(Math.abs(x.sides[i].score-evaluate(v,side))<1e-7,c.name);
  }
  for(const row of x.transitions){assert(row.restored);if(!c.arbitrary){const n=move(w,{from:row.from,to:row.to},false),v=publicState(n,viewer);assert.deepEqual(row.reply,legalMoves(n));assert(Math.abs(row.score-evaluate(v,w.turn))<1e-7);assert.deepEqual(row.poolCount,['r','b'].map(s=>remaining(v,s).length));assert.deepEqual(row.poolValue,['r','b'].map(s=>remaining(v,s).reduce((a,t)=>a+values[t],0)));}r.transitions++;}r.views++;
 }
 assert.equal(encode(fixture(publicState(initial(seeded(1)),'r'))),encode(fixture(publicState(initial(seeded(999)),'r'))));r.privacyChecks++;
 const fixtures=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
 for(const [i,p]of fixtures.entries())for(const nodeLimit of [1000,30000]){
  const f=p.fixture,options={depth:i===fixtures.length-1?4:3,nodeLimit};const a=await stable.request(f,options),b=await native.request(f,options);
  assert.equal(a.iterations.length,b.iterations.length);for(let i=0;i<a.iterations.length;i++){assert.equal(a.iterations[i].nodes,b.iterations[i].nodes);assert.deepEqual(a.iterations[i].allCandidates,b.iterations[i].allCandidates);}
  r.searches.push({name:p.name,nodeLimit,depth:a.depth,nodes:a.nodes,...compare(a,b)});
 }
 assert(!native.stderr.trim(),native.stderr);assert.equal(hash(baseline),stableBinary);r.passed=true;
}catch(e){r.error=e.stack.replaceAll(process.cwd(),'<project>');throw e;}finally{
 await native.close();await stable.close();fs.writeFileSync(dir+`/check${sanitize?'-sanitized':''}.json`,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({passed:r.passed,sanitize,views:r.views,transitions:r.transitions,geometryTriples:r.geometryTriples,searches:r.searches.length}));
}
