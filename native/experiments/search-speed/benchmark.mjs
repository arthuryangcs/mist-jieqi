// Optional reproducible performance run; never invoked by the default service/CI.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {build,cache} from './build.mjs';
import {ExperimentalEngine} from './client.mjs';
import {FourThreadPika,canonicalFen,pikaCommit,pikaHash} from './pika.mjs';
import {legalMoves} from './legacy-engine-20261103.js';
const built=build(),positions=JSON.parse(fs.readFileSync(new URL('./benchmark-fixtures.json',import.meta.url))).positions;
const output=process.env.MIST_BENCH_OUTPUT??cache+'/benchmark.json';
assert(!fs.existsSync(output),'refusing to overwrite completed/partial benchmark');
const lock=output+'.lock',fd=fs.openSync(lock,'wx');fs.closeSync(fd);
const record={completed:false,budgetMs:2000,repeats:3,threadsMaximum:4,samples:8,HCE:true,fullRoots:true,sourceSha256:built.sourceSha256,pikaCommit,pikaHash,nodeUnitsComparable:false,rows:[]};
const persist=()=>{const temp=output+'.tmp';fs.writeFileSync(temp,JSON.stringify(record,null,2)+'\n');fs.renameSync(temp,output);};
try{
 for(let repeat=0;repeat<3;repeat++)for(const [i,p]of positions.entries())for(const name of (repeat+i)%2?['pika','candidate']:['candidate','pika']){
  const c=name==='pika'?new FourThreadPika():new ExperimentalEngine(),row={repeat,position:p.name,category:p.category,name};
  try{
   if(name==='pika')await c.init();else await c.ready();const start=performance.now();
   const x=name==='pika'?await c.search(canonicalFen(p.view),[],p.view,2000):await c.search(p.view,2000);
   assert(legalMoves(p.view).some(m=>m.from===x.move?.from&&m.to===x.move?.to));
   const elapsedMs=performance.now()-start,nodes=x.visitedNodes??x.nodes;
   Object.assign(row,{elapsedMs,nodes,nps:nodes*1000/elapsedMs,mainDepth:x.mainDepth??x.depth,completedDepth:x.completedDepth??null,selDepth:x.selDepth,threads:x.threads,samples:x.samples??null,statsExact:x.statsExact??null,deadlineStop:!!x.deadlineStop,fallbackUsed:!!x.fallbackUsed,shortSearch:elapsedMs<1000,move:x.move,status:elapsedMs>2060?'over-budget':x.fallbackUsed?'fallback':'ok'});
  }catch(error){Object.assign(row,{status:'technical-failure',error:String(error)});}
  finally{await c.close();record.rows.push(row);persist();console.log(JSON.stringify(row));}
 }
 record.completed=true;record.passed=record.rows.every(r=>r.status==='ok');persist();
}finally{fs.unlinkSync(lock);}
