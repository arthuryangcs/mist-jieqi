import fs from 'node:fs';import assert from 'node:assert/strict';import {build,dir} from './build.mjs';import {Native,fixture,encode,compare} from '../../bridge.mjs';import {StableEngine} from '../search-speed/stable-client.mjs';import {initial,publicState,legalMoves} from '../../../engine.js';import {seeded} from '../../../ai.js';
const sanitize=process.argv.includes('--sanitize'),candidate=build({sanitize}),control=build({trial:false,sanitize}),r={passed:false,sanitize,build:{...candidate,binary:undefined},control:{...control,binary:undefined},searches:[],privacyChecks:0,lifecycle:[]};
const clients={candidate:new Native({binary:candidate.binary}),control:new Native({binary:control.binary})};
const positions=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
try{
 for(const viewer of ['r','b',null]){assert.equal(encode(fixture(publicState(initial(seeded(1)),viewer))),encode(fixture(publicState(initial(seeded(999)),viewer))));r.privacyChecks++;}
 assert.throws(()=>fixture(initial(seeded(1))),/真实暗子/);r.privacyChecks++;
 for(const p of positions)for(const nodeLimit of [1000,30000,0]){
  const options={depth:nodeLimit?4:2,nodeLimit:nodeLimit||Infinity,budget:120000},a=await clients.control.request(p.fixture,options),b=await clients.candidate.request(p.fixture,options);
  assert.equal(a.iterations.length,b.iterations.length);assert.deepEqual(a.allCandidates,b.allCandidates);assert.equal(a.score,b.score);assert.equal(a.safetyCutoffs||0,0);assert.equal(b.safetyCutoffs||0,0);
  for(let i=0;i<a.iterations.length;i++){assert.equal(a.iterations[i].nodes,b.iterations[i].nodes);assert.deepEqual(a.iterations[i].allCandidates,b.iterations[i].allCandidates);}
  assert.equal(a.threads,nodeLimit||p.fixture.worlds.length===1?1:4);if(!nodeLimit)assert.equal(a.depth,2);
  r.searches.push({name:p.name,nodeLimit,depth:a.depth,nodes:a.nodes,threads:a.threads,...compare(a,b)});
 }
 for(const [arm,built]of Object.entries({candidate,control})){
  const c=new StableEngine({binary:built.binary,reserveMs:0});try{const view=publicState(initial(seeded(2026110901)),'r');for(const budget of [1,20,100,1,100]){const x=await c.search(view,budget);assert(legalMoves(view).some(m=>m.from===x.move.from&&m.to===x.move.to));r.lifecycle.push({arm,budget,depth:x.depth,fallbackUsed:x.fallbackUsed,deadlineStop:x.deadlineStop,elapsedMs:x.elapsedMs});}}finally{await c.close();}
  const n=new Native({binary:built.binary});await n.ready;const pending=n.request(positions[0].fixture,{depth:0,budget:60000}).then(()=>false,e=>/cancelled/.test(e.message));await new Promise(r=>setTimeout(r,10));n.stop();assert(await pending);await n.close();
  const restarted=new Native({binary:built.binary});try{const x=await restarted.request(positions[0].fixture,{depth:1,budget:60000});assert.equal(x.depth,1);}finally{await restarted.close();}r.lifecycle.push({arm,explicitCancelRestart:true});
 }
 r.passed=true;
}catch(e){r.error=e.stack.replaceAll(process.cwd(),'<repo>');throw e;}finally{for(const c of Object.values(clients)){await c.close();assert(!c.stderr.trim(),c.stderr);}fs.writeFileSync(dir+'/check'+(sanitize?'-sanitized':'')+'.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({passed:r.passed,sanitize,searches:r.searches.length,privacyChecks:r.privacyChecks,lifecycle:r.lifecycle.length}));}
