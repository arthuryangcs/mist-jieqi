import fs from'node:fs';import assert from'node:assert/strict';import{Native,fixture,observationSeed}from'./bridge.mjs';import{compileFocus,originalBuild,dir,sha}from'./focus-variants.mjs';
const stage=process.argv[2]||'root',mode=process.argv[3]||'diagnostic';assert(['root','tactical','both'].includes(stage));assert(['diagnostic','budgets','fixed'].includes(mode));
const names=stage==='both'?['baseline',...(process.argv.includes('--include-reference')?['fullCanonical']:[]),'root','tactical','both']:['baseline',stage],clients={},record={stage,mode,startedAt:new Date().toISOString(),builds:[],rows:[],passed:false};
const ps=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions,ds=JSON.parse(fs.readFileSync('benchmarks/pika-native-match/gap-counterfactuals.json')).cases;
const positions=mode==='diagnostic'?ds.map(c=>({name:`${c.seed}/${c.side}/${c.ply}`,fixture:fixture(c.view,{seed:observationSeed(c.view)}),depth:c.actual.depth,oldMove:c.actual.move})):mode==='budgets'?[ps[0],ps[2],ps[4]]:ps;
record.positions=positions;const output=`${dir}/${stage}-${mode}${process.env.FOCUS_RUN_LABEL?'-'+process.env.FOCUS_RUN_LABEL:''}.json`;assert(!fs.existsSync(output),'Preserve existing evidence; choose a new stage/output instead of overwriting');const persist=()=>fs.writeFileSync(output,JSON.stringify(record)+'\n');
try{
 for(const name of names){const b=name==='baseline'?originalBuild():compileFocus(name);record.builds.push(b);clients[name]=new Native({binary:b.binary});await clients[name].ready;}
 for(const p of positions)for(const name of names)await clients[name].request(p.fixture,{depth:2,budget:300000,mode:name==='baseline'?'SEARCH':'PLAY'});
 const repeats=Number(process.argv.find(x=>x.startsWith('--repeats='))?.split('=')[1]||(mode==='diagnostic'?1:3));assert(Number.isInteger(repeats)&&repeats>0&&repeats<=5);record.repeats=repeats;
 for(let repeat=0;repeat<repeats;repeat++)for(const [i,p]of positions.entries()){
  const bs=mode==='fixed'?[300000]:mode==='diagnostic'?[1000]:[1000,6000];
  for(const budget of bs){const order=names.slice((i+repeat)%names.length).concat(names.slice(0,(i+repeat)%names.length)),results={};
   for(const name of order)results[name]=await clients[name].request(p.fixture,{depth:mode==='fixed'?p.depth+1:8,budget,mode:name==='baseline'?'SEARCH':'PLAY'});
   record.rows.push({position:p.name,repeat,budget,order,results});persist();
   console.log(JSON.stringify({stage,mode,position:p.name,repeat,budget,results:Object.fromEntries(names.map(n=>[n,{depth:results[n].depth,full:results[n].fullRootDepth??results[n].depth,coverage:[results[n].comparedCount??results[n].allCandidates.length,results[n].rootCount??results[n].allCandidates.length],move:results[n].move,score:results[n].score,ms:results[n].elapsedMs,nodes:results[n].nodes,critical:results[n].criticalRoot,quietChecks:results[n].quietChecksSearched,reentered:results[n].reintroducedCount,expanded:results[n].collapseExpansions}]))}));
  }
 }
 record.passed=true;
}catch(e){record.error=e.stack;throw e;}finally{for(const c of Object.values(clients))await c.close();record.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));if(Object.values(record.stderr).some(Boolean))record.passed=false;record.finishedAt=new Date().toISOString();persist();console.log(JSON.stringify({stage,mode,passed:record.passed,rows:record.rows.length,error:record.error}));}
