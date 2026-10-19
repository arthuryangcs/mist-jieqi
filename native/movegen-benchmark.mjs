import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Native,compare} from './bridge.mjs';
import {compileVariant,variantSource} from './movegen-variants.mjs';
import {legalMoves,inCheck,publicState} from '../engine.js';
import {seeded} from '../ai.js';
const mode=process.argv[2]||'fixed';assert(['fixed','guards','budgets'].includes(mode));
const directory='benchmarks/native-movegen',output=`${directory}/${mode}.json`;
const positions=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
const hash=x=>createHash('sha256').update(x).digest('hex');
assert.equal(hash(variantSource('baseline')),'d539a5ee025e232c6929a48dd753c4c0045180a5d7e9fea0fc6432fcbfc5cb55');
const names=mode==='fixed'?['baseline','safe-rays','path','combined']:mode==='guards'?['direct','combined']:['baseline','combined'];
const repeats=mode==='fixed'?5:1,clients={};
const record={mode,startedAt:new Date().toISOString(),baselineCommit:'46f83ad',cpu:os.cpus()[0].model,runtime:process.version,repeats,fixtureFile:'benchmarks/native-benchmark.json',fixtureFileSha256:hash(fs.readFileSync('benchmarks/native-benchmark.json')),builds:[],rows:[],passed:false};
const persist=()=>fs.writeFileSync(output,JSON.stringify(record)+'\n');
// Persisted JSON normalizes -0 to +0. Only normalize that distinction, not scores.
const normalizeZero=x=>typeof x==='number'&&x===0?0:Array.isArray(x)?x.map(normalizeZero):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,normalizeZero(v)])):x;
const same=(a,b)=>{const r=compare(a,b);assert.deepEqual(normalizeZero(a.allCandidates),normalizeZero(b.allCandidates));assert.equal(a.iterations.length,b.iterations.length);for(let i=0;i<a.iterations.length;i++){assert.equal(a.iterations[i].nodes,b.iterations[i].nodes);assert.deepEqual(normalizeZero(a.iterations[i].allCandidates),normalizeZero(b.iterations[i].allCandidates));}return r;};
try{
 for(const name of names){const built=compileVariant(name,{guard:mode==='guards'});clients[name]=new Native({binary:built.binary});delete built.binary;record.builds.push(built);await clients[name].ready;}
 if(mode!=='guards')for(const p of positions)for(const name of names)await clients[name].request(p.fixture,{depth:2});
 if(mode==='fixed'){
  for(let repeat=0;repeat<repeats;repeat++)for(const [i,p]of positions.entries()){
   const offset=(repeat+i)%names.length,order=names.slice(offset).concat(names.slice(0,offset)),results={};
   for(const name of order){results[name]=await clients[name].request(p.fixture,{depth:p.depth});assert.equal(results[name].depth,p.depth);}
   for(const name of names)same(results.baseline,results[name]);
   record.rows.push({repeat,position:p.name,order,results});persist();console.log(JSON.stringify({repeat,position:p.name,nodes:results.baseline.nodes,ms:Object.fromEntries(names.map(n=>[n,results[n].elapsedMs])),identical:true}));
  }
  const median=a=>{a.sort((a,b)=>a-b);return a[a.length>>1];};
  record.summary=positions.map(p=>{const rows=record.rows.filter(r=>r.position===p.name),base=median(rows.map(r=>r.results.baseline.elapsedMs));return{position:p.name,depth:p.depth,samples:p.fixture.samples,nodes:rows[0].results.baseline.nodes,variants:Object.fromEntries(names.map(n=>{const ms=median(rows.map(r=>r.results[n].elapsedMs));return[n,{coreMedianMs:ms,wallMedianMs:median(rows.map(r=>r.results[n].wallMs)),npsMedian:median(rows.map(r=>r.results[n].nodes*1000/r.results[n].elapsedMs)),speedup:base/ms}];}))};});console.log(JSON.stringify(record.summary));
 }else if(mode==='guards'){
  const fixed=JSON.parse(fs.readFileSync(`${directory}/fixed.json`));
  for(const name of names)for(const p of positions){const r=await clients[name].request(p.fixture,{depth:p.depth});same(fixed.rows.find(x=>x.position===p.name).results.baseline,r);record.rows.push({variant:name,position:p.name,depth:r.depth,nodes:r.nodes,passed:true});}
  record.pathInterruptionChecks=[];
  for(const nodeLimit of[1000,10000,100000]){const r=await clients.combined.request(positions[0].fixture,{depth:8,nodeLimit});assert.equal(r.nodes,nodeLimit+1);record.pathInterruptionChecks.push({nodeLimit,depth:r.depth,nodes:r.nodes,restorationGuardPassed:true});}
  record.targetedCases=[];
  const targeted=[
   {name:'加入炮架导致送将',pieces:[[85,'r','K'],[3,'b','K'],[4,'b','C'],[72,'r','R']],illegal:{from:72,to:76}},
   {name:'去掉第二炮架导致送将',pieces:[[85,'r','K'],[3,'b','K'],[4,'b','C'],[76,'r','R'],[49,'r','P']],illegal:{from:76,to:75}},
   {name:'移开车线保护导致送将',pieces:[[85,'r','K'],[3,'b','K'],[4,'b','R'],[76,'r','R']],illegal:{from:76,to:75}},
   {name:'移开马腿阻挡导致送将',pieces:[[85,'r','K'],[3,'b','K'],[66,'b','N'],[75,'r','R']],illegal:{from:75,to:74}},
   {name:'移开明象眼阻挡导致送将',pieces:[[85,'r','K'],[3,'b','K'],[65,'b','B'],[75,'r','R']],illegal:{from:75,to:74}},
   {name:'唯一暗炮角色解将',pieces:[[85,'r','K'],[3,'b','K'],[4,'b','R'],[12,'b','R'],[14,'b','R'],[64,'r','N',true,'C']],only:[{from:64,to:67}]},
   {name:'未被将军的困毙',turn:'b',pieces:[[85,'r','K'],[4,'b','K'],[49,'r','P'],[12,'r','R'],[14,'r','R']],only:[]}
  ];
  for(const test of targeted){
   const board=Array(90).fill(null);for(const [square,side,type,hidden=false,role=type]of test.pieces)board[square]={side,type,hidden,role};
   const state={board,turn:test.turn||'r',captured:[],ply:0,quiet:0,positions:[],result:null},f={view:publicState(state,'r'),worlds:[{board}],repetitions:[]};
   for(const name of names){const r=await clients[name].request(f,{mode:'VERIFY',depth:1});for(const [i,side]of ['r','b'].entries()){assert.equal(r.sides[i].check,inCheck(board,side));assert.deepEqual(r.sides[i].legal,legalMoves(state,side));assert.deepEqual(r.sides[i].captures,legalMoves(state,side,{capturesOnly:true}));}
    const moves=r.sides[state.turn==='r'?0:1].legal;if(test.illegal)assert(!moves.some(m=>m.from===test.illegal.from&&m.to===test.illegal.to),test.name);if(test.only)assert.deepEqual(moves,test.only,test.name);assert(r.transitions.every(t=>t.restored));record.targetedCases.push({name:test.name,variant:name,passed:true});
   }
  }
  const rng=seeded(82931);record.syntheticRuleCases=0;record.transitions=0;
  // Intentionally arbitrary diagrams stress geometry and ordering, not inventory validity.
  for(let test=0;test<200;test++){
   const board=Array(90).fill(null),piece=(side,type,hidden=false,role=type)=>({side,type,hidden,role});board[85]=piece('r','K');board[4]=piece('b','K');
   for(let i=0;i<5+test%36;i++){const square=Math.floor(rng()*90);if(board[square])continue;const type='RNBCAP'[Math.floor(rng()*6)],role='RNBCAP'[Math.floor(rng()*6)];board[square]=piece(rng()<.5?'r':'b',type,rng()<.35,role);}
   const state={board,turn:test%2?'r':'b',viewer:'r',captured:[],ply:0,quiet:0,positions:[],result:null},view=publicState(state,'r');
   const f={view,worlds:[{board}],repetitions:[]};
   for(const name of names){const r=await clients[name].request(f,{mode:'VERIFY',depth:1});
   for(const [i,side]of ['r','b'].entries()){assert.equal(r.sides[i].check,inCheck(board,side));assert.deepEqual(r.sides[i].legal,legalMoves(state,side));assert.deepEqual(r.sides[i].captures,legalMoves(state,side,{capturesOnly:true}));}
   assert(r.transitions.every(t=>t.restored));record.syntheticRuleCases++;record.transitions+=r.transitions.length;}
  }
  console.log(JSON.stringify({guardedSearches:record.rows.length,syntheticRuleCases:record.syntheticRuleCases,transitions:record.transitions}));
 }else{
  for(const [i,p]of [positions[0],positions[2],positions[4]].entries())for(const [j,budget]of [1000,6000,15000].entries())for(const name of(i+j)%2?[...names].reverse():names){const r=await clients[name].request(p.fixture,{depth:8,budget});record.rows.push({position:p.name,name,budgetMs:budget,result:r});persist();console.log(JSON.stringify({position:p.name,name,budget,depth:r.depth,nodes:r.nodes,ms:r.elapsedMs}));}
  record.commonDepths=[];
  for(const a of record.rows.filter(r=>r.name==='baseline')){const b=record.rows.find(r=>r.name==='combined'&&r.position===a.position&&r.budgetMs===a.budgetMs),depth=Math.min(a.result.depth,b.result.depth);for(let i=0;i<depth;i++){assert.equal(a.result.iterations[i].nodes,b.result.iterations[i].nodes);assert.deepEqual(normalizeZero(a.result.iterations[i].allCandidates),normalizeZero(b.result.iterations[i].allCandidates));}record.commonDepths.push({position:a.position,budgetMs:a.budgetMs,depth,exact:true});}
 }
 record.passed=true;
}catch(e){record.error=e.stack.replaceAll(process.cwd(),'<project>');throw e;}finally{
 for(const client of Object.values(clients))await client.close();record.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));record.finishedAt=new Date().toISOString();
 const clean=Object.values(clients).every(c=>!c.stderr);if(!clean){record.passed=false;record.error??='unexpected stderr';}persist();assert(clean,'unexpected stderr');
}
