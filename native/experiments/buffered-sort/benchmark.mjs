// Frozen depth work plus independent host-clock observations. Never overlaps searches.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {Native,compare} from '../../bridge.mjs';import {StableEngine} from '../search-speed/stable-client.mjs';import {initial,publicState,move,legalMoves,positionKey} from '../../../engine.js';import {seeded} from '../../../ai.js';import {cache,dir,hash,sha,sourceOf} from './build.mjs';
const plan=JSON.parse(fs.readFileSync(new URL('plan.json',import.meta.url))),positions=JSON.parse(fs.readFileSync(plan.fixedWork.fixture)).positions;
const builds=Object.fromEntries(['candidate','control'].map(arm=>{const b=JSON.parse(fs.readFileSync(cache+'/'+arm+'-build.json'));assert.equal(hash(cache+'/'+arm),b.binarySha256);assert.equal(sha(sourceOf({trial:arm==='candidate'})),b.sourceSha256);return[arm,b];}));
const r={passed:false,planSha256:hash('native/experiments/buffered-sort/plan.json'),fixtureSha256:hash(plan.fixedWork.fixture),builds,runtime:process.version,cpu:os.cpus()[0].model,protocol:'Serial warmed clients, four alternating repeats, complete prescribed depth. Exact candidate order and every iteration node/score equality. Host-clock measurements use fresh reachable lawful observations and are not fixed work.',fixed:[],timed:[]};
const save=()=>fs.writeFileSync(dir+'/benchmark.json',JSON.stringify(r,null,2)+'\n');
const clients=Object.fromEntries(['candidate','control'].map(arm=>[arm,new Native({binary:path.resolve(cache+'/'+arm)})]));
try{
 for(const p of positions)for(const c of Object.values(clients))await c.request(p.fixture,{depth:2,budget:plan.fixedWork.budgetMs});
 for(let repeat=0;repeat<plan.fixedWork.repeats;repeat++)for(const [i,p]of positions.entries()){
  const depth=p.fixture.view.board.some(p=>p?.hidden)?plan.fixedWork.depthDark:plan.fixedWork.depthBright,pair={};
  for(const arm of (repeat+i)%2?['candidate','control']:['control','candidate'])pair[arm]=await clients[arm].request(p.fixture,{depth,budget:plan.fixedWork.budgetMs});
  const a=pair.control,b=pair.candidate;assert.equal(a.depth,depth);assert.equal(b.depth,depth);assert.equal(a.safetyCutoffs||0,0);assert.equal(b.safetyCutoffs||0,0);assert.equal(a.iterations.length,b.iterations.length);assert.deepEqual(a.allCandidates,b.allCandidates);
  for(let k=0;k<a.iterations.length;k++){assert.equal(a.iterations[k].nodes,b.iterations[k].nodes);assert.deepEqual(a.iterations[k].allCandidates,b.iterations[k].allCandidates);}
  r.fixed.push({repeat,position:p.name,requestedDepth:depth,depth:a.depth,nodes:a.nodes,threads:a.threads,...compare(a,b),controlCoreMs:a.elapsedMs,candidateCoreMs:b.elapsedMs,controlWallMs:a.wallMs,candidateWallMs:b.wallMs});save();console.log(JSON.stringify(r.fixed.at(-1)));
 }
 for(const c of Object.values(clients))await c.close();
 const median=a=>{a=[...a].sort((a,b)=>a-b);return(a[(a.length-1)>>1]+a[a.length>>1])/2;};r.summary=positions.map(p=>{const rows=r.fixed.filter(x=>x.position===p.name),a=median(rows.map(x=>x.controlCoreMs)),b=median(rows.map(x=>x.candidateCoreMs));return{position:p.name,depth:rows[0].depth,nodes:rows[0].nodes,controlMedianMs:a,candidateMedianMs:b,speedup:a/b};});save();
 const fresh=plan.hostTime.seeds.map((seed,i)=>{const rng=seeded(seed);let s=initial(rng);s.positions=[positionKey(s)];for(let ply=0;ply<plan.hostTime.plies[i];ply++){assert(!s.result);const ms=legalMoves(s);s=move(s,ms[Math.floor(rng()*ms.length)]);}const p=publicState(s,s.turn);const view={board:p.board,turn:p.turn,captured:p.captured,ply:p.ply,quiet:p.quiet,result:p.result,positions:p.positions,viewer:p.viewer};return{seed,plies:plan.hostTime.plies[i],view};});
 r.hostFixtures=fresh.map(x=>({...x,observationSha256:sha(JSON.stringify(x.view))}));save();
 const timed=Object.fromEntries(['candidate','control'].map(arm=>[arm,new StableEngine({binary:path.resolve(cache+'/'+arm),reserveMs:plan.hostTime.hostReserveMs})]));
 try{for(let repeat=0;repeat<plan.hostTime.repeats;repeat++)for(const [i,p]of fresh.entries())for(const arm of (repeat+i)%2?['candidate','control']:['control','candidate']){
  await timed[arm].ready();const x=await timed[arm].search(p.view,plan.hostTime.budgetMs);assert(legalMoves(p.view).some(m=>m.from===x.move.from&&m.to===x.move.to));assert(x.threads==null||x.threads<=4);
  r.timed.push({repeat,seed:p.seed,plies:p.plies,arm,budgetMs:plan.hostTime.budgetMs,depth:x.depth,nodes:x.nodes,visitedNodes:x.visitedNodes,threads:x.threads,elapsedMs:x.elapsedMs,fallbackUsed:x.fallbackUsed,deadlineStop:x.deadlineStop,withinGrace:x.elapsedMs<=plan.hostTime.budgetMs+plan.matches.graceMs,clock:x.clock});save();
 }}finally{for(const c of Object.values(timed))await c.close();}r.passed=true;
}catch(e){r.error=e.stack.replaceAll(process.cwd(),'<repo>');throw e;}finally{for(const c of Object.values(clients))await c.close();save();console.log(JSON.stringify({passed:r.passed,summary:r.summary,timed:r.timed.length}));}
