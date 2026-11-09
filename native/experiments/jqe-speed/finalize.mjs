import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gate,root,hash,save,manifest} from './common.mjs';
gate();assert(!fs.existsSync(root+'/run.lock'));
const variants=[];
for(const name of ['snapshot','fma','integer']){
 const records={},built=manifest(name);
 for(const [kind,file]of Object.entries({focused:`${root}/${name}-verify.json`,rules:`${root}/suites/${name}/rules.json`,sanitizedRules:`${root}/suites/${name}/rules-sanitized.json`,thread:`${root}/suites/${name}/thread-check.json`,benchmark:`${root}/${name}-bench.json`})){
  const r=JSON.parse(fs.readFileSync(file));assert.equal(r.passed,true,file);records[kind]={file,sha256:hash(file)};
  if(kind==='focused'||kind==='benchmark')assert.equal(r.candidate.binarySha256,built.binarySha256);
  else {assert.equal(r.sourceSha256,built.sourceSha256);assert.equal(r.headerSha256,built.headerSha256);}
  if(kind==='focused')records[kind].cases=r.rows.length;
  if(kind.endsWith('Rules')||kind==='rules'){records[kind].cases=r.ruleCases.length;records[kind].transitions=r.transitionCount;}
  if(kind==='thread'){records[kind].positions=r.checks.length;records[kind].stackProbe=r.stackProbe;records[kind].timeouts=r.timeouts;}
 }
 variants.push({name,records});
}
save('validation.json',{passed:true,variants,frozenBinarySha256:gate().binarySha256,limits:'it014 and recorded corpus only; no alternate-dimension/bucket fixture expansion, no independent new upstream oracle run, no TSan, no strength or deployment claim. Integer speed within noise; snapshot and FMA remain independent.'});
console.log(JSON.stringify({passed:true,variants:variants.map(v=>v.name)}));
