import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {build,cache} from './build.mjs';
import {Native,fixture,encode} from './bridge.mjs';
import {ExperimentalEngine} from './client.mjs';
import {initial,publicState,legalMoves,move} from '../../../engine.js';
import {seeded} from '../../../ai.js';

const sanitize=process.argv.includes('--sanitize'),threadSanitize=process.argv.includes('--tsan');
const options={sanitize,threadSanitize},built=build(options),plain=build({...options,kind:'plain'}),unit=build({...options,kind:'unit'});
const poses=JSON.parse(fs.readFileSync(new URL('./fixtures.json',import.meta.url))).positions;
const fixtures=poses.map(p=>fixture(p.view,{seed:p.seed,samples:p.samples}));
const out={passed:false,sourceSha256:built.sourceSha256,sanitize,threadSanitize,comparisons:[],units:[],timeouts:[],privacy:false,cancel:false};
const clients=[built,plain,unit].map(b=>new Native({binary:b.binary}));
const sorted=r=>r.allCandidates.slice().sort((a,b)=>a.from-b.from||a.to-b.to);
try{
 for(let i=0;i<18;i++)for(const depth of[2,3]){
  const f=fixtures[i],a=await clients[0].request(f,{depth,budget:30000}),b=await clients[1].request(f,{depth,budget:30000}),x=sorted(a),y=sorted(b);
  assert.equal(a.depth,depth);assert.equal(b.depth,depth);assert.equal(a.ttDenied,0);assert.equal(x.length,y.length);
  for(let j=0;j<x.length;j++)for(let w=0;w<x[j].worldScores.length;w++)assert(Math.abs(x[j].worldScores[w]-y[j].worldScores[w])<1e-7,poses[i].name);
  out.comparisons.push({name:poses[i].name,depth,score:a.score,nodes:a.nodes,referenceNodes:b.nodes});
 }
 // Previously 206.666... versus 203 through path-sensitive cache reuse.
 const old=await clients[0].request(fixtures.at(-1),{depth:5,budget:30000}),ref=await clients[1].request(fixtures.at(-1),{depth:5,budget:30000});
 const oldRow=old.allCandidates.find(m=>m.from===16&&m.to===25),refRow=ref.allCandidates.find(m=>m.from===16&&m.to===25);
 assert(Math.abs(oldRow.score-203)<1e-7);assert.equal(oldRow.score,refRow.score);out.oldCounterexample={from:16,to:25,score:oldRow.score,referenceScore:refRow.score};
 for(const i of[8,9])for(const depth of[17,2]){const r=await clients[2].request(fixtures[i],{mode:'VERIFY',depth,budget:30000});assert(r.passed);out.units.push({name:poses[i].name,...r});}
 for(const i of[0,4,8,12])for(const budget of[75,150,500]){
  const f=fixtures[i],layers=[],r=await clients[0].request(f,{mode:'STREAM',depth:0,budget,onProgress:x=>layers.push(x)}),count=legalMoves(f.view).length;
  assert(legalMoves(f.view).some(m=>m.from===r.move?.from&&m.to===r.move?.to));assert.equal(r.ttDenied,0);
  for(const x of layers)assert.equal(x.allCandidates.length,count);
  out.timeouts.push({name:poses[i].name,budget,nodes:r.nodes,completedLayers:layers.length,threads:r.threads});
 }
 const a=initial(seeded(3)),b=initial(seeded(799));assert.equal(encode(fixture(publicState(a,'r'))),encode(fixture(publicState(b,'r'))));
 const captured=move(a,{from:64,to:1}),changed=structuredClone(captured);assert(changed.captured.at(-1).hidden);changed.captured.at(-1).type=changed.captured.at(-1).type==='R'?'N':'R';
 assert.equal(encode(fixture(publicState(captured,'b'))),encode(fixture(publicState(changed,'b'))));assert.notEqual(encode(fixture(publicState(captured,'r'))),encode(fixture(publicState(changed,'r'))));out.privacy=true;
 const bad=encode(fixtures[0]).trim().split(' ');bad.pop();const invalid=spawnSync(built.binary,[],{input:bad.join(' ')+'\n',encoding:'utf8',timeout:3000});assert.equal(invalid.status,2);assert.match(invalid.stderr,/invalid history/);out.truncatedRejected=true;
 const c=new ExperimentalEngine({binary:built.binary});try{
  const view=publicState(a,'r'),pending=c.search(view,6000),rejected=assert.rejects(pending,/cancelled/);await assert.rejects(c.search(view,200),/overlap/);await new Promise(resolve=>setTimeout(resolve,100));await c.stop();await rejected;
  const next=await c.search(view,250);assert(legalMoves(view).some(m=>m.from===next.move?.from&&m.to===next.move?.to));out.cancel=true;
 }finally{await c.close();}
 out.passed=true;
}catch(error){out.error=error.stack;throw error;}finally{
 for(const c of clients){await c.close();assert.equal(c.stderr,'');}
 fs.writeFileSync(cache+'/check'+(threadSanitize?'-tsan':sanitize?'-sanitized':'')+'.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({passed:out.passed,comparisons:out.comparisons.length,unitAssertions:out.units.reduce((n,x)=>n+x.assertions,0),timeouts:out.timeouts.length,privacy:out.privacy,cancel:out.cancel}));
}
