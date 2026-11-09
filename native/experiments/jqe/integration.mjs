// Typed-inventory, root-adjudication, full roots, timed search and cancellation.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {compile,cache,dir,modelFile,hash} from './build.mjs';import {Native,fixture,encode} from '../../bridge.mjs';
import {StableEngine} from '../search-speed/stable-client.mjs';import {initial,publicState,move,positionKey,legalMoves} from '../../../engine.js';import {seeded} from '../../../ai.js';
process.env.MIST_JQE_MODEL=modelFile;process.env.MIST_JQE_QUANT='1';delete process.env.MIST_JQE_FULL;
const binary=path.resolve(cache+'/candidate'),record={passed:false,mode:'quantized-incremental',headerSha256:hash('native/experiments/jqe/nnue.hpp'),testSourceSha256:hash('native/experiments/jqe/integration.mjs'),modelSha256:hash(modelFile),sourceSha256:hash(cache+'/candidate.cpp'),candidateBinarySha256:hash(binary),controlBinarySha256:hash(cache+'/control'),rootCases:[],timed:[],cancellation:null};
fs.writeFileSync(cache+'/inventory-key.cpp',fs.readFileSync('native/experiments/nnue/inventory-key.cpp','utf8').replaceAll('observation_nnue','mist_jqe').replaceAll('MIST_NNUE','MIST_JQE'));compile(path.resolve(cache+'/inventory-key.cpp'),path.resolve(cache+'/inventory-key'));
const inv=spawnSync(path.resolve(cache+'/inventory-key'),[],{input:encode(fixture(publicState(initial(seeded(17)),'r'),{samples:1}),{mode:'VERIFY',depth:1}),encoding:'utf8',timeout:10000});assert.equal(inv.status,0,inv.stderr);record.inventory=JSON.parse(inv.stdout);assert(record.inventory.passed&&!record.inventory.keysEqual);
const client=new Native({binary});
try{for(const turn of['r','b'])for(const hidden of[false,true])for(const count of[1,2]){
 const s=initial(seeded(17));s.turn=turn;s.board=s.board.map(p=>p?{...p,type:p.role,hidden:false}:null);if(hidden)s.board[turn==='r'?54:27].hidden=true;
 const m=turn==='r'?{from:82,to:63}:{from:1,to:18};assert(legalMoves(s).some(x=>x.from===m.from&&x.to===m.to));s.positions=Array(count).fill(positionKey(move(s,m,false)));
 const f=fixture(publicState(s,turn),{samples:4,seed:8101}),b=await client.request(f,{mode:'STREAM',depth:1,budget:60000}),r=b.allCandidates.find(x=>x.from===m.from&&x.to===m.to);
 assert.equal(!!r.repetitionLoss,count===2);assert.equal(r.repetitionCount,count);assert(!r.draw);if(count===2){assert.equal(r.heuristicWinRate,0);assert.notDeepEqual(b.move,m);assert.equal(move(s,m).result.winner,turn==='r'?'b':'r');}
 record.rootCases.push({turn,hidden,count,repetitionLoss:!!r.repetitionLoss,score:r.score});
 }}finally{await client.close();assert(!client.stderr);}
const positions=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;
const engines={control:new StableEngine({binary:path.resolve(cache+'/control')}),candidate:new StableEngine({binary})};
try{
 for(const repeat of[0,1])for(const [i,p]of[positions[0],positions[1],positions.at(-1)].entries())for(const name of(repeat+i)%2?['candidate','control']:['control','candidate']){
 const e=engines[name];await e.ready();const t=performance.now(),r=await e.search(p.fixture.view,2000),wall=performance.now()-t,allowed=legalMoves(p.fixture.view);
 assert(wall<=2060,`${name} over budget ${wall}`);assert(r.depth>0&&!r.fallbackUsed);assert(allowed.some(m=>m.from===r.move.from&&m.to===r.move.to));assert.deepEqual(r.allCandidates.map(m=>m.from*90+m.to).sort((a,b)=>a-b),allowed.map(m=>m.from*90+m.to).sort((a,b)=>a-b));assert(r.threads<=4);assert.equal(r.samples,p.fixture.view.board.some(p=>p?.hidden)?8:1);
 const clock=r.clock?Object.fromEntries(Object.entries(r.clock).filter(([k])=>!['frames','commands','start'].includes(k))):null;record.timed.push({repeat,name,position:p.name,wallMs:wall,depth:r.depth,completedDepth:r.completedDepth,selDepth:r.selDepth,nodes:r.nodes,visitedNodes:r.visitedNodes,threads:r.threads,samples:r.samples,move:r.move,clock});
 }
 const e=engines.candidate;await e.ready();const pending=e.search(positions[0].fixture.view,10000).then(()=>{throw Error('cancelled request resolved');},e=>String(e));await new Promise(r=>setTimeout(r,50));const start=performance.now();await e.stop();const error=await pending,elapsed=performance.now()-start;assert(elapsed<500&&/cancel/.test(error));record.cancellation={passed:true,reapMs:elapsed};await e.ready();const recovered=await e.search(positions[0].fixture.view,500);assert(recovered.depth>0);record.cancellation.recoveryDepth=recovered.depth;
 record.passed=true;
}finally{for(const e of Object.values(engines))await e.close();fs.writeFileSync(dir+'/integration.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({passed:record.passed,rootCases:record.rootCases.length,timed:record.timed.map(({name,position,depth,wallMs})=>({name,position,depth,wallMs})),cancellation:record.cancellation}));}
