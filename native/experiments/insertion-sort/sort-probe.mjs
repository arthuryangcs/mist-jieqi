import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {cache,dir,compile,hash} from './build.mjs';
const rows=[];for(const sanitize of [false,true]){
 const source=path.resolve(cache+'/sort-probe.cpp'),binary=path.resolve(cache+'/sort-probe'+(sanitize?'-sanitized':''));fs.copyFileSync(new URL('./sort-probe.cpp',import.meta.url),source);const compiler=compile(source,binary,{sanitize});
 const r=spawnSync(binary,[],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);assert(!r.stderr.trim(),r.stderr);rows.push({sanitize,sourceSha256:hash(source),binarySha256:hash(binary),...compiler,...JSON.parse(r.stdout)});
}fs.writeFileSync(dir+'/sort-probe.json',JSON.stringify({passed:true,rows},null,2)+'\n');console.log(JSON.stringify(rows.map(({sanitize,cases,items,passed})=>({sanitize,cases,items,passed}))));
