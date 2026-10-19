import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';import {createHash}from'node:crypto';import {spawnSync}from'node:child_process';
import{Native,compare}from'./bridge.mjs';import{legalMoves}from'../engine.js';
const kind=process.argv.includes('--tsan')?'tsan':process.argv.includes('--sanitized')?'sanitized':'release',dir='benchmarks/native-windows',sha=x=>createHash('sha256').update(x).digest('hex');
const build=JSON.parse(fs.readFileSync(`.cache/native/build${kind==='sanitized'?'-sanitized':''}.json`)),fixtures=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions,reference=JSON.parse(fs.readFileSync(`${dir}/parallel-deep.json`));
assert.equal(build.sourceSha256,sha(fs.readFileSync('native/search.cpp')),'必须先构建当前核心');
let binary=path.resolve(`.cache/native/mist-core${kind==='sanitized'?'-sanitized':kind==='tsan'?'-tsan':''}`);
const record={kind,build,referenceSha256:sha(fs.readFileSync(`${dir}/parallel-deep.json`)),checks:[],passed:false};let native;
function aligned(a,b){const c=compare(a,b);assert.deepEqual(a.allCandidates.map(m=>[m.from,m.to]),b.allCandidates.map(m=>[m.from,m.to]));return c;}
function layer(r,samples){const top=r.allCandidates[0];return{...r,samples,score:top.score,move:{from:top.from,to:top.to}};}
try{
 if(kind==='tsan'){
  const flags=build.flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(['-O1','-g','-fsanitize=thread','-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']);
  const compile=spawnSync(process.env.CXX||'clang++',[...flags,'native/search.cpp','-o',binary],{encoding:'utf8'});record.instrumentation={flags,status:compile.status,diagnostics:compile.stderr};assert.equal(compile.status,0,compile.stderr);
 }
 record.testedBinarySha256=sha(fs.readFileSync(binary));native=new Native({binary});await native.ready;record.runtimeCapabilities=native.capabilities;assert.equal(native.capabilities.threads,4);assert(native.capabilities.independentWorldSearch);
 if(kind==='release')for(const p of fixtures){const old=reference.rows.find(r=>r.position===p.name).results.parallel4,r=await native.request(p.fixture,{depth:old.depth,budget:60000});assert.equal(r.threads,p.fixture.samples>1?4:1);const checked=aligned(old,r);assert.equal(r.iterations.length,old.iterations.length);for(let i=0;i<r.iterations.length;i++)aligned(layer(old.iterations[i],old.samples),layer(r.iterations[i],r.samples));record.checks.push({position:p.name,depth:r.depth,nodes:r.nodes,...checked});}
 const p=fixtures[0],full=reference.rows[0].results.parallel4;
 for(const budget of[0,5,25,100]){const r=await native.request(p.fixture,{depth:8,budget});assert.equal(r.threads,4);assert.equal(r.iterations.length,r.depth);assert(r.interruptedDepth>r.depth);assert(legalMoves(p.fixture.view).some(m=>m.from===r.move.from&&m.to===r.move.to));for(const actual of r.iterations){assert.equal(actual.allCandidates.length,44);aligned(layer(full.iterations[actual.depth-1],full.samples),layer(actual,r.samples));}record.checks.push({budgetMs:budget,depth:r.depth,nodes:r.nodes,elapsedMs:r.elapsedMs,completeRoots:r.allCandidates.length,interruptedDepth:r.interruptedDepth});}
 const recovered=await native.request(p.fixture,{depth:2,budget:60000});aligned(layer(full.iterations[1],full.samples),recovered);record.checks.push({name:'同进程超时后再次搜索',depth:recovered.depth,nodes:recovered.nodes});record.passed=true;
}catch(error){record.error=error.stack.replaceAll(process.cwd(),'<project>');process.exitCode=1;}finally{if(native){await native.close();record.stderr=native.stderr;if(native.stderr.trim()){record.passed=false;process.exitCode=1;}}record.finishedAt=new Date().toISOString();fs.writeFileSync(`${dir}/parallel-check-${kind}.json`,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));}
