import fs from 'node:fs';import assert from 'node:assert/strict';
import {Native,fixture,observationSeed} from './bridge.mjs';
import {compileDefense,dir} from './defense-variants.mjs';
const mode=process.argv[2]||'diagnostic';assert(['diagnostic','fixed','budgets'].includes(mode));
const fast=process.argv.includes('--fast'),selected=process.argv.includes('--selected'),cached=process.argv.includes('--cache'),lazy=process.argv.includes('--lazy'),names=lazy?['baseline','kingFast','kingLazy']:cached?['baseline','kingFast','kingCached']:selected?['baseline','kingFast']:fast?['baseline','hanging','kingFast','combinedFast']:['baseline','threats','king','both'],clients={},record={mode,fast,selected,cached,lazy,startedAt:new Date().toISOString(),builds:[],rows:[],passed:false};
const ps=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
const ds=JSON.parse(fs.readFileSync('benchmarks/pika-native-match/gap-counterfactuals.json')).cases;
const positions=mode==='diagnostic'?ds.map(c=>({name:`${c.seed}/${c.side}/${c.ply}`,fixture:fixture(c.view,{seed:observationSeed(c.view)}),depth:c.actual.depth,oldMove:c.actual.move})):ps;
record.positions=positions;const persist=()=>fs.writeFileSync(`${dir}/${mode}${lazy?'-lazy':cached?'-cached':selected?'-selected':fast?'-fast':''}.json`,JSON.stringify(record)+'\n');
try {
 for(const name of names){const b=compileDefense(name);record.builds.push(b);clients[name]=new Native({binary:b.binary});await clients[name].ready;}
 for(const p of positions)for(const name of names)await clients[name].request(p.fixture,{depth:2});
 let index=0;
 async function run(p,repeat,depth,budget){
  const order=names.slice(index%names.length).concat(names.slice(0,index%names.length));index++;const results={};
  for(const name of order){results[name]=await clients[name].request(p.fixture,{depth,budget});if(mode!=='budgets')assert.equal(results[name].depth,depth);}
  record.rows.push({position:p.name,repeat,depth,budget,order,results});persist();
  console.log(JSON.stringify({position:p.name,repeat,budget,results:Object.fromEntries(names.map(n=>[n,{depth:results[n].depth,ms:results[n].elapsedMs,nodes:results[n].nodes,score:results[n].score,move:results[n].move}]))}));
 }
 for(let repeat=0;repeat<(mode==='diagnostic'?1:3);repeat++)for(const p of positions){
  if(mode==='budgets'){if(![ps[0],ps[2],ps[4]].includes(p))continue;for(const budget of [1000,6000])await run(p,repeat,8,budget);}
  else await run(p,repeat,mode==='fixed'?p.depth+1:p.depth,300000);
 }
 record.passed=true;
}catch(e){record.error=e.stack;throw e;}finally{
 for(const c of Object.values(clients))await c.close();record.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));if(Object.values(record.stderr).some(Boolean))record.passed=false;
 record.finishedAt=new Date().toISOString();persist();console.log(JSON.stringify({mode,passed:record.passed,rows:record.rows.length,error:record.error}));
}
