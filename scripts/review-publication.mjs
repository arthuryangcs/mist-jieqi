// Read only the staged change set. Never print a suspected secret value.
import {execFileSync} from 'node:child_process';
const files=execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACMR','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),issues=[];
const privateKeys=new Set(['pid','oldPid','staleLockPid','savedPid','terminalSession','savedLockStartedAt','accountId','planType','usedPercent','remainingPercent','rateLimits','rateLimitsByLimitId','credits','quota']);
for(const file of files){
 if(/^(?:\.cache|external|\.agents|\.codex|\.aws)\/|(?:^|\/)\.env(?:\.|$)|\.(?:nnue|wasm|o|a|dylib|so|exe|pem|key)$|\/(?:quota|status|delivery|service-health)\.json$/.test(file)){issues.push({file,reason:'private/runtime/generated path'});continue;}
 const b=execFileSync('git',['show',':'+file],{maxBuffer:32*1024*1024});if(b.includes(0)){issues.push({file,reason:'binary content'});continue;}const s=b.toString('utf8');
 if(/\/Users\//.test(s)||/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s))issues.push({file,reason:'private path or credential pattern'});
 if(file.endsWith('.json')){let data;try{data=JSON.parse(s);}catch{issues.push({file,reason:'invalid JSON'});continue;}const visit=x=>{if(Array.isArray(x))return x.forEach(visit);if(x&&typeof x==='object')for(const[k,v]of Object.entries(x)){if(privateKeys.has(k))issues.push({file,reason:'private metadata key',key:k});visit(v);}};visit(data);}
}
for(const experiment of ['tactical-lmr','cluster-tt'])if(files.includes('benchmarks/'+experiment+'/matches.json')){
 const staged=p=>JSON.parse(execFileSync('git',['show',':'+p],{encoding:'utf8',maxBuffer:32*1024*1024}));
 const r=staged('benchmarks/'+experiment+'/matches.json'),v=staged('benchmarks/'+experiment+'/verification.json');
 if(!r.completedAt||r.games.filter(g=>g.result).length!==r.tasks.length||!v.passed||!v.complete){issues.push({file:'benchmarks/'+experiment+'/matches.json',reason:'current frozen screen or replay incomplete'});}
 const {createHash}=await import('node:crypto');for(const[p,expected]of Object.entries(r.sourceHashes)){const actual=createHash('sha256').update(execFileSync('git',['show',':'+p],{maxBuffer:32*1024*1024})).digest('hex');if(actual!==expected){issues.push({file:p,reason:'staged source differs from measured fingerprint'});}}
}
console.log(JSON.stringify({reviewedFiles:files.length,passed:issues.length===0,issues},null,2));if(issues.length)process.exitCode=1;
