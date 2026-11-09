// Evidence-only export: no engines, compilers, profiles or benchmark execution.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {root,hash} from './common.mjs';
const destination='benchmarks/jqe-speed-2026-11-09';
const validation=JSON.parse(fs.readFileSync(root+'/validation.json'));assert(validation.passed);
const files=['hardware.json','profile-summary.json','summary.json'];
for(const name of ['snapshot','fma','integer'])files.push(`${name}-verify.json`,`${name}-bench.json`,`suites/${name}/rules.json`,`suites/${name}/rules-sanitized.json`,`suites/${name}/thread-check.json`,`${name}/build.json`,`${name}-sanitized/build.json`);
files.push('baseline/build.json','baseline-sanitized/build.json');
const sanitize=(_k,v)=>typeof v==='string'?v.replaceAll(process.cwd(),'<repo>').replaceAll(root,destination).replace(/\/Users\/[^/\s]+/g,'<home>'):v;
const records=[];
for(const relative of files){
 const source=root+'/'+relative,target=destination+'/'+relative;
 const text=JSON.stringify(JSON.parse(fs.readFileSync(source)),sanitize,2)+'\n';assert(!/\/Users\//.test(text));fs.mkdirSync(target.slice(0,target.lastIndexOf('/')),{recursive:true});fs.writeFileSync(target,text);
 records.push({file:target,sha256:hash(target),localSourceSha256:hash(source)});
}
const summaryPath=destination+'/summary.json',summary=JSON.parse(fs.readFileSync(summaryPath));
for(const v of summary.variants)v.benchmarkSha256=hash(`${destination}/${v.name}-bench.json`);
summary.profileSummarySha256=hash(destination+'/profile-summary.json');fs.writeFileSync(summaryPath,JSON.stringify(summary,null,2)+'\n');records.find(r=>r.file===summaryPath).sha256=hash(summaryPath);
for(const v of validation.variants)for(const r of Object.values(v.records)){r.file=r.file.replace(root,destination);r.sha256=hash(r.file);}
fs.writeFileSync(destination+'/validation.json',JSON.stringify(validation,sanitize,2)+'\n');records.push({file:destination+'/validation.json',sha256:hash(destination+'/validation.json'),localSourceSha256:hash(root+'/validation.json')});
fs.writeFileSync(destination+'/manifest.json',JSON.stringify({purpose:'Sanitized public evidence; raw sampling reports excluded. Artifact hashes cover exported bytes, localSourceSha256 preserves provenance.',records},null,2)+'\n');
console.log(JSON.stringify({destination,files:records.length,manifestSha256:hash(destination+'/manifest.json')}));
