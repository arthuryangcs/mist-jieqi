// Read only the staged change set. Never print a suspected secret value.
import {execFileSync} from 'node:child_process';
const files=execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACMR','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),issues=[],auditedStaticGuards=[];
const privateKeys=new Set(['pid','oldPid','staleLockPid','savedPid','terminalSession','savedLockStartedAt','accountId','planType','usedPercent','remainingPercent','rateLimits','rateLimitsByLimitId','credits','quota']);
for(const file of files){
 if(/^(?:\.cache|external|\.agents|\.codex|\.aws)\/|(?:^|\/)\.env(?:\.|$)|\.(?:nnue|wasm|o|a|dylib|so|exe|pem|key)$|\/(?:quota|status|delivery|service-health)\.json$/.test(file)){issues.push({file,reason:'private/runtime/generated path'});continue;}
 const b=execFileSync('git',['show',':'+file],{maxBuffer:32*1024*1024});
 if(file==='models/experimental/selfplay-value-v1.bin'){
  // Narrow exception for this project's own audited numerical checkpoint only.
  const {createHash}=await import('node:crypto');
  const training=JSON.parse(execFileSync('git',['show',':benchmarks/selfplay-value/training.json'],{encoding:'utf8'}));
  const frozen=JSON.parse(execFileSync('git',['show',':benchmarks/selfplay-value/model-frozen.json'],{encoding:'utf8'}));
  const digest=createHash('sha256').update(b).digest('hex');
  const shape=b.length===166364&&b.subarray(0,8).toString('binary')==='JQNNUE1\0'&&b.readUInt32LE(8)===2597&&b.readUInt32LE(12)===16&&b.readFloatLE(16)===256&&b.readFloatLE(20)===600;
  let finite=shape;if(shape)for(let at=24;at<b.length;at+=4)finite&&=Number.isFinite(b.readFloatLE(at));
  if(!shape||!finite||digest!==training.modelSha256||digest!==frozen.modelSha256||!training.testReadAfterModelFreeze||training.testTouchedDuringTraining)issues.push({file,reason:'unverified own numerical checkpoint'});
  continue;
 }
 if(b.includes(0)){issues.push({file,reason:'binary content'});continue;}const s=b.toString('utf8');
 // A frozen exporter checks this forbidden prefix; that static guard contains no personal path.
 // Exempt only its exact single guard occurrence from path scanning, never credential scanning.
 let pathText=s;
 const guard="const text=JSON.stringify(raw,null,2)+'\\n';assert(!text.includes('\x2fUsers\x2f')&&!text.includes('BEGIN PRIVATE KEY'));";
 if(file==='native/experiments/buffered-sort/export.mjs'&&s.split('\n').filter(line=>line===guard).length===1){
  pathText=s.split('\n').map(line=>line===guard?line.replace(/\x2fUsers\x2f/,'<audited-forbidden-prefix>'):line).join('\n');
  auditedStaticGuards.push({file,reason:'exact static forbidden-prefix assertion; original text still scanned for credentials'});
 }
 if(/\/Users\//.test(pathText)||/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s))issues.push({file,reason:'private path or credential pattern'});
 if(file.endsWith('.json')){let data;try{data=JSON.parse(s);}catch{issues.push({file,reason:'invalid JSON'});continue;}const visit=x=>{if(Array.isArray(x))return x.forEach(visit);if(x&&typeof x==='object')for(const[k,v]of Object.entries(x)){if(privateKeys.has(k))issues.push({file,reason:'private metadata key',key:k});visit(v);}};visit(data);}
}
for(const experiment of ['tactical-lmr','cluster-tt','verified-null','all-features'])if(files.includes('benchmarks/'+experiment+'/matches.json')){
 const staged=p=>JSON.parse(execFileSync('git',['show',':'+p],{encoding:'utf8',maxBuffer:32*1024*1024}));
 const r=staged('benchmarks/'+experiment+'/matches.json'),v=staged('benchmarks/'+experiment+'/verification.json');
 if(!r.completedAt||r.games.filter(g=>g.result).length!==r.tasks.length||!v.passed||!v.complete){issues.push({file:'benchmarks/'+experiment+'/matches.json',reason:'current frozen screen or replay incomplete'});}
 const {createHash}=await import('node:crypto');for(const[p,expected]of Object.entries(r.sourceHashes)){const actual=createHash('sha256').update(execFileSync('git',['show',':'+p],{maxBuffer:32*1024*1024})).digest('hex');if(actual!==expected){issues.push({file:p,reason:'staged source differs from measured fingerprint'});}}
}
if(files.includes('benchmarks/selfplay-value/matches.json')){
 const staged=p=>execFileSync('git',['show',':'+p],{maxBuffer:32*1024*1024});
 const read=p=>JSON.parse(staged(p));const {createHash}=await import('node:crypto'),sha=b=>createHash('sha256').update(b).digest('hex');
 const p='benchmarks/selfplay-value/',r=read(p+'matches.json'),v=read(p+'replay.json'),plan=read('native/experiments/selfplay-value/plan.json');
 if(!r.completedAt||r.games.length!==plan.matches.totalGames||r.tasks.length!==plan.matches.totalGames||!r.games.every(g=>g.result)||!v.passed||v.games!==r.games.length||v.matchesSha256!==sha(staged(p+'matches.json'))||r.planSha256!==sha(staged('native/experiments/selfplay-value/plan.json')))issues.push({file:p+'matches.json',reason:'self-play frozen screen or replay incomplete'});
 const groups=['internal','candidatePika','controlPika'];for(const group of groups)for(const seed of plan.matches.seeds)for(const side of['r','b'])if(r.games.filter(g=>g.group===group&&g.seed===seed&&g.candidateSide===side).length!==1)issues.push({file:p+'matches.json',reason:'missing or duplicate paired game'});
 for(const [file,expected]of Object.entries(r.hashes)){if(file.startsWith('.cache/'))continue;if(sha(staged(file))!==expected)issues.push({file,reason:'staged source/evidence differs from frozen self-play screen'});}
 const training=read(p+'training.json');if(r.modelSha256!==training.modelSha256||r.modelSha256!==sha(staged(plan.training.model)))issues.push({file:plan.training.model,reason:'match model differs from staged trained model'});
}
console.log(JSON.stringify({reviewedFiles:files.length,passed:issues.length===0,issues,auditedStaticGuards},null,2));if(issues.length)process.exitCode=1;
