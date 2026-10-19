import fs from 'node:fs';
import assert from 'node:assert/strict';
import {compileForcing} from './forcing-variants.mjs';
import {Native,fixture,observationSeed} from './bridge.mjs';
const names=['baseline','qbright','qall'],clients={};
const diagnostics=JSON.parse(fs.readFileSync('benchmarks/pika-native-match/gap-counterfactuals.json')).cases.filter(c=>[49,31,70].includes(c.ply)).map(c=>({name:`${c.seed}/${c.side}/${c.ply}`,fixture:fixture(c.view,{seed:observationSeed(c.view)}),depth:c.actual.depth,oldMove:c.actual.move}));
const fixtures=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
const positions=[...fixtures,...diagnostics];
const out='benchmarks/quiet-checks/assessment.json';
const record={startedAt:new Date().toISOString(),builds:[],positions,rows:[],passed:false,repeats:3,budgetDefinition:'Native request budget; preparation excluded identically; IPC wall recorded. No simultaneous searches.'};
const persist=()=>fs.writeFileSync(out,JSON.stringify(record)+'\n');
try {
  for(const name of names){const b=compileForcing(name);clients[name]=new Native({binary:b.binary});delete b.binary;record.builds.push(b);await clients[name].ready;}
  for(const p of positions)for(const name of names)await clients[name].request(p.fixture,{depth:2,budget:60000});
  let index=0;
  async function compare(p,{repeat,budget,depth,kind}){
    const order=names.slice(index%3).concat(names.slice(0,index%3));index++;
    const results={};for(const name of order){results[name]=await clients[name].request(p.fixture,{depth,budget});if(kind==='fixed')assert.equal(results[name].depth,depth);}
    record.rows.push({position:p.name,kind,repeat,budget,depth,order,results});persist();
    console.log(JSON.stringify({position:p.name,kind,repeat,budget,results:Object.fromEntries(names.map(n=>[n,{depth:results[n].depth,ms:results[n].elapsedMs,wallMs:results[n].wallMs,nodes:results[n].nodes,move:results[n].move}]))}));
  }
  for(let repeat=0;repeat<3;repeat++)for(const p of positions)await compare(p,{repeat,depth:p.depth,budget:60000,kind:'fixed'});
  for(let repeat=0;repeat<3;repeat++)for(const p of [fixtures[0],fixtures[2],fixtures[4],...diagnostics])await compare(p,{repeat,depth:8,budget:1000,kind:'timed'});
  for(const p of [fixtures[0],fixtures[2],fixtures[4]])await compare(p,{repeat:0,depth:8,budget:6000,kind:'timed'});
  record.passed=true;
}catch(e){record.error=e.stack;throw e;}
finally {
  for(const c of Object.values(clients))await c.close();record.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));
  if(Object.values(record.stderr).some(Boolean)){record.passed=false;process.exitCode=1;}
  record.finishedAt=new Date().toISOString();persist();
}
