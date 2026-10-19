import fs from'node:fs';import assert from'node:assert/strict';
import{initial,publicState,legalMoves,move,inCheck,other,TYPES}from'../engine.js';import{seeded}from'../ai.js';
import{Native,fixture,encode,compare,observationSeed}from'./bridge.mjs';import{compileFocus,dir,sha}from'./focus-variants.mjs';
const stage=process.argv.find(x=>x.startsWith('--stage='))?.split('=')[1]||'root',sanitizer=process.argv.includes('--asan')?'address,undefined':process.argv.includes('--tsan')?'thread':null;
assert(['root','tactical','both'].includes(stage));const kind=sanitizer==='thread'?'tsan':sanitizer?'asan':'release';
const output=`${dir}/check-${stage}-${kind}${process.env.FOCUS_RUN_LABEL?'-'+process.env.FOCUS_RUN_LABEL:''}.json`;assert(!fs.existsSync(output),'Preserve earlier check evidence');
const clients={},r={stage,kind,startedAt:new Date().toISOString(),builds:[],rules:[],searches:[],passed:false};
const layer=(x,i)=>{const l=x.iterations[i],top=l.allCandidates[0];return{...l,samples:x.samples,move:{from:top.from,to:top.to},score:top.score};};
function checkRows(x,f){
 const legal=legalMoves(f.view);assert.equal(x.rootCount,legal.length);assert.equal(x.comparedCount,x.allCandidates.length);assert(x.comparedCount<=x.rootCount);
 assert.equal(x.comparisonDepth,x.depth);assert(x.fullRootDepth<=x.depth);assert.equal(x.searchScope,x.comparedCount===x.rootCount?'full-root':'focused-root');
 if(x.depth){assert(x.comparedCount>=Math.min(2,legal.length));assert(x.allCandidates.some(m=>m.from===x.move.from&&m.to===x.move.to));}
 for(const row of x.allCandidates){assert(legal.some(m=>m.from===row.from&&m.to===row.to));assert.equal(row.sampleScores.length,row.draw?1:f.samples);assert(row.sampleScores.every(Number.isFinite));}
}
function criticalOracle(v){return ['r','b'].some(side=>{const k=v.board.findIndex(p=>p?.side===side&&!p.hidden&&p.type==='K');if(k<0||inCheck(v.board,side))return true;const controlled=[-9,9,-1,1].map(d=>k+d).filter(t=>t>=0&&t<90&&Math.abs(t%9-k%9)+Math.abs(Math.floor(t/9)-Math.floor(k/9))===1&&t%9>=3&&t%9<=5&&(side==='r'?t>=63:t<27)).some(t=>inCheck(v.board,side,t));return controlled&&legalMoves(v,side).filter(m=>m.from===k).length<=1;});}
function forcedWin(s,attacker,left){const ms=legalMoves(s);if(!ms.length)return s.turn!==attacker;if(!left)return false;return s.turn===attacker?ms.some(m=>forcedWin(move(s,m,false),attacker,left-1)):ms.every(m=>forcedWin(move(s,m,false),attacker,left-1));}
function sparse(name,placements){const s={...initial(),board:Array(90).fill(null),captured:[]},p=(side,type,hidden=false,role=type)=>({side,type,hidden,role});s.board[85]=p('r','K');s.board[4]=p('b','K');s.board[49]=p('r','P');for(const[i,...args]of placements)s.board[i]=p(...args);for(const side of['r','b']){const bag=[...TYPES];for(const q of s.board)if(q?.side===side&&q.type!=='K'){const i=bag.indexOf(q.type);assert(i>=0);bag.splice(i,1);}for(const type of bag)s.captured.push(p(side,type));}return{name,state:s};}
const cases=[sparse('cannon-screen',[[40,'r','C'],[13,'r','N']]),sparse('horse-leg',[[23,'r','N'],[14,'r','P']]),sparse('elephant-eye',[[24,'r','B'],[14,'r','N']]),sparse('revealed-advisor',[[23,'r','A']]),sparse('sampled-reveal-rook',[[22,'r','R',true,'N']]),sparse('sampled-reveal-cannon',[[22,'r','C',true,'N'],[13,'r','P']]),sparse('counter-check',[[76,'b','R'],[67,'r','R']]),sparse('flying-kings-blocker',[[49,'r','R']])];
for(const seed of[15013,15017,15031]){const rng=seeded(seed);let s=initial(rng);for(let ply=0;ply<=48&&!s.result;ply++){if(ply%12===0)cases.push({name:`${seed}/${ply}`,state:structuredClone(s)});const ms=legalMoves(s);if(!ms.length)break;s=move(s,ms[Math.floor(rng()*ms.length)]);}}
try{
 for(const name of['baseline',stage,...(stage==='root'?['fullCanonical']:stage==='both'?['tacticalCanonical']:[])]){const b=compileFocus(name,{audit:true,sanitizer});r.builds.push(b);clients[name]=new Native({binary:b.binary});await clients[name].ready;}
 for(const c of cases)for(const viewer of['r','b',null]){
  const f=fixture(publicState(c.state,viewer),{seed:15053,samples:4}),w={...f.view,...f.worlds[0]},v=await clients[stage].request(f,{mode:'VERIFY',depth:1});
  assert.equal(v.criticalRoot,criticalOracle(f.view));
  for(const[i,side]of['r','b'].entries()){
   assert.deepEqual(v.sides[i].legal,legalMoves(w,side));assert.equal(v.sides[i].check,inCheck(w.board,side));
   const quiet=legalMoves(w,side).filter(m=>!w.board[m.to]&&inCheck(move({...w,turn:side},m,false).board,other(side)));assert.deepEqual(v.sides[i].quietChecks,quiet);
  }
  assert(v.transitions.every(t=>t.restored));r.rules.push({name:c.name,viewer,criticalRoot:v.criticalRoot,transitions:v.transitions.length,passed:true});
 }
 const ps=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
 for(const p of ps){
  const depth=p.depth+1,base=await clients.baseline.request(p.fixture,{depth,budget:300000}),full=await clients[stage].request(p.fixture,{depth,budget:300000});compare(base,full);
  for(let i=0;i<base.iterations.length;i++)assert.deepEqual(full.iterations[i].allCandidates,base.iterations[i].allCandidates);
  const focused=await clients[stage].request(p.fixture,{mode:'PLAY',depth,budget:300000});checkRows(focused,p.fixture);
  if(stage==='root'||stage==='both'){
   const strict=await clients[stage==='root'?'fullCanonical':'tacticalCanonical'].request(p.fixture,{mode:'PLAY',depth,budget:300000});
   for(const it of focused.iterations){const ref=strict.iterations.find(x=>x.depth===it.depth);assert(ref);for(const row of it.allCandidates){const exact=ref.allCandidates.find(q=>q.from===row.from&&q.to===row.to);assert.deepEqual(row,exact,'root result must match full-window/full-root same-depth exact scores');}}
  }
  if(stage==='root'&&focused.rootCount>8){assert(focused.reintroducedCount>0);const width=Math.max(6,Math.ceil(focused.rootCount/6)),anchor=focused.iterations.find(x=>x.depth===3).allCandidates;assert(focused.allCandidates.some(x=>anchor.findIndex(m=>m.from===x.from&&m.to===x.to)>=width));}
  r.searches.push({name:p.name,fullDepth:full.depth,depth:focused.depth,fullRootDepth:focused.fullRootDepth,compared:focused.comparedCount,total:focused.rootCount,reintroduced:focused.reintroducedCount,quietChecks:focused.quietChecksSearched,passed:true});
 }
 const f=ps[0].fixture;
 for(const nodeLimit of[1000,10000,300000,600000]){const x=await clients[stage].request(f,{mode:'PLAY',depth:8,nodeLimit,budget:300000});checkRows(x,f);assert(x.interruptedDepth>0);r.searches.push({nodeLimit,depth:x.depth,compared:x.comparedCount,passed:true});}
 for(const budget of[0,5,25,100,500]){const progress=[],x=await clients[stage].request(f,{mode:'STREAM_PLAY',depth:8,budget,onProgress:v=>{checkRows(v,f);progress.push(v);}});checkRows(x,f);
  assert(x.interruptedDepth>=x.depth||(x.interruptedDepth===0&&x.cohortComplete&&x.elapsedMs>=budget-Math.min(35,budget*.1)));
  if(x.depth&&x.interruptedDepth===x.depth){assert(!x.cohortComplete);assert(x.comparedCount<x.plannedCount);}
  r.searches.push({budget,depth:x.depth,interruptedDepth:x.interruptedDepth,cohortComplete:x.cohortComplete,compared:x.comparedCount,progress:progress.length,passed:true});}
 const diagnostics=JSON.parse(fs.readFileSync('benchmarks/pika-native-match/gap-counterfactuals.json')).cases;
 const old=diagnostics.find(c=>c.seed===4003&&c.ply===49),df=fixture(old.view,{seed:observationSeed(old.view)}),x=await clients[stage].request(df,{mode:'PLAY',depth:6,budget:300000});checkRows(x,df);
 assert(x.criticalRoot);if(stage==='root'){
  assert(x.collapseExpansions>0);assert(x.reintroducedCount>0);
  const exact=await clients.fullCanonical.request(df,{mode:'PLAY',depth:6,budget:300000});for(const row of x.allCandidates){const match=exact.allCandidates.find(m=>m.from===row.from&&m.to===row.to);assert.deepEqual(row,match,'Deep reintroduced roots must retain exact per-world scores');}
 }else{assert(x.quietChecksSearched>0);if(stage==='both'){const exact=await clients.tacticalCanonical.request(df,{mode:'PLAY',depth:6,budget:300000});for(const row of x.allCandidates)assert.deepEqual(row,exact.allCandidates.find(m=>m.from===row.from&&m.to===row.to),'Combined reintroduced root sample scores');}}
 r.searches.push({name:'old49-collapse-or-tactics',depth:x.depth,compared:x.comparedCount,total:x.rootCount,expanded:x.collapseExpansions,checks:x.quietChecksSearched,passed:true});
 for(const c of JSON.parse(fs.readFileSync('benchmarks/tactical-positions.json'))){
  const wins=legalMoves(c.state).filter(m=>forcedWin(move(c.state,m,false),c.state.turn,2));assert(wins.length);
  const v=await clients[stage].request(fixture(publicState(c.state,c.state.turn)),{mode:'PLAY',depth:3,budget:300000});assert(wins.some(m=>m.from===v.move.from&&m.to===v.move.to));r.searches.push({name:c.name,independentThreePlyWin:true,move:v.move,passed:true});
 }
 for(const viewer of['r','b',null])assert.equal(encode(fixture(publicState(initial(seeded(1)),viewer))),encode(fixture(publicState(initial(seeded(999)),viewer))));
 let state=move(initial(seeded(17)),{from:64,to:1});state=move(state,{from:25,to:88});const views=['r','b','r'].map(viewer=>fixture(publicState(state,viewer),{seed:15053,samples:4})),rows=[];
 for(const f of views)rows.push(await clients[stage].request(f,{mode:'PLAY',depth:4,budget:300000}));assert.deepEqual(rows[0].allCandidates,rows[2].allCandidates);assert.notEqual(encode(views[0]),encode(views[1]));r.informationIsolation=true;r.passed=true;
}catch(e){r.error=e.stack;throw e;}finally{for(const c of Object.values(clients))await c.close();r.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));if(Object.values(r.stderr).some(Boolean))r.passed=false;r.finishedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({stage,kind,passed:r.passed,rules:r.rules.length,searches:r.searches.length,error:r.error}));}
