// Never import this module for discovery: it intentionally starts gated work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {Native} from '../../bridge.mjs';
import {gate,manifest,poses,environment,save,root,hash} from './common.mjs';
const mode=process.argv[2],name=process.argv[3];
assert(['profile','verify','bench'].includes(mode));gate();
assert(!fs.existsSync(root+'/run.lock'),'Another speed operation is running');
fs.mkdirSync(root,{recursive:true});fs.writeFileSync(root+'/run.lock',JSON.stringify({pid:process.pid}),{flag:'wx'});
function exact(r){return {depth:r.depth,nodes:r.nodes,samples:r.samples,score:r.score,move:r.move,allCandidates:r.allCandidates,iterations:r.iterations.map(x=>({depth:x.depth,nodes:x.nodes,allCandidates:x.allCandidates}))};}
function complete(r,d){assert.equal(r.depth,d);assert(!r.interruptedDepth);assert.equal(r.searchStatus,'completed');assert.equal(r.safetyCutoffs,0);}
async function withClient(binary,fn){gate();const n=new Native({binary});try{await n.ready;return await fn(n);}finally{await n.close();assert.equal(n.stderr.trim(),'');}}
const positions=poses();
try{
 if(mode==='profile'){
  environment();const frozen=gate(),rows=[];
  for(const i of [0,1,4]){
   const row=await withClient(process.cwd()+'/.cache/jqe-current/candidate',async n=>{
    const pending=n.request(positions[i].fixture,{budget:5000,depth:0});
    // Install rejection handler immediately while the sampling command runs.
    const settled=pending.then(result=>({result}),error=>({error}));
    await new Promise(r=>setTimeout(r,150));
    const file=process.cwd()+`/${root}/sample-${i}.txt`;
    const sample=spawnSync('/usr/bin/sample',[String(n.process.pid),'3','1','-file',file],{encoding:'utf8',timeout:7000});
    if(sample.status!==0){n.stop();await settled;throw Error('Sampling failed or denied; do not retry attach: '+sample.stderr);}
    const done=await settled;if(done.error)throw done.error;
    const raw=fs.readFileSync(file,'utf8'),section=raw.split('Sort by top of stack, same collapsed')[1]?.split('Binary Images:')[0]??'';
    const top=section.split('\n').filter(l=>/^\s*\S.*\s+\d+\s*$/.test(l)).slice(0,40);
    return {position:positions[i].name,index:i,binarySha256:frozen.binarySha256,rawSha256:hash(file),topStacks:top,depth:done.result.depth,nodes:done.result.nodes};
   });rows.push(row);save('profile-summary.json',{purpose:'Diagnostic samples, not speed ratios. Wait stacks are not active CPU cost.',profiles:rows});
  }
 } else {
  assert(['snapshot','integer','fma'].includes(name));
  const baseline=manifest('baseline'),candidate=manifest(name);
  if(mode==='verify'){
   const rows=[];
   for(const quant of [true,false]){
    environment(quant);
    for(const sanitize of [false,true]){
     const a=manifest('baseline',sanitize),b=manifest(name,sanitize);
     // VERIFY checks whole neural State restoration for every legal transition.
     for(const p of positions){
      const x=await withClient(a.binary,n=>n.request(p.fixture,{mode:'VERIFY'}));
      const y=await withClient(b.binary,n=>n.request(p.fixture,{mode:'VERIFY'}));
      const strip=r=>{const {wallMs,...rest}=r;return rest;};
      assert.deepEqual(strip(x),strip(y));assert(y.transitions.every(t=>t.restored));
      const ref=await withClient(a.binary,n=>n.request(p.fixture,{depth:2,budget:60000}));complete(ref,2);
      const got=await withClient(b.binary,async n=>{
       if(sanitize)for(const budget of [0,5,25,100])await n.request(p.fixture,{depth:20,budget});
       return n.request(p.fixture,{depth:2,budget:60000});
      });complete(got,2);assert.deepEqual(exact(got),exact(ref));
      rows.push({position:p.name,quant,sanitize,nodes:got.nodes,transitions:y.transitions.length});
     }
    }
   }
   save(name+'-verify.json',{passed:true,baseline,candidate,rows,limits:'it014 only; supported alternate dimensions and king bucket models require additional fixtures. Not a replacement for upstream oracle/rule suites.'});
  } else {
   const validation=JSON.parse(fs.readFileSync(root+'/'+name+'-verify.json'));assert(validation.passed);assert.equal(validation.candidate.binarySha256,candidate.binarySha256);assert.equal(validation.baseline.binarySha256,baseline.binarySha256);
   environment();const rows=[],depth=Number(process.env.JQE_SPEED_DEPTH??3);assert(Number.isInteger(depth)&&depth>=2&&depth<=8);
   for(const p of positions){
    let reference;
    // One unmeasured warmup per arm; fresh process each measured run so TT state matches.
    for(const b of [baseline,candidate])await withClient(b.binary,async n=>{const r=await n.request(p.fixture,{depth,budget:120000});complete(r,depth);if(reference)assert.deepEqual(exact(r),reference);else reference=exact(r);});
    for(let cycle=0;cycle<3;++cycle)for(const arm of (cycle%2?['B','A','A','B']:['A','B','B','A'])){
     const b=arm==='A'?baseline:candidate;
     const r=await withClient(b.binary,async n=>{
      // Warm persistent model/code pages; request-local TT is recreated by engine.
      await n.request(p.fixture,{depth:1,budget:120000});
      return n.request(p.fixture,{depth,budget:120000});
     });complete(r,depth);assert.deepEqual(exact(r),reference);
     rows.push({position:p.name,cycle,arm,depth,nodes:r.nodes,wallMs:r.wallMs,engineMs:r.elapsedMs});save(name+'-bench.json',{passed:false,baseline,candidate,depth,rows});
    }
   }
   const median=a=>{a.sort((x,y)=>x-y);return (a[(a.length-1)>>1]+a[a.length>>1])/2;};
   const summary=positions.map(p=>{const a=median(rows.filter(r=>r.position===p.name&&r.arm==='A').map(r=>r.wallMs)),b=median(rows.filter(r=>r.position===p.name&&r.arm==='B').map(r=>r.wallMs));return {position:p.name,baselineMedianMs:a,candidateMedianMs:b,speedRatio:a/b};});
   save(name+'-bench.json',{passed:true,baseline,candidate,depth,rows,summary,caveat:'Serial same-tree wall-time ABBA/BAAB, not a strength test or CPU-time measurement.'});
  }
 }
}finally{fs.unlinkSync(root+'/run.lock');}
