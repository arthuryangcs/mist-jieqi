import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {cache,dir,compile,hash,sourceOf} from './build.mjs';
const rows=[];
for(const sanitize of [false,true]){
 const core=sourceOf(),end=core.indexOf('\nint main() {');assert(end>0);
 const source=path.resolve(cache+'/cycle-probe.cpp'),binary=path.resolve(cache+'/cycle-probe'+(sanitize?'-sanitized':''));
 fs.writeFileSync(source,'#ifndef MIST_VERIFY_RESTORE\n#define MIST_VERIFY_RESTORE 1\n#endif\n'+core.slice(0,end)+'\n'+fs.readFileSync(new URL('./cycle-probe.cpp',import.meta.url),'utf8'));
 const compiler=compile(source,binary,{sanitize}),r=spawnSync(binary,[],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);assert(!r.stderr.trim(),r.stderr);
 rows.push({sanitize,sourceSha256:hash(source),binarySha256:hash(binary),...compiler,...JSON.parse(r.stdout)});
}
fs.writeFileSync(dir+'/cycle-probe.json',JSON.stringify({passed:true,rows},null,2)+'\n');console.log(JSON.stringify(rows.map(({sanitize,cases,positive,negative,fieldCases})=>({sanitize,cases,positive,negative,fieldCases}))));
