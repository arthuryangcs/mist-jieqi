import fs from 'node:fs';import assert from 'node:assert/strict';
import {Native,fixture,observationSeed} from './bridge.mjs';
import {compileFrontier,dir,sha} from './frontier-variants.mjs';
const mode=process.argv[2]||'budgets';assert(['budgets','diagnostic'].includes(mode));
const file=`${dir}/${mode}${process.env.FRONTIER_RUN_LABEL?'-'+process.env.FRONTIER_RUN_LABEL:''}.json`;assert(!fs.existsSync(file),'Preserve prior measurement');
const names=['baseline','old','coverage','cap','combined'],ps=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
const positions=mode==='budgets'?[ps[0],ps[2],ps[4]]:JSON.parse(fs.readFileSync('benchmarks/pika-native-match/gap-counterfactuals.json')).cases.map(c=>({name:`${c.seed}/${c.side}/${c.ply}`,fixture:fixture(c.view,{seed:observationSeed(c.view)}),oldMove:c.actual.move}));
const r={startedAt:new Date().toISOString(),mode,positions,names,repeats:3,builds:[],rows:[],passed:false,sourceHashes:Object.fromEntries(['native/frontier-policy.inc','native/frontier-variants.mjs','native/frontier-benchmark.mjs'].map(p=>[p,sha(fs.readFileSync(p))]))},clients={};
try{
 for(const name of names){const b=compileFrontier(name);r.builds.push(b);clients[name]=new Native({binary:b.binary});await clients[name].ready;}
 for(const p of positions)for(const name of names)await clients[name].request(p.fixture,{depth:2,budget:300000,mode:name==='baseline'?'SEARCH':'PLAY'});
 for(let repeat=0;repeat<3;repeat++)for(const [i,p]of positions.entries())for(const budget of mode==='budgets'?[1000,6000]:[1000]){
  const rotation=(repeat+i)%names.length,order=names.slice(rotation).concat(names.slice(0,rotation)),results={};
  for(const name of order){const x=await clients[name].request(p.fixture,{depth:8,budget,mode:name==='baseline'?'SEARCH':'PLAY'});results[name]=x;assert(x.samples===p.fixture.samples);if(name!=='baseline'&&x.depth){assert.equal(x.comparedCount,x.allCandidates.length);assert.equal(x.comparisonDepth,x.depth);if(['coverage','combined'].includes(name)){assert(x.comparedCount>=x.minimumComparisonRoots);assert(x.depth<=3||x.fullRootDepth>=x.depth-1);}}}
  r.rows.push({position:p.name,repeat,budget,order,results});fs.writeFileSync(file,JSON.stringify(r)+'\n');
  console.log(JSON.stringify({mode,position:p.name,repeat,budget,results:Object.fromEntries(names.map(n=>{const x=results[n];return[n,{depth:x.depth,full:x.fullRootDepth??x.depth,coverage:[x.comparedCount??x.allCandidates.length,x.rootCount??x.allCandidates.length],move:x.move,ms:Math.round(x.elapsedMs),refreshes:x.coverageRefreshes,capFill:x.capFillRoots}];}))}));
 }
 r.passed=true;
}catch(e){r.error=e.stack;throw e;}finally{for(const c of Object.values(clients))await c.close();r.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));if(Object.values(r.stderr).some(Boolean))r.passed=false;r.finishedAt=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(r)+'\n');console.log(JSON.stringify({mode,passed:r.passed,rows:r.rows.length,error:r.error}));}
